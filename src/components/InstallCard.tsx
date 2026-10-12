import { useState } from 'react'
import { Button, Card, Icon, Logo } from '@avocado/ui'
import { useInstall } from '../lib/install'

const APP_URL = window.location.origin

/**
 * Invita a instalar Avocado cuando se abre en el navegador (no desde el ícono de inicio), con los
 * pasos del teléfono y navegador que se están usando. `dismissible` agrega "Ahora no" (se oculta 14 días).
 */
export default function InstallCard({ dismissible = false, mobileOnly = false }: { dismissible?: boolean; mobileOnly?: boolean }) {
  const install = useInstall()
  const [copied, setCopied] = useState(false)
  const { platform, canPrompt } = install

  if (install.installed || (dismissible && install.dismissed)) return null
  if (mobileOnly && platform === 'desktop' && !canPrompt) return null

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(APP_URL)
      setCopied(true)
    } catch {
      window.prompt('Copia este enlace:', APP_URL)
    }
  }

  const copyButton = (
    <Button variant="secondary" icon={copied ? 'check' : undefined} onClick={copyLink} fullWidth>
      {copied ? 'Enlace copiado' : 'Copiar enlace'}
    </Button>
  )

  return (
    <Card padding="lg" outlined className="install-card">
      <div className="install-card__head">
        <Logo size={44} />
        <div>
          <strong className="install-card__title">Instala Avocado en tu teléfono</strong>
          <p className="install-card__lead">Ábrela desde tu pantalla de inicio, como cualquier app.</p>
        </div>
      </div>

      {canPrompt ? (
        <Button icon="download" size="lg" fullWidth onClick={() => install.prompt()}>
          Instalar app
        </Button>
      ) : platform === 'ios-safari' ? (
        <ol className="install-card__steps">
          <li>
            Toca <Icon name="share" size={18} label="Compartir" /> <strong>Compartir</strong> en la barra de Safari (si no lo
            ves, toca <strong>···</strong> primero).
          </li>
          <li>
            Elige <strong>Agregar a Inicio</strong>.
          </li>
          <li>
            Deja activado <strong>Abrir como app web</strong> y toca <strong>Agregar</strong>.
          </li>
        </ol>
      ) : platform === 'ios-other' ? (
        <>
          <ol className="install-card__steps">
            <li>
              Toca <Icon name="share" size={18} label="Compartir" /> <strong>Compartir</strong> en la barra de direcciones.
            </li>
            <li>
              Elige <strong>Agregar a Inicio</strong>.
            </li>
          </ol>
          <p className="install-card__note">Si no te aparece esa opción, abre el enlace en Safari:</p>
          {copyButton}
        </>
      ) : platform === 'in-app' ? (
        <>
          <p className="install-card__note">
            Estás viendo Avocado dentro de otra app y desde aquí no se puede instalar. Ábrela en Safari (iPhone) o Chrome (Android).
          </p>
          {copyButton}
        </>
      ) : platform === 'android' ? (
        <ol className="install-card__steps">
          <li>
            Abre el menú <strong>⋮</strong> del navegador.
          </li>
          <li>
            Elige <strong>Instalar app</strong> o <strong>Agregar a la pantalla principal</strong>.
          </li>
        </ol>
      ) : (
        <p className="install-card__note">
          En tu teléfono, abre <strong>{APP_URL.replace(/^https?:\/\//, '')}</strong> y agrégala a tu pantalla de inicio. En la
          computadora puedes instalarla desde el menú del navegador.
        </p>
      )}

      {(platform === 'ios-safari' || platform === 'ios-other') && (
        <p className="install-card__note">Al abrirla desde el ícono, entra otra vez con tu correo: el iPhone guarda la app aparte de Safari.</p>
      )}

      {dismissible && (
        <Button variant="ghost" onClick={install.dismiss}>
          Ahora no
        </Button>
      )}
    </Card>
  )
}
