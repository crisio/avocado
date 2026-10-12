import type { ReactNode } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

export interface ChipProps {
  children: ReactNode
  /** neutral: blanco con borde. accent: verde claro. warning: ámbar (p. ej. "Analizando…"). danger: rojo claro. */
  tone?: 'neutral' | 'accent' | 'warning' | 'danger'
  /** Ícono opcional antes del texto. */
  icon?: IconName
}

/** Etiqueta en forma de píldora para datos cortos o estados ("82 g proteína", "Analizando…"). */
export function Chip({ children, tone = 'neutral', icon }: ChipProps) {
  return (
    <span className={cx('av-chip', `av-chip--${tone}`)}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </span>
  )
}
