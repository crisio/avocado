import { useState, type FormEvent } from 'react'
import { appUrl, supabase } from '../lib/supabase'
import type { Role } from '../lib/types'

type Mode = 'signin' | 'signup' | 'forgot'

export default function Login() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<Role>('patient')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setNotice(null)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(
          error.message.includes('Email not confirmed')
            ? 'Primero confirma tu correo: revisa tu bandeja de entrada (y spam).'
            : 'Correo o contraseña incorrectos.',
        )
      }
    } else if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: appUrl(), data: { full_name: fullName, role } },
      })
      if (error) setError(error.message)
      else if (!data.session) setNotice(`Te enviamos un correo a ${email}. Ábrelo para confirmar tu cuenta y luego entra.`)
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl() })
      if (error) setError(error.message)
      else setNotice(`Si ${email} tiene cuenta, te llegará un correo para crear una nueva contraseña.`)
    }

    setBusy(false)
  }

  return (
    <div className="auth">
      <header className="auth-header">
        <img src={`${import.meta.env.BASE_URL}pwa-192x192.png`} alt="" width={72} height={72} />
        <h1>Avocado</h1>
        <p className="muted">Tus comidas en fotos, con seguimiento de tu nutrióloga.</p>
      </header>

      {mode !== 'forgot' && (
        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={mode === 'signin'} onClick={() => switchMode('signin')}>
            Entrar
          </button>
          <button role="tab" aria-selected={mode === 'signup'} onClick={() => switchMode('signup')}>
            Crear cuenta
          </button>
        </div>
      )}

      <form className="card stack" onSubmit={onSubmit}>
        {mode === 'forgot' && <h2>Recuperar contraseña</h2>}

        {mode === 'signup' && (
          <>
            <label>
              Nombre
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
            </label>
            <fieldset className="role-picker">
              <legend>Soy…</legend>
              <label>
                <input type="radio" name="role" checked={role === 'patient'} onChange={() => setRole('patient')} />
                Paciente
              </label>
              <label>
                <input
                  type="radio"
                  name="role"
                  checked={role === 'nutritionist'}
                  onChange={() => setRole('nutritionist')}
                />
                Nutrióloga / nutriólogo
              </label>
            </fieldset>
          </>
        )}

        <label>
          Correo
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>

        {mode !== 'forgot' && (
          <label>
            Contraseña
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </label>
        )}

        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}

        <button className="primary" disabled={busy}>
          {busy ? 'Un momento…' : mode === 'signin' ? 'Entrar' : mode === 'signup' ? 'Crear cuenta' : 'Enviar correo'}
        </button>

        {mode === 'signin' && (
          <button type="button" className="link" onClick={() => switchMode('forgot')}>
            Olvidé mi contraseña
          </button>
        )}
        {mode === 'forgot' && (
          <button type="button" className="link" onClick={() => switchMode('signin')}>
            Volver
          </button>
        )}
      </form>
    </div>
  )
}
