import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import { isConfigured } from './lib/supabase'
import Layout from './components/Layout'
import Login from './pages/Login'
import NewPassword from './pages/NewPassword'
import Today from './pages/Today'
import AddMeal from './pages/AddMeal'
import MealDetail from './pages/MealDetail'
import Patients from './pages/Patients'
import PatientDay from './pages/PatientDay'
import Settings from './pages/Settings'

export default function App() {
  const { session, profile, loading, recovering } = useAuth()

  if (!isConfigured) return <SetupNeeded />
  if (loading) return <div className="center muted">Cargando…</div>
  if (recovering) return <NewPassword />
  if (!session) return <Login />
  if (!profile) return <div className="center muted">No encontramos tu perfil. Revisa que la migración de la base de datos esté aplicada.</div>

  return (
    <Routes>
      <Route element={<Layout role={profile.role} />}>
        {profile.role === 'nutritionist' ? (
          <>
            <Route index element={<Patients />} />
            <Route path="paciente/:id" element={<PatientDay />} />
          </>
        ) : (
          <>
            <Route index element={<Today />} />
            <Route path="nueva" element={<AddMeal />} />
          </>
        )}
        <Route path="comida/:id" element={<MealDetail />} />
        <Route path="ajustes" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

function SetupNeeded() {
  return (
    <div className="center stack">
      <h1>Falta configurar Supabase</h1>
      <p className="muted">
        Define <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_KEY</code> en <code>.env.local</code> (local) o como
        variables del repositorio en GitHub (producción). Revisa el README.
      </p>
    </div>
  )
}
