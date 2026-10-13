import { useEffect, useState } from 'react'
import { IconButton, Logo } from '@avocado/ui'
import { isNight } from '../lib/mascot'
import { Mascot } from './Mascot'

export interface TopBarProps {
  onBack: () => void
  backLabel?: string
  /** Avo se queda pensando (p. ej. mientras la IA analiza la comida). */
  thinking?: boolean
}

/**
 * Barra de arriba de las pantallas secundarias: volver, la marca Avocado y Avo pendiente de lo que pasa en la
 * pantalla. Se queda fija al bajar, así Avo siempre está a la vista para reaccionar.
 */
export default function TopBar({ onBack, backLabel = 'Volver', thinking = false }: TopBarProps) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className={`topbar${scrolled ? ' topbar--scrolled' : ''}`}>
      <IconButton icon="chevron-left" label={backLabel} plain onClick={onBack} />
      <span className="topbar__brand" aria-hidden="true">
        <Logo size={26} />
        Avocado
      </span>
      <Mascot size={56} base={thinking ? 'think' : isNight() ? 'sleepy' : 'idle'} reactive interactive bubble="below" />
    </div>
  )
}
