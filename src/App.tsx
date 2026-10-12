import { Navigate, Route, Routes } from 'react-router-dom'
import { EmptyState, Screen } from '@avocado/ui'
import { useAuth } from './auth'
import { isConfigured } from './lib/api'
import { lazy, Suspense } from 'react'
import Layout from './components/Layout'
import Today from './pages/Today'

// La pantalla principal del paciente va en el bundle inicial; el resto se carga aparte (y queda en el
// precache del service worker, así que también abre sin internet).
const Login = lazy(() => import('./pages/Login'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const AddMeal = lazy(() => import('./pages/AddMeal'))
const MealDetail = lazy(() => import('./pages/MealDetail'))
const Patients = lazy(() => import('./pages/Patients'))
const PatientDay = lazy(() => import('./pages/PatientDay'))
const PatientWeek = lazy(() => import('./pages/PatientWeek'))
const Week = lazy(() => import('./pages/Week'))
const Settings = lazy(() => import('./pages/Settings'))

export default function App() {
  const { user } = useAuth()

  if (!isConfigured)
    return (
      <Screen narrow>
        <EmptyState title="Falta conectar la API" description="Define VITE_API_URL en .env.local (local) o como variable del repositorio en GitHub. Revisa el README." />
      </Screen>
    )
  if (!user)
    return (
      <Suspense>
        <Login />
      </Suspense>
    )
  if (!user.role)
    return (
      <Suspense>
        <Onboarding />
      </Suspense>
    )

  return (
    <Routes>
      <Route element={<Layout role={user.role} />}>
        {user.role === 'nutritionist' ? (
          <>
            <Route index element={<Patients />} />
            <Route path="paciente/:id" element={<PatientDay />} />
            <Route path="paciente/:id/semana" element={<PatientWeek />} />
          </>
        ) : (
          <>
            <Route index element={<Today />} />
            <Route path="nueva" element={<AddMeal />} />
            <Route path="semana" element={<Week />} />
          </>
        )}
        <Route path="comida/:id" element={<MealDetail />} />
        <Route path="ajustes" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
