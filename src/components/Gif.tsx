import type { Gif as GifData } from '../lib/types'

/**
 * Un GIF de GIPHY como WebP animado en un <img> (el video no se reproduce solo en iOS con ahorro de batería).
 * Con "reducir movimiento" se muestra el primer cuadro. GIPHY pide dar crédito, de ahí "vía GIPHY".
 */
export default function Gif({ gif }: { gif: GifData }) {
  return (
    <figure className="gif">
      <picture>
        <source media="(prefers-reduced-motion: reduce)" srcSet={gif.still} />
        <img className="gif__img" src={gif.webp} width={gif.width} height={gif.height} loading="lazy" alt={gif.title || 'GIF'} />
      </picture>
      <figcaption className="gif__credit">vía GIPHY</figcaption>
    </figure>
  )
}
