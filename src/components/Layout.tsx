import { NavLink, Outlet } from 'react-router-dom'
import type { Role } from '../lib/types'

export default function Layout({ role }: { role: Role }) {
  return (
    <div className="app">
      <main className="content">
        <Outlet />
      </main>
      <nav className="tabbar">
        <NavLink to="/" end>
          <span aria-hidden>{role === 'nutritionist' ? '👥' : '🍽️'}</span>
          {role === 'nutritionist' ? 'Pacientes' : 'Mi día'}
        </NavLink>
        {role === 'patient' && (
          <NavLink to="/nueva" className="tabbar-add">
            <span aria-hidden>📷</span>
            Registrar
          </NavLink>
        )}
        <NavLink to="/ajustes">
          <span aria-hidden>⚙️</span>
          Ajustes
        </NavLink>
      </nav>
    </div>
  )
}
