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

export const REMINDER_KINDS = ['desayuno', 'comida', 'cena', 'racha', 'ventana', 'cierre', 'semana'] as const
export type ReminderKind = (typeof REMINDER_KINDS)[number]

type Window = { kind: ReminderKind; at: number; since: number; habit?: boolean }

/** Hora local del aviso (por omisión) y desde qué hora una comida registrada ya cuenta para no avisar. */
const WINDOWS: Window[] = [
  { kind: 'desayuno', at: 8 * 60 + 30, since: 5 * 60 },
  { kind: 'comida', at: 13 * 60, since: 11 * 60 },
  { kind: 'cena', at: 19 * 60 + 30, since: 17 * 60 + 30 },
  // Solo si hoy no ha registrado nada y la racha sigue viva (registró ayer).
  { kind: 'racha', at: 21 * 60, since: 0 },
]

/** En qué rango (minutos locales) cae cada comida, para aprender a qué hora la hace. */
const MEAL_RANGES = { desayuno: [5 * 60, 10 * 60 + 30], comida: [10 * 60 + 30, 16 * 60], cena: [17 * 60, 23 * 60 + 30] } as const
type MealKind = keyof typeof MEAL_RANGES

/** Domingo a las 6 p. m.: cómo le fue en la semana. */
const WEEKLY: Window = { kind: 'semana', at: 18 * 60, since: Number.POSITIVE_INFINITY }

/**
 * Los avisos de comida se acomodan a su costumbre (sus últimos 14 días): si hizo esa comida 3 días o más, el aviso va
 * 15 min antes de su hora de siempre; si ya tiene rutina (5+ días registrando) y nunca registra esa comida (p. ej. la
 * cena), no se le avisa. Con pocos datos, las horas de siempre.
 */
export function learnWindows(localMeals: number[], todayStart: number): Window[] {
  const byDay = new Map<string, number[]>()
  for (const ms of localMeals) {
    if (ms >= todayStart || ms < todayStart - 14 * DAY_MS) continue
    const day = isoDay(ms)
    byDay.set(day, [...(byDay.get(day) ?? []), Math.floor((ms - Date.parse(`${day}T00:00:00Z`)) / 60_000)])
  }
  const out: Window[] = []
  for (const w of WINDOWS) {
    if (w.kind === 'racha') {
      out.push(w)
      continue
    }
    const [start, end] = MEAL_RANGES[w.kind as MealKind]
    const firsts = [...byDay.values()].map((mins) => Math.min(...mins.filter((m) => m >= start && m < end))).filter(Number.isFinite).sort((a, b) => a - b)
    if (firsts.length >= 3) {
      const usual = firsts[Math.floor(firsts.length / 2)]
      const at = Math.min(Math.max(Math.round((usual - 15) / 5) * 5, start), end - 30)
      out.push({ kind: w.kind, at, since: start, habit: true })
    } else if (!(byDay.size >= 5 && firsts.length === 0)) out.push(w)
  }
  return out
}

/** 11:30 a. m. */
function clock(minutes: number) {
  const h = Math.floor(minutes / 60) % 24
  return `${h % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`
}

/** Quien hace ayuno recibe otros: cuando abre su ventana de comida y 30 min antes de que cierre. */
function fastingWindows(hours: number, eatingStart: string) {
  const start = Number(eatingStart.slice(0, 2)) * 60 + Number(eatingStart.slice(3, 5))
  return [
    { kind: 'ventana' as const, at: start, since: start - 120 },
    { kind: 'cierre' as const, at: start + (24 - hours) * 60 - 30, since: Number.POSITIVE_INFINITY },
  ]
}

const TITLES: Record<ReminderKind, string> = {
  desayuno: 'Hora del desayuno 🍳',
  comida: 'Hora de comer 🍽️',
  cena: 'Hora de cenar 🌙',
  racha: 'Tu racha 🔥',
  ventana: 'Tu ventana de comida 🍽️',
  semana: 'Tu semana 📊',
  cierre: 'Tu ventana cierra pronto ⏳',
}

type Texts = Record<ReminderKind | 'primera', string[]> & {
  /** Cuando ya conocemos su hora ({time}): "a tu hora de siempre". */
  habit: Record<MealKind, string[]>
  /** Resumen del domingo según cuántos días registró ({days}). */
  semanaBien: string[]
  semanaMedio: string[]
  semanaPoco: string[]
}

// {name}: su primer nombre (o "tú"); {streak}: días seguidos; {hours}: horas de ayuno. Nunca sobre su cuerpo ni sobre
// cuánto come.
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
  ventana: [
    '¡{hours} horas de ayuno y sigues vivo, {name}! 💪 Tu ventana abre ya: rómpelo con proteína y con foto.',
    'Se acabó el ayuno, {name}. Ahora sí, a comer rico (y a tomarle foto) 📸',
  ],
  cierre: [
    'Tu ventana cierra en 30 min, {name}. ¿Última comida? Foto y a ayunar 🕗',
    'Última llamada: en 30 min empieza tu ayuno. Si comes algo, que sea con foto.',
  ],
  habit: {
    desayuno: ['Ya casi es tu hora de desayunar ({time}), {name}. Ya me sé tu horario 😏 Foto y te digo.', 'Tu desayuno de las {time} se acerca, {name}. Aquí te espero con la cámara 📸'],
    comida: ['Ya casi es tu hora de comer ({time}), {name}. Foto antes del primer bocado 👀', 'Son casi las {time}, tu hora de comer, {name}. Yo puntual, ¿y tú? 🍽️'],
    cena: ['Ya casi es tu hora de cenar ({time}), {name}. Foto y te cuento qué opino 🌙', 'Tu cena de las {time} se acerca, {name}. Cierra el día con foto.'],
  },
  semana: ['Domingo de repaso, {name}: mira cómo te fue esta semana 📊'],
  semanaBien: ['{days} de 7 días registrados esta semana, {name}. Ni yo me la creía 💪 Mira tu resumen.', '{days} días de 7, {name}. Esto ya es costumbre y se nota. ¡Así se hace! 🔥'],
  semanaMedio: ['{days} de 7 días esta semana, {name}. Nada mal… pero yo sé que puedes más 😏 Mira tu resumen.'],
  semanaPoco: ['Esta semana casi no supe de ti, {name} 🥲 Mañana una foto y arrancamos de nuevo, sin drama.'],
}

const TRANQUILO: Texts = {
  desayuno: ['Buenos días, {name}. ¿Le tomas foto a tu desayuno?', '¿Ya desayunaste, {name}? Regístralo con una foto.'],
  comida: ['Es hora de comer, {name}. No olvides la foto de tu plato.', '¿Qué vas a comer hoy, {name}? Tómale foto y yo te ayudo.'],
  cena: ['Hora de cenar, {name}. Una foto y listo.', '¿Ya cenaste, {name}? Regístralo para cerrar tu día.'],
  racha: ['Llevas {streak} días seguidos, {name}. Registra algo hoy para no perder tu racha 🔥'],
  primera: ['{name}, tómale foto a tu comida y en segundos ves sus calorías y macros.'],
  ventana: ['Completaste tus {hours} horas de ayuno, {name}. Tu ventana de comida ya abrió.'],
  cierre: ['Tu ventana de comida cierra en 30 minutos, {name}.'],
  habit: {
    desayuno: ['Ya casi es tu hora de desayunar ({time}), {name}. ¿Le tomas foto?'],
    comida: ['Ya casi es tu hora de comer ({time}), {name}. No olvides la foto.'],
    cena: ['Ya casi es tu hora de cenar ({time}), {name}. Una foto y listo.'],
  },
  semana: ['Es domingo, {name}: mira cómo te fue esta semana 📊'],
  semanaBien: ['Registraste {days} de 7 días esta semana, {name}. ¡Qué constancia! 💚'],
  semanaMedio: ['Registraste {days} de 7 días esta semana, {name}. Vas bien; esta semana vamos por más.'],
  semanaPoco: ['Te extrañé esta semana, {name}. Mañana es buen día para retomar 💚'],
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
  /** Plan de ayuno (horas y hora local "HH:MM" en que abre la ventana), si hace. */
  fasting?: { hours: number; eatingStart: string } | null
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
  const windows: Window[] = [...(state.fasting ? fastingWindows(state.fasting.hours, state.fasting.eatingStart) : learnWindows(localMeals, todayStart)), WEEKLY]
  const weekDays = new Set(localMeals.filter((ms) => ms > localNow - 7 * DAY_MS).map(isoDay)).size
  for (let d = 0; d < days; d++) {
    const date = isoDay(todayStart + d * DAY_MS)
    for (const w of windows) {
      const at = Date.parse(`${date}T00:00:00Z`) + (w.at + offset) * 60_000
      if (at <= from) continue
      if (w.kind === 'racha') {
        if (d > 0 || todayMinutes.length > 0 || streak.current === 0) continue
      } else if (w.kind === 'semana') {
        if (new Date(`${date}T00:00:00Z`).getUTCDay() !== 0 || !state.hasMeals) continue
      } else if (d === 0 && todayMinutes.some((m) => m >= w.since)) continue

      // El resumen del domingo con sus números solo si es hoy (para otro día todavía no se sabe).
      const pool =
        w.kind === 'semana'
          ? d > 0
            ? texts.semana
            : weekDays >= 5
              ? texts.semanaBien
              : weekDays >= 2
                ? texts.semanaMedio
                : texts.semanaPoco
          : !state.fasting && w.kind !== 'racha' && !state.hasMeals
            ? texts.primera
            : w.habit
              ? texts.habit[w.kind as MealKind]
              : texts[w.kind]
      const body = pick(pool, `${user.id}|${date}|${w.kind}`)
        .replaceAll('{name}', name)
        .replaceAll('{streak}', String(streak.current))
        .replaceAll('{hours}', String(state.fasting?.hours ?? ''))
        .replaceAll('{time}', clock(w.at + 15))
        .replaceAll('{days}', String(weekDays))
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
  return {
    user,
    offset,
    mealTimes: recent.results.map((r) => r.eaten_at),
    hasMeals: Boolean(any),
    fasting: user.fasting_hours ? { hours: user.fasting_hours, eatingStart: user.eating_start ?? '12:00' } : null,
  }
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
