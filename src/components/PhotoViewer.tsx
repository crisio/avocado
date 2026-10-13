import { useEffect, useRef, useState } from 'react'
import { Button, Notice } from '@avocado/ui'
import { cheer } from '../lib/mascot'

/** Comparte la foto con el menú del sistema o, si no se puede, la descarga. Resuelve en `false` si se canceló. */
export async function savePhoto(photoUrl: string, local?: Blob): Promise<boolean> {
  // La foto vive en otro dominio (la API): `<a download>` no sirve directo, así que se baja como blob.
  let blob = local
  if (!blob) {
    const res = await fetch(photoUrl)
    if (!res.ok) throw new Error('No se pudo bajar la foto')
    blob = await res.blob()
  }
  const file = new File([blob], 'avocado-comida.jpg', { type: blob.type || 'image/jpeg' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return true
    } catch (err) {
      if ((err as Error).name === 'AbortError') return false
      throw err
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'avocado-comida.jpg'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return true
}

/** Foto de la comida a pantalla completa. Se cierra con Escape, con ✕ o tocando fuera de la foto. */
export default function PhotoViewer({ src, local, canSave, onClose }: { src: string; local?: Blob; canSave: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => dialog?.close()
  }, [])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      if (await savePhoto(src, local)) cheer('love', '¡Foto lista!', { interrupt: true })
    } catch {
      setError('No se pudo guardar la foto.')
    }
    setSaving(false)
  }

  return (
    <dialog
      ref={ref}
      className="photo-viewer"
      aria-label="Foto de la comida"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <button type="button" className="photo-viewer__close" onClick={onClose} aria-label="Cerrar foto">
        ✕
      </button>
      <img className="photo-viewer__img" src={src} alt="Foto de la comida" />
      {(canSave || error) && (
        <div className="photo-viewer__bar">
          {error && <Notice tone="error">{error}</Notice>}
          {canSave && (
            <Button icon="download" onClick={save} loading={saving}>
              Guardar foto
            </Button>
          )}
        </div>
      )}
    </dialog>
  )
}
