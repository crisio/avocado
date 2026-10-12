import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/hanken-grotesk'
import '@avocado/ui/styles.css'
import { AuthProvider } from './auth'
import App from './App'
import { startOutbox } from './lib/outbox'
import './styles.css'

startOutbox()
// Pide al navegador no borrar las fotos guardadas sin conexión cuando falte espacio.
navigator.storage?.persist?.().catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
