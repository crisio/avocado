import { Logo } from '@avocado/ui'

export const Mark = () => (
  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
    <Logo size={40} />
    <Logo size={72} />
  </div>
)

export const WithWordmark = () => <Logo size={56} withWordmark />
