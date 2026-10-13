import { useRef, useState, type ReactNode } from 'react'

const THRESHOLD = 90

/**
 * Tarjeta que se quita deslizándola a la izquierda o a la derecha (como una notificación). El scroll vertical sigue
 * funcionando (touch-action: pan-y) y un arrastre horizontal no cuenta como toque en lo que hay adentro.
 */
export default function Swipeable({ onDismiss, children }: { onDismiss: () => void; children: ReactNode }) {
  const [dx, setDx] = useState(0)
  const [leaving, setLeaving] = useState<-1 | 0 | 1>(0)
  const start = useRef<{ x: number; y: number } | null>(null)
  const horizontal = useRef<boolean | null>(null)
  const dragged = useRef(false)

  function end() {
    if (horizontal.current && Math.abs(dx) > THRESHOLD) {
      setLeaving(dx > 0 ? 1 : -1)
      setTimeout(onDismiss, 200)
    } else setDx(0)
    start.current = null
    horizontal.current = null
  }

  return (
    <div
      className={`swipeable${start.current && horizontal.current ? ' swipeable--dragging' : ''}`}
      style={{
        transform: `translateX(${leaving ? `${leaving * 110}%` : `${dx}px`})`,
        opacity: leaving ? 0 : 1 - Math.min(Math.abs(dx) / 320, 0.6),
      }}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        start.current = { x: e.clientX, y: e.clientY }
        horizontal.current = null
        dragged.current = false
      }}
      onPointerMove={(e) => {
        if (!start.current) return
        const mx = e.clientX - start.current.x
        const my = e.clientY - start.current.y
        if (horizontal.current === null && Math.hypot(mx, my) > 8) {
          horizontal.current = Math.abs(mx) > Math.abs(my)
          if (horizontal.current) e.currentTarget.setPointerCapture(e.pointerId)
        }
        if (horizontal.current) {
          dragged.current = true
          setDx(mx)
        }
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onClickCapture={(e) => {
        // Soltar después de arrastrar no debe tocar el botón que quedó abajo.
        if (dragged.current) {
          e.preventDefault()
          e.stopPropagation()
          dragged.current = false
        }
      }}
    >
      {children}
    </div>
  )
}
