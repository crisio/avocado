import { Link } from 'react-router-dom'
import { Card } from '@avocado/ui'
import { STREAK_MILESTONES, type LiveStreak } from '../lib/streak'
import Flame from './Flame'

const DAY_INITIAL = ['D', 'L', 'M', 'M', 'J', 'V', 'S'] // getDay(): 0 = domingo
const DAY_NAME = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

const days = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`
const dateOf = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Fueguito con la racha, debajo del saludo de "Mi día" (o en el día del paciente, para la nutrióloga). */
export function StreakChip({ streak, self = true }: { streak: LiveStreak; self?: boolean }) {
  const { current, loggedToday } = streak
  const text =
    current === 0
      ? self
        ? 'Empieza tu racha hoy'
        : 'Sin racha por ahora'
      : loggedToday
        ? `${days(current)} seguidos`
        : self
          ? `${days(current)} · ¡registra hoy para seguir!`
          : `${days(current)} · hoy aún no registra`
  const content = (
    <>
      <Flame size={22} lit={loggedToday} />
      <span>
        {current > 0 && <strong className="streak-chip__count">{current}</strong>}
        {current > 0 ? text.slice(String(current).length) : text}
      </span>
    </>
  )
  const className = `streak-chip${loggedToday ? '' : ' streak-chip--out'}`
  return self ? (
    <Link to="/semana" className={className} aria-label={`Racha: ${text}. Ver tu semana.`}>
      {content}
    </Link>
  ) : (
    <span className={className} aria-label={`Racha: ${text}`}>
      {content}
    </span>
  )
}

/** Tarjeta de la racha en "Tu semana": la racha actual, la mejor y los fueguitos de los últimos 7 días. */
export function StreakCard({ streak, self = true }: { streak: LiveStreak; self?: boolean }) {
  const { current, best, loggedToday, week } = streak
  const next = STREAK_MILESTONES.find((m) => m > current)
  const hint =
    current === 0
      ? self
        ? 'Registra una comida hoy y empieza tu racha.'
        : 'Hoy puede empezar una racha nueva.'
      : !loggedToday
        ? self
          ? `Registra algo hoy para llegar a ${days(current + 1)}.`
          : `Si registra hoy, llega a ${days(current + 1)}.`
        : next
          ? `${self ? 'Te faltan' : 'Le faltan'} ${days(next - current)} para llegar a ${next}.`
          : '¡Racha legendaria!'

  return (
    <Card padding="lg" className="streak-card">
      <div className="streak-card__head">
        <Flame size={58} lit={current > 0} />
        <div className="streak-card__text">
          <span className="streak-card__value">
            {current} <span className="streak-card__unit">{current === 1 ? 'día seguido' : 'días seguidos'}</span>
          </span>
          <span className="av-text-muted">
            {self ? 'Tu mejor racha' : 'Su mejor racha'}: {days(best)}
          </span>
        </div>
      </div>
      <ol className="streak-week" aria-label="Últimos 7 días">
        {week.map((d, i) => {
          const date = dateOf(d.date)
          const isToday = i === week.length - 1
          return (
            <li key={d.date} className={`streak-week__day${isToday ? ' streak-week__day--today' : ''}`}>
              <Flame size={24} lit={d.logged} />
              <span className="streak-week__label" aria-hidden="true">
                {isToday ? 'Hoy' : DAY_INITIAL[date.getDay()]}
              </span>
              <span className="sr-only">
                {isToday ? 'Hoy' : DAY_NAME[date.getDay()]}: {d.logged ? 'con registro' : 'sin registro'}
              </span>
            </li>
          )
        })}
      </ol>
      <p className="streak-card__hint">{hint}</p>
    </Card>
  )
}
