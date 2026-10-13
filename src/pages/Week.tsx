import { PageHeader, Screen } from '@avocado/ui'
import { useAuth } from '../auth'
import { useStreak } from '../lib/streak'
import { Mascot } from '../components/Mascot'
import { StreakCard } from '../components/Streak'
import WeekView, { weekDayHref } from '../components/WeekView'

/** Resumen semanal del paciente. */
export default function Week() {
  const { user } = useAuth()
  const { streak } = useStreak(user?.id)
  if (!user) return null
  return (
    <Screen withTabBar>
      <PageHeader eyebrow="Resumen" title="Tu semana" action={<Mascot size={80} reactive interactive />} />
      {streak && <StreakCard streak={streak} />}
      <WeekView userId={user.id} self dayHref={weekDayHref('/')} />
    </Screen>
  )
}
