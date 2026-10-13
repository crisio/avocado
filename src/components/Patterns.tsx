import { useState } from 'react'
import { Button, Card, Notice } from '@avocado/ui'
import { api } from '../lib/api'
import { addDays } from '../lib/format'
import { cheer } from '../lib/mascot'
import { duration, feelingOf, moodStats, timingStats } from '../lib/moods'
import { formatTime } from '../lib/format'
import { useCachedApi } from '../lib/useCachedApi'
import { useOnline } from '../lib/useOnline'
import type { Insights, Meal, Mood } from '../lib/types'
import { Mascot } from './Mascot'

const DAY_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/**
 * Patrones de la semana para entender cómo come y mejorar qué y a qué hora: horarios (primera y última comida, el hueco
 * más largo, comidas tarde), cómo se sintió, y lo que encuentra Avo con la IA al pedírselo.
 */
export default function Patterns({ userId, self, start, meals }: { userId: string; self: boolean; start: Date; meals: Meal[] }) {
  const online = useOnline()
  const end = addDays(start, 7)
  const range = `user_id=${userId}&from=${start.toISOString()}&to=${end.toISOString()}`
  const moods = useCachedApi<Mood[]>(`/moods?${range}`, 60_000).data ?? []
  const [insights, setInsights] = useState<Insights | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const timing = timingStats(meals)
  const feel = moodStats(moods)

  async function ask() {
    setBusy(true)
    setError(null)
    cheer('think', 'Déjame revisar tu semana…', { interrupt: true })
    try {
      setInsights(await api<Insights>(`/insights?${range}&offset=${new Date().getTimezoneOffset()}`, { timeoutMs: 90_000 }))
      cheer('celebrate', '¡Listo!', { interrupt: true })
    } catch (err) {
      setError((err as Error).message)
      cheer('oops', 'No pude revisarla', { interrupt: true })
    }
    setBusy(false)
  }

  return (
    <Card padding="lg" as="section" aria-labelledby="patrones">
      <h2 id="patrones" className="av-section-title week-card-title">
        {self ? 'Tus' : 'Sus'} patrones
      </h2>
      <ul className="week-insights">
        {timing && (
          <>
            <li>
              <span className="week-insights__icon" aria-hidden>
                🌅
              </span>
              <span>
                Primera comida a las <strong>{timing.first}</strong> y última a las <strong>{timing.last}</strong>, en promedio.
              </span>
            </li>
            {timing.longest && timing.longest.minutes >= 60 && (
              <li>
                <span className="week-insights__icon" aria-hidden>
                  ⏳
                </span>
                <span>
                  Lo más que {self ? 'pasaste' : 'pasó'} sin comer en el día: <strong>{duration(timing.longest.minutes)}</strong> (el{' '}
                  {DAY_LONG[new Date(timing.longest.from.eaten_at).getDay()]} desde las {formatTime(timing.longest.from.eaten_at)}).
                </span>
              </li>
            )}
            {timing.late > 0 && (
              <li>
                <span className="week-insights__icon" aria-hidden>
                  🌙
                </span>
                <span>
                  <strong>{timing.late}</strong> {timing.late === 1 ? 'comida' : 'comidas'} después de las 9 de la noche.
                </span>
              </li>
            )}
          </>
        )}
        {feel ? (
          <>
            <li>
              <span className="week-insights__icon" aria-hidden>
                {feelingOf(feel.top[0][0]).emoji}
              </span>
              <span>
                Lo que más {self ? 'sentiste' : 'sintió'}:{' '}
                {feel.top.map(([f, n], i) => (
                  <span key={f}>
                    {i > 0 && ', '}
                    <strong>{feelingOf(f).label.toLowerCase()}</strong> ({n})
                  </span>
                ))}
                .
              </span>
            </li>
            {(feel.energy !== null || feel.onPlan) && (
              <li>
                <span className="week-insights__icon" aria-hidden>
                  ⚡️
                </span>
                <span>
                  {feel.energy !== null && (
                    <>
                      Energía promedio <strong>{Math.round(feel.energy * 10) / 10}/5</strong>.{' '}
                    </>
                  )}
                  {feel.onPlan && (
                    <>
                      Con {self ? 'tu' : 'su'} plan <strong>{feel.onPlan.yes}</strong> de {feel.onPlan.total} {feel.onPlan.total === 1 ? 'vez' : 'veces'}.
                    </>
                  )}
                </span>
              </li>
            )}
          </>
        ) : (
          <li>
            <span className="week-insights__icon" aria-hidden>
              💬
            </span>
            <span className="av-text-muted">
              {self ? 'Registra cómo te sientes en Mi día para ver aquí tus patrones de ánimo.' : 'Aún no registra cómo se siente esta semana.'}
            </span>
          </li>
        )}
      </ul>

      {insights ? (
        <div className="app-stack" style={{ gap: 10 }}>
          <div className="mood-advice">
            <Mascot size={56} play="celebrate" pose={3} />
            <p style={{ margin: 0 }}>
              <strong>{insights.summary}</strong>
            </p>
          </div>
          <ul className="patterns-list">
            {insights.patterns.map((p) => (
              <li key={p.title}>
                <strong>{p.title}.</strong> {p.detail}
              </li>
            ))}
          </ul>
          {insights.suggestions.length > 0 && (
            <>
              <h3 className="mood-label">Para la próxima semana</h3>
              <ul className="craving__tips">
                {insights.suggestions.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </>
          )}
          <p className="av-nutrition__note">Análisis con IA: puede equivocarse y no es consejo médico.</p>
        </div>
      ) : (
        <>
          {error && <Notice tone="error">{error}</Notice>}
          <Button variant="secondary" icon="chat" loading={busy} disabled={!online} onClick={ask}>
            Que Avo encuentre {self ? 'mis' : 'sus'} patrones
          </Button>
        </>
      )}
    </Card>
  )
}
