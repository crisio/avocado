import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import DayView from '../components/DayView'
import { supabase } from '../lib/supabase'
import { displayName } from '../lib/format'
import type { Profile } from '../lib/types'

export default function PatientDay() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [patient, setPatient] = useState<Profile | null>(null)

  useEffect(() => {
    if (!id) return
    supabase.from('profiles').select('id, email, full_name, role').eq('id', id).maybeSingle().then(({ data }) => setPatient(data))
  }, [id])

  if (!id) return null

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
