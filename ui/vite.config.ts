import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// Compila el kit como librería ES: ui/dist/index.js (React queda externo).
export default defineConfig({
  root: here('.'),
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: here('./dist'),
    emptyOutDir: true,
    lib: {
      entry: here('./src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
    },
  },
})
