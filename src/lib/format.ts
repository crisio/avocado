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

const TITLES = new Set(['lic', 'lic.', 'licda', 'licda.', 'dra', 'dra.', 'dr', 'dr.', 'mtra', 'mtra.', 'mtro', 'mtro.', 'nut', 'nut.', 'ln', 'l.n.'])

/** "Mariana" de "Lic. Mariana López" (se salta títulos como Lic., Dra., Dr., Mtra., Nut.). */
export function firstName(name: string | null | undefined) {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  return words.find((w) => !TITLES.has(w.toLowerCase())) ?? words[0] ?? ''
}

/** Lunes de la semana de `date` (las semanas empiezan en lunes). */
export function startOfWeek(date: Date) {
  const d = startOfDay(date)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

const dayMonthFmt = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long' })
const shortDayMonthFmt = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' })

/** "6 – 12 de octubre", o "29 sept – 5 oct" si cruza de mes. */
export function formatWeekRange(start: Date) {
  const end = addDays(start, 6)
  if (start.getMonth() === end.getMonth()) return `${start.getDate()} – ${dayMonthFmt.format(end)}`
  return `${shortDayMonthFmt.format(start).replace('.', '')} – ${shortDayMonthFmt.format(end).replace('.', '')}`
}

/** "2026-10-12" en hora local (para ?dia= en la URL). */
export function toDayParam(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Lee ?dia=2026-10-12; un valor inválido o en el futuro se ignora. */
export function fromDayParam(value: string | null) {
  const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return undefined
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])]
  const date = new Date(y, mo, d)
  // new Date(2026, 1, 31) se recorre al 3 de marzo: una fecha imposible no cuenta.
  if (date.getFullYear() !== y || date.getMonth() !== mo || date.getDate() !== d || date.getTime() > Date.now()) return undefined
  return date
}

/** Números con separador de miles ("1,842"). */
export const formatNumber = (n: number) => Math.round(n).toLocaleString('es-MX')

/** "12:00" -> "12:00 p. m." (hora local). */
export function formatClock(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date()
  d.setHours(h || 0, m || 0, 0, 0)
  return timeFmt.format(d)
}

/** 14.37 -> "14 h 22 min" */
export function formatHM(hours: number) {
  const total = Math.max(0, Math.floor(hours * 60))
  return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, '0')} min`
}

/** 15.24 -> "15.2" */
export const formatHours = (h: number) => (Math.round(h * 10) / 10).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 1 })
