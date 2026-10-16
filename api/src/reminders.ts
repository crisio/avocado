import { Hono } from 'hono'
import type { AppEnv, Env, User } from './env'
import { fail } from './errors'
import { streakFrom } from './streaks'
import { sendPush, type VapidKeys } from './webpush'

/**
 * Recordatorios a la hora de comer. El servidor decide qué y cuándo (y no avisa si esa comida ya está registrada):
 * - iOS pide GET /reminders y los programa como notificaciones locales en el teléfono.
 * - La web se suscribe a Web Push y el cron (cada 15 min) le manda el que toque.
 * Los textos usan la personalidad de Avo del paciente.
 */

export const REMINDER_KINDS = ['desayuno', 'comida', 'cena', 'racha'] as const
export type ReminderKind = (typeof REMINDER_KINDS)[number]

/** Hora local del aviso y desde qué hora una comida registrada ya cuenta para no avisar. */
const WINDOWS: { kind: ReminderKind; at: number; since: number }[] = [
  { kind: 'desayuno', at: 8 * 60 + 30, since: 5 * 60 },
  { kind: 'comida', at: 13 * 60, since: 11 * 60 },
  { kind: 'cena', at: 19 * 60 + 30, since: 17 * 60 + 30 },
  // Solo si hoy no ha registrado nada y la racha sigue viva (registró ayer).
  { kind: 'racha', at: 21 * 60, since: 0 },
]

const TITLES: Record<ReminderKind, string> = {
  desayuno: 'Hora del desayuno 🍳',
  comida: 'Hora de comer 🍽️',
  cena: 'Hora de cenar 🌙',
  racha: 'Tu racha 🔥',
}

type Texts = Record<ReminderKind | 'primera', string[]>

// {name}: su primer nombre (o "tú"); {streak}: días seguidos. Nunca sobre su cuerpo ni sobre cuánto come.
const PICANTE: Texts = {
  desayuno: [
    '¿Desayuno de verdad o puro café otra vez, {name}? Foto y te digo 📸',
    'Buenos días, {name}. Tu desayuno no se va a fotografiar solito.',
    'Avo amaneció con hambre… de fotos. ¿Qué desayunaste?',
  ],
  comida: [
    'Hora de comer, {name}. Foto antes del primer bocado 👀',
    '¿Ya almorzaste o lo estás pensando? Tómale foto y te digo qué opino.',
    'Ese plato no se registra solo, {name}. Yo espero aquí 🧍',
  ],
  cena: [
    '¿Qué hay de cenar, {name}? Foto y te digo qué opino 🥑',
    'Antes de cenar: foto. Después: lo que quieras.',
    'Cena con foto, {name}. Sin foto no me entero y me pongo dramático.',
  ],
  racha: [
    'Llevas {streak} días seguidos y hoy nada, {name}. Una foto y la salvas 🔥',
    'Tu racha de {streak} días está en peligro. ¿Me vas a dejar así? 🔥',
  ],
  primera: [
    '{name}, ¿y si hoy es el día? Tómale foto a tu comida y en segundos ves sus calorías.',
    'Sigo esperando tu primera foto, {name}. Prometo no juzgar (mucho) 😏',
  ],
}

const TRANQUILO: Texts = {
  desayuno: ['Buenos días, {name}. ¿Le tomas foto a tu desayuno?', '¿Ya desayunaste, {name}? Regístralo con una foto.'],
  comida: ['Es hora de comer, {name}. No olvides la foto de tu plato.', '¿Qué vas a comer hoy, {name}? Tómale foto y yo te ayudo.'],
  cena: ['Hora de cenar, {name}. Una foto y listo.', '¿Ya cenaste, {name}? Regístralo para cerrar tu día.'],
  racha: ['Llevas {streak} días seguidos, {name}. Registra algo hoy para no perder tu racha 🔥'],
  primera: ['{name}, tómale foto a tu comida y en segundos ves sus calorías y macros.'],
}

export interface Reminder {
  id: string
  kind: ReminderKind
  /** Cuándo avisar (ISO, UTC). */
  at: string
  title: string
  body: string
}

/** Lo que hace falta saber del paciente para decidir los avisos de un día. */
export interface ReminderState {
  user: Pick<User, 'id' | 'full_name' | 'avo_style'>
  /** Minutos como Date.getTimezoneOffset() (Honduras = 360). */
  offset: number
  /** Cuándo comió (ISO), de los últimos días. */
  mealTimes: string[]
  /** Si alguna vez ha registrado una comida. */
  hasMeals: boolean
}

const DAY_MS = 86_400_000
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Elección fija por paciente, día y tipo: el mismo aviso no cambia de texto entre iOS y la web. */
function pick(list: string[], seed: string) {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return list[h % list.length]
}

/**
 * Avisos de hoy a `days` días que caen después de `from` (por omisión, ahora). Hoy se salta las comidas ya
 * registradas; el de la racha solo se planea para hoy (para otro día no se sabe si seguirá viva).
 */
export function planReminders(state: ReminderState, now: number, days = 7, from = now): Reminder[] {
  const { user, offset } = state
  const name = (user.full_name ?? '').trim().split(/\s+/)[0] || 'tú'
  const texts = user.avo_style === 'tranquilo' ? TRANQUILO : PICANTE
  const localNow = now - offset * 60_000
  const today = isoDay(localNow)
  const todayStart = Date.parse(`${today}T00:00:00Z`)

  // Comidas de hoy en minutos locales; días con comida para la racha.
  const localMeals = state.mealTimes.map((iso) => Date.parse(iso) - offset * 60_000).filter((ms) => ms <= localNow + 5 * 60_000)
  const todayMinutes = localMeals.filter((ms) => isoDay(ms) === today).map((ms) => Math.floor((ms - todayStart) / 60_000))
  const streak = streakFrom(new Set(localMeals.map(isoDay)), today)

  const out: Reminder[] = []
  for (let d = 0; d < days; d++) {
    const date = isoDay(todayStart + d * DAY_MS)
    for (const w of WINDOWS) {
      const at = Date.parse(`${date}T00:00:00Z`) + (w.at + offset) * 60_000
      if (at <= from) continue
      if (w.kind === 'racha') {
        if (d > 0 || todayMinutes.length > 0 || streak.current === 0) continue
      } else if (d === 0 && todayMinutes.some((m) => m >= w.since)) continue

      const pool = w.kind !== 'racha' && !state.hasMeals ? texts.primera : texts[w.kind]
      const body = pick(pool, `${user.id}|${date}|${w.kind}`).replaceAll('{name}', name).replaceAll('{streak}', String(streak.current))
      out.push({
        id: `${w.kind}-${date}`,
        kind: w.kind,
        at: new Date(at).toISOString(),
        title: TITLES[w.kind],
        body,
      })
    }
  }
  return out
}

async function reminderState(env: Env, user: User, offset: number, now: number): Promise<ReminderState> {
  const [recent, any] = await Promise.all([
    env.DB.prepare('SELECT eaten_at FROM meals WHERE user_id = ? AND eaten_at >= ?')
      .bind(user.id, new Date(now - 30 * DAY_MS).toISOString())
      .all<{ eaten_at: string }>(),
    env.DB.prepare('SELECT 1 AS x FROM meals WHERE user_id = ? LIMIT 1').bind(user.id).first(),
  ])
  return { user, offset, mealTimes: recent.results.map((r) => r.eaten_at), hasMeals: Boolean(any) }
}

const wantsReminders = (user: User) => user.role === 'patient' && user.reminders

function vapidOf(env: Env): VapidKeys | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT || 'mailto:avocado@cristopherpineda.com' }
}

function offsetOf(value: unknown) {
  const offset = Number(value ?? 0)
  if (!Number.isInteger(offset) || Math.abs(offset) > 14 * 60) fail(400, 'offset inválido')
  return offset
}

export const reminderRoutes = new Hono<AppEnv>()

// Los avisos de los próximos días (iOS los programa en el teléfono). ?offset=&days= (1 a 7)
reminderRoutes.get('/reminders', async (c) => {
  const user = c.var.user
  const offset = offsetOf(c.req.query('offset'))
  const days = Math.min(7, Math.max(1, Number(c.req.query('days')) || 7))
  // La hora del teléfono queda guardada para el cron de la web.
  if (user.tz_offset !== offset) await c.env.DB.prepare('UPDATE users SET tz_offset = ? WHERE id = ?').bind(offset, user.id).run()
  if (!wantsReminders(user)) return c.json({ enabled: false, reminders: [] })
  const now = Date.now()
  return c.json({ enabled: true, reminders: planReminders(await reminderState(c.env, user, offset, now), now, days) })
})

// Llave pública de VAPID para suscribirse (null: el servidor no tiene Web Push configurado).
reminderRoutes.get('/push/key', (c) => c.json({ publicKey: vapidOf(c.env)?.publicKey ?? null }))

// Suscripción de Web Push de este navegador. JSON: { endpoint, keys: { p256dh, auth }, offset }
reminderRoutes.post('/push/subscriptions', async (c) => {
  const body = await c.req.json<{ endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown }; offset?: unknown }>().catch(() => fail(400, 'JSON inválido'))
  const endpoint = String(body.endpoint ?? '')
  const p256dh = String(body.keys?.p256dh ?? '')
  const auth = String(body.keys?.auth ?? '')
  let url: URL | null = null
  try {
    url = new URL(endpoint)
  } catch {}
  if (!url || url.protocol !== 'https:' || endpoint.length > 1000) fail(400, 'Suscripción inválida')
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,30}$/.test(auth)) fail(400, 'Suscripción inválida')
  const offset = offsetOf(body.offset)

  // Un navegador es de una sola cuenta: si otra cuenta lo tenía, pasa a esta.
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = ?2, p256dh = ?3, auth = ?4`,
    ).bind(endpoint, c.var.user.id, p256dh, auth),
    c.env.DB.prepare('UPDATE users SET tz_offset = ? WHERE id = ?').bind(offset, c.var.user.id),
  ])
  return c.json({ ok: true }, 201)
})

reminderRoutes.delete('/push/subscriptions', async (c) => {
  const { endpoint } = await c.req.json<{ endpoint?: unknown }>().catch(() => ({ endpoint: undefined }))
  await c.env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').bind(String(endpoint ?? ''), c.var.user.id).run()
  return c.json({ ok: true })
})

/**
 * Cron (cada 15 min): a cada paciente con Web Push le manda el aviso que le toque ahorita (con hasta una hora de
 * retraso, por si un cron falla), una sola vez por día y tipo.
 */
export async function sendDueReminders(env: Env, now = Date.now()) {
  const vapid = vapidOf(env)
  if (!vapid) return { sent: 0 }
  const { results: users } = await env.DB.prepare(
    `SELECT u.* FROM users u WHERE u.role = 'patient' AND u.reminders = 1 AND u.tz_offset IS NOT NULL
       AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = u.id)`,
  ).all<User>()

  let sent = 0
  for (const user of users) {
    // El que tocaba en la última hora y sigue haciendo falta (no registró esa comida).
    const state = await reminderState(env, user, user.tz_offset!, now)
    const reminder = planReminders(state, now, 1, now - 3_600_000)
      .filter((r) => Date.parse(r.at) <= now)
      .at(-1)
    if (!reminder) continue

    const day = reminder.id.slice(reminder.kind.length + 1)
    const claimed = await env.DB.prepare('INSERT OR IGNORE INTO reminders_sent (user_id, day, kind) VALUES (?, ?, ?)').bind(user.id, day, reminder.kind).run()
    if (!claimed.meta.changes) continue

    const { results: subs } = await env.DB.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?')
      .bind(user.id)
      .all<{ endpoint: string; p256dh: string; auth: string }>()
    for (const sub of subs) {
      try {
        const status = await sendPush(sub, { title: reminder.title, body: reminder.body, url: 'nueva', tag: reminder.kind }, vapid)
        if (status === 404 || status === 410) await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(sub.endpoint).run()
        else if (status < 300) sent++
        else console.error('push', status, new URL(sub.endpoint).host)
      } catch (err) {
        console.error('push', err instanceof Error ? err.message : err)
      }
    }
  }
  return { sent }
}
