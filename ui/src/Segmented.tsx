import { cx } from './cx'

export interface SegmentedOption<T extends string | number> {
  value: T
  /** Texto del botón ("Todo", "½"). */
  label: string
  /** Texto para lectores de pantalla si `label` es un símbolo ("La mitad"). */
  ariaLabel?: string
}

export interface SegmentedProps<T extends string | number> {
  /** Qué se elige (para lectores de pantalla): "Cuánto comiste de Arroz". */
  label: string
  options: SegmentedOption<T>[]
  /** Opción elegida; si no coincide con ninguna, no se marca ninguna. */
  value: T | null
  onChange: (value: T) => void
  disabled?: boolean
}

/** Grupo de opciones excluyentes en una píldora ("Todo · ¾ · ½ · ¼ · Nada"). */
export function Segmented<T extends string | number>({ label, options, value, onChange, disabled = false }: SegmentedProps<T>) {
  return (
    <div className="av-segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.ariaLabel}
            className={cx('av-segmented__option', active && 'av-segmented__option--active')}
            disabled={disabled}
            onClick={() => !active && onChange(o.value)}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
