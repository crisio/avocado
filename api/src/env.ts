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
  /** Clave de la API de GIPHY para los GIF de Avo (sin ella, Avo contesta igual pero sin GIF). */
  GIPHY_API_KEY?: string
  /** Web Push (VAPID): la pública va en vars; la privada es secreto. Sin ellas no hay recordatorios en la web. */
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
  VAPID_SUBJECT?: string
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
  /** Personalidad de Avo: picante (sarcástico, con memes y GIF) o tranquilo. */
  avo_style: 'picante' | 'tranquilo'
  /** Recordatorios a la hora de comer (ver reminders.ts). */
  reminders: boolean
  /** Último offset conocido del teléfono (minutos, como getTimezoneOffset). */
  tz_offset: number | null
  /** Ayuno intermitente: horas de ayuno del plan (16 = 16:8), null = sin ayuno. Ver fasting.ts. */
  fasting_hours: number | null
  /** Hora local "HH:MM" en que abre su ventana de comida. */
  eating_start: string | null
  /** "Empecé mi ayuno a las…" (ISO), por si no registró su última comida. */
  fast_started_at: string | null
}

/** Columnas del usuario que viajan con la sesión y en /me. */
export const USER_COLUMNS = 'id, email, full_name, role, daily_kcal_goal, ai_consent_at, goal, protein_g_goal, carbs_g_goal, fat_g_goal, goals_set_by, avo_style, reminders, tz_offset, fasting_hours, eating_start, fast_started_at'

/** La fila de la base trae los booleanos como 0/1. */
export const toUser = <T extends { reminders: unknown }>(row: T) => ({ ...row, reminders: Boolean(row.reminders) })

export type AppEnv = { Bindings: Env; Variables: { user: User; sessionHash: string } }
