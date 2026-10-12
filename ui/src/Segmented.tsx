import { useRef, type KeyboardEvent } from 'react'
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

/**
 * Grupo de opciones excluyentes en una píldora ("Todo · ¾ · ½ · ¼ · Nada"). Funciona como un grupo de radio:
 * una sola parada de Tab y las flechas cambian la opción.
 */
export function Segmented<T extends string | number>({ label, options, value, onChange, disabled = false }: SegmentedProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const selected = options.findIndex((o) => o.value === value)
  const tabStop = selected === -1 ? 0 : selected

  function onKeyDown(e: KeyboardEvent, index: number) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    const target = e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : step ? (index + step + options.length) % options.length : -1
    if (target === -1) return
    e.preventDefault()
    refs.current[target]?.focus()
    if (options[target].value !== value) onChange(options[target].value)
  }

  return (
    <div className="av-segmented" role="radiogroup" aria-label={label} aria-disabled={disabled || undefined}>
      {options.map((o, i) => {
        const active = i === selected
        return (
          <button
            key={String(o.value)}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.ariaLabel}
            tabIndex={i === tabStop ? 0 : -1}
            className={cx('av-segmented__option', active && 'av-segmented__option--active')}
            disabled={disabled}
            onClick={() => !active && onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
