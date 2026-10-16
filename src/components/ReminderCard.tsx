import { useEffect, useState } from 'react'
import { Button, Card, Icon } from '@avocado/ui'
import { useAuth } from '../auth'
import { api } from '../lib/api'
import { cheer, picante } from '../lib/mascot'
import { enableReminders, needsInstallForPush, permission, pushConfigured, pushSupported } from '../lib/push'
import { useStreak } from '../lib/streak'
import Swipeable from './Swipeable'

/** Si dice "Ahora no" (o la quita deslizando), no vuelve a salir por 7 días. */
const HIDE_MS = 7 * 86_400_000

const hiddenKey = (userId: string) => `avocado.remindersHiddenUntil.${userId}`
const firstSeenKey = (userId: string) => `avocado.firstSeen.${userId}`

function hiddenUntil(userId: string) {
  try {
    return Number(localStorage.getItem(hiddenKey(userId))) || 0
  } catch {
    return 0
  }
}
function hideForAWeek(userId: string) {
  try {
    localStorage.setItem(hiddenKey(userId), String(Date.now() + HIDE_MS))
  } catch {
    // almacenamiento no disponible: solo se quita en esta visita
  }
}
/** Cuándo vimos por primera vez a este paciente en este teléfono (la API no manda la fecha de registro). */
function firstSeen(userId: string) {
  try {
    const saved = Number(localStorage.getItem(firstSeenKey(userId)))
    if (saved) return saved
    localStorage.setItem(firstSeenKey(userId), String(Date.now()))
  } catch {
    // sin almacenamiento
  }
  return Date.now()
}

/**
 * "¿Te aviso a la hora de comer?" en un toque (Mi día, solo pacientes). Sale cuando el navegador puede recibir push (o
 * hay que instalar la app primero en iPhone), el servidor lo tiene configurado, aún no se ha pedido permiso y el
 * paciente ya registró una comida o lleva más de un día. Se quita deslizándola.
 */
export default function ReminderCard() {
  const { user, setUser } = useAuth()
  const { streak } = useStreak(user?.id)
  const [configured, setConfigured] = useState(false)
  const [dismissed, setDismissed] = useState(() => !!user && hiddenUntil(user.id) > Date.now())
  const [busy, setBusy] = useState(false)
  const [first] = useState(() => (user ? firstSeen(user.id) : Date.now()))

  useEffect(() => {
    void pushConfigured().then(setConfigured)
  }, [])

  if (!user || dismissed || !configured || user.reminders === false) return null
  const install = needsInstallForPush()
  if (!install && (!pushSupported() || permission() !== 'default')) return null
  const logged = !!streak && (streak.best > 0 || streak.current > 0 || streak.loggedToday)
  if (!logged && Date.now() - first < 86_400_000) return null

  function dismiss() {
    if (user) hideForAWeek(user.id)
    setDismissed(true)
  }

  async function accept() {
    setBusy(true)
    try {
      const updated = await enableReminders()
      if (updated) {
        setUser(updated)
        cheer('love', picante() ? 'Va, te voy a estar molestando a la hora de comer 😏' : 'Listo, te escribo a la hora de comer 🔔', { interrupt: true })
      } else if (user) hideForAWeek(user.id)
    } catch {
      cheer('oops', 'No pude activar los avisos', { interrupt: true })
    }
    setDismissed(true)
  }

  return (
    <Swipeable onDismiss={dismiss}>
      <Card padding="md" as="section" aria-labelledby="recordatorios-titulo" className="mood-card">
        <div className="mood-card__head">
          <h2 id="recordatorios-titulo" className="av-section-title">
            ¿Te aviso a la hora de comer? 🔔
          </h2>
          <button type="button" className="mood-close" onClick={dismiss} aria-label="Quitar esta tarjeta">
            <Icon name="close" size={18} />
          </button>
        </div>
        {install ? (
          <p className="av-text-muted" style={{ margin: 0 }}>
            Para recibir avisos en el iPhone, primero agrega Avocado a tu pantalla de inicio (Compartir → Agregar a Inicio) y ábrela desde ahí.
          </p>
        ) : (
          <>
            <p className="av-text-muted" style={{ margin: 0 }}>
              Desayuno, comida y cena. Si ya registraste, no te molesto.
            </p>
            <div className="reminder-card__actions">
              <Button loading={busy} onClick={() => void accept()}>
                Sí, avísame
              </Button>
              <Button variant="ghost" onClick={dismiss} disabled={busy}>
                Ahora no
              </Button>
            </div>
          </>
        )}
      </Card>
    </Swipeable>
  )
}

/** Para Perfil: el próximo aviso programado, o null. */
export async function nextReminderText(): Promise<string | null> {
  try {
    const r = await api<import('../lib/types').ReminderPreview>(`/reminders?offset=${new Date().getTimezoneOffset()}&days=2`)
    const next = r.enabled ? r.reminders.map((x) => ({ ...x, t: new Date(x.at).getTime() })).filter((x) => x.t > Date.now()).sort((a, b) => a.t - b.t)[0] : null
    if (!next) return null
    const when = new Date(next.t)
    const time = when.toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit' })
    const day = when.toDateString() === new Date().toDateString() ? '' : ' de mañana'
    return `Próximo aviso: ${next.kind === 'racha' ? 'tu racha' : next.kind}${day}, ${time}`
  } catch {
    return null
  }
}
