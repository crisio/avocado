import type { ReactNode } from 'react'

export const PRIVACY_URL = `${import.meta.env.BASE_URL}privacidad.html`

/** Política de privacidad (public/privacidad.html). En otra pestaña: en la app instalada no hay botón de atrás. */
export default function PrivacyLink({ children = 'Política de privacidad' }: { children?: ReactNode }) {
  return (
    <a className="app-link" href={PRIVACY_URL} target="_blank" rel="noopener">
      {children}
    </a>
  )
}
