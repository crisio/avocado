import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth'
import { api } from '../lib/api'
import { usePoll } from '../lib/usePoll'
import { displayName } from '../lib/format'
import type { Person, User } from '../lib/types'

export default function Settings() {
  const { user, setUser, signOut } = useAuth()
  const [name, setName] = useState(user?.full_name ?? '')
  const [savedName, setSavedName] = useState(false)

  async function saveName(e: FormEvent) {
    e.preventDefault()
    try {
      setUser(await api<User>('/me', { method: 'PATCH', json: { full_name: name } }))
      setSavedName(true)
    } catch (err) {
      alert((err as Error).message)
    }
  }

  return (
    <div className="stack">
      <h1>Ajustes</h1>

      <form className="card stack" onSubmit={saveName}>
        <label>
          Nombre
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setSavedName(false)
            }}
          />
        </label>
        <p className="muted small">
          {user?.email} · {user?.role === 'nutritionist' ? 'Nutrióloga / nutriólogo' : 'Paciente'}
        </p>
        <button disabled={savedName}>{savedName ? 'Guardado' : 'Guardar'}</button>
      </form>

      {user?.role === 'patient' && <MyNutritionists />}

      <button className="danger" onClick={signOut}>
        Cerrar sesión
      </button>
    </div>
  )
}

function MyNutritionists() {
  const [list, setList] = useState<Person[]>([])
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = () => api<Person[]>('/care/nutritionists').then(setList, () => {})
  usePoll(load, 60_000, 'nutritionists')

  async function link(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await api('/care/nutritionists', { method: 'POST', json: { email } })
      setEmail('')
      load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function unlink(n: Person) {
    if (!confirm(`¿Dejar de compartir tus comidas con ${displayName(n)}?`)) return
    await api(`/care/nutritionists/${n.id}`, { method: 'DELETE' }).catch(() => {})
    load()
  }

  return (
    <section className="card stack">
      <h2>Mi nutrióloga</h2>
      {list.length === 0 ? (
        <p className="muted">Vincula a tu nutrióloga para que vea tus comidas y te deje indicaciones.</p>
      ) : (
        <ul className="plain">
          {list.map((n) => (
            <li key={n.id} className="row spread">
              <span>
                <strong>{displayName(n)}</strong>
                <br />
                <span className="muted small">{n.email}</span>
              </span>
              <button className="link danger" onClick={() => unlink(n)}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="row" onSubmit={link}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="correo de tu nutrióloga"
          required
        />
        <button className="primary">Vincular</button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  )
}
