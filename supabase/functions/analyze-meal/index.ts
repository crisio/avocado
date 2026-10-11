// Analiza la foto de una comida con un modelo de visión vía OpenRouter y guarda el resultado en `meals`.
//
// Secretos necesarios (supabase secrets set ...):
//   OPENROUTER_API_KEY  – tu API key de https://openrouter.ai/keys
//   OPENROUTER_MODEL    – id de un modelo con entrada de imagen, p. ej. el que elijas en https://openrouter.ai/models
// SUPABASE_URL y SUPABASE_ANON_KEY los inyecta Supabase automáticamente.

import { createClient } from '@supabase/supabase-js'
import { encodeBase64 } from '@std/encoding/base64'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

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

type Item = { name: string; portion_g: number; calories: number; protein_g: number; carbs_g: number; fat_g: number }
type Analysis = {
  items: Item[]
  total: { calories: number; protein_g: number; carbs_g: number; fat_g: number }
  meal_type: string
  summary: string
  confidence: number
  model: string
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : 0
}

// Los modelos a veces envuelven el JSON en ```json ... ``` o agregan texto; nos quedamos con el primer objeto.
function parseAnalysis(text: string, model: string): Analysis {
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

async function analyzeWithOpenRouter(image: Blob, note: string | null): Promise<Analysis> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  const model = Deno.env.get('OPENROUTER_MODEL')
  if (!apiKey || !model) throw new Error('Faltan los secretos OPENROUTER_API_KEY / OPENROUTER_MODEL')

  const dataUrl = `data:${image.type || 'image/jpeg'};base64,${encodeBase64(await image.arrayBuffer())}`
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
  const body = await res.json()
  const text: string | undefined = body.choices?.[0]?.message?.content
  if (!text) throw new Error('OpenRouter no regresó contenido')
  return parseAnalysis(text, body.model ?? model)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  // Cliente con el JWT del usuario: todas las lecturas/escrituras pasan por RLS.
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return json({ error: 'No autorizado' }, 401)

  const { meal_id } = await req.json().catch(() => ({}))
  if (typeof meal_id !== 'string') return json({ error: 'Falta meal_id' }, 400)

  const { data: meal, error: mealError } = await supabase
    .from('meals')
    .select('id, user_id, photo_path, note')
    .eq('id', meal_id)
    .single()
  if (mealError || !meal) return json({ error: 'Comida no encontrada' }, 404)
  if (meal.user_id !== user.id) return json({ error: 'Solo el dueño puede analizar su comida' }, 403)

  try {
    const { data: photo, error: photoError } = await supabase.storage.from('meal-photos').download(meal.photo_path)
    if (photoError || !photo) throw new Error('No se pudo leer la foto')

    const analysis = await analyzeWithOpenRouter(photo, meal.note)
    const { error: updateError } = await supabase
      .from('meals')
      .update({
        status: 'analyzed',
        analysis,
        calories: analysis.total.calories,
        protein_g: analysis.total.protein_g,
        carbs_g: analysis.total.carbs_g,
        fat_g: analysis.total.fat_g,
      })
      .eq('id', meal.id)
    if (updateError) throw updateError

    return json({ ok: true, analysis })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('analyze-meal', meal.id, message)
    await supabase.from('meals').update({ status: 'error', analysis: { error: message } }).eq('id', meal.id)
    return json({ error: message }, 502)
  }
})
