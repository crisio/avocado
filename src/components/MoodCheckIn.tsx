import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Icon, Notice } from '@avocado/ui'
import { useAuth } from '../auth'
import { api } from '../lib/api'
import { cheer } from '../lib/mascot'
import { FEELINGS, notifyMoodsChanged } from '../lib/moods'
import { useOnline } from '../lib/useOnline'
import type { Feeling, Mood } from '../lib/types'
import { Mascot } from './Mascot'
import Swipeable from './Swipeable'

/** Después de registrar o quitar la tarjeta, no vuelve a aparecer en Mi día por un rato. */
const HIDE_MS = 3 * 3_600_000

const hiddenKey = (userId: string) => `avocado.moodHiddenUntil.${userId}`
function hiddenUntil(userId: string) {
  try {
    return Number(localStorage.getItem(hiddenKey(userId))) || 0
  } catch {
    return 0
  }
}
function hideForAWhile(userId: string) {
  try {
    localStorage.setItem(hiddenKey(userId), String(Date.now() + HIDE_MS))
  } catch {
    // almacenamiento no disponible: solo se quita en esta visita
  }
}

/**
 * "¿Cómo te sientes?" en un toque: una fila de emojis; al tocar uno se guarda y Avo te aconseja según la hora, tu
 * última comida y cómo te has sentido. Lo ve tu nutrióloga. La tarjeta se quita deslizándola (o con la ✕); en Mi día
 * (`remember`) no vuelve a salir por 3 horas. Para contar más (energía, si vas con tu plan…), el chat con Avo.
 */
export default function MoodCheckIn({ mealId, title = '¿Cómo te sientes?', remember = !mealId }: { mealId?: string; title?: string; remember?: boolean }) {
  const { user } = useAuth()
  const online = useOnline()
  const [sending, setSending] = useState<Feeling | null>(null)
  const [saved, setSaved] = useState<Mood | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(() => remember && !!user && hiddenUntil(user.id) > Date.now())

  if (!user || dismissed) return null

  function dismiss() {
    if (remember && user) hideForAWhile(user.id)
    setDismissed(true)
  }

  async function pick(feeling: Feeling) {
    if (sending || !user) return
    setSending(feeling)
    setError(null)
    if (user.ai_consent_at) cheer('think', 'Déjame pensar…', { interrupt: true })
    try {
      const mood = await api<Mood>('/moods', {
        method: 'POST',
        json: { id: crypto.randomUUID(), feelings: [feeling], meal_id: mealId ?? null, advise: true, offset: new Date().getTimezoneOffset() },
        timeoutMs: 60_000,
      })
      setSaved(mood)
      if (remember) hideForAWhile(user.id)
      notifyMoodsChanged()
      cheer(feeling === 'bien' ? 'celebrate' : 'love', '¡Anotado!', { interrupt: true })
    } catch (err) {
      setError((err as Error).message)
      cheer('oops', 'No pude guardarlo', { interrupt: true })
    }
    setSending(null)
  }

  const close = (
    <button type="button" className="mood-close" onClick={dismiss} aria-label="Quitar esta tarjeta">
      <Icon name="close" size={18} />
    </button>
  )

  if (saved)
    return (
      <Swipeable onDismiss={dismiss}>
        <Card padding="lg" as="section" aria-label="Consejo de Avo" className="mood-card">
          <div className="mood-advice">
            <Mascot size={56} play={saved.feelings.includes('bien') ? 'celebrate' : 'love'} pose={3} />
            <div className="app-stack" style={{ gap: 4, flex: 1 }}>
              <div className="mood-card__head">
                <h2 className="av-section-title">¡Anotado!</h2>
                {close}
              </div>
              {saved.advice ? (
                <p style={{ margin: 0 }}>{saved.advice.message}</p>
              ) : user.ai_consent_at ? (
                <p className="av-text-muted" style={{ margin: 0 }}>
                  Quedó guardado y tu nutrióloga lo verá.
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
          <p className="av-nutrition__note">
            {saved.advice ? 'Consejo con IA: puede equivocarse y no es consejo médico. ' : ''}Desliza la tarjeta para quitarla.
          </p>
        </Card>
      </Swipeable>
    )

  return (
    <Swipeable onDismiss={dismiss}>
      <Card padding="md" as="section" aria-labelledby="animo-titulo" className="mood-card">
        <div className="mood-card__head">
          <h2 id="animo-titulo" className="av-section-title">
            {title}
          </h2>
          {close}
        </div>
        <div className="mood-row" role="group" aria-label="Toca cómo te sientes">
          {FEELINGS.map((f) => (
            <button
              key={f.key}
              type="button"
              className="mood-pick"
              aria-label={f.label}
              aria-busy={sending === f.key}
              data-sending={sending === f.key || undefined}
              disabled={!!sending || !online}
              onClick={() => void pick(f.key)}
            >
              <span className="mood-pick__emoji" aria-hidden>
                {f.emoji}
              </span>
              <span className="mood-pick__label" aria-hidden>
                {f.short}
              </span>
            </button>
          ))}
        </div>
        {sending && <p className="av-nutrition__note">Avo está pensando…</p>}
        {!online && <Notice tone="warning">Sin conexión: necesitas internet para guardarlo.</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
      </Card>
    </Swipeable>
  )
}
