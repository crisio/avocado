/**
 * Compara modelos de visión de OpenRouter con fotos reales de comida.
 *
 * Mide por modelo: tiempo hasta el primer token, tiempo total, tokens (incluidos los de
 * razonamiento oculto), costo por foto y si el JSON vino bien. Guarda los resultados en
 * bench-results/<fecha>/ (results.json, results.md, results.csv) para compararlos a ojo.
 *
 * Uso (Node 22.6+; en Node 24 ya no hace falta la bandera):
 *   cd api
 *   OPENROUTER_API_KEY=sk-or-... node --experimental-strip-types scripts/bench-models.ts \
 *     --photos ../fotos --models google/gemini-3.1-flash-lite,openai/gpt-6-luna,anthropic/claude-haiku-5.5
 *
 * Opciones:
 *   --photos <carpeta>   fotos .jpg/.jpeg/.png/.webp (ya reducidas como lo hace la app, ~1280 px)
 *   --models a,b,c       ids de OpenRouter a comparar
 *   --runs N             veces que se repite cada foto por modelo (default 1)
 *   --note "texto"       nota del paciente que se manda con todas las fotos (opcional)
 *   --extra '{json}'     campos extra del cuerpo de la petición, p. ej. '{"reasoning":{"enabled":false}}'
 *   --concurrency N      peticiones simultáneas (default 2)
 *   --out <carpeta>      dónde guardar (default bench-results/<fecha>)
 *   --dry-run            arma las peticiones sin llamar a OpenRouter
 *
 * La llave también se lee de api/.dev.vars (OPENROUTER_API_KEY=...) si no está en el entorno.
 */
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, extname, basename, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAnalysis, REQUEST_OPTIONS, SYSTEM_PROMPT, type Analysis } from '../src/ai.ts'

const here = dirname(fileURLToPath(import.meta.url))

// ── argumentos ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
function opt(name: string, fallback?: string) {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : argv[i + 1]
}
const flag = (name: string) => argv.includes(`--${name}`)

const photosDir = opt('photos')
const models = (opt('models') ?? '').split(',').map((m) => m.trim()).filter(Boolean)
const runs = Number(opt('runs', '1'))
const note = opt('note') ?? null
const extra = JSON.parse(opt('extra', '{}')!) as Record<string, unknown>
const concurrency = Number(opt('concurrency', '2'))
const dryRun = flag('dry-run')
const outDir = resolve(opt('out') ?? join(here, '..', 'bench-results', new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')))

if (!photosDir || models.length === 0) {
  console.error('Faltan --photos <carpeta> y --models a,b,c')
  process.exit(1)
}

function loadApiKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY
  const devVars = join(here, '..', '.dev.vars')
  if (existsSync(devVars)) {
    const m = readFileSync(devVars, 'utf8').match(/^OPENROUTER_API_KEY\s*=\s*"?([^"\n]+)"?/m)
    if (m) return m[1].trim()
  }
  return null
}
const apiKey = dryRun ? 'dry-run' : loadApiKey()
if (!apiKey) {
  console.error('Falta OPENROUTER_API_KEY (variable de entorno o api/.dev.vars)')
  process.exit(1)
}

// ── fotos ───────────────────────────────────────────────────────────────────
const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
const photos = readdirSync(photosDir)
  .filter((f) => MIME[extname(f).toLowerCase()])
  .sort()
  .map((f) => {
    const buf = readFileSync(join(photosDir, f))
    return { name: basename(f), bytes: buf.length, dataUrl: `data:${MIME[extname(f).toLowerCase()]};base64,${buf.toString('base64')}` }
  })
if (photos.length === 0) {
  console.error(`No hay fotos en ${photosDir}`)
  process.exit(1)
}

// ── petición (misma forma que api/src/ai.ts) ────────────────────────────────
function buildBody(model: string, dataUrl: string) {
  return {
    model,
    ...REQUEST_OPTIONS,
    stream: true,
    usage: { include: true }, // OpenRouter devuelve el costo real en el último chunk
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: note ? `Nota del paciente: ${note}` : 'Analiza esta comida.' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
    ...extra,
  }
}

interface Usage {
  prompt_tokens?: number
  completion_tokens?: number
  completion_tokens_details?: { reasoning_tokens?: number }
  cost?: number
}

interface Result {
  model: string
  photo: string
  run: number
  ok: boolean
  error?: string
  ttft_ms: number | null
  total_ms: number
  usage: Usage | null
  cost_usd: number | null
  served_model?: string
  provider?: string
  reasoning_chars: number
  analysis?: Analysis
  raw?: string
}

/** Lee la respuesta como SSE para medir el primer token; junta el contenido y el usage final. */
async function callModel(model: string, photo: (typeof photos)[number], run: number): Promise<Result> {
  const body = buildBody(model, photo.dataUrl)
  const t0 = performance.now()
  if (dryRun) {
    return { model, photo: photo.name, run, ok: true, ttft_ms: null, total_ms: 0, usage: null, cost_usd: null, reasoning_chars: 0, raw: JSON.stringify(body).slice(0, 200) }
  }
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'Avocado bench' },
    body: JSON.stringify(body),
  })
  if (!res.ok || !res.body) {
    return { model, photo: photo.name, run, ok: false, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`, ttft_ms: null, total_ms: performance.now() - t0, usage: null, cost_usd: null, reasoning_chars: 0 }
  }

  let ttft: number | null = null
  let text = ''
  let reasoningChars = 0
  let usage: Usage | null = null
  let servedModel: string | undefined
  let provider: string | undefined
  let buffer = ''
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue
      let chunk: { model?: string; provider?: string; usage?: Usage; choices?: { delta?: { content?: string; reasoning?: string } }[]; error?: { message?: string } }
      try {
        chunk = JSON.parse(data)
      } catch {
        continue
      }
      if (chunk.error) return { model, photo: photo.name, run, ok: false, error: chunk.error.message, ttft_ms: ttft, total_ms: performance.now() - t0, usage: null, cost_usd: null, reasoning_chars: reasoningChars }
      servedModel ??= chunk.model
      provider ??= chunk.provider
      const delta = chunk.choices?.[0]?.delta
      if (delta?.reasoning) reasoningChars += delta.reasoning.length
      if (delta?.content) {
        if (ttft === null) ttft = performance.now() - t0
        text += delta.content
      }
      if (chunk.usage) usage = chunk.usage
    }
  }
  const total = performance.now() - t0

  try {
    const analysis = parseAnalysis(text, servedModel ?? model)
    return { model, photo: photo.name, run, ok: true, ttft_ms: ttft, total_ms: total, usage, cost_usd: usage?.cost ?? null, served_model: servedModel, provider, reasoning_chars: reasoningChars, analysis, raw: text }
  } catch (err) {
    return { model, photo: photo.name, run, ok: false, error: (err as Error).message, ttft_ms: ttft, total_ms: total, usage, cost_usd: usage?.cost ?? null, served_model: servedModel, provider, reasoning_chars: reasoningChars, raw: text }
  }
}

// ── ejecución con concurrencia limitada ─────────────────────────────────────
const jobs: (() => Promise<Result>)[] = []
for (const model of models) for (const photo of photos) for (let run = 1; run <= runs; run++) jobs.push(() => callModel(model, photo, run))

const results: Result[] = []
let next = 0
async function worker() {
  while (next < jobs.length) {
    const job = jobs[next++]
    const r = await job()
    results.push(r)
    const status = r.ok ? `${Math.round(r.total_ms)} ms` : `ERROR ${r.error}`
    console.log(`[${results.length}/${jobs.length}] ${r.model} · ${r.photo} · ${status}${r.cost_usd != null ? ` · $${r.cost_usd.toFixed(5)}` : ''}`)
  }
}
console.log(`${models.length} modelos × ${photos.length} fotos × ${runs} corridas = ${jobs.length} peticiones${dryRun ? ' (dry-run)' : ''}`)
await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker))

// ── resumen ─────────────────────────────────────────────────────────────────
const pct = (xs: number[], p: number) => {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}
const fmt = (n: number | null, d = 0) => (n == null ? '—' : n.toFixed(d))

const summary = models.map((model) => {
  const rs = results.filter((r) => r.model === model)
  const ok = rs.filter((r) => r.ok)
  const costs = ok.map((r) => r.cost_usd).filter((c): c is number => c != null)
  const avgCost = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null
  const inTok = ok.map((r) => r.usage?.prompt_tokens ?? 0)
  const outTok = ok.map((r) => r.usage?.completion_tokens ?? 0)
  const reason = ok.map((r) => r.usage?.completion_tokens_details?.reasoning_tokens ?? 0)
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  return {
    model,
    requests: rs.length,
    json_ok_pct: rs.length ? Math.round((100 * ok.length) / rs.length) : 0,
    ttft_p50_ms: pct(ok.map((r) => r.ttft_ms).filter((x): x is number => x != null), 50),
    total_p50_ms: pct(ok.map((r) => r.total_ms), 50),
    total_p90_ms: pct(ok.map((r) => r.total_ms), 90),
    avg_prompt_tokens: avg(inTok),
    avg_completion_tokens: avg(outTok),
    avg_reasoning_tokens: avg(reason),
    avg_cost_usd: avgCost,
    usd_per_1000: avgCost == null ? null : avgCost * 1000,
    providers: [...new Set(ok.map((r) => r.provider).filter(Boolean))].join(', '),
    errors: rs.filter((r) => !r.ok).map((r) => r.error).slice(0, 3),
  }
})

const md: string[] = []
md.push(`# Comparación de modelos · ${new Date().toISOString()}`, '')
md.push(`${photos.length} fotos · ${runs} corrida(s) por foto · nota: ${note ?? '—'} · extra: \`${JSON.stringify(extra)}\``, '')
md.push('| Modelo | JSON ok | 1er token p50 | Total p50 | Total p90 | Tokens entrada | Tokens salida | Razonamiento | $/foto | $/1000 fotos | Proveedores |')
md.push('|---|---|---|---|---|---|---|---|---|---|---|')
for (const s of summary) {
  md.push(
    `| ${s.model} | ${s.json_ok_pct}% | ${fmt(s.ttft_p50_ms)} ms | ${fmt(s.total_p50_ms)} ms | ${fmt(s.total_p90_ms)} ms | ${fmt(s.avg_prompt_tokens)} | ${fmt(s.avg_completion_tokens)} | ${fmt(s.avg_reasoning_tokens)} | ${s.avg_cost_usd == null ? '—' : '$' + s.avg_cost_usd.toFixed(5)} | ${s.usd_per_1000 == null ? '—' : '$' + s.usd_per_1000.toFixed(2)} | ${s.providers} |`,
  )
}
md.push('', '## Qué vio cada modelo (para revisar precisión a ojo)', '')
for (const photo of photos) {
  md.push(`### ${photo.name}`, '')
  for (const model of models) {
    const r = results.find((x) => x.model === model && x.photo === photo.name && x.ok && x.analysis)
    if (!r?.analysis) {
      const e = results.find((x) => x.model === model && x.photo === photo.name)
      md.push(`- **${model}**: ERROR ${e?.error ?? ''}`)
      continue
    }
    const a = r.analysis
    const items = a.items.map((i) => `${i.name} ${i.portion_g} g · ${i.calories} kcal`).join('; ')
    md.push(`- **${model}** (${Math.round(r.total_ms)} ms): ${a.summary} — **${a.total.calories} kcal** · P ${a.total.protein_g} g · C ${a.total.carbs_g} g · G ${a.total.fat_g} g · confianza ${a.confidence}. Alimentos: ${items}`)
  }
  md.push('')
}

const csv = [
  'model,photo,run,ok,ttft_ms,total_ms,prompt_tokens,completion_tokens,reasoning_tokens,cost_usd,calories,provider,error',
  ...results.map((r) =>
    [r.model, r.photo, r.run, r.ok, r.ttft_ms?.toFixed(0) ?? '', r.total_ms.toFixed(0), r.usage?.prompt_tokens ?? '', r.usage?.completion_tokens ?? '', r.usage?.completion_tokens_details?.reasoning_tokens ?? '', r.cost_usd ?? '', r.analysis?.total.calories ?? '', r.provider ?? '', JSON.stringify(r.error ?? '')].join(','),
  ),
]

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'results.json'), JSON.stringify({ photos: photos.map((p) => ({ name: p.name, bytes: p.bytes })), models, runs, note, extra, summary, results }, null, 2))
writeFileSync(join(outDir, 'results.md'), md.join('\n'))
writeFileSync(join(outDir, 'results.csv'), csv.join('\n'))

console.log('\n' + md.slice(0, 4 + summary.length).join('\n'))
console.log(`\nResultados en ${outDir}`)
