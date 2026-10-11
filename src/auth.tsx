import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, getToken, setToken, setUnauthorizedHandler } from './lib/api'
import type { User } from './lib/types'

interface AuthState {
  user: User | null
  signIn: (token: string, user: User) => void
  signOut: () => Promise<void>
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
      setToken(null)
      setUser(null)
    })
    // Refresca el perfil en segundo plano (un 401 cierra la sesión vía el handler)
    if (getToken()) api<User>('/me').then(setUser, () => {})
  }, [])

  const value: AuthState = {
    user,
    signIn: (token, next) => {
      setToken(token)
      setUser(next)
    },
    signOut: async () => {
      await api('/auth/logout', { method: 'POST' }).catch(() => {})
      setToken(null)
      setUser(null)
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
