import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, IconButton, Notice, PageHeader, PhotoPicker, Screen, TextField } from '@avocado/ui'
import { api } from '../lib/api'
import { compressImage } from '../lib/image'
import { toLocalInput } from '../lib/format'
import type { Meal } from '../lib/types'

export default function AddMeal() {
  const navigate = useNavigate()
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
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const form = new FormData()
      form.set('photo', await compressImage(file), 'comida.jpg')
      form.set('eaten_at', new Date(eatenAt).toISOString())
      if (note.trim()) form.set('note', note.trim())
      const meal = await api<Meal>('/meals', { method: 'POST', body: form })

      // El análisis sigue en segundo plano; el detalle se actualiza solo cuando termina.
      api(`/meals/${meal.id}/analyze`, { method: 'POST' }).catch(() => {})
      navigate(`/comida/${meal.id}`, { replace: true })
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
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" size="lg" fullWidth icon="check" loading={busy} disabled={!file}>
          Guardar y analizar
        </Button>
      </form>
    </Screen>
  )
}
