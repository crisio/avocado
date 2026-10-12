import { DayNav } from '@avocado/ui'

export const Today = () => (
  <div style={{ width: 360 }}>
    <DayNav label="Hoy" onPrev={() => {}} onNext={() => {}} nextDisabled />
  </div>
)

export const PastDay = () => (
  <div style={{ width: 360 }}>
    <DayNav label="Viernes 9 de octubre" onPrev={() => {}} onNext={() => {}} />
  </div>
)
