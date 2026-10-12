import type { MealKind } from './meal'

export interface PlateIllustrationProps {
  /** Qué comida dibujar. Sin `kind` dibuja un plato vacío. */
  kind?: MealKind
  /** Lado en px. Por defecto 76. */
  size?: number
}

/** Plato ilustrado que sustituye a la foto mientras carga o cuando no hay foto. Decorativo. */
export function PlateIllustration({ kind, size = 76 }: PlateIllustrationProps) {
  return (
    <svg className="av-plate" width={size} height={size} viewBox="0 0 52 52" aria-hidden="true">
      <circle cx="26" cy="26" r="25" fill="#FFFFFF" />
      <circle cx="26" cy="26" r="19" fill="#F7F5EF" />
      {kind === 'breakfast' && (
        <>
          <circle cx="20" cy="21" r="7" fill="#F2C14E" />
          <path d="M27 31a8 8 0 0 1 13-6 8 8 0 0 1-13 6z" fill="#7FB04F" />
          <rect x="15" y="29" width="12" height="9" rx="3" fill="#C8935A" />
        </>
      )}
      {kind === 'lunch' && (
        <>
          <ellipse cx="19" cy="25" rx="9" ry="8" fill="#EDE6D6" />
          <rect x="25" y="16" width="12" height="10" rx="4" fill="#D39B5F" />
          <circle cx="31" cy="33" r="7" fill="#6FA34B" />
        </>
      )}
      {kind === 'dinner' && (
        <>
          <path d="M14 30c3-8 18-10 24-2-5 7-19 8-24 2z" fill="#B5703F" />
          <circle cx="20" cy="20" r="5" fill="#8DBB6A" />
          <circle cx="28" cy="18" r="4" fill="#6FA34B" />
          <circle cx="35" cy="22" r="3.5" fill="#E07A4F" />
        </>
      )}
      {kind === 'snack' && (
        <>
          <circle cx="26" cy="26" r="13" fill="#FBFAF7" stroke="#EAE6DD" strokeWidth="1" />
          <circle cx="22" cy="22" r="3.5" fill="#D9483B" />
          <circle cx="30" cy="24" r="3" fill="#D9483B" />
          <circle cx="25" cy="31" r="3.2" fill="#D9483B" />
        </>
      )}
    </svg>
  )
}
