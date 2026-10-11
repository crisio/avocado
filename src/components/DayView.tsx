import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { usePoll } from '../lib/usePoll'
import { addDays, formatDay, formatTime, grams, kcal, startOfDay } from '../lib/format'
import type { Meal } from '../lib/types'

/** Comidas de un usuario en un día, con totales y navegación entre días. */
export default function DayView({ userId }: { userId: string }) {
  const [day, setDay] = useState(() => startOfDay(new Date()))
  const [meals, setMeals] = useState<Meal[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const key = `${userId}|${day.toISOString()}`

  usePoll(
    () =>
      api<Meal[]>(`/meals?user_id=${userId}&from=${day.toISOString()}&to=${addDays(day, 1).toISOString()}`)
        .then((list) => {
          setMeals(list)
          setError(null)
        })
        .catch((err) => setError(err.message)),
    20_000,
    key,
  )

  function goTo(next: Date) {
    setMeals(null)
    setDay(next)
  }

  const totals = (meals ?? []).reduce(
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
    <div className="stack">
      <div className="day-nav">
        <button className="icon" onClick={() => goTo(addDays(day, -1))} aria-label="Día anterior">
          ‹
        </button>
        <h2>{formatDay(day)}</h2>
        <button className="icon" onClick={() => goTo(addDays(day, 1))} disabled={isToday} aria-label="Día siguiente">
          ›
        </button>
      </div>

      <section className="totals card">
        <div>
          <strong>{kcal(totals.calories)}</strong>
          <span>calorías</span>
        </div>
        <div>
          <strong>{grams(totals.protein)}</strong>
          <span>proteína</span>
        </div>
        <div>
          <strong>{grams(totals.carbs)}</strong>
          <span>carbohidratos</span>
        </div>
        <div>
          <strong>{grams(totals.fat)}</strong>
          <span>grasa</span>
        </div>
      </section>

      {error && meals === null ? (
        <p className="error center">{error}</p>
      ) : meals === null ? (
        <p className="muted center">Cargando…</p>
      ) : meals.length === 0 ? (
        <p className="muted center">Sin comidas registradas este día.</p>
      ) : (
        <ul className="meal-list">
          {meals.map((m) => (
            <li key={m.id}>
              <Link to={`/comida/${m.id}`} className="meal-row card">
                <img src={m.photo_url} alt="" loading="lazy" />
                <div>
                  <div className="meal-time">{formatTime(m.eaten_at)}</div>
                  <div className="meal-title">
                    {m.status === 'pending'
                      ? 'Analizando…'
                      : m.status === 'error'
                        ? 'No se pudo analizar'
                        : m.analysis?.summary || 'Comida'}
                  </div>
                  {m.status === 'analyzed' && <div className="muted">{kcal(m.calories)}</div>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
