import { Hono } from 'hono'
import type { AppEnv, Env, User } from './env'
import { canSee } from './access'
import { chat } from './ai'
import { fail } from './errors'
import { describeBudget, weekBudget } from './budget'
import { describeFasting } from './fasting'
import { findGif, type Gif } from './gifs'
import { avoVoice, CHATTY, GIF_FIELD, recentAvoLines } from './voice'

/**
 * "¿Cómo te sientes?": el paciente registra cómo se siente (con hambre, ansioso, lleno…), su energía y si va con el
 * plan de su nutrióloga. Su nutrióloga lo ve junto a sus comidas. Con permiso para la IA, Avo le aconseja en el momento
 * (según la hora, el día, su última comida y cómo se ha sentido) y encuentra sus patrones de la semana.
 */

export const FEELINGS = ['bien', 'con_hambre', 'con_antojo', 'lleno', 'ansioso', 'cansado', 'mal'] as const
export type Feeling = (typeof FEELINGS)[number]
const PLANS = ['si', 'a_medias', 'no'] as const

const FEELING_TEXT: Record<Feeling, string> = {
  bien: 'bien',
  con_hambre: 'con hambre',
  con_antojo: 'con antojo',
  lleno: 'lleno/a',
  ansioso: 'ansioso/a',
  cansado: 'cansado/a, con poca energía',
  mal: 'mal (con malestar)',
}
const PLAN_TEXT: Record<(typeof PLANS)[number], string> = { si: 'va con su plan', a_medias: 'va a medias con su plan', no: 'no va con su plan' }
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HOUR = 3_600_000
const DAY = 24 * HOUR

export interface MoodRow {
  id: string
  user_id: string
  felt_at: string
  feelings: string
  energy: number | null
  on_plan: (typeof PLANS)[number] | null
  note: string | null
  meal_id: string | null
  advice: string | null
  created_at: string
}

export interface Advice {
  message: string
  tips: string[]
  model: string
  /** GIF de GIPHY con que Avo remata (nunca si se siente mal o ansioso). */
  gif?: Gif | null
}

export const toMood = ({ feelings, advice, ...rest }: MoodRow) => ({
  ...rest,
  feelings: JSON.parse(feelings) as Feeling[],
  advice: advice ? (JSON.parse(advice) as Advice) : null,
})

function toIso(value: unknown, field: string) {
  const date = new Date(String(value ?? ''))
  if (Number.isNaN(date.getTime())) fail(400, `Fecha inválida: ${field}`)
  return date.toISOString()
}

/** Minutos de diferencia con UTC, como Date.getTimezoneOffset() en el teléfono. */
function offsetOf(value: unknown) {
  const offset = Number(value ?? 0)
  if (!Number.isInteger(offset) || Math.abs(offset) > 14 * 60) fail(400, 'offset inválido')
  return offset
}

/** "lunes 14:30" en la hora del teléfono. */
function localLabel(iso: string, offset: number) {
  const d = new Date(Date.parse(iso) - offset * 60_000)
  return `${WEEKDAYS[d.getUTCDay()]} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function ago(iso: string, now: number) {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000))
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.round(minutes / 6) / 10
  return hours < 24 ? `hace ${hours} h` : `hace ${Math.round(hours / 24)} días`
}

const describeMood = (m: { feelings: Feeling[]; energy: number | null; on_plan: MoodRow['on_plan']; note: string | null }) =>
  [
    m.feelings.map((f) => FEELING_TEXT[f] ?? f).join(', '),
    m.energy ? `energía ${m.energy}/5` : null,
    m.on_plan ? PLAN_TEXT[m.on_plan] : null,
    m.note ? `nota: "${m.note}"` : null,
  ]
    .filter(Boolean)
    .join('; ')

interface MealLine {
  eaten_at: string
  status: string
  calories: number | null
  note: string | null
  summary: string | null
}

const describeMeal = (m: MealLine) =>
  `${m.summary || m.note || 'comida sin descripción'}${m.status === 'analyzed' && m.calories ? ` (${Math.round(m.calories)} kcal)` : m.status !== 'analyzed' ? ' (sin calorías calculadas)' : ''}`

export const moodPrompt = (user: Pick<User, 'avo_style'>) => `Eres Avo, el compañero de nutrición de la app Avocado.
${avoVoice(user)}
El paciente acaba de contarte cómo se siente. Tu meta es ayudarle a entender sus patrones y a mejorar QUÉ come y A QUÉ HORA.
Usa el contexto: hora y día, cuánto hace de su última comida y qué fue, lo que lleva hoy contra su meta y cómo se ha sentido antes.
- Con hambre: si hace muchas horas que no come, sugiere una comida o snack equilibrado (proteína + fibra) acorde a la hora; si comió hace poco, ayúdale a distinguir hambre real de antojo o sed.
- Ansioso/a o con antojo: sin culpa; propone una pausa (agua, respirar, esperar 10 minutos) y una opción que sí le convenga si de verdad tiene hambre.
- Lleno/a o mal después de comer: relaciónalo con lo que comió (porción, frito, rápido) y sugiere qué cambiar la próxima vez; si el malestar es fuerte o se repite, que consulte a su médico.
- Cansado/a o con poca energía: revisa si lleva mucho sin comer o si comió muy pesado/azucarado; agua, proteína, descanso.
- Bien: felicítalo y refuerza lo que está haciendo bien (horarios, porciones).
- Si no va con su plan, anímale a retomarlo en la siguiente comida, sin regañar. Nunca contradigas el plan de su nutrióloga.
- Con antojo o ganas de algo rico: si tiene saldo para una comida libre (cheat meal), díselo y sugiere cómo usarlo bien; si no, una opción rica más ligera.
- Nunca uses "prohibido", "malo", "culpa" ni hables de quemar calorías con ejercicio. No des diagnósticos médicos.
"message": 1 a 3 frases, por su nombre, mencionando algo concreto del contexto (p. ej. "comiste hace 5 horas").
"tips": hasta 3 ideas cortas y prácticas para ahorita o para la próxima comida; lista vacía si no hacen falta.
${GIF_FIELD}
Responde SOLO con el JSON pedido.`

const ADVICE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['message', 'tips', 'gif'],
  properties: { message: { type: 'string' }, tips: { type: 'array', items: { type: 'string' } }, gif: { type: 'string' } },
}

/** Con la voz del paciente si él lo pide; para su nutrióloga, profesional. */
export const insightsPrompt = (voice: string) => `Eres Avo, el compañero de nutrición de la app Avocado.
${voice}
Te paso el registro de comidas y de cómo se sintió el paciente (hora local del teléfono). Encuentra sus PATRONES para que entienda cómo come y mejore qué come y a qué hora:
- Horarios: a qué hora hace su primera y su última comida, si se salta comidas, huecos largos sin comer, cenas tarde, días distintos (fin de semana).
- Relación comida ↔ cómo se siente: qué comidas van seguidas de sentirse lleno, mal, cansado o ansioso, y cuáles de sentirse bien.
- Si va con el plan de su nutrióloga y cuándo se le complica.
Básate SOLO en los datos; si son pocos, dilo y da lo que se pueda. Nada de culpa ni diagnósticos médicos.
"summary": 1 o 2 frases con lo más importante. "patterns": hasta 4, cada uno con "title" (corto) y "detail" (1 o 2 frases con datos concretos: horas, días, comidas).
"suggestions": hasta 3 cambios concretos y pequeños para la próxima semana (sobre todo de horarios y porciones).
Responde SOLO con el JSON pedido.`

const INSIGHTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'patterns', 'suggestions'],
  properties: {
    summary: { type: 'string' },
    patterns: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['title', 'detail'], properties: { title: { type: 'string' }, detail: { type: 'string' } } },
    },
    suggestions: { type: 'array', items: { type: 'string' } },
  },
}

function parseJson(text: string) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('La IA no regresó JSON')
  return JSON.parse(text.slice(start, end + 1))
}

const strings = (v: unknown, max: number) => (Array.isArray(v) ? v.map((t) => String(t).trim()).filter(Boolean).slice(0, max) : [])

/**
 * Lo que Avo sabe del paciente ahorita: su nombre, la hora y el día en su teléfono, lo que lleva hoy contra su meta,
 * sus últimas comidas (y hace cuánto) y cómo se ha sentido. Lo usan el consejo de ánimo y el chat con Avo.
 */
export async function patientContext(env: Env, user: User, offset: number, skipMoodId?: string) {
  const now = Date.now()
  const local = new Date(now - offset * 60_000)
  const dayStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + offset * 60_000
  const db = env.DB
  const [today, lastMeals, lastMoods, budget, fasting, week] = await Promise.all([
    db
      .prepare(
        `SELECT coalesce(sum(CASE WHEN status = 'analyzed' THEN calories END), 0) AS consumed, count(*) AS meals
         FROM meals WHERE user_id = ? AND eaten_at >= ? AND eaten_at < ?`,
      )
      .bind(user.id, new Date(dayStart).toISOString(), new Date(dayStart + DAY).toISOString())
      .first<{ consumed: number; meals: number }>(),
    db
      .prepare(
        `SELECT eaten_at, status, calories, note, json_extract(analysis, '$.summary') AS summary
         FROM meals WHERE user_id = ? AND eaten_at <= ? ORDER BY eaten_at DESC LIMIT 4`,
      )
      .bind(user.id, new Date(now + 5 * 60_000).toISOString())
      .all<MealLine>(),
    db
      .prepare('SELECT * FROM moods WHERE user_id = ? AND id <> ? ORDER BY felt_at DESC LIMIT 4')
      .bind(user.id, skipMoodId ?? '')
      .all<MoodRow>(),
    weekBudget(env, user, offset, now),
    describeFasting(env, user, offset, now),
    db
      .prepare('SELECT eaten_at, created_at FROM meals WHERE user_id = ? AND eaten_at >= ?')
      .bind(user.id, new Date(dayStart - 6 * DAY).toISOString())
      .all<{ eaten_at: string; created_at: string }>(),
  ])
  const consumed = Math.round(today?.consumed ?? 0)
  const goal = user.daily_kcal_goal
  const name = (user.full_name ?? '').trim().split(/\s+/)[0] || null
  return [
    name ? `Paciente: ${name}.` : null,
    `Ahora es ${localLabel(new Date(now).toISOString(), offset)} (hora del teléfono).`,
    `Hoy lleva ${consumed} kcal en ${today?.meals ?? 0} comidas registradas.${goal ? ` Su meta diaria es ${goal} kcal (le quedan ${goal - consumed}).` : ' No tiene meta diaria.'}`,
    describeBudget(budget),
    fasting,
    describeConsistency(week.results, offset),
    user.protein_g_goal || user.carbs_g_goal || user.fat_g_goal
      ? `Sus metas de macros al día: ${[
          user.protein_g_goal ? `${user.protein_g_goal} g de proteína` : null,
          user.carbs_g_goal ? `${user.carbs_g_goal} g de carbohidratos` : null,
          user.fat_g_goal ? `${user.fat_g_goal} g de grasa` : null,
        ]
          .filter(Boolean)
          .join(', ')}${user.goals_set_by ? ' (las puso su nutrióloga)' : ''}.`
      : null,
    lastMeals.results.length
      ? `Sus últimas comidas:\n${lastMeals.results.map((m) => `- ${localLabel(m.eaten_at, offset)} (${ago(m.eaten_at, now)}): ${describeMeal(m)}`).join('\n')}`
      : 'No ha registrado comidas todavía.',
    lastMoods.results.length
      ? `Cómo se ha sentido antes:\n${lastMoods.results.map((m) => `- ${localLabel(m.felt_at, offset)}: ${describeMood(toMood(m))}`).join('\n')}`
      : null,
  ].filter((line): line is string => Boolean(line))
}

/** Cuántos días de la última semana registró y si sube la foto en el momento: para que Avo se lo reconozca. */
function describeConsistency(meals: { eaten_at: string; created_at: string }[], offset: number) {
  if (!meals.length) return null
  const days = new Set(meals.map((m) => new Date(Date.parse(m.eaten_at) - offset * 60_000).toISOString().slice(0, 10))).size
  const onTime = meals.filter((m) => Math.abs(Date.parse(m.created_at) - Date.parse(m.eaten_at)) < 30 * 60_000).length / meals.length
  return `Constancia: registró comida ${days} de los últimos 7 días${onTime >= 0.7 ? ', casi siempre en el momento en que come' : ''}.${days >= 4 ? ' Reconóceselo de vez en cuando (sin exagerar).' : ''}`
}

/** Consejo de Avo para lo que siente ahorita, con el contexto del día y de lo que ha comido y sentido. */
async function adviseMood(env: Env, user: User, mood: ReturnType<typeof toMood>, offset: number): Promise<Advice> {
  const linked = mood.meal_id
    ? await env.DB.prepare(`SELECT eaten_at, status, calories, note, json_extract(analysis, '$.summary') AS summary FROM meals WHERE id = ?`)
        .bind(mood.meal_id)
        .first<MealLine>()
    : null
  const context = [
    ...(await patientContext(env, user, offset, mood.id)),
    linked ? `Lo registra después de esta comida: ${localLabel(linked.eaten_at, offset)}, ${describeMeal(linked)}.` : null,
    `Ahorita se siente: ${describeMood(mood)}.`,
    await recentAvoLines(env, user.id),
  ]
    .filter(Boolean)
    .join('\n')

  const { text, model } = await chat(
    env,
    [
      { role: 'system', content: moodPrompt(user) },
      { role: 'user', content: context },
    ],
    { type: 'json_schema', json_schema: { name: 'mood_advice', strict: true, schema: ADVICE_SCHEMA } },
    CHATTY,
  )
  const raw = parseJson(text)
  const message = String(raw.message ?? '').trim()
  if (!message) throw new Error('La IA no regresó consejo')
  const serious = mood.feelings.some((f) => f === 'mal' || f === 'ansioso')
  return { message, tips: strings(raw.tips, 3), model, gif: serious ? null : await findGif(env, raw.gif) }
}

/** Guarda un registro de ánimo ya validado y lo regresa. */
export async function insertMood(
  env: Env,
  userId: string,
  m: { id?: string; felt_at: string; feelings: Feeling[]; energy: number | null; on_plan: MoodRow['on_plan']; note: string | null; meal_id: string | null },
) {
  const id = m.id || crypto.randomUUID()
  await env.DB.prepare('INSERT INTO moods (id, user_id, felt_at, feelings, energy, on_plan, note, meal_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, userId, m.felt_at, JSON.stringify(m.feelings), m.energy, m.on_plan, m.note, m.meal_id)
    .run()
  return toMood((await env.DB.prepare('SELECT * FROM moods WHERE id = ?').bind(id).first<MoodRow>())!)
}

export const isFeeling = (f: unknown): f is Feeling => FEELINGS.includes(f as Feeling)
export const isPlan = (p: unknown): p is (typeof PLANS)[number] => PLANS.includes(p as (typeof PLANS)[number])

export const moodRoutes = new Hono<AppEnv>()

// Registrar cómo se siente. JSON: { id?, felt_at?, feelings: [...], energy?, on_plan?, note?, meal_id?, advise?, offset? }
moodRoutes.post('/', async (c) => {
  const user = c.var.user
  const body = await c.req.json<Record<string, unknown>>().catch(() => fail(400, 'JSON inválido'))

  const feelings = Array.isArray(body.feelings) ? [...new Set(body.feelings.map(String))] : []
  if (!feelings.length || feelings.some((f) => !FEELINGS.includes(f as Feeling))) fail(400, 'Elige cómo te sientes')
  const energy = body.energy === undefined || body.energy === null ? null : Number(body.energy)
  if (energy !== null && (!Number.isInteger(energy) || energy < 1 || energy > 5)) fail(400, 'La energía va de 1 a 5')
  const onPlan = body.on_plan === undefined || body.on_plan === null ? null : String(body.on_plan)
  if (onPlan !== null && !PLANS.includes(onPlan as (typeof PLANS)[number])) fail(400, 'on_plan inválido')
  const note = String(body.note ?? '').trim().slice(0, 500) || null
  const feltAt = body.felt_at ? toIso(body.felt_at, 'felt_at') : new Date().toISOString()
  const offset = offsetOf(body.offset)

  const mealId = body.meal_id ? String(body.meal_id) : null
  if (mealId) {
    const meal = await c.env.DB.prepare('SELECT user_id FROM meals WHERE id = ?').bind(mealId).first<{ user_id: string }>()
    if (!meal || meal.user_id !== user.id) fail(400, 'Esa comida no es tuya')
  }

  // id del teléfono: un reenvío (conexión cortada) no lo duplica.
  const clientId = body.id === undefined ? null : String(body.id)
  if (clientId !== null && !UUID.test(clientId)) fail(400, 'id inválido')
  if (clientId) {
    const existing = await c.env.DB.prepare('SELECT * FROM moods WHERE id = ?').bind(clientId).first<MoodRow>()
    if (existing) {
      if (existing.user_id !== user.id) fail(409, 'id en uso')
      return c.json(toMood(existing), 200)
    }
  }

  let mood = await insertMood(c.env, user.id, {
    id: clientId ?? undefined,
    felt_at: feltAt,
    feelings: feelings as Feeling[],
    energy,
    on_plan: onPlan as MoodRow['on_plan'],
    note,
    meal_id: mealId,
  })
  const id = mood.id

  // Consejo de Avo: solo con permiso para la IA. Si la IA falla, lo que sintió ya quedó guardado.
  if (body.advise && user.ai_consent_at) {
    try {
      const advice = await adviseMood(c.env, user, mood, offset)
      await c.env.DB.prepare('UPDATE moods SET advice = ? WHERE id = ?').bind(JSON.stringify(advice), id).run()
      mood = { ...mood, advice }
    } catch (err) {
      console.error('mood advice', err instanceof Error ? err.message : err)
    }
  }
  return c.json(mood, 201)
})

// Cómo se sintió en un rango: ?user_id=&from=&to= (el paciente o su nutrióloga vinculada)
moodRoutes.get('/', async (c) => {
  const userId = c.req.query('user_id') ?? c.var.user.id
  if (!(await canSee(c.env, c.var.user.id, userId))) fail(404, 'No encontrado')
  const { results } = await c.env.DB.prepare('SELECT * FROM moods WHERE user_id = ? AND felt_at >= ? AND felt_at < ? ORDER BY felt_at')
    .bind(userId, toIso(c.req.query('from'), 'from'), toIso(c.req.query('to'), 'to'))
    .all<MoodRow>()
  return c.json(results.map(toMood))
})

moodRoutes.delete('/:id', async (c) => {
  const res = await c.env.DB.prepare('DELETE FROM moods WHERE id = ? AND user_id = ?').bind(c.req.param('id'), c.var.user.id).run()
  if (!res.meta.changes) fail(404, 'No encontrado')
  return c.json({ ok: true })
})

export const insightRoutes = new Hono<AppEnv>()

// Patrones de un rango (hasta 14 días) con la IA: ?user_id=&from=&to=&offset=. No se guardan.
insightRoutes.get('/', async (c) => {
  const userId = c.req.query('user_id') ?? c.var.user.id
  if (!(await canSee(c.env, c.var.user.id, userId))) fail(404, 'No encontrado')
  const owner = userId === c.var.user.id ? c.var.user : await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<User>()
  if (!owner) fail(404, 'No encontrado')
  // El permiso es del paciente: sus datos solo van a la IA si él lo aceptó.
  if (!owner.ai_consent_at) fail(403, userId === c.var.user.id ? 'Para analizar con IA necesitamos tu permiso. Puedes darlo en Perfil.' : 'Tu paciente no ha dado permiso para analizar sus datos con IA.')

  const from = toIso(c.req.query('from'), 'from')
  const to = toIso(c.req.query('to'), 'to')
  if (Date.parse(to) - Date.parse(from) > 15 * DAY || Date.parse(to) <= Date.parse(from)) fail(400, 'Rango inválido (máximo 14 días)')
  const offset = offsetOf(c.req.query('offset'))

  const [meals, moods] = await Promise.all([
    c.env.DB.prepare(
      `SELECT eaten_at, status, calories, note, json_extract(analysis, '$.summary') AS summary
       FROM meals WHERE user_id = ? AND eaten_at >= ? AND eaten_at < ? ORDER BY eaten_at`,
    )
      .bind(userId, from, to)
      .all<MealLine>(),
    c.env.DB.prepare('SELECT * FROM moods WHERE user_id = ? AND felt_at >= ? AND felt_at < ? ORDER BY felt_at').bind(userId, from, to).all<MoodRow>(),
  ])
  if (meals.results.length + moods.results.length < 3) fail(422, 'Todavía hay muy pocos registros. Registra unas comidas y cómo te sientes, y vuelve a intentar.')

  const log = [
    ...meals.results.map((m) => ({ at: m.eaten_at, line: `${localLabel(m.eaten_at, offset)} · comió: ${describeMeal(m)}` })),
    ...moods.results.map((m) => ({ at: m.felt_at, line: `${localLabel(m.felt_at, offset)} · se sintió: ${describeMood(toMood(m))}` })),
  ]
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((e) => e.line)
    .join('\n')
  const goal = owner.daily_kcal_goal

  try {
    const { text, model } = await chat(
      c.env,
      [
        {
          role: 'system',
          content: insightsPrompt(userId === c.var.user.id ? avoVoice(owner) : 'Le hablas a su nutrióloga: tono profesional, claro y respetuoso, en español.'),
        },
        { role: 'user', content: `${goal ? `Meta diaria: ${goal} kcal.\n` : ''}Registro:\n${log}` },
      ],
      { type: 'json_schema', json_schema: { name: 'eating_patterns', strict: true, schema: INSIGHTS_SCHEMA } },
    )
    const raw = parseJson(text)
    return c.json({
      summary: String(raw.summary ?? '').trim(),
      patterns: (Array.isArray(raw.patterns) ? raw.patterns : [])
        .map((p: { title?: unknown; detail?: unknown }) => ({ title: String(p?.title ?? '').trim(), detail: String(p?.detail ?? '').trim() }))
        .filter((p: { title: string }) => p.title)
        .slice(0, 4),
      suggestions: strings(raw.suggestions, 3),
      model,
    })
  } catch (err) {
    console.error('insights', err instanceof Error ? err.message : err)
    fail(502, 'Avo no pudo revisar tus patrones ahorita. Intenta de nuevo en un momento.')
  }
})
