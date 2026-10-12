import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { IconButton, PageHeader, Screen } from '@avocado/ui'
import DayView from '../components/DayView'
import { api } from '../lib/api'
import { displayName } from '../lib/format'
import type { User } from '../lib/types'

export default function PatientDay() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [patient, setPatient] = useState<User | null>(null)

  useEffect(() => {
    api<User>(`/users/${id}`).then(setPatient, () => setPatient(null))
  }, [id])

  return (
    <Screen withTabBar>
      <div>
        <IconButton icon="chevron-left" label="Volver a pacientes" plain onClick={() => navigate('/')} />
      </div>
      <PageHeader eyebrow="Paciente" title={displayName(patient)} compact />
      <DayView userId={id} />
    </Screen>
  )
}
