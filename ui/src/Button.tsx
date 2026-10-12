import type { ComponentPropsWithoutRef, ElementType } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

export interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  /** primary: acción principal (verde, una por pantalla). secondary: alternativa. ghost: enlace. danger: borrar. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  /** md = 48 px de alto; lg = 56 px (acción principal de la pantalla). */
  size?: 'md' | 'lg'
  /** Ocupa todo el ancho disponible. */
  fullWidth?: boolean
  /** Ícono antes del texto. */
  icon?: IconName
  /** Muestra un indicador de carga y desactiva el botón. */
  loading?: boolean
  /** Elemento a renderizar: 'button' (por defecto), 'a', o un Link del router (con `to`). */
  as?: ElementType
  /** Destino si se renderiza como enlace `<a>`. */
  href?: string
  /** Destino si `as` es un Link de react-router. */
  to?: string
}

/**
 * Botón de Avocado en forma de píldora. `primary` es verde con texto blanco; úsalo para la acción
 * principal (p. ej. "Registrar comida"). Con `href` o `as` se comporta como enlace.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  icon,
  loading = false,
  as,
  className,
  children,
  disabled,
  type,
  ...rest
}: ButtonProps) {
  const Comp: ElementType = as ?? (rest.href ? 'a' : 'button')
  const isButton = Comp === 'button'
  return (
    <Comp
      className={cx('av-button', `av-button--${variant}`, size === 'lg' && 'av-button--lg', fullWidth && 'av-button--full', className)}
      type={isButton ? (type ?? 'button') : undefined}
      disabled={isButton ? disabled || loading : undefined}
      aria-disabled={!isButton && disabled ? true : undefined}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="av-spinner" aria-hidden="true" /> : icon ? <Icon name={icon} /> : null}
      {children}
    </Comp>
  )
}
