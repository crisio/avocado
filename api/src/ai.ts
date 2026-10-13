import type { Env, User } from './env'
import { fail } from './errors'

// Analiza la foto de una comida con un modelo de visión vía OpenRouter.
// Modelo: ver AI_MODELS en wrangler.jsonc (elegido por precisión en fotos de comida, velocidad y costo).

export const AI_CONSENT_REQUIRED = 'Para analizar con IA necesitamos tu permiso. Puedes darlo en Perfil.'

/** Las fotos y notas van a modelos de otras empresas (Google, OpenAI): solo con el permiso del paciente. */
export function requireAiConsent(user: User) {
  if (!user.ai_consent_at) fail(403, AI_CONSENT_REQUIRED)
}

const ANSWER_FORMAT = `Responde SOLO con un objeto JSON válido, sin texto adicional, con esta forma exacta:
{
  "items": [{ "name": string, "portion_g": number, "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "eaten": number }],
  "total": { "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number },
  "meal_type": "desayuno" | "comida" | "cena" | "snack" | "bebida",
  "summary": string,
  "confidence": number
}
Cada alimento lleva los valores de la porción COMPLETA servida; "eaten" es la fracción que se comió (1 = todo, 0.5 = la mitad, 0 = nada).
"total" es la suma de lo que se comió (cada alimento multiplicado por su "eaten").
"summary" es una frase corta en español describiendo el plato. "confidence" va de 0 a 1.`

export const SYSTEM_PROMPT = `Eres un asistente de nutrición. Te paso la foto de una comida (y a veces una nota del paciente).
Identifica cada alimento visible, estima la porción en gramos y calcula calorías y macronutrientes.
Si la nota del paciente contradice la foto, confía en la nota para ingredientes que no se ven (aceite, azúcar, etc.).
Usa "eaten" = 1 salvo que la nota diga que no se comió todo (p. ej. "me dejé la mitad del arroz" → eaten 0.5 en el arroz).
${ANSWER_FORMAT}
Si la foto no muestra comida, regresa "items": [] y explica en "summary".`

export const CORRECTION_PROMPT = `Eres un asistente de nutrición. Te paso el análisis de una comida (JSON) y una corrección del paciente.
Devuelve el análisis corregido:
- Si dice que no se comió algo completo, ajusta "eaten" de ese alimento (0 a 1) y deja su porción servida igual.
- Si dice que un alimento era otro o que la porción era distinta, corrige nombre, porción y nutrientes.
- Si menciona algo que comió y no está en la lista, agrégalo con su porción estimada.
- Si dice que la foto era de lo que sobró, estima lo que había y lo que se comió según lo que cuente.
- No cambies los alimentos que no menciona.
${ANSWER_FORMAT}`

export interface Item {
  name: string
  portion_g: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  /** Fracción que se comió: 1 = todo, 0 = nada. */
  eaten: number
}

type Totals = { calories: number; protein_g: number; carbs_g: number; fat_g: number }

export interface Analysis {
  items: Item[]
  /** Lo que se comió (cada alimento × eaten). */
  total: Totals
  /** Lo que se sirvió (todos los alimentos completos). Igual a total si se comió todo. */
  served: Totals
  meal_type: string
  summary: string
  confidence: number
  model: string
  /** Última corrección del paciente, si la hubo. */
  correction?: string
}

export function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : 0
}

/** Fracción entre 0 y 1; si falta o no es número, se asume que se comió todo. */
export const fraction = (v: unknown) => {
  // Number(null), Number('') y Number(false) dan 0: solo cuentan números de verdad o texto numérico.
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? Math.min(1, Math.max(0, Math.round(n * 100) / 100)) : 1
}

const KEYS = ['calories', 'protein_g', 'carbs_g', 'fat_g'] as const

function sumItems(items: Item[], useEaten: boolean): Totals {
  const t = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  for (const item of items) for (const k of KEYS) t[k] += item[k] * (useEaten ? fraction(item.eaten) : 1)
  for (const k of KEYS) t[k] = num(t[k])
  return t
}

/** Recalcula lo servido y lo comido a partir de los alimentos (se usa al cambiar porciones). */
export function withTotals<T extends { items: Item[]; total?: Totals; served?: Totals }>(analysis: T): T & { total: Totals; served: Totals } {
  if (analysis.items.length === 0) {
    const total = analysis.total ?? { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    return { ...analysis, total, served: total }
  }
  return { ...analysis, total: sumItems(analysis.items, true), served: sumItems(analysis.items, false) }
}

// Los modelos a veces envuelven el JSON en ```json ... ``` o agregan texto; nos quedamos con el objeto.
export function parseAnalysis(text: string, model: string): Analysis {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('La IA no regresó JSON')
  const raw = JSON.parse(text.slice(start, end + 1))

  const items: Item[] = Array.isArray(raw.items)
    ? raw.items.map((i: Record<string, unknown>) => ({
        name: String(i.name ?? 'Alimento'),
        portion_g: num(i.portion_g),
        calories: num(i.calories),
        protein_g: num(i.protein_g),
        carbs_g: num(i.carbs_g),
        fat_g: num(i.fat_g),
        eaten: fraction(i.eaten),
      }))
    : []
  const t = raw.total ?? {}

  // Con alimentos, los totales salen de ellos (así la tabla siempre cuadra); sin alimentos, los del modelo.
  return withTotals({
    items,
    total: { calories: num(t.calories), protein_g: num(t.protein_g), carbs_g: num(t.carbs_g), fat_g: num(t.fat_g) },
    meal_type: String(raw.meal_type ?? 'comida'),
    summary: String(raw.summary ?? ''),
    confidence: Math.min(1, num(raw.confidence)),
    model,
  })
}

// Forma exacta que pedimos (structured outputs). Si un modelo de respaldo no la respeta, parseAnalysis la tolera igual.
const nutrients = {
  calories: { type: 'number' },
  protein_g: { type: 'number' },
  carbs_g: { type: 'number' },
  fat_g: { type: 'number' },
} as const
const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'total', 'meal_type', 'summary', 'confidence'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'portion_g', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'eaten'],
        properties: { name: { type: 'string' }, portion_g: { type: 'number' }, ...nutrients, eaten: { type: 'number' } },
      },
    },
    total: { type: 'object', additionalProperties: false, required: ['calories', 'protein_g', 'carbs_g', 'fat_g'], properties: nutrients },
    meal_type: { type: 'string', enum: ['desayuno', 'comida', 'cena', 'snack', 'bebida'] },
    summary: { type: 'string' },
    confidence: { type: 'number' },
  },
}

/** Opciones de la petición, compartidas con scripts/bench-models.ts para medir exactamente lo que corre en producción. */
export const REQUEST_OPTIONS = {
  temperature: 0.2,
  max_tokens: 1500,
  // Sin "pensar": para una foto de comida no mejora la estimación y triplica el tiempo de espera.
  reasoning: { effort: 'minimal', exclude: true },
  response_format: { type: 'json_schema', json_schema: { name: 'meal_analysis', strict: true, schema: ANALYSIS_SCHEMA } },
}

/** AI_MODELS = "principal,respaldo1,…": OpenRouter pasa al siguiente si el principal falla o no está disponible. */
export function modelList(env: Env) {
  return (env.AI_MODELS ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
}

/**
 * Una llamada a OpenRouter con nuestras opciones (y otro formato de respuesta si se pide). Regresa el texto y el
 * modelo que contestó.
 */
export async function chat(env: Env, messages: unknown[], responseFormat: unknown = REQUEST_OPTIONS.response_format) {
  const apiKey = env.OPENROUTER_API_KEY
  const models = modelList(env)
  if (!apiKey) throw new Error('Falta el secreto OPENROUTER_API_KEY')
  if (models.length === 0) throw new Error('Falta la variable AI_MODELS')
  const [model, ...fallbacks] = models

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'Avocado',
    },
    body: JSON.stringify({ model, ...(fallbacks.length ? { models } : {}), ...REQUEST_OPTIONS, response_format: responseFormat, messages }),
  })

  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const body = await res.json<{ model?: string; choices?: { message?: { content?: string } }[] }>()
  const text = body.choices?.[0]?.message?.content
  if (!text) throw new Error('OpenRouter no regresó contenido')
  return { text, model: body.model ?? model }
}

/** Una llamada con el formato del análisis de comida; regresa el análisis ya validado. */
async function complete(env: Env, messages: unknown[]): Promise<Analysis> {
  const { text, model } = await chat(env, messages)
  return parseAnalysis(text, model)
}

export function analyzePhoto(env: Env, photo: ArrayBuffer, contentType: string, note: string | null): Promise<Analysis> {
  return complete(env, [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: note ? `Nota del paciente: ${note}` : 'Analiza esta comida.' },
        { type: 'image_url', image_url: { url: `data:${contentType};base64,${toBase64(photo)}` } },
      ],
    },
  ])
}

/** Corrige un análisis con lo que cuenta el paciente ("me dejé la mitad…"). Solo texto: no vuelve a mandar la foto. */
export async function correctAnalysis(env: Env, previous: Analysis, correction: string, note: string | null): Promise<Analysis> {
  const { items, meal_type, summary } = previous
  const result = await complete(env, [
    { role: 'system', content: CORRECTION_PROMPT },
    {
      role: 'user',
      content: [
        `Análisis actual: ${JSON.stringify({ items, meal_type, summary })}`,
        note ? `Nota que el paciente escribió al registrar la comida: ${note}` : null,
        `Corrección del paciente: ${correction}`,
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ])
  // La confianza de la foto se conserva: la corrección no la vuelve a ver.
  return { ...result, confidence: previous.confidence || result.confidence, correction }
}
