const timeFmt = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' })
const dayFmt = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })

export const formatTime = (iso: string) => timeFmt.format(new Date(iso))

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "Domingo 11 de octubre" */
export const formatLongDate = (date: Date) => capitalize(dayFmt.format(date))

/** "Hoy", "Ayer" o "Viernes 9 de octubre" */
export function formatDay(date: Date) {
  const today = startOfDay(new Date())
  const diff = Math.round((startOfDay(date).getTime() - today.getTime()) / 86_400_000)
  if (diff === 0) return 'Hoy'
  if (diff === -1) return 'Ayer'
  return formatLongDate(date)
}

/** "hace 5 min", "hace 2 h", "ayer", o la fecha */
export function formatAgo(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'ahora'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  return formatDay(new Date(iso)).toLowerCase()
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

export function displayName(p: { full_name: string | null; email?: string } | null | undefined) {
  return p?.full_name || p?.email || 'Sin nombre'
}

export const firstName = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] ?? ''
