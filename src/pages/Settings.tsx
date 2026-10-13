import { useState, type FormEvent } from 'react'
import { Button, Card, Notice, PageHeader, PersonRow, Screen, TextField } from '@avocado/ui'
import { useAuth } from '../auth'
import InstallCard from '../components/InstallCard'
import { Mascot } from '../components/Mascot'
import { api } from '../lib/api'
import { useCachedApi } from '../lib/useCachedApi'
import { displayName, firstName } from '../lib/format'
import { cheer } from '../lib/mascot'
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
      const updated = await api<User>('/me', { method: 'PATCH', json: { full_name: name } })
      setUser(updated)
      setSaved(true)
      const first = firstName(updated.full_name)
      cheer('love', first ? `¡Mucho gusto, ${first}!` : '¡Guardado!', { interrupt: true })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Screen withTabBar>
      <PageHeader
        eyebrow={user?.role === 'nutritionist' ? 'Nutrióloga / nutriólogo' : 'Paciente'}
        title="Perfil"
        action={<Mascot size={80} reactive interactive />}
      />

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

      <InstallCard />

      <Button variant="secondary" icon="logout" onClick={signOut}>
        Cerrar sesión
      </Button>
    </Screen>
  )
}

function MyNutritionists() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data, refresh: load } = useCachedApi<Person[]>('/care/nutritionists', 60_000)
  const list = data ?? []

  async function link(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await api('/care/nutritionists', { method: 'POST', json: { email } })
      setEmail('')
      load()
      cheer('celebrate', '¡Listo! Ya puede ver tus comidas', { interrupt: true })
    } catch (err) {
      setError((err as Error).message)
      cheer('oops', 'No pude vincularla', { interrupt: true })
    }
    setBusy(false)
  }

  async function unlink(n: Person) {
    if (!confirm(`¿Dejar de compartir tus comidas con ${displayName(n)}?`)) return
    await api(`/care/nutritionists/${n.id}`, { method: 'DELETE' }).catch((err) => alert(err.message))
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
