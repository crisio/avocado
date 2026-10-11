import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth'
import { supabase } from '../lib/supabase'
import { displayName } from '../lib/format'
import type { Profile } from '../lib/types'

type Nutritionist = Pick<Profile, 'id' | 'email' | 'full_name'>

export default function Settings() {
  const { session, profile, reloadProfile } = useAuth()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [savedName, setSavedName] = useState(false)

  async function saveName(e: FormEvent) {
    e.preventDefault()
    if (!session) return
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() || null }).eq('id', session.user.id)
    if (!error) {
      await reloadProfile()
      setSavedName(true)
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
          {profile?.email} · {profile?.role === 'nutritionist' ? 'Nutrióloga / nutriólogo' : 'Paciente'}
        </p>
        <button disabled={savedName}>{savedName ? 'Guardado' : 'Guardar'}</button>
      </form>

      {profile?.role === 'patient' && <MyNutritionists />}

      <button className="danger" onClick={() => supabase.auth.signOut()}>
        Cerrar sesión
      </button>
    </div>
  )
}

function MyNutritionists() {
  const { session } = useAuth()
  const [list, setList] = useState<Nutritionist[]>([])
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  const userId = session?.user.id

  const load = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('care_links')
      .select('nutritionist:profiles!care_links_nutritionist_id_fkey(id, email, full_name)')
      .eq('patient_id', userId)
    setList((data ?? []).map((row) => row.nutritionist as unknown as Nutritionist).filter(Boolean))
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  async function link(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const { error } = await supabase.rpc('link_nutritionist', { nutritionist_email: email })
    if (error) return setError(error.message)
    setEmail('')
    load()
  }

  async function unlink(n: Nutritionist) {
    if (!userId || !confirm(`¿Dejar de compartir tus comidas con ${displayName(n)}?`)) return
    await supabase.from('care_links').delete().eq('patient_id', userId).eq('nutritionist_id', n.id)
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
