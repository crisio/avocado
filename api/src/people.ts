import { Hono } from 'hono'
import type { AppEnv, User } from './env'
import { areLinked } from './access'
import { fail } from './errors'

type PublicUser = Pick<User, 'id' | 'email' | 'full_name'>

export const peopleRoutes = new Hono<AppEnv>()

peopleRoutes.get('/me', (c) => c.json(c.var.user))

// Nombre editable siempre; el rol solo se elige una vez (al terminar el registro).
peopleRoutes.patch('/me', async (c) => {
  const user = c.var.user
  const body = await c.req.json<{ full_name?: unknown; role?: unknown }>().catch(() => ({}) as Record<string, unknown>)

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

  await c.env.DB.prepare('UPDATE users SET full_name = ?, role = ? WHERE id = ?').bind(fullName, role, user.id).run()
  return c.json({ ...user, full_name: fullName, role })
})

// Perfil de otra persona: solo si están vinculados.
peopleRoutes.get('/users/:id', async (c) => {
  const id = c.req.param('id')
  if (id !== c.var.user.id && !(await areLinked(c.env, c.var.user.id, id))) fail(404, 'No encontrado')
  const user = await c.env.DB.prepare('SELECT id, email, full_name, role FROM users WHERE id = ?').bind(id).first<User>()
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
  await c.env.DB.prepare('DELETE FROM care_links WHERE patient_id = ? AND nutritionist_id = ?')
    .bind(c.var.user.id, c.req.param('id'))
    .run()
  return c.json({ ok: true })
})

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
  await c.env.DB.prepare('DELETE FROM care_links WHERE nutritionist_id = ? AND patient_id = ?')
    .bind(c.var.user.id, c.req.param('id'))
    .run()
  return c.json({ ok: true })
})
