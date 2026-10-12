import { Hono } from 'hono'
import type { AppEnv, Env } from './env'
import { canSee } from './access'
import { analyzePhoto } from './ai'
import { fail } from './errors'
import { signedPhotoUrl } from './photos'

const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

interface MealRow {
  id: string
  user_id: string
  eaten_at: string
  photo_key: string
  note: string | null
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

/** Corre el análisis y guarda el resultado (o el error) en la comida. */
async function runAnalysis(env: Env, meal: MealRow) {
  try {
    const photo = await env.PHOTOS.get(meal.photo_key)
    if (!photo) throw new Error('No se encontró la foto')
    const result = await analyzePhoto(env, await photo.arrayBuffer(), photo.httpMetadata?.contentType ?? 'image/jpeg', meal.note)
    await env.DB.prepare(
      `UPDATE meals SET status = 'analyzed', analysis = ?, calories = ?, protein_g = ?, carbs_g = ?, fat_g = ? WHERE id = ?`,
    )
      .bind(JSON.stringify(result), result.total.calories, result.total.protein_g, result.total.carbs_g, result.total.fat_g, meal.id)
      .run()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('analyze', meal.id, message)
    await env.DB.prepare(`UPDATE meals SET status = 'error', analysis = ? WHERE id = ?`)
      .bind(JSON.stringify({ error: message }), meal.id)
      .run()
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

// Nueva comida: multipart con photo, eaten_at y note.
mealRoutes.post('/', async (c) => {
  const form = await c.req.formData().catch(() => fail(400, 'Formulario inválido'))
  const photo = form.get('photo')
  if (!(photo instanceof File)) fail(400, 'Falta la foto')
  if (!PHOTO_TYPES.includes(photo.type)) fail(400, 'La foto debe ser JPG, PNG o WebP')
  if (photo.size > MAX_PHOTO_BYTES) fail(413, 'La foto es muy pesada (máximo 5 MB)')

  const note = String(form.get('note') ?? '').trim().slice(0, 1000) || null
  const eatenAt = form.get('eaten_at') ? toIso(form.get('eaten_at'), 'eaten_at') : new Date().toISOString()
  const id = crypto.randomUUID()
  const key = `${c.var.user.id}/${id}.${photo.type.split('/')[1].replace('jpeg', 'jpg')}`

  await c.env.PHOTOS.put(key, await photo.arrayBuffer(), { httpMetadata: { contentType: photo.type } })
  await c.env.DB.prepare('INSERT INTO meals (id, user_id, eaten_at, photo_key, note) VALUES (?, ?, ?, ?, ?)')
    .bind(id, c.var.user.id, eatenAt, key, note)
    .run()

  const meal = await getMeal(c.env, id)
  return c.json(await toMeal(c.env, new URL(c.req.url).origin, meal!), 201)
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

// Analizar con IA (solo el dueño). Si la app se cierra a medio análisis, waitUntil lo deja terminar.
mealRoutes.post('/:id/analyze', async (c) => {
  const meal = await getMeal(c.env, c.req.param('id'))
  if (!meal || meal.user_id !== c.var.user.id) fail(404, 'No encontramos esta comida')

  await c.env.DB.prepare(`UPDATE meals SET status = 'pending' WHERE id = ?`).bind(meal.id).run()
  const job = runAnalysis(c.env, meal)
  c.executionCtx.waitUntil(job)
  await job

  const updated = await getMeal(c.env, meal.id)
  return c.json(await toMeal(c.env, new URL(c.req.url).origin, updated!))
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

  const { body } = await c.req.json<{ body?: string }>().catch(() => ({ body: undefined }))
  const text = String(body ?? '').trim()
  if (!text || text.length > 2000) fail(400, 'El comentario debe tener entre 1 y 2000 caracteres')

  const comment = {
    id: crypto.randomUUID(),
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
