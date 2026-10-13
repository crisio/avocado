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
    expect((await call(day, { token: patient })).data[0].last_comment).toBeNull()

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

    const listed = await call(day, { token: patient })
    expect(listed.data[0].last_comment).toMatchObject({ body: 'Agrega verdura', author_name: 'Lic. Ana', author_role: 'nutritionist' })

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
    expect(sentBody.models).toBeUndefined() // un solo modelo: sin lista de respaldo
    expect(sentBody.reasoning).toEqual({ effort: 'minimal', exclude: true })
    expect(sentBody.response_format.type).toBe('json_schema')
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

describe('cola sin conexión', () => {
  it('no duplica una comida reenviada con el mismo client_id', async () => {
    const token = await login('cola@gmail.com', { full_name: 'Cola', role: 'patient' })
    const other = await login('cola2@gmail.com', { full_name: 'Otra', role: 'patient' })
    const id = crypto.randomUUID()

    const first = await call('/meals', { method: 'POST', token, body: photoForm({ client_id: id, eaten_at: '2026-10-11T15:00:00Z' }) })
    expect(first.status).toBe(201)
    expect(first.data.id).toBe(id)
    const again = await call('/meals', { method: 'POST', token, body: photoForm({ client_id: id, eaten_at: '2026-10-11T15:00:00Z' }) })
    expect(again.status).toBe(200)
    expect(again.data.id).toBe(id)
    const { results } = await env.DB.prepare('SELECT id FROM meals WHERE user_id = (SELECT user_id FROM meals WHERE id = ?)').bind(id).all()
    expect(results).toHaveLength(1)

    expect((await call('/meals', { method: 'POST', token: other, body: photoForm({ client_id: id }) })).status).toBe(409)
    expect((await call('/meals', { method: 'POST', token, body: photoForm({ client_id: 'no-es-uuid' }) })).status).toBe(400)
  })

  it('con analyze=1 analiza al recibir la foto, sin otra llamada', async () => {
    const token = await login('auto@gmail.com', { full_name: 'Auto', role: 'patient' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        model: 'test/vision-model',
        choices: [{ message: { content: '{"items":[{"name":"Manzana","portion_g":150,"calories":78,"protein_g":0.4,"carbs_g":21,"fat_g":0.3}],"meal_type":"snack","summary":"Manzana","confidence":0.9}' } }],
      }),
    )
    const created = await call('/meals', { method: 'POST', token, body: photoForm({ analyze: '1' }) })
    expect(created.status).toBe(201)
    const detail = await call(`/meals/${created.data.id}`, { token })
    expect(detail.data).toMatchObject({ status: 'analyzed', calories: 78 })
  })

  it('no duplica un comentario reenviado con el mismo id', async () => {
    const token = await login('comenta@gmail.com', { full_name: 'Comenta', role: 'patient' })
    const meal = (await call('/meals', { method: 'POST', token, body: photoForm() })).data
    const id = crypto.randomUUID()
    expect((await call(`/meals/${meal.id}/comments`, { method: 'POST', token, json: { id, body: 'Sin azúcar' } })).status).toBe(201)
    expect((await call(`/meals/${meal.id}/comments`, { method: 'POST', token, json: { id, body: 'Sin azúcar' } })).status).toBe(200)
    expect((await call(`/meals/${meal.id}`, { token })).data.comments).toHaveLength(1)
  })
})

describe('cuánto se comió', () => {
  const twoItems = (extra = '') =>
    Response.json({
      model: 'test/vision-model',
      choices: [
        {
          message: {
            content: `{"items":[{"name":"Lechuga","portion_g":100,"calories":20,"protein_g":1,"carbs_g":4,"fat_g":0${extra}},{"name":"Pollo","portion_g":120,"calories":200,"protein_g":36,"carbs_g":0,"fat_g":6${extra}}],"meal_type":"comida","summary":"Ensalada con pollo","confidence":0.8}`,
          },
        },
      ],
    })

  async function analyzedMeal(email: string) {
    const token = await login(email, { full_name: 'Porciones', role: 'patient' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(twoItems())
    const meal = (await call('/meals', { method: 'POST', token, body: photoForm({ analyze: '1' }) })).data
    vi.restoreAllMocks()
    return { token, id: meal.id as string }
  }

  it('ajusta las porciones y recalcula lo comido sin perder lo servido', async () => {
    const { token, id } = await analyzedMeal('porcion@gmail.com')
    const before = await call(`/meals/${id}`, { token })
    expect(before.data).toMatchObject({ calories: 220, protein_g: 37 })
    expect(before.data.analysis.items.map((i: any) => i.eaten)).toEqual([1, 1])

    const res = await call(`/meals/${id}/portions`, { method: 'PATCH', token, json: { eaten: [0.5, 1] } })
    expect(res.status).toBe(200)
    expect(res.data).toMatchObject({ calories: 210, protein_g: 36.5, carbs_g: 2 })
    expect(res.data.analysis.served).toMatchObject({ calories: 220, protein_g: 37 })
    expect(res.data.analysis.items[0].eaten).toBe(0.5)

    // El total del día usa lo comido
    const day = await call(`/meals?from=2000-01-01T00:00:00Z&to=2100-01-01T00:00:00Z`, { token })
    expect(day.data.find((m: any) => m.id === id).calories).toBe(210)
  })

  it('rechaza porciones inválidas y a quien no es dueño', async () => {
    const { token, id } = await analyzedMeal('porcion2@gmail.com')
    const other = await login('otro-porcion@gmail.com', { full_name: 'Otro', role: 'patient' })
    expect((await call(`/meals/${id}/portions`, { method: 'PATCH', token, json: { eaten: [1] } })).status).toBe(400)
    expect((await call(`/meals/${id}/portions`, { method: 'PATCH', token, json: { eaten: [1, 2] } })).status).toBe(400)
    expect((await call(`/meals/${id}/portions`, { method: 'PATCH', token, json: { eaten: ['1', 1] } })).status).toBe(400)
    expect((await call(`/meals/${id}/portions`, { method: 'PATCH', token: other, json: { eaten: [1, 1] } })).status).toBe(404)

    const pending = (await call('/meals', { method: 'POST', token, body: photoForm() })).data
    expect((await call(`/meals/${pending.id}/portions`, { method: 'PATCH', token, json: { eaten: [] } })).status).toBe(409)
  })

  it('corrige con las palabras del paciente sin volver a mandar la foto', async () => {
    const { token, id } = await analyzedMeal('corrige@gmail.com')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        model: 'test/vision-model',
        choices: [
          {
            message: {
              content:
                '{"items":[{"name":"Lechuga","portion_g":100,"calories":20,"protein_g":1,"carbs_g":4,"fat_g":0,"eaten":0.5},{"name":"Pollo","portion_g":120,"calories":200,"protein_g":36,"carbs_g":0,"fat_g":6,"eaten":1},{"name":"Jugo de naranja","portion_g":250,"calories":110,"protein_g":2,"carbs_g":26,"fat_g":0,"eaten":1}],"meal_type":"comida","summary":"Ensalada con pollo y jugo","confidence":0.5}',
            },
          },
        ],
      }),
    )
    const text = 'me dejé la mitad de la lechuga y me tomé un jugo de naranja'
    const res = await call(`/meals/${id}/correct`, { method: 'POST', token, json: { text } })
    expect(res.status).toBe(200)
    expect(res.data).toMatchObject({ calories: 320 })
    expect(res.data.analysis).toMatchObject({ correction: text, confidence: 0.8 })
    expect(res.data.analysis.served.calories).toBe(330)

    const sent = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body))
    expect(JSON.stringify(sent.messages)).toContain(text)
    expect(JSON.stringify(sent.messages)).not.toContain('image_url')
  })

  it('no pisa un cambio hecho mientras tanto (409) y trata "eaten": null como todo', async () => {
    const { token, id } = await analyzedMeal('carrera@gmail.com')
    // La app manda los nombres que ve: si la lista ya no es la misma, no aplica las porciones por posición.
    const stale = await call(`/meals/${id}/portions`, { method: 'PATCH', token, json: { eaten: [1, 0.5], items: ['Arroz', 'Pollo'] } })
    expect(stale.status).toBe(409)
    const ok = await call(`/meals/${id}/portions`, { method: 'PATCH', token, json: { eaten: [1, 0.5], items: ['Lechuga', 'Pollo'] } })
    expect(ok.status).toBe(200)

    // Una corrección que tarda y encuentra la comida cambiada no la pisa.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      await env.DB.prepare(`UPDATE meals SET analysis = json_set(analysis, '$.summary', 'cambiada') WHERE id = ?`).bind(id).run()
      return twoItems(',"eaten":null')
    })
    const res = await call(`/meals/${id}/correct`, { method: 'POST', token, json: { text: 'me comí todo' } })
    expect(res.status).toBe(409)
    expect((await call(`/meals/${id}`, { token })).data.calories).toBe(120)

    // "eaten": null de un modelo cuenta como comido completo
    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(twoItems(',"eaten":null'))
    const fixed = await call(`/meals/${id}/correct`, { method: 'POST', token, json: { text: 'me comí todo' } })
    expect(fixed.status).toBe(200)
    expect(fixed.data.calories).toBe(220)
  })

  it('valida la corrección y avisa si la IA falla', async () => {
    const { token, id } = await analyzedMeal('corrige2@gmail.com')
    expect((await call(`/meals/${id}/correct`, { method: 'POST', token, json: { text: '  ' } })).status).toBe(400)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('caído', { status: 503 }))
    const res = await call(`/meals/${id}/correct`, { method: 'POST', token, json: { text: 'me comí todo' } })
    expect(res.status).toBe(502)
    // El análisis anterior queda igual
    expect((await call(`/meals/${id}`, { token })).data.calories).toBe(220)
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

describe('envío de correos con Resend', () => {
  const resendEnv = () => ({ ...env, EMAIL_MODE: 'resend' as const, RESEND_API_KEY: 're_test', EMAIL_FROM: 'Avocado <avocado@cristopherpineda.com>' })

  it('manda el código desde el dominio configurado', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ id: 'email_1' }))
    const res = await app.fetch(
      new Request(`${BASE}/auth/code`, { method: 'POST', body: JSON.stringify({ email: 'resend@gmail.com' }) }),
      resendEnv(),
      createExecutionContext(),
    )
    expect(res.status).toBe(200)

    const [url, init] = fetchSpy.mock.calls[0]
    expect(String(url)).toBe('https://api.resend.com/emails')
    expect(new Headers((init as RequestInit).headers).get('Authorization')).toBe('Bearer re_test')
    const body = JSON.parse(String((init as RequestInit).body))
    expect(body).toMatchObject({ from: 'Avocado <avocado@cristopherpineda.com>', to: ['resend@gmail.com'] })
    expect(body.subject).toMatch(/^\d{6} es tu código de Avocado$/)
  })

  it('si Resend falla, avisa con un error claro', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"message":"domain not verified"}', { status: 403 }))
    const res = await app.fetch(
      new Request(`${BASE}/auth/code`, { method: 'POST', body: JSON.stringify({ email: 'resend2@gmail.com' }) }),
      resendEnv(),
      createExecutionContext(),
    )
    expect(res.status).toBe(502)
    expect((await res.json<any>()).error).toContain('No pudimos enviar el correo')
  })
})

describe('¿Me lo como? (antojos)', () => {
  const aiReply = (content: unknown) =>
    Response.json({ model: 'test/vision-model', choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }] })
  const advice = (extra: Record<string, unknown> = {}) =>
    aiReply({
      name: 'Pastel de chocolate',
      portion_g: 120,
      calories: 450,
      protein_g: 5,
      carbs_g: 55,
      fat_g: 22,
      verdict: 'un_poco',
      suggested_fraction: 0.5,
      message: 'Cris, la mitad son unas 225 kcal.',
      tips: ['Compártelo', 'Disfrútalo despacio'],
      question: '',
      confidence: 0.7,
      ...extra,
    })
  const meal393 = () =>
    aiReply({
      items: [
        { name: 'Arroz', portion_g: 150, calories: 195, protein_g: 4, carbs_g: 42, fat_g: 0.4, eaten: 1 },
        { name: 'Pollo', portion_g: 120, calories: 198, protein_g: 37, carbs_g: 0, fat_g: 4.3, eaten: 1 },
      ],
      meal_type: 'comida',
      summary: 'Arroz con pollo',
      confidence: 0.8,
    })
  const DAY = { from: '2026-10-12T06:00:00.000Z', to: '2026-10-13T06:00:00.000Z' }
  const cravingForm = (extra: Record<string, string> = {}) => photoForm({ ...DAY, hour: '21', ...extra })
  const sentContext = (spy: { mock: { calls: unknown[][] } }, i = 0) => {
    const body = JSON.parse(String((spy.mock.calls[i][1] as RequestInit).body))
    return { body, context: body.messages[1].content[0].text as string }
  }

  it('meta diaria en el perfil: se guarda, se valida y se puede quitar', async () => {
    const token = await login('meta@gmail.com', { full_name: 'Meta', role: 'patient' })
    expect((await call('/me', { token })).data.daily_kcal_goal).toBeNull()
    expect((await call('/me', { method: 'PATCH', token, json: { daily_kcal_goal: 1800 } })).data.daily_kcal_goal).toBe(1800)
    expect((await call('/me', { token })).data.daily_kcal_goal).toBe(1800)
    expect((await call('/me', { method: 'PATCH', token, json: { daily_kcal_goal: 100 } })).status).toBe(400)
    expect((await call('/me', { method: 'PATCH', token, json: { daily_kcal_goal: 'mucho' } })).status).toBe(400)
    // Cambiar el nombre no borra la meta
    expect((await call('/me', { method: 'PATCH', token, json: { full_name: 'Otra' } })).data.daily_kcal_goal).toBe(1800)
    expect((await call('/me', { method: 'PATCH', token, json: { daily_kcal_goal: null } })).data.daily_kcal_goal).toBeNull()
  })

  it('aconseja con lo que lleva hoy y su meta, sin registrar nada', async () => {
    const token = await login('antojo@gmail.com', { full_name: 'Cris Pineda', role: 'patient' })
    await call('/me', { method: 'PATCH', token, json: { daily_kcal_goal: 1800 } })
    // Hoy: una analizada (393 kcal) y una pendiente (cuenta como comida, no suma). Ayer: no cuenta.
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(meal393()).mockResolvedValueOnce(meal393())
    const today = (await call('/meals', { method: 'POST', token, body: photoForm({ eaten_at: '2026-10-12T15:00:00.000Z' }) })).data
    await call(`/meals/${today.id}/analyze`, { method: 'POST', token })
    await call('/meals', { method: 'POST', token, body: photoForm({ eaten_at: '2026-10-12T20:00:00.000Z' }) })
    const yesterday = (await call('/meals', { method: 'POST', token, body: photoForm({ eaten_at: '2026-10-11T15:00:00.000Z' }) })).data
    await call(`/meals/${yesterday.id}/analyze`, { method: 'POST', token })
    vi.restoreAllMocks()

    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(advice())
    const res = await call('/cravings', { method: 'POST', token, body: cravingForm({ note: 'pastel de la tía' }) })
    expect(res.status).toBe(200)
    expect(res.data).toMatchObject({
      name: 'Pastel de chocolate',
      calories: 450,
      verdict: 'un_poco',
      suggested_fraction: 0.5,
      suggested_calories: 225,
      tips: ['Compártelo', 'Disfrútalo despacio'],
      question: null,
      today: { consumed: 393, meals: 2, pending: 1, goal: 1800, remaining: 1407 },
    })

    const { body, context } = sentContext(spy)
    expect(body.response_format.json_schema.name).toBe('craving_advice')
    expect(body.messages[0].content).toContain('nunca restringir ni culpar')
    expect(context).toContain('Paciente: Cris.')
    expect(context).toContain('Hora local: 21:00.')
    expect(context).toContain('Hoy lleva 393 kcal en 2 comidas registradas.')
    // La pendiente no tiene calorías todavía: Avo sabe que en realidad lleva más
    expect(context).toContain('Ojo: 1 de esas comidas aún no tiene calorías calculadas')
    expect(context).toContain('le quedan 1407 kcal')
    expect(context).toContain('pastel de la tía')
    expect(body.messages[1].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/)

    // No se guardó ninguna comida
    const list = await call(`/meals?from=${DAY.from}&to=${DAY.to}`, { token })
    expect(list.data).toHaveLength(2)
  })

  it('sin meta también aconseja; pasa la pregunta de Avo y la respuesta del paciente', async () => {
    const token = await login('antojo2@gmail.com', { full_name: 'Ana', role: 'patient' })
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(advice({ question: '¿Es tres leches o de chocolate?', confidence: 0.4 }))
    const first = await call('/cravings', { method: 'POST', token, body: cravingForm() })
    expect(first.data.question).toBe('¿Es tres leches o de chocolate?')
    expect(first.data.today).toEqual({ consumed: 0, meals: 0, pending: 0, goal: null, remaining: null })
    expect(sentContext(spy).context).toContain('No tiene meta diaria configurada.')

    spy.mockResolvedValueOnce(advice({ name: 'Pastel tres leches', calories: 380 }))
    const second = await call('/cravings', {
      method: 'POST',
      token,
      body: cravingForm({ question: '¿Es tres leches o de chocolate?', answer: 'tres leches' }),
    })
    expect(second.data).toMatchObject({ name: 'Pastel tres leches', suggested_calories: 190 })
    expect(sentContext(spy, 1).context).toContain('Le preguntaste: "¿Es tres leches o de chocolate?" y respondió: "tres leches".')
  })

  it('tolera respuestas raras del modelo y avisa si falla', async () => {
    const token = await login('antojo3@gmail.com', { full_name: 'Leo', role: 'patient' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(advice({ verdict: 'quien sabe', suggested_fraction: null, tips: 'no es lista', calories: '300' }))
    const odd = await call('/cravings', { method: 'POST', token, body: cravingForm() })
    expect(odd.data).toMatchObject({ verdict: 'un_poco', suggested_fraction: 0.5, suggested_calories: 150, tips: [] })
    // Una fracción que no es número (o fuera de 0–1) usa la del veredicto, nunca "todo"
    for (const bad of ['1/2', 50, 'mitad']) {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(advice({ verdict: 'mejor_no', suggested_fraction: bad, calories: 400 }))
      const res = await call('/cravings', { method: 'POST', token, body: cravingForm() })
      expect(res.data).toMatchObject({ suggested_fraction: 0.1, suggested_calories: 40 })
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('caído', { status: 503 }))
    const down = await call('/cravings', { method: 'POST', token, body: cravingForm() })
    expect(down.status).toBe(502)
    expect(down.data.error).toContain('Avo no pudo ver tu antojo')
  })

  it('cuenta las comidas que siguen en el teléfono, avisa si ya pasó su meta y no inventa la hora', async () => {
    const token = await login('antojo5@gmail.com', { full_name: 'Sol', role: 'patient' })
    await call('/me', { method: 'PATCH', token, json: { daily_kcal_goal: 1000 } })
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(meal393()).mockResolvedValueOnce(meal393()).mockResolvedValueOnce(meal393())
    for (const at of ['2026-10-12T14:00:00.000Z', '2026-10-12T18:00:00.000Z', '2026-10-12T22:00:00.000Z']) {
      const m = (await call('/meals', { method: 'POST', token, body: photoForm({ eaten_at: at }) })).data
      await call(`/meals/${m.id}/analyze`, { method: 'POST', token })
    }
    vi.restoreAllMocks()

    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(advice())
    const form = photoForm({ ...DAY, queued: '2' }) // sin hora
    const res = await call('/cravings', { method: 'POST', token, body: form })
    expect(res.data.today).toEqual({ consumed: 1179, meals: 5, pending: 2, goal: 1000, remaining: -179 })
    const { context } = sentContext(spy)
    expect(context).toContain('ya la pasó por 179 kcal')
    expect(context).toContain('Ojo: 2 de esas comidas aún no tienen')
    expect(context).not.toContain('Hora local')
  })

  it('valida la foto, las fechas y la sesión', async () => {
    const token = await login('antojo4@gmail.com', { full_name: 'Val', role: 'patient' })
    const noPhoto = new FormData()
    noPhoto.set('from', DAY.from)
    noPhoto.set('to', DAY.to)
    expect((await call('/cravings', { method: 'POST', token, body: noPhoto })).status).toBe(400)
    expect((await call('/cravings', { method: 'POST', token, body: photoForm({ from: 'ayer', to: DAY.to }) })).status).toBe(400)
    expect((await call('/cravings', { method: 'POST', body: cravingForm() })).status).toBe(401)
  })
})

describe('rachas', () => {
  it('calcula la racha actual, la mejor y la semana (función pura)', async () => {
    const { streakFrom } = await import('../src/streaks')
    const days = new Set(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-09', '2026-10-10', '2026-10-11'])
    // Hoy (12) aún sin registro: la racha de 3 sigue viva
    expect(streakFrom(days, '2026-10-12')).toMatchObject({ current: 3, best: 4, logged_today: false })
    // Con registro hoy: 4
    expect(streakFrom(new Set([...days, '2026-10-12']), '2026-10-12')).toMatchObject({ current: 4, logged_today: true })
    // Si ayer tampoco registró, se perdió
    expect(streakFrom(days, '2026-10-13').current).toBe(0)
    const week = streakFrom(days, '2026-10-12').week
    expect(week.map((d) => d.date)).toEqual(['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12'])
    expect(week.map((d) => d.logged)).toEqual([false, false, false, true, true, true, false])
    expect(streakFrom(new Set(), '2026-10-12')).toMatchObject({ current: 0, best: 0, logged_today: false })
  })

  it('usa el día del teléfono y solo la ve el paciente o su nutrióloga', async () => {
    const token = await login('racha@gmail.com', { full_name: 'Racha', role: 'patient' })
    const now = Date.now()
    const offset = 360 // UTC-6
    // Hoy y los dos días anteriores, a las 23:30 hora local (en UTC ya es el día siguiente)
    for (const back of [0, 1, 2]) {
      const local = new Date(now - offset * 60_000 - back * 86_400_000)
      const day = local.toISOString().slice(0, 10)
      const eatenUtc = new Date(Date.parse(`${day}T23:30:00Z`) + offset * 60_000)
      if (eatenUtc.getTime() > now) eatenUtc.setTime(now - 60_000) // no en el futuro
      await call('/meals', { method: 'POST', token, body: photoForm({ eaten_at: eatenUtc.toISOString() }) })
    }
    const mine = await call(`/streak?offset=${offset}`, { token })
    expect(mine.status).toBe(200)
    expect(mine.data).toMatchObject({ current: 3, best: 3, logged_today: true })

    const me = (await call('/me', { token })).data
    const nutri = await login('nutri-racha@gmail.com', { full_name: 'Nutri', role: 'nutritionist' })
    expect((await call(`/streak?user_id=${me.id}&offset=${offset}`, { token: nutri })).status).toBe(404)
    await call('/care/nutritionists', { method: 'POST', token, json: { email: 'nutri-racha@gmail.com' } })
    expect((await call(`/streak?user_id=${me.id}&offset=${offset}`, { token: nutri })).data.current).toBe(3)

    expect((await call('/streak?offset=9999', { token })).status).toBe(400)
    expect((await call('/streak?offset=360')).status).toBe(401)
  })
})
