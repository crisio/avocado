import { useCallback, useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalorieBar, Chip, CommentBubble, DayNav, EmptyState, MacroChips, MealCard } from '@avocado/ui'
import { useCachedApi } from '../lib/useCachedApi'
import { useAuth } from '../auth'
import { watchMeal, type MealState } from '../lib/mascot'
import { useOutbox, type MealJob } from '../lib/outbox'
import { jobToMeal, usePhotoUrls } from '../lib/localMeals'
import { useOnline } from '../lib/useOnline'
import { addDays, formatAgo, formatDay, fromDayParam, startOfDay, toDayParam } from '../lib/format'
import { mealDetail, mealKind, mealKindLabel, mealMeta, mealTitle } from '../lib/meals'
import { useMoodsChanged } from '../lib/moods'
import type { Meal, Mood } from '../lib/types'
import MoodCard from './MoodCard'

/** Comidas de un usuario en un día: resumen de calorías y macros, y la lista con indicaciones. */
export default function DayView({
  userId,
  emptyAction,
  onAnalyzing,
  todayExtra,
  goal,
  macroGoals,
}: {
  userId: string
  /** Meta diaria de calorías de quien se ve (la barra muestra lo que falta). */
  goal?: number | null
  /** Metas de macros en gramos (los chips muestran "74 / 120 g"). */
  macroGoals?: { protein?: number | null; carbs?: number | null; fat?: number | null }
  emptyAction?: React.ReactNode
  /** Algo más que mostrar debajo del resumen, solo en el día de hoy (p. ej. "¿Tienes un antojo?"). */
  todayExtra?: React.ReactNode
  /** Cuántas comidas propias de este día siguen en cola o analizándose (para la mascota). */
  onAnalyzing?: (count: number) => void
}) {
  const { user } = useAuth()
  // El día vive en la URL (?dia=2026-10-12) para poder enlazarlo desde la semana; sin él, es hoy.
  const [params, setParams] = useSearchParams()
  const day = startOfDay(fromDayParam(params.get('dia')) ?? new Date())
  const next = addDays(day, 1)
  const { data: serverMeals, error, fresh } = useCachedApi<Meal[]>(`/meals?user_id=${userId}&from=${day.toISOString()}&to=${next.toISOString()}`, 20_000)
  const online = useOnline()
  const { jobs, sending } = useOutbox()
  // Cómo se sintió en el día (lo ve su nutrióloga): se recarga al registrar uno nuevo.
  const moodsApi = useCachedApi<Mood[]>(`/moods?user_id=${userId}&from=${day.toISOString()}&to=${next.toISOString()}`, 30_000)
  const moods = moodsApi.data ?? []
  const refreshMoods = moodsApi.refresh
  useMoodsChanged(useCallback(() => void refreshMoods(), [refreshMoods]))

  // Comidas que siguen en el teléfono (sin conexión o subiendo) para este usuario y día.
  const queued = useMemo(
    () =>
      jobs.filter(
        (j): j is MealJob =>
          j.kind === 'meal' && j.userId === userId && Date.parse(j.eaten_at) >= day.getTime() && Date.parse(j.eaten_at) < next.getTime(),
      ),
    [jobs, userId, day.getTime()],
  )
  const photoUrls = usePhotoUrls(queued)
  const queuedIds = new Set(queued.map((j) => j.id))

  const meals: Meal[] | null =
    serverMeals === undefined && queued.length === 0
      ? null
      : [...(serverMeals ?? []).filter((m) => !queuedIds.has(m.id)), ...queued.map((j) => jobToMeal(j, photoUrls.get(j.id)!))].sort((a, b) =>
          a.eaten_at.localeCompare(b.eaten_at),
        )

  // Avo celebra cuando una de tus comidas termina de analizarse (o avisa si falló). Solo cuentan estados vivos:
  // los de la cola del teléfono y los que acaban de llegar de la red (lo guardado en caché puede ser viejo).
  const own = user?.id === userId
  const states = (meals ?? []).map((m) => {
    const job = queued.find((j) => j.id === m.id)
    const state: MealState = job ? (job.error ? 'failed' : 'queued') : m.status
    return { id: m.id, state, calories: m.calories, live: !!job || fresh }
  })
  const statesKey = states.map((s) => `${s.id}:${s.state}:${s.live}`).join()
  const analyzing = states.filter((s) => s.state === 'queued' || s.state === 'pending').length
  useEffect(() => {
    if (own) for (const s of states) if (s.live) watchMeal(s.id, s.state, s.calories)
  }, [own, statesKey])
  useEffect(() => {
    onAnalyzing?.(own ? analyzing : 0)
  }, [own, analyzing])
  useEffect(() => () => onAnalyzing?.(0), [])

  function goTo(nextDay: Date) {
    const today = startOfDay(new Date()).getTime() === startOfDay(nextDay).getTime()
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (today) next.delete('dia')
        else next.set('dia', toDayParam(nextDay))
        return next
      },
      { replace: true },
    )
  }

  function badge(m: Meal) {
    const job = queued.find((j) => j.id === m.id)
    if (job?.error)
      return (
        <Chip tone="danger" icon="alert">
          No se pudo enviar
        </Chip>
      )
    if (job)
      return sending === job.id ? (
        <Chip tone="warning" icon="refresh">
          Enviando…
        </Chip>
      ) : (
        <Chip tone="warning" icon="clock">
          {online ? 'En cola' : 'Se analiza al volver la señal'}
        </Chip>
      )
    if (m.status === 'pending')
      return (
        <Chip tone="warning" icon="clock">
          Analizando…
        </Chip>
      )
    if (m.status === 'error')
      return (
        <Chip tone="danger" icon="alert">
          Sin análisis
        </Chip>
      )
    return undefined
  }

  const list = meals ?? []
  const totals = list.reduce(
    (acc, m) => ({
      calories: acc.calories + (m.calories ?? 0),
      protein: acc.protein + (m.protein_g ?? 0),
      carbs: acc.carbs + (m.carbs_g ?? 0),
      fat: acc.fat + (m.fat_g ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )
  const isToday = day.getTime() === startOfDay(new Date()).getTime()
  // Comidas y ánimo en orden de hora.
  const timeline: ({ at: string } & ({ meal: Meal; mood?: undefined } | { mood: Mood; meal?: undefined }))[] = [
    ...(meals ?? []).map((meal) => ({ at: meal.eaten_at, meal })),
    ...moods.map((mood) => ({ at: mood.felt_at, mood })),
  ].sort((a, b) => a.at.localeCompare(b.at))

  return (
    <>
      <DayNav label={formatDay(day)} onPrev={() => goTo(addDays(day, -1))} onNext={() => goTo(addDays(day, 1))} nextDisabled={isToday} />

      <section aria-label="Resumen del día" className="app-stack">
        <CalorieBar
          total={totals.calories}
          goal={goal || undefined}
          segments={list
            .filter((m) => m.status === 'analyzed')
            .map((m) => ({ value: m.calories ?? 0, kind: mealKind(m), label: mealKindLabel(mealKind(m)) }))}
        />
        <MacroChips protein={totals.protein} carbs={totals.carbs} fat={totals.fat} goals={macroGoals} />
      </section>

      {isToday && todayExtra}

      <section aria-labelledby="dia-comidas" className="app-stack">
        <h2 id="dia-comidas" className="av-section-title">
          Comidas y ánimo
        </h2>
        {error && meals === null ? (
          <p className="av-text-muted">{error.message}</p>
        ) : meals === null ? (
          <p className="av-text-muted">Cargando…</p>
        ) : timeline.length === 0 ? (
          <EmptyState icon="camera" title="Sin comidas este día" description="Las fotos que registres aparecerán aquí con su análisis." action={emptyAction} />
        ) : (
          <ul className="app-stack">
            {timeline.map(({ meal: m, mood }) =>
              mood ? (
                <li key={mood.id}>
                  <MoodCard mood={mood} own={own} />
                </li>
              ) : m ? (
                <li key={m.id} className="app-stack" style={{ gap: 6 }}>
                  <MealCard
                    as={Link}
                    to={`/comida/${m.id}`}
                    photoUrl={m.photo_url}
                    kind={mealKind(m)}
                    meta={mealMeta(m)}
                    title={queuedIds.has(m.id) ? 'Comida guardada en el teléfono' : mealTitle(m)}
                    detail={mealDetail(m)}
                    badge={badge(m)}
                  />
                  {m.last_comment && (
                    <div style={{ paddingLeft: 16 }}>
                      <CommentBubble
                        author={m.last_comment.author_name || 'Sin nombre'}
                        role={m.last_comment.author_role === 'nutritionist' ? 'nutritionist' : 'patient'}
                        time={formatAgo(m.last_comment.created_at)}
                      >
                        {m.last_comment.body}
                      </CommentBubble>
                    </div>
                  )}
                </li>
              ) : null,
            )}
          </ul>
        )}
      </section>
    </>
  )
}
