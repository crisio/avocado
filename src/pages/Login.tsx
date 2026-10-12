import { useRef, useState, useEffect, type FormEvent } from 'react'
import { Button, Card, CodeInput, Logo, Notice, Screen, TextField } from '@avocado/ui'
import { useAuth } from '../auth'
import InstallCard from '../components/InstallCard'
import { api } from '../lib/api'
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
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(false)
  }

  async function verify(value: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await api<{ token: string; user: User }>('/auth/verify', { method: 'POST', json: { email, code: value } })
      signIn(res.token, res.user)
    } catch (err) {
      setError((err as Error).message)
      setCode('')
      setBusy(false)
      setTimeout(() => codeInput.current?.focus(), 50)
    }
  }

  return (
    <Screen narrow>
      <header style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center', paddingTop: 24 }}>
        <Logo size={76} />
        <h1 className="av-page-header__title">Avocado</h1>
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
    </Screen>
  )
}
