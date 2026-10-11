export type Role = 'patient' | 'nutritionist'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: Role
}

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
  photo_path: string
  note: string | null
  status: 'pending' | 'analyzed' | 'error'
  analysis: Analysis | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  created_at: string
}

export interface MealComment {
  id: string
  meal_id: string
  author_id: string
  body: string
  created_at: string
  author?: Pick<Profile, 'full_name' | 'role'> | null
}
