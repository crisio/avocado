/**
 * Audios para Avo: se graban con MediaRecorder (webm en Chrome, mp4 en Safari) y se convierten a WAV mono de 16 kHz,
 * el formato que acepta la IA en cualquier navegador. Un minuto pesa ~1.9 MB.
 */

const RATE = 16_000

export interface Recording {
  /** Termina y regresa el WAV. */
  stop: () => Promise<Blob>
  /** Termina sin guardar. */
  cancel: () => void
}

export async function startRecording(): Promise<Recording> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Tu navegador no puede grabar audio.')
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {
    throw new Error('Necesito permiso para usar el micrófono.')
  })
  const recorder = new MediaRecorder(stream)
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  recorder.start()
  const release = () => stream.getTracks().forEach((t) => t.stop())

  return {
    stop: () =>
      new Promise<Blob>((resolve, reject) => {
        recorder.onstop = async () => {
          release()
          try {
            resolve(await toWav(new Blob(chunks, { type: recorder.mimeType })))
          } catch {
            reject(new Error('No pude procesar el audio.'))
          }
        }
        recorder.stop()
      }),
    cancel: () => {
      recorder.onstop = release
      if (recorder.state !== 'inactive') recorder.stop()
      else release()
    },
  }
}

async function toWav(blob: Blob): Promise<Blob> {
  const decoded = await new AudioContext().decodeAudioData(await blob.arrayBuffer())
  // Mono a 16 kHz (la voz no necesita más).
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * RATE)), RATE)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()
  const samples = (await offline.startRendering()).getChannelData(0)

  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const text = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, RATE, true)
  view.setUint32(28, RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((s, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true))
  return new Blob([buffer], { type: 'audio/wav' })
}
