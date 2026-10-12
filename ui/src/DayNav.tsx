import { IconButton } from './IconButton'

export interface DayNavProps {
  /** Día mostrado ("Hoy", "Ayer", "Viernes 9 de octubre"). */
  label: string
  onPrev: () => void
  onNext: () => void
  /** Desactiva "siguiente" (p. ej. cuando ya es hoy). */
  nextDisabled?: boolean
}

/** Navegación entre días: flecha anterior, nombre del día al centro y flecha siguiente. */
export function DayNav({ label, onPrev, onNext, nextDisabled = false }: DayNavProps) {
  return (
    <div className="av-day-nav">
      <IconButton icon="chevron-left" label="Día anterior" onClick={onPrev} />
      <h2 className="av-day-nav__label" aria-live="polite">
        {label}
      </h2>
      <IconButton icon="chevron-right" label="Día siguiente" onClick={onNext} disabled={nextDisabled} />
    </div>
  )
}
