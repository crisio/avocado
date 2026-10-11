import type { Env } from './env'

// Analiza la foto de una comida con un modelo de visión vía OpenRouter.

const SYSTEM_PROMPT = `Eres un asistente de nutrición. Te paso la foto de una comida (y a veces una nota del paciente).
Identifica cada alimento visible, estima la porción en gramos y calcula calorías y macronutrientes.
Si la nota del paciente contradice la foto, confía en la nota para ingredientes que no se ven (aceite, azúcar, etc.).
Responde SOLO con un objeto JSON válido, sin texto adicional, con esta forma exacta:
{
  "items": [{ "name": string, "portion_g": number, "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number }],
  "total": { "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number },
  "meal_type": "desayuno" | "comida" | "cena" | "snack" | "bebida",
  "summary": string,
  "confidence": number
}
"summary" es una frase corta en español describiendo el plato. "confidence" va de 0 a 1.
Si la foto no muestra comida, regresa "items": [] y explica en "summary".`

export interface Item {
  name: string
  portion_g: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export interface Analysis {
  items: Item[]
  total: { calories: number; protein_g: number; carbs_g: number; fat_g: number }
  meal_type: string
  summary: string
  confidence: number
  model: string
}

function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : 0
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
      }))
    : []
  const sum = (k: keyof Omit<Item, 'name'>) => num(items.reduce((acc, i) => acc + i[k], 0))
  const t = raw.total ?? {}

  return {
    items,
    total: {
      calories: num(t.calories) || sum('calories'),
      protein_g: num(t.protein_g) || sum('protein_g'),
      carbs_g: num(t.carbs_g) || sum('carbs_g'),
      fat_g: num(t.fat_g) || sum('fat_g'),
    },
    meal_type: String(raw.meal_type ?? 'comida'),
    summary: String(raw.summary ?? ''),
    confidence: Math.min(1, num(raw.confidence)),
    model,
  }
}

export async function analyzePhoto(env: Env, photo: ArrayBuffer, contentType: string, note: string | null): Promise<Analysis> {
  const apiKey = env.OPENROUTER_API_KEY
  const model = env.OPENROUTER_MODEL
  if (!apiKey || !model) throw new Error('Faltan los secretos OPENROUTER_API_KEY / OPENROUTER_MODEL')

  const dataUrl = `data:${contentType};base64,${toBase64(photo)}`
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'Avocado',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: note ? `Nota del paciente: ${note}` : 'Analiza esta comida.' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  })

  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const body = await res.json<{ model?: string; choices?: { message?: { content?: string } }[] }>()
  const text = body.choices?.[0]?.message?.content
  if (!text) throw new Error('OpenRouter no regresó contenido')
  return parseAnalysis(text, body.model ?? model)
}
