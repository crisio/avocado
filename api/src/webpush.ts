// Web Push sin dependencias (WebCrypto del Worker): el mensaje va cifrado para el navegador (RFC 8291, aes128gcm) y el
// servidor se identifica con VAPID (RFC 8292). El servicio de push (Apple, Google, Mozilla) solo ve bytes cifrados.

export interface PushSubscription {
  endpoint: string
  /** Llave pública del navegador (P-256 sin comprimir, base64url). */
  p256dh: string
  /** Secreto de autenticación del navegador (16 bytes, base64url). */
  auth: string
}

export interface VapidKeys {
  /** P-256 sin comprimir (65 bytes) en base64url: la misma que recibe la app para suscribirse. */
  publicKey: string
  /** El escalar privado "d" (32 bytes) en base64url. */
  privateKey: string
  /** Contacto para el servicio de push (mailto: o https:). */
  subject: string
}

const encoder = new TextEncoder()

export function b64urlToBytes(text: string) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

export function bytesToB64url(bytes: Uint8Array) {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let i = 0
  for (const p of parts) {
    out.set(p, i)
    i += p.length
  }
  return out
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8))
}

/** Llave privada P-256 (ECDH o ECDSA) a partir de la pública sin comprimir y el escalar d. */
function importPrivate(publicKey: Uint8Array, d: string, algorithm: 'ECDH' | 'ECDSA') {
  const jwk = { kty: 'EC', crv: 'P-256', x: bytesToB64url(publicKey.slice(1, 33)), y: bytesToB64url(publicKey.slice(33, 65)), d, ext: true }
  return crypto.subtle.importKey('jwk', jwk, { name: algorithm, namedCurve: 'P-256' }, false, algorithm === 'ECDH' ? ['deriveBits'] : ['sign'])
}

/**
 * Cifra el mensaje para un navegador (un solo registro aes128gcm). `fixed` es solo para pruebas: la sal y el par
 * de llaves efímeras del servidor; en producción son aleatorios en cada envío.
 */
export async function encryptPayload(sub: PushSubscription, payload: string, fixed?: { salt: Uint8Array; publicKey: Uint8Array; privateKey: string }) {
  const uaPublic = b64urlToBytes(sub.p256dh)
  const authSecret = b64urlToBytes(sub.auth)

  let asPublic: Uint8Array
  let asPrivate: CryptoKey
  if (fixed) {
    asPublic = fixed.publicKey
    asPrivate = await importPrivate(fixed.publicKey, fixed.privateKey, 'ECDH')
  } else {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
    asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer)
    asPrivate = pair.privateKey
  }
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  // "public" es el nombre del estándar (los tipos de Workers lo llaman $public).
  const ecdh = { name: 'ECDH', public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(ecdh, asPrivate, 256))

  const ikm = await hkdf(authSecret, ecdhSecret, concat(encoder.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12)

  // Un solo registro: el texto y el delimitador 0x02 de último registro.
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(encoder.encode(payload), new Uint8Array([2]))))

  const recordSize = new Uint8Array([0, 0, 0x10, 0]) // 4096
  return concat(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, cipher)
}

/** Encabezado Authorization con el JWT de VAPID (ES256) para el servicio de push de ese endpoint. */
export async function vapidAuthorization(endpoint: string, vapid: VapidKeys, now = Date.now()) {
  const header = bytesToB64url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = bytesToB64url(encoder.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject })))
  const key = await importPrivate(b64urlToBytes(vapid.publicKey), vapid.privateKey, 'ECDSA')
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(`${header}.${claims}`)))
  return `vapid t=${header}.${claims}.${bytesToB64url(signature)}, k=${vapid.publicKey}`
}

/**
 * Manda un push. Regresa el status del servicio: 201 = entregado; 404 o 410 = la suscripción ya no existe (bórrala).
 */
export async function sendPush(sub: PushSubscription, payload: unknown, vapid: VapidKeys, ttlSeconds = 3600) {
  const body = await encryptPayload(sub, JSON.stringify(payload))
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttlSeconds),
      Urgency: 'normal',
    },
    body,
  })
  return res.status
}
