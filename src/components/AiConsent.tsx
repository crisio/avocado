import { useState } from 'react'
import { Button, Card, Notice } from '@avocado/ui'
import { useAuth } from '../auth'
import { api } from '../lib/api'
import { cheer } from '../lib/mascot'
import type { User } from '../lib/types'
import { Mascot } from './Mascot'
import PrivacyLink from './PrivacyLink'

/**
 * Permiso para mandar fotos y notas a la IA de otras empresas (App Store 5.1.2(i)). Sin él la API no analiza nada.
 * Si cambian los modelos (AI_MODELS en api/wrangler.jsonc), actualiza aquí a quién se mandan y en public/privacidad.html.
 */
export default function AiConsentCard({ onDecline }: { onDecline?: () => void }) {
  const { setUser } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function accept() {
    setBusy(true)
    setError(null)
    try {
      setUser(await api<User>('/me', { method: 'PATCH', json: { ai_consent: true } }))
      cheer('love', '¡Gracias! A ver qué comiste', { interrupt: true })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Card padding="lg" as="section" aria-labelledby="permiso-ia">
      <div className="ai-consent__head">
        <Mascot size={72} base="think" />
        <h2 id="permiso-ia" className="av-section-title">
          Avo usa inteligencia artificial
        </h2>
      </div>
      <p style={{ margin: 0 }}>Para calcular calorías y macros, Avocado manda a un modelo de IA de otra empresa:</p>
      <ul className="ai-consent__list">
        <li>La foto de tu comida y tu nota.</li>
        <li>Tus correcciones («me dejé la mitad…»).</li>
        <li>En «¿Me lo como?»: la foto del antojo, tu primer nombre, lo que llevas hoy y tu meta.</li>
      </ul>
      <p style={{ margin: 0 }}>
        Lo reciben <strong>OpenRouter</strong> y los modelos de <strong>Google</strong> (Gemini) y <strong>OpenAI</strong> (GPT), solo para darte el
        resultado. No les mandamos tu correo.
      </p>
      <p className="av-text-muted" style={{ margin: 0, fontSize: 14 }}>
        Los resultados son estimaciones y pueden equivocarse: no son consejo médico. Puedes retirar el permiso cuando quieras en Perfil.{' '}
        <PrivacyLink />.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      <Button size="lg" fullWidth icon="check" loading={busy} onClick={accept}>
        Acepto
      </Button>
      {onDecline && (
        <Button variant="ghost" fullWidth onClick={onDecline} disabled={busy}>
          Ahora no
        </Button>
      )}
    </Card>
  )
}
