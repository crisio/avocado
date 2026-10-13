import { Hono } from 'hono'
import type { AppEnv } from './env'
import { chat, num, toBase64 } from './ai'
import { fail } from './errors'

/**
 * "¿Me lo como?": el paciente le toma foto a un antojo y Avo le dice cuántas calorías tiene y cuánto le conviene
 * comer según lo que lleva hoy, su meta y la hora. No guarda nada (ni la foto): solo aconseja.
 */

const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const VERDICTS = ['adelante', 'un_poco', 'compartelo', 'mejor_no'] as const
export type Verdict = (typeof VERDICTS)[number]

export const CRAVING_PROMPT = `Eres Avo, el compañero de nutrición de la app Avocado: cálido, cercano y práctico (español de México/Centroamérica, tutea).
El paciente tiene un antojo y te manda una foto para decidir si se lo come y cuánto. NO se registra en su día: solo quiere tu consejo.

Tu objetivo es educar sobre el valor calórico de las cosas y ayudarle a darse el gusto con conciencia, nunca restringir ni culpar:
- Nunca uses palabras como "prohibido", "malo", "culpa", "trampa" ni hables de quemarlo con ejercicio.
- Estima la porción COMPLETA que se ve en la foto (gramos, calorías y macros).
- Recomienda qué fracción comer ("suggested_fraction": 1 = todo, 0.5 = la mitad, 0.25 = un cuarto, 0.1 = unas probadas) y un veredicto:
  "adelante" (cabe bien), "un_poco" (una porción más pequeña), "compartelo" (mejor compartirlo) o "mejor_no" (hoy solo una probadita o guárdalo para mañana).
- Con meta diaria: compara con lo que le queda. Si cabe, adelante. Si se pasa un poco (hasta ~10 % de su meta) y es su última comida del día (tarde o noche), está bien pasarse un poquito: díselo con cariño. Si se pasa mucho, sugiere la mitad, compartirlo o unas probadas, sin regañar.
- Sin meta: orienta con porciones razonables y lo que ya comió hoy, y menciona que puede poner su meta en Perfil.
- "message": 1 a 3 frases, por su nombre, con una equivalencia que enseñe (p. ej. "la mitad son unas 220 kcal, como una tortilla con frijoles") y tu recomendación.
- "tips": hasta 3 ideas cortas y prácticas (compartir, acompañarlo con café sin azúcar o fruta, disfrutarlo despacio, guardarlo para mañana…). Lista vacía si no hacen falta.
- "question": si no puedes saber qué es y eso cambia mucho las calorías (p. ej. tipo de pastel o relleno), haz UNA pregunta corta; si no, cadena vacía. Aun así da tu mejor estimación.
- Si la foto no es comida, "name" vacío, calorías 0, explica en "message" y pregunta qué quería consultar.
- Si el paciente dice qué es o responde tu pregunta, confía en eso.
Responde SOLO con el JSON pedido.`

const CRAVING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'portion_g', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'verdict', 'suggested_fraction', 'message', 'tips', 'question', 'confidence'],
  properties: {
    name: { type: 'string' },
    portion_g: { type: 'number' },
    calories: { type: 'number' },
    protein_g: { type: 'number' },
    carbs_g: { type: 'number' },
    fat_g: { type: 'number' },
    verdict: { type: 'string', enum: [...VERDICTS] },
    suggested_fraction: { type: 'number' },
    message: { type: 'string' },
    tips: { type: 'array', items: { type: 'string' } },
    question: { type: 'string' },
    confidence: { type: 'number' },
  },
}

export interface Craving {
  name: string
  portion_g: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  verdict: Verdict
  suggested_fraction: number
  /** Calorías de la fracción recomendada. */
  suggested_calories: number
  message: string
  tips: string[]
  question: string | null
  confidence: number
  model: string
}

export function parseCraving(text: string, model: string): Craving {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('La IA no regresó JSON')
  const raw = JSON.parse(text.slice(start, end + 1))
  const calories = num(raw.calories)
  const verdict: Verdict = VERDICTS.includes(raw.verdict) ? raw.verdict : 'un_poco'
  // Sin fracción válida, la que corresponde al veredicto.
  // Sin fracción válida (falta, "1/2", 50…), la que corresponde al veredicto; nunca "todo" por error.
  const fallback = { adelante: 1, un_poco: 0.5, compartelo: 0.5, mejor_no: 0.1 }[verdict]
  const f = raw.suggested_fraction
  const n = typeof f === 'number' ? f : typeof f === 'string' && f.trim() !== '' ? Number(f) : Number.NaN
  const suggested = Number.isFinite(n) && n >= 0 && n <= 1 ? Math.round(n * 100) / 100 : fallback
  const question = String(raw.question ?? '').trim()
  return {
    name: String(raw.name ?? '').trim(),
    portion_g: num(raw.portion_g),
    calories,
    protein_g: num(raw.protein_g),
    carbs_g: num(raw.carbs_g),
    fat_g: num(raw.fat_g),
    verdict,
    suggested_fraction: suggested,
    suggested_calories: Math.round(calories * suggested),
    message: String(raw.message ?? '').trim(),
    tips: Array.isArray(raw.tips) ? raw.tips.map((t: unknown) => String(t).trim()).filter(Boolean).slice(0, 3) : [],
    question: question || null,
    confidence: Math.min(1, num(raw.confidence)),
    model,
  }
}

function toIso(value: unknown, field: string) {
  const date = new Date(String(value ?? ''))
  if (Number.isNaN(date.getTime())) fail(400, `Fecha inválida: ${field}`)
  return date.toISOString()
}

export const cravingRoutes = new Hono<AppEnv>()

// multipart: photo, note? (qué es), question? + answer? (respuesta a la pregunta de Avo), from y to (el día local),
// hour (0–23) y queued (comidas de hoy que siguen en el teléfono, sin llegar al servidor)
cravingRoutes.post('/', async (c) => {
  const user = c.var.user
  const form = await c.req.formData().catch(() => fail(400, 'Formulario inválido'))
  const photo = form.get('photo')
  if (!(photo instanceof File)) fail(400, 'Falta la foto')
  if (!PHOTO_TYPES.includes(photo.type)) fail(400, 'La foto debe ser JPG, PNG o WebP')
  if (photo.size > MAX_PHOTO_BYTES) fail(413, 'La foto es muy pesada (máximo 5 MB)')

  const from = toIso(form.get('from'), 'from')
  const to = toIso(form.get('to'), 'to')
  const hourText = String(form.get('hour') ?? '').trim()
  const hour = hourText ? Number(hourText) : Number.NaN
  const queued = Math.max(0, Math.min(20, Math.trunc(Number(form.get('queued')) || 0)))
  const text = (key: string, max: number) => String(form.get(key) ?? '').trim().slice(0, max)
  const note = text('note', 300)
  const question = text('question', 300)
  const answer = text('answer', 300)

  // Lo que lleva hoy: calorías de las comidas ya analizadas, cuántas registró y cuántas aún no tienen calorías
  // (analizándose, sin análisis o todavía en el teléfono): con esas, en realidad lleva más.
  const day = await c.env.DB.prepare(
    `SELECT coalesce(sum(CASE WHEN status = 'analyzed' THEN calories END), 0) AS consumed, count(*) AS meals,
            count(CASE WHEN status <> 'analyzed' THEN 1 END) AS unanalyzed
     FROM meals WHERE user_id = ? AND eaten_at >= ? AND eaten_at < ?`,
  )
    .bind(user.id, from, to)
    .first<{ consumed: number; meals: number; unanalyzed: number }>()
  const consumed = Math.round(day?.consumed ?? 0)
  const meals = (day?.meals ?? 0) + queued
  const pending = (day?.unanalyzed ?? 0) + queued
  const goal = user.daily_kcal_goal
  const remaining = goal ? goal - consumed : null

  const name = (user.full_name ?? '').trim().split(/\s+/)[0] || null
  const context = [
    name ? `Paciente: ${name}.` : null,
    Number.isInteger(hour) && hour >= 0 && hour < 24 ? `Hora local: ${hour}:00.` : null,
    `Hoy lleva ${consumed} kcal en ${meals} ${meals === 1 ? 'comida registrada' : 'comidas registradas'}.`,
    pending
      ? `Ojo: ${pending} ${pending === 1 ? 'de esas comidas aún no tiene' : 'de esas comidas aún no tienen'} calorías calculadas (se están analizando o no se pudieron analizar), así que en realidad lleva MÁS de ${consumed} kcal. Sé prudente y menciónalo.`
      : null,
    goal
      ? remaining! >= 0
        ? `Su meta diaria es ${goal} kcal: le quedan ${remaining} kcal.`
        : `Su meta diaria es ${goal} kcal: ya la pasó por ${-remaining!} kcal.`
      : 'No tiene meta diaria configurada.',
    note ? `El paciente dice qué es: ${note}` : null,
    question && answer ? `Le preguntaste: "${question}" y respondió: "${answer}".` : answer ? `El paciente agrega: ${answer}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const { text: reply, model } = await chat(
      c.env,
      [
        { role: 'system', content: CRAVING_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: context },
            { type: 'image_url', image_url: { url: `data:${photo.type};base64,${toBase64(await photo.arrayBuffer())}` } },
          ],
        },
      ],
      { type: 'json_schema', json_schema: { name: 'craving_advice', strict: true, schema: CRAVING_SCHEMA } },
    )
    return c.json({ ...parseCraving(reply, model), today: { consumed, meals, pending, goal, remaining } })
  } catch (err) {
    console.error('craving', err instanceof Error ? err.message : err)
    fail(502, 'Avo no pudo ver tu antojo ahorita. Intenta de nuevo en un momento.')
  }
})
