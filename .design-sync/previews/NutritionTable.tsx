import { NutritionTable } from '@avocado/ui'

export const Full = () => (
  <div style={{ width: 360 }}>
    <NutritionTable
      totals={{ calories: 376, protein_g: 21, carbs_g: 29, fat_g: 19 }}
      items={[
        { name: 'Huevo revuelto', portion_g: 100, calories: 148 },
        { name: 'Aguacate', portion_g: 60, calories: 96 },
        { name: 'Pan integral', portion_g: 50, calories: 132 },
      ]}
      note="Estimación con IA (confianza 82 %). Puede tener errores."
    />
  </div>
)

export const TotalsOnly = () => (
  <div style={{ width: 360 }}>
    <NutritionTable totals={{ calories: 540, protein_g: 32, carbs_g: 48, fat_g: 22 }} />
  </div>
)
