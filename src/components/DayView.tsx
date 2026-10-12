import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalorieBar, Chip, CommentBubble, DayNav, EmptyState, MacroChips, MealCard } from '@avocado/ui'
import { useCachedApi } from '../lib/useCachedApi'
import { useOutbox, type MealJob } from '../lib/outbox'
import { jobToMeal, usePhotoUrls } from '../lib/localMeals'
import { useOnline } from '../lib/useOnline'
import { addDays, formatAgo, formatDay, startOfDay } from '../lib/format'
import { mealDetail, mealKind, mealKindLabel, mealMeta, mealTitle } from '../lib/meals'
import type { Meal } from '../lib/types'

/** Comidas de un usuario en un día: resumen de calorías y macros, y la lista con indicaciones. */
export default function DayView({ userId, emptyAction }: { userId: string; emptyAction?: React.ReactNode }) {
  const [day, setDay] = useState(() => startOfDay(new Date()))
  const next = addDays(day, 1)
  const { data: serverMeals, error } = useCachedApi<Meal[]>(`/meals?user_id=${userId}&from=${day.toISOString()}&to=${next.toISOString()}`, 20_000)
  const online = useOnline()
  const { jobs, sending } = useOutbox()

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

  function goTo(nextDay: Date) {
    setDay(nextDay)
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

  return (
    <>
      <DayNav label={formatDay(day)} onPrev={() => goTo(addDays(day, -1))} onNext={() => goTo(addDays(day, 1))} nextDisabled={isToday} />

      <section aria-label="Resumen del día" className="app-stack">
        <CalorieBar
          total={totals.calories}
          segments={list
            .filter((m) => m.status === 'analyzed')
            .map((m) => ({ value: m.calories ?? 0, kind: mealKind(m), label: mealKindLabel(mealKind(m)) }))}
        />
        <MacroChips protein={totals.protein} carbs={totals.carbs} fat={totals.fat} />
      </section>

      <section aria-labelledby="dia-comidas" className="app-stack">
        <h2 id="dia-comidas" className="av-section-title">
          Lo que comiste
        </h2>
        {error && meals === null ? (
          <p className="av-text-muted">{error.message}</p>
        ) : meals === null ? (
          <p className="av-text-muted">Cargando…</p>
        ) : meals.length === 0 ? (
          <EmptyState icon="camera" title="Sin comidas este día" description="Las fotos que registres aparecerán aquí con su análisis." action={emptyAction} />
        ) : (
          <ul className="app-stack">
            {meals.map((m) => (
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
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
