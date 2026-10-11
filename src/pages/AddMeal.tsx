import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { compressImage } from '../lib/image'
import { toLocalInput } from '../lib/format'
import { PHOTO_BUCKET, supabase } from '../lib/supabase'

export default function AddMeal() {
  const { session } = useAuth()
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
    if (!file || !session) return
    setBusy(true)
    setError(null)

    try {
      const photo = await compressImage(file)
      const path = `${session.user.id}/${crypto.randomUUID()}.jpg`
      const upload = await supabase.storage.from(PHOTO_BUCKET).upload(path, photo, { contentType: 'image/jpeg' })
      if (upload.error) throw upload.error

      const { data: meal, error: insertError } = await supabase
        .from('meals')
        .insert({ photo_path: path, note: note.trim() || null, eaten_at: new Date(eatenAt).toISOString() })
        .select('id')
        .single()
      if (insertError) throw insertError

      // El análisis corre en segundo plano; la pantalla de detalle se actualiza en tiempo real al terminar.
      supabase.functions.invoke('analyze-meal', { body: { meal_id: meal.id } })
      navigate(`/comida/${meal.id}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la comida')
      setBusy(false)
    }
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <h1>Registrar comida</h1>

      <div className={`photo-preview card ${preview ? 'has-photo' : ''}`}>
        {preview ? <img src={preview} alt="Foto de la comida" /> : <span className="muted">Aún no hay foto</span>}
      </div>
      <div className="row">
        <label className="button">
          📷 Tomar foto
          <input type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} hidden />
        </label>
        <label className="button">
          🖼️ Galería
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} hidden />
        </label>
      </div>

      <label>
        ¿Cuándo comiste?
        <input type="datetime-local" value={eatenAt} onChange={(e) => setEatenAt(e.target.value)} required />
      </label>

      <label>
        Nota (opcional)
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Ej. sin azúcar, con una cucharada de aceite de oliva, me comí la mitad…"
        />
      </label>

      {error && <p className="error">{error}</p>}

      <button className="primary" disabled={!file || busy}>
        {busy ? 'Subiendo…' : 'Guardar y analizar'}
      </button>
    </form>
  )
}
