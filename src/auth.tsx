import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { Profile } from './lib/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  /** true cuando el usuario llegó desde el correo de "recuperar contraseña" */
  recovering: boolean
  endRecovery: () => void
  reloadProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionLoaded(true)
    })
    // No llamar a otros métodos de supabase dentro de este callback (puede bloquearse).
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      if (event === 'SIGNED_OUT') setRecovering(false)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  const reloadProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null)
      setProfileLoaded(true)
      return
    }
    const { data } = await supabase.from('profiles').select('id, email, full_name, role').eq('id', userId).single()
    setProfile(data)
    setProfileLoaded(true)
  }, [userId])

  useEffect(() => {
    setProfileLoaded(false)
    reloadProfile()
  }, [reloadProfile])

  const value: AuthState = {
    session,
    profile,
    loading: !sessionLoaded || (Boolean(session) && !profileLoaded),
    recovering,
    endRecovery: () => setRecovering(false),
    reloadProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
