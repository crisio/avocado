import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader, Screen } from '@avocado/ui'
import { StreakCard } from '../components/Streak'
import WeekBudget from '../components/WeekBudget'
import TopBar from '../components/TopBar'
import WeekView, { weekDayHref } from '../components/WeekView'
import { useCachedApi } from '../lib/useCachedApi'
import { displayName } from '../lib/format'
import { useStreak } from '../lib/streak'
import type { User } from '../lib/types'

/** Resumen semanal de un paciente, para su nutrióloga. */
export default function PatientWeek() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const patient = useCachedApi<User>(`/users/${id}`, 300_000).data ?? null
  const { streak } = useStreak(id)

  return (
    <Screen withTabBar>
      <TopBar onBack={() => navigate(`/paciente/${id}`)} backLabel="Volver al día del paciente" />
      <PageHeader eyebrow={`Semana de ${displayName(patient)}`} title="Resumen semanal" compact />
      {streak && <StreakCard streak={streak} self={false} />}
      <WeekBudget userId={id} self={false} />
      <WeekView userId={id} self={false} dayHref={weekDayHref(`/paciente/${id}`)} />
    </Screen>
  )
}
