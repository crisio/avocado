import type { ElementType, ReactNode } from 'react'
import { Avatar } from './Avatar'

export interface PersonRowProps {
  /** Nombre de la persona. */
  name: string
  /** Segunda línea (correo, última comida…). */
  detail?: string
  /** Elemento a la derecha (un Button ghost "Quitar", un ícono de flecha). */
  trailing?: ReactNode
  /** Elemento raíz: 'div' (por defecto), 'a' (con `href`) o un Link del router (con `to`). */
  as?: ElementType
  href?: string
  to?: string
}

/** Fila de una persona (paciente o nutrióloga): avatar, nombre, detalle y acción opcional. */
export function PersonRow({ name, detail, trailing, as, href, to }: PersonRowProps) {
  const Comp: ElementType = as ?? (href ? 'a' : 'div')
  return (
    <Comp className="av-person-row" href={href} to={to}>
      <Avatar name={name} size={40} tone="soft" />
      <span className="av-person-row__text">
        <span className="av-person-row__name">{name}</span>
        {detail && <span className="av-person-row__detail">{detail}</span>}
      </span>
      {trailing}
    </Comp>
  )
}
