/**
 * Números de Avocado directo de la base de datos D1 (usuarios, comidas, análisis de IA).
 *
 *   cd api
 *   npm run stats                 # solo números (es lo que corre el workflow público de GitHub)
 *   npm run stats -- --detalle    # además: quién se registró y sus últimas comidas (correos incluidos)
 *   npm run stats -- --local      # contra la base local de `wrangler dev`
 *
 * Necesita CLOUDFLARE_ACCOUNT_ID (o --account <id>) y el token de Cloudflare: en CLOUDFLARE_API_TOKEN, o
 * inyectado por el proxy de red (secretos de red de Claude Code: Bearer para api.cloudflare.com).
 * Consulta la API REST de D1 con curl, que respeta HTTPS_PROXY. Con --local usa wrangler.
 * --detalle no corre en CI: los registros de Actions de este repo son públicos.
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'

const args = process.argv.slice(2)
const local = args.includes('--local')
const detail = args.includes('--detalle')
if (detail && process.env.CI) {
  console.error('--detalle no se permite en CI: los registros de este repo son públicos.')
  process.exit(1)
}

const accountIdx = args.indexOf('--account')
const accountId = accountIdx === -1 ? process.env.CLOUDFLARE_ACCOUNT_ID : args[accountIdx + 1]
if (!local && !accountId) {
  console.error('Falta CLOUDFLARE_ACCOUNT_ID (o --account <id>).')
  process.exit(1)
}

/** Llama a la API de Cloudflare. Sin token en el entorno, el proxy de red agrega el encabezado Authorization. */
function cloudflare(path, body) {
  const curlArgs = ['-sS', '--fail-with-body', `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1${path}`]
  if (process.env.CLOUDFLARE_API_TOKEN) curlArgs.push('-H', `Authorization: Bearer ${process.env.CLOUDFLARE_API_TOKEN}`)
  if (body) curlArgs.push('-H', 'Content-Type: application/json', '--data-binary', '@-')
  let out
  try {
    out = execFileSync('curl', curlArgs, { encoding: 'utf8', input: body ? JSON.stringify(body) : undefined })
  } catch (err) {
    console.error(`Cloudflare respondió con error en ${path}:\n${err.stdout || err.message}`)
    process.exit(1)
  }
  const res = JSON.parse(out)
  if (!res.success) {
    console.error(`Cloudflare respondió con error en ${path}: ${JSON.stringify(res.errors)}`)
    process.exit(1)
  }
  return res.result
}

let databaseId
function query(sql) {
  if (local) {
    const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--json', '--command', sql], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    })
    return JSON.parse(out)[0].results
  }
  // La base se llama "avocado" (wrangler.jsonc); su id lo asigna Cloudflare al crearla.
  databaseId ??= cloudflare('/database?name=avocado').find((d) => d.name === 'avocado')?.uuid
  if (!databaseId) {
    console.error('No encontré la base de datos D1 "avocado" en esa cuenta.')
    process.exit(1)
  }
  return cloudflare(`/database/${databaseId}/query`, { sql })[0].results
}

const ago = (span) => `strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '${span}')`

function table(rows) {
  if (rows.length === 0) return '_(nada)_\n'
  const cols = Object.keys(rows[0])
  const cell = (v) => String(v ?? '—').replace(/\|/g, '/').replace(/\n/g, ' ')
  return [`| ${cols.join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${cols.map((c) => cell(r[c])).join(' | ')} |`)].join('\n') + '\n'
}

const totals = query(`SELECT
  (SELECT COUNT(*) FROM users) AS usuarios,
  (SELECT COUNT(*) FROM users WHERE role = 'patient') AS pacientes,
  (SELECT COUNT(*) FROM users WHERE role = 'nutritionist') AS nutriologas,
  (SELECT COUNT(*) FROM users WHERE role IS NULL) AS registro_sin_terminar,
  (SELECT COUNT(*) FROM users WHERE created_at >= ${ago('-1 day')}) AS nuevos_24h,
  (SELECT COUNT(*) FROM users WHERE created_at >= ${ago('-7 days')}) AS nuevos_7d,
  (SELECT COUNT(*) FROM care_links) AS vinculos_nutriologa,
  (SELECT COUNT(DISTINCT user_id) FROM meals WHERE created_at >= ${ago('-7 days')}) AS activos_7d,
  (SELECT COUNT(*) FROM meals) AS comidas,
  (SELECT COUNT(*) FROM meals WHERE created_at >= ${ago('-1 day')}) AS comidas_24h,
  (SELECT COUNT(*) FROM meals WHERE status = 'analyzed') AS analizadas,
  (SELECT COUNT(*) FROM meals WHERE status = 'pending') AS pendientes,
  (SELECT COUNT(*) FROM meals WHERE status = 'error') AS con_error,
  (SELECT COUNT(*) FROM meal_comments) AS comentarios`)[0]

const perDay = query(`SELECT substr(created_at, 1, 10) AS dia, COUNT(*) AS nuevos
  FROM users WHERE created_at >= ${ago('-14 days')} GROUP BY dia ORDER BY dia`)

// Modelo que analizó, o el inicio del error: nada que identifique a la persona.
const recent = query(`SELECT substr(created_at, 1, 16) AS cuando, status,
    COALESCE(json_extract(analysis, '$.model'), substr(json_extract(analysis, '$.error'), 1, 120)) AS detalle
  FROM meals WHERE status != 'pending' ORDER BY created_at DESC LIMIT 5`)

const md = [
  '## Totales',
  '',
  '| Dato | Valor |',
  '|---|---|',
  ...Object.entries(totals).map(([k, v]) => `| ${k.replace(/_/g, ' ')} | ${v} |`),
  '',
  '## Registros por día (últimos 14 días, UTC)',
  '',
  table(perDay),
  '## Últimos análisis',
  '',
  table(recent),
]

if (detail) {
  const users = query(`SELECT u.email, u.full_name AS nombre, u.role AS rol, substr(u.created_at, 1, 16) AS registro,
      (SELECT COUNT(*) FROM meals m WHERE m.user_id = u.id) AS comidas,
      (SELECT substr(MAX(m.created_at), 1, 16) FROM meals m WHERE m.user_id = u.id) AS ultima_comida,
      (SELECT GROUP_CONCAT(n.email, ', ') FROM care_links l JOIN users n ON n.id = l.nutritionist_id WHERE l.patient_id = u.id) AS nutriologa
    FROM users u ORDER BY u.created_at DESC LIMIT 100`)
  const meals = query(`SELECT substr(m.created_at, 1, 16) AS cuando, u.email, m.status, m.calories AS kcal,
      substr(json_extract(m.analysis, '$.summary'), 1, 80) AS resumen
    FROM meals m JOIN users u ON u.id = m.user_id ORDER BY m.created_at DESC LIMIT 20`)
  md.push('## Usuarios (más recientes primero)', '', table(users), '## Últimas comidas', '', table(meals))
}

const text = md.join('\n')
console.log(text)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text)
