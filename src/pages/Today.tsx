import { useSearchParams } from 'react-router-dom'
import { Screen, PageHeader } from '@avocado/ui'
import { useAuth } from '../auth'
import DayView from '../components/DayView'
import InstallCard from '../components/InstallCard'
import { firstName, formatLongDate, fromDayParam } from '../lib/format'

export default function Today() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  if (!user) return null
  const name = firstName(user.full_name)

  return (
    <Screen withTabBar>
      <PageHeader eyebrow={formatLongDate(new Date())} title={name ? `Hola, ${name}` : 'Hola'} />
      <InstallCard dismissible mobileOnly />
      <DayView userId={user.id} initialDay={fromDayParam(params.get('dia'))} />
    </Screen>
  )
}
