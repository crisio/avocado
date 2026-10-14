import { useEffect, useState } from 'react'
import { Button, Card, Notice } from '@avocado/ui'
import { useCachedApi } from '../lib/useCachedApi'
import { cheer } from '../lib/mascot'
import type { CareInvite } from '../lib/types'

/**
 * Tarjeta para invitar pacientes: código grande, enlace, QR, "Copiar enlace" y "Compartir".
 * Es de la nutrióloga (Pacientes y Perfil). `center` la pone al centro cuando aún no tiene pacientes.
 */
export default function InviteCard({ center = false, intro }: { center?: boolean; intro?: string }) {
  const { data: invite, error } = useCachedApi<CareInvite>('/care/invite', 600_000)
  const [qr, setQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const url = invite?.url

  // El QR se dibuja aquí; la librería se carga aparte para no pesar en el resto de la app.
  useEffect(() => {
    if (!url) return
    let alive = true
    import('qrcode')
      .then((QRCode) => QRCode.toDataURL(url, { width: 360, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#18221b', light: '#ffffff' } }))
      .then((dataUrl) => alive && setQr(dataUrl))
      .catch(() => alive && setQr(null))
    return () => {
      alive = false
    }
  }, [url])

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
      cheer('love', '¡Enlace copiado!', { interrupt: true })
    } catch {
      // Sin permiso para el portapapeles: se deja el enlace seleccionable en pantalla.
      window.prompt('Copia el enlace', url)
    }
  }

  async function share() {
    if (!url) return
    try {
      await navigator.share({ title: 'Avocado', text: 'Te invito a compartir tus comidas conmigo en Avocado.', url })
    } catch {
      // Cerró el menú de compartir: no pasa nada.
    }
  }

  return (
    <Card padding="lg" as="section" aria-labelledby="invite-title" className={`invite-card${center ? ' invite-card--center' : ''}`}>
      <h2 id="invite-title" className="av-section-title">
        Invita a tus pacientes
      </h2>
      <p className="av-text-muted" style={{ margin: 0 }}>
        {intro ?? 'Comparte tu enlace o el código QR. Al entrar a Avocado quedan vinculados contigo y ves sus comidas.'}
      </p>
      {!invite ? (
        error ? (
          <Notice tone="error">No pude cargar tu invitación: {error.message}</Notice>
        ) : (
          <p className="av-text-muted" style={{ margin: 0 }}>
            Cargando…
          </p>
        )
      ) : (
        <>
          <div className="invite-card__body">
            <div className="invite-card__qr">
              {qr ? <img src={qr} width={160} height={160} alt={`Código QR para invitar pacientes: ${invite.url}`} /> : <div className="invite-card__qr-empty" aria-hidden="true" />}
            </div>
            <div className="invite-card__info">
              <span className="mood-label">Tu código</span>
              <span className="invite-card__code" aria-label={`Código ${invite.code.split('').join(' ')}`}>
                {invite.code}
              </span>
              <a className="invite-card__url" href={invite.url}>
                {invite.url.replace(/^https?:\/\//, '')}
              </a>
            </div>
          </div>
          <div className="invite-card__actions">
            <Button variant="secondary" icon={copied ? 'check' : undefined} onClick={copy}>
              {copied ? 'Copiado' : 'Copiar enlace'}
            </Button>
            {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && <Button onClick={share}>Compartir</Button>}
          </div>
        </>
      )}
      <p className="av-text-muted invite-card__beta">Por ahora Avocado es gratis para nutriólogas y pacientes.</p>
    </Card>
  )
}
