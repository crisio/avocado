import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, Notice, PageHeader, PhotoPicker, Screen, Segmented, TextField, type SegmentedOption } from '@avocado/ui'
import { useAuth } from '../auth'
import { celebrateMeal } from '../components/Celebration'
import { Mascot } from '../components/Mascot'
import TopBar from '../components/TopBar'
import { api, ApiError } from '../lib/api'
import { addDays, firstName, formatNumber, startOfDay } from '../lib/format'
import { compressImage } from '../lib/image'
import { cheer, preloadHd, type Mood } from '../lib/mascot'
import { enqueueMeal, useOutbox } from '../lib/outbox'
import { useOnline } from '../lib/useOnline'
import type { Craving } from '../lib/types'

const VERDICT: Record<Craving['verdict'], { mood: Mood; title: string }> = {
  adelante: { mood: 'celebrate', title: '¡Date el gusto!' },
  un_poco: { mood: 'eat', title: 'Sí, una porción pequeña' },
  compartelo: { mood: 'love', title: 'Mejor compártelo' },
  mejor_no: { mood: 'think', title: 'Hoy, solo una probadita' },
}

const PORTIONS: SegmentedOption<number>[] = [
  { value: 1, label: 'Todo' },
  { value: 0.75, label: '¾', ariaLabel: 'Tres cuartos' },
  { value: 0.5, label: '½', ariaLabel: 'La mitad' },
  { value: 0.25, label: '¼', ariaLabel: 'Un cuarto' },
]
const PORTION_TEXT: Record<string, string> = { '1': 'todo', '0.75': 'tres cuartos', '0.5': 'la mitad', '0.25': 'un cuarto' }

/** "La mitad", "¾", "Unas probadas"… para la fracción que recomienda Avo. */
function fractionLabel(f: number) {
  if (f >= 0.99) return 'Todo'
  if (f <= 0.15) return 'Unas probadas'
  const known: Record<string, string> = { '0.75': '¾', '0.5': 'La mitad', '0.25': '¼', '0.33': '⅓' }
  return known[String(Math.round(f * 100) / 100)] ?? `${Math.round(f * 100)} %`
}

/** Avo dijo que la foto no es comida (o no supo qué es). */
const isNotFood = (c: Craving) => !c.name && c.calories === 0

const nearestPortion = (f: number) => PORTIONS.reduce((best, o) => (Math.abs(o.value - f) < Math.abs(best - f) ? o.value : best), 1)

/**
 * "¿Me lo como?": foto de un antojo → Avo dice cuántas calorías tiene y cuánto conviene comer según lo que lleva
 * hoy, su meta y la hora. No se registra; si al final se lo come, lo registra con un toque.
 */
export default function CravingPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  // Se intenta aunque la última petición haya fallado (es la forma de saber si volvió la señal); solo sin red segura no.
  const online = useOnline()
  const canSend = navigator.onLine
  const { jobs } = useOutbox()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Craving | null>(null)
  const [answer, setAnswer] = useState('')
  const [portion, setPortion] = useState(0.5)
  const [saving, setSaving] = useState(false)

  useEffect(preloadHd, [])
  useEffect(() => {
    if (!file) return setPreview(null)
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  async function ask(followUp?: { question: string; answer: string }) {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const day = startOfDay(new Date())
      const next = addDays(day, 1)
      // Comidas de hoy que siguen en el teléfono: el servidor aún no las conoce.
      const queued = jobs.filter(
        (j) => j.kind === 'meal' && j.userId === user?.id && Date.parse(j.eaten_at) >= day.getTime() && Date.parse(j.eaten_at) < next.getTime(),
      ).length
      const form = new FormData()
      form.set('photo', await compressImage(file), 'antojo.jpg')
      form.set('from', day.toISOString())
      form.set('to', next.toISOString())
      form.set('hour', String(new Date().getHours()))
      form.set('queued', String(queued))
      if (note.trim()) form.set('note', note.trim())
      if (followUp) {
        form.set('question', followUp.question)
        form.set('answer', followUp.answer)
      }
      const advice = await api<Craving>('/cravings', { method: 'POST', body: form, timeoutMs: 90_000 })
      setResult(advice)
      setAnswer('')
      setPortion(nearestPortion(advice.suggested_fraction))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      const timedOut = err instanceof ApiError && err.status === 0 && navigator.onLine
      setError(timedOut ? 'Avo tardó demasiado en contestar. Intenta de nuevo.' : (err as Error).message)
      cheer('oops', 'No pude verlo bien', { interrupt: true })
    }
    setBusy(false)
  }

  async function registerEaten() {
    if (!file || !user || !result || isNotFood(result)) return
    setSaving(true)
    try {
      const photo = await compressImage(file)
      const what = result.name ? ` (${result.name})` : ''
      const job = await enqueueMeal({
        id: crypto.randomUUID(),
        userId: user.id,
        photo,
        eaten_at: new Date().toISOString(),
        note: `Antojo${what}: me comí ${PORTION_TEXT[String(portion)]}.`,
      })
      const name = firstName(user.full_name)
      celebrateMeal({
        title: '¡Antojo registrado!',
        message: `Te diste el gusto con cabeza${name ? `, ${name}` : ''}. ¡Disfrútalo!`,
        photoUrl: URL.createObjectURL(photo),
      })
      navigate(`/comida/${job.id}`, { replace: true })
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  function startOver() {
    setResult(null)
    setFile(null)
    setNote('')
    setAnswer('')
    setError(null)
    window.scrollTo({ top: 0 })
  }

  return (
    <Screen withTabBar>
      <TopBar onBack={() => navigate(-1)} thinking={busy} />
      <PageHeader title="¿Me lo como?" compact />

      {!result ? (
        <form
          className="app-stack"
          style={{ gap: 18 }}
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            void ask()
          }}
        >
          <p className="craving__lead">Tómale foto a tu antojo y Avo te dice cuántas calorías tiene y cuánto te conviene. No se registra en tu día.</p>
          <PhotoPicker
            previewUrl={preview}
            onSelect={(f) => {
              setFile(f)
              cheer('eat', '¡Mmm! ¿Qué tenemos aquí?', { interrupt: true })
            }}
          />
          <TextField label="¿Qué es? (opcional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Ej. pastel de tres leches, una dona glaseada…" />
          {!online && <Notice tone="warning">Sin conexión: Avo necesita internet para ver tu antojo.</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" size="lg" fullWidth icon="chat" loading={busy} disabled={!file || !canSend}>
            Preguntarle a Avo
          </Button>
        </form>
      ) : (
        <Advice
          craving={result}
          photoUrl={preview}
          busy={busy}
          online={canSend}
          answer={answer}
          onAnswerChange={setAnswer}
          onAnswer={() => result.question && answer.trim() && ask({ question: result.question, answer: answer.trim() })}
          error={error}
        />
      )}

      {result && (
        <>
          {!isNotFood(result) && (
            <Card padding="lg">
              <h2 className="av-section-title">¿Te lo comiste?</h2>
              <Segmented label="Cuánto te comiste" options={PORTIONS} value={portion} onChange={setPortion} />
              <Button fullWidth icon="check" loading={saving} onClick={registerEaten}>
                Registrar {PORTION_TEXT[String(portion)]} en mi día
              </Button>
            </Card>
          )}
          <Button variant="ghost" icon="camera" onClick={startOver} disabled={busy}>
            Preguntar por otro antojo
          </Button>
        </>
      )}
    </Screen>
  )
}

interface AdviceProps {
  craving: Craving
  photoUrl: string | null
  busy: boolean
  online: boolean
  answer: string
  onAnswerChange: (value: string) => void
  onAnswer: () => void
  error: string | null
}

function Advice({ craving: c, photoUrl, busy, online, answer, onAnswerChange, onAnswer, error }: AdviceProps) {
  const verdict = VERDICT[c.verdict]
  // Avo hace su gesto unos segundos y luego se queda quieto, para leer con calma.
  const [still, setStill] = useState(false)
  useEffect(() => {
    setStill(false)
    const t = setTimeout(() => setStill(true), 3200)
    return () => clearTimeout(t)
  }, [c])
  const { consumed, goal, pending } = c.today
  const after = consumed + c.suggested_calories
  const notFood = isNotFood(c)

  return (
    <>
      {photoUrl && <img className="av-hero-photo" src={photoUrl} alt="Foto de tu antojo" />}
      <Card padding="lg" className="craving">
        <div className="craving__head">
          <Mascot size={96} play={notFood ? 'think' : verdict.mood} pose={still ? 3 : undefined} hd />
          <div className="craving__head-text">
            {c.name && (
              <span className="craving__eyebrow">
                {c.name}
                {c.portion_g ? ` · ${formatNumber(c.portion_g)} g` : ''}
              </span>
            )}
            <h2 className="craving__verdict">{notFood ? 'Mmm… ¿qué es?' : verdict.title}</h2>
          </div>
        </div>

        {!notFood && (
          <dl className="craving__numbers">
            <div>
              <dd>{formatNumber(c.calories)}</dd>
              <dt>kcal completo</dt>
            </div>
            <div className="craving__numbers-pick">
              <dd>{formatNumber(c.suggested_calories)}</dd>
              <dt>kcal · {fractionLabel(c.suggested_fraction).toLowerCase()}</dt>
            </div>
          </dl>
        )}

        {!notFood && pending > 0 && (
          <Notice tone="warning">
            {pending === 1 ? 'Tienes 1 comida de hoy que aún no se cuenta' : `Tienes ${pending} comidas de hoy que aún no se cuentan`} (se está
            analizando o no tiene análisis): en realidad llevas más.
          </Notice>
        )}
        {!notFood &&
          (goal ? (
            <Meter consumed={consumed} add={c.suggested_calories} goal={goal} label={fractionLabel(c.suggested_fraction)} after={after} approx={pending > 0} />
          ) : (
            <p className="craving__nogoal">
              Hoy llevas <strong>{formatNumber(consumed)} kcal</strong>. <Link to="/ajustes">Pon tu meta diaria</Link> y Avo te aconseja con más precisión.
            </p>
          ))}

        <p className="craving__message">{c.message}</p>
        {c.tips.length > 0 && (
          <ul className="craving__tips">
            {c.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        )}

        {c.question && (
          <form
            className="craving__question"
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              onAnswer()
            }}
          >
            <p>
              <strong>Avo pregunta:</strong> {c.question}
            </p>
            <div className="app-row">
              <TextField label="Tu respuesta" value={answer} onChange={(e) => onAnswerChange(e.target.value)} maxLength={300} />
              <Button type="submit" loading={busy} disabled={!answer.trim() || !online}>
                Responder
              </Button>
            </div>
          </form>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        <p className="av-nutrition__note">Estimación con IA. No se registró en tu día.</p>
      </Card>
    </>
  )
}

/** Barra del día: lo que llevas, lo que sumaría el antojo y dónde está tu meta. */
function Meter({ consumed, add, goal, label, after, approx }: { consumed: number; add: number; goal: number; label: string; after: number; approx: boolean }) {
  const scale = Math.max(goal, after) * 1.04
  const pct = (n: number) => `${Math.min(100, (n / scale) * 100)}%`
  const left = goal - after
  return (
    <div className="craving-meter">
      <div
        className="craving-meter__bar"
        role="img"
        aria-label={`Llevas ${formatNumber(consumed)} de ${formatNumber(goal)} kcal. Con ${label.toLowerCase()} quedarías en ${formatNumber(after)}.`}
      >
        <span className="craving-meter__consumed" style={{ width: pct(consumed) }} />
        <span className="craving-meter__add" style={{ left: pct(consumed), width: pct(add) }} />
        <span className="craving-meter__goal" style={{ left: pct(goal) }} />
      </div>
      <div className="craving-meter__legend" aria-hidden="true">
        <span>
          <i className="craving-meter__key craving-meter__key--consumed" />
          Llevas {formatNumber(consumed)}
        </span>
        <span>
          <i className="craving-meter__key craving-meter__key--add" />+{formatNumber(add)}
        </span>
        <span>Meta {formatNumber(goal)}</span>
      </div>
      <p className="craving-meter__summary">
        {left >= 0 ? (
          <>
            Te quedarían {approx ? 'como máximo ' : ''}
            <strong>{formatNumber(left)} kcal</strong> para el resto del día.
          </>
        ) : (
          <>
            Te pasarías <strong>{formatNumber(-left)} kcal</strong> de tu meta.
          </>
        )}
      </p>
    </div>
  )
}
