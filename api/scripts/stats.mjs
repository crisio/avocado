/**
 * Números de Avocado directo de la base de datos D1 (usuarios, comidas, análisis de IA).
 *
 *   cd api
 *   npm run stats                 # solo números (es lo que corre el workflow público de GitHub)
 *   npm run stats -- --detalle    # además: quién se registró y sus últimas comidas (correos incluidos)
 *   npm run stats -- --local      # contra la base local de `wrangler dev`
 *
 * Necesita CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID en el entorno (salvo con --local).
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

function query(sql) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', local ? '--local' : '--remote', '--json', '--command', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  return JSON.parse(out)[0].results
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
