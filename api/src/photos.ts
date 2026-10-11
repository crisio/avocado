import type { Env } from './env'
import { hmac, safeEqual } from './crypto'

const HOUR = 3_600_000

/**
 * URL firmada para ver una foto (las <img> no pueden mandar el token de sesión).
 * Vence al final de la siguiente hora, así la URL se repite y el navegador la puede cachear.
 */
export async function signedPhotoUrl(env: Env, origin: string, key: string) {
  const exp = (Math.floor(Date.now() / HOUR) + 2) * HOUR
  const sig = await hmac(env.AUTH_SECRET, `photo:${key}:${exp}`)
  return `${origin}/photos/${key}?exp=${exp}&sig=${sig}`
}

export async function verifyPhotoSignature(env: Env, key: string, exp: string | undefined, sig: string | undefined) {
  if (!exp || !sig || Number(exp) < Date.now()) return false
  return safeEqual(sig, await hmac(env.AUTH_SECRET, `photo:${key}:${exp}`))
}
