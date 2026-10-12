import type { Ref } from 'react'

export interface CodeInputProps {
  /** Dígitos escritos hasta ahora. */
  value: string
  /** Se llama con solo los dígitos (máximo `length`). */
  onChange: (value: string) => void
  /** Se llama cuando se completan todos los dígitos. */
  onComplete?: (value: string) => void
  /** Cantidad de dígitos. Por defecto 6. */
  length?: number
  disabled?: boolean
  autoFocus?: boolean
  /** Texto accesible. Por defecto "Código". */
  label?: string
  inputRef?: Ref<HTMLInputElement>
}

/**
 * Campo grande para el código de acceso que llega por correo. Teclado numérico en el teléfono
 * y autocompletado del código desde el SMS/correo (`one-time-code`).
 */
export function CodeInput({ value, onChange, onComplete, length = 6, disabled, autoFocus, label = 'Código', inputRef }: CodeInputProps) {
  return (
    <input
      ref={inputRef}
      className="av-code-input"
      value={value}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, length)
        onChange(digits)
        if (digits.length === length) onComplete?.(digits)
      }}
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder={'•'.repeat(length)}
      aria-label={label}
      disabled={disabled}
      autoFocus={autoFocus}
    />
  )
}
