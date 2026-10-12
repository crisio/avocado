import { PageHeader, Screen } from '@avocado/ui'
import { useAuth } from '../auth'
import { Mascot } from '../components/Mascot'
import WeekView, { weekDayHref } from '../components/WeekView'

/** Resumen semanal del paciente. */
export default function Week() {
  const { user } = useAuth()
  if (!user) return null
  return (
    <Screen withTabBar>
      <PageHeader eyebrow="Resumen" title="Tu semana" action={<Mascot size={80} reactive interactive />} />
      <WeekView userId={user.id} self dayHref={weekDayHref('/')} />
    </Screen>
  )
}
