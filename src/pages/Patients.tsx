import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, Icon, PageHeader, PersonRow, Screen } from '@avocado/ui'
import { useAuth } from '../auth'
import InstallCard from '../components/InstallCard'
import { Mascot } from '../components/Mascot'
import { cheer, greetOnce, greeting, isNight } from '../lib/mascot'
import { useCachedApi } from '../lib/useCachedApi'
import { displayName, firstName } from '../lib/format'
import type { Person } from '../lib/types'

export default function Patients() {
  const { user } = useAuth()
  const patients = useCachedApi<Person[]>('/care/patients', 60_000).data ?? null
  const name = firstName(user?.full_name)

  useEffect(() => {
    const t = setTimeout(
      () =>
        greetOnce('patients', () => {
          const { mood, message } = greeting(name)
          cheer(mood, message)
        }),
      500,
    )
    return () => clearTimeout(t)
  }, [])

  return (
    <Screen withTabBar>
      <PageHeader
        eyebrow={name ? `Hola, ${name}` : undefined}
        title="Pacientes"
        action={<Mascot size={84} base={isNight() ? 'sleepy' : 'idle'} reactive interactive />}
      />
      <InstallCard dismissible mobileOnly />
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
