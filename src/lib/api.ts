import { reportReachable } from './useOnline'

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
const TOKEN_KEY = 'avocado.token'

export const isConfigured = Boolean(BASE)

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // almacenamiento bloqueado (modo privado): la sesión dura lo que dure la pestaña
  }
}

let onUnauthorized: (() => void) | null = null
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn
}

/** Llama a la API con el token de sesión. Lanza ApiError con el mensaje del servidor (en español). */
export async function api<T>(path: string, init: RequestInit & { json?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const { json, timeoutMs = 20_000, ...rest } = init
  const headers = new Headers(rest.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (json !== undefined) headers.set('Content-Type', 'application/json')

  let res: Response
  try {
    // Con señal débil fetch puede quedarse colgado: se corta a los `timeoutMs` y se trata como sin conexión.
    res = await fetch(BASE + path, {
      ...rest,
      headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      signal: rest.signal ?? AbortSignal.timeout(timeoutMs),
    })
  } catch {
    reportReachable(false)
    throw new ApiError('Sin conexión. Revisa tu internet.', 0)
  }
  reportReachable(true)

  const data = res.headers.get('Content-Type')?.includes('application/json') ? await res.json() : null
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized?.()
    throw new ApiError(data?.error ?? `Error ${res.status}`, res.status)
  }
  return data as T
}
