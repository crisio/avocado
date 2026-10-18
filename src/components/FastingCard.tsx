import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Notice } from '@avocado/ui'
import { useAuth } from '../auth'
import { api } from '../lib/api'
import { useFasting, useNow } from '../lib/fasting'
import { formatHM, formatTime, toLocalInput } from '../lib/format'
import { cheer, picante } from '../lib/mascot'
import type { User } from '../lib/types'

const cheeredKey = (userId: string) => `avocado.fastCheered.${userId}`

const cheeredFor = (userId: string) => {
  try {
    return localStorage.getItem(cheeredKey(userId))
  } catch {
    return null
  }
}
const markCheered = (userId: string, startedAt: string) => {
  try {
    localStorage.setItem(cheeredKey(userId), startedAt)
  } catch {
    // sin almacenamiento: puede festejar de nuevo en la próxima visita
  }
}

const R = 28
const C = 2 * Math.PI * R

/** Ayuno de hoy: anillo con las horas, cronómetro en vivo y la ventana de comida. Solo para quien tiene un plan. */
export default function FastingCard() {
  const { user, setUser } = useAuth()
  const { data, refresh } = useFasting(user?.id, !!user?.fasting_hours)
  const now = useNow()
  const navigate = useNavigate()
  const [picking, setPicking] = useState(false)
  const [time, setTime] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startedAt = data?.current.started_at ?? null
  const goal = data?.current.goal_hours ?? user?.fasting_hours ?? null
  const hours = startedAt ? Math.max(0, (now - Date.parse(startedAt)) / 3_600_000) : 0
  const reached = !!startedAt && !!goal && hours >= goal
  const fasting = data?.state === 'ayuno'

  // Avo festeja una sola vez por ayuno (se recuerda por la hora en que empezó).
  useEffect(() => {
    if (!user || !startedAt || !reached || !goal) return
    if (cheeredFor(user.id) === startedAt) return
    markCheered(user.id, startedAt)
    cheer(
      'celebrate',
      picante() ? `¡${goal} horas sin comer y sin llorar! 💪 Ahora sí, a comer rico (y con foto)` : `¡Ayuno de ${goal} h cumplido! Rómpelo con algo de proteína 💪`,
      { interrupt: true },
    )
  }, [user?.id, startedAt, reached, goal])

  if (!user?.fasting_hours || !data) return null

  const pct = goal ? Math.min(1, hours / goal) : 0
  const opens = data.window ? formatTime(data.window.opens_at) : null
  const closes = data.window ? formatTime(data.window.closes_at) : null

  let line: string
  if (reached) line = `¡Ayuno de ${goal} h cumplido! 💪`
  else if (fasting) line = `Ayunando${opens ? ` · tu ventana abre a las ${opens}` : ''}`
  else line = `Ventana abierta${closes ? ` hasta las ${closes}` : ''}`

  const first = data.today?.first_meal_at
  const last = data.today?.last_meal_at
  const todayLine = first ? `Hoy: primera comida ${formatTime(first)}${last && last !== first ? ` · última ${formatTime(last)}` : ''}` : null

  async function start() {
    if (!time) return
    setError(null)
    setBusy(true)
    try {
      const [h, m] = time.split(':').map(Number)
      const d = new Date()
      d.setHours(h, m, 0, 0)
      if (d.getTime() > Date.now()) d.setDate(d.getDate() - 1) // una hora futura es de ayer
      setUser(await api<User>('/me', { method: 'PATCH', json: { fast_started_at: d.toISOString() } }))
      await refresh()
      setPicking(false)
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(false)
  }

  return (
    <Card padding="md" className="fasting-card" as="section" aria-label="Ayuno intermitente">
      <div className="fasting-card__row">
        <svg className="fasting-card__ring" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label={`${Math.floor(hours)} de ${goal} horas`}>
          <circle cx="32" cy="32" r={R} fill="none" stroke="var(--av-line)" strokeWidth="6" />
          <circle
            cx="32"
            cy="32"
            r={R}
            fill="none"
            stroke={reached ? 'var(--av-accent-strong)' : 'var(--av-accent)'}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - pct)}
            transform="rotate(-90 32 32)"
          />
          <text x="32" y="36" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--av-ink)">
            {Math.floor(hours)}/{goal}
          </text>
        </svg>
        <div className="app-stack" style={{ gap: 2, minWidth: 0 }}>
          <span className="av-text-muted" style={{ fontSize: 13, fontWeight: 600 }}>
            Ayuno {data.plan?.label ?? ''}
          </span>
          <span className="fasting-card__time">{startedAt ? formatHM(hours) : '—'}</span>
          <span style={{ fontSize: 14 }}>{line}</span>
        </div>
      </div>
      {todayLine && (
        <span className="av-text-muted" style={{ fontSize: 13 }}>
          {todayLine}
        </span>
      )}
      {startedAt && !reached && (
        <button
          type="button"
          className="fasting-card__link"
          onClick={() =>
            navigate('/avo', {
              state: { draft: `¿Cómo puedo alargar mi ayuno? Mi plan es ${data.plan?.label ?? `${goal} h`} y hoy llevo ${Math.floor(hours)} horas.` },
            })
          }
        >
          ¿Cómo alargo mi ayuno? Pregúntale a Avo
        </button>
      )}
      {picking ? (
        <div className="app-row" style={{ alignItems: 'center' }}>
          <input
            type="time"
            aria-label="Hora en que empezaste tu ayuno"
            className="fasting-card__input"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
          <Button variant="secondary" loading={busy} onClick={() => void start()}>
            Guardar
          </Button>
          <Button variant="ghost" onClick={() => setPicking(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        !fasting || !startedAt || hours < 1 ? (
          <button
            type="button"
            className="fasting-card__link"
            onClick={() => {
              setTime(toLocalInput(new Date()).slice(11))
              setPicking(true)
            }}
          >
            Empecé mi ayuno
          </button>
        ) : null
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </Card>
  )
}
