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
 * `onSaved` reemplaza el guardado en la sesión (el registro lo usa para terminar el paso antes de entrar a la app).
 */
export default function AiConsentCard({ onDecline, onSaved }: { onDecline?: () => void; onSaved?: (user: User) => void }) {
  const { setUser } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function accept() {
    setBusy(true)
    setError(null)
    try {
      const updated = await api<User>('/me', { method: 'PATCH', json: { ai_consent: true } })
      ;(onSaved ?? setUser)(updated)
      cheer('love', '¡Gracias! A ver qué comiste', { interrupt: true })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Card padding="lg" as="section" aria-labelledby="permiso-ia">
      <div className="mascot-hero">
        <Mascot size={104} base="think" />
      </div>
      <h2 id="permiso-ia" className="av-section-title" style={{ textAlign: 'center', fontSize: 22 }}>
        Para calcular tus calorías, Avo necesita ver tus fotos
      </h2>
      <p style={{ margin: 0 }}>
        Tu foto y tu nota se mandan a una IA de <strong>Google</strong> (Gemini) u <strong>OpenAI</strong>, vía <strong>OpenRouter</strong>, solo para
        estimar la comida. Tu correo no se manda.
      </p>
      <ul className="ai-consent__list ai-consent__list--emoji">
        <li>📸 Le tomas foto a tu plato y en segundos ves calorías y macros</li>
        <li>🔒 No usamos tus datos para publicidad ni los vendemos</li>
        <li>↩️ Puedes quitar el permiso cuando quieras en Perfil</li>
      </ul>
      <details className="ai-consent__more">
        <summary>¿Qué más se manda?</summary>
        <ul className="ai-consent__list">
          <li>Tus correcciones («me dejé la mitad…»).</li>
          <li>En «¿Me lo como?»: la foto del antojo, tu primer nombre, lo que llevas hoy y tu meta.</li>
          <li>Cómo te sientes (hambre, ánimo, energía, si vas con tu plan) y tus últimas comidas, para aconsejarte y encontrar tus patrones.</li>
          <li>Lo que le escribes o le dices en audio a Avo en el chat (el audio no se guarda, solo lo que dijiste).</li>
        </ul>
        <p className="av-text-muted" style={{ margin: 0, fontSize: 14 }}>
          Los resultados son estimaciones y pueden equivocarse: no son consejo médico.
        </p>
      </details>
      {error && <Notice tone="error">{error}</Notice>}
      <Button size="lg" fullWidth icon="check" loading={busy} onClick={accept}>
        Sí, que Avo vea mis fotos
      </Button>
      {onDecline && (
        <Button variant="ghost" fullWidth onClick={onDecline} disabled={busy}>
          Ahora no
        </Button>
      )}
      <p className="av-text-muted" style={{ margin: 0, fontSize: 14, textAlign: 'center' }}>
        <PrivacyLink />
      </p>
    </Card>
  )
}
