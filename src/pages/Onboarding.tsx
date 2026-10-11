import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth'
import { api } from '../lib/api'
import type { Role, User } from '../lib/types'

/** Primera vez: nombre y tipo de cuenta (el tipo no se puede cambiar después). */
export default function Onboarding() {
  const { user, setUser, signOut } = useAuth()
  const [fullName, setFullName] = useState(user?.full_name ?? '')
  const [role, setRole] = useState<Role>('patient')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      setUser(await api<User>('/me', { method: 'PATCH', json: { full_name: fullName, role } }))
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <form className="card stack" onSubmit={onSubmit}>
        <h2>¡Bienvenida/o!</h2>
        <p className="muted">{user?.email}</p>
        <label>
          ¿Cómo te llamas?
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" autoFocus />
        </label>
        <fieldset className="role-picker">
          <legend>Soy…</legend>
          <label>
            <input type="radio" name="role" checked={role === 'patient'} onChange={() => setRole('patient')} />
            Paciente: quiero registrar mis comidas
          </label>
          <label>
            <input type="radio" name="role" checked={role === 'nutritionist'} onChange={() => setRole('nutritionist')} />
            Nutrióloga / nutriólogo: doy seguimiento a pacientes
          </label>
        </fieldset>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? 'Guardando…' : 'Continuar'}
        </button>
        <button type="button" className="link" onClick={signOut}>
          Usar otro correo
        </button>
      </form>
    </div>
  )
}
