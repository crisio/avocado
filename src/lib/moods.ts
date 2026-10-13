import { useEffect } from 'react'
import { formatTime } from './format'
import type { Feeling, Meal, Mood, OnPlan } from './types'

/** Cómo te sientes: misma lista y mismo orden que la API (api/src/moods.ts) y la app de iOS. */
export const FEELINGS: { key: Feeling; emoji: string; label: string }[] = [
  { key: 'bien', emoji: '😊', label: 'Bien' },
  { key: 'con_hambre', emoji: '🍽️', label: 'Con hambre' },
  { key: 'con_antojo', emoji: '🍩', label: 'Con antojo' },
  { key: 'lleno', emoji: '😮‍💨', label: 'Lleno/a' },
  { key: 'ansioso', emoji: '😬', label: 'Ansioso/a' },
  { key: 'cansado', emoji: '😴', label: 'Sin energía' },
  { key: 'mal', emoji: '🤢', label: 'Mal' },
]
export const feelingOf = (key: Feeling) => FEELINGS.find((f) => f.key === key) ?? { key, emoji: '•', label: key }

export const PLANS: { value: OnPlan; label: string }[] = [
  { value: 'si', label: 'Sí' },
  { value: 'a_medias', label: 'A medias' },
  { value: 'no', label: 'No' },
]
/** "A medias con tu plan" (el paciente) o "A medias con su plan" (su nutrióloga). */
export const planLabel = (p: OnPlan, own: boolean) =>
  own
    ? { si: 'Vas con tu plan', a_medias: 'A medias con tu plan', no: 'Fuera de tu plan' }[p]
    : { si: 'Va con su plan', a_medias: 'A medias con su plan', no: 'Fuera de su plan' }[p]

// Avisa a las vistas del día cuando se registra o borra un ánimo (para recargar sin esperar al sondeo).
const listeners = new Set<() => void>()
export const notifyMoodsChanged = () => listeners.forEach((l) => l())
export function useMoodsChanged(fn: () => void) {
  useEffect(() => {
    listeners.add(fn)
    return () => void listeners.delete(fn)
  }, [fn])
}

const minutesOfDay = (iso: string) => {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}
const clock = (minutes: number) => {
  const d = new Date()
  d.setHours(Math.floor(minutes / 60), Math.round(minutes % 60), 0, 0)
  return formatTime(d.toISOString())
}
export const duration = (minutes: number) => {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`
}

/**
 * Horarios de la semana: a qué hora come primero y al último (promedio de los días con comidas), el hueco más largo
 * entre dos comidas del mismo día y cuántas comidas fueron después de las 9 de la noche.
 */
export function timingStats(meals: Meal[]) {
  const byDay = new Map<string, Meal[]>()
  for (const m of meals) {
    const key = new Date(m.eaten_at).toDateString()
    byDay.set(key, [...(byDay.get(key) ?? []), m])
  }
  const days = [...byDay.values()].map((list) => list.sort((a, b) => a.eaten_at.localeCompare(b.eaten_at)))
  if (!days.length) return null
  const avg = (ns: number[]) => ns.reduce((s, n) => s + n, 0) / ns.length
  let longest: { minutes: number; from: Meal } | null = null
  for (const list of days)
    for (let i = 1; i < list.length; i++) {
      const gap = (Date.parse(list[i].eaten_at) - Date.parse(list[i - 1].eaten_at)) / 60_000
      if (!longest || gap > longest.minutes) longest = { minutes: gap, from: list[i - 1] }
    }
  return {
    first: clock(avg(days.map((l) => minutesOfDay(l[0].eaten_at)))),
    last: clock(avg(days.map((l) => minutesOfDay(l[l.length - 1].eaten_at)))),
    longest,
    late: meals.filter((m) => minutesOfDay(m.eaten_at) >= 21 * 60).length,
  }
}

/** Resumen de ánimo de la semana: los sentimientos más frecuentes, la energía promedio y cuántas veces iba con su plan. */
export function moodStats(moods: Mood[]) {
  if (!moods.length) return null
  const counts = new Map<Feeling, number>()
  for (const m of moods) for (const f of m.feelings) counts.set(f, (counts.get(f) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  const energies = moods.map((m) => m.energy).filter((e): e is number => e !== null)
  const plans = moods.map((m) => m.on_plan).filter((p): p is OnPlan => p !== null)
  return {
    count: moods.length,
    top,
    energy: energies.length ? energies.reduce((s, e) => s + e, 0) / energies.length : null,
    onPlan: plans.length ? { yes: plans.filter((p) => p === 'si').length, total: plans.length } : null,
  }
}
