import { useEffect, useState } from 'react'
import { Screen, PageHeader } from '@avocado/ui'
import { useAuth } from '../auth'
import CravingLink from '../components/CravingLink'
import DayView from '../components/DayView'
import InstallCard from '../components/InstallCard'
import { StreakChip } from '../components/Streak'
import { Mascot } from '../components/Mascot'
import { firstName, formatLongDate } from '../lib/format'
import { cheer, greetOnce, greeting, isNight } from '../lib/mascot'
import { useStreak } from '../lib/streak'
import { toDayParam } from '../lib/format'

export default function Today() {
  const { user } = useAuth()
  // Comidas propias de hoy que siguen en cola o analizándose: mientras haya, Avo se queda pensando.
  const [analyzing, setAnalyzing] = useState(0)
  const name = firstName(user?.full_name)
  const { streak, fresh } = useStreak(user?.id)

  // En la tarde, si hoy aún no registra, Avo le recuerda su racha (una vez al día).
  const atRisk = fresh && streak && streak.current > 0 && !streak.loggedToday && new Date().getHours() >= 17 ? streak.current : 0
  useEffect(() => {
    if (!atRisk) return
    const t = setTimeout(() => greetOnce(`streak-${toDayParam(new Date())}`, () => cheer('think', `¡No pierdas tu racha de ${atRisk} días!`)), 1500)
    return () => clearTimeout(t)
  }, [atRisk])

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
      {streak && <StreakChip streak={streak} />}
      <InstallCard dismissible mobileOnly />
      <DayView userId={user.id} onAnalyzing={setAnalyzing} todayExtra={<CravingLink />} />
    </Screen>
  )
}
