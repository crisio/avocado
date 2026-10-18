import { useSyncExternalStore } from 'react'
import { api, ApiError } from './api'
import { idbAll, idbClear, idbDelete, idbPut, OUTBOX } from './idb'
import type { MealComment } from './types'
import { isOnline, onConnectivityChange } from './useOnline'

/**
 * Cola de envíos. Todo lo que el usuario crea (comidas con foto, comentarios) se guarda primero aquí, en el
 * teléfono, y se manda en cuanto hay conexión. Cada envío lleva un id generado aquí, así un reintento después
 * de una conexión cortada no duplica nada en el servidor. Al subir la comida el servidor arranca el análisis
 * con IA por su cuenta (analyze=1), aunque el teléfono vuelva a perder la señal.
 */

interface BaseJob {
  id: string
  userId: string
  created_at: string
  attempts: number
  /** Error permanente (el servidor rechazó el envío); no se reintenta solo. */
  error?: string
}

export interface MealJob extends BaseJob {
  kind: 'meal'
  eaten_at: string
  note: string | null
  cooking?: string | null
  photo: Blob
}

export interface CommentJob extends BaseJob {
  kind: 'comment'
  mealId: string
  body: string
  author_name: string | null
  author_role: MealComment['author_role']
}

export type Job = MealJob | CommentJob

let jobs: Job[] = []
let loaded = false
let sending: string | null = null
const listeners = new Set<() => void>()
const syncedListeners = new Set<(job: Job) => void>()

interface Snapshot {
  jobs: Job[]
  sending: string | null
  loaded: boolean
}
let snapshot: Snapshot = { jobs, sending, loaded }

function emit() {
  snapshot = { jobs, sending, loaded }
  listeners.forEach((l) => l())
}

async function reload() {
  try {
    jobs = (await idbAll<Job>(OUTBOX)).sort(byCreation)
  } catch {
    // IndexedDB no disponible (modo privado muy estricto): la cola vive solo en memoria
  }
  loaded = true
  emit()
}

const byCreation = (a: Job, b: Job) => a.created_at.localeCompare(b.created_at)

async function save(job: Job) {
  // Siempre en orden de creación: una comida va antes que los comentarios que se le hicieron sin conexión.
  jobs = [...jobs.filter((j) => j.id !== job.id), job].sort(byCreation)
  emit()
  await idbPut(OUTBOX, job).catch(() => {})
}

async function remove(id: string) {
  jobs = jobs.filter((j) => j.id !== id)
  emit()
  await idbDelete(OUTBOX, id).catch(() => {})
}

export function enqueueMeal(job: Omit<MealJob, 'kind' | 'attempts' | 'created_at'>) {
  const full: MealJob = { ...job, kind: 'meal', attempts: 0, created_at: new Date().toISOString() }
  return save(full).then(() => {
    void flush()
    return full
  })
}

export function enqueueComment(job: Omit<CommentJob, 'kind' | 'attempts' | 'created_at'>) {
  const full: CommentJob = { ...job, kind: 'comment', attempts: 0, created_at: new Date().toISOString() }
  return save(full).then(() => {
    void flush()
    return full
  })
}

/** Vuelve a intentar un envío que el servidor había rechazado. */
export function retryJob(id: string) {
  const job = jobs.find((j) => j.id === id)
  if (!job) return
  void save({ ...job, error: undefined, attempts: 0 }).then(() => flush())
}

export const discardJob = (id: string) => remove(id)

async function send(job: Job) {
  if (job.kind === 'meal') {
    const form = new FormData()
    form.set('client_id', job.id)
    form.set('photo', job.photo, 'comida.jpg')
    form.set('eaten_at', job.eaten_at)
    form.set('analyze', '1')
    form.set('offset', String(new Date().getTimezoneOffset()))
    if (job.note) form.set('note', job.note)
    if (job.cooking) form.set('cooking', job.cooking)
    await api('/meals', { method: 'POST', body: form, timeoutMs: 60_000 })
  } else {
    await api(`/meals/${job.mealId}/comments`, { method: 'POST', json: { id: job.id, body: job.body } })
  }
}

// Errores que vale la pena reintentar: sin red, tiempo agotado, servidor caído o saturado.
const isTransient = (err: unknown) => !(err instanceof ApiError) || err.status === 0 || err.status === 408 || err.status === 429 || err.status >= 500

let flushing: Promise<void> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null

/** Manda la cola en orden. Las comidas van antes que sus comentarios porque se crearon antes. */
export function flush(): Promise<void> {
  if (flushing) return flushing
  flushing = (async () => {
    if (!loaded) await reload()
    let backoff = false
    for (const job of [...jobs]) {
      if (job.error) continue
      // Un comentario espera a que su comida llegue al servidor
      if (job.kind === 'comment' && jobs.some((j) => j.kind === 'meal' && j.id === job.mealId)) continue
      if (!navigator.onLine) break // sin red segura; con red dudosa sí se intenta (es la forma de saber si volvió)
      sending = job.id
      emit()
      try {
        await send(job)
        await remove(job.id)
        syncedListeners.forEach((l) => l(job))
      } catch (err) {
        if (isTransient(err)) {
          await save({ ...job, attempts: job.attempts + 1 })
          backoff = true
          break // sin red: los demás también fallarían
        }
        await save({ ...job, attempts: job.attempts + 1, error: (err as Error).message })
      }
    }
    sending = null
    emit()
    // Reintento con espera creciente (5 s, 10 s, 20 s… hasta 30 s) si quedó algo pendiente.
    if (retryTimer) clearTimeout(retryTimer)
    const pending = jobs.filter((j) => !j.error)
    if (pending.length) {
      const attempts = Math.max(...pending.map((j) => j.attempts))
      retryTimer = setTimeout(() => void flush(), backoff ? Math.min(30_000, 5_000 * 2 ** Math.max(0, attempts - 1)) : 1_000)
    }
  })().finally(() => {
    flushing = null
  })
  return flushing
}

/** Arranca la cola: carga lo guardado y la manda al abrir la app, al volver la red y al volver a la app. */
export function startOutbox() {
  void flush()
  // Volvió la conexión (evento del navegador o una petición que por fin llegó): manda lo pendiente ya.
  onConnectivityChange(() => {
    if (isOnline()) void flush()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flush()
  })
}

/** Cuántos envíos siguen en el teléfono. */
export const pendingCount = () => jobs.length

export async function clearOutbox() {
  jobs = []
  emit()
  await idbClear(OUTBOX).catch(() => {})
}

/** Se llama cuando un envío llega al servidor (para refrescar la pantalla). */
export function onSynced(fn: (job: Job) => void) {
  syncedListeners.add(fn)
  return () => {
    syncedListeners.delete(fn)
  }
}

const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export const useOutbox = () => useSyncExternalStore(subscribe, () => snapshot)
