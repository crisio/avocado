import { useState } from 'react'
import { Chip, Segmented, type SegmentedOption } from '@avocado/ui'
import { api } from '../lib/api'
import { formatNumber } from '../lib/format'
import type { AnalysisItem, Meal, Totals } from '../lib/types'

const OPTIONS: SegmentedOption<number>[] = [
  { value: 1, label: 'Todo' },
  { value: 0.75, label: '¾', ariaLabel: 'Tres cuartos' },
  { value: 0.5, label: '½', ariaLabel: 'La mitad' },
  { value: 0.25, label: '¼', ariaLabel: 'Un cuarto' },
  { value: 0, label: 'Nada' },
]

const FRACTION_TEXT: Record<string, string> = { '0.75': '¾', '0.5': 'la mitad', '0.25': '¼', '0': 'nada' }

const eatenOf = (item: AnalysisItem) => item.eaten ?? 1

/** Totales de lo comido y de lo servido, igual que los calcula la API (para pintar al instante). */
function totalsOf(items: AnalysisItem[]) {
  const sum = (useEaten: boolean): Totals => {
    const t = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    for (const item of items) {
      const f = useEaten ? eatenOf(item) : 1
      t.calories += item.calories * f
      t.protein_g += item.protein_g * f
      t.carbs_g += item.carbs_g * f
      t.fat_g += item.fat_g * f
    }
    return t
  }
  return { total: sum(true), served: sum(false) }
}

export interface PortionsProps {
  meal: Meal
  /** El dueño puede marcar cuánto comió de cada alimento. */
  editable: boolean
  online: boolean
  /** Comida actualizada (al instante y luego con la respuesta del servidor). */
  onChange: (meal: Meal) => void
}

/**
 * Lo que se comió de una comida: totales, y por cada alimento cuánto se comió (Todo · ¾ · ½ · ¼ · Nada).
 * La nutrióloga lo ve igual, sin poder cambiarlo.
 */
export default function Portions({ meal, editable, online, onChange }: PortionsProps) {
  const [saving, setSaving] = useState(false)
  const a = meal.analysis
  const items = a?.items ?? []
  const consumed: Totals = { calories: meal.calories ?? 0, protein_g: meal.protein_g ?? 0, carbs_g: meal.carbs_g ?? 0, fat_g: meal.fat_g ?? 0 }
  const served = a?.served ?? consumed
  const leftover = served.calories - consumed.calories >= 1
  const percent = served.calories > 0 ? Math.round((consumed.calories / served.calories) * 100) : 100

  async function setEaten(index: number, value: number) {
    const previous = meal
    const nextItems = items.map((item, i) => (i === index ? { ...item, eaten: value } : item))
    const { total, served } = totalsOf(nextItems)
    // Se ve al instante; si el servidor falla, se regresa a como estaba.
    onChange({ ...meal, calories: total.calories, protein_g: total.protein_g, carbs_g: total.carbs_g, fat_g: total.fat_g, analysis: { ...a, items: nextItems, total, served } })
    setSaving(true)
    try {
      onChange(await api<Meal>(`/meals/${meal.id}/portions`, { method: 'PATCH', json: { eaten: nextItems.map(eatenOf) } }))
    } catch (err) {
      onChange(previous)
      alert((err as Error).message)
    }
    setSaving(false)
  }

  const cells = [
    { value: formatNumber(consumed.calories), label: 'kcal' },
    { value: `${Math.round(consumed.protein_g)} g`, label: 'proteína' },
    { value: `${Math.round(consumed.carbs_g)} g`, label: 'carbs' },
    { value: `${Math.round(consumed.fat_g)} g`, label: 'grasa' },
  ]

  return (
    <div className="portions">
      <dl className="av-nutrition__totals" style={{ margin: 0 }}>
        {cells.map((c) => (
          <div key={c.label}>
            <dd className="av-nutrition__total-value" style={{ margin: 0 }}>
              {c.value}
            </dd>
            <dt className="av-nutrition__total-label">{c.label}</dt>
          </div>
        ))}
      </dl>

      {leftover && (
        <p className="portions__leftover">
          {editable ? 'Comiste' : 'Comió'} <strong>{percent} %</strong> de lo servido ({formatNumber(served.calories)} kcal).
        </p>
      )}

      {items.length > 0 && (
        <ul className="portions__items">
          {items.map((item, i) => {
            const f = eatenOf(item)
            const itemKcal = item.calories * f
            return (
              <li key={i} className="portions__item">
                <div className="portions__row">
                  <span className="portions__name">
                    {item.name}
                    <span className="portions__portion"> · {Math.round(item.portion_g)} g</span>
                  </span>
                  <span className="portions__kcal">
                    {f < 1 ? `${formatNumber(itemKcal)} de ${formatNumber(item.calories)}` : formatNumber(item.calories)} kcal
                  </span>
                </div>
                {editable ? (
                  <Segmented
                    label={`Cuánto comiste de ${item.name}`}
                    options={OPTIONS}
                    value={OPTIONS.some((o) => o.value === f) ? f : null}
                    onChange={(v) => setEaten(i, v)}
                    disabled={saving || !online}
                  />
                ) : (
                  f < 1 && (
                    <div>
                      <Chip tone="warning">Comió {FRACTION_TEXT[String(f)] ?? `${Math.round(f * 100)} %`}</Chip>
                    </div>
                  )
                )}
              </li>
            )
          })}
        </ul>
      )}

      {editable && !online && <p className="portions__hint">Sin conexión: podrás ajustar las porciones cuando vuelva la señal.</p>}
      <p className="av-nutrition__note">
        Estimación con IA{a?.confidence ? ` (confianza ${Math.round(a.confidence * 100)} %)` : ''}. Puede tener errores.
        {a?.correction && <> Corregida con: “{a.correction}”.</>}
      </p>
    </div>
  )
}
