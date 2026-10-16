import { useEffect, useState } from 'react'
import { useCachedApi } from './useCachedApi'
import type { Fasting } from './types'

/** Ayuno del usuario (el propio o el de un paciente si lo ve su nutrióloga). Se vuelve a pedir cada 30 s y al volver a la app. */
export function useFasting(userId: string | null | undefined, enabled = true, own = true) {
  const path = enabled && userId ? `/fasting?offset=${new Date().getTimezoneOffset()}${own ? '' : `&user_id=${userId}`}` : null
  return useCachedApi<Fasting>(path, 30_000)
}

/** Reloj que se actualiza cada 30 s. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}
