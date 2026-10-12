/** Tipo de comida: define el color de fondo de su tarjeta y de su segmento en la barra de calorías. */
export type MealKind = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export const MEAL_COLORS: Record<MealKind, string> = {
  breakfast: 'var(--av-meal-breakfast)',
  lunch: 'var(--av-meal-lunch)',
  dinner: 'var(--av-meal-dinner)',
  snack: 'var(--av-meal-snack)',
}
