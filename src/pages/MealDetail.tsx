import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Chip, CommentBubble, EmptyState, IconButton, Notice, NutritionTable, Screen, TextField } from '@avocado/ui'
import { useAuth } from '../auth'
import { api, type ApiError } from '../lib/api'
import { useCachedApi } from '../lib/useCachedApi'
import { discardJob, enqueueComment, retryJob, useOutbox, type CommentJob, type MealJob } from '../lib/outbox'
import { jobToMeal, usePhotoUrls } from '../lib/localMeals'
import { useOnline } from '../lib/useOnline'
import { formatAgo, formatDay } from '../lib/format'
import { mealKind, mealKindLabel, mealTitle } from '../lib/meals'
import { formatTime } from '../lib/format'
import type { Meal, MealWithComments } from '../lib/types'

const STUCK_AFTER_MS = 2 * 60_000

export default function MealDetail() {
  const { id = '' } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const online = useOnline()
  const { jobs, sending } = useOutbox()
  const [body, setBody] = useState('')
  const [retrying, setRetrying] = useState(false)

  // Comida que sigue en el teléfono (recién registrada o sin conexión)
  const job = jobs.find((j): j is MealJob => j.kind === 'meal' && j.id === id)
  const localPhotos = usePhotoUrls(useMemo(() => (job ? [job] : []), [job]))

  // Rápido mientras la IA analiza; después, cada 15 s para ver comentarios nuevos.
  const [fast, setFast] = useState(true)
  const { data, error, mutate } = useCachedApi<MealWithComments>(job ? null : `/meals/${id}`, fast ? 4_000 : 15_000)
  const status = data?.status
  useEffect(() => setFast(!status || status === 'pending'), [status])

  const pendingComments = jobs.filter((j): j is CommentJob => j.kind === 'comment' && j.mealId === id && !data?.comments.some((c) => c.id === j.id))

  const meal: MealWithComments | null | undefined = job
    ? { ...jobToMeal(job, localPhotos.get(job.id)!), comments: [] }
    : data ?? ((error as ApiError | null)?.status === 404 ? null : undefined)

  async function sendComment(e: FormEvent) {
    e.preventDefault()
    if (!body.trim() || !user) return
    // Se guarda en la cola: aparece al instante y se envía en cuanto hay señal.
    await enqueueComment({ id: crypto.randomUUID(), userId: user.id, mealId: id, body: body.trim(), author_name: user.full_name, author_role: user.role })
    setBody('')
  }

  async function retry() {
    if (!data) return
    setRetrying(true)
    mutate((prev) => (prev ? { ...prev, status: 'pending' } : prev))
    try {
      const updated = await api<Meal>(`/meals/${id}/analyze`, { method: 'POST', timeoutMs: 90_000 })
      mutate((prev) => (prev ? { ...prev, ...updated } : prev))
    } catch (err) {
      mutate((prev) => (prev ? { ...prev, status: data.status } : prev))
      alert((err as Error).message)
    }
    setRetrying(false)
  }

  async function remove() {
    if (!confirm('¿Borrar esta comida?')) return
    try {
      if (job) await discardJob(job.id)
      else await api(`/meals/${id}`, { method: 'DELETE' })
      navigate('/', { replace: true })
    } catch (err) {
      alert((err as Error).message)
    }
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
        <p className="av-text-muted">{error && !online ? 'Sin conexión. Esta comida no está guardada en el teléfono.' : 'Cargando…'}</p>
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
  const canRetry = !job && online && isOwner && !retrying && (meal.status === 'error' || stuck)

  return (
    <Screen withTabBar>
      {back}
      <img className="av-hero-photo" src={meal.photo_url} alt="Foto de la comida" />

      <div className="app-stack" style={{ gap: 6 }}>
        <span className="av-meal-card__meta">
          {formatDay(new Date(meal.eaten_at))} · {formatTime(meal.eaten_at)} · {mealKindLabel(mealKind(meal))}
        </span>
        <h1 className="av-page-header__title" style={{ fontSize: 28 }}>
          {job ? 'Comida guardada en el teléfono' : mealTitle(meal)}
        </h1>
        {meal.note && <p className="app-note">“{meal.note}”</p>}
        {job ? (
          <div>
            {job.error ? (
              <Chip tone="danger" icon="alert">
                No se pudo enviar
              </Chip>
            ) : sending === job.id ? (
              <Chip tone="warning" icon="refresh">
                Enviando la foto…
              </Chip>
            ) : (
              <Chip tone="warning" icon="clock">
                {online ? 'En cola para enviar' : 'Se analiza en cuanto vuelva la señal'}
              </Chip>
            )}
          </div>
        ) : (
          meal.status === 'pending' && (
            <div>
              <Chip tone="warning" icon="clock">
                La IA está analizando la foto
              </Chip>
            </div>
          )
        )}
      </div>

      {job?.error && (
        <Card>
          <Notice tone="error">El servidor no aceptó esta comida: {job.error}</Notice>
          <Button variant="secondary" icon="refresh" onClick={() => retryJob(job.id)}>
            Intentar de nuevo
          </Button>
        </Card>
      )}

      {!job && (meal.status === 'error' || canRetry) && (
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
        {meal.comments.length === 0 && pendingComments.length === 0 && <p className="av-text-muted" style={{ margin: 0 }}>Aún no hay comentarios.</p>}
        <ul className="app-stack">
          {meal.comments.map((c) => (
            <li key={c.id}>
              <CommentBubble author={c.author_name || 'Sin nombre'} role={c.author_role === 'nutritionist' ? 'nutritionist' : 'patient'} time={formatAgo(c.created_at)}>
                {c.body}
              </CommentBubble>
            </li>
          ))}
          {pendingComments.map((c) => (
            <li key={c.id} style={{ opacity: c.error ? 1 : 0.7 }}>
              <CommentBubble
                author={c.author_name || 'Sin nombre'}
                role={c.author_role === 'nutritionist' ? 'nutritionist' : 'patient'}
                time={c.error ? 'no se pudo enviar' : online ? 'enviando…' : 'se envía al volver la señal'}
              >
                {c.body}
              </CommentBubble>
              {c.error && (
                <Button variant="ghost" icon="refresh" onClick={() => retryJob(c.id)}>
                  Reintentar
                </Button>
              )}
            </li>
          ))}
        </ul>
        <form className="app-row" onSubmit={sendComment}>
          <TextField label="Escribe un comentario" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} />
          <Button type="submit" icon="send" disabled={!body.trim()}>
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
