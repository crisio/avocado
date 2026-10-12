export interface LogoProps {
  /** Lado del ícono en px. Por defecto 72. */
  size?: number
  /** Muestra la palabra "Avocado" junto al ícono. */
  withWordmark?: boolean
}

/** Marca de Avocado: medio aguacate sobre un cuadro verde, con la palabra opcional. */
export function Logo({ size = 72, withWordmark = false }: LogoProps) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.22 }}>
      <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={withWordmark ? undefined : 'Avocado'} aria-hidden={withWordmark ? true : undefined}>
        <rect width="64" height="64" rx="14" fill="#2f7a3a" />
        <g transform="rotate(22 32 32)">
          <g fill="#163414">
            <circle cx="32" cy="18" r="10" />
            <circle cx="32" cy="40" r="16" />
            <path d="M22 18h20l6 22H16z" />
          </g>
          <g fill="#eef6c4">
            <circle cx="32" cy="18" r="7" />
            <circle cx="32" cy="40" r="13" />
            <path d="M25 18h14l6 22H19z" />
          </g>
          <circle cx="32" cy="41" r="7.5" fill="#804e26" />
        </g>
      </svg>
      {withWordmark && (
        <span className="av-display" style={{ fontSize: size * 0.5, fontWeight: 800, letterSpacing: '-0.03em' }}>
          Avocado
        </span>
      )}
    </span>
  )
}
