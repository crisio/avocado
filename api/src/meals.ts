import { Hono } from 'hono'
import type { AppEnv, Env, User } from './env'
import { canSee } from './access'
import { AI_CONSENT_REQUIRED, analyzePhoto, correctAnalysis, fraction, requireAiConsent, withTotals, type Analysis } from './ai'
import { fail } from './errors'
import { patientContext } from './moods'
import { recentAvoLines } from './voice'
import { signedPhotoUrl } from './photos'

const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface MealRow {
  id: string
  user_id: string
  eaten_at: string
  photo_key: string
  note: string | null
  /** Cómo lo cocinó (aceite, cantidad, método…), si lo dijo. */
  cooking: string | null
  status: 'pending' | 'analyzed' | 'error'
  analysis: string | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  created_at: string
  last_comment?: string | null
}

async function toMeal(env: Env, origin: string, row: MealRow) {
  const { photo_key, analysis, last_comment, ...rest } = row
  return {
    ...rest,
    analysis: analysis ? JSON.parse(analysis) : null,
    photo_url: await signedPhotoUrl(env, origin, photo_key),
    ...(last_comment !== undefined ? { last_comment: last_comment ? JSON.parse(last_comment) : null } : {}),
  }
}

function toIso(value: unknown, field: string) {
  const date = new Date(String(value ?? ''))
  if (Number.isNaN(date.getTime())) fail(400, `Fecha inválida: ${field}`)
  return date.toISOString()
}

async function getMeal(env: Env, id: string) {
  return env.DB.prepare('SELECT * FROM meals WHERE id = ?').bind(id).first<MealRow>()
}

/** Guarda un análisis; las columnas de calorías y macros son lo que se comió (no lo servido). */
async function saveAnalysis(env: Env, mealId: string, analysis: Analysis) {
  await env.DB.prepare(`UPDATE meals SET status = 'analyzed', analysis = ?, calories = ?, protein_g = ?, carbs_g = ?, fat_g = ? WHERE id = ?`)
    .bind(JSON.stringify(analysis), analysis.total.calories, analysis.total.protein_g, analysis.total.carbs_g, analysis.total.fat_g, mealId)
    .run()
}

/**
 * Guarda un cambio del paciente solo si el análisis sigue como lo leímos. Si otra petición lo cambió
 * mientras tanto (p. ej. una corrección con la IA que tardó), responde 409 en lugar de pisarla.
 */
async function saveEdit(env: Env, mealId: string, expected: string, analysis: Analysis) {
  const res = await env.DB.prepare(
    `UPDATE meals SET analysis = ?, calories = ?, protein_g = ?, carbs_g = ?, fat_g = ? WHERE id = ? AND status = 'analyzed' AND analysis = ?`,
  )
    .bind(JSON.stringify(analysis), analysis.total.calories, analysis.total.protein_g, analysis.total.carbs_g, analysis.total.fat_g, mealId, expected)
    .run()
  if (!res.meta.changes) fail(409, 'La comida cambió mientras tanto. Revisa y vuelve a intentarlo.')
}

/** Análisis guardado de una comida del dueño, listo para editar (los análisis viejos no traen "eaten" ni "served"). */
async function ownAnalyzedMeal(env: Env, id: string, userId: string) {
  const meal = await getMeal(env, id)
  if (!meal || meal.user_id !== userId) fail(404, 'No encontramos esta comida')
  if (meal.status !== 'analyzed' || !meal.analysis) fail(409, 'Esta comida todavía no tiene análisis')
  const stored = JSON.parse(meal.analysis) as Analysis
  const items = (stored.items ?? []).map((item) => ({ ...item, eaten: fraction(item.eaten) }))
  return { meal, raw: meal.analysis, analysis: withTotals({ ...stored, items }) }
}

async function saveError(env: Env, mealId: string, message: string) {
  await env.DB.prepare(`UPDATE meals SET status = 'error', analysis = ? WHERE id = ?`)
    .bind(JSON.stringify({ error: message }), mealId)
    .run()
}

/** offset del teléfono (minutos, como getTimezoneOffset); null si la app no lo mandó (versiones viejas). */
function phoneOffset(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const offset = Number(value)
  return Number.isInteger(offset) && Math.abs(offset) <= 14 * 60 ? offset : null
}

/** Corre el análisis y guarda el resultado (o el error) en la comida. Con la hora del teléfono, Avo comenta con contexto. */
async function runAnalysis(env: Env, meal: MealRow, user: User, offset: number | null) {
  try {
    const photo = await env.PHOTOS.get(meal.photo_key)
    if (!photo) throw new Error('No se encontró la foto')
    const [base, recent] = await Promise.all([offset === null ? [] : patientContext(env, user, offset), recentAvoLines(env, user.id)])
    const context = [...base, ...(offset === null ? [] : ['La foto es su comida más reciente (todavía sin analizar).']), ...(recent ? [recent] : [])]
    const result = await analyzePhoto(env, await photo.arrayBuffer(), photo.httpMetadata?.contentType ?? 'image/jpeg', meal.note, user, context, meal.cooking)
    await saveAnalysis(env, meal.id, result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('analyze', meal.id, message)
    await saveError(env, meal.id, message)
  }
}

export const mealRoutes = new Hono<AppEnv>()

// Comidas de un usuario en un rango de fechas: ?user_id=&from=&to=
mealRoutes.get('/', async (c) => {
  const userId = c.req.query('user_id') ?? c.var.user.id
  if (!(await canSee(c.env, c.var.user.id, userId))) fail(404, 'No encontrado')
  const from = toIso(c.req.query('from'), 'from')
  const to = toIso(c.req.query('to'), 'to')

  // Cada comida trae su comentario más reciente (para mostrar la indicación en "Mi día").
  const { results } = await c.env.DB.prepare(
    `SELECT m.*, (
       SELECT json_object('body', mc.body, 'author_name', u.full_name, 'author_role', u.role, 'created_at', mc.created_at)
       FROM meal_comments mc JOIN users u ON u.id = mc.author_id
       WHERE mc.meal_id = m.id ORDER BY mc.created_at DESC LIMIT 1
     ) AS last_comment
     FROM meals m WHERE m.user_id = ? AND m.eaten_at >= ? AND m.eaten_at < ? ORDER BY m.eaten_at`,
  )
    .bind(userId, from, to)
    .all<MealRow>()
  const origin = new URL(c.req.url).origin
  return c.json(await Promise.all(results.map((m) => toMeal(c.env, origin, m))))
})

// Nueva comida: multipart con photo, eaten_at, note, cooking (cómo lo cocinó) y offset (para que Avo sepa la hora del
// teléfono).
mealRoutes.post('/', async (c) => {
  const form = await c.req.formData().catch(() => fail(400, 'Formulario inválido'))
  const photo = form.get('photo')
  if (!(photo instanceof File)) fail(400, 'Falta la foto')
  if (!PHOTO_TYPES.includes(photo.type)) fail(400, 'La foto debe ser JPG, PNG o WebP')
  if (photo.size > MAX_PHOTO_BYTES) fail(413, 'La foto es muy pesada (máximo 5 MB)')

  const note = String(form.get('note') ?? '').trim().slice(0, 1000) || null
  const cooking = String(form.get('cooking') ?? '').trim().slice(0, 500) || null
  const eatenAt = form.get('eaten_at') ? toIso(form.get('eaten_at'), 'eaten_at') : new Date().toISOString()
  const origin = new URL(c.req.url).origin

  // client_id: la app genera el id sin conexión y reintenta el envío; si ya llegó, regresamos la misma comida.
  const clientId = String(form.get('client_id') ?? '')
  if (clientId && !UUID.test(clientId)) fail(400, 'client_id inválido')
  if (clientId) {
    const existing = await getMeal(c.env, clientId)
    if (existing) {
      if (existing.user_id !== c.var.user.id) fail(409, 'client_id en uso')
      return c.json(await toMeal(c.env, origin, existing), 200)
    }
  }
  const id = clientId || crypto.randomUUID()
  const key = `${c.var.user.id}/${id}.${photo.type.split('/')[1].replace('jpeg', 'jpg')}`

  await c.env.PHOTOS.put(key, await photo.arrayBuffer(), { httpMetadata: { contentType: photo.type } })
  await c.env.DB.prepare('INSERT INTO meals (id, user_id, eaten_at, photo_key, note, cooking) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, c.var.user.id, eatenAt, key, note, cooking)
    .run()

  // analyze=1: el análisis arranca aquí mismo y sigue aunque el teléfono pierda la conexión. Sin permiso para la IA
  // (p. ej. una comida que esperaba en la cola desde antes de pedirlo) se guarda igual, con el aviso como error.
  if (form.get('analyze') === '1') {
    if (c.var.user.ai_consent_at) c.executionCtx.waitUntil(runAnalysis(c.env, (await getMeal(c.env, id))!, c.var.user, phoneOffset(form.get('offset'))))
    else await saveError(c.env, id, AI_CONSENT_REQUIRED)
  }
  return c.json(await toMeal(c.env, origin, (await getMeal(c.env, id))!), 201)
})

// Detalle con comentarios
mealRoutes.get('/:id', async (c) => {
  const meal = await getMeal(c.env, c.req.param('id'))
  if (!meal || !(await canSee(c.env, c.var.user.id, meal.user_id))) fail(404, 'No encontramos esta comida')

  const { results: comments } = await c.env.DB.prepare(
    `SELECT mc.id, mc.meal_id, mc.author_id, mc.body, mc.created_at, u.full_name AS author_name, u.role AS author_role
     FROM meal_comments mc JOIN users u ON u.id = mc.author_id
     WHERE mc.meal_id = ? ORDER BY mc.created_at`,
  )
    .bind(meal.id)
    .all()
  return c.json({ ...(await toMeal(c.env, new URL(c.req.url).origin, meal)), comments })
})

// Analizar con IA (solo el dueño), ?offset= del teléfono. Si la app se cierra a medio análisis, waitUntil lo deja terminar.
mealRoutes.post('/:id/analyze', async (c) => {
  const meal = await getMeal(c.env, c.req.param('id'))
  if (!meal || meal.user_id !== c.var.user.id) fail(404, 'No encontramos esta comida')
  requireAiConsent(c.var.user)

  await c.env.DB.prepare(`UPDATE meals SET status = 'pending' WHERE id = ?`).bind(meal.id).run()
  const job = runAnalysis(c.env, meal, c.var.user, phoneOffset(c.req.query('offset')))
  c.executionCtx.waitUntil(job)
  await job

  const updated = await getMeal(c.env, meal.id)
  return c.json(await toMeal(c.env, new URL(c.req.url).origin, updated!))
})

// Cuánto se comió de cada alimento: { eaten: [1, 0.5, 0, …], items: ["Arroz", …] } en el orden de los alimentos
// (solo el dueño). `items` son los nombres que ve la app: si no coinciden, la lista cambió y se responde 409.
mealRoutes.patch('/:id/portions', async (c) => {
  const { meal, raw, analysis } = await ownAnalyzedMeal(c.env, c.req.param('id'), c.var.user.id)
  const { eaten, items } = await c.req.json<{ eaten?: unknown; items?: unknown }>().catch(() => ({ eaten: undefined, items: undefined }))
  const valid =
    Array.isArray(eaten) &&
    eaten.length === analysis.items.length &&
    eaten.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)
  if (!valid) fail(400, 'Porciones inválidas: manda una fracción entre 0 y 1 por cada alimento')
  if (items !== undefined && (!Array.isArray(items) || items.some((name, i) => name !== analysis.items[i]?.name)))
    fail(409, 'La comida cambió mientras tanto. Revisa y vuelve a intentarlo.')

  const updated = withTotals({ ...analysis, items: analysis.items.map((item, i) => ({ ...item, eaten: fraction(eaten[i]) })) })
  await saveEdit(c.env, meal.id, raw, updated)
  return c.json(await toMeal(c.env, new URL(c.req.url).origin, (await getMeal(c.env, meal.id))!))
})

// Corrección en palabras del paciente ("me dejé la mitad de la ensalada…"): la IA ajusta el análisis sin volver a ver la foto.
mealRoutes.post('/:id/correct', async (c) => {
  const { meal, raw, analysis } = await ownAnalyzedMeal(c.env, c.req.param('id'), c.var.user.id)
  requireAiConsent(c.var.user)
  const { text } = await c.req.json<{ text?: unknown }>().catch(() => ({ text: undefined }))
  const correction = String(text ?? '').trim()
  if (!correction || correction.length > 1000) fail(400, 'Cuéntanos qué cambió (máximo 1000 caracteres)')

  let updated: Analysis
  try {
    updated = await correctAnalysis(c.env, analysis, correction, meal.note, meal.cooking)
  } catch (err) {
    console.error('correct', meal.id, err instanceof Error ? err.message : err)
    fail(502, 'No se pudo corregir con la IA. Intenta de nuevo en un momento.')
  }
  await saveEdit(c.env, meal.id, raw, updated)
  return c.json(await toMeal(c.env, new URL(c.req.url).origin, (await getMeal(c.env, meal.id))!))
})

mealRoutes.delete('/:id', async (c) => {
  const meal = await getMeal(c.env, c.req.param('id'))
  if (!meal || meal.user_id !== c.var.user.id) fail(404, 'No encontramos esta comida')
  await c.env.DB.prepare('DELETE FROM meals WHERE id = ?').bind(meal.id).run()
  await c.env.PHOTOS.delete(meal.photo_key)
  return c.json({ ok: true })
})

mealRoutes.post('/:id/comments', async (c) => {
  const meal = await getMeal(c.env, c.req.param('id'))
  if (!meal || !(await canSee(c.env, c.var.user.id, meal.user_id))) fail(404, 'No encontramos esta comida')

  const { body, id: clientId } = await c.req.json<{ body?: string; id?: string }>().catch(() => ({ body: undefined, id: undefined }))
  const text = String(body ?? '').trim()
  if (!text || text.length > 2000) fail(400, 'El comentario debe tener entre 1 y 2000 caracteres')
  if (clientId !== undefined && !UUID.test(String(clientId))) fail(400, 'id inválido')

  // Igual que las comidas: un comentario reenviado desde la cola sin conexión no se duplica.
  if (clientId) {
    const existing = await c.env.DB.prepare('SELECT * FROM meal_comments WHERE id = ?').bind(clientId).first<{ author_id: string }>()
    if (existing) {
      if (existing.author_id !== c.var.user.id) fail(409, 'id en uso')
      return c.json({ ...existing, author_name: c.var.user.full_name, author_role: c.var.user.role }, 200)
    }
  }

  const comment = {
    id: clientId || crypto.randomUUID(),
    meal_id: meal.id,
    author_id: c.var.user.id,
    body: text,
    created_at: new Date().toISOString(),
  }
  await c.env.DB.prepare('INSERT INTO meal_comments (id, meal_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(comment.id, comment.meal_id, comment.author_id, comment.body, comment.created_at)
    .run()
  return c.json({ ...comment, author_name: c.var.user.full_name, author_role: c.var.user.role }, 201)
})
