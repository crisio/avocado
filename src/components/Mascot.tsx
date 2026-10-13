import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../auth'
import { POSES, SEQUENCES, setInlineVisible, spriteUrl, tapMascot, useInlineVisible, useReaction, cheer, type Mood } from '../lib/mascot'
import { useOnline } from '../lib/useOnline'

const reducedQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
const useReducedMotion = () =>
  useSyncExternalStore(
    (cb) => {
      reducedQuery?.addEventListener('change', cb)
      return () => reducedQuery?.removeEventListener('change', cb)
    },
    () => reducedQuery?.matches ?? false,
  )

/** Recorre los pasos de un ánimo. En bucle (ánimo de fondo) o una vez, quedándose en el último cuadro (reacción). */
function useSteps(mood: Mood, key: string, loop: boolean, reduced: boolean) {
  const [pos, setPos] = useState({ key, i: 0 })
  const i = pos.key === key ? pos.i : 0
  const steps = SEQUENCES[mood]

  useEffect(() => {
    if (reduced) return
    let index = 0
    let t: ReturnType<typeof setTimeout>
    const schedule = () => {
      const [, ms] = steps[index]
      // Las pausas largas varían un poco para que no se vea mecánico
      const wait = ms >= 1000 ? ms * (0.7 + Math.random() * 0.6) : ms
      t = setTimeout(() => {
        if (index + 1 < steps.length) index++
        else if (loop) index = 0
        else return
        setPos({ key, i: index })
        schedule()
      }, wait)
    }
    schedule()
    return () => clearTimeout(t)
  }, [key, loop, reduced])

  if (reduced) return [POSES[mood], 0] as const
  const [frame, , lift = 0] = steps[Math.min(i, steps.length - 1)]
  return [frame, lift] as const
}

export interface MascotProps {
  /** Alto y ancho en px. */
  size?: number
  /** Lo que hace mientras no reacciona a nada. */
  base?: 'idle' | 'think' | 'sleepy'
  /** Reacciona a lo que pasa en la app (cheer). */
  reactive?: boolean
  /** Se puede tocar (cada toque, una reacción). */
  interactive?: boolean
  /** De qué lado sale el globo de texto. */
  bubble?: 'left' | 'right' | 'top' | 'below'
  /** Es la mascota flotante (no cuenta como "a la vista"). */
  floating?: boolean
  className?: string
}

/** Avo, el aguacate del logo, animado. */
export function Mascot({ size = 88, base = 'idle', reactive = false, interactive = false, bubble = 'left', floating = false, className }: MascotProps) {
  const reduced = useReducedMotion()
  const reaction = useReaction()
  const active = reactive ? reaction : null
  const mood: Mood = active?.mood ?? base
  const [frame, lift] = useSteps(mood, active ? `r${active.id}` : base, !active, reduced)
  const ref = useRef<HTMLElement>(null)
  const role = useAuth().user?.role ?? null

  // Si está a la vista, la mascota flotante no hace falta.
  useEffect(() => {
    const el = ref.current
    if (!reactive || floating || !el || typeof IntersectionObserver === 'undefined') return
    // Cuenta como a la vista con al menos 60 % visible: si solo asoma una orilla, el globo quedaría fuera.
    let visible = false
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1]
        const now = entry.isIntersecting && entry.intersectionRatio >= 0.6
        if (now === visible) return
        visible = now
        setInlineVisible(visible)
      },
      { threshold: [0, 0.6, 1] },
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (visible) setInlineVisible(false)
    }
  }, [reactive, floating])

  const sprite = (
    <>
      <span className="mascot__lift" style={{ transform: lift ? `translateY(${lift}px)` : undefined }}>
        <span
          className={`mascot__sprite${mood === 'idle' || mood === 'sleepy' ? ' mascot__sprite--breathe' : ''}`}
          style={{ backgroundImage: `url(${spriteUrl(mood)})`, backgroundPosition: `${(frame * 100) / 3}% 0` }}
        />
      </span>
      {active?.message && (
        <span key={active.id} className={`mascot__bubble mascot__bubble--${bubble}`} aria-hidden="true">
          {active.message}
        </span>
      )}
    </>
  )
  // Lo que dice al tocarla se anuncia a los lectores de pantalla (lo demás ya está en la pantalla como texto).
  const announcement = interactive && (
    <span className="sr-only" role="status">
      {active?.tap ? active.message : ''}
    </span>
  )
  const style = { width: size, height: size }
  const classes = `mascot${className ? ` ${className}` : ''}`

  return interactive ? (
    <>
      <button
        ref={ref as React.RefObject<HTMLButtonElement>}
        type="button"
        className={`${classes} mascot--button`}
        style={style}
        aria-label="Avo, la mascota de Avocado"
        onClick={() => tapMascot(role)}
      >
        {sprite}
      </button>
      {announcement}
    </>
  ) : (
    <span ref={ref} className={classes} style={style} aria-hidden="true">
      {sprite}
    </span>
  )
}

/**
 * La mascota flotante: aparece abajo a la derecha, sobre la barra de pestañas, cuando Avo reacciona a algo y no hay
 * otra mascota a la vista. También avisa cuando se va y cuando vuelve la señal.
 */
export function MascotDock() {
  const reaction = useReaction()
  const inlineVisible = useInlineVisible()
  const online = useOnline()
  const { pathname } = useLocation()
  const show = !!reaction && !inlineVisible
  const [bottom, setBottom] = useState(96)
  // Sale con un instante de espera (al cambiar de pantalla, la mascota de la nueva tarda un momento en avisar
  // que está a la vista) y al terminar se desvanece en vez de desaparecer de golpe.
  const [leaving, setLeaving] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    if (show) {
      const t = setTimeout(() => {
        setMounted(true)
        setLeaving(false)
      }, 120)
      return () => clearTimeout(t)
    }
    setLeaving(true)
    const t = setTimeout(() => setMounted(false), 220)
    return () => clearTimeout(t)
  }, [show])

  const wasOnline = useRef(online)
  const lastNotice = useRef(0)
  useEffect(() => {
    if (online === wasOnline.current) return
    wasOnline.current = online
    // La señal puede ir y venir: un aviso cada 20 s como mucho.
    if (Date.now() - lastNotice.current < 20_000) return
    lastNotice.current = Date.now()
    if (online) cheer('wave', '¡Volvió la señal!')
    else cheer('sleepy', 'Sin señal… aquí te espero')
  }, [online])

  // Justo encima de la barra de pestañas (que es más alta en la pantalla principal, con el botón de registrar).
  useEffect(() => {
    if (!show) return
    const bar = document.querySelector('.av-tabbar')
    setBottom((bar?.getBoundingClientRect().height ?? 80) + 12)
  }, [show, pathname])

  if (!mounted) return null
  return (
    <div className={`mascot-dock${!show && leaving ? ' mascot-dock--leaving' : ''}`} style={{ bottom }}>
      <Mascot size={76} reactive floating bubble="left" />
    </div>
  )
}
