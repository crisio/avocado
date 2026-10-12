import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalorieBar, Chip, CommentBubble, DayNav, EmptyState, MacroChips, MealCard } from '@avocado/ui'
import { api } from '../lib/api'
import { usePoll } from '../lib/usePoll'
import { addDays, formatAgo, formatDay, startOfDay } from '../lib/format'
import { mealDetail, mealKind, mealKindLabel, mealMeta, mealTitle } from '../lib/meals'
import type { Meal } from '../lib/types'

/** Comidas de un usuario en un día: resumen de calorías y macros, y la lista con indicaciones. */
export default function DayView({ userId, emptyAction }: { userId: string; emptyAction?: React.ReactNode }) {
  const [day, setDay] = useState(() => startOfDay(new Date()))
  const [meals, setMeals] = useState<Meal[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  usePoll(
    () =>
      api<Meal[]>(`/meals?user_id=${userId}&from=${day.toISOString()}&to=${addDays(day, 1).toISOString()}`)
        .then((list) => {
          setMeals(list)
          setError(null)
        })
        .catch((err) => setError(err.message)),
    20_000,
    `${userId}|${day.toISOString()}`,
  )

  function goTo(next: Date) {
    setMeals(null)
    setDay(next)
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
          <p className="av-text-muted">{error}</p>
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
                  title={mealTitle(m)}
                  detail={mealDetail(m)}
                  badge={
                    m.status === 'pending' ? (
                      <Chip tone="warning" icon="clock">
                        Analizando…
                      </Chip>
                    ) : m.status === 'error' ? (
                      <Chip tone="danger" icon="alert">
                        Sin análisis
                      </Chip>
                    ) : undefined
                  }
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
