import { useEffect, useRef, useState } from 'react'
import { Icon } from '@avocado/ui'
import { api, ApiError } from '../lib/api'
import { useOnline } from '../lib/useOnline'
import { startRecording, type Recording } from '../lib/wav'

const MAX_SECONDS = 90

/**
 * Botón de micrófono para dictar: un toque empieza a grabar, otro termina; el audio se transcribe y el texto
 * se agrega al campo (con un espacio si ya había algo). Necesita internet y el permiso de IA.
 */
export default function VoiceButton({ onText, context }: { onText: (text: string) => void; context: 'cocina' | 'nota' }) {
  const online = useOnline()
  const [recording, setRecording] = useState<Recording | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const current = useRef<Recording | null>(null)
  current.current = recording

  // Cronómetro (se corta solo al llegar al máximo).
  useEffect(() => {
    if (!recording) return
    setSeconds(0)
    const t = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [recording])
  useEffect(() => {
    if (recording && seconds >= MAX_SECONDS) void finish()
  }, [seconds])
  // Si se cierra la pantalla grabando, se suelta el micrófono.
  useEffect(() => () => current.current?.cancel(), [])

  async function start() {
    setError(null)
    if (!online) return setError('Necesitas internet para dictar')
    try {
      setRecording(await startRecording())
    } catch (err) {
      const msg = (err as Error).message
      setError(msg.includes('permiso') ? 'Activa el micrófono para dictar' : msg)
    }
  }

  async function finish() {
    const rec = current.current
    if (!rec) return
    current.current = null
    setRecording(null)
    setBusy(true)
    try {
      const audio = await rec.stop()
      const form = new FormData()
      form.set('audio', audio, 'audio.wav')
      form.set('context', context)
      const res = await api<{ text: string }>('/transcribe', { method: 'POST', body: form, timeoutMs: 60_000 })
      const text = res.text.trim()
      if (text) onText(text)
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) setError('Necesitas internet para dictar')
      else setError((err as Error).message)
    }
    setBusy(false)
  }

  return (
    <div className="voice">
      {recording ? (
        <button type="button" className="voice__btn voice__btn--rec" onClick={() => void finish()} aria-label="Terminar de dictar">
          <span className="avo-recording__dot" aria-hidden />
          <span>
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')} · Toca para terminar
          </span>
        </button>
      ) : (
        <button type="button" className="voice__btn" onClick={() => void start()} disabled={busy} aria-label="Dictar con la voz">
          <Icon name="mic" />
          <span>{busy ? 'Escuchando…' : 'Dictar'}</span>
        </button>
      )}
      {error && (
        <span className="voice__error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
