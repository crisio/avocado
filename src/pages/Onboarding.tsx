import { useState, type FormEvent } from 'react'
import { Button, Card, Notice, PageHeader, RadioCard, Screen, TextField } from '@avocado/ui'
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
    <Screen narrow>
      <PageHeader eyebrow={user?.email} title="¡Bienvenida/o!" />
      <Card as="form" padding="lg" onSubmit={onSubmit}>
        <TextField label="¿Cómo te llamas?" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" autoFocus />
        <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <legend className="av-field__label" style={{ marginBottom: 6 }}>
            Soy…
          </legend>
          <RadioCard name="role" checked={role === 'patient'} onChange={() => setRole('patient')} title="Paciente" description="Quiero registrar mis comidas." />
          <RadioCard
            name="role"
            checked={role === 'nutritionist'}
            onChange={() => setRole('nutritionist')}
            title="Nutrióloga / nutriólogo"
            description="Doy seguimiento a mis pacientes."
          />
        </fieldset>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" size="lg" fullWidth loading={busy}>
          Continuar
        </Button>
        <Button variant="ghost" onClick={signOut}>
          Usar otro correo
        </Button>
      </Card>
    </Screen>
  )
}
