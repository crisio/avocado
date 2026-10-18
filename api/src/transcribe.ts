import { Hono } from 'hono'
import type { AppEnv } from './env'
import { chat, requireAiConsent, toBase64 } from './ai'
import { AUDIO_TYPES, MAX_AUDIO_BYTES } from './avo'
import { fail } from './errors'

/**
 * Dictar en vez de escribir: la nota de una comida o cómo la cocinó. El audio va a la IA (con el permiso del paciente),
 * regresa el texto y el audio no se guarda.
 */

const MAX_PER_DAY = 100

const PROMPTS = {
  nota: 'El paciente describe lo que comió.',
  cocina: 'El paciente cuenta cómo cocinó su comida (aceite, mantequilla, cantidades, método).',
} as const

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['text'],
  properties: { text: { type: 'string' } },
}

export const transcribeRoutes = new Hono<AppEnv>()

// multipart: audio (WAV) y context ("nota" | "cocina")
transcribeRoutes.post('/', async (c) => {
  const user = c.var.user
  requireAiConsent(user)
  const form = await c.req.formData().catch(() => fail(400, 'Formulario inválido'))
  const audio = form.get('audio')
  if (!(audio instanceof File)) fail(400, 'Falta el audio')
  if (!AUDIO_TYPES.includes(audio.type)) fail(400, 'El audio debe ser WAV')
  if (audio.size > MAX_AUDIO_BYTES) fail(413, 'El audio es muy largo (máximo 2 minutos)')
  const context = form.get('context') === 'cocina' ? 'cocina' : 'nota'

  const day = new Date().toISOString().slice(0, 10)
  const used = await c.env.DB.prepare(
    `INSERT INTO transcriptions (user_id, day, n) VALUES (?, ?, 1)
     ON CONFLICT (user_id, day) DO UPDATE SET n = n + 1 RETURNING n`,
  )
    .bind(user.id, day)
    .first<{ n: number }>()
  if ((used?.n ?? 0) > MAX_PER_DAY) fail(429, 'Ya dictaste mucho hoy. Escríbelo o intenta mañana.')

  let text = ''
  try {
    const { text: answer } = await chat(
      c.env,
      [
        {
          role: 'system',
          content: `Transcribe el audio en español, tal cual lo dice, con buena ortografía y puntuación. ${PROMPTS[context]} No agregues nada que no diga. Si no se entiende o no hay voz, regresa "text" vacío.`,
        },
        { role: 'user', content: [{ type: 'input_audio', input_audio: { data: toBase64(await audio.arrayBuffer()), format: 'wav' } }] },
      ],
      { type: 'json_schema', json_schema: { name: 'transcription', strict: true, schema: SCHEMA } },
    )
    const raw = JSON.parse(answer.slice(answer.indexOf('{'), answer.lastIndexOf('}') + 1)) as { text?: unknown }
    text = String(raw.text ?? '').trim().slice(0, 1000)
  } catch (err) {
    console.error('transcribe', err instanceof Error ? err.message : err)
    fail(502, 'No pude escuchar tu audio ahorita. Intenta de nuevo o escríbelo.')
  }
  if (!text) fail(422, 'No te entendí el audio. ¿Me lo repites?')
  return c.json({ text })
})
