// Sync-only wrapper: the app sets class="av-root" on <body> (index.html); previews and designs need the same root
// for the body font (Hanken Grotesk), ink color, ground background and box-sizing.
import { createElement } from 'react'

export function AvocadoRoot({ children, style }) {
  return createElement('div', { className: 'av-root', style: { padding: 16, ...style } }, children)
}
