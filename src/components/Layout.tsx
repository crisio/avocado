import { Suspense, useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Button, TabBar, TabBarItem } from '@avocado/ui'
import type { Role } from '../lib/types'
import ConnectionBanner from './ConnectionBanner'

export default function Layout({ role }: { role: Role }) {
  const { pathname } = useLocation()
  // Cada pantalla nueva empieza arriba (si no, se hereda el scroll de la anterior)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  // La acción "Registrar comida" solo en la pantalla principal del paciente.
  const showAction = role === 'patient' && pathname === '/'

  return (
    <>
      <div className="app-banner">
        <ConnectionBanner />
      </div>
      {/* La barra inferior se queda mientras carga la pantalla */}
      <Suspense>
        <Outlet />
      </Suspense>
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
        {role === 'patient' && <TabBarItem as={NavLink} to="/semana" icon="calendar" label="Semana" />}
        <TabBarItem as={NavLink} to="/ajustes" icon="user" label="Perfil" />
      </TabBar>
    </>
  )
}
