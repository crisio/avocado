import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card, DayNav, EmptyState, Icon, type IconName } from '@avocado/ui'
import { useCachedApi } from '../lib/useCachedApi'
import { addDays, formatNumber, formatWeekRange, fromDayParam, startOfDay, startOfWeek, toDayParam } from '../lib/format'
import { cheer, greetOnce } from '../lib/mascot'
import { mealKind, mealTitle } from '../lib/meals'
import type { Meal } from '../lib/types'

const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const DAY_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

interface DayStat {
  date: Date
  index: number
  meals: Meal[]
  calories: number
  future: boolean
}

/**
 * Forma canónica de una palabra para comparar singular y plural: quita la "s" final y, después de l/n/r/d/z/j,
 * también la "e" (frijoles/frijol → frijol, chiles/chile → chil, panes/pan → pan, tomates/tomate → tomate).
 */
function singular(w: string) {
  const base = w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w
  return base.length > 3 && /[lnrdzj]e$/.test(base) ? base.slice(0, -1) : base
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('es-MX', { maximumFractionDigits: 1 })} ${n === 1 ? one : many}`

/** "Tortillas de maíz" y "tortilla de maiz" cuentan como el mismo alimento. */
const foodKey = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // quita acentos
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .join(' ')

export interface WeekViewProps {
  userId: string
  /** "Tu" (paciente) o "Su" (nutrióloga viendo a un paciente). */
  self: boolean
  /** A dónde lleva tocar un día (la vista de ese día). */
  dayHref: (date: Date) => string
}

/** Resumen de una semana (lunes a domingo): promedio diario, calorías por día, macros, lo más frecuente y las fotos. */
export default function WeekView({ userId, self, dayHref }: WeekViewProps) {
  const thisWeek = startOfWeek(new Date())
  // La semana vive en la URL (?semana=2026-10-05) para volver a ella al regresar de un día.
  const [params, setParams] = useSearchParams()
  const fromUrl = fromDayParam(params.get('semana'))
  const start = fromUrl ? startOfWeek(fromUrl) : thisWeek
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
  const end = addDays(start, 7)
  const { data, error, fresh } = useCachedApi<Meal[]>(`/meals?user_id=${userId}&from=${start.toISOString()}&to=${end.toISOString()}`, 60_000)
  const [focused, setFocused] = useState<number | null>(null)
  const isCurrent = start.getTime() === thisWeek.getTime()

  const stats = useMemo(() => {
    const meals = (data ?? []).filter((m) => m.status === 'analyzed')
    const today = startOfDay(new Date()).getTime()
    const days: DayStat[] = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i)
      const next = addDays(date, 1).getTime()
      const dayMeals = meals.filter((m) => Date.parse(m.eaten_at) >= date.getTime() && Date.parse(m.eaten_at) < next)
      return { date, index: i, meals: dayMeals, calories: dayMeals.reduce((s, m) => s + (m.calories ?? 0), 0), future: date.getTime() > today }
    })
    const logged = days.filter((d) => d.meals.length > 0)
    const elapsed = days.filter((d) => !d.future).length
    const sum = (k: 'calories' | 'protein_g' | 'carbs_g' | 'fat_g') => meals.reduce((s, m) => s + (m[k] ?? 0), 0)
    const totals = { calories: sum('calories'), protein: sum('protein_g'), carbs: sum('carbs_g'), fat: sum('fat_g') }
    const per = (n: number) => (logged.length ? n / logged.length : 0)
    const served = meals.reduce((s, m) => s + (m.analysis?.served?.calories ?? m.calories ?? 0), 0)

    // Alimentos más frecuentes (por nombre normalizado; se muestra el nombre como más se escribió).
    const foods = new Map<string, { names: Map<string, number>; count: number; meals: Set<string> }>()
    for (const m of meals)
      for (const item of m.analysis?.items ?? []) {
        if ((item.eaten ?? 1) === 0) continue
        const key = foodKey(item.name)
        if (!key) continue
        const f = foods.get(key) ?? { names: new Map(), count: 0, meals: new Set() }
        if (!f.meals.has(m.id)) {
          f.meals.add(m.id)
          f.count++
        }
        f.names.set(item.name, (f.names.get(item.name) ?? 0) + 1)
        foods.set(key, f)
      }
    const topFoods = [...foods.values()]
      .filter((f) => f.count > 1 || foods.size <= 5)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((f) => ({ name: [...f.names.entries()].sort((a, b) => b[1] - a[1])[0][0], count: f.count }))

    const maxDay = logged.reduce<DayStat | null>((best, d) => (!best || d.calories > best.calories ? d : best), null)
    const breakfastDays = logged.filter((d) => d.meals.some((m) => mealKind(m) === 'breakfast')).length

    return {
      meals,
      days,
      logged,
      elapsed,
      totals,
      avg: { calories: per(totals.calories), protein: per(totals.protein), carbs: per(totals.carbs), fat: per(totals.fat) },
      leftover: Math.max(0, served - totals.calories),
      topFoods,
      maxDay,
      breakfastDays,
    }
  }, [data, start.getTime()])

  // Avo comenta cómo va tu semana (una vez por visita, con los datos ya llegados de la red).
  const loggedDays = stats.logged.length
  useEffect(() => {
    if (!self || !isCurrent || !fresh) return
    const t = setTimeout(
      () =>
        greetOnce('week', () => {
          if (loggedDays === 0) cheer('think', '¿Registramos la primera comida de la semana?')
          else if (loggedDays >= stats.elapsed && stats.elapsed > 1) cheer('celebrate', '¡Registraste todos los días!')
          else if (loggedDays * 2 >= stats.elapsed) cheer('love', '¡Vas muy bien esta semana!')
          else cheer('wave', 'Cada foto cuenta: ¡tú puedes!')
        }),
      600,
    )
    return () => clearTimeout(t)
  }, [self, isCurrent, fresh])

  const you = self ? 'Tu' : 'Su'
  const nav = (
    <DayNav
      label={isCurrent ? 'Esta semana' : formatWeekRange(start)}
      onPrev={() => setStart(addDays(start, -7))}
      onNext={() => setStart(addDays(start, 7))}
      nextDisabled={isCurrent}
      prevLabel="Semana anterior"
      nextLabel="Semana siguiente"
    />
  )

  if (data === undefined)
    return (
      <>
        {nav}
        <p className="av-text-muted">{error ? error.message : 'Cargando…'}</p>
      </>
    )

  if (stats.meals.length === 0)
    return (
      <>
        {nav}
        <EmptyState
          icon="calendar"
          title="Sin comidas esta semana"
          description={self ? 'Cuando registres tus comidas, aquí verás el resumen de tu semana.' : 'Aún no hay comidas analizadas en esta semana.'}
        />
      </>
    )

  const { days, avg } = stats
  const maxKcal = Math.max(...days.map((d) => d.calories), 1)
  // Escala con aire arriba y redondeada a cientos, para que la etiqueta del máximo quepa.
  const scale = Math.ceil((maxKcal * 1.15) / 100) * 100
  const focusDay = focused === null ? null : days[focused]

  const energy = { protein: avg.protein * 4, carbs: avg.carbs * 4, fat: avg.fat * 9 }
  const energyTotal = energy.protein + energy.carbs + energy.fat || 1
  const macros = [
    { key: 'protein', label: 'Proteína', grams: avg.protein, share: energy.protein / energyTotal },
    { key: 'carbs', label: 'Carbohidratos', grams: avg.carbs, share: energy.carbs / energyTotal },
    { key: 'fat', label: 'Grasa', grams: avg.fat, share: energy.fat / energyTotal },
  ]

  const insights: { icon: IconName; text: React.ReactNode }[] = []
  // Con un solo día registrado, "el día con más calorías" y el promedio no dicen nada nuevo.
  if (stats.maxDay && stats.logged.length > 1)
    insights.push({
      icon: 'calendar',
      text: (
        <>
          El día con más calorías fue el <strong>{DAY_LONG[stats.maxDay.index]}</strong> ({formatNumber(stats.maxDay.calories)} kcal).
        </>
      ),
    })
  insights.push({
    icon: 'clock',
    text: (
      <>
        {self ? 'Desayunaste' : 'Desayunó'} <strong>{stats.breakfastDays}</strong> de {stats.logged.length} {stats.logged.length === 1 ? 'día registrado' : 'días registrados'}.
      </>
    ),
  })
  insights.push({
    icon: 'camera',
    text: (
      <>
        <strong>{plural(Math.round((stats.meals.length / stats.logged.length) * 10) / 10, 'comida', 'comidas')}</strong> por día en promedio.
      </>
    ),
  })
  if (stats.leftover >= 50)
    insights.push({
      icon: 'check',
      text: (
        <>
          {self ? 'Dejaste' : 'Dejó'} en el plato unas <strong>{formatNumber(stats.leftover)} kcal</strong> en la semana.
        </>
      ),
    })

  return (
    <>
      {nav}

      <Card padding="lg" className="week-hero">
        <span className="week-hero__label">Promedio diario</span>
        <span className="week-hero__value">
          {formatNumber(avg.calories)}
          <span className="week-hero__unit"> kcal</span>
        </span>
        <span className="av-text-muted">
          {formatNumber(stats.totals.calories)} kcal en la semana · {stats.meals.length} {stats.meals.length === 1 ? 'comida' : 'comidas'}
        </span>
        <ol className="week-dots" aria-label="Días con comidas registradas">
          {days.map((d) => (
            <li key={d.index} className={d.future ? 'week-dot week-dot--future' : d.meals.length ? 'week-dot week-dot--on' : 'week-dot'}>
              <span className="week-dot__mark" aria-hidden />
              <span className="week-dot__label">{DAY_SHORT[d.index].charAt(0)}</span>
              <span className="sr-only">
                {DAY_LONG[d.index]}: {d.future ? 'aún no llega' : d.meals.length ? plural(d.meals.length, 'comida', 'comidas') : 'sin registro'}
              </span>
            </li>
          ))}
        </ol>
        <span className="week-hero__days">
          {self ? 'Registraste' : 'Registró'} <strong>{stats.logged.length}</strong> de {stats.elapsed} {stats.elapsed === 1 ? 'día' : 'días'}
          {isCurrent && stats.elapsed < 7 ? ' hasta hoy' : ''}
        </span>
      </Card>

      <Card padding="lg">
        <h2 className="av-section-title week-card-title">Calorías por día</h2>
        <p className="week-readout" aria-hidden>
          {focusDay ? (
            <>
              <strong>{formatNumber(focusDay.calories)} kcal</strong> · {DAY_LONG[focusDay.index]} {focusDay.date.getDate()} ·{' '}
              {plural(focusDay.meals.length, 'comida', 'comidas')}
            </>
          ) : stats.logged.length > 1 ? (
            <>
              Promedio <strong>{formatNumber(avg.calories)} kcal</strong> por día. <span className="av-text-muted">Toca un día para ver el suyo.</span>
            </>
          ) : (
            <span className="av-text-muted">Toca un día para ver sus calorías.</span>
          )}
        </p>
        <div className="week-chart" onPointerLeave={(e) => e.pointerType === 'mouse' && setFocused(null)}>
          <div className="week-chart__plot">
            {stats.logged.length > 1 && (
              <div className="week-chart__avg" style={{ bottom: `${(avg.calories / scale) * 100}%` }} aria-hidden />
            )}
            {days.map((d) => {
              const isMax = stats.maxDay?.index === d.index
              // Los días que no han llegado no son botones: no hay nada que ver ni que anunciar.
              if (d.future) return <div key={d.index} className="week-chart__col" aria-hidden />
              return (
                <button
                  key={d.index}
                  type="button"
                  className={focused === d.index ? 'week-chart__col week-chart__col--focus' : 'week-chart__col'}
                  aria-label={`${DAY_LONG[d.index]} ${d.date.getDate()}: ${formatNumber(d.calories)} kcal, ${plural(d.meals.length, 'comida', 'comidas')}`}
                  // En táctil, pointerleave llega justo después del toque: el hover es solo para mouse.
                  onPointerEnter={(e) => e.pointerType === 'mouse' && setFocused(d.index)}
                  onFocus={() => setFocused(d.index)}
                  onBlur={() => setFocused(null)}
                  onClick={() => setFocused(d.index)}
                >
                  {isMax && d.calories > 0 && (
                    <span className="week-chart__value" style={{ bottom: `${(d.calories / scale) * 100}%` }}>
                      {formatNumber(d.calories)}
                    </span>
                  )}
                  <span className="week-chart__bar" style={{ height: `${(d.calories / scale) * 100}%` }} />
                </button>
              )
            })}
          </div>
          <div className="week-chart__axis" aria-hidden>
            {days.map((d) => (
              <span key={d.index} className={d.future ? 'week-chart__day week-chart__day--future' : 'week-chart__day'}>
                {DAY_SHORT[d.index]}
              </span>
            ))}
          </div>
          {stats.logged.length > 1 && (
            <p className="week-chart__key" aria-hidden>
              <span className="week-chart__key-line" /> Promedio de los días registrados
            </p>
          )}
        </div>
        <ul className="week-days" aria-label="Calorías de cada día">
          {days
            .filter((d) => !d.future)
            .map((d) => (
              <li key={d.index}>
                <Link to={dayHref(d.date)} className="week-days__row">
                  <span className="week-days__text">
                    <span className="week-days__name">
                      {DAY_LONG[d.index].charAt(0).toUpperCase() + DAY_LONG[d.index].slice(1)} {d.date.getDate()}
                    </span>
                    <span className="week-days__meta">{d.meals.length ? plural(d.meals.length, 'comida', 'comidas') : 'sin registro'}</span>
                  </span>
                  <span className="week-days__kcal">{d.meals.length ? `${formatNumber(d.calories)} kcal` : '—'}</span>
                  <Icon name="chevron-right" size={16} />
                </Link>
              </li>
            ))}
        </ul>
      </Card>

      <Card padding="lg">
        <h2 className="av-section-title week-card-title">Macronutrientes</h2>
        <p className="av-text-muted week-card-sub">Promedio por día registrado</p>
        <dl className="week-macros">
          {macros.map((m) => (
            <div key={m.key} className="week-macros__cell">
              <dt>
                <span className={`week-swatch week-swatch--${m.key}`} aria-hidden />
                {m.label}
              </dt>
              <dd>{Math.round(m.grams)} g</dd>
            </div>
          ))}
        </dl>
        <div className="week-share" role="img" aria-label={macros.map((m) => `${m.label} ${Math.round(m.share * 100)} % de las calorías`).join(', ')}>
          {macros
            .filter((m) => m.share > 0)
            .map((m) => (
              <span key={m.key} className={`week-share__seg week-swatch--${m.key}`} style={{ flexGrow: m.share }} />
            ))}
        </div>
        <ul className="week-share__legend" aria-hidden>
          {macros.map((m) => (
            <li key={m.key}>
              <span className={`week-swatch week-swatch--${m.key}`} />
              {m.label} <strong>{Math.round(m.share * 100)} %</strong>
            </li>
          ))}
        </ul>
        <p className="av-text-muted week-card-foot">De dónde vienen las calorías (proteína y carbohidratos 4 kcal/g, grasa 9 kcal/g).</p>
      </Card>

      {stats.topFoods.length > 0 && (
        <Card padding="lg">
          <h2 className="av-section-title week-card-title">Lo que más {self ? 'comiste' : 'comió'}</h2>
          <ol className="week-foods">
            {stats.topFoods.map((f) => (
              <li key={f.name} className="week-foods__row">
                <span className="week-foods__name">{f.name}</span>
                <span className="week-foods__count">
                  {f.count} {f.count === 1 ? 'vez' : 'veces'}
                </span>
                <span className="week-foods__track" aria-hidden>
                  <span className="week-foods__bar" style={{ width: `${(f.count / stats.topFoods[0].count) * 100}%` }} />
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <Card padding="lg">
        <h2 className="av-section-title week-card-title">{you} semana en datos</h2>
        <ul className="week-insights">
          {insights.map((i, n) => (
            <li key={n}>
              <span className="week-insights__icon" aria-hidden>
                <Icon name={i.icon} size={18} />
              </span>
              <span>{i.text}</span>
            </li>
          ))}
        </ul>
      </Card>

      <section className="app-stack" aria-labelledby="semana-fotos">
        <h2 id="semana-fotos" className="av-section-title">
          {you} semana en fotos
        </h2>
        <ul className="week-photos">
          {stats.meals
            .slice()
            .sort((a, b) => a.eaten_at.localeCompare(b.eaten_at))
            .map((m) => (
              <li key={m.id}>
                <Link to={`/comida/${m.id}`} className="week-photos__item">
                  <img src={m.photo_url} alt={mealTitle(m)} loading="lazy" />
                  <span className="week-photos__kcal">{formatNumber(m.calories ?? 0)}</span>
                </Link>
              </li>
            ))}
        </ul>
      </section>
    </>
  )
}

export const weekDayHref = (base: string) => (date: Date) => `${base}?dia=${toDayParam(date)}`
