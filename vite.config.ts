import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// La app se publica en la raíz de https://avocadoapp.cristopherpineda.com
const base = '/'

// La versión de package.json (la misma de la API y de la app de iOS; ver CHANGELOG.md), para mostrarla en Perfil.
const version: string = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: {
    alias: {
      // La app usa el kit directo desde su código fuente (ui/src); ui/dist es solo para Claude Design.
      '@avocado/ui/styles.css': fileURLToPath(new URL('./ui/src/styles.css', import.meta.url)),
      '@avocado/ui': fileURLToPath(new URL('./ui/src/index.ts', import.meta.url)),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon-32x32.png', 'favicon.svg', 'apple-touch-icon.png', 'apple-touch-icon-precomposed.png', 'icon-180-v4.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Abrir la app sin internet: cualquier ruta sirve index.html del precache.
        navigateFallback: 'index.html',
        // Menos la política de privacidad, que es una página aparte (la App Store pide un enlace que abra).
        navigateFallbackDenylist: [/^\/privacidad/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Fotos de las comidas (API /photos/...). La firma (?exp=&sig=) cambia cada hora, así que se
            // guardan ignorando la query: ya vistas, se muestran al instante y sin conexión.
            urlPattern: ({ url }) => url.pathname.startsWith('/photos/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'meal-photos',
              matchOptions: { ignoreSearch: true },
              expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true },
              // 0 = respuesta opaca (<img> a otro dominio sin CORS)
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'Avocado',
        short_name: 'Avocado',
        description: 'Registra tus comidas con fotos y comparte tu progreso con tu nutrióloga.',
        lang: 'es',
        theme_color: '#f5f7f2',
        background_color: '#f5f7f2',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        // Solo PNG opacos: iOS reciente lee estos íconos y, si no le sirve ninguno, pone la inicial del nombre.
        // Al mantener presionado el ícono (Android y escritorio): atajos como los del widget de iOS.
        shortcuts: [
          { name: 'Registrar comida', short_name: 'Registrar', url: '/nueva', icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Hablar con Avo', short_name: 'Avo', url: '/avo', icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }] },
        ],
        icons: [
          { src: 'icon-180-v4.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
