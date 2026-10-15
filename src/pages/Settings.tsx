import { useState, type FormEvent } from 'react'
import { Button, Card, Notice, PageHeader, PersonRow, Screen, Segmented, TextField, type SegmentedOption } from '@avocado/ui'
import { useAuth } from '../auth'
import AiConsentCard from '../components/AiConsent'
import InstallCard from '../components/InstallCard'
import InviteCard from '../components/InviteCard'
import { Mascot } from '../components/Mascot'
import PrivacyLink from '../components/PrivacyLink'
import { api } from '../lib/api'
import { useCachedApi } from '../lib/useCachedApi'
import { displayName, firstName, formatDay, formatNumber } from '../lib/format'
import { parseInviteCode } from '../lib/invite'
import { cheer } from '../lib/mascot'
import { useOutbox } from '../lib/outbox'
import type { AvoStyle, Goal, Person, User } from '../lib/types'

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

      {user?.role === 'nutritionist' && <InviteCard />}

      {user?.role === 'patient' && (user.goals_set_by ? <LockedGoals /> : <DailyGoal />)}

      {user?.role === 'patient' && <AvoStylePicker />}

      {user?.role === 'patient' && <MyNutritionists />}

      {user?.role === 'patient' && (user.ai_consent_at ? <AiPermission given={user.ai_consent_at} /> : <AiConsentCard />)}

      <InstallCard />

      <Button variant="secondary" icon="logout" onClick={signOut}>
        Cerrar sesión
      </Button>

      <DeleteAccount />

      <p className="av-text-muted" style={{ margin: 0, fontSize: 14, textAlign: 'center' }}>
        <PrivacyLink /> · Avocado {__APP_VERSION__}
      </p>
    </Screen>
  )
}

function MyNutritionists() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invite, setInvite] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

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

  async function join(e: FormEvent) {
    e.preventDefault()
    setJoinError(null)
    const code = parseInviteCode(invite)
    if (!code) return setJoinError('Ese código no se ve bien. Pídele a tu nutrióloga su código o su enlace.')
    setJoining(true)
    try {
      await api(`/care/invite/${encodeURIComponent(code)}`, { method: 'POST' })
      setInvite('')
      load()
      cheer('celebrate', '¡Listo! Ya puede ver tus comidas', { interrupt: true })
    } catch (err) {
      setJoinError((err as Error).message)
      cheer('oops', 'No pude vincularla', { interrupt: true })
    }
    setJoining(false)
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
      <form className="invite-join" onSubmit={join}>
        <TextField
          label="¿Tienes un código de invitación?"
          value={invite}
          onChange={(e) => setInvite(e.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="Código o enlace"
        />
        <Button type="submit" variant="secondary" loading={joining} disabled={!invite.trim()}>
          Unirme
        </Button>
      </form>
      {joinError && <Notice tone="error">{joinError}</Notice>}
    </Card>
  )
}

const GOAL_OPTIONS: SegmentedOption<Goal>[] = [
  { value: 'bajar', label: 'Bajar', ariaLabel: 'Bajar de peso' },
  { value: 'mantener', label: 'Mantener' },
  { value: 'subir', label: 'Subir', ariaLabel: 'Subir (volumen)' },
]

/** Las metas que puso su nutrióloga: solo se leen (para cambiarlas, que se las pida a ella). */
function LockedGoals() {
  const { user } = useAuth()
  const { data } = useCachedApi<Person[]>('/care/nutritionists', 60_000)
  const who = data?.find((n) => n.id === user?.goals_set_by)
  if (!user) return null
  const parts = [
    user.daily_kcal_goal ? `${formatNumber(user.daily_kcal_goal)} kcal` : null,
    user.goal ? { bajar: 'Bajar', mantener: 'Mantener', subir: 'Subir' }[user.goal] : null,
    user.protein_g_goal ? `Proteína ${formatNumber(user.protein_g_goal)} g` : null,
    user.carbs_g_goal ? `Carbos ${formatNumber(user.carbs_g_goal)} g` : null,
    user.fat_g_goal ? `Grasa ${formatNumber(user.fat_g_goal)} g` : null,
  ].filter(Boolean)
  return (
    <Card padding="lg" as="section" aria-labelledby="metas-bloqueadas">
      <h2 id="metas-bloqueadas" className="av-section-title">
        Tu meta diaria
      </h2>
      <p style={{ margin: 0 }}>
        Tu nutrióloga{who ? ` (${displayName(who)})` : ''} te puso: <strong>{parts.length ? parts.join(' · ') : 'sin metas por ahora'}</strong>
      </p>
      <p className="av-text-muted" style={{ margin: 0, fontSize: 14 }}>
        Si quieres cambiarlas, pídeselo a ella.
      </p>
    </Card>
  )
}

/** Meta diaria de calorías (la que le dio su nutrióloga) y objetivo. Avo los usa para los antojos y la comida libre. */
function DailyGoal() {
  const { user, setUser } = useAuth()
  const [value, setValue] = useState(user?.daily_kcal_goal ? String(user.daily_kcal_goal) : '')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const goal = value.trim() ? Number(value) : null
      const updated = await api<User>('/me', { method: 'PATCH', json: { daily_kcal_goal: goal } })
      setUser(updated)
      setSaved(true)
      cheer('love', updated.daily_kcal_goal ? `¡Meta de ${formatNumber(updated.daily_kcal_goal)} kcal guardada!` : 'Listo, sin meta por ahora', { interrupt: true })
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(false)
  }

  return (
    <Card as="form" padding="lg" onSubmit={save}>
      <h2 className="av-section-title">Tu meta diaria</h2>
      <TextField
        label="Calorías al día"
        type="number"
        inputMode="numeric"
        min={800}
        max={6000}
        step={10}
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setSaved(false)
        }}
        placeholder="Ej. 1800"
        hint="La que te indicó tu nutrióloga. Avo la usa para aconsejarte con tus antojos. Déjala vacía si no tienes una."
      />
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" variant="secondary" icon={saved ? 'check' : undefined} loading={busy} disabled={saved}>
        {saved ? 'Guardada' : 'Guardar meta'}
      </Button>
      <GoalPicker />
    </Card>
  )
}

const AVO_STYLE_OPTIONS: SegmentedOption<AvoStyle>[] = [
  { value: 'picante', label: 'Picante 🌶️' },
  { value: 'tranquilo', label: 'Tranquilo 😌' },
]

/** Personalidad de Avo: se guarda al tocarla. */
function AvoStylePicker() {
  const { user, setUser } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const current = user?.avo_style ?? 'picante'

  async function choose(avo_style: AvoStyle) {
    setError(null)
    try {
      setUser(await api<User>('/me', { method: 'PATCH', json: { avo_style } }))
      cheer('love', avo_style === 'picante' ? 'Ahora sí, a darle con sabor 🌶️' : 'Listo, me porto tranquilo', { interrupt: true })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Card padding="lg" as="section" aria-label="Personalidad de Avo">
      <div className="app-stack" style={{ gap: 6 }}>
        <span className="mood-label">Personalidad de Avo</span>
        <Segmented label="Personalidad de Avo" options={AVO_STYLE_OPTIONS} value={current} onChange={(s) => void choose(s)} />
        <span className="av-text-muted" style={{ fontSize: 13 }}>
          {current === 'picante' ? 'Picante: sarcástico, con memes y GIF. Nunca se burla de tu cuerpo.' : 'Tranquilo: amable y sin carrilla.'}
        </span>
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Card>
  )
}

/** Objetivo: se guarda al tocarlo. */
function GoalPicker() {
  const { user, setUser } = useAuth()
  const [error, setError] = useState<string | null>(null)

  async function choose(goal: Goal) {
    setError(null)
    try {
      setUser(await api<User>('/me', { method: 'PATCH', json: { goal } }))
      cheer('love', { bajar: '¡A bajar con todo!', mantener: '¡A mantenernos!', subir: '¡A ganar volumen!' }[goal], { interrupt: true })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="app-stack" style={{ gap: 6 }}>
      <span className="mood-label">Tu objetivo</span>
      <Segmented label="Tu objetivo" options={GOAL_OPTIONS} value={user?.goal ?? null} onChange={(g) => void choose(g)} />
      <span className="av-text-muted" style={{ fontSize: 13 }}>
        Con tu meta y tu objetivo, Avo calcula tu saldo de la semana y si te alcanza para una comida libre.
      </span>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  )
}

/** Permiso para analizar con IA, ya dado: se puede retirar (y volver a dar desde aquí mismo). */
function AiPermission({ given }: { given: string }) {
  const { setUser } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const day = formatDay(new Date(given)).toLowerCase()
  const when = day === 'hoy' || day === 'ayer' ? day : `el ${day}`

  async function revoke() {
    if (!confirm('Sin este permiso Avo no puede analizar tus fotos ni aconsejarte con tus antojos. ¿Retirarlo?')) return
    setBusy(true)
    setError(null)
    try {
      setUser(await api<User>('/me', { method: 'PATCH', json: { ai_consent: false } }))
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(false)
  }

  return (
    <Card padding="lg" as="section" aria-labelledby="permiso-ia">
      <h2 id="permiso-ia" className="av-section-title">
        Análisis con IA
      </h2>
      <p className="av-text-muted" style={{ margin: 0 }}>
        Diste permiso {when}. Tus fotos y notas se mandan a modelos de Google y OpenAI (vía OpenRouter) para calcular
        calorías y macros.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      <Button variant="secondary" loading={busy} onClick={revoke}>
        Retirar permiso
      </Button>
    </Card>
  )
}

/** Borrar la cuenta y todo lo suyo (lo pide la App Store). Dos pasos: primero explica qué se borra. */
function DeleteAccount() {
  const { user, deleteAccount } = useAuth()
  const { jobs } = useOutbox()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await deleteAccount()
    } catch (err) {
      setError((err as Error).message)
      cheer('oops', 'No pude borrar tu cuenta', { interrupt: true })
      setBusy(false)
    }
  }

  if (!asking)
    return (
      <Button variant="ghost" icon="trash" onClick={() => setAsking(true)}>
        Borrar mi cuenta
      </Button>
    )

  return (
    <Card padding="lg" as="section" aria-labelledby="borrar-cuenta">
      <h2 id="borrar-cuenta" className="av-section-title">
        ¿Borrar tu cuenta?
      </h2>
      <p style={{ margin: 0 }}>
        {user?.role === 'nutritionist'
          ? 'Se borran tu cuenta, tus comentarios y tus vínculos con pacientes. Las comidas de tus pacientes se quedan con ellos.'
          : 'Se borran tu cuenta, todas tus comidas y fotos, los comentarios y los vínculos con tu nutrióloga.'}{' '}
        <strong>No se puede deshacer.</strong>
      </p>
      {jobs.length > 0 && (
        <Notice tone="warning">
          También se pierden {jobs.length === 1 ? '1 envío que sigue' : `${jobs.length} envíos que siguen`} en el teléfono sin mandar.
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <Button variant="secondary" onClick={() => setAsking(false)} disabled={busy}>
          Cancelar
        </Button>
        <Button variant="danger" icon="trash" loading={busy} onClick={remove}>
          Sí, borrar todo
        </Button>
      </div>
    </Card>
  )
}
