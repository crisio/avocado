import { Hono } from 'hono'
import type { AppEnv, User } from './env'
import { areLinked } from './access'
import { fail } from './errors'
import { deletePhotos } from './photos'
import { GOALS, type Goal } from './budget'
import { isAvoStyle } from './voice'

type PublicUser = Pick<User, 'id' | 'email' | 'full_name'>

export const peopleRoutes = new Hono<AppEnv>()

peopleRoutes.get('/me', (c) => c.json(c.var.user))

// Nombre editable siempre; el rol solo se elige una vez (al terminar el registro).
peopleRoutes.patch('/me', async (c) => {
  const user = c.var.user
  const body = await c.req
    .json<{
      full_name?: unknown
      role?: unknown
      daily_kcal_goal?: unknown
      ai_consent?: unknown
      goal?: unknown
      avo_style?: unknown
      reminders?: unknown
      protein_g_goal?: unknown
      fasting_hours?: unknown
      eating_start?: unknown
      fast_started_at?: unknown
    }>()
    .catch(() => ({}) as Record<string, unknown>)

  let fullName = user.full_name
  if (body.full_name !== undefined) {
    fullName = typeof body.full_name === 'string' ? body.full_name.trim().slice(0, 100) || null : null
  }

  let role = user.role
  if (body.role !== undefined && body.role !== user.role) {
    if (user.role !== null) fail(400, 'El tipo de cuenta no se puede cambiar')
    if (body.role !== 'patient' && body.role !== 'nutritionist') fail(400, 'Tipo de cuenta inválido')
    role = body.role
  }

  // Si su nutrióloga (vinculada) le puso las metas, solo ella las cambia.
  const locked = !!user.goals_set_by && (await areLinked(c.env, user.id, user.goals_set_by))
  const changes = (field: 'daily_kcal_goal' | 'goal' | 'protein_g_goal') => body[field] !== undefined && body[field] !== user[field]
  if (locked && (changes('daily_kcal_goal') || changes('goal') || changes('protein_g_goal')))
    fail(403, 'Tus metas y tu objetivo los puso tu nutrióloga. Pídele a ella si quieres cambiarlos.')

  // Meta diaria de calorías: vacía (sin meta) o un número razonable.
  let goal = user.daily_kcal_goal
  if (body.daily_kcal_goal !== undefined) {
    if (body.daily_kcal_goal === null || body.daily_kcal_goal === '') goal = null
    else {
      const n = Number(body.daily_kcal_goal)
      if (!Number.isFinite(n) || n < 800 || n > 6000) fail(400, 'La meta diaria debe estar entre 800 y 6,000 kcal')
      goal = Math.round(n)
    }
  }

  // Permiso para analizar con IA de terceros: true lo da (conserva la fecha si ya lo había dado), false lo retira.
  let consent = user.ai_consent_at
  if (body.ai_consent !== undefined) {
    if (typeof body.ai_consent !== 'boolean') fail(400, 'ai_consent debe ser true o false')
    consent = body.ai_consent ? (consent ?? new Date().toISOString()) : null
  }

  // Objetivo: bajar de peso, mantener o subir (volumen); null lo quita.
  let objective = user.goal
  if (body.goal !== undefined) {
    if (body.goal !== null && !GOALS.includes(body.goal as Goal)) fail(400, 'El objetivo debe ser bajar, mantener o subir')
    objective = body.goal as Goal | null
  }

  // Personalidad de Avo: picante (sarcástico, con memes y GIF) o tranquilo.
  let avoStyle = user.avo_style
  if (body.avo_style !== undefined) {
    if (!isAvoStyle(body.avo_style)) fail(400, 'La personalidad de Avo debe ser picante o tranquilo')
    avoStyle = body.avo_style
  }

  // Meta de proteína al día (g): vacía o un número razonable.
  let protein = user.protein_g_goal
  if (body.protein_g_goal !== undefined) {
    if (body.protein_g_goal === null || body.protein_g_goal === '') protein = null
    else {
      const n = Number(body.protein_g_goal)
      if (!Number.isFinite(n) || n < 20 || n > 400) fail(400, 'La meta de proteína debe estar entre 20 y 400 g')
      protein = Math.round(n)
    }
  }

  // Ayuno intermitente: horas del plan (12 a 23) o null; la ventana de comida abre a eating_start ("HH:MM").
  let fastingHours = user.fasting_hours
  if (body.fasting_hours !== undefined) {
    if (body.fasting_hours !== null && (!Number.isInteger(body.fasting_hours) || (body.fasting_hours as number) < 12 || (body.fasting_hours as number) > 23))
      fail(400, 'El ayuno debe ser de 12 a 23 horas')
    fastingHours = body.fasting_hours as number | null
  }
  let eatingStart = user.eating_start
  if (body.eating_start !== undefined) {
    if (typeof body.eating_start !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.eating_start)) fail(400, 'La hora debe ser HH:MM')
    eatingStart = body.eating_start
  }
  if (fastingHours !== null && !eatingStart) eatingStart = '12:00'
  let fastStartedAt = user.fast_started_at
  if (body.fast_started_at !== undefined) {
    if (body.fast_started_at === null) fastStartedAt = null
    else {
      const ms = Date.parse(String(body.fast_started_at))
      if (Number.isNaN(ms) || ms > Date.now() + 5 * 60_000 || ms < Date.now() - 48 * 3_600_000) fail(400, 'El inicio del ayuno debe ser de las últimas 48 horas')
      fastStartedAt = new Date(ms).toISOString()
    }
  }

  // Recordatorios a la hora de comer: true o false.
  let reminders = user.reminders
  if (body.reminders !== undefined) {
    if (typeof body.reminders !== 'boolean') fail(400, 'reminders debe ser true o false')
    reminders = body.reminders
  }

  await c.env.DB.prepare(
    `UPDATE users SET full_name = ?, role = ?, daily_kcal_goal = ?, ai_consent_at = ?, goal = ?, avo_style = ?, reminders = ?,
       protein_g_goal = ?, fasting_hours = ?, eating_start = ?, fast_started_at = ? WHERE id = ?`,
  )
    .bind(fullName, role, goal, consent, objective, avoStyle, reminders ? 1 : 0, protein, fastingHours, eatingStart, fastStartedAt, user.id)
    .run()
  return c.json({
    ...user,
    full_name: fullName,
    role,
    daily_kcal_goal: goal,
    ai_consent_at: consent,
    goal: objective,
    avo_style: avoStyle,
    reminders,
    protein_g_goal: protein,
    fasting_hours: fastingHours,
    eating_start: eatingStart,
    fast_started_at: fastStartedAt,
  })
})

// Borrar la cuenta y todo lo suyo: fotos, comidas, cómo se ha sentido, comentarios, vínculos y sesiones. No se puede deshacer.
peopleRoutes.delete('/me', async (c) => {
  const { id, email } = c.var.user
  // Las fotos primero: si algo falla, la cuenta sigue ahí y se puede reintentar (al revés quedarían fotos sin dueño).
  await deletePhotos(c.env, `${id}/`)
  const db = c.env.DB
  await db.batch([
    db.prepare('DELETE FROM meal_comments WHERE author_id = ?1 OR meal_id IN (SELECT id FROM meals WHERE user_id = ?1)').bind(id),
    db.prepare('DELETE FROM avo_messages WHERE user_id = ?').bind(id),
    db.prepare('DELETE FROM moods WHERE user_id = ?').bind(id),
    db.prepare('DELETE FROM meals WHERE user_id = ?').bind(id),
    db.prepare('DELETE FROM care_links WHERE patient_id = ?1 OR nutritionist_id = ?1').bind(id),
    db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').bind(id),
    db.prepare('DELETE FROM reminders_sent WHERE user_id = ?').bind(id),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
    db.prepare('DELETE FROM auth_codes WHERE email = ?').bind(email),
    db.prepare('DELETE FROM users WHERE id = ?').bind(id),
  ])
  return c.json({ ok: true })
})

// Perfil de otra persona: solo si están vinculados.
peopleRoutes.get('/users/:id', async (c) => {
  const id = c.req.param('id')
  if (id !== c.var.user.id && !(await areLinked(c.env, c.var.user.id, id))) fail(404, 'No encontrado')
  const user = await c.env.DB.prepare(
    'SELECT id, email, full_name, role, daily_kcal_goal, goal, protein_g_goal, carbs_g_goal, fat_g_goal, goals_set_by FROM users WHERE id = ?',
  )
    .bind(id)
    .first<User>()
  if (!user) fail(404, 'No encontrado')
  return c.json(user)
})

// ── Paciente → sus nutriólogas ──
peopleRoutes.get('/care/nutritionists', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.full_name FROM care_links l JOIN users u ON u.id = l.nutritionist_id
     WHERE l.patient_id = ? ORDER BY l.created_at`,
  )
    .bind(c.var.user.id)
    .all<PublicUser>()
  return c.json(results)
})

peopleRoutes.post('/care/nutritionists', async (c) => {
  const { email } = await c.req.json<{ email?: string }>().catch(() => ({ email: undefined }))
  const target = await c.env.DB.prepare("SELECT id, email, full_name FROM users WHERE email = ? AND role = 'nutritionist'")
    .bind(String(email ?? '').trim().toLowerCase())
    .first<PublicUser>()
  if (!target) fail(404, 'No encontramos una nutrióloga registrada con ese correo')
  if (target.id === c.var.user.id) fail(400, 'No puedes vincularte contigo misma')

  await c.env.DB.prepare('INSERT OR IGNORE INTO care_links (patient_id, nutritionist_id) VALUES (?, ?)')
    .bind(c.var.user.id, target.id)
    .run()
  return c.json(target, 201)
})

peopleRoutes.delete('/care/nutritionists/:id', async (c) => {
  await unlink(c.env, c.var.user.id, c.req.param('id'))
  return c.json({ ok: true })
})

/** Desvincula y, si esa nutrióloga le había puesto las metas, el paciente las puede volver a cambiar (se quedan como estaban). */
async function unlink(env: AppEnv['Bindings'], patientId: string, nutritionistId: string) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM care_links WHERE patient_id = ? AND nutritionist_id = ?').bind(patientId, nutritionistId),
    env.DB.prepare('UPDATE users SET goals_set_by = NULL WHERE id = ? AND goals_set_by = ?').bind(patientId, nutritionistId),
  ])
}

// ── Nutrióloga → sus pacientes ──
peopleRoutes.get('/care/patients', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.full_name FROM care_links l JOIN users u ON u.id = l.patient_id
     WHERE l.nutritionist_id = ? ORDER BY coalesce(u.full_name, u.email) COLLATE NOCASE`,
  )
    .bind(c.var.user.id)
    .all<PublicUser>()
  return c.json(results)
})

peopleRoutes.delete('/care/patients/:id', async (c) => {
  await unlink(c.env, c.req.param('id'), c.var.user.id)
  return c.json({ ok: true })
})
