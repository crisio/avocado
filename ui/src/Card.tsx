import type { ComponentPropsWithoutRef } from 'react'
import { cx } from './cx'

export interface CardProps extends ComponentPropsWithoutRef<'div'> {
  /** Relleno interno: none (para fotos a sangre), md = 16 px, lg = 20 px. Por defecto md. */
  padding?: 'none' | 'md' | 'lg'
  /** Agrega un borde fino (útil sobre fondo blanco). */
  outlined?: boolean
  /** Elemento raíz. */
  as?: 'div' | 'section' | 'article' | 'aside' | 'form'
}

/** Superficie blanca de esquinas redondeadas (22 px) que agrupa contenido; apila sus hijos con 14 px de separación. */
export function Card({ padding = 'md', outlined = false, as: Tag = 'div', className, ...rest }: CardProps) {
  return <Tag className={cx('av-card', `av-card--pad-${padding}`, outlined && 'av-card--outlined', className)} {...(rest as object)} />
}
