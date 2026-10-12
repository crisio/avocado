import { useSyncExternalStore } from 'react'

/**
 * ¿Hay conexión de verdad? navigator.onLine dice true con un Wi-Fi sin internet o con señal casi nula, así que
 * también contamos si la última petición a la API llegó (api.ts llama a reportReachable).
 */
let reachable = true
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export function reportReachable(ok: boolean) {
  if (ok === reachable) return
  reachable = ok
  notify()
}

export const isOnline = () => navigator.onLine && reachable

if (typeof window !== 'undefined') {
  // El navegador avisa que volvió la red: se vale volver a intentar
  window.addEventListener('online', () => {
    reachable = true
    notify()
  })
  window.addEventListener('offline', notify)
}

/** Llama a `fn` cada vez que cambia el estado de conexión. */
export function onConnectivityChange(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export const useOnline = () => useSyncExternalStore(onConnectivityChange, isOnline)
