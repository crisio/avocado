import { useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, DayNav, PageHeader, Screen } from '@avocado/ui'
import TopBar from '../components/TopBar'
import { useCachedApi } from '../lib/useCachedApi'
import { addDays, displayName, formatNumber, formatTime, formatWeekRange, fromDayParam, startOfDay, toDayParam } from '../lib/format'
import { duration, feelingOf, moodStats, timingStats } from '../lib/moods'
import { mealKindLabel, mealKind, mealTitle } from '../lib/meals'
import { useStreak } from '../lib/streak'
import type { Budget, Goal, Meal, Mood, User } from '../lib/types'

const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] // getDay(): 0 = domingo
const GOAL_LABEL: Record<Goal, string> = { bajar: 'Bajar', mantener: 'Mantener', subir: 'Subir' }
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Reporte de un paciente para su nutrióloga: los últimos 7 días (con hoy), o 7 días desde ?semana=AAAA-MM-DD. Se puede guardar como PDF o imprimir:
 * al imprimir se ocultan la barra de pestañas, Avo y los botones (ver `@media print` en styles.css).
 */
export default function PatientReport() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  // Los últimos 7 días y no "de lunes a hoy": un lunes el reporte saldría casi vacío.
  const thisWeek = addDays(startOfDay(new Date()), -6)
  const fromUrl = fromDayParam(params.get('semana'))
  const start = fromUrl ? startOfDay(fromUrl) : thisWeek
  const end = addDays(start, 7)
  const isCurrent = start.getTime() === thisWeek.getTime()
  const range = `user_id=${id}&from=${start.toISOString()}&to=${end.toISOString()}`

  const patient = useCachedApi<User>(`/users/${id}`, 300_000).data ?? null
  const mealsData = useCachedApi<Meal[]>(`/meals?${range}`, 60_000)
  const moods = useCachedApi<Mood[]>(`/moods?${range}`, 60_000).data ?? []
  // El saldo cuenta los últimos 7 días desde hoy: solo tiene sentido en el reporte de estos 7 días.
  const budget = useCachedApi<Budget | null>(isCurrent ? `/budget?user_id=${id}&offset=${new Date().getTimezoneOffset()}` : null, 120_000).data ?? null
  const { streak } = useStreak(id)

  function setStart(week: Date) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (week.getTime() >= thisWeek.getTime()) next.delete('semana')
        else next.set('semana', toDayParam(week))
        return next
      },
      { replace: true },
    )
  }

  const meals = useMemo(() => (mealsData.data ?? []).filter((m) => m.status === 'analyzed'), [mealsData.data])
  const goal = patient?.daily_kcal_goal ?? null
  const today = Date.now()

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const date = addDays(start, i)
        const next = addDays(date, 1).getTime()
        const list = meals.filter((m) => Date.parse(m.eaten_at) >= date.getTime() && Date.parse(m.eaten_at) < next)
        return { date, i, count: list.length, kcal: list.reduce((s, m) => s + (m.calories ?? 0), 0), future: date.getTime() > today }
      }),
    [meals, start.getTime()],
  )
  const logged = days.filter((d) => d.count > 0)
  const avg = (k: 'calories' | 'protein_g' | 'carbs_g' | 'fat_g') => (logged.length ? meals.reduce((s, m) => s + (m[k] ?? 0), 0) / logged.length : 0)
  const macros = [
    { label: 'Calorías', unit: 'kcal', value: avg('calories'), goal },
    { label: 'Proteína', unit: 'g', value: avg('protein_g'), goal: patient?.protein_g_goal ?? null },
    { label: 'Carbos', unit: 'g', value: avg('carbs_g'), goal: patient?.carbs_g_goal ?? null },
    { label: 'Grasa', unit: 'g', value: avg('fat_g'), goal: patient?.fat_g_goal ?? null },
  ]
  const feel = moodStats(moods)
  const timing = timingStats(meals)
  const photos = meals.filter((m) => m.photo_url).slice(0, 12)
  const hasGoals = !!(goal || patient?.goal || patient?.protein_g_goal || patient?.carbs_g_goal || patient?.fat_g_goal)

  return (
    <Screen withTabBar>
      <div className="report-noprint">
        <TopBar onBack={() => navigate(`/paciente/${id}`)} backLabel="Volver al día del paciente" />
      </div>
      <div className="report-noprint">
        <PageHeader eyebrow="Reporte de la semana" title={displayName(patient)} compact />
      </div>
      <div className="report-noprint app-stack">
        <DayNav
          label={formatWeekRange(start)}
          onPrev={() => setStart(addDays(start, -7))}
          onNext={() => setStart(addDays(start, 7))}
          nextDisabled={isCurrent}
          prevLabel="Semana anterior"
          nextLabel="Semana siguiente"
        />
        <div>
          <Button icon="download" onClick={() => window.print()}>
            Guardar PDF / Imprimir
          </Button>
        </div>
      </div>

      <header className="report-head">
        <div>
          <strong className="report-head__brand">Avocado</strong> · Reporte semanal
        </div>
        <div>
          {displayName(patient)} · {formatWeekRange(start)}
          {isCurrent ? ' (en curso)' : ''}
        </div>
      </header>

      <section className="report-section" aria-labelledby="rep-metas">
        <h2 id="rep-metas" className="av-section-title">
          Metas
        </h2>
        {hasGoals ? (
          <p className="report-line">
            {[
              goal ? `${formatNumber(goal)} kcal` : null,
              patient?.goal ? GOAL_LABEL[patient.goal] : null,
              patient?.protein_g_goal ? `Proteína ${patient.protein_g_goal} g` : null,
              patient?.carbs_g_goal ? `Carbos ${patient.carbs_g_goal} g` : null,
              patient?.fat_g_goal ? `Grasa ${patient.fat_g_goal} g` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : (
          <p className="report-line">Sin metas definidas.</p>
        )}
      </section>

      <section className="report-section" aria-labelledby="rep-dias">
        <h2 id="rep-dias" className="av-section-title">
          Día por día
        </h2>
        <table className="report-table">
          <thead>
            <tr>
              <th scope="col">Día</th>
              <th scope="col" className="report-num">
                Calorías{goal ? ` (meta ${formatNumber(goal)})` : ''}
              </th>
              <th scope="col" className="report-num">
                Comidas
              </th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.i} className={d.count === 0 ? 'report-table__empty' : undefined}>
                <th scope="row">
                  {DAY_SHORT[d.date.getDay()]} {d.date.getDate()}
                </th>
                <td className="report-num">
                  {d.count > 0 ? (
                    <>
                      {formatNumber(d.kcal)}
                      {goal ? <span className={d.kcal > goal ? 'report-over' : undefined}> ({Math.round((d.kcal / goal) * 100)} %)</span> : null}
                    </>
                  ) : d.future ? (
                    ''
                  ) : (
                    'Sin registro'
                  )}
                </td>
                <td className="report-num">{d.count || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="report-line">Registró {plural(logged.length, 'día', 'días')} de 7.</p>
      </section>

      <section className="report-section" aria-labelledby="rep-macros">
        <h2 id="rep-macros" className="av-section-title">
          Promedio diario (días con registro)
        </h2>
        {logged.length === 0 ? (
          <p className="report-line">Sin comidas analizadas esta semana.</p>
        ) : (
          <table className="report-table">
            <thead>
              <tr>
                <th scope="col">Nutriente</th>
                <th scope="col" className="report-num">
                  Promedio
                </th>
                <th scope="col" className="report-num">
                  Meta
                </th>
              </tr>
            </thead>
            <tbody>
              {macros.map((m) => (
                <tr key={m.label}>
                  <th scope="row">{m.label}</th>
                  <td className="report-num">
                    {formatNumber(m.value)} {m.unit}
                  </td>
                  <td className="report-num">{m.goal ? `${formatNumber(m.goal)} ${m.unit}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="report-section" aria-labelledby="rep-racha">
        <h2 id="rep-racha" className="av-section-title">
          Constancia
        </h2>
        <ul className="report-list">
          {streak && (
            <li>
              Racha: <strong>{plural(streak.current, 'día seguido', 'días seguidos')}</strong> (la mejor: {streak.best}).
            </li>
          )}
          {budget && budget.days.some((d) => d.counted) && (
            <li>
              Saldo de los últimos 7 días:{' '}
              <strong>
                {formatNumber(Math.abs(budget.balance))} kcal {budget.balance >= 0 ? 'por debajo' : 'por encima'} de la meta
              </strong>
              {budget.skipped > 0 && ` (${plural(budget.skipped, 'día incompleto no cuenta', 'días incompletos no cuentan')})`}.
            </li>
          )}
        </ul>
      </section>

      <section className="report-section" aria-labelledby="rep-animo">
        <h2 id="rep-animo" className="av-section-title">
          Ánimo
        </h2>
        {feel ? (
          <ul className="report-list">
            <li>
              Lo que más sintió:{' '}
              {feel.top.map(([f, n]) => `${feelingOf(f).emoji} ${feelingOf(f).label.toLowerCase()} (${n})`).join(', ')}.
            </li>
            {feel.energy !== null && (
              <li>
                Energía promedio: <strong>{feel.energy.toFixed(1)} de 5</strong>.
              </li>
            )}
            {feel.onPlan && (
              <li>
                Iba con el plan <strong>{feel.onPlan.yes} de {feel.onPlan.total}</strong> veces.
              </li>
            )}
            <li>{plural(feel.count, 'registro de ánimo', 'registros de ánimo')} en la semana.</li>
          </ul>
        ) : (
          <p className="report-line">Sin registros de ánimo esta semana.</p>
        )}
      </section>

      <section className="report-section" aria-labelledby="rep-horarios">
        <h2 id="rep-horarios" className="av-section-title">
          Horarios
        </h2>
        {timing ? (
          <ul className="report-list">
            <li>
              Primera comida a las <strong>{timing.first}</strong> y última a las <strong>{timing.last}</strong>, en promedio.
            </li>
            {timing.longest && timing.longest.minutes >= 60 && (
              <li>
                Hueco más largo entre comidas: <strong>{duration(timing.longest.minutes)}</strong> (después de {mealTitle(timing.longest.from).toLowerCase()}, a las{' '}
                {formatTime(timing.longest.from.eaten_at)}).
              </li>
            )}
            <li>{timing.late > 0 ? `${plural(timing.late, 'comida', 'comidas')} después de las 9 de la noche.` : 'Ninguna comida después de las 9 de la noche.'}</li>
          </ul>
        ) : (
          <p className="report-line">Sin comidas para calcular horarios.</p>
        )}
      </section>

      {photos.length > 0 && (
        <section className="report-section" aria-labelledby="rep-fotos">
          <h2 id="rep-fotos" className="av-section-title">
            Fotos de la semana
          </h2>
          <ul className="report-photos">
            {photos.map((m) => (
              <li key={m.id}>
                <img src={m.photo_url} alt={`${mealKindLabel(mealKind(m))}: ${mealTitle(m)}`} loading="lazy" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="report-foot">Generado con Avocado. Las calorías y macros son estimaciones calculadas a partir de las fotos.</p>
    </Screen>
  )
}
