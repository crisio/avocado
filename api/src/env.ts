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
}

export interface User {
  id: string
  email: string
  full_name: string | null
  role: 'patient' | 'nutritionist' | null
}

export type AppEnv = { Bindings: Env; Variables: { user: User; sessionHash: string } }
