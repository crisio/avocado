import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export interface EmptyStateProps {
  /** Mensaje principal ("Sin comidas registradas"). */
  title: string
  /** Explicación o siguiente paso. */
  description?: ReactNode
  /** Botón opcional para resolverlo. */
  action?: ReactNode
  /** Ícono arriba del título. */
  icon?: IconName
}

/** Estado vacío con borde punteado: qué falta y cómo resolverlo. */
export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="av-empty">
      {icon && <Icon name={icon} size={28} style={{ color: 'var(--av-muted)' }} />}
      <p className="av-empty__title">{title}</p>
      {description && <p className="av-empty__description">{description}</p>}
      {action}
    </div>
  )
}
