import { cx } from './cx'
import { Icon } from './Icon'

export interface PhotoPickerProps {
  /** URL de vista previa de la foto elegida (p. ej. de URL.createObjectURL). */
  previewUrl?: string | null
  /** Se llama con el archivo elegido desde la cámara o la galería. */
  onSelect: (file: File) => void
}

/**
 * Elegir la foto de una comida: recuadro 4:3 con la vista previa y dos botones,
 * "Tomar foto" (abre la cámara trasera) y "Galería".
 */
export function PhotoPicker({ previewUrl, onSelect }: PhotoPickerProps) {
  const handle = (e: { target: HTMLInputElement }) => {
    const file = e.target.files?.[0]
    if (file) onSelect(file)
  }
  return (
    <div className="av-photo-picker">
      <div className={cx('av-photo-picker__frame', previewUrl && 'av-photo-picker__frame--filled')}>
        {previewUrl ? (
          <img src={previewUrl} alt="Foto de la comida" />
        ) : (
          <>
            <Icon name="camera" size={32} />
            <span>Aún no hay foto</span>
          </>
        )}
      </div>
      <div className="av-photo-picker__actions">
        <label className="av-button av-button--secondary">
          <Icon name="camera" />
          Tomar foto
          <input type="file" accept="image/*" capture="environment" onChange={handle} />
        </label>
        <label className="av-button av-button--secondary">
          <Icon name="image" />
          Galería
          <input type="file" accept="image/*" onChange={handle} />
        </label>
      </div>
    </div>
  )
}
