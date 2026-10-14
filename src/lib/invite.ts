// Código de invitación de una nutrióloga: llega por un enlace (/invitar/CODIGO) antes de tener sesión,
// así que se guarda en el teléfono hasta que el paciente termina de entrar.
const KEY = 'avocado.inviteCode'

/** Saca el código de un texto: acepta el código solo o el enlace completo. Devuelve null si no parece uno. */
export function parseInviteCode(text: string): string | null {
  const last = text.trim().split(/[/?#]/).filter(Boolean).pop() ?? ''
  const code = last.toUpperCase()
  return /^[A-Z0-9-]{4,32}$/.test(code) ? code : null
}

export function getInviteCode(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setInviteCode(code: string) {
  try {
    localStorage.setItem(KEY, code)
  } catch {
    // almacenamiento no disponible
  }
  notify()
}

export function clearInviteCode() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // almacenamiento no disponible
  }
  notify()
}

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/** Avisa cuando cambia el código pendiente (para quitar la tarjeta al aceptar o rechazar). */
export function onInviteChange(fn: () => void) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}
