import { Button } from '@avocado/ui'
import Gif from './Gif'
import { api } from '../lib/api'
import { formatTime } from '../lib/format'
import { feelingOf, notifyMoodsChanged, planLabel } from '../lib/moods'
import type { Mood } from '../lib/types'

/** Un registro de ánimo en el día: cómo se sintió, su energía, si iba con su plan, su nota y el consejo de Avo. */
export default function MoodCard({ mood, own }: { mood: Mood; own: boolean }) {
  async function remove() {
    if (!confirm('¿Borrar este registro de cómo te sentías?')) return
    await api(`/moods/${mood.id}`, { method: 'DELETE' }).catch((err) => alert(err.message))
    notifyMoodsChanged()
  }

  return (
    <div className="mood-entry">
      <span className="av-meal-card__meta">
        {formatTime(mood.felt_at)} · Cómo {own ? 'te sentías' : 'se sentía'}
        {mood.meal_id ? ' después de comer' : ''}
      </span>
      <div className="mood-entry__feelings">
        {mood.feelings.map((key) => {
          const f = feelingOf(key)
          return (
            <span key={key} className="mood-tag">
              <span aria-hidden>{f.emoji}</span> {f.label}
            </span>
          )
        })}
        {mood.energy !== null && <span className="mood-tag mood-tag--soft">Energía {mood.energy}/5</span>}
        {mood.on_plan && <span className={`mood-tag mood-tag--soft mood-tag--plan-${mood.on_plan}`}>{planLabel(mood.on_plan, own)}</span>}
      </div>
      {mood.note && <p className="app-note">“{mood.note}”</p>}
      {mood.advice && (
        <p className="mood-entry__advice">
          <strong>Avo:</strong> {mood.advice.message}
        </p>
      )}
      {own && mood.advice?.gif && <Gif gif={mood.advice.gif} />}
      {own && (
        <div>
          <Button variant="ghost" onClick={remove}>
            Borrar
          </Button>
        </div>
      )}
    </div>
  )
}
