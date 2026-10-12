export type Role = 'patient' | 'nutritionist'

export interface User {
  id: string
  email: string
  full_name: string | null
  role: Role | null // null hasta terminar el registro
}

export type Person = Pick<User, 'id' | 'email' | 'full_name'>

export interface AnalysisItem {
  name: string
  portion_g: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export interface Analysis {
  items?: AnalysisItem[]
  total?: { calories: number; protein_g: number; carbs_g: number; fat_g: number }
  meal_type?: string
  summary?: string
  confidence?: number
  model?: string
  error?: string
}

export interface Meal {
  id: string
  user_id: string
  eaten_at: string
  photo_url: string
  note: string | null
  status: 'pending' | 'analyzed' | 'error'
  analysis: Analysis | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  created_at: string
  /** Comentario más reciente (solo en la lista del día). */
  last_comment?: { body: string; author_name: string | null; author_role: Role | null; created_at: string } | null
}

export interface MealComment {
  id: string
  meal_id: string
  author_id: string
  body: string
  created_at: string
  author_name: string | null
  author_role: Role | null
}

export interface MealWithComments extends Meal {
  comments: MealComment[]
}
