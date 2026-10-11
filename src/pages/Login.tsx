import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../auth'
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

  function onCodeChange(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
    if (digits.length === 6) verify(digits)
  }

  return (
    <div className="auth">
      <header className="auth-header">
        <img src={`${import.meta.env.BASE_URL}pwa-192x192.png`} alt="" width={72} height={72} />
        <h1>Avocado</h1>
        <p className="muted">Tus comidas en fotos, con seguimiento de tu nutrióloga.</p>
      </header>

      {step === 'email' ? (
        <form className="card stack" onSubmit={requestCode}>
          <label>
            Tu correo
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="tucorreo@gmail.com"
            />
          </label>
          <p className="muted small">Te enviaremos un código para entrar. Si es tu primera vez, se crea tu cuenta.</p>
          {error && <p className="error">{error}</p>}
          <button className="primary" disabled={busy}>
            {busy ? 'Enviando…' : 'Enviarme un código'}
          </button>
        </form>
      ) : (
        <form
          className="card stack"
          onSubmit={(e) => {
            e.preventDefault()
            if (code.length === 6) verify(code)
          }}
        >
          <p>
            Escribe el código de 6 dígitos que enviamos a <strong>{email}</strong>.
          </p>
          <input
            ref={codeInput}
            className="code-input"
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="••••••"
            aria-label="Código"
            disabled={busy}
          />
          {error && <p className="error">{error}</p>}
          <button className="primary" disabled={busy || code.length !== 6}>
            {busy ? 'Verificando…' : 'Entrar'}
          </button>
          <div className="row spread">
            <button type="button" className="link" onClick={() => setStep('email')}>
              Cambiar correo
            </button>
            <button type="button" className="link" onClick={() => requestCode()} disabled={wait > 0 || busy}>
              {wait > 0 ? `Reenviar en ${wait}s` : 'Reenviar código'}
            </button>
          </div>
          <p className="muted small">¿No llega? Revisa la carpeta de spam o promociones.</p>
        </form>
      )}
    </div>
  )
}
