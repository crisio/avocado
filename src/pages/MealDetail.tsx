import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Chip, CommentBubble, EmptyState, Notice, NutritionTable, Screen, TextField } from '@avocado/ui'
import AiConsentCard from '../components/AiConsent'
import Gif from '../components/Gif'
import { Mascot } from '../components/Mascot'
import MoodCheckIn from '../components/MoodCheckIn'
import PhotoViewer from '../components/PhotoViewer'
import Portions from '../components/Portions'
import ShareSticker from '../components/ShareSticker'
import TopBar from '../components/TopBar'
import { useAuth } from '../auth'
import { api, type ApiError } from '../lib/api'
import { useCachedApi } from '../lib/useCachedApi'
import { discardJob, enqueueComment, retryJob, useOutbox, type CommentJob, type MealJob } from '../lib/outbox'
import { jobToMeal, usePhotoUrls } from '../lib/localMeals'
import { useOnline } from '../lib/useOnline'
import { formatAgo, formatDay } from '../lib/format'
import { cheer, watchMeal, type MealState } from '../lib/mascot'
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
  const [correction, setCorrection] = useState('')
  const [correcting, setCorrecting] = useState(false)
  const [correctError, setCorrectError] = useState<string | null>(null)
  const [portionsSaving, setPortionsSaving] = useState(false)
  const [viewing, setViewing] = useState(false)

  // Comida que sigue en el teléfono (recién registrada o sin conexión)
  const job = jobs.find((j): j is MealJob => j.kind === 'meal' && j.id === id)
  const localPhotos = usePhotoUrls(useMemo(() => (job ? [job] : []), [job]))

  // Rápido mientras la IA analiza; después, cada 15 s para ver comentarios nuevos.
  const [fast, setFast] = useState(true)
  const { data, error, fresh, mutate, refresh } = useCachedApi<MealWithComments>(job ? null : `/meals/${id}`, fast ? 4_000 : 15_000)
  const status = data?.status
  useEffect(() => setFast(!status || status === 'pending'), [status])

  const pendingComments = jobs.filter((j): j is CommentJob => j.kind === 'comment' && j.mealId === id && !data?.comments.some((c) => c.id === j.id))

  const meal: MealWithComments | null | undefined = job
    ? { ...jobToMeal(job, localPhotos.get(job.id)!), comments: [] }
    : data ?? ((error as ApiError | null)?.status === 404 ? null : undefined)

  // Avo celebra cuando tu comida termina de analizarse mientras la ves (o avisa si falló). Solo con datos vivos (no
  // el caché) y no mientras se reintenta el análisis: el sondeo todavía puede traer el error de antes.
  const mealState: MealState | null = job
    ? job.error
      ? 'failed'
      : 'queued'
    : fresh && !retrying && data && data.user_id === user?.id
      ? data.status
      : null
  useEffect(() => {
    if (mealState) watchMeal(id, mealState, data?.calories, data?.analysis?.avo?.text)
  }, [id, mealState])

  async function sendComment(e: FormEvent) {
    e.preventDefault()
    if (!body.trim() || !user) return
    // Se guarda en la cola: aparece al instante y se envía en cuanto hay señal.
    await enqueueComment({ id: crypto.randomUUID(), userId: user.id, mealId: id, body: body.trim(), author_name: user.full_name, author_role: user.role })
    setBody('')
    if (online) cheer('love', user.role === 'nutritionist' ? '¡Indicación enviada!' : '¡Comentario enviado!', { interrupt: true })
    else cheer('think', 'Lo envío cuando vuelva la señal', { interrupt: true })
  }

  async function retry() {
    if (!data) return
    setRetrying(true)
    cheer('think', 'Lo intento otra vez…', { interrupt: true })
    mutate((prev) => (prev ? { ...prev, status: 'pending' } : prev))
    try {
      const updated = await api<Meal>(`/meals/${id}/analyze?offset=${new Date().getTimezoneOffset()}`, { method: 'POST', timeoutMs: 90_000 })
      mutate((prev) => (prev ? { ...prev, ...updated } : prev))
    } catch (err) {
      mutate((prev) => (prev ? { ...prev, status: data.status } : prev))
      alert((err as Error).message)
    }
    setRetrying(false)
  }

  const applyMeal = (updated: Meal) => mutate((prev) => (prev ? { ...prev, ...updated } : prev))

  async function correct(e: FormEvent) {
    e.preventDefault()
    if (!correction.trim()) return
    setCorrecting(true)
    setCorrectError(null)
    cheer('think', 'Déjame ajustarla…', { interrupt: true })
    try {
      const updated = await api<Meal>(`/meals/${id}/correct`, { method: 'POST', json: { text: correction.trim() }, timeoutMs: 60_000 })
      applyMeal(updated)
      setCorrection('')
      cheer('celebrate', `¡Corregido! ${Math.round(updated.calories ?? 0)} kcal`, { interrupt: true })
    } catch (err) {
      setCorrectError((err as Error).message)
      cheer('oops', 'No pude corregirla', { interrupt: true })
      if ((err as ApiError).status === 409) void refresh()
    }
    setCorrecting(false)
  }

  async function remove() {
    if (!confirm('¿Borrar esta comida?')) return
    try {
      if (job) await discardJob(job.id)
      else await api(`/meals/${id}`, { method: 'DELETE' })
      cheer('oops', 'Comida borrada')
      navigate('/', { replace: true })
    } catch (err) {
      alert((err as Error).message)
    }
  }

  // Avo piensa mientras la comida está en cola o analizándose.
  const thinking = job ? !job.error : meal?.status === 'pending'
  const back = <TopBar onBack={() => navigate(-1)} thinking={thinking} />

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
  // Comida que llegó sin permiso para la IA (p. ej. esperaba en la cola): primero el permiso, luego reintentar.
  const needsConsent = !job && isOwner && !user?.ai_consent_at && meal.status !== 'analyzed'

  return (
    <Screen withTabBar>
      {back}
      <img className="av-hero-photo" src={meal.photo_url} alt="Foto de la comida" onClick={() => setViewing(true)} style={{ cursor: 'zoom-in' }} />
      {viewing && <PhotoViewer src={meal.photo_url} local={job?.photo} canSave={isOwner} onClose={() => setViewing(false)} />}

      <div className="app-stack" style={{ gap: 6 }}>
        <span className="av-meal-card__meta">
          {formatDay(new Date(meal.eaten_at))} · {formatTime(meal.eaten_at)} · {mealKindLabel(mealKind(meal))}
        </span>
        <h1 className="av-page-header__title" style={{ fontSize: 28 }}>
          {job ? 'Comida guardada en el teléfono' : mealTitle(meal)}
        </h1>
        {meal.note && <p className="app-note">“{meal.note}”</p>}
        {meal.cooking && (
          <p className="av-text-muted" style={{ margin: 0, fontSize: 14 }}>
            🍳 {meal.cooking}
          </p>
        )}
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
          {canRetry && !needsConsent && (
            <Button variant="secondary" icon="refresh" onClick={retry}>
              Reintentar análisis
            </Button>
          )}
        </Card>
      )}

      {needsConsent && <AiConsentCard />}

      {meal.status === 'analyzed' && a && (
        <Card padding="lg">
          {a.items?.length ? (
            <Portions
              meal={meal}
              editable={isOwner && !job}
              online={online}
              locked={correcting}
              onChange={applyMeal}
              onSavingChange={setPortionsSaving}
              onStale={() => void refresh()}
            />
          ) : (
            <NutritionTable
              totals={{ calories: meal.calories ?? 0, protein_g: meal.protein_g ?? 0, carbs_g: meal.carbs_g ?? 0, fat_g: meal.fat_g ?? 0 }}
              note={a.summary}
            />
          )}
          {!a.items?.length && (
            <p className="av-nutrition__note">Estimación con IA: puede equivocarse y no es consejo médico. Sigue las indicaciones de tu nutrióloga.</p>
          )}
        </Card>
      )}

      {meal.status === 'analyzed' && isOwner && !job && a?.avo?.text && (
        <Card padding="lg" as="section" aria-label="Avo dice">
          <div className="avo-says">
            <Mascot size={48} play="love" pose={0} />
            <div className="avo-says__body app-stack" style={{ gap: 6 }}>
              <h2 className="av-section-title">Avo dice</h2>
              <p style={{ margin: 0 }}>{a.avo.text}</p>
              {a.avo.gif && <Gif gif={a.avo.gif} />}
            </div>
          </div>
        </Card>
      )}

      {meal.status === 'analyzed' && isOwner && !job && <ShareSticker meal={meal} />}

      {meal.status === 'analyzed' && a && isOwner && !job && (
        <Card as="form" padding="lg" onSubmit={correct}>
          <TextField
            label="¿Algo no cuadra? Cuéntalo con tus palabras"
            multiline
            rows={2}
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            maxLength={1000}
            placeholder="Ej. me dejé la mitad de la ensalada, solo probé un aderezo y me tomé todo el jugo"
            hint="La IA ajusta los alimentos y las porciones; no vuelve a mandar la foto."
          />
          {correctError && <Notice tone="error">{correctError}</Notice>}
          <Button type="submit" variant="secondary" icon="refresh" loading={correcting} disabled={!correction.trim() || !online || portionsSaving}>
            {online ? 'Corregir' : 'Corregir (sin conexión)'}
          </Button>
        </Card>
      )}

      {isOwner && !job && <MoodCheckIn mealId={meal.id} title="¿Cómo te sentiste después de comer?" />}

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
