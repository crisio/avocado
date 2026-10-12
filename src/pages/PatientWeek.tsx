import { useNavigate, useParams } from 'react-router-dom'
import { IconButton, PageHeader, Screen } from '@avocado/ui'
import WeekView, { weekDayHref } from '../components/WeekView'
import { useCachedApi } from '../lib/useCachedApi'
import { displayName } from '../lib/format'
import type { User } from '../lib/types'

/** Resumen semanal de un paciente, para su nutrióloga. */
export default function PatientWeek() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const patient = useCachedApi<User>(`/users/${id}`, 300_000).data ?? null

  return (
    <Screen withTabBar>
      <div>
        <IconButton icon="chevron-left" label="Volver al día del paciente" plain onClick={() => navigate(`/paciente/${id}`)} />
      </div>
      <PageHeader eyebrow={`Semana de ${displayName(patient)}`} title="Resumen semanal" compact />
      <WeekView userId={id} self={false} dayHref={weekDayHref(`/paciente/${id}`)} />
    </Screen>
  )
}
