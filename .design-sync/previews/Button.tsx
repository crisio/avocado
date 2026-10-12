import { Button } from '@avocado/ui'

export const Variants = () => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
    <Button variant="primary">Guardar</Button>
    <Button variant="secondary">Cancelar</Button>
    <Button variant="ghost">Ver detalle</Button>
    <Button variant="danger" icon="trash">Borrar comida</Button>
  </div>
)

export const WithIcon = () => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
    <Button icon="camera">Registrar comida</Button>
    <Button variant="secondary" icon="refresh">Volver a analizar</Button>
  </div>
)

export const PrimaryLarge = () => (
  <div style={{ width: 340 }}>
    <Button size="lg" fullWidth icon="plus">Registrar comida</Button>
  </div>
)

export const States = () => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
    <Button loading>Enviando código</Button>
    <Button disabled>Continuar</Button>
  </div>
)
