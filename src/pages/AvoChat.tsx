import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, Icon, Notice, Screen } from '@avocado/ui'
import { useAuth } from '../auth'
import AiConsentCard from '../components/AiConsent'
import { Mascot } from '../components/Mascot'
import { api } from '../lib/api'
import { firstName, formatTime } from '../lib/format'
import { cheer } from '../lib/mascot'
import { feelingOf, notifyMoodsChanged } from '../lib/moods'
import { useOnline } from '../lib/useOnline'
import { startRecording, type Recording } from '../lib/wav'
import type { AvoMessage, Mood } from '../lib/types'

const MAX_SECONDS = 90
const SUGGESTIONS = ['Tengo hambre', 'Me siento ansioso/a', 'No me llené con la comida', '¿Qué ceno hoy?']

/** Un mensaje que todavía no llega al servidor (se muestra mientras Avo contesta, o con error para reintentar). */
interface Pending {
  id: string
  text: string
  audio: Blob | null
  error?: string
}

/**
 * Platicar con Avo: por texto o con audios (como en WhatsApp). Avo contesta con la hora, tus comidas y cómo te has
 * sentido, y si le cuentas cómo te sientes lo anota (eso lo ve tu nutrióloga; la conversación es privada).
 */
export default function AvoChat() {
  const { user } = useAuth()
  const online = useOnline()
  const [messages, setMessages] = useState<AvoMessage[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [text, setText] = useState('')
  const [recording, setRecording] = useState<Recording | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [micError, setMicError] = useState<string | null>(null)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const name = firstName(user?.full_name)
  const location = useLocation()
  const navigate = useNavigate()
  const ask = (location.state as { ask?: string } | null)?.ask

  // El cuadro para escribir va en la barra de abajo (Layout deja un hueco en esta pantalla).
  useEffect(() => {
    setSlot(document.getElementById('avo-composer'))
  }, [])

  useEffect(() => {
    if (!user?.ai_consent_at) return
    api<{ messages: AvoMessage[] }>('/avo/messages?limit=60').then(
      (r) => setMessages(r.messages),
      (err) => setLoadError((err as Error).message),
    )
  }, [user?.ai_consent_at])

  // Con llaves: en Chrome reciente scrollIntoView regresa una promesa y React la tomaría como limpieza.
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages?.length, pending])

  // Cronómetro de la grabación (se corta sola al llegar al máximo).
  useEffect(() => {
    if (!recording) return
    setSeconds(0)
    const t = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [recording])
  useEffect(() => {
    if (recording && seconds >= MAX_SECONDS) void finishRecording()
  }, [seconds])

  // Pregunta que llega de otra pantalla ("Que Avo me recomiende un cheat meal"): se manda sola, una vez.
  useEffect(() => {
    if (!ask || messages === null || pending) return
    navigate('/avo', { replace: true, state: null })
    void send({ id: crypto.randomUUID(), text: ask, audio: null })
  }, [ask, messages === null])

  async function send(message: Pending) {
    setPending({ ...message, error: undefined })
    cheer('think', 'Mmm…', { interrupt: true })
    const form = new FormData()
    form.set('id', message.id)
    form.set('offset', String(new Date().getTimezoneOffset()))
    if (message.text) form.set('text', message.text)
    if (message.audio) form.set('audio', message.audio, 'audio.wav')
    try {
      const res = await api<{ user: AvoMessage; avo: AvoMessage; mood: Mood | null }>('/avo/messages', { method: 'POST', body: form, timeoutMs: 90_000 })
      setMessages((prev) => [...(prev ?? []), res.user, res.avo])
      setPending(null)
      if (res.mood) {
        notifyMoodsChanged()
        cheer('love', 'Lo anoté', { interrupt: true })
      }
    } catch (err) {
      setPending({ ...message, error: (err as Error).message })
      cheer('oops', 'No te escuché bien', { interrupt: true })
    }
  }

  function submit(e?: FormEvent) {
    e?.preventDefault()
    const value = text.trim()
    if (!value || pending) return
    setText('')
    void send({ id: crypto.randomUUID(), text: value, audio: null })
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envía; Shift+Enter hace un renglón nuevo.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  async function toggleRecording() {
    setMicError(null)
    if (recording) return finishRecording()
    try {
      setRecording(await startRecording())
      cheer('love', 'Te escucho…', { interrupt: true })
    } catch (err) {
      setMicError((err as Error).message)
    }
  }

  async function finishRecording() {
    const current = recording
    if (!current) return
    setRecording(null)
    try {
      const audio = await current.stop()
      void send({ id: crypto.randomUUID(), text: '', audio })
    } catch (err) {
      setMicError((err as Error).message)
    }
  }

  function cancelRecording() {
    recording?.cancel()
    setRecording(null)
  }

  if (!user?.ai_consent_at)
    return (
      <Screen withTabBar>
        <ChatHeader />
        <AiConsentCard />
      </Screen>
    )

  const busy = Boolean(pending && !pending.error)
  const composer = (
    <form className="avo-composer" onSubmit={submit}>
      {recording ? (
        <div className="avo-recording" role="status">
          <span className="avo-recording__dot" aria-hidden />
          <span>
            Grabando… {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
          </span>
          <Button type="button" variant="ghost" onClick={cancelRecording}>
            Cancelar
          </Button>
          <button type="button" className="avo-composer__round avo-composer__round--send" onClick={() => void finishRecording()} aria-label="Enviar audio">
            <Icon name="send" />
          </button>
        </div>
      ) : (
        <>
          <textarea
            className="avo-composer__input"
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Escríbele a Avo…"
            aria-label="Mensaje para Avo"
            maxLength={2000}
            disabled={busy}
          />
          {text.trim() ? (
            <button type="submit" className="avo-composer__round avo-composer__round--send" disabled={busy || !online} aria-label="Enviar">
              <Icon name="send" />
            </button>
          ) : (
            <button type="button" className="avo-composer__round" onClick={() => void toggleRecording()} disabled={busy || !online} aria-label="Grabar un audio">
              <Icon name="mic" />
            </button>
          )}
        </>
      )}
    </form>
  )

  return (
    <Screen withTabBar>
      <ChatHeader thinking={busy} />
      {loadError && <Notice tone="error">{loadError}</Notice>}
      {messages === null && !loadError && <p className="av-text-muted">Cargando…</p>}

      <ol className="avo-chat" aria-label="Conversación con Avo" aria-live="polite">
        {messages?.length === 0 && (
          <li className="avo-msg avo-msg--avo">
            <p>
              ¡Hola{name ? `, ${name}` : ''}! Cuéntame cómo te sientes, qué se te antoja o cómo te fue con tu última comida. Puedes escribirme o mandarme un audio
              🎙️
            </p>
          </li>
        )}
        {messages?.map((m) => (
          <li key={m.id} className={`avo-msg avo-msg--${m.role}`}>
            {m.via_audio && <span className="avo-msg__audio">🎙️ Audio</span>}
            <p>{m.body}</p>
            {m.mood && (
              <span className="avo-msg__mood">
                Anoté: {m.mood.feelings.map((f) => `${feelingOf(f).emoji} ${feelingOf(f).label}`).join(' · ')}
                {m.mood.energy ? ` · Energía ${m.mood.energy}/5` : ''}
              </span>
            )}
            <time className="avo-msg__time">{formatTime(m.created_at)}</time>
          </li>
        ))}
        {pending && (
          <li className="avo-msg avo-msg--user avo-msg--pending">
            {pending.audio ? <span className="avo-msg__audio">🎙️ Audio</span> : <p>{pending.text}</p>}
            {pending.error && (
              <span className="avo-msg__error">
                {pending.error}{' '}
                <button type="button" onClick={() => void send(pending)}>
                  Reintentar
                </button>
              </span>
            )}
          </li>
        )}
        {busy && (
          <li className="avo-msg avo-msg--avo avo-msg--typing" aria-label="Avo está escribiendo">
            <span />
            <span />
            <span />
          </li>
        )}
      </ol>

      {messages?.length === 0 && !pending && (
        <div className="avo-suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="mood-chip" onClick={() => void send({ id: crypto.randomUUID(), text: s, audio: null })} disabled={!online}>
              {s}
            </button>
          ))}
        </div>
      )}
      {micError && <Notice tone="error">{micError}</Notice>}
      {!online && <Notice tone="warning">Sin conexión: Avo necesita internet para platicar.</Notice>}
      <div ref={bottom} />
      {slot && createPortal(composer, slot)}
    </Screen>
  )
}

function ChatHeader({ thinking = false }: { thinking?: boolean }) {
  return (
    <header className="avo-header">
      <Mascot size={64} base={thinking ? 'think' : 'idle'} reactive interactive bubble="right" />
      <div>
        <h1 className="av-page-header__title" style={{ fontSize: 28 }}>
          Avo
        </h1>
        <p className="av-text-muted" style={{ margin: 0 }}>
          Tu compañero de nutrición. Lo que platiquen es privado; cómo te sientes lo ve tu nutrióloga.
        </p>
      </div>
    </header>
  )
}
