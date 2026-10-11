import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import DayView from '../components/DayView'

export default function Today() {
  const { session, profile } = useAuth()

  return (
    <div className="stack">
      <header className="page-header">
        <h1>Hola{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}</h1>
        <Link to="/nueva" className="button primary">
          + Comida
        </Link>
      </header>
      {session && <DayView userId={session.user.id} />}
    </div>
  )
}
