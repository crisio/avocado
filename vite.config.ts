import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// La app se publica en la raíz de https://avocadoapp.cristopherpineda.com
const base = '/'

export default defineConfig({
  base,
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
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
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
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
