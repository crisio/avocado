import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Notice, PageHeader, PhotoPicker, Screen, TextField } from '@avocado/ui'
import { useAuth } from '../auth'
import { celebrateMeal } from '../components/Celebration'
import CravingLink from '../components/CravingLink'
import TopBar from '../components/TopBar'
import { compressImage } from '../lib/image'
import { cheer, preloadHd } from '../lib/mascot'
import { enqueueMeal, useOutbox } from '../lib/outbox'
import { streakAfterNewMeal } from '../lib/streak'
import { firstName, toDayParam, toLocalInput } from '../lib/format'
import { useOnline } from '../lib/useOnline'

export default function AddMeal() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const online = useOnline()
  const { jobs } = useOutbox()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [eatenAt, setEatenAt] = useState(() => toLocalInput(new Date()))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Las tiras grandes de Avo para la celebración, listas antes de guardar.
  useEffect(preloadHd, [])

  useEffect(() => {
    if (!file) return setPreview(null)
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!file || !user) return
    setBusy(true)
    setError(null)
    try {
      // Cómo queda la racha (antes de ponerla en la cola, para saber si es la primera de hoy). Solo si es de hoy.
      const streak = toDayParam(new Date(eatenAt)) === toDayParam(new Date()) ? streakAfterNewMeal(user.id, jobs) : null
      // Primero se guarda en el teléfono; la cola la sube (y el servidor la analiza) en cuanto hay señal.
      const job = await enqueueMeal({
        id: crypto.randomUUID(),
        userId: user.id,
        photo: await compressImage(file),
        eaten_at: new Date(eatenAt).toISOString(),
        note: note.trim() || null,
      })
      // ¡Lo logró! Confeti, su foto como plato y Avo comiendo; encima del detalle de la comida.
      const name = firstName(user.full_name)
      celebrateMeal({
        title: '¡Comida registrada!',
        streak,
        message: online
          ? `¡Buen provecho${name ? `, ${name}` : ''}! Avo ya está analizando tu foto.`
          : 'Quedó guardada en el teléfono. Avo la analiza en cuanto vuelva la señal.',
        photoUrl: URL.createObjectURL(job.photo),
      })
      navigate(`/comida/${job.id}`, { replace: true })
    } catch (err) {
      setError((err as Error).message)
      cheer('oops', 'No pude guardar la foto', { interrupt: true })
      setBusy(false)
    }
  }

  return (
    <Screen withTabBar>
      <TopBar onBack={() => navigate(-1)} />
      <PageHeader title="Registrar comida" compact />
      <form className="app-stack" style={{ gap: 18 }} onSubmit={onSubmit}>
        <PhotoPicker
          previewUrl={preview}
          onSelect={(f) => {
            setFile(f)
            cheer('love', '¡Qué rico se ve!', { interrupt: true })
          }}
        />
        <TextField label="¿Cuándo comiste?" type="datetime-local" value={eatenAt} onChange={(e) => setEatenAt(e.target.value)} required />
        <TextField
          label="Nota (opcional)"
          multiline
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ej. sin azúcar, con una cucharada de aceite de oliva, me comí la mitad…"
          hint="Ayuda a la IA con lo que no se ve en la foto."
        />
        {!online && <Notice tone="warning">Sin conexión: la comida se guarda en el teléfono y se analiza sola al volver la señal.</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" size="lg" fullWidth icon="check" loading={busy} disabled={!file}>
          {online ? 'Guardar y analizar' : 'Guardar en el teléfono'}
        </Button>
      </form>
      <CravingLink compact />
    </Screen>
  )
}
