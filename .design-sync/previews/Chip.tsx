import { Chip } from '@avocado/ui'

export const Tones = () => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
    <Chip>Desayuno</Chip>
    <Chip tone="accent" icon="check">Analizada</Chip>
    <Chip tone="warning" icon="clock">Analizando…</Chip>
    <Chip tone="danger" icon="alert">No se pudo analizar</Chip>
  </div>
)

export const Data = () => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
    <Chip><strong>82 g</strong> proteína</Chip>
    <Chip icon="calendar">Viernes 9 de octubre</Chip>
    <Chip tone="accent" icon="chat">2 comentarios</Chip>
  </div>
)
