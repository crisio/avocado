import { Chip } from './Chip'

export interface MacroChipsProps {
  /** Proteína en gramos. */
  protein: number
  /** Carbohidratos en gramos. */
  carbs: number
  /** Grasa en gramos. */
  fat: number
}

/** Los tres macronutrientes del día como chips ("82 g proteína · 130 g carbs · 41 g grasa"). */
export function MacroChips({ protein, carbs, fat }: MacroChipsProps) {
  const items = [
    { value: protein, label: 'proteína' },
    { value: carbs, label: 'carbs' },
    { value: fat, label: 'grasa' },
  ]
  return (
    <ul className="av-macro-chips" aria-label="Macronutrientes">
      {items.map((m) => (
        <li key={m.label}>
          <Chip>
            <strong>{Math.round(m.value)} g</strong> {m.label}
          </Chip>
        </li>
      ))}
    </ul>
  )
}
