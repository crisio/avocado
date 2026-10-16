import { Card } from '@avocado/ui'
import { useAuth } from '../auth'
import { useFasting } from '../lib/fasting'
import { formatHours } from '../lib/format'

const DAY = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

/** "Tus ayunos": horas de los últimos 7 ayunos contra la meta, y el resumen. */
export default function FastingWeek() {
  const { user } = useAuth()
  const { data } = useFasting(user?.id, user?.role === 'patient')
  if (!data || (!data.plan && data.history.length === 0)) return null

  const fasts = data.history.slice(0, 7).reverse()
  const goal = data.plan?.hours ?? null
  const scale = Math.max(1, ...fasts.map((f) => f.hours), goal ?? 0) * 1.15
  const { average_hours, longest_hours, met_last_7 } = data.stats

  return (
    <Card padding="lg" as="section" aria-labelledby="tus-ayunos">
      <h2 id="tus-ayunos" className="av-section-title week-card-title">
        Tus ayunos
      </h2>
      {fasts.length === 0 ? (
        <p className="av-text-muted" style={{ margin: 0 }}>
          Aún no hay ayunos completos. Aparecerán aquí cuando pases 8 horas o más sin comer.
        </p>
      ) : (
        <>
          <div className="week-chart">
            <div className="week-chart__plot" style={{ height: 120, gridTemplateColumns: `repeat(${fasts.length}, 1fr)` }}>
              {goal && <div className="week-chart__avg" style={{ bottom: `${(goal / scale) * 100}%` }} aria-hidden />}
              {fasts.map((f) => (
                <div key={f.start} className="week-chart__col" style={{ cursor: 'default' }}>
                  <span className="week-chart__value" style={{ bottom: `${(f.hours / scale) * 100}%` }}>
                    {formatHours(f.hours)}
                  </span>
                  <span className="week-chart__bar" style={{ height: `${(f.hours / scale) * 100}%`, opacity: f.met === false ? 0.45 : 1 }} />
                </div>
              ))}
            </div>
            <div className="week-chart__axis" style={{ gridTemplateColumns: `repeat(${fasts.length}, 1fr)` }} aria-hidden>
              {fasts.map((f) => (
                <span key={f.start} className="week-chart__day">
                  {DAY[new Date(f.end).getDay()]}
                </span>
              ))}
            </div>
            {goal && (
              <p className="week-chart__key" aria-hidden>
                <span className="week-chart__key-line" /> Tu meta de {goal} h
              </p>
            )}
          </div>
          <p className="av-text-muted week-card-foot">
            Promedio {formatHours(average_hours)} h · Más largo {formatHours(longest_hours)} h
            {goal ? ` · Cumpliste ${met_last_7} de ${Math.min(7, fasts.length)}` : ''}
          </p>
        </>
      )}
    </Card>
  )
}
