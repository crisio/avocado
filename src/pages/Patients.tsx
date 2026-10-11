import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { supabase } from '../lib/supabase'
import { displayName } from '../lib/format'
import type { Profile } from '../lib/types'

type Patient = Pick<Profile, 'id' | 'email' | 'full_name'>

export default function Patients() {
  const { session, profile } = useAuth()
  const [patients, setPatients] = useState<Patient[] | null>(null)

  useEffect(() => {
    if (!session) return
    supabase
      .from('care_links')
      .select('patient:profiles!care_links_patient_id_fkey(id, email, full_name)')
      .eq('nutritionist_id', session.user.id)
      .then(({ data }) => {
        const list = (data ?? []).map((row) => row.patient as unknown as Patient).filter(Boolean)
        setPatients(list.sort((a, b) => displayName(a).localeCompare(displayName(b))))
      })
  }, [session])

  return (
    <div className="stack">
      <h1>Pacientes</h1>
      {patients === null ? (
        <p className="muted center">Cargando…</p>
      ) : patients.length === 0 ? (
        <div className="card stack">
          <p>Aún no tienes pacientes vinculados.</p>
          <p className="muted">
            Pide a tus pacientes que entren a <strong>Ajustes → Vincular nutrióloga</strong> y escriban tu correo:{' '}
            <strong>{profile?.email}</strong>
          </p>
        </div>
      ) : (
        <ul className="patient-list">
          {patients.map((p) => (
            <li key={p.id}>
              <Link to={`/paciente/${p.id}`} className="card row-link">
                <strong>{displayName(p)}</strong>
                <span className="muted small">{p.email}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
