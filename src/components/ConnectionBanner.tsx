import { Notice } from '@avocado/ui'
import { useOnline } from '../lib/useOnline'
import { useOutbox } from '../lib/outbox'

/** Aviso arriba de cada pantalla: sin conexión, o cuántas cosas quedan por enviar. */
export default function ConnectionBanner() {
  const online = useOnline()
  const { jobs, sending } = useOutbox()
  const meals = jobs.filter((j) => j.kind === 'meal' && !j.error).length
  const pending = jobs.filter((j) => !j.error).length

  if (!online)
    return (
      <Notice tone="warning">
        Sin conexión. Puedes seguir registrando comidas
        {meals > 0 ? ` (${meals} ${meals === 1 ? 'guardada' : 'guardadas'} en el teléfono)` : ''}; se analizan solas al volver la señal.
      </Notice>
    )
  if (pending > 0 && sending)
    return <Notice>Enviando {pending === 1 ? '1 pendiente' : `${pending} pendientes`}…</Notice>
  return null
}
