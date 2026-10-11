import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { api } from '../lib/api'
import { usePoll } from '../lib/usePoll'
import { formatDay, formatTime, grams, kcal } from '../lib/format'
import type { Meal, MealComment, MealWithComments } from '../lib/types'

const STUCK_AFTER_MS = 2 * 60_000

export default function MealDetail() {
  const { id = '' } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [meal, setMeal] = useState<MealWithComments | null | undefined>(undefined)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [retrying, setRetrying] = useState(false)

  const load = () =>
    api<MealWithComments>(`/meals/${id}`)
      .then(setMeal)
      .catch((err) => err.status === 404 && setMeal(null))

  // Rápido mientras la IA analiza; después, cada 15 s para ver comentarios nuevos.
  usePoll(load, meal?.status === 'pending' ? 4_000 : 15_000, id)

  async function sendComment(e: FormEvent) {
    e.preventDefault()
    if (!body.trim() || !meal) return
    setSending(true)
    try {
      const comment = await api<MealComment>(`/meals/${id}/comments`, { method: 'POST', json: { body: body.trim() } })
      setMeal({ ...meal, comments: [...meal.comments, comment] })
      setBody('')
    } catch (err) {
      alert((err as Error).message)
    }
    setSending(false)
  }

  async function retry() {
    if (!meal) return
    setRetrying(true)
    setMeal({ ...meal, status: 'pending' })
    try {
      const updated = await api<Meal>(`/meals/${id}/analyze`, { method: 'POST' })
      setMeal((prev) => (prev ? { ...prev, ...updated } : prev))
    } catch (err) {
      alert((err as Error).message)
    }
    setRetrying(false)
  }

  async function remove() {
    if (!confirm('¿Borrar esta comida?')) return
    await api(`/meals/${id}`, { method: 'DELETE' })
    navigate('/', { replace: true })
  }

  if (meal === undefined) return <p className="muted center">Cargando…</p>
  if (meal === null) return <p className="muted center">No encontramos esta comida.</p>

  const a = meal.analysis
  const isOwner = meal.user_id === user?.id
  const stuck = meal.status === 'pending' && Date.now() - Date.parse(meal.created_at) > STUCK_AFTER_MS
  const canRetry = isOwner && !retrying && (meal.status === 'error' || stuck)

  return (
    <div className="stack">
      <button className="link back" onClick={() => navigate(-1)}>
        ‹ Volver
      </button>

      <img className="hero" src={meal.photo_url} alt="Foto de la comida" />

      <div>
        <div className="muted">
          {formatDay(new Date(meal.eaten_at))} · {formatTime(meal.eaten_at)}
          {a?.meal_type ? ` · ${a.meal_type}` : ''}
        </div>
        <h1>{meal.status === 'analyzed' ? a?.summary || 'Comida' : meal.status === 'pending' ? 'Analizando…' : 'Sin análisis'}</h1>
        {meal.note && <p className="note">“{meal.note}”</p>}
      </div>

      {(meal.status === 'error' || canRetry) && (
        <div className="card stack">
          {meal.status === 'error' && (
            <div>
              <p className="error">No se pudo analizar la foto.</p>
              {a?.error && <p className="muted small">Detalle: {a.error}</p>}
            </div>
          )}
          {stuck && <p className="muted">El análisis está tardando más de lo normal.</p>}
          {canRetry && <button onClick={retry}>Reintentar análisis</button>}
        </div>
      )}

      {meal.status === 'analyzed' && a && (
        <section className="card stack">
          <div className="totals">
            <div>
              <strong>{kcal(meal.calories)}</strong>
              <span>calorías</span>
            </div>
            <div>
              <strong>{grams(meal.protein_g)}</strong>
              <span>proteína</span>
            </div>
            <div>
              <strong>{grams(meal.carbs_g)}</strong>
              <span>carbs</span>
            </div>
            <div>
              <strong>{grams(meal.fat_g)}</strong>
              <span>grasa</span>
            </div>
          </div>
          {a.items && a.items.length > 0 && (
            <table className="items">
              <tbody>
                {a.items.map((item, i) => (
                  <tr key={i}>
                    <td>{item.name}</td>
                    <td className="muted">{grams(item.portion_g)}</td>
                    <td>{kcal(item.calories)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted small">
            Estimación con IA{a.confidence ? ` (confianza ${Math.round(a.confidence * 100)}%)` : ''}. Puede tener errores.
          </p>
        </section>
      )}

      <section className="stack">
        <h2>Indicaciones y comentarios</h2>
        {meal.comments.length === 0 && <p className="muted">Aún no hay comentarios.</p>}
        <ul className="comments">
          {meal.comments.map((c) => (
            <li key={c.id} className={c.author_role === 'nutritionist' ? 'from-nutritionist' : ''}>
              <div className="muted small">
                {c.author_name || 'Sin nombre'} · {formatTime(c.created_at)}
              </div>
              <p>{c.body}</p>
            </li>
          ))}
        </ul>
        <form className="row" onSubmit={sendComment}>
          <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escribe un comentario…" maxLength={2000} />
          <button className="primary" disabled={!body.trim() || sending}>
            Enviar
          </button>
        </form>
      </section>

      {isOwner && (
        <button className="link danger" onClick={remove}>
          Borrar comida
        </button>
      )}
    </div>
  )
}
