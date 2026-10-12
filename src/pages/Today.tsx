import { Screen, PageHeader } from '@avocado/ui'
import { useAuth } from '../auth'
import DayView from '../components/DayView'
import { firstName, formatLongDate } from '../lib/format'

export default function Today() {
  const { user } = useAuth()
  if (!user) return null
  const name = firstName(user.full_name)

  return (
    <Screen withTabBar>
      <PageHeader eyebrow={formatLongDate(new Date())} title={name ? `Hola, ${name}` : 'Hola'} />
      <DayView userId={user.id} />
    </Screen>
  )
}
