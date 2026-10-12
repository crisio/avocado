import type { ComponentPropsWithoutRef } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

export interface IconButtonProps extends Omit<ComponentPropsWithoutRef<'button'>, 'children'> {
  /** Ícono a mostrar. */
  icon: IconName
  /** Texto accesible (obligatorio: el botón no tiene texto visible). */
  label: string
  /** Sin borde ni fondo. */
  plain?: boolean
}

/** Botón circular de 44 px con un solo ícono, p. ej. flechas de día anterior/siguiente. */
export function IconButton({ icon, label, plain = false, className, type, ...rest }: IconButtonProps) {
  return (
    <button type={type ?? 'button'} aria-label={label} className={cx('av-icon-button', plain && 'av-icon-button--plain', className)} {...rest}>
      <Icon name={icon} />
    </button>
  )
}
