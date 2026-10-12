import type { ReactNode, SVGProps } from 'react'

export type IconName =
  | 'camera'
  | 'image'
  | 'home'
  | 'user'
  | 'users'
  | 'chevron-left'
  | 'chevron-right'
  | 'calendar'
  | 'chat'
  | 'trash'
  | 'plus'
  | 'refresh'
  | 'logout'
  | 'check'
  | 'mail'
  | 'clock'
  | 'alert'
  | 'send'
  | 'share'
  | 'download'

const PATHS: Record<IconName, ReactNode> = {
  camera: (
    <>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.3-2h5.2l1.3 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="M20.5 16l-5-5-8.5 8.5" />
    </>
  ),
  home: <path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 19.5a6.5 6.5 0 0 1 13 0" />
      <path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18 13.6a6.5 6.5 0 0 1 3.5 5.9" />
    </>
  ),
  'chevron-left': <path d="M15 5l-7 7 7 7" />,
  'chevron-right': <path d="M9 5l7 7-7 7" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  chat: <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z" />,
  trash: <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />,
  logout: <path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14M10 16l-4-4 4-4M6 12h9" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="M4 7l8 6 8-6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5M12 16v.5" />
    </>
  ),
  send: <path d="M4.5 12L20 4.5 15 20l-3.2-6.3zM11.8 13.7L20 4.5" />,
  share: (
    <>
      <path d="M12 3.5v11M8 7.5l4-4 4 4" />
      <path d="M8.5 10.5H7a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.5a2 2 0 0 0-2-2h-1.5" />
    </>
  ),
  download: <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" />,
}

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  /** Qué ícono dibujar. */
  name: IconName
  /** Ancho y alto en px. Por defecto 20. */
  size?: number
  /** Texto accesible. Si se omite, el ícono es decorativo (aria-hidden). */
  label?: string
}

/**
 * Ícono de trazo de Avocado (línea de 1.8 px, puntas redondeadas). Toma el color del texto
 * (`currentColor`), así que se colorea con `color` en el elemento padre.
 */
export function Icon({ name, size = 20, label, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ? `av-icon ${className}` : 'av-icon'}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}
