import { useEffect } from 'react'
import { readCache, writeCache } from './cache'
import { onSynced, useOutbox, type Job, type MealJob } from './outbox'
import { useCachedApi } from './useCachedApi'
import { addDays, startOfDay, toDayParam } from './format'

/** Racha de días seguidos con comidas (ver api/src/streaks.ts). */
export interface Streak {
  current: number
  best: number
  logged_today: boolean
  /** Día de "hoy" con el que se calculó (hora del teléfono). */
  today: string
  week: { date: string; logged: boolean }[]
}

export interface LiveStreak {
  current: number
  best: number
  loggedToday: boolean
  /** Últimos 7 días, de hace 6 días a hoy. */
  week: { date: string; logged: boolean }[]
}

/** Metas de racha que Avo celebra en grande. */
export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365]

export const streakPath = (userId: string) => `/streak?user_id=${userId}&offset=${new Date().getTimezoneOffset()}`

/**
 * La racha al momento: junta lo que sabe el servidor (su racha y los últimos 7 días) con los días que tienen comidas
 * en el teléfono (sin enviar todavía) y la vuelve a contar desde hoy. Así corrige un dato guardado de otro día
 * (pasó la medianoche) y cuenta al instante lo registrado sin señal, incluso de ayer.
 */
export function liveStreak(s: Streak | undefined, queued: Set<string>, now = new Date()): LiveStreak | null {
  if (!s) return null
  const today = toDayParam(now)
  const logged = new Set(s.week.filter((d) => d.logged).map((d) => d.date))
  for (const d of queued) if (d <= today) logged.add(d)
  const loggedToday = logged.has(today)
  // La racha del servidor termina en su "hoy" si ese día registró; si no, el día anterior.
  const anchor = s.logged_today ? s.today : toDayParam(addDays(dayDate(s.today), -1))
  let current = 0
  for (let d = loggedToday ? startOfDay(now) : addDays(startOfDay(now), -1); ; d = addDays(d, -1)) {
    const key = toDayParam(d)
    if (key === anchor && s.current > 0) {
      current += s.current
      break
    }
    if (!logged.has(key)) break
    current++
  }
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = toDayParam(addDays(startOfDay(now), i - 6))
    return { date, logged: logged.has(date) }
  })
  return { current, best: Math.max(s.best, current), loggedToday, week }
}

const dayDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Días (del teléfono) con comidas de este usuario esperando en la cola; las que el servidor rechazó no cuentan. */
export const queuedMealDays = (jobs: Job[], userId: string) =>
  new Set(jobs.filter((j): j is MealJob => j.kind === 'meal' && !j.error && j.userId === userId).map((j) => toDayParam(new Date(j.eaten_at))))

/** La racha guardada contando un día más con comida (la que acaba de llegar al servidor), en la forma del servidor. */
function withMealOn(s: Streak | undefined, day: string, now = new Date()): Streak | undefined {
  const live = liveStreak(s, new Set([day]), now)
  return live ? { current: live.current, best: live.best, logged_today: live.loggedToday, today: toDayParam(now), week: live.week } : s
}

// Al llegar al servidor, la comida sale de la cola antes de que vuelva a pedirse /streak: la caché la cuenta desde
// ya (si no, por un momento parecería que hoy no registró, y en /nueva o /antojo nadie vuelve a pedir la racha).
onSynced((job) => {
  if (job.kind !== 'meal') return
  const path = streakPath(job.userId)
  const s = readCache<Streak>(path)
  if (s) writeCache(path, withMealOn(s, toDayParam(new Date(job.eaten_at))))
})

/** La racha de un usuario (la propia o la de un paciente), al día. */
export function useStreak(userId: string | null | undefined) {
  const { data, fresh, mutate } = useCachedApi<Streak>(userId ? streakPath(userId) : null, 60_000)
  const { jobs } = useOutbox()
  // Lo mismo para la pantalla abierta (su dato en memoria).
  useEffect(
    () =>
      onSynced((job) => {
        if (userId && job.kind === 'meal' && job.userId === userId) mutate((prev) => withMealOn(prev, toDayParam(new Date(job.eaten_at))))
      }),
    [userId],
  )
  return { streak: userId ? liveStreak(data, queuedMealDays(jobs, userId)) : null, fresh }
}

/**
 * Cómo queda la racha al registrar una comida de hoy (se llama antes de ponerla en la cola). null si aún no se conoce
 * la racha. `extended`: es la primera de hoy, así que la racha creció.
 */
export function streakAfterNewMeal(userId: string, jobs: Job[]) {
  const before = liveStreak(readCache<Streak>(streakPath(userId)), queuedMealDays(jobs, userId))
  if (!before) return null
  if (before.loggedToday) return { current: before.current, extended: false, milestone: false }
  const current = before.current + 1
  return { current, extended: true, milestone: STREAK_MILESTONES.includes(current) }
}
