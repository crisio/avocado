import { PlateIllustration } from '@avocado/ui'

export const Kinds = () => (
  <div style={{ display: 'flex', gap: 12, padding: 12, background: 'var(--av-surface-sunken)', borderRadius: 16 }}>
    <PlateIllustration kind="breakfast" />
    <PlateIllustration kind="lunch" />
    <PlateIllustration kind="dinner" />
    <PlateIllustration kind="snack" />
    <PlateIllustration />
  </div>
)

export const Sizes = () => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, background: 'var(--av-tint-dinner)', borderRadius: 16 }}>
    <PlateIllustration kind="dinner" size={40} />
    <PlateIllustration kind="dinner" size={76} />
    <PlateIllustration kind="dinner" size={120} />
  </div>
)
