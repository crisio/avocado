import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { api } from '../lib/api'
import { usePoll } from '../lib/usePoll'
import { displayName } from '../lib/format'
import type { Person } from '../lib/types'

export default function Patients() {
  const { user } = useAuth()
  const [patients, setPatients] = useState<Person[] | null>(null)

  usePoll(() => api<Person[]>('/care/patients').then(setPatients, () => {}), 60_000, 'patients')

  return (
    <div className="stack">
      <h1>Pacientes</h1>
      {patients === null ? (
        <p className="muted center">Cargando…</p>
      ) : patients.length === 0 ? (
        <div className="card stack">
          <p>Aún no tienes pacientes vinculados.</p>
          <p className="muted">
            Pide a tus pacientes que entren a <strong>Ajustes → Mi nutrióloga</strong> y escriban tu correo:{' '}
            <strong>{user?.email}</strong>
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
