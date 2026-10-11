const encoder = new TextEncoder()

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

export async function sha256(text: string) {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(text)))
}

export async function hmac(secret: string, text: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(text)))
}

/** Comparación en tiempo constante de dos strings hex del mismo largo. */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  return crypto.subtle.timingSafeEqual(encoder.encode(a), encoder.encode(b))
}

/** Token aleatorio de 256 bits en base64url. */
export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Código numérico de 6 dígitos sin sesgo de módulo. */
export function randomCode() {
  const limit = Math.floor(0xffffffff / 1_000_000) * 1_000_000
  const buf = new Uint32Array(1)
  do crypto.getRandomValues(buf)
  while (buf[0] >= limit)
  return String(buf[0] % 1_000_000).padStart(6, '0')
}
