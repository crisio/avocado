import { Hono } from 'hono'
import { toUser, USER_COLUMNS, type AppEnv, type Env, type User } from './env'
import { canSee } from './access'
import { fail } from './errors'

/**
 * Ayuno intermitente. El ayuno se calcula con las comidas registradas: empieza con la última comida que lo rompe
 * (o con "Empecé mi ayuno a las…" si no la registró) y termina con la siguiente. Un café negro, un té o un refresco
 * sin azúcar no lo rompen: solo lo que tiene 50 kcal o más (o lo que aún no se analiza).
 * Con un plan (16:8 = 16 h de ayuno y 8 de comida), la ventana de comida abre a eating_start.
 */

export const BREAKS_FAST_KCAL = 50
/** Un hueco entre comidas cuenta como ayuno desde estas horas (el de la noche, no el de entre comidas). */
const MIN_FAST_HOURS = 8
const HOUR = 3_600_000
const DAY = 24 * HOUR

export interface FastMeal {
  eaten_at: string
  status: string
  calories: number | null
}

export interface FastingInput {
  meals: FastMeal[]
  fastStartedAt: string | null
  hours: number | null
  eatingStart: string | null
  /** Minutos como Date.getTimezoneOffset() (Honduras = 360). */
  offset: number
  now: number
}

const round1 = (n: number) => Math.round(n * 10) / 10
const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const hhmm = (minutes: number) => {
  const m = ((minutes % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export const breaksFast = (m: FastMeal) => m.status !== 'analyzed' || (m.calories ?? 0) >= BREAKS_FAST_KCAL

export function computeFasting({ meals, fastStartedAt, hours, eatingStart, offset, now }: FastingInput) {
  const breaking = meals
    .filter(breaksFast)
    .map((m) => Date.parse(m.eaten_at))
    .filter((ms) => ms <= now + 5 * 60_000)
    .sort((a, b) => a - b)
  const last = breaking.at(-1) ?? null
  const manual = fastStartedAt ? Date.parse(fastStartedAt) : null
  const started = [last, manual !== null && manual <= now ? manual : null].filter((v): v is number => v !== null)
  const startedAt = started.length ? Math.max(...started) : null
  const currentHours = startedAt === null ? 0 : round1((now - startedAt) / HOUR)

  let plan = null
  let state: 'ayuno' | 'ventana' | null = null
  let window: { opens_at: string; closes_at: string } | null = null
  if (hours) {
    const start = minutesOf(eatingStart ?? '12:00')
    const length = (24 - hours) * 60
    plan = { hours, eating_start: hhmm(start), eating_end: hhmm(start + length), label: `${hours}:${24 - hours}` }
    // Medianoche local de hoy, en UTC.
    const localNow = now - offset * 60_000
    const midnight = Date.UTC(new Date(localNow).getUTCFullYear(), new Date(localNow).getUTCMonth(), new Date(localNow).getUTCDate()) + offset * 60_000
    const windows = [-1, 0, 1].map((d) => {
      const opens = midnight + d * DAY + start * 60_000
      return { opens, closes: opens + length * 60_000 }
    })
    const open = windows.find((w) => w.opens <= now && now < w.closes)
    const next = open ?? windows.find((w) => w.opens > now)!
    state = open ? 'ventana' : 'ayuno'
    window = { opens_at: new Date(next.opens).toISOString(), closes_at: new Date(next.closes).toISOString() }
  }

  // Ayunos pasados: los huecos largos entre comidas que rompen el ayuno, de los últimos 14 días.
  const history: { start: string; end: string; hours: number; met: boolean | null }[] = []
  for (let i = breaking.length - 1; i > 0; i--) {
    const gap = (breaking[i] - breaking[i - 1]) / HOUR
    if (breaking[i] < now - 14 * DAY) break
    if (gap >= MIN_FAST_HOURS)
      history.push({ start: new Date(breaking[i - 1]).toISOString(), end: new Date(breaking[i]).toISOString(), hours: round1(gap), met: hours ? gap >= hours : null })
  }
  const lastWeek = history.filter((f) => Date.parse(f.end) >= now - 7 * DAY)
  return {
    plan,
    current: {
      started_at: startedAt === null ? null : new Date(startedAt).toISOString(),
      hours: currentHours,
      goal_hours: hours,
      reached: Boolean(hours && currentHours >= hours),
    },
    state,
    window,
    history,
    stats: {
      longest_hours: history.length ? Math.max(...history.map((f) => f.hours)) : 0,
      average_hours: history.length ? round1(history.reduce((n, f) => n + f.hours, 0) / history.length) : 0,
      met_last_7: lastWeek.filter((f) => f.met).length,
    },
  }
}

/** El ayuno de un paciente ahora (consulta sus comidas de los últimos 15 días). */
export async function fastingOf(env: Env, user: User, offset: number, now = Date.now()) {
  const { results } = await env.DB.prepare('SELECT eaten_at, status, calories FROM meals WHERE user_id = ? AND eaten_at >= ? ORDER BY eaten_at')
    .bind(user.id, new Date(now - 15 * DAY).toISOString())
    .all<FastMeal>()
  return computeFasting({ meals: results, fastStartedAt: user.fast_started_at, hours: user.fasting_hours, eatingStart: user.eating_start, offset, now })
}

/** Una línea para el contexto de Avo (null si no hace ayuno). */
export async function describeFasting(env: Env, user: User, offset: number, now = Date.now()) {
  if (!user.fasting_hours) return null
  const f = await fastingOf(env, user, offset, now)
  const plan = f.plan!
  const where =
    f.state === 'ventana'
      ? `Ahora está en su ventana de comida (cierra a las ${plan.eating_end}).`
      : `Ahora lleva ${f.current.hours} h de ayuno${f.current.reached ? ' (ya cumplió su meta)' : ''}; su ventana abre a las ${plan.eating_start}.`
  return `Hace ayuno intermitente ${plan.label}: come de ${plan.eating_start} a ${plan.eating_end}. ${where} Respeta su plan: no le sugieras comer fuera de su ventana (salvo que se sienta mal, mareado o con malestar: ahí lo primero es su bienestar) y nunca te burles de que rompa el ayuno.`
}

export const fastingRoutes = new Hono<AppEnv>()

// ?offset= (minutos, como getTimezoneOffset) &user_id= (por defecto, el propio; o un paciente vinculado)
fastingRoutes.get('/', async (c) => {
  const userId = c.req.query('user_id') ?? c.var.user.id
  if (!(await canSee(c.env, c.var.user.id, userId))) fail(404, 'No encontrado')
  const offset = Number(c.req.query('offset') ?? 0)
  if (!Number.isInteger(offset) || Math.abs(offset) > 14 * 60) fail(400, 'offset inválido')
  const row = userId === c.var.user.id ? c.var.user : await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(userId).first<User>()
  if (!row) fail(404, 'No encontrado')
  return c.json(await fastingOf(c.env, toUser(row), offset))
})
