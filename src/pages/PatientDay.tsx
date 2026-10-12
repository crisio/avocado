import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, IconButton, PageHeader, Screen } from '@avocado/ui'
import DayView from '../components/DayView'
import { useCachedApi } from '../lib/useCachedApi'
import { displayName, fromDayParam } from '../lib/format'
import type { User } from '../lib/types'

export default function PatientDay() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const patient = useCachedApi<User>(`/users/${id}`, 300_000).data ?? null

  return (
    <Screen withTabBar>
      <div>
        <IconButton icon="chevron-left" label="Volver a pacientes" plain onClick={() => navigate('/')} />
      </div>
      <PageHeader
        eyebrow="Paciente"
        title={displayName(patient)}
        compact
      />
      <div>
        <Button as={Link} to={`/paciente/${id}/semana`} variant="secondary" icon="calendar">
          Ver su semana
        </Button>
      </div>
      <DayView userId={id} initialDay={fromDayParam(params.get('dia'))} />
    </Screen>
  )
}
