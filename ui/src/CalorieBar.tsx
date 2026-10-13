import { MEAL_COLORS, type MealKind } from './meal'

export interface CalorieSegment {
  /** Calorías de esta comida. */
  value: number
  /** Tipo de comida (define el color). */
  kind: MealKind
  /** Nombre para lectores de pantalla ("Desayuno"). */
  label: string
}

export interface CalorieBarProps {
  /** Calorías consumidas en el día. */
  total: number
  /** Meta diaria (la define la nutrióloga). Sin meta, la barra se escala al total. */
  goal?: number
  /** Una porción por comida, en el orden del día. */
  segments: CalorieSegment[]
}

const fmt = (n: number) => Math.round(n).toLocaleString('es-MX')

/**
 * Resumen de calorías del día: número grande, meta y lo que falta, y una barra dividida por comida
 * (cada segmento con el color de su tipo de comida).
 */
export function CalorieBar({ total, goal, segments }: CalorieBarProps) {
  const scale = Math.max(goal ?? 0, total, 1)
  const remaining = goal ? goal - Math.round(total) : null
  const summary = segments.map((s) => `${s.label} ${fmt(s.value)} kcal`).join(', ')
  return (
    <div className="av-calorie-bar">
      <div className="av-calorie-bar__numbers">
        <span className="av-calorie-bar__total">
          {fmt(total)}
          <span className="av-calorie-bar__unit"> kcal</span>
        </span>
        {goal ? (
          <span className="av-calorie-bar__goal">
            Meta {fmt(goal)} ·{' '}
            <strong>{remaining! >= 0 ? `faltan ${fmt(remaining!)}` : `${fmt(-remaining!)} de más`}</strong>
          </span>
        ) : null}
      </div>
      <div className="av-calorie-bar__track" role="img" aria-label={summary || 'Sin comidas registradas'}>
        {segments
          .filter((s) => s.value > 0)
          .map((s, i) => (
            <div key={i} className="av-calorie-bar__segment" style={{ width: `${(s.value / scale) * 100}%`, background: MEAL_COLORS[s.kind] }} />
          ))}
        <div className="av-calorie-bar__rest" />
      </div>
    </div>
  )
}
