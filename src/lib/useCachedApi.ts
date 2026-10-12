import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import { readCache, writeCache } from './cache'
import { onSynced } from './outbox'
import { usePoll } from './usePoll'
import { isOnline, onConnectivityChange } from './useOnline'

/**
 * GET con caché: pinta al instante lo último guardado, pide la versión nueva en segundo plano y la vuelve
 * a pedir cada `intervalMs` (solo con la app visible y con red), y cuando la cola termina un envío.
 */
export function useCachedApi<T>(path: string | null, intervalMs: number) {
  // fresh: el dato ya llegó de la red en esta visita (false mientras solo hay lo guardado en caché).
  const [state, setState] = useState(() => ({ path, data: path ? readCache<T>(path) : undefined, error: null as Error | null, fresh: false }))
  // Al cambiar de ruta (otro día, otra comida) se muestra de inmediato lo que haya en caché para ella.
  const current = state.path === path ? state : { path, data: path ? readCache<T>(path) : undefined, error: null, fresh: false }
  if (current !== state) setState(current)

  const pathRef = useRef(path)
  pathRef.current = path

  const refresh = () => {
    const p = pathRef.current
    if (!p || !navigator.onLine) return Promise.resolve()
    return api<T>(p)
      .then((data) => {
        writeCache(p, data)
        if (pathRef.current === p) setState({ path: p, data, error: null, fresh: true })
      })
      .catch((error: Error) => {
        if (pathRef.current === p) setState((s) => ({ ...s, error }))
      })
  }

  usePoll(refresh, intervalMs, path ?? '')
  useEffect(() => onSynced(() => void refresh()), [])
  // Al volver la conexión se actualiza de inmediato, sin esperar al siguiente ciclo.
  useEffect(() => onConnectivityChange(() => isOnline() && void refresh()), [])

  /** Cambia el dato local (y su caché) sin esperar al servidor. */
  const mutate = (fn: (prev: T | undefined) => T | undefined) =>
    setState((s) => {
      const data = fn(s.data)
      if (s.path && data !== undefined) writeCache(s.path, data)
      return { ...s, data, fresh: true }
    })

  return { data: current.data, error: current.error, fresh: current.fresh, refresh, mutate }
}
