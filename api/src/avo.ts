import { Hono } from 'hono'
import type { AppEnv } from './env'
import { chat, requireAiConsent, toBase64 } from './ai'
import { fail } from './errors'
import { FEELINGS, insertMood, isFeeling, isPlan, patientContext, toMood, type MoodRow } from './moods'

/**
 * Platicar con Avo por texto o audio. Avo contesta como compañero (con la hora, sus comidas y cómo se ha sentido) y,
 * si el paciente le cuenta cómo se siente, lo anota como registro de ánimo (eso sí lo ve su nutrióloga). La
 * conversación es privada. Los audios no se guardan: la IA los transcribe y se guarda el texto.
 */

const MAX_AUDIO_BYTES = 4 * 1024 * 1024 // ~2 minutos de WAV mono a 16 kHz
const AUDIO_TYPES = ['audio/wav', 'audio/x-wav', 'audio/wave']
const MAX_PER_DAY = 150
const HISTORY = 16
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const AVO_CHAT_PROMPT = `Eres Avo, el aguacate compañero de nutrición de la app Avocado. Platicas con el paciente como en un chat de WhatsApp: cálido, cercano, práctico y un poquito bromista, como el búho de Duolingo pero nunca cruel (español de México/Centroamérica, tutea).
Tu meta: que entienda sus patrones y mejore QUÉ come y A QUÉ HORA, y que se sienta acompañado para seguir registrando sus comidas.
- Respuestas cortas: 1 a 4 frases. Una sola pregunta a la vez y solo si ayuda.
- Usa el contexto (hora, cuánto hace de su última comida y qué fue, lo que lleva hoy contra su meta, cómo se ha sentido) y menciónalo cuando sirva ("comiste hace 5 horas…").
- Hambre, ansiedad, antojo, llenura, malestar o poca energía: ayúdale a entender por qué (horarios, porciones, lo que comió) y propón algo concreto para ahorita o la próxima comida.
- Si quiere registrar una comida, dile que le tome foto con el botón "Registrar comida"; si tiene un antojo, que use "¿Me lo como?".
- Comida libre (cheat meal): si te pide una, usa su saldo de la semana del contexto. Propón 2 o 3 opciones concretas con sus calorías aproximadas que quepan en las kcal extra que tiene (puede sumarlas a lo que le queda de hoy), sin pasarse, y que la disfrute sin culpa. Si no tiene saldo, dilo con cariño y propón algo rico más ligero o esperar a tenerlo. Si su objetivo es subir (volumen), ayúdale a completar lo que le falta con comidas densas y nutritivas. Si no ha elegido su objetivo o no tiene meta diaria, pídele que los ponga en Perfil. Nunca lo plantees como compensar, "ganárselo" ni castigarse, y recuerda que el plan de su nutrióloga manda.
- Nunca contradigas el plan de su nutrióloga. Nada de culpa ni de "prohibido", "malo", "trampa", ni quemar calorías con ejercicio. No des diagnósticos médicos; si algo suena serio o se repite, que consulte a su médico.
- Si menciona hacerse daño, atracones con culpa, vomitar o dejar de comer a propósito, responde con mucho cuidado, sin consejos de dieta, y anímale a buscar ayuda profesional y a hablar con alguien de confianza o con su nutrióloga.
Además del texto, devuelve:
- "transcript": si el paciente mandó audio, lo que dijo, transcrito tal cual en español; si escribió, cadena vacía.
- "mood": si en este mensaje cuenta cómo se siente AHORITA (o después de su última comida), "log": true, con "feelings" de la lista (bien, con_hambre, con_antojo, lleno, ansioso, cansado, mal), "energy" de 1 a 5 si habla de su energía (0 si no), "on_plan" ("si", "a_medias", "no") si dice si va con su plan ("" si no) y "note" con un resumen corto en sus palabras. Si no habla de cómo se siente, "log": false, "feelings": [], "energy": 0, "on_plan": "" y "note": "".
Responde SOLO con el JSON pedido.`

const CHAT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['transcript', 'reply', 'mood'],
  properties: {
    transcript: { type: 'string' },
    reply: { type: 'string' },
    mood: {
      type: 'object',
      additionalProperties: false,
      required: ['log', 'feelings', 'energy', 'on_plan', 'note'],
      properties: {
        log: { type: 'boolean' },
        feelings: { type: 'array', items: { type: 'string', enum: [...FEELINGS] } },
        energy: { type: 'integer' },
        on_plan: { type: 'string', enum: ['si', 'a_medias', 'no', ''] },
        note: { type: 'string' },
      },
    },
  },
}

interface MessageRow {
  id: string
  user_id: string
  role: 'user' | 'avo'
  body: string
  via_audio: number
  mood_id: string | null
  created_at: string
}

export const avoRoutes = new Hono<AppEnv>()

/** Mensajes con el registro de ánimo que Avo anotó (si lo hubo). */
async function withMoods(env: AppEnv['Bindings'], rows: MessageRow[]) {
  const ids = [...new Set(rows.map((r) => r.mood_id).filter((id): id is string => Boolean(id)))]
  const moods = new Map<string, ReturnType<typeof toMood>>()
  if (ids.length) {
    const { results } = await env.DB.prepare(`SELECT * FROM moods WHERE id IN (${ids.map(() => '?').join(',')})`)
      .bind(...ids)
      .all<MoodRow>()
    for (const m of results) moods.set(m.id, toMood(m))
  }
  return rows.map(({ user_id: _, via_audio, ...r }) => ({ ...r, via_audio: Boolean(via_audio), mood: r.mood_id ? (moods.get(r.mood_id) ?? null) : null }))
}

// Conversación (lo más reciente): ?limit=50&before=<ISO>
avoRoutes.get('/messages', async (c) => {
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit')) || 50))
  const before = c.req.query('before') ? new Date(String(c.req.query('before'))).toISOString() : '9999'
  const { results } = await c.env.DB.prepare('SELECT * FROM avo_messages WHERE user_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?')
    .bind(c.var.user.id, before, limit)
    .all<MessageRow>()
  return c.json({ messages: await withMoods(c.env, results.reverse()) })
})

// Borrar toda la conversación (los registros de ánimo se quedan).
avoRoutes.delete('/messages', async (c) => {
  await c.env.DB.prepare('DELETE FROM avo_messages WHERE user_id = ?').bind(c.var.user.id).run()
  return c.json({ ok: true })
})

// Mensaje nuevo. multipart: text? y/o audio? (WAV), id? (del teléfono, para no duplicar), offset (minutos, como getTimezoneOffset)
avoRoutes.post('/messages', async (c) => {
  const user = c.var.user
  requireAiConsent(user)
  const form = await c.req.formData().catch(() => fail(400, 'Formulario inválido'))
  const text = String(form.get('text') ?? '').trim().slice(0, 2000)
  const audio = form.get('audio')
  if (audio !== null && !(audio instanceof File)) fail(400, 'Audio inválido')
  if (audio && !AUDIO_TYPES.includes(audio.type)) fail(400, 'El audio debe ser WAV')
  if (audio && audio.size > MAX_AUDIO_BYTES) fail(413, 'El audio es muy largo (máximo 2 minutos)')
  if (!text && !audio) fail(400, 'Escríbele algo a Avo o mándale un audio')
  const offset = Number(form.get('offset') ?? 0)
  if (!Number.isInteger(offset) || Math.abs(offset) > 14 * 60) fail(400, 'offset inválido')

  // Un reenvío (conexión cortada) regresa lo que ya se había contestado.
  const clientId = String(form.get('id') ?? '') || null
  if (clientId && !UUID.test(clientId)) fail(400, 'id inválido')
  if (clientId) {
    const existing = await c.env.DB.prepare('SELECT * FROM avo_messages WHERE id = ?').bind(clientId).first<MessageRow>()
    if (existing) {
      if (existing.user_id !== user.id) fail(409, 'id en uso')
      const reply = await c.env.DB.prepare("SELECT * FROM avo_messages WHERE user_id = ? AND role = 'avo' AND created_at > ? ORDER BY created_at LIMIT 1")
        .bind(user.id, existing.created_at)
        .first<MessageRow>()
      const [mine, avo] = await withMoods(c.env, reply ? [existing, reply] : [existing])
      return c.json({ user: mine, avo: avo ?? null, mood: avo?.mood ?? null }, 200)
    }
  }

  const today = await c.env.DB.prepare("SELECT count(*) AS n FROM avo_messages WHERE user_id = ? AND role = 'user' AND created_at > ?")
    .bind(user.id, new Date(Date.now() - 24 * 3_600_000).toISOString())
    .first<{ n: number }>()
  if ((today?.n ?? 0) >= MAX_PER_DAY) fail(429, 'Ya platicamos mucho hoy. ¡Seguimos mañana!')

  const [context, history] = await Promise.all([
    patientContext(c.env, user, offset),
    c.env.DB.prepare('SELECT role, body FROM avo_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
      .bind(user.id, HISTORY)
      .all<Pick<MessageRow, 'role' | 'body'>>(),
  ])

  const content: unknown[] = []
  if (text) content.push({ type: 'text', text })
  if (audio) {
    content.push({ type: 'text', text: text ? '(También mandó este audio.)' : '(El paciente mandó este audio.)' })
    content.push({ type: 'input_audio', input_audio: { data: toBase64(await audio.arrayBuffer()), format: 'wav' } })
  }

  let raw: { transcript?: unknown; reply?: unknown; mood?: Record<string, unknown> }
  try {
    const { text: answer } = await chat(
      c.env,
      [
        { role: 'system', content: `${AVO_CHAT_PROMPT}\n\nContexto:\n${context.join('\n')}` },
        ...history.results.reverse().map((m) => ({ role: m.role === 'avo' ? 'assistant' : 'user', content: m.body })),
        { role: 'user', content },
      ],
      { type: 'json_schema', json_schema: { name: 'avo_chat', strict: true, schema: CHAT_SCHEMA } },
    )
    const start = answer.indexOf('{')
    raw = JSON.parse(answer.slice(start, answer.lastIndexOf('}') + 1))
  } catch (err) {
    console.error('avo chat', err instanceof Error ? err.message : err)
    fail(502, 'Avo no pudo contestarte ahorita. Intenta de nuevo en un momento.')
  }

  const said = text || String(raw.transcript ?? '').trim()
  const reply = String(raw.reply ?? '').trim()
  if (!said) fail(422, 'No te entendí el audio. ¿Me lo repites o me lo escribes?')
  if (!reply) fail(502, 'Avo no pudo contestarte ahorita. Intenta de nuevo en un momento.')

  // Lo que contó de cómo se siente queda como registro de ánimo (lo ve su nutrióloga).
  const m = raw.mood ?? {}
  const feelings = Array.isArray(m.feelings) ? [...new Set(m.feelings.filter(isFeeling))] : []
  let moodId: string | null = null
  if (m.log === true && feelings.length) {
    const energy = Number(m.energy)
    const note = String(m.note ?? '').trim().slice(0, 300)
    const mood = await insertMood(c.env, user.id, {
      felt_at: new Date().toISOString(),
      feelings,
      energy: Number.isInteger(energy) && energy >= 1 && energy <= 5 ? energy : null,
      on_plan: isPlan(m.on_plan) ? m.on_plan : null,
      note: note || null,
      meal_id: null,
    })
    moodId = mood.id
  }

  const now = Date.now()
  const userMessage: MessageRow = { id: clientId || crypto.randomUUID(), user_id: user.id, role: 'user', body: said, via_audio: audio ? 1 : 0, mood_id: null, created_at: new Date(now).toISOString() }
  const avoMessage: MessageRow = { id: crypto.randomUUID(), user_id: user.id, role: 'avo', body: reply, via_audio: 0, mood_id: moodId, created_at: new Date(now + 1).toISOString() }
  const insert = 'INSERT INTO avo_messages (id, user_id, role, body, via_audio, mood_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  await c.env.DB.batch(
    [userMessage, avoMessage].map((r) => c.env.DB.prepare(insert).bind(r.id, r.user_id, r.role, r.body, r.via_audio, r.mood_id, r.created_at)),
  )
  const [mine, avo] = await withMoods(c.env, [userMessage, avoMessage])
  return c.json({ user: mine, avo, mood: avo.mood }, 201)
})
