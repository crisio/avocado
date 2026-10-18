import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Notice, PageHeader, PhotoPicker, Screen, TextField } from '@avocado/ui'
import { useAuth } from '../auth'
import AiConsentCard from '../components/AiConsent'
import { celebrateMeal } from '../components/Celebration'
import CravingLink from '../components/CravingLink'
import VoiceButton from '../components/VoiceButton'
import TopBar from '../components/TopBar'
import { compressImage } from '../lib/image'
import { cheer, preloadHd } from '../lib/mascot'
import { enqueueMeal, useOutbox } from '../lib/outbox'
import { streakAfterNewMeal } from '../lib/streak'
import { firstName, toDayParam, toLocalInput } from '../lib/format'
import { useOnline } from '../lib/useOnline'

const HOW = ['A la plancha', 'Frito', 'Al horno', 'Salteado', 'Hervido o al vapor']
const WITH = ['Aceite de oliva', 'Aceite de aguacate', 'Aceite vegetal', 'Mantequilla', 'Manteca', 'Sin grasa']
const HOW_MUCH = ['1 cdita', '1 cda', '2 cdas', '3 o más', 'Para freír']
const NO_FAT = 'Sin grasa'

const oilKey = (userId: string) => `avocado.cookingOil.${userId}`
const lastOil = (userId: string) => {
  try {
    const v = localStorage.getItem(oilKey(userId))
    return v && WITH.includes(v) ? v : null
  } catch {
    return null
  }
}
const rememberOil = (userId: string, oil: string) => {
  try {
    localStorage.setItem(oilKey(userId), oil)
  } catch {
    // sin almacenamiento: no se recuerda
  }
}

const AMOUNT_TEXT: Record<string, string> = { '1 cdita': '1 cucharadita', '1 cda': '1 cucharada', '2 cdas': '2 cucharadas', '3 o más': '3 o más cucharadas' }

/** Arma el texto para la IA: "Al horno con 1 cucharada de aceite de oliva. Le eché crema." */
function composeCooking(how: string | null, fat: string | null, amount: string | null, extra: string): string | null {
  let first = how ?? ''
  if (fat === NO_FAT) first += `${first ? ' ' : ''}sin grasa`
  else if (fat) {
    const f = fat.charAt(0).toLowerCase() + fat.slice(1)
    if (amount === 'Para freír') first += `${first ? ' ' : ''}${how === 'Frito' ? `en ${f} (para freír)` : `frito en ${f} (para freír)`}`
    else first += `${first ? ' con ' : 'Con '}${amount ? `${AMOUNT_TEXT[amount]} de ` : ''}${f}`
  }
  const parts = [first.trim(), extra.trim()].filter(Boolean).map((p) => (/[.!?…]$/.test(p) ? p : `${p}.`))
  return parts.length ? parts.join(' ').slice(0, 500) : null
}

/** Un grupo de opciones donde solo se elige una (tocar otra vez la quita). */
function Choice({ label, options, value, onChange }: { label: string; options: string[]; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <div className="cooking__group">
      <p className="mood-label">{label}</p>
      <div className="mood-chips">
        {options.map((o) => (
          <button key={o} type="button" className="mood-chip" aria-pressed={value === o} onClick={() => onChange(value === o ? null : o)}>
            {o}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function AddMeal() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const online = useOnline()
  const { jobs } = useOutbox()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [cooked, setCooked] = useState(false)
  const [how, setHow] = useState<string | null>(null)
  const [fat, setFat] = useState<string | null>(null)
  const [amount, setAmount] = useState<string | null>(null)
  const [extra, setExtra] = useState('')
  const [eatenAt, setEatenAt] = useState(() => toLocalInput(new Date()))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Las tiras grandes de Avo para la celebración, listas antes de guardar.
  useEffect(preloadHd, [])

  useEffect(() => {
    if (!file) return setPreview(null)
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!file || !user) return
    setBusy(true)
    setError(null)
    try {
      // Cómo queda la racha (antes de ponerla en la cola, para saber si es la primera de hoy). Solo si es de hoy.
      const cooking = cooked ? composeCooking(how, fat, fat === NO_FAT ? null : amount, extra) : null
      if (cooked && fat) rememberOil(user.id, fat)
      const streak = toDayParam(new Date(eatenAt)) === toDayParam(new Date()) ? streakAfterNewMeal(user.id, jobs) : null
      // Primero se guarda en el teléfono; la cola la sube (y el servidor la analiza) en cuanto hay señal.
      const job = await enqueueMeal({
        id: crypto.randomUUID(),
        userId: user.id,
        photo: await compressImage(file),
        eaten_at: new Date(eatenAt).toISOString(),
        note: note.trim() || null,
        cooking,
      })
      // ¡Lo logró! Confeti, su foto como plato y Avo comiendo; encima del detalle de la comida.
      const name = firstName(user.full_name)
      celebrateMeal({
        title: '¡Comida registrada!',
        streak,
        message: online
          ? `¡Buen provecho${name ? `, ${name}` : ''}! Avo ya está analizando tu foto.`
          : 'Quedó guardada en el teléfono. Avo la analiza en cuanto vuelva la señal.',
        photoUrl: URL.createObjectURL(job.photo),
      })
      navigate(`/comida/${job.id}`, { replace: true })
    } catch (err) {
      setError((err as Error).message)
      cheer('oops', 'No pude guardar la foto', { interrupt: true })
      setBusy(false)
    }
  }

  // Antes de la primera foto, el permiso para analizarla con IA.
  if (!user?.ai_consent_at)
    return (
      <Screen withTabBar>
        <TopBar onBack={() => navigate(-1)} />
        <PageHeader title="Registrar comida" compact />
        <AiConsentCard onDecline={() => navigate('/', { replace: true })} />
      </Screen>
    )

  return (
    <Screen withTabBar>
      <TopBar onBack={() => navigate(-1)} />
      <PageHeader title="Registrar comida" compact />
      <form className="app-stack" style={{ gap: 18 }} onSubmit={onSubmit}>
        <PhotoPicker
          previewUrl={preview}
          onSelect={(f) => {
            setFile(f)
            cheer('love', '¡Qué rico se ve!', { interrupt: true })
          }}
        />
        <TextField label="¿Cuándo comiste?" type="datetime-local" value={eatenAt} onChange={(e) => setEatenAt(e.target.value)} required />
        <TextField
          label="Nota (opcional)"
          multiline
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ej. sin azúcar, con una cucharada de aceite de oliva, me comí la mitad…"
          hint="Ayuda a la IA con lo que no se ve en la foto."
        />
        <VoiceButton context="nota" onText={(t) => setNote((n) => (n.trim() ? `${n.trimEnd()} ${t}` : t))} />
        <button
          type="button"
          className="mood-chip"
          style={{ justifySelf: 'start' }}
          aria-pressed={cooked}
          onClick={() => {
            if (!cooked && !fat && user) setFat(lastOil(user.id))
            setCooked(!cooked)
          }}
        >
          🍳 ¿Lo cocinaste tú?
        </button>
        {cooked && (
          <div className="cooking">
            <Choice label="¿Cómo?" options={HOW} value={how} onChange={setHow} />
            <Choice
              label="¿Con qué?"
              options={WITH}
              value={fat}
              onChange={(v) => {
                setFat(v)
                if (v === NO_FAT) setAmount(null)
              }}
            />
            {fat !== NO_FAT && <Choice label="¿Cuánto?" options={HOW_MUCH} value={amount} onChange={setAmount} />}
            <TextField label="¿Algo más? (crema, queso, azúcar…)" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Ej.: le eché crema y un poco de queso" maxLength={200} />
            <VoiceButton context="cocina" onText={(t) => setExtra((x) => (x.trim() ? `${x.trimEnd()} ${t}` : t))} />
          </div>
        )}
        {!online && <Notice tone="warning">Sin conexión: la comida se guarda en el teléfono y se analiza sola al volver la señal.</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" size="lg" fullWidth icon="check" loading={busy} disabled={!file}>
          {online ? 'Guardar y analizar' : 'Guardar en el teléfono'}
        </Button>
      </form>
      <CravingLink compact />
    </Screen>
  )
}
