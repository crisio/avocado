import { LOGO_PATHS } from './logo-paths'

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
      <svg width={size} height={size} viewBox="0 0 1024 1024" role="img" aria-label={withWordmark ? undefined : 'Avocado'} aria-hidden={withWordmark ? true : undefined}>
        <rect width="1024" height="1024" rx="230" fill="#2f7a3a" />
        {LOGO_PATHS.map((p, i) => (
          <path key={i} d={p.d} fill={p.fill} transform={`translate(${p.x} ${p.y})`} />
        ))}
      </svg>
      {withWordmark && (
        <span className="av-display" style={{ fontSize: size * 0.5, fontWeight: 800, letterSpacing: '-0.03em' }}>
          Avocado
        </span>
      )}
    </span>
  )
}
