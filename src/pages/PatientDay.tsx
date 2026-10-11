import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
    <div className="stack">
      <button className="link back" onClick={() => navigate('/')}>
        ‹ Pacientes
      </button>
      <h1>{displayName(patient)}</h1>
      <DayView userId={id} />
    </div>
  )
}
