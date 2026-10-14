import { useState, useSyncExternalStore } from 'react'
import { Button, Card, Notice } from '@avocado/ui'
import { api } from '../lib/api'
import { clearInviteCode, getInviteCode, onInviteChange } from '../lib/invite'
import { displayName } from '../lib/format'
import { cheer } from '../lib/mascot'
import { useCachedApi } from '../lib/useCachedApi'
import type { Person } from '../lib/types'

/** Confirmación para el paciente que llegó con un enlace de invitación: "Lic. X te invitó a compartir tus comidas". */
export default function InviteConfirm() {
  const code = useSyncExternalStore(onInviteChange, getInviteCode)
  if (!code) return null
  return <Confirm code={code} />
}

function Confirm({ code }: { code: string }) {
  const { data: nutri, error: loadError } = useCachedApi<Person>(`/care/invite/${encodeURIComponent(code)}`, 600_000)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function accept() {
    setBusy(true)
    setError(null)
    try {
      await api(`/care/invite/${encodeURIComponent(code)}`, { method: 'POST' })
      clearInviteCode()
      cheer('celebrate', '¡Listo! Tu nutrióloga ya puede ver tus comidas', { interrupt: true })
    } catch (err) {
      setError((err as Error).message)
      cheer('oops', 'No pude vincularla', { interrupt: true })
      setBusy(false)
    }
  }

  function decline() {
    clearInviteCode()
    cheer('wave', 'Sin problema, cuando quieras la vinculas en Perfil', { interrupt: true })
  }

  // El enlace ya no existe: se avisa y se puede descartar.
  if (loadError && !nutri)
    return (
      <Card padding="lg" as="section" aria-label="Invitación" className="invite-confirm">
        <Notice tone="warning">Esta invitación ya no sirve. Pídele a tu nutrióloga que te comparta su enlace otra vez.</Notice>
        <Button variant="secondary" onClick={clearInviteCode}>
          Entendido
        </Button>
      </Card>
    )

  return (
    <Card padding="lg" as="section" aria-labelledby="invite-confirm-title" className="invite-confirm">
      <h2 id="invite-confirm-title" className="av-section-title">
        {nutri ? `${displayName(nutri)} te invitó a compartir tus comidas` : 'Te invitaron a compartir tus comidas'}
      </h2>
      <p className="av-text-muted" style={{ margin: 0 }}>
        Podrá ver tus comidas, tu ánimo y tu racha, y dejarte comentarios. Puedes dejar de compartir cuando quieras desde Perfil.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="invite-confirm__actions">
        <Button variant="ghost" onClick={decline} disabled={busy}>
          Ahora no
        </Button>
        <Button icon="check" loading={busy} disabled={!nutri} onClick={accept}>
          Aceptar
        </Button>
      </div>
    </Card>
  )
}
