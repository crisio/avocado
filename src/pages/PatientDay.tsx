import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, PageHeader, Screen } from '@avocado/ui'
import DayView from '../components/DayView'
import TopBar from '../components/TopBar'
import { useCachedApi } from '../lib/useCachedApi'
import { displayName } from '../lib/format'
import type { User } from '../lib/types'

export default function PatientDay() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const patient = useCachedApi<User>(`/users/${id}`, 300_000).data ?? null

  return (
    <Screen withTabBar>
      <TopBar onBack={() => navigate('/')} backLabel="Volver a pacientes" />
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
      <DayView userId={id} />
    </Screen>
  )
}
