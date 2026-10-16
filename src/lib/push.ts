import { api } from './api'
import { detectPlatform, isStandalone } from './install'
import type { User } from './types'

/** ¿Este navegador puede recibir push? En iPhone solo con la app instalada en Inicio. */
export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** iPhone/iPad con Safari (u otro) sin instalar: ahí no hay push hasta agregar la app a Inicio. */
export function needsInstallForPush() {
  const platform = detectPlatform()
  return (platform === 'ios-safari' || platform === 'ios-other') && !isStandalone()
}

export const permission = (): NotificationPermission | 'unsupported' => ('Notification' in window ? Notification.permission : 'unsupported')

async function publicKey() {
  try {
    return (await api<{ publicKey: string | null }>('/push/key')).publicKey
  } catch {
    return null
  }
}

/** ¿El servidor tiene push configurado? (si no, se esconde todo). */
export async function pushConfigured() {
  return (await publicKey()) !== null
}

function keyBytes(base64url: string) {
  const raw = atob(base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '='))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function currentSubscription() {
  if (!pushSupported()) return null
  try {
    const reg = await navigator.serviceWorker.ready
    return await reg.pushManager.getSubscription()
  } catch {
    return null
  }
}

/** ¿Este dispositivo tiene una suscripción activa? */
export async function hasSubscription() {
  return (await currentSubscription()) !== null
}

function send(sub: PushSubscription) {
  const json = sub.toJSON()
  return api('/push/subscriptions', {
    method: 'POST',
    json: { endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth }, offset: new Date().getTimezoneOffset() },
  })
}

/** Pide permiso, suscribe este dispositivo y enciende los recordatorios. Devuelve el usuario actualizado, o null si no se dio permiso. */
export async function enableReminders(): Promise<User | null> {
  const key = await publicKey()
  if (!key || !pushSupported()) throw new Error('Los recordatorios no están disponibles en este navegador.')
  if ((await Notification.requestPermission()) !== 'granted') return null
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }))
  await send(sub)
  return api<User>('/me', { method: 'PATCH', json: { reminders: true } })
}

/** Quita la suscripción de este dispositivo (sin tocar el ajuste de la cuenta). Nunca lanza error. */
export async function dropSubscription() {
  const sub = await currentSubscription()
  if (!sub) return
  await api('/push/subscriptions', { method: 'DELETE', json: { endpoint: sub.endpoint } }).catch(() => {})
  await sub.unsubscribe().catch(() => {})
}

export async function disableReminders(): Promise<User> {
  await dropSubscription()
  return api<User>('/me', { method: 'PATCH', json: { reminders: false } })
}

/** Al abrir la app: reenvía la suscripción para mantener al día la zona horaria. */
export async function refreshSubscription() {
  const sub = await currentSubscription()
  if (sub && Notification.permission === 'granted') await send(sub).catch(() => {})
}

export const nextReminderPath = () => `/reminders?offset=${new Date().getTimezoneOffset()}&days=2`
