const timeFmt = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' })
const dayFmt = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })

export const formatTime = (iso: string) => timeFmt.format(new Date(iso))

export function formatDay(date: Date) {
  const today = startOfDay(new Date())
  const diff = Math.round((startOfDay(date).getTime() - today.getTime()) / 86_400_000)
  if (diff === 0) return 'Hoy'
  if (diff === -1) return 'Ayer'
  const s = dayFmt.format(date)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function startOfDay(date: Date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function addDays(date: Date, days: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** Valor para <input type="datetime-local"> en hora local. */
export function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export const kcal = (n: number | null | undefined) => `${Math.round(n ?? 0)} kcal`
export const grams = (n: number | null | undefined) => `${Math.round(n ?? 0)} g`

export function displayName(p: { full_name: string | null; email?: string } | null | undefined) {
  return p?.full_name || p?.email || 'Sin nombre'
}
