import { useId, type ComponentPropsWithoutRef } from 'react'
import { cx } from './cx'

export interface TextFieldProps extends ComponentPropsWithoutRef<'input'> {
  /** Etiqueta visible encima del campo (obligatoria por accesibilidad). */
  label: string
  /** Texto de ayuda debajo del campo. */
  hint?: string
  /** Mensaje de error; marca el campo en rojo. */
  error?: string
  /** Usa un área de texto de varias líneas en lugar de un input. */
  multiline?: boolean
  /** Líneas visibles cuando `multiline` está activo. Por defecto 3. */
  rows?: number
}

/** Campo de texto con etiqueta, ayuda y error. Tamaño de letra de 16 px para que iOS no haga zoom. */
export function TextField({ label, hint, error, multiline = false, rows = 3, id, className, ...rest }: TextFieldProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined
  const common = {
    id: fieldId,
    className: 'av-field__control',
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
  }
  return (
    <div className={cx('av-field', error && 'av-field--invalid', className)}>
      <label className="av-field__label" htmlFor={fieldId}>
        {label}
      </label>
      {multiline ? (
        <textarea {...common} rows={rows} {...(rest as ComponentPropsWithoutRef<'textarea'>)} />
      ) : (
        <input {...common} {...rest} />
      )}
      {error ? (
        <span id={`${fieldId}-error`} className="av-field__error">
          {error}
        </span>
      ) : hint ? (
        <span id={`${fieldId}-hint`} className="av-field__hint">
          {hint}
        </span>
      ) : null}
    </div>
  )
}
