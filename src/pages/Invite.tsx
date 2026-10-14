import { useEffect } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Button, EmptyState, Screen } from '@avocado/ui'
import { useAuth } from '../auth'
import { clearInviteCode, parseInviteCode, setInviteCode } from '../lib/invite'

/**
 * /invitar/:code con sesión. Al paciente se le guarda el código y la confirmación sale en "Mi día"; la
 * nutrióloga ve que el enlace es para sus pacientes.
 */
export default function Invite() {
  const { user } = useAuth()
  const { code: raw = '' } = useParams<{ code: string }>()
  const code = parseInviteCode(raw)
  const patient = user?.role === 'patient'

  useEffect(() => {
    if (patient && code) setInviteCode(code)
    if (!patient) clearInviteCode()
  }, [patient, code])

  if (patient) return <Navigate to="/" replace />
  return (
    <Screen narrow>
      <EmptyState
        icon="users"
        title="Este enlace es para pacientes"
        description="Compártelo con tus pacientes: al abrirlo y entrar a Avocado quedan vinculados contigo."
        action={
          <Button as={Link} to="/">
            Ir a mis pacientes
          </Button>
        }
      />
    </Screen>
  )
}
