import { useState } from 'react'
import { Button, Card, Icon, Notice, TextField } from '@avocado/ui'
import { useAuth } from '../auth'
import { api } from '../lib/api'
import { cheer, picante } from '../lib/mascot'
import type { Goal, User } from '../lib/types'
import Swipeable from './Swipeable'

const HIDE_MS = 7 * 24 * 3_600_000
const hiddenKey = (userId: string) => `avocado.goalCardHiddenUntil.${userId}`
function hiddenUntil(userId: string) {
  try {
    return Number(localStorage.getItem(hiddenKey(userId))) || 0
  } catch {
    return 0
  }
}
function hideForAWeek(userId: string) {
  try {
    localStorage.setItem(hiddenKey(userId), String(Date.now() + HIDE_MS))
  } catch {
    // almacenamiento no disponible: solo se quita en esta visita
  }
}

const GOALS: { key: Goal; label: string }[] = [
  { key: 'bajar', label: 'Bajar de peso' },
  { key: 'mantener', label: 'Mantener' },
  { key: 'subir', label: 'Subir (volumen)' },
]
const KCAL = [1500, 1800, 2000, 2200, 2500]

/**
 * "¿Qué quieres lograr?": pide objetivo y meta de calorías en dos toques a quien aún no los tiene (y no se los fijó
 * su nutrióloga). Se quita deslizándola o con la ✕ y no vuelve por 7 días. `hasMeals`: solo después de la primera comida.
 */
export default function GoalCard({ hasMeals }: { hasMeals: boolean }) {
  const { user, setUser } = useAuth()
  const [dismissed, setDismissed] = useState(() => !!user && hiddenUntil(user.id) > Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [other, setOther] = useState(false)
  const [custom, setCustom] = useState('')
  const [unsure, setUnsure] = useState(false)
  // Si se completó en esta visita, la tarjeta se quita sola tras guardar (Avo felicita una vez).
  if (!user || dismissed || !hasMeals || user.role !== 'patient' || user.goals_set_by) return null
  if (user.goal && user.daily_kcal_goal) return null

  function dismiss() {
    if (user) hideForAWeek(user.id)
    setDismissed(true)
  }

  async function save(patch: { goal: Goal } | { daily_kcal_goal: number }) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const updated = await api<User>('/me', { method: 'PATCH', json: patch })
      setUser(updated)
      if (updated.goal && updated.daily_kcal_goal)
        cheer('celebrate', picante() ? '¡Eso! Ya sé a dónde vamos. Ahora no hay excusas 😏' : '¡Listo! Con esto te ayudo mejor 💚', { interrupt: true })
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(false)
  }

  function saveCustom() {
    const n = Number(custom)
    if (!Number.isFinite(n) || n < 800 || n > 6000) {
      setError('Escribe una meta entre 800 y 6,000 kcal.')
      return
    }
    void save({ daily_kcal_goal: Math.round(n) })
  }

  function notSure() {
    if (user) hideForAWeek(user.id)
    setUnsure(true)
    setTimeout(() => setDismissed(true), 3500)
  }

  return (
    <Swipeable onDismiss={dismiss}>
      <Card padding="md" as="section" aria-labelledby="objetivo-titulo" className="mood-card">
        <div className="mood-card__head">
          <h2 id="objetivo-titulo" className="av-section-title">
            ¿Qué quieres lograr? 🎯
          </h2>
          <button type="button" className="mood-close" onClick={dismiss} aria-label="Quitar esta tarjeta">
            <Icon name="close" size={18} />
          </button>
        </div>
        {unsure ? (
          <p className="av-text-muted" style={{ margin: 0 }}>
            Tu nutrióloga te puede dar la tuya. Mientras, Avo te orienta igual.
          </p>
        ) : (
          <>
            <p className="av-text-muted" style={{ margin: 0 }}>
              Con tu objetivo y tu meta, Avo te aconseja mejor y ves tu saldo de la semana.
            </p>
            {!user.goal ? (
              <div className="goal-chips" role="group" aria-label="Tu objetivo">
                {GOALS.map((g) => (
                  <button key={g.key} type="button" className="goal-chip" disabled={busy} onClick={() => void save({ goal: g.key })}>
                    {g.label}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <span className="mood-label">¿Tu meta de calorías al día?</span>
                <div className="goal-chips" role="group" aria-label="Tu meta de calorías al día">
                  {KCAL.map((n) => (
                    <button key={n} type="button" className="goal-chip" disabled={busy} onClick={() => void save({ daily_kcal_goal: n })}>
                      {n.toLocaleString('en-US')}
                    </button>
                  ))}
                  <button type="button" className="goal-chip" disabled={busy} onClick={() => setOther(true)}>
                    Otra
                  </button>
                  <button type="button" className="goal-chip" disabled={busy} onClick={notSure}>
                    No sé
                  </button>
                </div>
                {other && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                      <TextField label="Calorías al día" type="number" inputMode="numeric" min={800} max={6000} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Ej. 1800" />
                    </div>
                    <Button type="button" loading={busy} disabled={!custom.trim()} onClick={saveCustom}>
                      Guardar
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}
        {error && <Notice tone="error">{error}</Notice>}
      </Card>
    </Swipeable>
  )
}
