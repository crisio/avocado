import { useEffect, useState } from 'react'
import { Button, Card, Notice } from '@avocado/ui'
import { cheer, spriteUrl } from '../lib/mascot'
import { formatLongDate, formatTime } from '../lib/format'
import { mealTitle } from '../lib/meals'
import type { Meal } from '../lib/types'

const WIDTH = 1000
const PAD = 56
const RADIUS = 64
const FONT = '"Bricolage Grotesque Variable", system-ui, sans-serif'
const MACROS = [
  { key: 'protein_g', label: 'Proteína', color: '#8DBB6A', kcalPerGram: 4 },
  { key: 'carbs_g', label: 'Carbs', color: '#F2C14E', kcalPerGram: 4 },
  { key: 'fat_g', label: 'Grasa', color: '#EE8E7E', kcalPerGram: 9 },
] as const

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** Parte el texto en renglones que caben en `maxWidth`; si sobra, el último termina en "…". */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (let i = 0; i < words.length; i++) {
    const test = current ? `${current} ${words[i]}` : words[i]
    if (ctx.measureText(test).width <= maxWidth || !current) {
      current = test
      continue
    }
    if (lines.length === maxLines - 1) {
      current = words.slice(i - (current ? current.split(' ').length : 0)).join(' ')
      break
    }
    lines.push(current)
    current = words[i]
  }
  if (current) lines.push(current)
  const last = lines.length - 1
  if (last >= 0 && ctx.measureText(lines[last]).width > maxWidth) {
    let cut = lines[last]
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1)
    lines[last] = `${cut.trimEnd()}…`
  }
  return lines
}

/** Dibuja el sticker de macros (PNG con fondo transparente) y regresa la imagen. */
export async function drawSticker(meal: Meal): Promise<Blob> {
  await document.fonts.load('700 48px "Bricolage Grotesque Variable"').catch(() => undefined)
  const mascot = await loadImage(spriteUrl('love'))

  const grams = MACROS.map((m) => meal[m.key] ?? 0)
  const kcals = MACROS.map((m, i) => grams[i] * m.kcalPerGram)
  const total = kcals.reduce((a, b) => a + b, 0)

  const measure = document.createElement('canvas').getContext('2d')!
  measure.font = `700 54px ${FONT}`
  const title = wrap(measure, mealTitle(meal), WIDTH - PAD * 2, 2)

  const brandH = 56
  const titleLH = 64
  const calH = 120
  const ringD = 220
  const stroke = 26
  const labelH = 52
  const dateH = 32
  const height = PAD + brandH + 32 + title.length * titleLH + 12 + calH + 36 + ringD + 12 + labelH + 28 + dateH + PAD

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = 'rgba(18, 45, 19, 0.74)'
  ctx.beginPath()
  ctx.roundRect(0, 0, WIDTH, height, RADIUS)
  ctx.fill()

  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'alphabetic'
  let y = PAD

  // Marca
  let brandX = PAD
  if (mascot) {
    const side = mascot.naturalWidth / 4
    ctx.drawImage(mascot, 0, 0, side, mascot.naturalHeight, PAD, y, brandH, brandH)
    brandX += brandH + 14
  }
  ctx.textAlign = 'left'
  ctx.font = `700 34px ${FONT}`
  ctx.fillText('Avocado', brandX, y + brandH * 0.68)
  y += brandH + 32

  // Título
  ctx.font = `700 54px ${FONT}`
  for (const line of title) {
    y += titleLH
    ctx.fillText(line, PAD, y - 16)
  }
  y += 12

  // Calorías
  const calories = String(Math.round(meal.calories ?? 0))
  ctx.font = `800 112px ${FONT}`
  ctx.fillText(calories, PAD, y + 98)
  const numW = ctx.measureText(calories).width
  ctx.font = `700 44px ${FONT}`
  ctx.fillText('kcal', PAD + numW + 14, y + 98)
  y += calH + 36

  // Anillos
  const colW = (WIDTH - PAD * 2) / 3
  MACROS.forEach((m, i) => {
    const cx = PAD + colW * i + colW / 2
    const cy = y + ringD / 2
    const r = (ringD - stroke) / 2
    ctx.lineWidth = stroke
    ctx.lineCap = 'round'
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()
    const share = total > 0 ? kcals[i] / total : 0
    if (share > 0) {
      ctx.strokeStyle = m.color
      ctx.beginPath()
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(share, 0.999))
      ctx.stroke()
    }
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.font = `700 48px ${FONT}`
    ctx.fillText(`${Math.round(grams[i])} g`, cx, cy + 17)
    ctx.font = `600 32px ${FONT}`
    ctx.fillText(m.label, cx, y + ringD + 12 + 36)
  })
  y += ringD + 12 + labelH + 28

  // Fecha y hora
  const when = new Date(meal.eaten_at)
  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.78)'
  ctx.font = `600 28px ${FONT}`
  ctx.fillText(`${formatLongDate(when)} · ${formatTime(meal.eaten_at)}`, PAD, y + 26)

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo crear la imagen'))), 'image/png'))
}

/** Sticker de macros para pegar en una historia de Instagram. */
export default function ShareSticker({ meal }: { meal: Meal }) {
  const [blob, setBlob] = useState<Blob | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    setBlob(null)
    setUrl(null)
    setFailed(false)
    drawSticker(meal)
      .then((b) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(b)
        setBlob(b)
        setUrl(objectUrl)
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [meal.id, meal.eaten_at, meal.calories, meal.protein_g, meal.carbs_g, meal.fat_g, meal.analysis?.summary, meal.note])

  const file = blob ? new File([blob], 'avocado-sticker.png', { type: 'image/png' }) : null
  const canShare = !!file && !!navigator.canShare?.({ files: [file] })
  const canCopy = !!blob && typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write

  async function share() {
    if (!file) return
    try {
      await navigator.share({ files: [file] })
      cheer('love', '¡A presumir esa comida!', { interrupt: true })
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setNotice('No se pudo compartir el sticker.')
    }
  }

  async function copy() {
    if (!blob) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setNotice('Copiado. Abre tu historia en Instagram y pégalo.')
      cheer('love', '¡Sticker copiado!', { interrupt: true })
    } catch {
      setNotice('No se pudo copiar el sticker.')
    }
  }

  return (
    <Card padding="lg">
      <h2 className="av-section-title">Sticker para tu historia</h2>
      <div className="share-sticker__stage" style={meal.photo_url ? { backgroundImage: `url("${meal.photo_url}")` } : undefined}>
        {url ? <img className="share-sticker__img" src={url} alt="Vista previa del sticker con proteína, carbohidratos, grasa y calorías" /> : <span className="share-sticker__wait">{failed ? 'No se pudo crear el sticker.' : 'Preparando…'}</span>}
      </div>
      <div className="share-sticker__actions">
        {canShare && (
          <Button icon="share" onClick={share}>
            Compartir sticker
          </Button>
        )}
        {canCopy && (
          <Button variant={canShare ? 'secondary' : 'primary'} icon="image" onClick={copy}>
            Copiar sticker
          </Button>
        )}
        {!canShare && !canCopy && url && (
          <a className="share-sticker__download" href={url} download="avocado-sticker.png" onClick={() => cheer('love', '¡Sticker listo!', { interrupt: true })}>
            Descargar sticker (PNG)
          </a>
        )}
      </div>
      {notice && <Notice tone="info">{notice}</Notice>}
    </Card>
  )
}
