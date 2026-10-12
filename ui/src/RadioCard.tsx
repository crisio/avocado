import type { ComponentPropsWithoutRef } from 'react'

export interface RadioCardProps extends Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'title'> {
  /** Opción en negritas ("Paciente"). */
  title: string
  /** Explicación corta debajo. */
  description?: string
}

/** Opción de elección única con forma de tarjeta; se pinta de verde claro al seleccionarla. Agrupa varias con el mismo `name`. */
export function RadioCard({ title, description, ...rest }: RadioCardProps) {
  return (
    <label className="av-radio-card">
      <input type="radio" {...rest} />
      <span className="av-radio-card__text">
        <span className="av-radio-card__title">{title}</span>
        {description && <span className="av-radio-card__description">{description}</span>}
      </span>
    </label>
  )
}
