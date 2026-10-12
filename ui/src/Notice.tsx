import type { ReactNode } from 'react'
import { Icon } from './Icon'

export interface NoticeProps {
  children: ReactNode
  /** info: verde (confirmaciones). warning: ámbar. error: rojo; se anuncia a lectores de pantalla. */
  tone?: 'info' | 'warning' | 'error'
}

/** Mensaje en línea dentro de un formulario o tarjeta ("Te enviamos un código…", "Código incorrecto"). */
export function Notice({ children, tone = 'info' }: NoticeProps) {
  return (
    <div className={`av-notice av-notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={tone === 'info' ? 'check' : 'alert'} size={18} style={{ marginTop: 2 }} />
      <span>{children}</span>
    </div>
  )
}
