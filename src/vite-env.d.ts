/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Versión de la app (package.json), la misma de la API y de iOS. */
declare const __APP_VERSION__: string
