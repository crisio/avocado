import { Hono } from 'hono'
import type { AppEnv, Env, User } from './env'
import { areLinked } from './access'
import { GOALS, type Goal } from './budget'
import { fail } from './errors'
import { streakFrom } from './streaks'

/**
 * Vista de la nutrióloga: tablero con cómo va cada paciente (y alertas), las metas de cada uno (que ella fija) y su
 * código para invitar pacientes con un enlace o un QR.
 */

const DAY = 86_400_000
/** Sin letras ni números que se confundan (0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

type PublicUser = Pick<User, 'id' | 'email' | 'full_name'>

interface PatientRow extends PublicUser {
  daily_kcal_goal: number | null
  goal: Goal | null
  protein_g_goal: number | null
  carbs_g_goal: number | null
  fat_g_goal: number | null
  goals_set_by: string | null
}

export interface Alert {
  kind: 'sin_registro' | 'mal' | 'fuera_plan' | 'arriba_meta'
  text: string
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const days = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`

/** Cómo va un paciente: hoy, la racha, los últimos 7 días y las alertas para la nutrióloga. */
async function patientSummary(env: Env, p: PatientRow, offset: number, now: number) {
  const local = new Date(now - offset * 60_000)
  const todayStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + offset * 60_000
  const weekStart = todayStart - 6 * DAY
  const shift = `${-offset} minutes`

  const [today, lastMeal, loggedDays, week, lastMood, moods] = await Promise.all([
    env.DB.prepare(
      `SELECT coalesce(sum(calories), 0) AS consumed, coalesce(sum(protein_g), 0) AS protein_g, coalesce(sum(carbs_g), 0) AS carbs_g,
              coalesce(sum(fat_g), 0) AS fat_g, count(*) AS meals
       FROM meals WHERE user_id = ? AND eaten_at >= ? AND eaten_at < ?`,
    )
      .bind(p.id, new Date(todayStart).toISOString(), new Date(todayStart + DAY).toISOString())
      .first<{ consumed: number; protein_g: number; carbs_g: number; fat_g: number; meals: number }>(),
    env.DB.prepare('SELECT eaten_at FROM meals WHERE user_id = ? AND eaten_at <= ? ORDER BY eaten_at DESC LIMIT 1')
      .bind(p.id, new Date(now + 5 * 60_000).toISOString())
      .first<{ eaten_at: string }>(),
    env.DB.prepare('SELECT DISTINCT date(eaten_at, ?) AS day FROM meals WHERE user_id = ? AND eaten_at >= ?')
      .bind(shift, p.id, new Date(now - 401 * DAY).toISOString())
      .all<{ day: string }>(),
    env.DB.prepare(
      `SELECT date(eaten_at, ?) AS day, sum(CASE WHEN status = 'analyzed' THEN calories END) AS kcal
       FROM meals WHERE user_id = ? AND eaten_at >= ? AND eaten_at < ? GROUP BY day`,
    )
      .bind(shift, p.id, new Date(weekStart).toISOString(), new Date(todayStart + DAY).toISOString())
      .all<{ day: string; kcal: number | null }>(),
    env.DB.prepare('SELECT feelings, on_plan, felt_at FROM moods WHERE user_id = ? ORDER BY felt_at DESC LIMIT 1')
      .bind(p.id)
      .first<{ feelings: string; on_plan: string | null; felt_at: string }>(),
    env.DB.prepare('SELECT on_plan FROM moods WHERE user_id = ? AND felt_at >= ? AND on_plan IS NOT NULL')
      .bind(p.id, new Date(weekStart).toISOString())
      .all<{ on_plan: string }>(),
  ])

  const todayIso = isoDay(todayStart - offset * 60_000)
  const streak = streakFrom(new Set(loggedDays.results.map((r) => r.day).filter((d) => d && d <= todayIso)), todayIso)
  const logged = week.results.filter((d) => d.kcal !== null)
  const plans = moods.results.map((m) => m.on_plan)

  const alerts: Alert[] = []
  const sinceLast = lastMeal ? Math.floor((todayStart - Date.parse(lastMeal.eaten_at)) / DAY) + 1 : null
  if (sinceLast === null) alerts.push({ kind: 'sin_registro', text: 'Todavía no registra comidas' })
  else if (sinceLast >= 2) alerts.push({ kind: 'sin_registro', text: `Sin registrar desde hace ${days(sinceLast)}` })
  const recentMood = lastMood && now - Date.parse(lastMood.felt_at) < 2 * DAY ? lastMood : null
  if (recentMood && (JSON.parse(recentMood.feelings) as string[]).includes('mal')) alerts.push({ kind: 'mal', text: 'Se sintió mal' })
  if (recentMood?.on_plan === 'no') alerts.push({ kind: 'fuera_plan', text: 'Dijo que va fuera del plan' })
  const over = p.daily_kcal_goal ? Math.round((today?.consumed ?? 0) - p.daily_kcal_goal) : 0
  if (p.daily_kcal_goal && over > p.daily_kcal_goal * 0.15) alerts.push({ kind: 'arriba_meta', text: `Hoy va ${over.toLocaleString('es-MX')} kcal arriba de su meta` })

  return {
    id: p.id,
    email: p.email,
    full_name: p.full_name,
    goals: {
      daily_kcal_goal: p.daily_kcal_goal,
      goal: p.goal,
      protein_g_goal: p.protein_g_goal,
      carbs_g_goal: p.carbs_g_goal,
      fat_g_goal: p.fat_g_goal,
      set_by_me: false,
    },
    today: {
      consumed: Math.round(today?.consumed ?? 0),
      protein_g: Math.round(today?.protein_g ?? 0),
      carbs_g: Math.round(today?.carbs_g ?? 0),
      fat_g: Math.round(today?.fat_g ?? 0),
      meals: today?.meals ?? 0,
    },
    last_meal_at: lastMeal?.eaten_at ?? null,
    last_mood: lastMood ? { feelings: JSON.parse(lastMood.feelings) as string[], on_plan: lastMood.on_plan, felt_at: lastMood.felt_at } : null,
    streak: { current: streak.current, logged_today: streak.logged_today },
    week: {
      days_logged: logged.length,
      avg_kcal: logged.length ? Math.round(logged.reduce((s, d) => s + (d.kcal ?? 0), 0) / logged.length) : null,
      on_plan: plans.length ? { yes: plans.filter((x) => x === 'si').length, total: plans.length } : null,
    },
    alerts,
  }
}

export const careRoutes = new Hono<AppEnv>()

const requireNutritionist = (user: User) => {
  if (user.role !== 'nutritionist') fail(403, 'Esto es solo para nutriólogas y nutriólogos')
}

// Tablero: todos sus pacientes con cómo van, los que tienen alertas primero. ?offset= (como getTimezoneOffset)
careRoutes.get('/dashboard', async (c) => {
  requireNutritionist(c.var.user)
  const offset = Number(c.req.query('offset') ?? 0)
  if (!Number.isInteger(offset) || Math.abs(offset) > 14 * 60) fail(400, 'offset inválido')
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.full_name, u.daily_kcal_goal, u.goal, u.protein_g_goal, u.carbs_g_goal, u.fat_g_goal, u.goals_set_by
     FROM care_links l JOIN users u ON u.id = l.patient_id WHERE l.nutritionist_id = ?`,
  )
    .bind(c.var.user.id)
    .all<PatientRow>()
  const now = Date.now()
  const patients = await Promise.all(
    results.map(async (p) => {
      const summary = await patientSummary(c.env, p, offset, now)
      summary.goals.set_by_me = p.goals_set_by === c.var.user.id
      return summary
    }),
  )
  const name = (p: { full_name: string | null; email: string }) => (p.full_name || p.email).toLocaleLowerCase('es')
  patients.sort((a, b) => b.alerts.length - a.alerts.length || name(a).localeCompare(name(b), 'es'))
  return c.json({ patients })
})

// Metas de un paciente (solo su nutrióloga vinculada): { daily_kcal_goal, goal, protein_g_goal, carbs_g_goal, fat_g_goal }
careRoutes.patch('/patients/:id/goals', async (c) => {
  requireNutritionist(c.var.user)
  const patientId = c.req.param('id')
  const link = await c.env.DB.prepare('SELECT 1 FROM care_links WHERE patient_id = ? AND nutritionist_id = ?').bind(patientId, c.var.user.id).first()
  if (!link) fail(404, 'No encontrado')
  const body = await c.req.json<Record<string, unknown>>().catch(() => fail(400, 'JSON inválido'))

  const whole = (key: string, min: number, max: number, label: string) => {
    const v = body[key]
    if (v === undefined) return undefined
    if (v === null || v === '') return null
    const n = Number(v)
    if (!Number.isFinite(n) || n < min || n > max) fail(400, `${label} debe estar entre ${min} y ${max.toLocaleString('es-MX')}`)
    return Math.round(n)
  }
  const fields: Record<string, number | string | null> = {}
  const kcal = whole('daily_kcal_goal', 800, 6000, 'La meta diaria')
  if (kcal !== undefined) fields.daily_kcal_goal = kcal
  for (const [key, label] of [
    ['protein_g_goal', 'La proteína'],
    ['carbs_g_goal', 'Los carbohidratos'],
    ['fat_g_goal', 'La grasa'],
  ] as const) {
    const v = whole(key, 0, 800, label)
    if (v !== undefined) fields[key] = v
  }
  if (body.goal !== undefined) {
    if (body.goal !== null && !GOALS.includes(body.goal as Goal)) fail(400, 'El objetivo debe ser bajar, mantener o subir')
    fields.goal = body.goal as Goal | null
  }
  if (!Object.keys(fields).length) fail(400, 'No hay nada que cambiar')

  const keys = Object.keys(fields)
  await c.env.DB.prepare(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')}, goals_set_by = ? WHERE id = ?`)
    .bind(...keys.map((k) => fields[k]), c.var.user.id, patientId)
    .run()
  const updated = await c.env.DB.prepare(
    'SELECT daily_kcal_goal, goal, protein_g_goal, carbs_g_goal, fat_g_goal FROM users WHERE id = ?',
  )
    .bind(patientId)
    .first()
  return c.json({ ...updated, set_by_me: true })
})

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

// Código para invitar pacientes (se crea la primera vez).
careRoutes.get('/invite', async (c) => {
  requireNutritionist(c.var.user)
  let row = await c.env.DB.prepare('SELECT invite_code FROM users WHERE id = ?').bind(c.var.user.id).first<{ invite_code: string | null }>()
  let code = row?.invite_code ?? null
  for (let tries = 0; !code && tries < 5; tries++) {
    const candidate = newCode()
    const res = await c.env.DB.prepare('UPDATE users SET invite_code = ? WHERE id = ? AND invite_code IS NULL AND NOT EXISTS (SELECT 1 FROM users WHERE invite_code = ?)')
      .bind(candidate, c.var.user.id, candidate)
      .run()
    if (res.meta.changes) code = candidate
    else {
      row = await c.env.DB.prepare('SELECT invite_code FROM users WHERE id = ?').bind(c.var.user.id).first<{ invite_code: string | null }>()
      code = row?.invite_code ?? null
    }
  }
  if (!code) fail(500, 'No se pudo crear el código. Intenta de nuevo.')
  return c.json({ code, url: new URL(`invitar/${code}`, c.env.APP_URL).toString() })
})

const normalizeCode = (raw: string) => raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')

// Quién invita (para mostrarlo antes de aceptar).
careRoutes.get('/invite/:code', async (c) => {
  const who = await c.env.DB.prepare("SELECT id, email, full_name FROM users WHERE invite_code = ? AND role = 'nutritionist'")
    .bind(normalizeCode(c.req.param('code')))
    .first<PublicUser>()
  if (!who) fail(404, 'Ese código no existe. Revisa que esté bien escrito.')
  return c.json(who)
})

// Aceptar la invitación (el paciente queda vinculado).
careRoutes.post('/invite/:code', async (c) => {
  const user = c.var.user
  if (user.role !== 'patient') fail(403, 'Solo los pacientes pueden aceptar una invitación')
  const who = await c.env.DB.prepare("SELECT id, email, full_name FROM users WHERE invite_code = ? AND role = 'nutritionist'")
    .bind(normalizeCode(c.req.param('code')))
    .first<PublicUser>()
  if (!who) fail(404, 'Ese código no existe. Revisa que esté bien escrito.')
  await c.env.DB.prepare('INSERT OR IGNORE INTO care_links (patient_id, nutritionist_id) VALUES (?, ?)').bind(user.id, who.id).run()
  return c.json(who, 201)
})

/** Para las metas del paciente en el contexto de Avo. */
export async function goalsSetBy(env: Env, user: User) {
  if (!user.goals_set_by || !(await areLinked(env, user.id, user.goals_set_by))) return null
  return env.DB.prepare('SELECT full_name FROM users WHERE id = ?').bind(user.goals_set_by).first<{ full_name: string | null }>()
}
