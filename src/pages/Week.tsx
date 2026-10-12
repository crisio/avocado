import { PageHeader, Screen } from '@avocado/ui'
import { useAuth } from '../auth'
import WeekView, { weekDayHref } from '../components/WeekView'

/** Resumen semanal del paciente. */
export default function Week() {
  const { user } = useAuth()
  if (!user) return null
  return (
    <Screen withTabBar>
      <PageHeader eyebrow="Resumen" title="Tu semana" />
      <WeekView userId={user.id} self dayHref={weekDayHref('/')} />
    </Screen>
  )
}
