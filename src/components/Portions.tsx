import { useEffect, useRef, useState } from 'react'
import { Chip, Segmented, type SegmentedOption } from '@avocado/ui'
import { api, type ApiError } from '../lib/api'
import { formatNumber } from '../lib/format'
import { cheer, type Mood } from '../lib/mascot'
import type { AnalysisItem, Meal, Totals } from '../lib/types'

const OPTIONS: SegmentedOption<number>[] = [
  { value: 1, label: 'Todo' },
  { value: 0.75, label: '¾', ariaLabel: 'Tres cuartos' },
  { value: 0.5, label: '½', ariaLabel: 'La mitad' },
  { value: 0.25, label: '¼', ariaLabel: 'Un cuarto' },
  { value: 0, label: 'Nada' },
]

const FRACTION_TEXT: Record<string, string> = { '0.75': '¾', '0.5': 'la mitad', '0.25': '¼', '0': 'nada' }

/** Lo que dice Avo al marcar cuánto se comió. */
const PORTION_CHEER: Record<string, [Mood, string]> = {
  '1': ['love', '¡Todo!'],
  '0.75': ['eat', '¡Casi todo!'],
  '0.5': ['eat', 'La mitad, anotado'],
  '0.25': ['eat', 'Solo un poquito'],
  '0': ['oops', '¿Nada de nada?'],
}

/** Espera tras el último toque antes de guardar: varios toques seguidos se mandan en una sola petición. */
const SAVE_DELAY_MS = 500

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

function withItems(meal: Meal, items: AnalysisItem[]): Meal {
  const { total, served } = totalsOf(items)
  return { ...meal, calories: total.calories, protein_g: total.protein_g, carbs_g: total.carbs_g, fat_g: total.fat_g, analysis: { ...meal.analysis, items, total, served } }
}

export interface PortionsProps {
  meal: Meal
  /** El dueño puede marcar cuánto comió de cada alimento. */
  editable: boolean
  online: boolean
  /** Bloquea los cambios (p. ej. mientras la IA corrige la comida). */
  locked?: boolean
  /** Comida actualizada (al instante y luego con la respuesta del servidor). */
  onChange: (meal: Meal) => void
  /** Avisa cuando hay porciones sin guardar o guardándose. */
  onSavingChange?: (saving: boolean) => void
  /** La comida cambió en el servidor (409): hay que volver a pedirla. */
  onStale?: () => void
}

/**
 * Lo que se comió de una comida: totales, y por cada alimento cuánto se comió (Todo · ¾ · ½ · ¼ · Nada).
 * Cada toque se ve al instante; se guarda medio segundo después del último. La nutrióloga lo ve sin poder cambiarlo.
 */
export default function Portions({ meal, editable, online, locked = false, onChange, onSavingChange, onStale }: PortionsProps) {
  const a = meal.analysis
  const items = a?.items ?? []

  // Última versión confirmada por el servidor (para regresar a ella si falla) y cambios por guardar.
  const confirmed = useRef(meal)
  const pending = useRef<AnalysisItem[] | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const inFlight = useRef(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!pending.current && !inFlight.current) confirmed.current = meal
  }, [meal])
  useEffect(() => onSavingChange?.(saving), [saving])
  useEffect(() => () => clearTimeout(timer.current), [])

  async function flush() {
    const next = pending.current
    if (!next || inFlight.current) return
    pending.current = null
    inFlight.current = true
    try {
      const saved = await api<Meal>(`/meals/${meal.id}/portions`, {
        method: 'PATCH',
        json: { eaten: next.map(eatenOf), items: next.map((i) => i.name) },
      })
      confirmed.current = saved
      // Si hubo más toques mientras se guardaba, se respetan los de la pantalla y se guardan después.
      if (!pending.current) onChange(saved)
    } catch (err) {
      pending.current = null
      clearTimeout(timer.current)
      onChange(confirmed.current)
      if ((err as ApiError).status === 409) onStale?.()
      cheer('oops', 'No se guardó', { interrupt: true })
      alert((err as Error).message)
    }
    inFlight.current = false
    if (pending.current) flush()
    else setSaving(false)
  }

  function setEaten(index: number, value: number) {
    const base = pending.current ?? items
    const nextItems = base.map((item, i) => (i === index ? { ...item, eaten: value } : item))
    pending.current = nextItems
    onChange(withItems(meal, nextItems))
    const [mood, message] = PORTION_CHEER[String(value)] ?? ['eat', 'Anotado']
    cheer(mood, message, { interrupt: true })
    setSaving(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_DELAY_MS)
  }

  const consumed: Totals = { calories: meal.calories ?? 0, protein_g: meal.protein_g ?? 0, carbs_g: meal.carbs_g ?? 0, fat_g: meal.fat_g ?? 0 }
  const served = a?.served ?? consumed
  const leftover = served.calories - consumed.calories >= 1
  const percent = served.calories > 0 ? Math.round((consumed.calories / served.calories) * 100) : 100

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
            return (
              <li key={i} className="portions__item">
                <div className="portions__row">
                  <span className="portions__name">
                    {item.name}
                    <span className="portions__portion"> · {Math.round(item.portion_g)} g</span>
                  </span>
                  <span className="portions__kcal">
                    {f < 1 ? `${formatNumber(item.calories * f)} de ${formatNumber(item.calories)}` : formatNumber(item.calories)} kcal
                  </span>
                </div>
                {editable ? (
                  <Segmented
                    label={`Cuánto comiste de ${item.name}`}
                    options={OPTIONS}
                    value={OPTIONS.some((o) => o.value === f) ? f : null}
                    onChange={(v) => setEaten(i, v)}
                    disabled={locked || !online}
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
      {editable && saving && (
        <p className="portions__hint" role="status">
          Guardando…
        </p>
      )}
      <p className="av-nutrition__note">
        Estimación con IA{a?.confidence ? ` (confianza ${Math.round(a.confidence * 100)} %)` : ''}: puede equivocarse y no es consejo médico. Sigue las indicaciones de tu
        nutrióloga.
        {a?.correction && <> Corregida con: “{a.correction}”.</>}
      </p>
    </div>
  )
}
