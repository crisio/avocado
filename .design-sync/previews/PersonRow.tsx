import { Button, Icon, PersonRow } from '@avocado/ui'

export const Patient = () => (
  <div style={{ width: 360 }}>
    <PersonRow name="María Fernanda López" detail="Última comida: hoy, 2:40 p.m." href="#" trailing={<Icon name="chevron-right" style={{ color: 'var(--av-muted)' }} />} />
  </div>
)

export const WithAction = () => (
  <div style={{ width: 360 }}>
    <PersonRow name="Lic. Daniela Ruiz" detail="daniela@nutricion.mx" trailing={<Button variant="ghost">Quitar</Button>} />
  </div>
)

export const List = () => (
  <div style={{ width: 360, display: 'grid', gap: 8 }}>
    <PersonRow name="Carlos Mejía" detail="3 comidas hoy" />
    <PersonRow name="Ana Sofía Pérez" detail="Sin comidas hoy" />
    <PersonRow name="Jorge Castillo" detail="1 comida hoy" />
  </div>
)
