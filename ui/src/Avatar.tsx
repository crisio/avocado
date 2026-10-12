import { cx } from './cx'

export interface AvatarProps {
  /** Nombre de la persona; se muestran sus iniciales. */
  name: string
  /** Diámetro en px. Por defecto 36. */
  size?: number
  /** accent: verde sólido (nutrióloga). soft: verde claro (paciente). */
  tone?: 'accent' | 'soft'
}

/** Dos letras iniciales en un círculo. Decorativo: el nombre siempre aparece también en texto. */
export function Avatar({ name, size = 36, tone = 'accent' }: AvatarProps) {
  const initials =
    name
      .replace(/^(lic|dra?|nut)\.?\s+/i, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?'
  return (
    <span aria-hidden="true" className={cx('av-avatar', `av-avatar--${tone}`)} style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}>
      {initials}
    </span>
  )
}
