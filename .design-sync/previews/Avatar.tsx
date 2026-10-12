import { Avatar } from '@avocado/ui'

export const Tones = () => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
    <Avatar name="Lic. Daniela Ruiz" tone="accent" />
    <Avatar name="María Fernanda López" tone="soft" />
  </div>
)

export const Sizes = () => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
    <Avatar name="Carlos Mejía" size={32} />
    <Avatar name="Carlos Mejía" size={40} />
    <Avatar name="Carlos Mejía" size={56} />
    <Avatar name="Carlos Mejía" size={72} tone="soft" />
  </div>
)
