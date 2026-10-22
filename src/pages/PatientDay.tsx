import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Notice, PageHeader, Screen, Segmented, TextField, type SegmentedOption } from '@avocado/ui'
import { useAuth } from '../auth'
import DayView from '../components/DayView'
import { StreakChip } from '../components/Streak'
import TopBar from '../components/TopBar'
import { api } from '../lib/api'
import { useFasting } from '../lib/fasting'
import { useCachedApi } from '../lib/useCachedApi'
import { displayName, firstName, formatHours, formatNumber } from '../lib/format'
import { cheer } from '../lib/mascot'
import { useAchievements } from '../lib/achievements'
import { useStreak } from '../lib/streak'
import type { Goal, PatientGoals, User } from '../lib/types'

export default function PatientDay() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data, mutate } = useCachedApi<User>(`/users/${id}`, 300_000)
  const patient = data ?? null
  const { streak } = useStreak(id)
  const medals = useAchievements(id).data
  const fasting = useFasting(id, !!id, false).data

  return (
    <Screen withTabBar>
      <TopBar onBack={() => navigate('/')} backLabel="Volver a pacientes" />
      <PageHeader
        eyebrow="Paciente"
        title={displayName(patient)}
        compact
      />
      {streak && (
        <div>
          <StreakChip streak={streak} self={false} />
        </div>
      )}
      {medals && (
        <p className="av-text-muted" style={{ margin: 0 }}>
          🏅 {medals.summary.unlocked} {medals.summary.unlocked === 1 ? 'medalla' : 'medallas'} · 🔥 récord {medals.streak.best} {medals.streak.best === 1 ? 'día' : 'días'}
        </p>
      )}
      {fasting && (fasting.plan || fasting.history.length > 0) && (
        <p className="av-text-muted" style={{ margin: 0 }}>
          {fasting.plan ? `Ayuno ${fasting.plan.label}` : 'Ayuno'}
          {fasting.history[0] && ` · último ayuno ${formatHours(fasting.history[0].hours)} h`}
        </p>
      )}
      <div className="care-links">
        <Button as={Link} to={`/paciente/${id}/semana`} variant="secondary" icon="calendar">
          Ver su semana
        </Button>
        <Button as={Link} to={`/paciente/${id}/reporte`} variant="secondary" icon="calendar">
          Reporte de la semana
        </Button>
      </div>
      {patient && <GoalsCard patient={patient} onSaved={({ set_by_me, ...g }) => mutate((prev) => prev && { ...prev, ...g, goals_set_by: set_by_me ? user?.id : prev.goals_set_by })} />}
      <DayView
        userId={id}
        goal={patient?.daily_kcal_goal}
        macroGoals={{ protein: patient?.protein_g_goal, carbs: patient?.carbs_g_goal, fat: patient?.fat_g_goal }}
      />
    </Screen>
  )
}

const GOAL_OPTIONS: SegmentedOption<Goal>[] = [
  { value: 'bajar', label: 'Bajar', ariaLabel: 'Bajar de peso' },
  { value: 'mantener', label: 'Mantener' },
  { value: 'subir', label: 'Subir', ariaLabel: 'Subir (volumen)' },
]
const GOAL_LABEL: Record<Goal, string> = { bajar: 'Bajar', mantener: 'Mantener', subir: 'Subir' }

const grams = (n: number | null | undefined) => (n ? `${formatNumber(n)} g` : '—')

/** Cuántos gramos salen de repartir las kcal: 30 % proteína, 40 % carbos, 30 % grasa (4/4/9 kcal por gramo). */
export function suggestMacros(kcal: number) {
  return { protein: Math.round((kcal * 0.3) / 4), carbs: Math.round((kcal * 0.4) / 4), fat: Math.round((kcal * 0.3) / 9) }
}

/** Metas del paciente (kcal, objetivo y macros) y el formulario para cambiarlas. Mientras las fija la nutrióloga, el paciente no puede. */
function GoalsCard({ patient, onSaved }: { patient: User; onSaved: (goals: PatientGoals) => void }) {
  const { user } = useAuth()
  const [editing, setEditing] = useState(false)
  const [kcal, setKcal] = useState('')
  const [goal, setGoal] = useState<Goal | null>(null)
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const setByMe = !!user && patient.goals_set_by === user.id
  const hasAny = !!(patient.daily_kcal_goal || patient.goal || patient.protein_g_goal || patient.carbs_g_goal || patient.fat_g_goal)

  function edit() {
    setKcal(patient.daily_kcal_goal ? String(patient.daily_kcal_goal) : '')
    setGoal(patient.goal ?? null)
    setProtein(patient.protein_g_goal ? String(patient.protein_g_goal) : '')
    setCarbs(patient.carbs_g_goal ? String(patient.carbs_g_goal) : '')
    setFat(patient.fat_g_goal ? String(patient.fat_g_goal) : '')
    setError(null)
    setEditing(true)
  }

  function suggest() {
    const n = Number(kcal)
    if (!n || n < 800 || n > 6000) {
      setError('Escribe primero las calorías (de 800 a 6,000) para sugerir los macros.')
      return
    }
    setError(null)
    const m = suggestMacros(n)
    setProtein(String(m.protein))
    setCarbs(String(m.carbs))
    setFat(String(m.fat))
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    const num = (v: string) => (v.trim() ? Number(v) : null)
    const body = { daily_kcal_goal: num(kcal), goal, protein_g_goal: num(protein), carbs_g_goal: num(carbs), fat_g_goal: num(fat) }
    if (body.daily_kcal_goal !== null && !(body.daily_kcal_goal >= 800 && body.daily_kcal_goal <= 6000)) return setError('Las calorías van de 800 a 6,000.')
    for (const m of [body.protein_g_goal, body.carbs_g_goal, body.fat_g_goal])
      if (m !== null && !(m >= 0 && m <= 800)) return setError('Los gramos de cada macro van de 0 a 800.')
    setBusy(true)
    setError(null)
    try {
      const saved = await api<PatientGoals>(`/care/patients/${patient.id}/goals`, { method: 'PATCH', json: body })
      onSaved(saved)
      setEditing(false)
      cheer('love', `¡Metas de ${firstName(patient.full_name) || 'tu paciente'} guardadas!`, { interrupt: true })
    } catch (err) {
      setError((err as Error).message)
      cheer('oops', 'No pude guardar las metas', { interrupt: true })
    }
    setBusy(false)
  }

  return (
    <Card padding="lg" as="section" aria-labelledby="care-metas" className="care-goals">
      <h2 id="care-metas" className="av-section-title">
        Metas
      </h2>
      {editing ? (
        <form className="care-goals__form" onSubmit={save}>
          <TextField
            label="Calorías al día"
            type="number"
            inputMode="numeric"
            min={800}
            max={6000}
            step={10}
            value={kcal}
            onChange={(e) => setKcal(e.target.value)}
            placeholder="Ej. 1800"
          />
          <div className="app-stack" style={{ gap: 6 }}>
            <span className="mood-label">Objetivo</span>
            <Segmented label="Objetivo" options={GOAL_OPTIONS} value={goal} onChange={setGoal} />
          </div>
          <div className="care-goals__macros">
            <TextField label="Proteína (g)" type="number" inputMode="numeric" min={0} max={800} value={protein} onChange={(e) => setProtein(e.target.value)} />
            <TextField label="Carbos (g)" type="number" inputMode="numeric" min={0} max={800} value={carbs} onChange={(e) => setCarbs(e.target.value)} />
            <TextField label="Grasa (g)" type="number" inputMode="numeric" min={0} max={800} value={fat} onChange={(e) => setFat(e.target.value)} />
          </div>
          <div>
            <Button variant="ghost" onClick={suggest}>
              Sugerir macros
            </Button>
            <p className="av-text-muted care-goals__hint">Reparte las calorías en 30 % proteína, 40 % carbos y 30 % grasa. Puedes ajustar los gramos.</p>
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="care-goals__actions">
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" loading={busy}>
              Guardar metas
            </Button>
          </div>
        </form>
      ) : (
        <>
          {hasAny ? (
            <dl className="care-goals__list">
              <div>
                <dt>Calorías</dt>
                <dd>{patient.daily_kcal_goal ? `${formatNumber(patient.daily_kcal_goal)} kcal` : '—'}</dd>
              </div>
              <div>
                <dt>Objetivo</dt>
                <dd>{patient.goal ? GOAL_LABEL[patient.goal] : '—'}</dd>
              </div>
              <div>
                <dt>Proteína</dt>
                <dd>{grams(patient.protein_g_goal)}</dd>
              </div>
              <div>
                <dt>Carbos</dt>
                <dd>{grams(patient.carbs_g_goal)}</dd>
              </div>
              <div>
                <dt>Grasa</dt>
                <dd>{grams(patient.fat_g_goal)}</dd>
              </div>
            </dl>
          ) : (
            <p className="av-text-muted" style={{ margin: 0 }}>
              Aún no tiene metas. Ponle calorías, objetivo y macros para ver su avance.
            </p>
          )}
          {setByMe && <p className="av-text-muted care-goals__hint">Las pusiste tú</p>}
          <div>
            <Button variant="secondary" onClick={edit}>
              Editar metas
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}
