import { Navigate, Route, Routes } from 'react-router-dom'
import { EmptyState, Screen } from '@avocado/ui'
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

  if (!isConfigured)
    return (
      <Screen narrow>
        <EmptyState title="Falta conectar la API" description="Define VITE_API_URL en .env.local (local) o como variable del repositorio en GitHub. Revisa el README." />
      </Screen>
    )
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
