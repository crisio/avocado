import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { AppEnv, Env, User } from './env'
import { hmac, randomCode, randomToken, safeEqual, sha256 } from './crypto'
import { loginCodeMail, sendMail } from './email'
import { fail } from './errors'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const CODE_TTL = 10 * MINUTE
const RESEND_AFTER = MINUTE
const MAX_SENDS_PER_HOUR = 5
const MAX_ATTEMPTS = 5
const SESSION_TTL = 90 * DAY

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeEmail(value: unknown) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!EMAIL_RE.test(email) || email.length > 254) fail(400, 'Escribe un correo válido')
  return email
}

const codeHash = (env: Env, email: string, code: string) => hmac(env.AUTH_SECRET, `login:${email}:${code}`)

/**
 * Cuenta para la revisión de la App Store: los revisores de Apple no reciben nuestros correos, así que ese correo
 * (REVIEW_EMAIL) entra con un código fijo (REVIEW_CODE, secreto). Los límites de envíos e intentos siguen igual.
 */
function reviewCode(env: Env, email: string) {
  const code = env.REVIEW_CODE ?? ''
  return env.REVIEW_EMAIL && email === env.REVIEW_EMAIL.trim().toLowerCase() && /^\d{6}$/.test(code) ? code : null
}

interface CodeRow {
  code_hash: string
  expires_at: number
  attempts: number
  sent_at: number
  window_start: number
  sends_in_window: number
}

export const authRoutes = new Hono<AppEnv>()

// 1) Pedir un código: se envía por correo. Siempre responde igual exista o no la cuenta.
authRoutes.post('/code', async (c) => {
  const { email: raw } = await c.req.json<{ email?: string }>().catch(() => ({ email: undefined }))
  const email = normalizeEmail(raw)
  const now = Date.now()

  const prev = await c.env.DB.prepare('SELECT * FROM auth_codes WHERE email = ?').bind(email).first<CodeRow>()
  if (prev && now - prev.sent_at < RESEND_AFTER) fail(429, 'Espera un minuto antes de pedir otro código')
  const sameWindow = prev && now - prev.window_start < 60 * MINUTE
  if (sameWindow && prev.sends_in_window >= MAX_SENDS_PER_HOUR) fail(429, 'Pediste muchos códigos. Intenta en una hora.')

  const fixed = reviewCode(c.env, email)
  const code = fixed ?? randomCode()
  await c.env.DB.prepare(
    `INSERT INTO auth_codes (email, code_hash, expires_at, attempts, sent_at, window_start, sends_in_window)
     VALUES (?1, ?2, ?3, 0, ?4, ?5, ?6)
     ON CONFLICT (email) DO UPDATE SET code_hash = ?2, expires_at = ?3, attempts = 0, sent_at = ?4,
       window_start = ?5, sends_in_window = ?6`,
  )
    .bind(email, await codeHash(c.env, email, code), now + CODE_TTL, now, sameWindow ? prev.window_start : now, sameWindow ? prev.sends_in_window + 1 : 1)
    .run()
  if (fixed) return c.json({ ok: true })

  try {
    await sendMail(c.env, loginCodeMail(email, code, c.env.APP_URL))
  } catch (err) {
    console.error('sendMail', err)
    fail(502, 'No pudimos enviar el correo. Intenta de nuevo en un momento.')
  }
  return c.json({ ok: true })
})

// 2) Verificar el código: crea la cuenta si es nueva y regresa un token de sesión.
authRoutes.post('/verify', async (c) => {
  const body = await c.req.json<{ email?: string; code?: string }>().catch(() => ({}) as { email?: string; code?: string })
  const email = normalizeEmail(body.email)
  const code = String(body.code ?? '').replace(/\D/g, '')
  const now = Date.now()

  const row = await c.env.DB.prepare('SELECT * FROM auth_codes WHERE email = ?').bind(email).first<CodeRow>()
  if (!row || row.expires_at < now) fail(400, 'El código venció. Pide uno nuevo.')
  if (row.attempts >= MAX_ATTEMPTS) fail(429, 'Demasiados intentos. Pide un código nuevo.')

  if (code.length !== 6 || !safeEqual(row.code_hash, await codeHash(c.env, email, code))) {
    await c.env.DB.prepare('UPDATE auth_codes SET attempts = attempts + 1 WHERE email = ?').bind(email).run()
    fail(400, 'Código incorrecto')
  }

  await c.env.DB.prepare('DELETE FROM auth_codes WHERE email = ?').bind(email).run()
  let user = await c.env.DB.prepare('SELECT id, email, full_name, role, daily_kcal_goal, ai_consent_at, goal FROM users WHERE email = ?').bind(email).first<User>()
  if (!user) {
    user = { id: crypto.randomUUID(), email, full_name: null, role: null, daily_kcal_goal: null, ai_consent_at: null, goal: null }
    await c.env.DB.prepare('INSERT INTO users (id, email) VALUES (?, ?)').bind(user.id, email).run()
  }

  const token = randomToken()
  await c.env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, refreshed_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), user.id, now + SESSION_TTL, now)
    .run()

  return c.json({ token, user })
})

/** Exige `Authorization: Bearer <token>` válido y deja al usuario en c.var.user. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const token = c.req.header('Authorization')?.match(/^Bearer (.+)$/)?.[1]
  if (!token) fail(401, 'Inicia sesión')

  const hash = await sha256(token)
  const now = Date.now()
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.full_name, u.role, u.daily_kcal_goal, u.ai_consent_at, u.goal, s.refreshed_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(hash, now)
    .first<User & { refreshed_at: number }>()
  if (!row) fail(401, 'Tu sesión expiró. Vuelve a entrar.')

  // Sesión deslizante: mientras uses la app no expira.
  if (now - row.refreshed_at > DAY) {
    await c.env.DB.prepare('UPDATE sessions SET expires_at = ?, refreshed_at = ? WHERE token_hash = ?')
      .bind(now + SESSION_TTL, now, hash)
      .run()
  }

  const { refreshed_at: _, ...user } = row
  c.set('user', user)
  c.set('sessionHash', hash)
  await next()
})

authRoutes.post('/logout', requireUser, async (c) => {
  await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(c.var.sessionHash).run()
  return c.json({ ok: true })
})
