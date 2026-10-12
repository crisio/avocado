import { Button, EmptyState } from '@avocado/ui'

export const NoMeals = () => (
  <div style={{ width: 360 }}>
    <EmptyState
      icon="camera"
      title="Sin comidas registradas"
      description="Toma una foto de lo que comes y Avocado calcula las calorías por ti."
      action={<Button icon="plus">Registrar comida</Button>}
    />
  </div>
)

export const NoPatients = () => (
  <div style={{ width: 360 }}>
    <EmptyState icon="users" title="Aún no tienes pacientes" description="Comparte tu código AV-4821 para que se vinculen contigo." />
  </div>
)

export const TitleOnly = () => (
  <div style={{ width: 360 }}>
    <EmptyState title="Sin comentarios todavía" />
  </div>
)
