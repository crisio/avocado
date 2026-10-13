import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, getToken, setToken, setUnauthorizedHandler } from './lib/api'
import { clearCache } from './lib/cache'
import { clearOutbox, pendingCount } from './lib/outbox'
import type { User } from './lib/types'

interface AuthState {
  user: User | null
  signIn: (token: string, user: User) => void
  signOut: () => Promise<void>
  /** Borra la cuenta en el servidor y todo lo que quedó en el teléfono. Lanza el error si no se pudo. */
  deleteAccount: () => Promise<void>
  setUser: (user: User) => void
}

const USER_KEY = 'avocado.user'

// El perfil se guarda junto al token para que la app abra al instante (y sin internet).
function readCachedUser(): User | null {
  try {
    return getToken() ? JSON.parse(localStorage.getItem(USER_KEY) ?? 'null') : null
  } catch {
    return null
  }
}

function cacheUser(user: User | null) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
    else localStorage.removeItem(USER_KEY)
  } catch {
    // almacenamiento no disponible
  }
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(readCachedUser)

  const setUser = (next: User | null) => {
    cacheUser(next)
    setUserState(next)
  }

  useEffect(() => {
    setUnauthorizedHandler(() => {
      // Sesión vencida: la cola se conserva (es del mismo usuario y se envía al volver a entrar)
      setToken(null)
      setUser(null)
    })
    // Refresca el perfil en segundo plano (un 401 cierra la sesión vía el handler)
    if (getToken()) api<User>('/me').then(setUser, () => {})
  }, [])

  // En un teléfono compartido no deben quedar comidas ni datos de otra cuenta
  async function forgetLocal() {
    clearCache()
    await clearOutbox()
    setToken(null)
    setUser(null)
  }

  const value: AuthState = {
    user,
    signIn: (token, next) => {
      setToken(token)
      setUser(next)
    },
    signOut: async () => {
      const pending = pendingCount()
      if (pending && !confirm(`Tienes ${pending} ${pending === 1 ? 'envío' : 'envíos'} sin mandar (sin conexión). Si cierras sesión se pierden. ¿Cerrar sesión de todos modos?`)) return
      await api('/auth/logout', { method: 'POST' }).catch(() => {})
      await forgetLocal()
    },
    deleteAccount: async () => {
      await api('/me', { method: 'DELETE', timeoutMs: 60_000 })
      await forgetLocal()
    },
    setUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
