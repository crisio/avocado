export type Role = 'patient' | 'nutritionist'

/** Personalidad de Avo que elige el paciente: picante (sarcástico, con memes y GIF) o tranquilo (amable). */
export type AvoStyle = 'picante' | 'tranquilo'

/** Un GIF de GIPHY. `webp` es animado (se muestra con <img>); `still` es el primer cuadro. */
export interface Gif {
  id: string
  webp: string
  mp4: string
  still: string
  width: number
  height: number
  title: string
}

export interface User {
  id: string
  email: string
  full_name: string | null
  role: Role | null // null hasta terminar el registro
  /** Meta diaria de calorías (opcional; la escribe el paciente en Perfil). */
  daily_kcal_goal?: number | null
  /** Cuándo aceptó que sus fotos y notas se analicen con IA (null o ausente = no ha aceptado). */
  ai_consent_at?: string | null
  /** Objetivo: bajar de peso, mantener o subir (volumen). Define la comida libre de la semana. */
  goal?: Goal | null
  /** Metas de macros en gramos (las puede fijar la nutrióloga). */
  protein_g_goal?: number | null
  carbs_g_goal?: number | null
  fat_g_goal?: number | null
  /** Id de la nutrióloga que fijó las metas (null = las puso el propio paciente). */
  goals_set_by?: string | null
  /** Personalidad de Avo (ausente = picante). */
  avo_style?: AvoStyle
}

export type Goal = 'bajar' | 'mantener' | 'subir'

/** Saldo de los últimos 7 días (sin hoy) y comida libre de hoy. Ver api/src/budget.ts. */
export interface Budget {
  goal: Goal | null
  daily_kcal_goal: number
  days: { date: string; consumed: number; meals: number; counted: boolean }[]
  /** Positivo = quedó por debajo de la meta en los días que cuentan. */
  balance: number
  /** Días incompletos (menos de 60 % de la meta registrada) que no cuentan. */
  skipped: number
  today_consumed: number
  /** Kcal extra para hoy: comida libre (bajar/mantener) o lo que conviene completar (subir). */
  extra: number
  today_budget: number
}

export type Person = Pick<User, 'id' | 'email' | 'full_name'>

export interface AnalysisItem {
  name: string
  portion_g: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  /** Fracción que se comió (1 = todo). Los análisis viejos no la traen: cuenta como 1. */
  eaten?: number
}

export type Totals = { calories: number; protein_g: number; carbs_g: number; fat_g: number }

export interface Analysis {
  items?: AnalysisItem[]
  /** Lo que se comió. */
  total?: Totals
  /** Lo que se sirvió (sin restar lo que sobró). */
  served?: Totals
  /** Última corrección del paciente ("me dejé la mitad…"). */
  correction?: string
  meal_type?: string
  summary?: string
  confidence?: number
  model?: string
  error?: string
  /** Lo que Avo dice de esta foto (las comidas viejas no lo traen). */
  avo?: { text: string; gif: Gif | null } | null
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

/** Consejo de Avo para un antojo ("¿Me lo como?"). No se guarda. */
export interface Craving {
  name: string
  portion_g: number
  /** De la porción completa de la foto. */
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  verdict: 'adelante' | 'un_poco' | 'compartelo' | 'mejor_no'
  /** Fracción que conviene comer (1 = todo). */
  suggested_fraction: number
  suggested_calories: number
  message: string
  tips: string[]
  /** Pregunta de Avo si no supo bien qué es (o null). */
  question: string | null
  gif: Gif | null
  confidence: number
  /** pending: comidas de hoy que aún no tienen calorías (analizándose, sin análisis o en el teléfono). */
  today: { consumed: number; meals: number; pending: number; goal: number | null; remaining: number | null }
}

/** Cómo se siente el paciente (lo ve su nutrióloga). Ver src/lib/moods.ts. */
export type Feeling = 'bien' | 'con_hambre' | 'con_antojo' | 'lleno' | 'ansioso' | 'cansado' | 'mal'
export type OnPlan = 'si' | 'a_medias' | 'no'

export interface MoodAdvice {
  message: string
  tips: string[]
  gif?: Gif | null
  model: string
}

export interface Mood {
  id: string
  user_id: string
  felt_at: string
  feelings: Feeling[]
  /** 1 (nada) a 5 (a tope). */
  energy: number | null
  /** ¿Va con el plan de su nutrióloga? */
  on_plan: OnPlan | null
  note: string | null
  /** La comida después de la que lo registró. */
  meal_id: string | null
  /** Consejo de Avo (solo con permiso para la IA). */
  advice: MoodAdvice | null
  created_at: string
}

/** Patrones de comida y ánimo que encuentra Avo (no se guardan). */
export interface Insights {
  summary: string
  patterns: { title: string; detail: string }[]
  suggestions: string[]
  model: string
}

/** Un mensaje de la conversación con Avo (la conversación es privada; lo que anota de ánimo lo ve su nutrióloga). */
export interface AvoMessage {
  id: string
  role: 'user' | 'avo'
  body: string
  /** El paciente lo dijo en un audio (body es la transcripción). */
  via_audio: boolean
  mood_id: string | null
  created_at: string
  gif: Gif | null
  /** Lo que Avo anotó de cómo se siente con este mensaje. */
  mood: Mood | null
}

/** Metas de un paciente tal como las devuelve PATCH /care/patients/:id/goals. */
export interface PatientGoals {
  daily_kcal_goal: number | null
  goal: Goal | null
  protein_g_goal: number | null
  carbs_g_goal: number | null
  fat_g_goal: number | null
  set_by_me: boolean
}

export type CareAlertKind = 'sin_registro' | 'mal' | 'fuera_plan' | 'arriba_meta'

/** Un paciente en el tablero de la nutrióloga (GET /care/dashboard). */
export interface CarePatient {
  id: string
  email: string
  full_name: string | null
  goals: PatientGoals
  today: { consumed: number; protein_g: number; carbs_g: number; fat_g: number; meals: number }
  last_meal_at: string | null
  last_mood: { feelings: Feeling[]; on_plan: OnPlan | null; felt_at: string } | null
  streak: { current: number; logged_today: boolean }
  week: { days_logged: number; avg_kcal: number | null; on_plan: { yes: number; total: number } | null }
  alerts: { kind: CareAlertKind; text: string }[]
}

/** Invitación de una nutrióloga (GET /care/invite). */
export interface CareInvite {
  code: string
  url: string
}
