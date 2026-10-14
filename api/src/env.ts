export interface Env {
  DB: D1Database
  PHOTOS: R2Bucket
  APP_URL: string
  ALLOWED_ORIGINS: string
  EMAIL_MODE: 'resend' | 'smtp' | 'log'
  EMAIL_FROM: string
  /** Modelos de visión de OpenRouter, separados por coma: el primero es el principal, los demás de respaldo. */
  AI_MODELS: string
  // Secretos
  AUTH_SECRET: string
  RESEND_API_KEY?: string
  GMAIL_USER?: string
  GMAIL_APP_PASSWORD?: string
  OPENROUTER_API_KEY?: string
  /** Solo para desarrollo: otra URL compatible con OpenRouter (p. ej. un simulador local para probar la app sin gastar). */
  OPENROUTER_URL?: string
  /** Cuenta para la revisión de la App Store: ese correo entra con REVIEW_CODE (6 dígitos) y no se le manda correo. */
  REVIEW_EMAIL?: string
  REVIEW_CODE?: string
}

export interface User {
  id: string
  email: string
  full_name: string | null
  role: 'patient' | 'nutritionist' | null
  /** Meta diaria de calorías (opcional). */
  daily_kcal_goal: number | null
  /** Cuándo aceptó que sus fotos y notas se analicen con IA de terceros (null = no ha aceptado). */
  ai_consent_at: string | null
  /** Objetivo: bajar de peso, mantener o subir (volumen); define la comida libre (ver budget.ts). */
  goal: 'bajar' | 'mantener' | 'subir' | null
  /** Metas de macros al día, en gramos (las pone la nutrióloga). */
  protein_g_goal: number | null
  carbs_g_goal: number | null
  fat_g_goal: number | null
  /** Nutrióloga que fijó las metas: mientras estén vinculados, el paciente no las cambia. */
  goals_set_by: string | null
}

/** Columnas del usuario que viajan con la sesión y en /me. */
export const USER_COLUMNS = 'id, email, full_name, role, daily_kcal_goal, ai_consent_at, goal, protein_g_goal, carbs_g_goal, fat_g_goal, goals_set_by'

export type AppEnv = { Bindings: Env; Variables: { user: User; sessionHash: string } }
