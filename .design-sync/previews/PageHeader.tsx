import { Button, IconButton, PageHeader } from '@avocado/ui'

export const MyDay = () => (
  <div style={{ width: 380 }}>
    <PageHeader eyebrow="Domingo 11 de octubre" title="Mi día" action={<IconButton icon="calendar" label="Elegir día" />} />
  </div>
)

export const WithButton = () => (
  <div style={{ width: 380 }}>
    <PageHeader title="Pacientes" action={<Button variant="secondary" icon="plus">Invitar</Button>} />
  </div>
)

export const Compact = () => (
  <div style={{ width: 380 }}>
    <PageHeader compact eyebrow="8:15 a.m. · Desayuno" title="Huevos con aguacate y pan" />
  </div>
)
