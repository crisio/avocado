import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Chip, CommentBubble, EmptyState, IconButton, Notice, NutritionTable, Screen, TextField } from '@avocado/ui'
import { useAuth } from '../auth'
import { api } from '../lib/api'
import { usePoll } from '../lib/usePoll'
import { formatAgo, formatDay } from '../lib/format'
import { mealKind, mealKindLabel, mealTitle } from '../lib/meals'
import { formatTime } from '../lib/format'
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

  const back = (
    <div>
      <IconButton icon="chevron-left" label="Volver" plain onClick={() => navigate(-1)} />
    </div>
  )

  if (meal === undefined)
    return (
      <Screen withTabBar>
        {back}
        <p className="av-text-muted">Cargando…</p>
      </Screen>
    )
  if (meal === null)
    return (
      <Screen withTabBar>
        {back}
        <EmptyState title="No encontramos esta comida" description="Puede que la hayan borrado o que ya no tengas acceso." />
      </Screen>
    )

  const a = meal.analysis
  const isOwner = meal.user_id === user?.id
  const stuck = meal.status === 'pending' && Date.now() - Date.parse(meal.created_at) > STUCK_AFTER_MS
  const canRetry = isOwner && !retrying && (meal.status === 'error' || stuck)

  return (
    <Screen withTabBar>
      {back}
      <img className="av-hero-photo" src={meal.photo_url} alt="Foto de la comida" />

      <div className="app-stack" style={{ gap: 6 }}>
        <span className="av-meal-card__meta">
          {formatDay(new Date(meal.eaten_at))} · {formatTime(meal.eaten_at)} · {mealKindLabel(mealKind(meal))}
        </span>
        <h1 className="av-page-header__title" style={{ fontSize: 28 }}>
          {mealTitle(meal)}
        </h1>
        {meal.note && <p className="app-note">“{meal.note}”</p>}
        {meal.status === 'pending' && (
          <div>
            <Chip tone="warning" icon="clock">
              La IA está analizando la foto
            </Chip>
          </div>
        )}
      </div>

      {(meal.status === 'error' || canRetry) && (
        <Card>
          {meal.status === 'error' && (
            <Notice tone="error">
              No se pudo analizar la foto.
              {a?.error && <span style={{ display: 'block', fontSize: 13, opacity: 0.85 }}>Detalle: {a.error}</span>}
            </Notice>
          )}
          {stuck && <p className="av-text-muted" style={{ margin: 0 }}>El análisis está tardando más de lo normal.</p>}
          {canRetry && (
            <Button variant="secondary" icon="refresh" onClick={retry}>
              Reintentar análisis
            </Button>
          )}
        </Card>
      )}

      {meal.status === 'analyzed' && a && (
        <Card padding="lg">
          <NutritionTable
            totals={{ calories: meal.calories ?? 0, protein_g: meal.protein_g ?? 0, carbs_g: meal.carbs_g ?? 0, fat_g: meal.fat_g ?? 0 }}
            items={a.items}
            note={`Estimación con IA${a.confidence ? ` (confianza ${Math.round(a.confidence * 100)} %)` : ''}. Puede tener errores.`}
          />
        </Card>
      )}

      <section aria-labelledby="comentarios" className="app-stack" style={{ gap: 12 }}>
        <h2 id="comentarios" className="av-section-title">
          Indicaciones y comentarios
        </h2>
        {meal.comments.length === 0 && <p className="av-text-muted" style={{ margin: 0 }}>Aún no hay comentarios.</p>}
        <ul className="app-stack">
          {meal.comments.map((c) => (
            <li key={c.id}>
              <CommentBubble author={c.author_name || 'Sin nombre'} role={c.author_role === 'nutritionist' ? 'nutritionist' : 'patient'} time={formatAgo(c.created_at)}>
                {c.body}
              </CommentBubble>
            </li>
          ))}
        </ul>
        <form className="app-row" onSubmit={sendComment}>
          <TextField label="Escribe un comentario" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} />
          <Button type="submit" icon="send" loading={sending} disabled={!body.trim()}>
            Enviar
          </Button>
        </form>
      </section>

      {isOwner && (
        <div>
          <Button variant="danger" icon="trash" onClick={remove}>
            Borrar comida
          </Button>
        </div>
      )}
    </Screen>
  )
}
