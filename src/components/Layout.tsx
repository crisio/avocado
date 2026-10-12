import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Button, TabBar, TabBarItem } from '@avocado/ui'
import type { Role } from '../lib/types'

export default function Layout({ role }: { role: Role }) {
  const { pathname } = useLocation()
  // La acción "Registrar comida" solo en la pantalla principal del paciente.
  const showAction = role === 'patient' && pathname === '/'

  return (
    <>
      <Outlet />
      <TabBar
        action={
          showAction ? (
            <Button as={Link} to="/nueva" icon="camera" size="lg" fullWidth>
              Registrar comida
            </Button>
          ) : undefined
        }
      >
        <TabBarItem as={NavLink} to="/" end icon={role === 'nutritionist' ? 'users' : 'home'} label={role === 'nutritionist' ? 'Pacientes' : 'Mi día'} />
        <TabBarItem as={NavLink} to="/ajustes" icon="user" label="Perfil" />
      </TabBar>
    </>
  )
}
