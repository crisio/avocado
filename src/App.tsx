import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { EmptyState, Screen } from '@avocado/ui'
import { useAuth } from './auth'
import { isConfigured } from './lib/api'
import { lazy, Suspense, useEffect } from 'react'
import { parseInviteCode, setInviteCode } from './lib/invite'
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
const PatientReport = lazy(() => import('./pages/PatientReport'))
const Invite = lazy(() => import('./pages/Invite'))
const PatientWeek = lazy(() => import('./pages/PatientWeek'))
const Week = lazy(() => import('./pages/Week'))
const Craving = lazy(() => import('./pages/Craving'))
const Settings = lazy(() => import('./pages/Settings'))
const Logros = lazy(() => import('./pages/Logros'))
const AvoChat = lazy(() => import('./pages/AvoChat'))

export default function App() {
  const { user } = useAuth()
  const { pathname } = useLocation()

  // Enlace de invitación (/invitar/CODIGO): se guarda el código para después de entrar (sin sesión no hay a quién preguntar).
  useEffect(() => {
    const m = pathname.match(/^\/invitar\/([^/]+)/)
    const code = m && parseInviteCode(decodeURIComponent(m[1]))
    if (code) setInviteCode(code)
  }, [pathname])

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
            <Route path="paciente/:id/reporte" element={<PatientReport />} />
          </>
        ) : (
          <>
            <Route index element={<Today />} />
            <Route path="nueva" element={<AddMeal />} />
            <Route path="semana" element={<Week />} />
            <Route path="antojo" element={<Craving />} />
            <Route path="avo" element={<AvoChat />} />
            <Route path="logros" element={<Logros />} />
          </>
        )}
        <Route path="invitar/:code" element={<Invite />} />
        <Route path="comida/:id" element={<MealDetail />} />
        <Route path="ajustes" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
