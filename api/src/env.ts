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
}

export type AppEnv = { Bindings: Env; Variables: { user: User; sessionHash: string } }
