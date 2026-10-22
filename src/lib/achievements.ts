import { useEffect, useSyncExternalStore } from 'react'
import { useAuth } from '../auth'
import { api } from './api'
import { cheer } from './mascot'
import { useCachedApi } from './useCachedApi'
import type { User } from './types'

/** Logros, retos de la semana y accesorios de Avo (ver api: GET /achievements). */
export type MedalGroup = 'constancia' | 'registro' | 'habitos' | 'retos'
export type AccessorySlot = 'cabeza' | 'cara' | 'lado' | 'aura'

export interface Medal {
  key: string
  emoji: string
  title: string
  description: string
  group: MedalGroup
  progress: number
  target: number
  unlocked_at: string | null
}
export interface Challenge {
  key: string
  emoji: string
  title: string
  description: string
  progress: number
  target: number
  done: boolean
  ends_at: string
}
export interface Accessory {
  key: string
  emoji: string
  name: string
  slot: AccessorySlot
  unlocked: boolean
  requirement: string
}
export interface Achievements {
  medals: Medal[]
  challenges: Challenge[]
  accessories: Accessory[]
  equipped: string | null
  streak: { current: number; best: number }
  summary: { unlocked: number; total: number }
}

export const GROUP_LABELS: Record<MedalGroup, string> = { constancia: 'Constancia', registro: 'Registro', habitos: 'Hábitos', retos: 'Retos' }
export const GROUP_ORDER: MedalGroup[] = ['constancia', 'registro', 'habitos', 'retos']

export const achievementsPath = (userId?: string) => `/achievements?offset=${new Date().getTimezoneOffset()}${userId ? `&user_id=${userId}` : ''}`

// Catálogo de accesorios (clave → emoji y lugar): lo llena la API y se guarda para que Avo lo lleve puesto en
// cualquier pantalla, también al abrir sin internet.
const CATALOG_KEY = 'avocado.accessories'
type Catalog = Record<string, { emoji: string; slot: AccessorySlot }>
let catalog: Catalog = (() => {
  try {
    return JSON.parse(localStorage.getItem(CATALOG_KEY) ?? '{}')
  } catch {
    return {}
  }
})()
const listeners = new Set<() => void>()

function rememberCatalog(list: Accessory[]) {
  const next: Catalog = Object.fromEntries(list.map((a) => [a.key, { emoji: a.emoji, slot: a.slot }]))
  if (JSON.stringify(next) === JSON.stringify(catalog)) return
  catalog = next
  try {
    localStorage.setItem(CATALOG_KEY, JSON.stringify(next))
  } catch {
    // sin almacenamiento: solo en esta visita
  }
  listeners.forEach((l) => l())
}

export interface WornAccessory {
  emoji: string
  slot: AccessorySlot
}

/** Lo que lleva puesto Avo del paciente (null = nada, o aún no se conoce el catálogo). */
export function useWornAccessory(): WornAccessory | null {
  const { user } = useAuth()
  const c = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    () => catalog,
  )
  return user?.role === 'patient' && user.avo_accessory ? (c[user.avo_accessory] ?? null) : null
}

/** Logros del usuario (o de un paciente, para su nutrióloga). Se actualiza al volver a la app y al enviarse una comida. */
export function useAchievements(userId?: string) {
  const { data, error, fresh, refresh } = useCachedApi<Achievements>(achievementsPath(userId), 120_000)
  useEffect(() => {
    if (data && !userId) rememberCatalog(data.accessories)
  }, [data, userId])
  return { data, error, fresh, refresh }
}

/** Ponerle (o quitarle, con null) un accesorio a Avo. */
export function useEquip() {
  const { setUser } = useAuth()
  return async (key: string | null, onDone?: () => void) => {
    const updated = await api<User>('/me', { method: 'PATCH', json: { avo_accessory: key } })
    setUser(updated)
    onDone?.()
    cheer('love', key ? '¡Qué bien me queda!' : 'Al natural también', { interrupt: true })
  }
}
