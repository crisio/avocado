import { Link } from 'react-router-dom'
import { EmptyState, Icon, PageHeader, PersonRow, Screen } from '@avocado/ui'
import { useAuth } from '../auth'
import { useCachedApi } from '../lib/useCachedApi'
import { displayName, firstName } from '../lib/format'
import type { Person } from '../lib/types'

export default function Patients() {
  const { user } = useAuth()
  const patients = useCachedApi<Person[]>('/care/patients', 60_000).data ?? null
  const name = firstName(user?.full_name)

  return (
    <Screen withTabBar>
      <PageHeader eyebrow={name ? `Hola, ${name}` : undefined} title="Pacientes" />
      {patients === null ? (
        <p className="av-text-muted">Cargando…</p>
      ) : patients.length === 0 ? (
        <EmptyState
          icon="users"
          title="Aún no tienes pacientes"
          description={
            <>
              Pide a tus pacientes que entren a <strong>Perfil → Mi nutrióloga</strong> y escriban tu correo: <strong>{user?.email}</strong>
            </>
          }
        />
      ) : (
        <ul className="app-stack">
          {patients.map((p) => (
            <li key={p.id}>
              <PersonRow as={Link} to={`/paciente/${p.id}`} name={displayName(p)} detail={p.email} trailing={<Icon name="chevron-right" style={{ color: 'var(--av-muted)' }} />} />
            </li>
          ))}
        </ul>
      )}
    </Screen>
  )
}
