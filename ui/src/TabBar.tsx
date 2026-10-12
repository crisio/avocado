import type { ElementType, ReactNode } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

export interface TabBarProps {
  /** Los TabBarItem de navegación. */
  children: ReactNode
  /** Acción principal encima de la navegación (un Button `primary` `lg` `fullWidth`, p. ej. "Registrar comida"). */
  action?: ReactNode
  /** Sin posición fija (para mostrarla dentro de una tarjeta o vista previa). */
  static?: boolean
}

/**
 * Barra inferior fija de la app: una acción principal en píldora verde y, debajo, los destinos
 * de navegación. Úsala con `Screen withTabBar` para que el contenido no quede debajo.
 */
export function TabBar({ children, action, static: isStatic = false }: TabBarProps) {
  return (
    <div className={cx('av-tabbar', isStatic && 'av-tabbar--static')}>
      <div className="av-tabbar__inner">
        {action}
        <nav aria-label="Navegación" className="av-tabbar__items">
          {children}
        </nav>
      </div>
    </div>
  )
}

export interface TabBarItemProps {
  /** Texto del destino ("Mi día"). */
  label: string
  /** Ícono a la izquierda del texto. */
  icon: IconName
  /** Marca el destino actual (aria-current="page"). Un NavLink del router lo marca solo. */
  active?: boolean
  /** Elemento raíz: 'a' (por defecto) o un NavLink del router (con `to`). */
  as?: ElementType
  href?: string
  to?: string
  /** Para destinos que son acciones (p. ej. cerrar sesión). */
  onClick?: () => void
  /** Otras props para el elemento (p. ej. `end` de NavLink). */
  [extra: string]: unknown
}

/** Un destino de la TabBar: ícono + texto; en negritas cuando está activo. */
export function TabBarItem({ label, icon, active, as, href, to, onClick, ...rest }: TabBarItemProps) {
  const Comp: ElementType = as ?? (href ? 'a' : 'button')
  return (
    <Comp className="av-tabbar__item" href={href} to={to} onClick={onClick} aria-current={active ? 'page' : undefined} {...rest}>
      <Icon name={icon} />
      {label}
    </Comp>
  )
}
