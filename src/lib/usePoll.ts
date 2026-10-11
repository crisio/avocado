import { useEffect, useRef } from 'react'

/**
 * Ejecuta `fn` al montar, cada `intervalMs` mientras la app está visible, y al volver a ella.
 * Así los comentarios y análisis nuevos aparecen sin recargar. Cambiar `key` reinicia el ciclo.
 */
export function usePoll(fn: () => unknown, intervalMs: number, key: string) {
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') fnRef.current()
    }
    fnRef.current()
    const timer = setInterval(tick, intervalMs)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [intervalMs, key])
}
