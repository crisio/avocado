import { useRef, useState, useEffect, useSyncExternalStore, type FormEvent } from 'react'
import { Button, Card, CodeInput, Notice, Screen, TextField } from '@avocado/ui'
import { useAuth } from '../auth'
import InstallCard from '../components/InstallCard'
import { Mascot } from '../components/Mascot'
import PrivacyLink from '../components/PrivacyLink'
import { api } from '../lib/api'
import { getInviteCode, onInviteChange } from '../lib/invite'
import { cheer, greetOnce } from '../lib/mascot'
import type { User } from '../lib/types'

const RESEND_SECONDS = 60

export default function Login() {
  const { signIn } = useAuth()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wait, setWait] = useState(0)
  const codeInput = useRef<HTMLInputElement>(null)
  // Llegó con el enlace de una nutrióloga (el nombre solo se ve ya con sesión).
  const invited = useSyncExternalStore(onInviteChange, getInviteCode) !== null

  useEffect(() => {
    const t = setTimeout(() => greetOnce('login', () => cheer('wave', '¡Hola! Soy Avo')), 600)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait(wait - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  async function requestCode(e?: FormEvent) {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/auth/code', { method: 'POST', json: { email } })
      setStep('code')
      setCode('')
      setWait(RESEND_SECONDS)
      setTimeout(() => codeInput.current?.focus(), 50)
      cheer('love', '¡Te mandé un código!', { interrupt: true })
    } catch (err) {
      setError((err as Error).message)
      cheer('oops', 'Algo falló', { interrupt: true })
    }
    setBusy(false)
  }

  async function verify(value: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await api<{ token: string; user: User }>('/auth/verify', { method: 'POST', json: { email, code: value } })
      cheer('celebrate', '¡Qué gusto verte!', { interrupt: true })
      signIn(res.token, res.user)
    } catch (err) {
      setError((err as Error).message)
      cheer('oops', 'Ese código no funcionó', { interrupt: true })
      setCode('')
      setBusy(false)
      setTimeout(() => codeInput.current?.focus(), 50)
    }
  }

  return (
    <Screen narrow>
      <header className="mascot-hero" style={{ flexDirection: 'column', gap: 6, textAlign: 'center' }}>
        <Mascot size={112} reactive interactive bubble="top" />
        <h1 className="av-page-header__title">Avocado</h1>
        {invited && (
          <p className="invite-banner" role="status">
            Te invitaron a Avocado
          </p>
        )}
        <p className="av-text-muted" style={{ margin: 0 }}>
          Tus comidas en fotos, con seguimiento de tu nutrióloga.
        </p>
      </header>

      {step === 'email' ? (
        <Card as="form" padding="lg" onSubmit={requestCode}>
          <TextField
            label="Tu correo"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="tucorreo@gmail.com"
            hint="Te enviaremos un código para entrar. Si es tu primera vez, se crea tu cuenta."
          />
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" size="lg" fullWidth loading={busy}>
            Enviarme un código
          </Button>
        </Card>
      ) : (
        <Card
          as="form"
          padding="lg"
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            if (code.length === 6) verify(code)
          }}
        >
          <p style={{ margin: 0 }}>
            Escribe el código de 6 dígitos que enviamos a <strong>{email}</strong>.
          </p>
          <CodeInput inputRef={codeInput} value={code} onChange={setCode} onComplete={verify} disabled={busy} />
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" size="lg" fullWidth loading={busy} disabled={code.length !== 6}>
            Entrar
          </Button>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <Button variant="ghost" onClick={() => setStep('email')}>
              Cambiar correo
            </Button>
            <Button variant="ghost" onClick={() => requestCode()} disabled={wait > 0 || busy}>
              {wait > 0 ? `Reenviar en ${wait}s` : 'Reenviar código'}
            </Button>
          </div>
          <p className="av-text-muted" style={{ margin: 0, fontSize: 14 }}>
            ¿No llega? Revisa la carpeta de spam o promociones.
          </p>
        </Card>
      )}

      {/* Mejor instalar antes de entrar: en iPhone la app instalada no comparte la sesión de Safari. */}
      {step === 'email' && <InstallCard dismissible mobileOnly />}

      <p className="av-text-muted" style={{ margin: 0, fontSize: 14, textAlign: 'center' }}>
        ¿Qué hacemos con tus datos? Lee la <PrivacyLink>política de privacidad</PrivacyLink>.
      </p>
    </Screen>
  )
}
