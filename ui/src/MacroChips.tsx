import { Chip } from './Chip'

export interface MacroChipsProps {
  /** Proteína en gramos. */
  protein: number
  /** Carbohidratos en gramos. */
  carbs: number
  /** Grasa en gramos. */
  fat: number
  /** Metas en gramos (opcionales). Con meta el chip dice "74 / 120 g"; sin ella, solo "74 g". */
  goals?: { protein?: number | null; carbs?: number | null; fat?: number | null }
}

/** Los tres macronutrientes del día como chips ("82 g proteína · 130 g carbs · 41 g grasa"). */
export function MacroChips({ protein, carbs, fat, goals }: MacroChipsProps) {
  const items = [
    { value: protein, goal: goals?.protein, label: 'proteína' },
    { value: carbs, goal: goals?.carbs, label: 'carbs' },
    { value: fat, goal: goals?.fat, label: 'grasa' },
  ]
  return (
    <ul className="av-macro-chips" aria-label="Macronutrientes">
      {items.map((m) => (
        <li key={m.label}>
          <Chip>
            <strong>{m.goal ? `${Math.round(m.value)} / ${Math.round(m.goal)} g` : `${Math.round(m.value)} g`}</strong> {m.label}
          </Chip>
        </li>
      ))}
    </ul>
  )
}
