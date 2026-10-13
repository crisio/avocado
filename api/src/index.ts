import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from './env'
import { authRoutes, requireUser } from './auth'
import { cravingRoutes } from './cravings'
import { streakRoutes } from './streaks'
import { mealRoutes } from './meals'
import { insightRoutes, moodRoutes } from './moods'
import { avoRoutes } from './avo'
import { budgetRoutes } from './budget'
import { peopleRoutes } from './people'
import { verifyPhotoSignature } from './photos'

const app = new Hono<AppEnv>()

app.use('*', async (c, next) => {
  const allowed = c.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowHeaders: ['Authorization', 'Content-Type'],
    maxAge: 86400,
  })(c, next)
})

app.get('/', (c) => c.json({ name: 'avocado-api', ok: true }))

// Sin AUTH_SECRET no hay forma segura de firmar sesiones ni fotos: mejor no arrancar.
app.use('*', async (c, next) => {
  if ((c.env.AUTH_SECRET ?? '').length < 32) {
    console.error('AUTH_SECRET falta o es muy corto (mínimo 32 caracteres)')
    return c.json({ error: 'El servidor no está configurado todavía.' }, 503)
  }
  await next()
})

// Fotos: públicas solo con firma válida (ver photos.ts)
app.get('/photos/:owner/:file', async (c) => {
  const key = `${c.req.param('owner')}/${c.req.param('file')}`
  if (!(await verifyPhotoSignature(c.env, key, c.req.query('exp'), c.req.query('sig')))) {
    return c.json({ error: 'Enlace inválido o vencido' }, 403)
  }
  const object = await c.env.PHOTOS.get(key)
  if (!object) return c.json({ error: 'No encontrado' }, 404)
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'image/jpeg',
      'Cache-Control': 'private, max-age=3600',
    },
  })
})

app.route('/auth', authRoutes)

app.use('/me', requireUser)
app.use('/users/*', requireUser)
app.use('/care/*', requireUser)
app.use('/meals', requireUser)
app.use('/meals/*', requireUser)
app.use('/cravings', requireUser)
app.use('/streak', requireUser)
app.use('/moods', requireUser)
app.use('/moods/*', requireUser)
app.use('/insights', requireUser)
app.use('/avo/*', requireUser)
app.use('/budget', requireUser)
app.route('/', peopleRoutes)
app.route('/meals', mealRoutes)
app.route('/cravings', cravingRoutes)
app.route('/streak', streakRoutes)
app.route('/moods', moodRoutes)
app.route('/insights', insightRoutes)
app.route('/avo', avoRoutes)
app.route('/budget', budgetRoutes)

app.notFound((c) => c.json({ error: 'No encontrado' }, 404))

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status)
  console.error(err)
  return c.json({ error: 'Algo salió mal. Intenta de nuevo.' }, 500)
})

export default app
