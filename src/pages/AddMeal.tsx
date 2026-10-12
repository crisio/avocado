import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, IconButton, Notice, PageHeader, PhotoPicker, Screen, TextField } from '@avocado/ui'
import { useAuth } from '../auth'
import { compressImage } from '../lib/image'
import { enqueueMeal } from '../lib/outbox'
import { toLocalInput } from '../lib/format'
import { useOnline } from '../lib/useOnline'

export default function AddMeal() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const online = useOnline()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [eatenAt, setEatenAt] = useState(() => toLocalInput(new Date()))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      // Primero se guarda en el teléfono; la cola la sube (y el servidor la analiza) en cuanto hay señal.
      const job = await enqueueMeal({
        id: crypto.randomUUID(),
        userId: user.id,
        photo: await compressImage(file),
        eaten_at: new Date(eatenAt).toISOString(),
        note: note.trim() || null,
      })
      navigate(`/comida/${job.id}`, { replace: true })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Screen withTabBar>
      <div>
        <IconButton icon="chevron-left" label="Volver" plain onClick={() => navigate(-1)} />
      </div>
      <PageHeader title="Registrar comida" compact />
      <form className="app-stack" style={{ gap: 18 }} onSubmit={onSubmit}>
        <PhotoPicker previewUrl={preview} onSelect={setFile} />
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
    </Screen>
  )
}
