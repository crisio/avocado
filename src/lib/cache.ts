/**
 * Caché de respuestas de la API en localStorage: las pantallas pintan al instante lo último que vieron
 * (también sin internet) y se actualizan en segundo plano. Lectura síncrona = sin parpadeo de "Cargando…".
 */
const PREFIX = 'avocado.cache.'
const INDEX = 'avocado.cache-index'
const MAX_ENTRIES = 80

function readIndex(): string[] {
  try {
    return JSON.parse(localStorage.getItem(INDEX) ?? '[]')
  } catch {
    return []
  }
}

export function readCache<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw === null ? undefined : (JSON.parse(raw) as T)
  } catch {
    return undefined
  }
}

export function writeCache(key: string, value: unknown) {
  try {
    const index = readIndex().filter((k) => k !== key)
    index.push(key)
    // Se queda con las más recientes
    for (const old of index.splice(0, Math.max(0, index.length - MAX_ENTRIES))) localStorage.removeItem(PREFIX + old)
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
    localStorage.setItem(INDEX, JSON.stringify(index))
  } catch {
    // almacenamiento lleno o bloqueado: seguimos sin caché
  }
}

export function clearCache() {
  try {
    for (const key of readIndex()) localStorage.removeItem(PREFIX + key)
    localStorage.removeItem(INDEX)
  } catch {
    // nada que limpiar
  }
}
