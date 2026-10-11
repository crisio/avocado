import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import app from '../src/index'
import { devOutbox } from '../src/email'

const BASE = 'https://api.test'
const ORIGIN = 'https://crisio.github.io'

async function call(path: string, init: RequestInit & { token?: string; json?: unknown } = {}) {
  const headers = new Headers(init.headers)
  headers.set('Origin', ORIGIN)
  if (init.token) headers.set('Authorization', `Bearer ${init.token}`)
  let body = init.body
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(init.json)
  }
  const ctx = createExecutionContext()
  const res = await app.fetch(new Request(BASE + path, { ...init, headers, body }), env, ctx)
  await waitOnExecutionContext(ctx)
  const data = res.headers.get('Content-Type')?.includes('json') ? await res.json<any>() : null
  return { status: res.status, data, res }
}

const lastCodeFor = (email: string) => {
  const mail = [...devOutbox].reverse().find((m) => m.to === email)
  return mail?.subject.match(/^(\d{6})/)?.[1]
}

/** Registra (o entra con) una cuenta y regresa su token. */
async function login(email: string, profile?: { full_name: string; role: 'patient' | 'nutritionist' }) {
  await env.DB.prepare('DELETE FROM auth_codes WHERE email = ?').bind(email).run() // evita el límite de 1 min
  expect((await call('/auth/code', { method: 'POST', json: { email } })).status).toBe(200)
  const { data } = await call('/auth/verify', { method: 'POST', json: { email, code: lastCodeFor(email) } })
  if (profile) await call('/me', { method: 'PATCH', token: data.token, json: profile })
  return data.token as string
}

function photoForm(extra: Record<string, string> = {}) {
  const form = new FormData()
  form.set('photo', new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], 'plato.jpg', { type: 'image/jpeg' }))
  for (const [k, v] of Object.entries(extra)) form.set(k, v)
  return form
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('login con código por correo', () => {
  it('envía un código, rechaza el incorrecto y entra con el correcto', async () => {
    const email = 'Cris@Gmail.com '
    const sent = await call('/auth/code', { method: 'POST', json: { email } })
    expect(sent.status).toBe(200)
    const code = lastCodeFor('cris@gmail.com')
    expect(code).toMatch(/^\d{6}$/)

    const wrong = await call('/auth/verify', { method: 'POST', json: { email, code: code === '000000' ? '111111' : '000000' } })
    expect(wrong.status).toBe(400)
    expect(wrong.data.error).toBe('Código incorrecto')

    const ok = await call('/auth/verify', { method: 'POST', json: { email, code } })
    expect(ok.status).toBe(200)
    expect(ok.data.user).toMatchObject({ email: 'cris@gmail.com', role: null })

    const me = await call('/me', { token: ok.data.token })
    expect(me.data.email).toBe('cris@gmail.com')

    // El código ya no sirve una segunda vez
    expect((await call('/auth/verify', { method: 'POST', json: { email, code } })).status).toBe(400)
  })

  it('no deja pedir otro código antes de un minuto', async () => {
    await call('/auth/code', { method: 'POST', json: { email: 'prisa@gmail.com' } })
    const again = await call('/auth/code', { method: 'POST', json: { email: 'prisa@gmail.com' } })
    expect(again.status).toBe(429)
  })

  it('bloquea el código tras 5 intentos fallidos', async () => {
    const email = 'fuerza@gmail.com'
    await call('/auth/code', { method: 'POST', json: { email } })
    const code = lastCodeFor(email)!
    const bad = code === '123456' ? '654321' : '123456'
    for (let i = 0; i < 5; i++) await call('/auth/verify', { method: 'POST', json: { email, code: bad } })
    const res = await call('/auth/verify', { method: 'POST', json: { email, code } })
    expect(res.status).toBe(429)
  })

  it('rechaza códigos vencidos', async () => {
    const email = 'tarde@gmail.com'
    await call('/auth/code', { method: 'POST', json: { email } })
    await env.DB.prepare('UPDATE auth_codes SET expires_at = 0 WHERE email = ?').bind(email).run()
    const res = await call('/auth/verify', { method: 'POST', json: { email, code: lastCodeFor(email) } })
    expect(res.status).toBe(400)
  })

  it('sin token o con token inválido responde 401; logout invalida la sesión', async () => {
    expect((await call('/me')).status).toBe(401)
    expect((await call('/me', { token: 'inventado' })).status).toBe(401)
    const token = await login('salir@gmail.com')
    expect((await call('/auth/logout', { method: 'POST', token })).status).toBe(200)
    expect((await call('/me', { token })).status).toBe(401)
  })

  it('el rol se elige una sola vez', async () => {
    const token = await login('rol@gmail.com')
    const set = await call('/me', { method: 'PATCH', token, json: { full_name: 'Ana', role: 'patient' } })
    expect(set.data).toMatchObject({ full_name: 'Ana', role: 'patient' })
    const change = await call('/me', { method: 'PATCH', token, json: { role: 'nutritionist' } })
    expect(change.status).toBe(400)
  })
})

describe('comidas, fotos y acceso de la nutrióloga', () => {
  it('cada quien ve lo suyo y la nutrióloga solo a sus pacientes vinculados', async () => {
    const patient = await login('paciente@gmail.com', { full_name: 'Paciente', role: 'patient' })
    const nutri = await login('nutri@gmail.com', { full_name: 'Lic. Ana', role: 'nutritionist' })
    const other = await login('otra@gmail.com', { full_name: 'Otra', role: 'nutritionist' })
    const stranger = await login('extrano@gmail.com', { full_name: 'Extraño', role: 'patient' })
    const patientId = (await call('/me', { token: patient })).data.id

    // Crear comida con foto
    const created = await call('/meals', {
      method: 'POST',
      token: patient,
      body: photoForm({ eaten_at: '2026-10-11T14:30:00.000Z', note: 'sin azúcar' }),
    })
    expect(created.status).toBe(201)
    expect(created.data).toMatchObject({ user_id: patientId, status: 'pending', note: 'sin azúcar' })
    const mealId = created.data.id

    // La foto se ve con la URL firmada y no con una firma alterada
    const photoPath = new URL(created.data.photo_url).pathname + new URL(created.data.photo_url).search
    const photo = await call(photoPath)
    expect(photo.status).toBe(200)
    expect(photo.res.headers.get('Content-Type')).toBe('image/jpeg')
    expect((await call(photoPath.replace(/sig=[0-9a-f]+/, 'sig=' + '0'.repeat(64)))).status).toBe(403)
    expect((await call(photoPath.replace(/exp=\d+/, 'exp=' + (Date.now() + 9e9)))).status).toBe(403)

    const day = `/meals?user_id=${patientId}&from=2026-10-11T00:00:00Z&to=2026-10-12T00:00:00Z`
    expect((await call(day, { token: patient })).data).toHaveLength(1)

    // Sin vínculo, la nutrióloga no ve nada
    expect((await call(day, { token: nutri })).status).toBe(404)
    expect((await call(`/meals/${mealId}`, { token: nutri })).status).toBe(404)
    expect((await call(`/users/${patientId}`, { token: nutri })).status).toBe(404)

    // No se puede vincular a alguien que no es nutrióloga
    expect((await call('/care/nutritionists', { method: 'POST', token: patient, json: { email: 'extrano@gmail.com' } })).status).toBe(404)
    // Vincular por correo (sin importar mayúsculas)
    const link = await call('/care/nutritionists', { method: 'POST', token: patient, json: { email: ' NUTRI@gmail.com' } })
    expect(link.status).toBe(201)

    expect((await call(day, { token: nutri })).data).toHaveLength(1)
    expect((await call('/care/patients', { token: nutri })).data).toEqual([
      { id: patientId, email: 'paciente@gmail.com', full_name: 'Paciente' },
    ])
    expect((await call(`/users/${patientId}`, { token: nutri })).data.full_name).toBe('Paciente')
    expect((await call(day, { token: other })).status).toBe(404)
    expect((await call(day, { token: stranger })).status).toBe(404)

    // La nutrióloga comenta pero no puede borrar ni re-analizar
    const comment = await call(`/meals/${mealId}/comments`, { method: 'POST', token: nutri, json: { body: 'Agrega verdura' } })
    expect(comment.status).toBe(201)
    expect((await call(`/meals/${mealId}/comments`, { method: 'POST', token: other, json: { body: 'hola' } })).status).toBe(404)
    expect((await call(`/meals/${mealId}`, { method: 'DELETE', token: nutri })).status).toBe(404)
    expect((await call(`/meals/${mealId}/analyze`, { method: 'POST', token: nutri })).status).toBe(404)

    const detail = await call(`/meals/${mealId}`, { token: patient })
    expect(detail.data.comments).toEqual([
      expect.objectContaining({ body: 'Agrega verdura', author_name: 'Lic. Ana', author_role: 'nutritionist' }),
    ])

    // Al desvincular, deja de ver
    expect((await call(`/care/nutritionists/${link.data.id}`, { method: 'DELETE', token: patient })).status).toBe(200)
    expect((await call(day, { token: nutri })).status).toBe(404)

    // El dueño borra su comida y la foto desaparece
    expect((await call(`/meals/${mealId}`, { method: 'DELETE', token: patient })).status).toBe(200)
    expect(await env.PHOTOS.get(`${patientId}/${mealId}.jpg`)).toBeNull()
  })

  it('rechaza archivos que no son imagen', async () => {
    const token = await login('archivo@gmail.com', { full_name: 'A', role: 'patient' })
    const form = new FormData()
    form.set('photo', new File(['hola'], 'nota.txt', { type: 'text/plain' }))
    expect((await call('/meals', { method: 'POST', token, body: form })).status).toBe(400)
  })
})

describe('análisis con IA (OpenRouter simulado)', () => {
  it('guarda alimentos y totales aunque el modelo envuelva el JSON en ```', async () => {
    const token = await login('ia@gmail.com', { full_name: 'IA', role: 'patient' })
    const meal = (await call('/meals', { method: 'POST', token, body: photoForm({ note: 'con aceite' }) })).data

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        model: 'test/vision-model',
        choices: [
          {
            message: {
              content:
                'Aquí está:\n```json\n{"items":[{"name":"Arroz","portion_g":150,"calories":195,"protein_g":4,"carbs_g":42,"fat_g":0.4},{"name":"Pollo","portion_g":120,"calories":198,"protein_g":37,"carbs_g":0,"fat_g":4.3}],"meal_type":"comida","summary":"Arroz con pollo","confidence":0.8}\n```',
            },
          },
        ],
      }),
    )

    const res = await call(`/meals/${meal.id}/analyze`, { method: 'POST', token })
    expect(res.status).toBe(200)
    expect(res.data).toMatchObject({ status: 'analyzed', calories: 393, protein_g: 41, carbs_g: 42 })
    expect(res.data.analysis.summary).toBe('Arroz con pollo')
    expect(res.data.analysis.items).toHaveLength(2)

    // Se mandó la foto como imagen y la nota del paciente
    const [url, init] = fetchSpy.mock.calls[0]
    expect(String(url)).toBe('https://openrouter.ai/api/v1/chat/completions')
    const sentBody = JSON.parse(String((init as RequestInit).body))
    expect(sentBody.model).toBe('test/vision-model')
    expect(sentBody.messages[1].content[0].text).toContain('con aceite')
    expect(sentBody.messages[1].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('marca la comida con error si OpenRouter falla', async () => {
    const token = await login('iaerror@gmail.com', { full_name: 'E', role: 'patient' })
    const meal = (await call('/meals', { method: 'POST', token, body: photoForm() })).data
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('sin créditos', { status: 402 }))

    const res = await call(`/meals/${meal.id}/analyze`, { method: 'POST', token })
    expect(res.data.status).toBe('error')
    expect(res.data.analysis.error).toContain('OpenRouter 402')
  })
})

describe('CORS', () => {
  it('permite la app y bloquea otros orígenes', async () => {
    const ok = await app.fetch(
      new Request(`${BASE}/me`, { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'GET' } }),
      env,
      createExecutionContext(),
    )
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)

    const evil = await app.fetch(
      new Request(`${BASE}/me`, { method: 'OPTIONS', headers: { Origin: 'https://malo.com', 'Access-Control-Request-Method': 'GET' } }),
      env,
      createExecutionContext(),
    )
    expect(evil.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})

describe('configuración', () => {
  it('no arranca sin un AUTH_SECRET seguro', async () => {
    const res = await app.fetch(
      new Request(`${BASE}/auth/code`, { method: 'POST', body: JSON.stringify({ email: 'x@gmail.com' }) }),
      { ...env, AUTH_SECRET: 'corto' },
      createExecutionContext(),
    )
    expect(res.status).toBe(503)
  })
})
