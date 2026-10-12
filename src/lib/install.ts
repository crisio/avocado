import { useState, useSyncExternalStore } from 'react'

/** Evento de Chrome/Edge (Android y escritorio) que permite mostrar el diálogo de instalación. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Dónde está abierta la app, para dar las instrucciones correctas:
 * - ios-safari: Compartir → Agregar a Inicio.
 * - ios-other: Chrome, Firefox, Edge… en iPhone (también tienen Compartir → Agregar a Inicio).
 * - in-app: navegador dentro de Instagram, Facebook, TikTok, Google…; ahí no se puede instalar.
 * - android / desktop: menú del navegador, o el botón Instalar si el navegador lo ofrece.
 */
export type InstallPlatform = 'ios-safari' | 'ios-other' | 'in-app' | 'android' | 'desktop'

const DISMISS_KEY = 'avocado.install-dismissed'
const DISMISS_DAYS = 14

let deferred: BeforeInstallPromptEvent | null = null
let installed = false
let version = 0
const listeners = new Set<() => void>()

function emit() {
  version++
  listeners.forEach((l) => l())
}

// Se registra al cargar el módulo: el evento puede llegar antes de que se monte cualquier pantalla.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault() // en lugar de la barrita de Chrome, mostramos nuestro botón
  deferred = e as BeforeInstallPromptEvent
  emit()
})
window.addEventListener('appinstalled', () => {
  deferred = null
  installed = true
  emit()
})

/** ¿La app corre instalada (abierta desde el ícono de inicio)? */
export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function detectPlatform(ua = navigator.userAgent): InstallPlatform {
  // iPadOS se presenta como Mac; se distingue por la pantalla táctil.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  if (/FBAN|FBAV|Instagram|Line\/|TikTok|musical_ly|Snapchat|LinkedInApp|GSA\//.test(ua)) return 'in-app'
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|Brave/.test(ua) ? 'ios-other' : 'ios-safari'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

function readDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY))
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000
  } catch {
    return false
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Estado de instalación de la PWA y acciones para instalarla o posponer el aviso. */
export function useInstall() {
  useSyncExternalStore(subscribe, () => version)
  const [standalone] = useState(isStandalone)
  const [platform] = useState(() => detectPlatform())
  const [dismissed, setDismissed] = useState(readDismissed)

  return {
    /** Ya está instalada (o se acaba de instalar): no hay nada que mostrar. */
    installed: standalone || installed,
    platform,
    /** El navegador ofrece su propio diálogo de instalación (Chrome/Edge). */
    canPrompt: deferred !== null,
    dismissed,
    async prompt() {
      const event = deferred
      if (!event) return
      deferred = null
      await event.prompt()
      const { outcome } = await event.userChoice
      if (outcome === 'accepted') installed = true
      emit()
    },
    dismiss() {
      try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()))
      } catch {
        // sin almacenamiento (navegación privada): se oculta solo en esta visita
      }
      setDismissed(true)
    },
  }
}
