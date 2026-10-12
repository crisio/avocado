import type { MealKind } from '@avocado/ui'
import type { Meal } from './types'
import { formatTime, kcal } from './format'

const KIND_FROM_AI: Record<string, MealKind> = { desayuno: 'breakfast', comida: 'lunch', cena: 'dinner', snack: 'snack', bebida: 'snack' }
const KIND_LABEL: Record<MealKind, string> = { breakfast: 'Desayuno', lunch: 'Comida', dinner: 'Cena', snack: 'Snack' }

/** Tipo de comida: el que detectó la IA o, si no hay, uno según la hora. */
export function mealKind(meal: Meal): MealKind {
  const fromAi = meal.analysis?.meal_type && KIND_FROM_AI[meal.analysis.meal_type]
  if (fromAi) return fromAi
  const hour = new Date(meal.eaten_at).getHours()
  if (hour < 11) return 'breakfast'
  if (hour < 16) return 'lunch'
  if (hour < 19) return 'snack'
  return 'dinner'
}

export const mealKindLabel = (kind: MealKind) => KIND_LABEL[kind]

export function mealTitle(meal: Meal) {
  if (meal.status === 'pending') return 'Analizando tu comida…'
  if (meal.status === 'error') return meal.note || 'Comida sin analizar'
  return meal.analysis?.summary || 'Comida'
}

export function mealMeta(meal: Meal) {
  return `${formatTime(meal.eaten_at)} · ${mealKindLabel(mealKind(meal))}`
}

export function mealDetail(meal: Meal) {
  if (meal.status !== 'analyzed') return undefined
  return `${kcal(meal.calories)} · ${Math.round(meal.protein_g ?? 0)} g proteína`
}
