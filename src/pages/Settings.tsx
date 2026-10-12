import { useState, type FormEvent } from 'react'
import { Button, Card, Notice, PageHeader, PersonRow, Screen, TextField } from '@avocado/ui'
import { useAuth } from '../auth'
import { api } from '../lib/api'
import { usePoll } from '../lib/usePoll'
import { displayName } from '../lib/format'
import type { Person, User } from '../lib/types'

export default function Settings() {
  const { user, setUser, signOut } = useAuth()
  const [name, setName] = useState(user?.full_name ?? '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function saveName(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      setUser(await api<User>('/me', { method: 'PATCH', json: { full_name: name } }))
      setSaved(true)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Screen withTabBar>
      <PageHeader eyebrow={user?.role === 'nutritionist' ? 'Nutrióloga / nutriólogo' : 'Paciente'} title="Perfil" />

      <Card as="form" padding="lg" onSubmit={saveName}>
        <TextField
          label="Nombre"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setSaved(false)
          }}
          hint={user?.email}
        />
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" variant="secondary" icon={saved ? 'check' : undefined} disabled={saved}>
          {saved ? 'Guardado' : 'Guardar'}
        </Button>
      </Card>

      {user?.role === 'patient' && <MyNutritionists />}

      <Button variant="secondary" icon="logout" onClick={signOut}>
        Cerrar sesión
      </Button>
    </Screen>
  )
}

function MyNutritionists() {
  const [list, setList] = useState<Person[]>([])
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = () => api<Person[]>('/care/nutritionists').then(setList, () => {})
  usePoll(load, 60_000, 'nutritionists')

  async function link(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await api('/care/nutritionists', { method: 'POST', json: { email } })
      setEmail('')
      load()
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(false)
  }

  async function unlink(n: Person) {
    if (!confirm(`¿Dejar de compartir tus comidas con ${displayName(n)}?`)) return
    await api(`/care/nutritionists/${n.id}`, { method: 'DELETE' }).catch(() => {})
    load()
  }

  return (
    <Card padding="lg" as="section" aria-labelledby="mi-nutriologa">
      <h2 id="mi-nutriologa" className="av-section-title">
        Mi nutrióloga
      </h2>
      {list.length === 0 ? (
        <p className="av-text-muted" style={{ margin: 0 }}>
          Vincula a tu nutrióloga para que vea tus comidas y te deje indicaciones.
        </p>
      ) : (
        <ul className="app-stack">
          {list.map((n) => (
            <li key={n.id}>
              <PersonRow
                name={displayName(n)}
                detail={n.email}
                trailing={
                  <Button variant="danger" onClick={() => unlink(n)}>
                    Quitar
                  </Button>
                }
              />
            </li>
          ))}
        </ul>
      )}
      <form className="app-row" onSubmit={link}>
        <TextField label="Correo de tu nutrióloga" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="nutriologa@correo.com" />
        <Button type="submit" loading={busy}>
          Vincular
        </Button>
      </form>
      {error && <Notice tone="error">{error}</Notice>}
    </Card>
  )
}
