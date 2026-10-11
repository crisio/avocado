import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { PHOTO_BUCKET, supabase } from '../lib/supabase'
import { usePhotoUrls } from '../lib/usePhotoUrls'
import { displayName, formatDay, formatTime, grams, kcal } from '../lib/format'
import type { Meal, MealComment } from '../lib/types'

export default function MealDetail() {
  const { id } = useParams<{ id: string }>()
  const { session } = useAuth()
  const navigate = useNavigate()
  const [meal, setMeal] = useState<Meal | null | undefined>(undefined)
  const [comments, setComments] = useState<MealComment[]>([])
  const [body, setBody] = useState('')
  const [retrying, setRetrying] = useState(false)
  const urls = usePhotoUrls(meal ? [meal.photo_path] : [])
  const isOwner = meal?.user_id === session?.user.id

  useEffect(() => {
    if (!id) return
    const loadMeal = () =>
      supabase.from('meals').select('*').eq('id', id).maybeSingle().then(({ data }) => setMeal(data))
    const loadComments = () =>
      supabase
        .from('meal_comments')
        .select('*, author:profiles(full_name, role)')
        .eq('meal_id', id)
        .order('created_at')
        .then(({ data }) => setComments((data as MealComment[]) ?? []))

    loadMeal()
    loadComments()

    const channel = supabase
      .channel(`meal:${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'meals', filter: `id=eq.${id}` }, loadMeal)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meal_comments', filter: `meal_id=eq.${id}` },
        loadComments,
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [id])

  async function sendComment(e: FormEvent) {
    e.preventDefault()
    if (!id || !body.trim()) return
    const { error } = await supabase.from('meal_comments').insert({ meal_id: id, body: body.trim() })
    if (!error) setBody('')
  }

  async function retry() {
    if (!meal) return
    setRetrying(true)
    await supabase.from('meals').update({ status: 'pending' }).eq('id', meal.id)
    await supabase.functions.invoke('analyze-meal', { body: { meal_id: meal.id } })
    setRetrying(false)
  }

  async function remove() {
    if (!meal || !confirm('¿Borrar esta comida?')) return
    await supabase.from('meals').delete().eq('id', meal.id)
    await supabase.storage.from(PHOTO_BUCKET).remove([meal.photo_path])
    navigate('/', { replace: true })
  }

  if (meal === undefined) return <p className="muted center">Cargando…</p>
  if (meal === null) return <p className="muted center">No encontramos esta comida.</p>

  const a = meal.analysis

  return (
    <div className="stack">
      <button className="link back" onClick={() => navigate(-1)}>
        ‹ Volver
      </button>

      {urls[meal.photo_path] && <img className="hero" src={urls[meal.photo_path]} alt="Foto de la comida" />}

      <div>
        <div className="muted">
          {formatDay(new Date(meal.eaten_at))} · {formatTime(meal.eaten_at)}
          {a?.meal_type ? ` · ${a.meal_type}` : ''}
        </div>
        <h1>{meal.status === 'analyzed' ? a?.summary || 'Comida' : meal.status === 'pending' ? 'Analizando…' : 'Sin análisis'}</h1>
        {meal.note && <p className="note">“{meal.note}”</p>}
      </div>

      {meal.status === 'error' && (
        <div className="card stack">
          <p className="error">No se pudo analizar: {a?.error ?? 'error desconocido'}</p>
          {isOwner && (
            <button onClick={retry} disabled={retrying}>
              {retrying ? 'Analizando…' : 'Reintentar análisis'}
            </button>
          )}
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
        {comments.length === 0 && <p className="muted">Aún no hay comentarios.</p>}
        <ul className="comments">
          {comments.map((c) => (
            <li key={c.id} className={c.author?.role === 'nutritionist' ? 'from-nutritionist' : ''}>
              <div className="muted small">
                {displayName(c.author ?? null)} · {formatTime(c.created_at)}
              </div>
              <p>{c.body}</p>
            </li>
          ))}
        </ul>
        <form className="row" onSubmit={sendComment}>
          <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escribe un comentario…" maxLength={2000} />
          <button className="primary" disabled={!body.trim()}>
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
