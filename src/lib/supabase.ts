import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_KEY

export const isConfigured = Boolean(url && key)

export const supabase = createClient(url || 'http://localhost', key || 'missing-key', {
  auth: {
    // Implicit: el enlace del correo funciona aunque se abra en otro navegador (p. ej. desde la app de Gmail).
    flowType: 'implicit',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export const PHOTO_BUCKET = 'meal-photos'

/** URL absoluta de una ruta de la app (para los enlaces de los correos de Supabase). */
export function appUrl(path = '') {
  return new URL(import.meta.env.BASE_URL + path, window.location.origin).toString()
}
