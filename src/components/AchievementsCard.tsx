import { Link } from 'react-router-dom'
import { Card, Icon } from '@avocado/ui'
import { useAchievements } from '../lib/achievements'

/** "Tus logros" en Mi día: retos de la semana con su avance y cuántas medallas lleva. Se oculta si no carga. */
export default function AchievementsCard() {
  const { data } = useAchievements()
  if (!data) return null
  const challenges = data.challenges.slice(0, 2)
  return (
    <Link to="/logros" className="logros-link" aria-label={`Tus logros: ${data.summary.unlocked} de ${data.summary.total} medallas`}>
    <Card padding="md" className="logros-card">
      <div className="logros-card__head">
        <strong>Tus logros</strong>
        <span className="av-text-muted">
          🏅 {data.summary.unlocked} de {data.summary.total} medallas
        </span>
        <Icon name="chevron-right" className="craving-link__chevron" />
      </div>
      {challenges.map((c) => (
        <div key={c.key} className="logros-card__row">
          <span>
            {c.emoji} {c.title} · {c.done ? '✅' : `${Math.min(c.progress, c.target)}/${c.target}`}
          </span>
          <Bar value={c.progress} max={c.target} done={c.done} />
        </div>
      ))}
    </Card>
    </Link>
  )
}

export function Bar({ value, max, done = false, thin = false }: { value: number; max: number; done?: boolean; thin?: boolean }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <span className={`logro-bar${thin ? ' logro-bar--thin' : ''}${done ? ' logro-bar--done' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)}>
      <span style={{ width: `${pct}%` }} />
    </span>
  )
}
