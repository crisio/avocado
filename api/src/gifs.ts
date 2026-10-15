import type { Env } from './env'

// GIF de reacción de GIPHY (https://developers.giphy.com) para lo que dice Avo. La IA elige la búsqueda y aquí se
// toma uno de los primeros resultados. Sin GIPHY_API_KEY, o si GIPHY falla, Avo contesta igual sin GIF.

export interface Gif {
  id: string
  /** WebP animado (mucho más ligero que el .gif): se muestra como imagen, sin reproductor de video. */
  webp: string
  /** El mismo GIF en MP4, por si algún cliente lo prefiere. */
  mp4: string
  /** Primer cuadro (imagen fija) para quien prefiere menos movimiento y mientras carga. */
  still: string
  width: number
  height: number
  title: string
}

interface GiphyImage {
  url?: string
  webp?: string
  mp4?: string
  width?: string
  height?: string
}
interface GiphyItem {
  id: string
  title?: string
  images?: { fixed_height?: GiphyImage; fixed_height_still?: GiphyImage }
}

export async function findGif(env: Env, query: unknown): Promise<Gif | null> {
  const q = typeof query === 'string' ? query.trim().slice(0, 50) : ''
  if (!q || !env.GIPHY_API_KEY) return null
  const url = new URL('https://api.giphy.com/v1/gifs/search')
  url.search = new URLSearchParams({ api_key: env.GIPHY_API_KEY, q, limit: '10', rating: 'pg', lang: 'en' }).toString()
  try {
    // La misma búsqueda se responde del caché un día: la clave de GIPHY tiene límite de llamadas por hora.
    const res = await fetch(url, { cf: { cacheTtl: 86_400, cacheEverything: true }, signal: AbortSignal.timeout(4000) })
    if (!res.ok) throw new Error(`GIPHY ${res.status}`)
    const { data } = await res.json<{ data?: GiphyItem[] }>()
    const usable = (data ?? []).filter((g) => g.images?.fixed_height?.webp && g.images.fixed_height_still?.url)
    if (!usable.length) return null
    // Uno de los primeros cinco, para que el mismo meme no salga siempre con el mismo GIF.
    const g = usable[Math.floor(Math.random() * Math.min(5, usable.length))]
    const video = g.images!.fixed_height!
    return {
      id: g.id,
      webp: video.webp!,
      mp4: video.mp4 ?? '',
      still: g.images!.fixed_height_still!.url!,
      width: Number(video.width) || 200,
      height: Number(video.height) || 200,
      title: String(g.title ?? '').slice(0, 120),
    }
  } catch (err) {
    console.error('gif', err instanceof Error ? err.message : err)
    return null
  }
}

/** La búsqueda de GIF ("gif") que eligió la IA dentro de su respuesta JSON. */
export function gifQueryOf(text: string): string {
  try {
    const raw = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as { gif?: unknown }
    return typeof raw.gif === 'string' ? raw.gif : ''
  } catch {
    return ''
  }
}

/** Un GIF guardado como JSON en la base (null si no hay o está dañado). */
export function parseGif(raw: string | null | undefined): Gif | null {
  if (!raw) return null
  try {
    const g = JSON.parse(raw) as Gif
    return g && typeof g.webp === 'string' && typeof g.still === 'string' ? g : null
  } catch {
    return null
  }
}
