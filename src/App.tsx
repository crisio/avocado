import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import { isConfigured } from './lib/api'
import Layout from './components/Layout'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Today from './pages/Today'
import AddMeal from './pages/AddMeal'
import MealDetail from './pages/MealDetail'
import Patients from './pages/Patients'
import PatientDay from './pages/PatientDay'
import Settings from './pages/Settings'

export default function App() {
  const { user } = useAuth()

  if (!isConfigured) return <SetupNeeded />
  if (!user) return <Login />
  if (!user.role) return <Onboarding />

  return (
    <Routes>
      <Route element={<Layout role={user.role} />}>
        {user.role === 'nutritionist' ? (
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
      <h1>Falta conectar la API</h1>
      <p className="muted">
        Define <code>VITE_API_URL</code> en <code>.env.local</code> (local) o como variable del repositorio en GitHub
        (producción). Revisa el README.
      </p>
    </div>
  )
}
