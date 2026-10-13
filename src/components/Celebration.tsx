import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { SEQUENCES } from '../lib/mascot'
import { Mascot, useReducedMotion } from './Mascot'

/**
 * Celebración a pantalla completa al registrar una comida: confeti, la foto como plato y Avo en grande
 * (salta de gusto y luego se pone a comer). Vive en Layout para seguir encima al pasar al detalle de la comida.
 */

interface Party {
  id: number
  title: string
  message: string
  /** URL blob: de la foto; se libera al cerrar. */
  photoUrl: string | null
}

let party: Party | null = null
let lastId = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function celebrateMeal(next: Omit<Party, 'id'>) {
  if (party?.photoUrl) URL.revokeObjectURL(party.photoUrl)
  party = { ...next, id: ++lastId }
  emit()
}

function close(id: number) {
  if (party?.id !== id) return
  if (party.photoUrl) URL.revokeObjectURL(party.photoUrl)
  party = null
  emit()
}

/** Cuánto dura en pantalla si nadie la toca. */
const SHOW_MS = 3600
/** Salta una vez y después come. */
const JUMP_MS = SEQUENCES.celebrate.reduce((ms, [, d]) => ms + d, 0)

export function Celebration() {
  const current = useSyncExternalStore(subscribe, () => party)
  return current ? <PartyView key={current.id} party={current} /> : null
}

function PartyView({ party }: { party: Party }) {
  const reduced = useReducedMotion()
  const [leaving, setLeaving] = useState(false)
  const [eating, setEating] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    navigator.vibrate?.([14, 50, 14])
    const toEat = setTimeout(() => setEating(true), JUMP_MS)
    const auto = setTimeout(() => setLeaving(true), SHOW_MS)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setLeaving(true)
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(toEat)
      clearTimeout(auto)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => {
    if (!leaving) return
    const t = setTimeout(() => close(party.id), reduced ? 0 : 240)
    return () => clearTimeout(t)
  }, [leaving])

  useEffect(() => {
    if (reduced || !canvas.current) return
    return runConfetti(canvas.current)
  }, [reduced])

  return (
    <div className={`party${leaving ? ' party--leaving' : ''}`} role="status" onClick={() => setLeaving(true)}>
      <canvas ref={canvas} className="party__confetti" aria-hidden="true" />
      <div className="party__stage">
        <div className={`party__plate${party.photoUrl ? '' : ' party__plate--empty'}`} aria-hidden="true">
          {party.photoUrl && <img src={party.photoUrl} alt="" />}
          <span className="party__avo">
            <Mascot size={164} play={reduced || eating ? 'eat' : 'celebrate'} hd />
          </span>
        </div>
        <h2 className="party__title">{party.title}</h2>
        <p className="party__message">{party.message}</p>
        <span className="party__hint" aria-hidden="true">
          Toca para continuar
        </span>
      </div>
    </div>
  )
}

const COLORS = ['#2f7a3a', '#8dbb6a', '#b7e07a', '#fff27a', '#f2c14e', '#d9a066', '#ee8e7e', '#e87ba4', '#8b4a1c']

interface Bit {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  spin: number
  size: number
  color: string
  shape: number
  flutter: number
}

/** Confeti en un canvas: dos cañonazos desde las esquinas de abajo y un estallido al centro. Regresa cómo detenerlo. */
function runConfetti(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = window.innerWidth
  const h = window.innerHeight
  canvas.width = w * dpr
  canvas.height = h * dpr
  ctx.scale(dpr, dpr)

  const bits: Bit[] = []
  const burst = (x: number, y: number, angle: number, spread: number, count: number, power: number) => {
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * spread
      const speed = power * (0.55 + Math.random() * 0.6)
      bits.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.35,
        size: 7 + Math.random() * 7,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        shape: i % 3,
        flutter: Math.random() * Math.PI * 2,
      })
    }
  }
  burst(0, h * 0.8, -Math.PI / 3, 0.9, 70, Math.max(14, h / 45))
  burst(w, h * 0.8, (-2 * Math.PI) / 3, 0.9, 70, Math.max(14, h / 45))
  const second = setTimeout(() => burst(w / 2, h * 0.32, -Math.PI / 2, Math.PI * 1.4, 60, 11), 380)

  let raf = 0
  let last = performance.now()
  const start = last
  const tick = (now: number) => {
    const dt = Math.min(3, (now - last) / 16.7)
    last = now
    ctx.clearRect(0, 0, w, h)
    let alive = 0
    for (const b of bits) {
      b.vy += 0.38 * dt
      b.vx *= 0.99 ** dt
      b.vy *= 0.99 ** dt
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.rot += b.spin * dt
      b.flutter += 0.15 * dt
      if (b.y > h + 30) continue
      alive++
      ctx.save()
      ctx.translate(b.x, b.y)
      ctx.rotate(b.rot)
      ctx.fillStyle = b.color
      if (b.shape === 0) {
        // Papelito que gira (se ve más ancho o más angosto)
        ctx.fillRect(-b.size / 2, (-b.size / 4) * Math.abs(Math.cos(b.flutter)), b.size, (b.size / 2) * Math.abs(Math.cos(b.flutter)) + 1)
      } else if (b.shape === 1) {
        ctx.beginPath()
        ctx.arc(0, 0, b.size / 3, 0, Math.PI * 2)
        ctx.fill()
      } else {
        // Hojita
        ctx.beginPath()
        ctx.ellipse(0, 0, b.size / 2, b.size / 5, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }
    if ((alive > 0 || now - start < 600) && now - start < 5000) raf = requestAnimationFrame(tick)
    else ctx.clearRect(0, 0, w, h)
  }
  raf = requestAnimationFrame(tick)
  return () => {
    clearTimeout(second)
    cancelAnimationFrame(raf)
  }
}
