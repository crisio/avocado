import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Chip, Icon, PageHeader, Screen } from '@avocado/ui'
import { useAuth } from '../auth'
import Flame from '../components/Flame'
import InstallCard from '../components/InstallCard'
import InviteCard from '../components/InviteCard'
import { Mascot } from '../components/Mascot'
import { clearInviteCode } from '../lib/invite'
import { cheer, greetOnce, greeting, isNight } from '../lib/mascot'
import { useCachedApi } from '../lib/useCachedApi'
import { displayName, firstName, formatAgo, formatNumber } from '../lib/format'
import type { CarePatient } from '../lib/types'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "hace 3 h" -> "Última comida hace 3 h"; "ayer" -> "Última comida ayer". */
const lastMeal = (iso: string | null) => (iso ? `Última comida ${formatAgo(iso)}` : 'Aún sin comidas')

/** Tablero de la nutrióloga: invitar pacientes y una tarjeta por paciente, con los que tienen alertas primero. */
export default function Patients() {
  const { user } = useAuth()
  const offset = new Date().getTimezoneOffset()
  const patients = useCachedApi<{ patients: CarePatient[] }>(`/care/dashboard?offset=${offset}`, 60_000).data?.patients ?? null
  const name = firstName(user?.full_name)

  useEffect(() => {
    // Un código de invitación pendiente no sirve para una nutrióloga.
    clearInviteCode()
    const t = setTimeout(
      () =>
        greetOnce('patients', () => {
          const { mood, message } = greeting(name)
          cheer(mood, message)
        }),
      500,
    )
    return () => clearTimeout(t)
  }, [])

  const withAlerts = patients?.filter((p) => p.alerts.length > 0).length ?? 0

  return (
    <Screen withTabBar>
      <PageHeader
        eyebrow={name ? `Hola, ${name}` : undefined}
        title="Pacientes"
        action={<Mascot size={84} base={isNight() ? 'sleepy' : 'idle'} reactive interactive />}
      />
      <InstallCard dismissible mobileOnly />
      {patients === null ? (
        <p className="av-text-muted">Cargando…</p>
      ) : patients.length === 0 ? (
        <InviteCard
          center
          intro="Aún no tienes pacientes. Comparte tu enlace o el código QR: al entrar a Avocado quedan vinculados contigo y verás aquí sus comidas, su ánimo y sus alertas."
        />
      ) : (
        <>
          <p className="care-summary" aria-live="polite">
            {plural(patients.length, 'paciente', 'pacientes')} · {withAlerts > 0 ? <strong>{withAlerts} con alertas</strong> : 'todo en orden'}
          </p>
          <ul className="app-stack">
            {patients.map((p) => (
              <li key={p.id}>
                <PatientCard p={p} />
              </li>
            ))}
          </ul>
          {/* Con pacientes, lo primero es verlos: invitar va al final y plegado. */}
          <details className="care-invite-more">
            <summary>Invitar más pacientes</summary>
            <InviteCard />
          </details>
        </>
      )}
    </Screen>
  )
}

function PatientCard({ p }: { p: CarePatient }) {
  const goal = p.goals.daily_kcal_goal
  const pct = goal ? Math.min(100, (p.today.consumed / goal) * 100) : 0
  const over = goal ? p.today.consumed > goal : false
  const onPlan = p.week.on_plan
  return (
    <Link to={`/paciente/${p.id}`} className="care-card">
      <div className="care-card__head">
        <div className="care-card__name">
          <strong>{displayName(p)}</strong>
          {p.full_name && <span className="av-text-muted">{p.email}</span>}
        </div>
        <Icon name="chevron-right" style={{ color: 'var(--av-muted)' }} />
      </div>
      {p.alerts.length > 0 && (
        <ul className="care-card__alerts" aria-label="Alertas">
          {p.alerts.map((a, i) => (
            <li key={i}>
              <Chip tone={a.kind === 'mal' ? 'danger' : 'warning'} icon="alert">
                {a.text}
              </Chip>
            </li>
          ))}
        </ul>
      )}
      <div className="care-card__today">
        <div className="care-card__kcal">
          <span>
            <strong>{formatNumber(p.today.consumed)}</strong>
            {goal ? ` / ${formatNumber(goal)} kcal hoy` : ' kcal hoy'}
          </span>
          <span className="care-card__streak" aria-label={p.streak.current > 0 ? `Racha de ${plural(p.streak.current, 'día', 'días')}` : 'Sin racha'}>
            <Flame size={20} lit={p.streak.logged_today} />
            <strong>{p.streak.current}</strong>
          </span>
        </div>
        {goal ? (
          <div className="care-bar" role="img" aria-label={`${Math.round((p.today.consumed / goal) * 100)} % de la meta de hoy`}>
            <div className={`care-bar__fill${over ? ' care-bar__fill--over' : ''}`} style={{ width: `${pct}%` }} />
          </div>
        ) : (
          <span className="av-text-muted care-card__note">Sin meta de calorías</span>
        )}
      </div>
      <ul className="care-card__facts">
        <li>{lastMeal(p.last_meal_at)}</li>
        <li>Registró {p.week.days_logged} de 7 días</li>
        {onPlan && onPlan.total > 0 && (
          <li>
            Con el plan {onPlan.yes} de {onPlan.total}
          </li>
        )}
      </ul>
    </Link>
  )
}
