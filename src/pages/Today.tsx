import { useEffect, useState } from 'react'
import { Screen, PageHeader } from '@avocado/ui'
import { useAuth } from '../auth'
import CravingLink from '../components/CravingLink'
import DayView from '../components/DayView'
import InstallCard from '../components/InstallCard'
import { Mascot } from '../components/Mascot'
import { firstName, formatLongDate } from '../lib/format'
import { cheer, greetOnce, greeting, isNight } from '../lib/mascot'

export default function Today() {
  const { user } = useAuth()
  // Comidas propias de hoy que siguen en cola o analizándose: mientras haya, Avo se queda pensando.
  const [analyzing, setAnalyzing] = useState(0)
  const name = firstName(user?.full_name)

  // Saluda una vez por visita, según la hora.
  useEffect(() => {
    const t = setTimeout(
      () =>
        greetOnce('today', () => {
          const { mood, message } = greeting(name)
          cheer(mood, message)
        }),
      500,
    )
    return () => clearTimeout(t)
  }, [])

  if (!user) return null

  return (
    <Screen withTabBar>
      <PageHeader
        eyebrow={formatLongDate(new Date())}
        title={name ? `Hola, ${name}` : 'Hola'}
        action={<Mascot size={88} base={analyzing ? 'think' : isNight() ? 'sleepy' : 'idle'} reactive interactive />}
      />
      <InstallCard dismissible mobileOnly />
      <DayView userId={user.id} onAnalyzing={setAnalyzing} todayExtra={<CravingLink />} />
    </Screen>
  )
}
