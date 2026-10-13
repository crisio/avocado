import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Notice, Segmented, TextField, type SegmentedOption } from '@avocado/ui'
import { useAuth } from '../auth'
import { api } from '../lib/api'
import { cheer } from '../lib/mascot'
import { FEELINGS, notifyMoodsChanged, PLANS } from '../lib/moods'
import { useOnline } from '../lib/useOnline'
import type { Feeling, Mood, OnPlan } from '../lib/types'
import { Mascot } from './Mascot'

const ENERGY: SegmentedOption<number>[] = [1, 2, 3, 4, 5].map((n) => ({
  value: n,
  label: String(n),
  ariaLabel: `Energía ${n} de 5`,
}))
const PLAN_OPTIONS: SegmentedOption<OnPlan>[] = PLANS

/**
 * "¿Cómo te sientes?" en un toque: eliges cómo te sientes (puedes elegir varios) y, si quieres, tu energía, si vas con tu
 * plan y una nota. Avo te aconseja según la hora, tu última comida y cómo te has sentido. Lo ve tu nutrióloga.
 */
export default function MoodCheckIn({ mealId, title = '¿Cómo te sientes?' }: { mealId?: string; title?: string }) {
  const { user } = useAuth()
  const online = useOnline()
  const [feelings, setFeelings] = useState<Feeling[]>([])
  const [energy, setEnergy] = useState<number | null>(null)
  const [plan, setPlan] = useState<OnPlan | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<Mood | null>(null)

  const toggle = (f: Feeling) => setFeelings((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]))

  function reset() {
    setFeelings([])
    setEnergy(null)
    setPlan(null)
    setNote('')
    setSaved(null)
    setError(null)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!feelings.length) return
    setBusy(true)
    setError(null)
    if (user?.ai_consent_at) cheer('think', 'Déjame pensar…', { interrupt: true })
    try {
      const mood = await api<Mood>('/moods', {
        method: 'POST',
        json: {
          id: crypto.randomUUID(),
          feelings,
          energy,
          on_plan: plan,
          note: note.trim() || null,
          meal_id: mealId ?? null,
          advise: true,
          offset: new Date().getTimezoneOffset(),
        },
        timeoutMs: 60_000,
      })
      setSaved(mood)
      notifyMoodsChanged()
      cheer(feelings.includes('bien') ? 'celebrate' : 'love', '¡Anotado!', {
        interrupt: true,
      })
    } catch (err) {
      setError((err as Error).message)
      cheer('oops', 'No pude guardarlo', { interrupt: true })
    }
    setBusy(false)
  }

  if (saved)
    return (
      <Card padding="lg" as="section" aria-labelledby="animo-titulo" className="mood-card">
        <div className="mood-advice">
          <Mascot size={64} play={saved.feelings.includes('bien') ? 'celebrate' : 'love'} pose={3} />
          <div className="app-stack" style={{ gap: 6 }}>
            <h2 id="animo-titulo" className="av-section-title">
              ¡Anotado!
            </h2>
            {saved.advice ? (
              <p style={{ margin: 0 }}>{saved.advice.message}</p>
            ) : user?.ai_consent_at ? (
              <p className="av-text-muted" style={{ margin: 0 }}>
                Avo no pudo darte un consejo ahorita, pero quedó guardado y tu nutrióloga lo verá.
              </p>
            ) : (
              <p className="av-text-muted" style={{ margin: 0 }}>
                Quedó guardado y tu nutrióloga lo verá. <Link to="/ajustes">Da permiso para la IA en Perfil</Link> y Avo te aconsejará.
              </p>
            )}
          </div>
        </div>
        {saved.advice && saved.advice.tips.length > 0 && (
          <ul className="craving__tips">
            {saved.advice.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        )}
        {saved.advice && (
          <p className="av-nutrition__note">Consejo con IA: puede equivocarse y no es consejo médico. Sigue las indicaciones de tu nutrióloga.</p>
        )}
        <Button variant="ghost" onClick={reset}>
          Registrar otra vez
        </Button>
      </Card>
    )

  return (
    <Card padding="lg" as="form" onSubmit={save} aria-labelledby="animo-titulo" className="mood-card">
      <h2 id="animo-titulo" className="av-section-title">
        {title}
      </h2>
      <div className="mood-chips" role="group" aria-label="Cómo te sientes (puedes elegir varios)">
        {FEELINGS.map((f) => (
          <button key={f.key} type="button" className="mood-chip" aria-pressed={feelings.includes(f.key)} onClick={() => toggle(f.key)}>
            <span aria-hidden>{f.emoji}</span> {f.label}
          </button>
        ))}
      </div>
      {feelings.length > 0 && (
        <>
          <div className="app-stack" style={{ gap: 6 }}>
            <span className="mood-label">Tu energía (1 = nada, 5 = a tope)</span>
            <Segmented label="Tu energía" options={ENERGY} value={energy} onChange={setEnergy} />
          </div>
          <div className="app-stack" style={{ gap: 6 }}>
            <span className="mood-label">¿Vas con tu plan?</span>
            <Segmented label="¿Vas con tu plan?" options={PLAN_OPTIONS} value={plan} onChange={setPlan} />
          </div>
          <TextField
            label="¿Algo más? (opcional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="Ej. dormí poco, mucho estrés en el trabajo…"
          />
          {!online && <Notice tone="warning">Sin conexión: necesitas internet para guardarlo.</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" fullWidth icon="check" loading={busy} disabled={!online}>
            {user?.ai_consent_at ? 'Guardar y pedirle consejo a Avo' : 'Guardar'}
          </Button>
        </>
      )}
    </Card>
  )
}
