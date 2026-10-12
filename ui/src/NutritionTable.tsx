export interface NutritionItem {
  /** Alimento ("Arroz blanco"). */
  name: string
  /** Porción estimada en gramos. */
  portion_g: number
  /** Calorías del alimento. */
  calories: number
}

export interface NutritionTableProps {
  /** Totales de la comida. */
  totals: { calories: number; protein_g: number; carbs_g: number; fat_g: number }
  /** Alimentos detectados. */
  items?: NutritionItem[]
  /** Nota al pie (p. ej. "Estimación con IA (confianza 82 %). Puede tener errores."). */
  note?: string
}

/** Desglose nutricional de una comida: 4 totales (kcal, proteína, carbs, grasa) y tabla de alimentos. */
export function NutritionTable({ totals, items = [], note }: NutritionTableProps) {
  const cells = [
    { value: Math.round(totals.calories), label: 'kcal' },
    { value: `${Math.round(totals.protein_g)} g`, label: 'proteína' },
    { value: `${Math.round(totals.carbs_g)} g`, label: 'carbs' },
    { value: `${Math.round(totals.fat_g)} g`, label: 'grasa' },
  ]
  return (
    <div className="av-nutrition">
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
      {items.length > 0 && (
        <table className="av-nutrition__items">
          <tbody>
            {items.map((item, i) => (
              <tr key={i}>
                <td>{item.name}</td>
                <td className="av-nutrition__portion">{Math.round(item.portion_g)} g</td>
                <td>{Math.round(item.calories)} kcal</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {note && <p className="av-nutrition__note">{note}</p>}
    </div>
  )
}
