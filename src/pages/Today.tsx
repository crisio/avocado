import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import DayView from '../components/DayView'

export default function Today() {
  const { user } = useAuth()
  if (!user) return null

  return (
    <div className="stack">
      <header className="page-header">
        <h1>Hola{user.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}</h1>
        <Link to="/nueva" className="button primary">
          + Comida
        </Link>
      </header>
      <DayView userId={user.id} />
    </div>
  )
}
