import { useSyncExternalStore } from 'react'

/**
 * Avo, la mascota (el aguacate del logo). Cada estado de ánimo es una tira de 4 cuadros en public/mascot/<ánimo>.png.
 * Cualquier parte de la app llama a cheer() cuando pasa algo (comida nueva, análisis listo, error…) y las mascotas
 * a la vista reaccionan; si ninguna está a la vista, aparece una pequeña abajo a la derecha (MascotDock).
 */

export type Mood = 'idle' | 'wave' | 'eat' | 'celebrate' | 'think' | 'sleepy' | 'oops' | 'love'
export const MOODS: Mood[] = ['idle', 'wave', 'eat', 'celebrate', 'think', 'sleepy', 'oops', 'love']

/** Un paso de la animación: cuadro (0–3), cuánto dura en ms y cuánto se eleva en px (saltos). */
export type Step = readonly [frame: number, ms: number, lift?: number]

export const SEQUENCES: Record<Mood, readonly Step[]> = {
  // Respira, parpadea y de vez en cuando se estira
  idle: [[0, 2600], [3, 160], [0, 1800], [1, 600], [0, 2200], [2, 240, -4], [0, 300]],
  wave: [[0, 200], [1, 200], [0, 200], [1, 200], [2, 220], [3, 900]],
  // Tenedor a la boca, mastica dos veces y queda contento
  eat: [[0, 320], [1, 260], [2, 320], [1, 260], [0, 320], [1, 260], [3, 1000]],
  // Se agacha, salta con los brazos arriba y aterriza
  celebrate: [[0, 170], [1, 200, -12], [2, 340, -20], [1, 200, -8], [3, 1000]],
  think: [[0, 700], [1, 700], [2, 700], [1, 700]],
  // Bosteza, cabecea y se queda dormido
  sleepy: [[0, 1200], [1, 900], [2, 1500], [3, 1500], [2, 1500], [3, 1500], [2, 1500], [3, 1500]],
  oops: [[0, 450, -4], [1, 700], [2, 800], [3, 900]],
  love: [[0, 800], [1, 650], [2, 650], [3, 1000]],
}

/** Cuadro fijo de cada ánimo cuando el sistema pide reducir el movimiento. */
export const POSES: Record<Mood, number> = { idle: 0, wave: 1, eat: 3, celebrate: 3, think: 0, sleepy: 2, oops: 1, love: 0 }

export const spriteUrl = (mood: Mood) => `${import.meta.env.BASE_URL}mascot/${mood}.png`

// Se cargan todas al inicio para que el cambio de ánimo no parpadee (además quedan en el precache).
if (typeof window !== 'undefined')
  for (const mood of MOODS) {
    const img = new Image()
    img.src = spriteUrl(mood)
  }

const duration = (mood: Mood) => SEQUENCES[mood].reduce((ms, [, d]) => ms + d, 0)

export interface Reaction {
  id: number
  mood: Mood
  message?: string
  ms: number
  /** Respuesta a un toque (se anuncia a los lectores de pantalla). */
  tap?: boolean
}

let reaction: Reaction | null = null
let queue: Omit<Reaction, 'id'>[] = []
let lastId = 0
let timer: ReturnType<typeof setTimeout> | undefined
let visibleInline = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function play(next: Omit<Reaction, 'id'>) {
  reaction = { ...next, id: ++lastId }
  emit()
  clearTimeout(timer)
  timer = setTimeout(advance, next.ms)
}

function advance() {
  const next = queue.shift()
  if (next) return play(next)
  reaction = null
  emit()
}

export interface CheerOptions {
  /** Corta lo que esté haciendo (toques del usuario). Si no, espera su turno (máximo dos en fila). */
  interrupt?: boolean
  tap?: boolean
}

/** Avo reacciona a algo que acaba de pasar. */
export function cheer(mood: Mood, message?: string, { interrupt = false, tap }: CheerOptions = {}) {
  // Lo que dura su animación o lo necesario para leer el mensaje, sin pasar de 5 s (el sueño es largo).
  const next = { mood, message, tap, ms: Math.min(5000, Math.max(duration(mood) + 200, message ? 1800 + message.length * 45 : 0)) }
  if (!reaction || interrupt) {
    queue = []
    play(next)
  } else {
    queue = [...queue, next].slice(-2)
  }
}

const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** La reacción en curso (o null). */
export const useReaction = () => useSyncExternalStore(subscribe, () => reaction)

/** Una mascota en la pantalla avisa si está a la vista: así la flotante no sale repetida. */
export function setInlineVisible(visible: boolean) {
  visibleInline = Math.max(0, visibleInline + (visible ? 1 : -1))
  emit()
}
export const useInlineVisible = () => useSyncExternalStore(subscribe, () => visibleInline > 0)

/** Estado de una comida propia tal como se ve en pantalla. */
export type MealState = 'queued' | 'failed' | 'pending' | 'analyzed' | 'error'
const seen = new Map<string, MealState>()

/**
 * Avo celebra cuando una comida que se está viendo pasa de "en cola" o "analizando" a lista (o avisa si falló).
 * El primer vistazo a cada comida no cuenta: al abrir la app no se celebran las comidas de antes.
 */
export function watchMeal(id: string, state: MealState, calories?: number | null) {
  const prev = seen.get(id)
  if (prev === 'analyzed' && (state === 'pending' || state === 'queued')) return
  seen.set(id, state)
  if (!prev || prev === state) return
  const waiting = prev === 'queued' || prev === 'pending'
  if (state === 'analyzed' && waiting) cheer('celebrate', calories ? `¡Listo! ${Math.round(calories)} kcal` : '¡Listo!')
  else if (state === 'error' && waiting) cheer('oops', 'No pude analizar la foto')
  else if (state === 'failed') cheer('oops', 'No se pudo enviar la foto')
  else if (state === 'pending' && prev === 'queued') cheer('think', 'Analizando tu comida…')
}

/** Saludos que ya se hicieron en esta visita (uno por pantalla). */
const greeted = new Set<string>()
export function greetOnce(key: string, fn: () => void) {
  if (greeted.has(key)) return
  greeted.add(key)
  fn()
}

/** De noche Avo tiene sueño. */
export const isNight = (date = new Date()) => date.getHours() >= 22 || date.getHours() < 6

export function greeting(name: string | null, date = new Date()): { mood: Mood; message: string } {
  const h = date.getHours()
  const who = name ? `, ${name}` : ''
  if (isNight(date)) return { mood: 'sleepy', message: `Ya es tarde${who}… ¡a descansar!` }
  if (h < 12) return { mood: 'wave', message: `¡Buenos días${who}!` }
  if (h < 19) return { mood: 'wave', message: `¡Buenas tardes${who}!` }
  return { mood: 'wave', message: `¡Buenas noches${who}!` }
}

type Line = { mood: Mood; message: string }
const TAPS: Line[] = [
  { mood: 'wave', message: '¡Hola! Soy Avo' },
  { mood: 'love', message: '¡Vas muy bien!' },
  { mood: 'celebrate', message: '¡Eso!' },
  { mood: 'eat', message: '¿Ya comiste?' },
  { mood: 'think', message: 'Mmm… ¿qué cenamos hoy?' },
  { mood: 'love', message: 'Una foto por comida y listo' },
]
const TAPS_NUTRITIONIST: Line[] = [
  { mood: 'wave', message: '¡Hola! Soy Avo' },
  { mood: 'love', message: 'Tus pacientes te lo agradecen' },
  { mood: 'celebrate', message: '¡Eso!' },
  { mood: 'think', message: '¿Qué indicación les dejamos hoy?' },
  { mood: 'eat', message: '¿Y tú ya comiste?' },
]
let tapIndex = Math.floor(Math.random() * 100)
let recentTaps: number[] = []

/** Tocar a Avo: cada toque una reacción distinta; muchos seguidos le dan cosquillas. */
export function tapMascot(role: 'patient' | 'nutritionist' | null = null) {
  const now = Date.now()
  recentTaps = [...recentTaps.filter((t) => now - t < 1500), now]
  navigator.vibrate?.(8)
  if (recentTaps.length >= 4) {
    recentTaps = []
    return cheer('oops', '¡Jaja, cosquillas!', { interrupt: true, tap: true })
  }
  const lines = role === 'nutritionist' ? TAPS_NUTRITIONIST : TAPS
  tapIndex++
  const { mood, message } = lines[tapIndex % lines.length]
  cheer(mood, message, { interrupt: true, tap: true })
}
