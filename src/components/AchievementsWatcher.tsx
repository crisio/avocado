import { useEffect, useRef, useState } from 'react'
import { Button } from '@avocado/ui'
import { useAuth } from '../auth'
import { useAchievements, useEquip, type Accessory, type Medal } from '../lib/achievements'
import { cheer, picante } from '../lib/mascot'

const seenKey = (userId: string) => `avocado.medalsSeen.${userId}`
const accKey = (userId: string) => `avocado.accessoriesSeen.${userId}`
const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    // sin almacenamiento: puede celebrar de nuevo en la próxima visita
  }
}

interface Pending {
  medal: Medal
  accessories: Accessory[]
}

/**
 * Celebra las medallas nuevas (una vez cada una) y los retos cumplidos. Vive en Layout, solo para pacientes.
 * La primera vez que carga marca lo que ya tenía como visto, sin fiesta.
 */
export default function AchievementsWatcher() {
  const { user } = useAuth()
  const userId = user?.role === 'patient' ? user.id : undefined
  const { data, fresh } = useAchievements()
  const [queue, setQueue] = useState<Pending[]>([])
  const challenges = useRef<Map<string, boolean>>(new Map())
  const equip = useEquip()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!userId || !data || !fresh) return
    // Retos: de pendiente a cumplido durante esta visita
    for (const c of data.challenges) {
      if (challenges.current.get(c.key) === false && c.done) cheer('celebrate', '¡Reto cumplido! 💪')
      challenges.current.set(c.key, c.done)
    }
    const unlocked = data.medals.filter((m) => m.unlocked_at)
    const newest = unlocked.reduce((max, m) => (m.unlocked_at! > max ? m.unlocked_at! : max), '1970-01-01T00:00:00.000Z')
    const unlockedAcc = data.accessories.filter((a) => a.unlocked)
    const lastSeen = read(seenKey(userId))
    if (lastSeen === null) {
      write(seenKey(userId), newest)
      write(accKey(userId), JSON.stringify(unlockedAcc.map((a) => a.key)))
      return
    }
    const fresher = unlocked.filter((m) => m.unlocked_at! > lastSeen).sort((a, b) => a.unlocked_at!.localeCompare(b.unlocked_at!))
    if (!fresher.length) return
    let seenAcc: string[] = []
    try {
      seenAcc = JSON.parse(read(accKey(userId)) ?? '[]')
    } catch {
      // se toma todo como nuevo
    }
    const newAcc = unlockedAcc.filter((a) => !seenAcc.includes(a.key))
    write(seenKey(userId), newest)
    write(accKey(userId), JSON.stringify(unlockedAcc.map((a) => a.key)))
    setQueue((q) => [...q, ...fresher.map((medal, i) => ({ medal, accessories: i === 0 ? newAcc : [] }))])
  }, [data, fresh, userId])

  const current = queue[0]
  const shownKey = current?.medal.key
  useEffect(() => {
    if (shownKey) cheer('celebrate', picante() ? '¡Mírate nomás! Ya hasta medalla tienes 😏' : '¡Felicidades! Te la ganaste 💚', { interrupt: true })
  }, [shownKey])

  const next = () => setQueue((q) => q.slice(1))
  useEffect(() => {
    if (!current) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && next()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [current])

  if (!current) return null
  const { medal, accessories } = current
  const acc = accessories[0]

  async function wear() {
    if (!acc || busy) return
    setBusy(true)
    try {
      await equip(acc.key)
    } catch {
      // si no se pudo, queda para ponérselo en Logros
    }
    setBusy(false)
    next()
  }

  return (
    <div className="medal-sheet" role="dialog" aria-modal="true" aria-label="¡Nueva medalla!" onClick={next}>
      <div className="medal-sheet__card" onClick={(e) => e.stopPropagation()}>
        <span className="medal-sheet__emoji" aria-hidden="true">{medal.emoji}</span>
        <h2 className="medal-sheet__title">¡Nueva medalla!</h2>
        <strong>{medal.title}</strong>
        <p className="av-text-muted" style={{ margin: 0 }}>{medal.description}</p>
        {acc && <p className="medal-sheet__acc">Desbloqueaste: {acc.emoji} {acc.name} — ¡pónselos a Avo!</p>}
        {acc ? (
          <>
            <Button fullWidth onClick={() => void wear()} disabled={busy}>Ponérselos</Button>
            <Button fullWidth variant="secondary" onClick={next}>Luego</Button>
          </>
        ) : (
          <Button fullWidth onClick={next}>¡Genial!</Button>
        )}
      </div>
    </div>
  )
}
