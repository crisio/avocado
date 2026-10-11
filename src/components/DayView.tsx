import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { usePhotoUrls } from '../lib/usePhotoUrls'
import { addDays, formatDay, formatTime, grams, kcal, startOfDay } from '../lib/format'
import type { Meal } from '../lib/types'

/** Comidas de un usuario en un día, con totales y navegación entre días. */
export default function DayView({ userId }: { userId: string }) {
  const [day, setDay] = useState(() => startOfDay(new Date()))
  const [meals, setMeals] = useState<Meal[] | null>(null)
  const urls = usePhotoUrls((meals ?? []).map((m) => m.photo_path))

  useEffect(() => {
    let cancelled = false
    const load = () =>
      supabase
        .from('meals')
        .select('*')
        .eq('user_id', userId)
        .gte('eaten_at', day.toISOString())
        .lt('eaten_at', addDays(day, 1).toISOString())
        .order('eaten_at')
        .then(({ data }) => !cancelled && setMeals(data ?? []))

    setMeals(null)
    load()

    // Recarga cuando se agrega una comida o termina su análisis.
    const channel = supabase
      .channel(`meals:${userId}:${day.toISOString()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meals', filter: `user_id=eq.${userId}` }, load)
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [userId, day])

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
        <button className="icon" onClick={() => setDay(addDays(day, -1))} aria-label="Día anterior">
          ‹
        </button>
        <h2>{formatDay(day)}</h2>
        <button className="icon" onClick={() => setDay(addDays(day, 1))} disabled={isToday} aria-label="Día siguiente">
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

      {meals === null ? (
        <p className="muted center">Cargando…</p>
      ) : meals.length === 0 ? (
        <p className="muted center">Sin comidas registradas este día.</p>
      ) : (
        <ul className="meal-list">
          {meals.map((m) => (
            <li key={m.id}>
              <Link to={`/comida/${m.id}`} className="meal-row card">
                {urls[m.photo_path] ? <img src={urls[m.photo_path]} alt="" /> : <div className="thumb-placeholder" />}
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
