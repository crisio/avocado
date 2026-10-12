import { IconButton } from './IconButton'

export interface DayNavProps {
  /** Día mostrado ("Hoy", "Ayer", "Viernes 9 de octubre"). */
  label: string
  onPrev: () => void
  onNext: () => void
  /** Desactiva "siguiente" (p. ej. cuando ya es hoy). */
  nextDisabled?: boolean
  /** Texto de las flechas para lectores de pantalla. Por defecto "Día anterior" / "Día siguiente". */
  prevLabel?: string
  nextLabel?: string
}

/** Navegación entre días (o semanas): flecha anterior, nombre al centro y flecha siguiente. */
export function DayNav({ label, onPrev, onNext, nextDisabled = false, prevLabel = 'Día anterior', nextLabel = 'Día siguiente' }: DayNavProps) {
  return (
    <div className="av-day-nav">
      <IconButton icon="chevron-left" label={prevLabel} onClick={onPrev} />
      <h2 className="av-day-nav__label" aria-live="polite">
        {label}
      </h2>
      <IconButton icon="chevron-right" label={nextLabel} onClick={onNext} disabled={nextDisabled} />
    </div>
  )
}
