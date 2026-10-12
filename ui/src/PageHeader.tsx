import type { ReactNode } from 'react'
import { cx } from './cx'

export interface PageHeaderProps {
  /** Título grande de la pantalla. */
  title: string
  /** Línea pequeña encima del título (fecha, contexto). */
  eyebrow?: string
  /** Acción a la derecha (un Button o IconButton). */
  action?: ReactNode
  /** Título más pequeño (26 px) para pantallas secundarias. */
  compact?: boolean
}

/** Encabezado de pantalla: título en Bricolage de 34 px con línea de contexto opcional y una acción. */
export function PageHeader({ title, eyebrow, action, compact = false }: PageHeaderProps) {
  return (
    <header className={cx('av-page-header', compact && 'av-page-header--compact')}>
      <div className="av-page-header__text">
        {eyebrow && <span className="av-page-header__eyebrow">{eyebrow}</span>}
        <h1 className="av-page-header__title">{title}</h1>
      </div>
      {action}
    </header>
  )
}
