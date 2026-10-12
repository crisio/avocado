import type { ReactNode } from 'react'
import { cx } from './cx'

export interface ScreenProps {
  children: ReactNode
  /** Deja espacio abajo para la TabBar fija. */
  withTabBar?: boolean
  /** Columna angosta (≈420 px) para formularios como el login. */
  narrow?: boolean
  /** Elemento raíz. Por defecto `main`. */
  as?: 'main' | 'div' | 'section'
}

/**
 * Contenedor de una pantalla de la app: columna centrada (máx. 560 px), márgenes de 20 px,
 * separación vertical de 18 px entre bloques y respeto a las zonas seguras del teléfono.
 */
export function Screen({ children, withTabBar = false, narrow = false, as: Tag = 'main' }: ScreenProps) {
  return <Tag className={cx('av-screen', withTabBar && 'av-screen--with-tabbar', narrow && 'av-screen--narrow')}>{children}</Tag>
}
