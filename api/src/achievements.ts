import { Hono } from 'hono'
import { toUser, USER_COLUMNS, type AppEnv, type Env, type User } from './env'
import { canSee } from './access'
import { fail } from './errors'
import { streakFrom } from './streaks'
import { computeFasting } from './fasting'

/**
 * Logros: medallas por constancia y hábitos (una vez ganadas se quedan), dos retos por semana hechos a la medida de
 * cada quien y accesorios para Avo que se desbloquean con las medallas. Todo se calcula aquí con sus registros: la app
 * solo lo muestra.
 */

type Group = 'constancia' | 'registro' | 'habitos' | 'retos'

/** Lo que se cuenta de los registros de un paciente. */
export interface Stats {
  meals: number
  streakBest: number
  streakCurrent: number
  onTime: number
  breakfasts: number
  dinners: number
  fullDays: number
  moods: number
  chats: number
  cooked: number
  proteinDays: number
  goalDays: number
  fasts: number
  challenges: number
}

const MEDALS: { key: string; emoji: string; title: string; description: string; group: Group; target: number; value: (s: Stats) => number }[] = [
  { key: 'racha3', emoji: '🔥', title: 'Tres al hilo', description: '3 días seguidos registrando', group: 'constancia', target: 3, value: (s) => s.streakBest },
  { key: 'racha7', emoji: '🗓️', title: 'Semana completa', description: '7 días seguidos registrando', group: 'constancia', target: 7, value: (s) => s.streakBest },
  { key: 'racha14', emoji: '💪', title: 'Dos semanas', description: '14 días seguidos registrando', group: 'constancia', target: 14, value: (s) => s.streakBest },
  { key: 'racha30', emoji: '🏆', title: 'Mes de hierro', description: '30 días seguidos registrando', group: 'constancia', target: 30, value: (s) => s.streakBest },
  { key: 'primera', emoji: '📸', title: 'Primera foto', description: 'Registra tu primera comida', group: 'registro', target: 1, value: (s) => s.meals },
  { key: 'comidas25', emoji: '🍽️', title: '25 comidas', description: 'Registra 25 comidas', group: 'registro', target: 25, value: (s) => s.meals },
  { key: 'comidas100', emoji: '💯', title: '100 comidas', description: 'Registra 100 comidas', group: 'registro', target: 100, value: (s) => s.meals },
  { key: 'momento', emoji: '⏱️', title: 'En el momento', description: '10 fotos tomadas a la hora de comer', group: 'registro', target: 10, value: (s) => s.onTime },
  { key: 'desayunos', emoji: '🍳', title: 'Buen día', description: 'Registra 5 desayunos', group: 'registro', target: 5, value: (s) => s.breakfasts },
  { key: 'cenas', emoji: '🌙', title: 'Buenas noches', description: 'Registra 5 cenas', group: 'registro', target: 5, value: (s) => s.dinners },
  { key: 'diaCompleto', emoji: '🌞', title: 'Día completo', description: '3 días con desayuno, comida y cena', group: 'registro', target: 3, value: (s) => s.fullDays },
  { key: 'animo', emoji: '😊', title: 'Me conozco', description: 'Cuéntale a Avo cómo te sientes 5 veces', group: 'habitos', target: 5, value: (s) => s.moods },
  { key: 'chef', emoji: '🧑‍🍳', title: 'Chef', description: '5 comidas con «¿Lo cocinaste tú?»', group: 'habitos', target: 5, value: (s) => s.cooked },
  { key: 'chat', emoji: '💬', title: 'Compa de Avo', description: '10 mensajes a Avo', group: 'habitos', target: 10, value: (s) => s.chats },
  { key: 'proteina', emoji: '🥩', title: 'Proteína al día', description: 'Llega a tu meta de proteína 3 días', group: 'habitos', target: 3, value: (s) => s.proteinDays },
  { key: 'meta', emoji: '🎯', title: 'En la meta', description: '3 días entre el 90 y el 110 % de tu meta de calorías', group: 'habitos', target: 3, value: (s) => s.goalDays },
  { key: 'ayuno', emoji: '⏳', title: 'Ayuno cumplido', description: 'Cumple 3 ayunos de tu plan', group: 'habitos', target: 3, value: (s) => s.fasts },
  { key: 'reto1', emoji: '🥇', title: 'Primer reto', description: 'Cumple un reto de la semana', group: 'retos', target: 1, value: (s) => s.challenges },
  { key: 'reto4', emoji: '🏅', title: 'Retador', description: 'Cumple 4 retos de la semana', group: 'retos', target: 4, value: (s) => s.challenges },
  { key: 'reto12', emoji: '🎖️', title: 'Imparable', description: 'Cumple 12 retos de la semana', group: 'retos', target: 12, value: (s) => s.challenges },
]

/** Accesorios de Avo y la medalla que los desbloquea. slot: dónde va sobre Avo. */
export const ACCESSORIES: { key: string; emoji: string; name: string; slot: 'cabeza' | 'cara' | 'lado' | 'aura'; medal: string }[] = [
  { key: 'gorra', emoji: '🧢', name: 'Gorra', slot: 'cabeza', medal: 'primera' },
  { key: 'lentes', emoji: '🕶️', name: 'Lentes de sol', slot: 'cara', medal: 'racha3' },
  { key: 'flor', emoji: '🌸', name: 'Flor', slot: 'lado', medal: 'animo' },
  { key: 'mono', emoji: '🎀', name: 'Moño', slot: 'lado', medal: 'momento' },
  { key: 'sombrero', emoji: '👒', name: 'Sombrero', slot: 'cabeza', medal: 'desayunos' },
  { key: 'audifonos', emoji: '🎧', name: 'Audífonos', slot: 'cabeza', medal: 'chat' },
  { key: 'anteojos', emoji: '👓', name: 'Anteojos', slot: 'cara', medal: 'chef' },
  { key: 'birrete', emoji: '🎓', name: 'Birrete', slot: 'cabeza', medal: 'reto1' },
  { key: 'copa', emoji: '🎩', name: 'Sombrero de copa', slot: 'cabeza', medal: 'racha7' },
  { key: 'estrella', emoji: '⭐', name: 'Estrella', slot: 'aura', medal: 'comidas25' },
  { key: 'cohete', emoji: '🚀', name: 'Cohete', slot: 'aura', medal: 'meta' },
  { key: 'fuego', emoji: '🔥', name: 'Aura de fuego', slot: 'aura', medal: 'racha14' },
  { key: 'corona', emoji: '👑', name: 'Corona', slot: 'cabeza', medal: 'racha30' },
  { key: 'diamante', emoji: '💎', name: 'Diamante', slot: 'aura', medal: 'comidas100' },
]

const DAY = 86_400_000
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export interface AchievementMeal {
  eaten_at: string
  created_at: string
  status: string
  calories: number | null
  protein_g: number | null
  cooking: string | null
  meal_type: string | null
}

/** Desayuno, comida o cena: lo que dijo la IA o, si no, por la hora local. */
function kindOf(m: AchievementMeal, localMinutes: number) {
  if (m.meal_type === 'desayuno' || m.meal_type === 'comida' || m.meal_type === 'cena') return m.meal_type
  if (m.meal_type === 'snack' || m.meal_type === 'bebida') return null
  if (localMinutes >= 5 * 60 && localMinutes < 10 * 60 + 30) return 'desayuno'
  if (localMinutes >= 10 * 60 + 30 && localMinutes < 16 * 60) return 'comida'
  if (localMinutes >= 17 * 60 && localMinutes < 23 * 60 + 30) return 'cena'
  return null
}

/** Por día local: si registró, qué comidas, cuánta proteína y calorías. `from`/`to` en ms UTC (to excluido). */
function byDay(meals: AchievementMeal[], offset: number, from = 0, to = Number.POSITIVE_INFINITY) {
  const days = new Map<string, { kinds: Set<string>; protein: number; calories: number }>()
  for (const m of meals) {
    const ms = Date.parse(m.eaten_at)
    if (ms < from || ms >= to) continue
    const local = ms - offset * 60_000
    const day = isoDay(local)
    const d = days.get(day) ?? { kinds: new Set<string>(), protein: 0, calories: 0 }
    const kind = kindOf(m, Math.floor((local - Date.parse(`${day}T00:00:00Z`)) / 60_000))
    if (kind) d.kinds.add(kind)
    if (m.status === 'analyzed') {
      d.protein += m.protein_g ?? 0
      d.calories += m.calories ?? 0
    }
    days.set(day, d)
  }
  return days
}

export function computeStats(input: {
  meals: AchievementMeal[]
  moods: number
  chats: number
  challenges: number
  user: Pick<User, 'daily_kcal_goal' | 'protein_g_goal' | 'fasting_hours' | 'eating_start' | 'fast_started_at'>
  offset: number
  now: number
}): Stats {
  const { meals, user, offset, now } = input
  const days = byDay(meals, offset)
  const today = isoDay(now - offset * 60_000)
  const streak = streakFrom(new Set([...days.keys()].filter((d) => d <= today)), today)
  const all = [...days.values()]
  const fasting = user.fasting_hours
    ? computeFasting({ meals, fastStartedAt: null, hours: user.fasting_hours, eatingStart: user.eating_start, offset, now })
    : null
  const goal = user.daily_kcal_goal
  return {
    meals: meals.length,
    streakBest: streak.best,
    streakCurrent: streak.current,
    onTime: meals.filter((m) => Math.abs(Date.parse(m.created_at) - Date.parse(m.eaten_at)) < 30 * 60_000).length,
    breakfasts: all.filter((d) => d.kinds.has('desayuno')).length,
    dinners: all.filter((d) => d.kinds.has('cena')).length,
    fullDays: all.filter((d) => d.kinds.has('desayuno') && d.kinds.has('comida') && d.kinds.has('cena')).length,
    moods: input.moods,
    chats: input.chats,
    cooked: meals.filter((m) => m.cooking).length,
    proteinDays: user.protein_g_goal ? all.filter((d) => d.protein >= user.protein_g_goal!).length : 0,
    goalDays: goal ? [...days.entries()].filter(([day, d]) => day < today && d.calories >= goal * 0.9 && d.calories <= goal * 1.1).length : 0,
    fasts: fasting ? fasting.history.filter((f) => f.met).length : 0,
    challenges: input.challenges,
  }
}

export interface Challenge {
  key: string
  emoji: string
  title: string
  description: string
  progress: number
  target: number
  done: boolean
  ends_at: string
}

const MEAL_WORDS = {
  desayuno: { emoji: '🍳', plural: 'desayunos' },
  comida: { emoji: '🍽️', plural: 'comidas' },
  cena: { emoji: '🌙', plural: 'cenas' },
} as const

/**
 * Los dos retos de la semana (de lunes a domingo, hora local) que contienen `at`: uno de constancia, que sube si la
 * semana anterior le fue bien, y otro de su punto débil (su ayuno, su proteína o la comida que menos registra).
 * Se deciden con lo de antes del lunes, así no cambian a media semana.
 */
export function weekChallenges(meals: AchievementMeal[], user: Pick<User, 'protein_g_goal' | 'fasting_hours' | 'eating_start'>, offset: number, at: number) {
  const local = at - offset * 60_000
  const weekday = (new Date(local).getUTCDay() + 6) % 7 // lunes = 0
  const monday = Date.parse(`${isoDay(local)}T00:00:00Z`) - weekday * DAY + offset * 60_000 // en UTC
  const sunday = monday + 7 * DAY
  const week = isoDay(monday - offset * 60_000)

  const thisWeek = byDay(meals, offset, monday, sunday)
  const lastWeek = byDay(meals, offset, monday - 7 * DAY, monday)
  const before = byDay(meals, offset, monday - 14 * DAY, monday)

  const daysTarget = Math.min(7, Math.max(3, lastWeek.size + 1))
  const out: Challenge[] = [
    {
      key: `dias-${daysTarget}`,
      emoji: '📅',
      title: `Registra ${daysTarget} de 7 días`,
      description: lastWeek.size >= 3 ? `La semana pasada fueron ${lastWeek.size}: vamos por uno más.` : 'Una foto al día cuenta.',
      progress: Math.min(thisWeek.size, daysTarget),
      target: daysTarget,
      done: thisWeek.size >= daysTarget,
      ends_at: new Date(sunday).toISOString(),
    },
  ]

  if (user.fasting_hours) {
    const f = computeFasting({ meals, fastStartedAt: null, hours: user.fasting_hours, eatingStart: user.eating_start, offset, now: Math.min(at, sunday) })
    const met = f.history.filter((h) => h.met && Date.parse(h.end) >= monday && Date.parse(h.end) < sunday).length
    out.push({ key: 'ayuno-3', emoji: '⏳', title: 'Cumple tu ayuno 3 veces', description: `Tu plan ${user.fasting_hours}:${24 - user.fasting_hours}, tres veces esta semana.`, progress: Math.min(met, 3), target: 3, done: met >= 3, ends_at: new Date(sunday).toISOString() })
  } else if (user.protein_g_goal) {
    const hit = [...thisWeek.values()].filter((d) => d.protein >= user.protein_g_goal!).length
    out.push({ key: 'proteina-3', emoji: '🥩', title: 'Llega a tu proteína 3 días', description: `${user.protein_g_goal} g en un día, tres veces esta semana.`, progress: Math.min(hit, 3), target: 3, done: hit >= 3, ends_at: new Date(sunday).toISOString() })
  } else {
    // La comida que menos registró en las dos semanas anteriores (con empate, la cena: es la que más se olvida).
    const counts = (['cena', 'desayuno', 'comida'] as const).map((k) => ({ k, n: [...before.values()].filter((d) => d.kinds.has(k)).length }))
    const weak = counts.reduce((a, b) => (b.n < a.n ? b : a)).k
    const done = [...thisWeek.values()].filter((d) => d.kinds.has(weak)).length
    const w = MEAL_WORDS[weak]
    out.push({ key: `${weak}-3`, emoji: w.emoji, title: `Registra 3 ${w.plural}`, description: `Tu ${weak} también cuenta: tres esta semana.`, progress: Math.min(done, 3), target: 3, done: done >= 3, ends_at: new Date(sunday).toISOString() })
  }
  return { week, challenges: out }
}

async function load(env: Env, user: User) {
  const [meals, moods, chats] = await Promise.all([
    env.DB.prepare(
      `SELECT eaten_at, created_at, status, calories, protein_g, cooking, json_extract(analysis, '$.meal_type') AS meal_type
       FROM meals WHERE user_id = ? ORDER BY eaten_at`,
    )
      .bind(user.id)
      .all<AchievementMeal>(),
    env.DB.prepare('SELECT count(*) AS n FROM moods WHERE user_id = ?').bind(user.id).first<{ n: number }>(),
    env.DB.prepare("SELECT count(*) AS n FROM avo_messages WHERE user_id = ? AND role = 'user'").bind(user.id).first<{ n: number }>(),
  ])
  return { meals: meals.results, moods: moods?.n ?? 0, chats: chats?.n ?? 0 }
}

/** Calcula todo, guarda lo recién ganado (medallas y retos) y regresa lo que ve la app. */
export async function achievementsOf(env: Env, user: User, offset: number, now = Date.now()) {
  const { meals, moods, chats } = await load(env, user)

  // Retos: los de esta semana y los de la pasada (por si la cumplió sin abrir la app).
  const current = weekChallenges(meals, user, offset, now)
  const previous = weekChallenges(meals, user, offset, now - 7 * DAY)
  const wins = [
    ...current.challenges.filter((c) => c.done).map((c) => [current.week, c.key]),
    ...previous.challenges.filter((c) => c.done).map((c) => [previous.week, c.key]),
  ]
  if (wins.length)
    await env.DB.batch(wins.map(([week, key]) => env.DB.prepare('INSERT OR IGNORE INTO challenge_wins (user_id, week, key) VALUES (?, ?, ?)').bind(user.id, week, key)))
  const challengeCount = (await env.DB.prepare('SELECT count(*) AS n FROM challenge_wins WHERE user_id = ?').bind(user.id).first<{ n: number }>())?.n ?? 0

  const stats = computeStats({ meals, moods, chats, challenges: challengeCount, user, offset, now })
  const earned = MEDALS.filter((m) => m.value(stats) >= m.target)
  if (earned.length)
    await env.DB.batch(earned.map((m) => env.DB.prepare('INSERT OR IGNORE INTO achievements (user_id, key) VALUES (?, ?)').bind(user.id, m.key)))
  const { results } = await env.DB.prepare('SELECT key, unlocked_at FROM achievements WHERE user_id = ?').bind(user.id).all<{ key: string; unlocked_at: string }>()
  const unlocked = new Map(results.map((r) => [r.key, r.unlocked_at]))

  const medals = MEDALS.map(({ value, ...m }) => ({ ...m, progress: Math.min(value(stats), m.target), unlocked_at: unlocked.get(m.key) ?? null }))
  return {
    medals,
    challenges: current.challenges,
    accessories: ACCESSORIES.map(({ medal, ...a }) => ({ ...a, unlocked: unlocked.has(medal), requirement: MEDALS.find((m) => m.key === medal)!.title })),
    equipped: user.avo_accessory,
    streak: { current: stats.streakCurrent, best: stats.streakBest },
    summary: { unlocked: medals.filter((m) => m.unlocked_at).length, total: medals.length },
  }
}

/** ¿Puede ponérselo? (la medalla que lo desbloquea ya está ganada). */
export async function accessoryUnlocked(env: Env, userId: string, key: string) {
  const accessory = ACCESSORIES.find((a) => a.key === key)
  if (!accessory) return null
  return Boolean(await env.DB.prepare('SELECT 1 AS x FROM achievements WHERE user_id = ? AND key = ?').bind(userId, accessory.medal).first())
}

export const achievementRoutes = new Hono<AppEnv>()

// ?offset= &user_id= (por defecto, el propio; o un paciente vinculado)
achievementRoutes.get('/', async (c) => {
  const userId = c.req.query('user_id') ?? c.var.user.id
  if (!(await canSee(c.env, c.var.user.id, userId))) fail(404, 'No encontrado')
  const offset = Number(c.req.query('offset') ?? 0)
  if (!Number.isInteger(offset) || Math.abs(offset) > 14 * 60) fail(400, 'offset inválido')
  const row = userId === c.var.user.id ? c.var.user : await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(userId).first<User>()
  if (!row) fail(404, 'No encontrado')
  return c.json(await achievementsOf(c.env, toUser(row), offset))
})
