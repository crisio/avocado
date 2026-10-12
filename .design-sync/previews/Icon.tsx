import { Icon } from '@avocado/ui'

const names = ['camera', 'image', 'home', 'user', 'users', 'chevron-left', 'chevron-right', 'calendar', 'chat', 'trash', 'plus', 'refresh', 'logout', 'check', 'mail', 'clock', 'alert', 'send'] as const

export const AllIcons = () => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 72px)', gap: 12 }}>
    {names.map((n) => (
      <div key={n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--av-muted)' }}>
        <Icon name={n} size={24} style={{ color: 'var(--av-ink)' }} />
        {n}
      </div>
    ))}
  </div>
)

export const ColorAndSize = () => (
  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
    <Icon name="check" size={16} style={{ color: 'var(--av-accent)' }} />
    <Icon name="camera" size={24} style={{ color: 'var(--av-accent)' }} />
    <Icon name="alert" size={32} style={{ color: 'var(--av-danger)' }} />
    <Icon name="clock" size={40} style={{ color: 'var(--av-warning-ink)' }} />
  </div>
)
