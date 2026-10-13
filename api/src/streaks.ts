import { Hono } from 'hono'
import type { AppEnv } from './env'
import { canSee } from './access'
import { fail } from './errors'

/**
 * Rachas: días seguidos con al menos una comida registrada (cualquier estado: registrar es lo que cuenta).
 * Los días son los del teléfono: la app manda su diferencia con UTC (offset = Date.getTimezoneOffset()).
 * Si hoy todavía no registra, la racha sigue viva hasta que termine el día.
 */

/** Hasta dónde se busca la mejor racha. */
const WINDOW_DAYS = 400
const DAY_MS = 86_400_000

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function streakFrom(days: Set<string>, today: string) {
  const t = Date.parse(`${today}T00:00:00Z`)
  const loggedToday = days.has(today)
  // Racha actual: desde hoy (o desde ayer si hoy aún no registra) hacia atrás.
  let current = 0
  for (let d = loggedToday ? t : t - DAY_MS; days.has(isoDay(d)); d -= DAY_MS) current++
  // Mejor racha en la ventana.
  let best = 0
  let run = 0
  let prev = Number.NaN
  for (const day of [...days].sort()) {
    const ms = Date.parse(`${day}T00:00:00Z`)
    run = ms - prev === DAY_MS ? run + 1 : 1
    best = Math.max(best, run)
    prev = ms
  }
  // Últimos 7 días (de hace 6 días a hoy): ¿registró?
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = isoDay(t - (6 - i) * DAY_MS)
    return { date, logged: days.has(date) }
  })
  return { current, best: Math.max(best, current), logged_today: loggedToday, today, week }
}

export const streakRoutes = new Hono<AppEnv>()

// ?user_id= (por defecto, el propio) &offset= (minutos, como Date.getTimezoneOffset())
streakRoutes.get('/', async (c) => {
  const userId = c.req.query('user_id') ?? c.var.user.id
  if (!(await canSee(c.env, c.var.user.id, userId))) fail(404, 'No encontrado')
  const offset = Number(c.req.query('offset') ?? 0)
  if (!Number.isInteger(offset) || Math.abs(offset) > 14 * 60) fail(400, 'offset inválido')

  const now = Date.now()
  const today = isoDay(now - offset * 60_000)
  const since = new Date(now - (WINDOW_DAYS + 1) * DAY_MS).toISOString()
  const { results } = await c.env.DB.prepare(
    `SELECT DISTINCT date(eaten_at, ?) AS day FROM meals WHERE user_id = ? AND eaten_at >= ?`,
  )
    .bind(`${-offset} minutes`, userId, since)
    .all<{ day: string }>()
  // Una comida con fecha "del futuro" (hora del teléfono adelantada) no cuenta.
  const days = new Set(results.map((r) => r.day).filter((d) => d && d <= today))
  return c.json(streakFrom(days, today))
})
