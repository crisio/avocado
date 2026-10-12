import type { ElementType, ReactNode } from 'react'
import { cx } from './cx'
import type { MealKind } from './meal'
import { PlateIllustration } from './PlateIllustration'

export interface MealCardProps {
  /** Nombre del plato ("Huevos con aguacate y pan"). */
  title: string
  /** Línea de contexto arriba del título: hora y tipo ("8:15 a.m. · Desayuno"). */
  meta: string
  /** Línea de datos debajo ("376 kcal · 21 g proteína"). */
  detail?: string
  /** Foto de la comida. Sin foto se dibuja un plato ilustrado. */
  photoUrl?: string
  /** Tipo de comida: color de fondo de la foto y dibujo del plato de respaldo. */
  kind?: MealKind
  /** Etiqueta de estado debajo del detalle (p. ej. un Chip "Analizando…"). */
  badge?: ReactNode
  /** Versión más baja (foto de 64 px) para listas largas. */
  compact?: boolean
  /** Elemento raíz: 'div' (por defecto), 'a' (con `href`) o un Link del router (con `to`). */
  as?: ElementType
  href?: string
  to?: string
}

/**
 * Tarjeta de una comida registrada: foto (o plato ilustrado) sobre un fondo del color de su tipo,
 * hora y tipo, nombre del plato en Bricolage y calorías. Normalmente es un enlace al detalle.
 */
export function MealCard({ title, meta, detail, photoUrl, kind, badge, compact = false, as, href, to }: MealCardProps) {
  const Comp: ElementType = as ?? (href ? 'a' : 'div')
  return (
    <Comp className={cx('av-meal-card', kind && `av-meal-card--${kind}`, compact && 'av-meal-card--compact')} href={href} to={to}>
      <span className="av-meal-card__media">
        {photoUrl ? <img src={photoUrl} alt="" loading="lazy" /> : <PlateIllustration kind={kind} size={compact ? 52 : 76} />}
      </span>
      <span className="av-meal-card__body">
        <span className="av-meal-card__meta">{meta}</span>
        <span className="av-meal-card__title">{title}</span>
        {detail && <span className="av-meal-card__detail">{detail}</span>}
        {badge}
      </span>
    </Comp>
  )
}
