import { useEffect, useState } from 'react'
import { Button, Card, Notice } from '@avocado/ui'
import { savePhoto } from './PhotoViewer'
import { cheer, spriteUrl } from '../lib/mascot'
import { formatLongDate, formatTime } from '../lib/format'
import { mealTitle } from '../lib/meals'
import type { Meal } from '../lib/types'

const WIDTH = 1000
const PAD = 56
const RADIUS = 64
const FONT = '"Bricolage Grotesque Variable", system-ui, sans-serif'
const MACROS = [
  { key: 'protein_g', label: 'Proteína', kcalPerGram: 4 },
  { key: 'carbs_g', label: 'Carbs', kcalPerGram: 4 },
  { key: 'fat_g', label: 'Grasa', kcalPerGram: 9 },
] as const

/** Estilo del sticker: fondo (color o degradado), texto y los tres anillos, con contraste entre sí. */
export interface StickerTheme {
  id: string
  name: string
  /** Fondo de la tarjeta: un color o dos para el degradado diagonal. */
  bg: [string, string?]
  text: string
  /** Fecha y hora. */
  soft: string
  /** Pista del anillo. */
  track: string
  /** Proteína, carbs y grasa. */
  rings: [string, string, string]
  /** Texto de la marca (por defecto "Avocado") y su color. */
  brand?: string
  brandColor?: string
}

export const THEMES: StickerTheme[] = [
  { id: 'dia', name: 'Día', bg: ['#FFFBF0'], text: '#18221B', soft: 'rgba(24,34,27,0.66)', track: 'rgba(24,34,27,0.12)', rings: ['#3F8F2A', '#E0A100', '#E2573F'], brandColor: '#2F7A3A' },
  { id: 'noche', name: 'Noche', bg: ['#122D13'], text: '#FFFFFF', soft: 'rgba(255,255,255,0.78)', track: 'rgba(255,255,255,0.2)', rings: ['#8DBB6A', '#F2C14E', '#EE8E7E'] },
  { id: 'romantica', name: 'Cena romántica', bg: ['#4A0D26', '#7E1D40'], text: '#FFEDEF', soft: 'rgba(255,237,239,0.78)', track: 'rgba(255,237,239,0.18)', rings: ['#FF8FB5', '#F6C76B', '#FF6F7D'], brandColor: '#F6C76B' },
  { id: 'cheat', name: 'Cheat meal', bg: ['#FF8A00', '#E6007E'], text: '#FFFFFF', soft: 'rgba(255,255,255,0.88)', track: 'rgba(255,255,255,0.28)', rings: ['#D9FF5C', '#FFF176', '#FFFFFF'], brand: 'Cheat meal 🍕' },
  { id: 'fresco', name: 'Fresco', bg: ['#E6F8EC', '#BFEBD2'], text: '#0F3B24', soft: 'rgba(15,59,36,0.7)', track: 'rgba(15,59,36,0.13)', rings: ['#2A9148', '#D68A00', '#E0503F'], brandColor: '#1D7A3C' },
]

export const DEFAULT_THEME = 'dia'

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

/** Dibuja el sticker de macros (PNG con fondo transparente) y regresa la imagen. `transparency` (0–1) solo afecta el fondo de la tarjeta. */
export async function drawSticker(meal: Meal, theme: StickerTheme = THEMES[0], transparency = 0): Promise<Blob> {
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

  let fill: string | CanvasGradient = theme.bg[0]
  if (theme.bg[1]) {
    fill = ctx.createLinearGradient(0, 0, WIDTH, height)
    fill.addColorStop(0, theme.bg[0])
    fill.addColorStop(1, theme.bg[1])
  }
  ctx.globalAlpha = 1 - Math.min(Math.max(transparency, 0), 0.7)
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.roundRect(0, 0, WIDTH, height, RADIUS)
  ctx.fill()
  ctx.globalAlpha = 1

  ctx.fillStyle = theme.text
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
  ctx.fillStyle = theme.brandColor ?? theme.text
  ctx.fillText(theme.brand ?? 'Avocado', brandX, y + brandH * 0.68)
  y += brandH + 32
  ctx.fillStyle = theme.text

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
    ctx.strokeStyle = theme.track
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()
    const share = total > 0 ? kcals[i] / total : 0
    if (share > 0) {
      ctx.strokeStyle = theme.rings[i]
      ctx.beginPath()
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(share, 0.999))
      ctx.stroke()
    }
    ctx.fillStyle = theme.text
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
  ctx.fillStyle = theme.soft
  ctx.font = `600 28px ${FONT}`
  ctx.fillText(`${formatLongDate(when)} · ${formatTime(meal.eaten_at)}`, PAD, y + 26)

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo crear la imagen'))), 'image/png'))
}

const STORY_W = 1080
const STORY_H = 1920

/** Baja la foto de la comida como imagen. Con `fetch` + blob el canvas nunca queda "tainted"; la API manda CORS en /photos. */
async function loadPhoto(photoUrl: string): Promise<HTMLImageElement | null> {
  try {
    const res = await fetch(photoUrl)
    if (!res.ok) return null
    const objectUrl = URL.createObjectURL(await res.blob())
    const img = await loadImage(objectUrl)
    URL.revokeObjectURL(objectUrl)
    return img
  } catch {
    return null
  }
}

/** Historia de 1080×1920: foto difuminada de fondo, la foto en cuadro arriba y el sticker debajo, sin tapar la comida. */
export async function drawStory(stickerBlob: Blob, photo: HTMLImageElement | null): Promise<Blob> {
  const sticker = await createImageBitmap(stickerBlob)
  const canvas = document.createElement('canvas')
  canvas.width = STORY_W
  canvas.height = STORY_H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#2b3a2d'
  ctx.fillRect(0, 0, STORY_W, STORY_H)

  if (photo) {
    const pw = photo.naturalWidth
    const ph = photo.naturalHeight
    // Fondo: la foto cubre toda la historia, difuminada (con margen extra para que los bordes no queden transparentes)
    const cover = Math.max(STORY_W / pw, STORY_H / ph)
    const bw = pw * cover
    const bh = ph * cover
    const over = 120
    ctx.save()
    ctx.filter = 'blur(40px)'
    ctx.drawImage(photo, (STORY_W - bw) / 2 - over, (STORY_H - bh) / 2 - over, bw + over * 2, bh + over * 2)
    ctx.restore()
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(0, 0, STORY_W, STORY_H)

    // Foto en cuadro, recortada al centro
    const side = Math.min(pw, ph)
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(100, 170, 880, 880, 48)
    ctx.clip()
    ctx.drawImage(photo, (pw - side) / 2, (ph - side) / 2, side, side, 100, 170, 880, 880)
    ctx.restore()
  }

  // Sticker: ajustado a la franja de abajo, centrado y pegado arriba
  const scale = Math.min(880 / sticker.width, 670 / sticker.height)
  const sw = sticker.width * scale
  const sh = sticker.height * scale
  ctx.drawImage(sticker, 100 + (880 - sw) / 2, 1100, sw, sh)
  sticker.close()

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo crear la imagen'))), 'image/png'))
}

const STYLE_KEY = 'avocado.stickerStyle'

/** Último estilo que eligió el usuario. Por defecto, el de día y sólido. */
function loadStyle(): { theme: string; transparency: number } {
  try {
    const saved = JSON.parse(localStorage.getItem(STYLE_KEY) ?? '{}')
    const theme = THEMES.some((t) => t.id === saved.theme) ? saved.theme : DEFAULT_THEME
    const transparency = Number.isFinite(saved.transparency) ? Math.min(Math.max(Math.round(saved.transparency), 0), 70) : 0
    return { theme, transparency }
  } catch {
    return { theme: DEFAULT_THEME, transparency: 0 }
  }
}

/** Sticker de macros para pegar en una historia de Instagram. */
export default function ShareSticker({ meal }: { meal: Meal }) {
  const [blob, setBlob] = useState<Blob | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [photo, setPhoto] = useState<HTMLImageElement | null | undefined>(meal.photo_url ? undefined : null)
  const [storyBlob, setStoryBlob] = useState<Blob | null>(null)
  const [storyUrl, setStoryUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [themeId, setThemeId] = useState(() => loadStyle().theme)
  const [transparency, setTransparency] = useState(() => loadStyle().transparency)
  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0]

  useEffect(() => {
    try {
      localStorage.setItem(STYLE_KEY, JSON.stringify({ theme: themeId, transparency }))
    } catch {
      // Sin almacenamiento: simplemente no se recuerda
    }
  }, [themeId, transparency])

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    setFailed(false)
    drawSticker(meal, theme, transparency / 100)
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
  }, [meal.id, meal.eaten_at, meal.calories, meal.protein_g, meal.carbs_g, meal.fat_g, meal.analysis?.summary, meal.note, themeId, transparency])

  // La foto se baja una vez por comida
  useEffect(() => {
    let cancelled = false
    if (!meal.photo_url) {
      setPhoto(null)
      return
    }
    setPhoto(undefined)
    loadPhoto(meal.photo_url).then((img) => !cancelled && setPhoto(img))
    return () => {
      cancelled = true
    }
  }, [meal.photo_url])

  // La vista previa es la misma historia que se publica
  useEffect(() => {
    if (!blob || photo === undefined) return
    let cancelled = false
    let objectUrl: string | null = null
    drawStory(blob, photo)
      .then((b) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(b)
        setStoryBlob(b)
        setStoryUrl(objectUrl)
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [blob, photo])

  const storyFile = storyBlob ? new File([storyBlob], 'avocado-historia.png', { type: 'image/png' }) : null
  const canShareStory = !!storyFile && !!navigator.canShare?.({ files: [storyFile] })

  async function publishStory() {
    if (!storyFile || !storyUrl) return
    if (canShareStory) {
      try {
        await navigator.share({ files: [storyFile] })
        cheer('love', '¡Lista tu historia!', { interrupt: true })
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setNotice('No se pudo compartir la historia.')
      }
      return
    }
    const a = document.createElement('a')
    a.href = storyUrl
    a.download = 'avocado-historia.png'
    a.click()
    setNotice('Imagen guardada: súbela a tu historia')
    cheer('love', '¡Lista tu historia!', { interrupt: true })
  }

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

  async function savePhotoToDevice() {
    try {
      if (await savePhoto(meal.photo_url)) cheer('love', '¡Foto lista!', { interrupt: true })
    } catch {
      setNotice('No se pudo guardar la foto.')
    }
  }

  return (
    <Card padding="lg">
      <h2 className="av-section-title">Sticker para tu historia</h2>
      <div className="share-sticker__stage">
        {storyUrl ? <img className="share-sticker__img" src={storyUrl} alt="Vista previa de tu historia con la foto y el sticker de proteína, carbohidratos, grasa y calorías" /> : <span className="share-sticker__wait">{failed ? 'No se pudo crear la historia.' : 'Preparando…'}</span>}
      </div>
      <div className="share-sticker__themes" role="radiogroup" aria-label="Estilo del sticker">
        {THEMES.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={t.id === themeId} className="share-sticker__theme" onClick={() => setThemeId(t.id)}>
            <span className="share-sticker__swatch" style={{ background: t.bg[1] ? `linear-gradient(135deg, ${t.bg[0]}, ${t.bg[1]})` : t.bg[0] }} />
            {t.name}
          </button>
        ))}
      </div>
      <label className="share-sticker__slider">
        <span>
          Transparencia <strong>{transparency} %</strong>
        </span>
        <input type="range" min={0} max={70} step={5} value={transparency} onChange={(e) => setTransparency(Number(e.target.value))} />
      </label>
      <div className="share-sticker__actions">
        <Button icon="share" onClick={publishStory} disabled={!storyFile}>
          Publicar en tu historia
        </Button>
        {canShare && (
          <Button variant="secondary" icon="share" onClick={share}>
            Compartir sticker
          </Button>
        )}
        {canCopy && (
          <Button variant="secondary" icon="image" onClick={copy}>
            Copiar sticker
          </Button>
        )}
        {!canShare && !canCopy && url && (
          <a className="share-sticker__download" href={url} download="avocado-sticker.png" onClick={() => cheer('love', '¡Sticker listo!', { interrupt: true })}>
            Descargar sticker (PNG)
          </a>
        )}
        {meal.photo_url && (
          <Button variant="secondary" icon="download" onClick={savePhotoToDevice}>
            Guardar foto
          </Button>
        )}
      </div>
      {notice && <Notice tone="info">{notice}</Notice>}
    </Card>
  )
}
