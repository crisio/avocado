import { IconButton } from '@avocado/ui'

export const Default = () => (
  <div style={{ display: 'flex', gap: 12 }}>
    <IconButton icon="chevron-left" label="Día anterior" />
    <IconButton icon="chevron-right" label="Día siguiente" />
    <IconButton icon="trash" label="Borrar comida" />
  </div>
)

export const Plain = () => (
  <div style={{ display: 'flex', gap: 12 }}>
    <IconButton plain icon="refresh" label="Actualizar" />
    <IconButton plain icon="logout" label="Cerrar sesión" />
  </div>
)

export const Disabled = () => <IconButton icon="chevron-right" label="Día siguiente" disabled />
