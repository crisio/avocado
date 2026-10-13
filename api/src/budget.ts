import { Hono } from 'hono'
import type { AppEnv, Env, User } from './env'
import { canSee } from './access'
import { fail } from './errors'

/**
 * Saldo de la semana y comida libre (cheat meal). La "semana" son los últimos 7 días ya cerrados (sin hoy), en la hora
 * del teléfono: así nunca empieza vacía (un lunes no tendría días). Solo cuentan los días con al menos 60 % de la meta registrada: uno con menos seguro está incompleto (se
 * olvidó registrar algo) e inflaría el saldo.
 * - Bajar o mantener: lo que quedó por debajo de la meta se puede usar hoy en una comida libre, sin salirse de la meta
 *   semanal. Con tope de media meta diaria, para que sea un gusto y no un atracón.
 * - Subir (volumen): lo que faltó para la meta es lo que le conviene completar, con el mismo tope.
 */

export const GOALS = ['bajar', 'mantener', 'subir'] as const
export type Goal = (typeof GOALS)[number]

const DAY = 86_400_000
const COUNT_FROM = 0.6
const MAX_EXTRA = 0.5
/** Menos que esto no vale la pena como comida libre. */
const MIN_EXTRA = 150

export interface BudgetDay {
  date: string
  consumed: number
  meals: number
  /** Cuenta para el saldo (tiene al menos 60 % de la meta registrada). */
  counted: boolean
}

export interface Budget {
  goal: Goal | null
  daily_kcal_goal: number
  days: BudgetDay[]
  /** Suma de (meta − lo comido) en los días que cuentan: positivo = quedó por debajo. */
  balance: number
  /** Días cerrados que no cuentan por incompletos. */
  skipped: number
  today_consumed: number
  /** Calorías extra para hoy: comida libre (bajar/mantener) o lo que conviene completar (subir). 0 si no hay. */
  extra: number
  /** Lo que puede comer hoy en total: lo que le queda de la meta + extra. */
  today_budget: number
}

/** Cuentas del saldo (función pura, para probarla sin base de datos). */
export function computeBudget(dailyGoal: number, goal: Goal | null, days: Omit<BudgetDay, 'counted'>[], todayConsumed: number): Budget {
  const marked = days.map((d) => ({ ...d, consumed: Math.round(d.consumed), counted: d.consumed >= dailyGoal * COUNT_FROM }))
  const balance = Math.round(marked.filter((d) => d.counted).reduce((s, d) => s + (dailyGoal - d.consumed), 0))
  const cap = Math.round(dailyGoal * MAX_EXTRA)
  const raw = Math.min(Math.max(balance, 0), cap)
  const extra = goal && raw >= MIN_EXTRA ? raw : 0
  const today = Math.round(todayConsumed)
  return {
    goal,
    daily_kcal_goal: dailyGoal,
    days: marked,
    balance,
    skipped: marked.filter((d) => !d.counted).length,
    today_consumed: today,
    extra,
    today_budget: Math.max(0, dailyGoal - today) + extra,
  }
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Saldo de los últimos 7 días del paciente (null si no tiene meta diaria). `offset` = minutos, como getTimezoneOffset. */
export async function weekBudget(env: Env, user: Pick<User, 'id' | 'daily_kcal_goal' | 'goal'>, offset: number, now = Date.now()): Promise<Budget | null> {
  const dailyGoal = user.daily_kcal_goal
  if (!dailyGoal) return null
  const local = new Date(now - offset * 60_000)
  const todayStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + offset * 60_000
  const weekStart = todayStart - 7 * DAY

  const { results } = await env.DB.prepare(
    `SELECT date(eaten_at, ?) AS day, sum(calories) AS consumed, count(*) AS meals
     FROM meals WHERE user_id = ? AND status = 'analyzed' AND eaten_at >= ? AND eaten_at < ? GROUP BY day`,
  )
    .bind(`${-offset} minutes`, user.id, new Date(weekStart).toISOString(), new Date(todayStart + DAY).toISOString())
    .all<{ day: string; consumed: number; meals: number }>()
  const byDay = new Map(results.map((r) => [r.day, r]))
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = isoDay(weekStart - offset * 60_000 + i * DAY)
    const row = byDay.get(date)
    return { date, consumed: row?.consumed ?? 0, meals: row?.meals ?? 0 }
  })
  const today = byDay.get(isoDay(todayStart - offset * 60_000))
  return computeBudget(dailyGoal, user.goal, days, today?.consumed ?? 0)
}

const GOAL_TEXT: Record<Goal, string> = { bajar: 'bajar de peso', mantener: 'mantener su peso', subir: 'subir (volumen)' }

/** Lo que Avo necesita saber del saldo, en una línea (para el chat, el ánimo y los antojos). */
export function describeBudget(b: Budget | null) {
  if (!b) return null
  const goal = b.goal ? `Su objetivo: ${GOAL_TEXT[b.goal]}.` : 'No ha elegido su objetivo (bajar, mantener o subir).'
  const counted = b.days.filter((d) => d.counted).length
  if (!counted) return `${goal} En los últimos 7 días no hay días completos para calcular su saldo.`
  const week = b.balance >= 0 ? `quedó ${b.balance} kcal por debajo` : `se pasó ${-b.balance} kcal`
  const base = `${goal} En los últimos 7 días (${counted} ${counted === 1 ? 'día completo' : 'días completos'}) ${week} de su meta.`
  if (b.goal === 'subir')
    return b.extra
      ? `${base} Para su volumen le conviene completar hasta ${b.extra} kcal extra hoy (hoy puede comer hasta ${b.today_budget} kcal en total).`
      : base
  return b.extra
    ? `${base} Hoy puede darse una comida libre (cheat meal) de hasta ${b.extra} kcal extra sin salirse de su meta semanal (hoy puede comer hasta ${b.today_budget} kcal en total).`
    : `${base} Hoy no tiene saldo para una comida libre.`
}

export const budgetRoutes = new Hono<AppEnv>()

// ?user_id= (por defecto, el propio) &offset= (minutos, como getTimezoneOffset)
budgetRoutes.get('/', async (c) => {
  const userId = c.req.query('user_id') ?? c.var.user.id
  if (!(await canSee(c.env, c.var.user.id, userId))) fail(404, 'No encontrado')
  const offset = Number(c.req.query('offset') ?? 0)
  if (!Number.isInteger(offset) || Math.abs(offset) > 14 * 60) fail(400, 'offset inválido')
  const owner =
    userId === c.var.user.id ? c.var.user : await c.env.DB.prepare('SELECT id, daily_kcal_goal, goal FROM users WHERE id = ?').bind(userId).first<User>()
  if (!owner) fail(404, 'No encontrado')
  return c.json(await weekBudget(c.env, owner, offset))
})
