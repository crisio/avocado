import { CalorieBar } from '@avocado/ui'

export const WithGoal = () => (
  <div style={{ width: 360 }}>
    <CalorieBar
      total={1226}
      goal={1800}
      segments={[
        { value: 376, kind: 'breakfast', label: 'Desayuno' },
        { value: 160, kind: 'snack', label: 'Colación' },
        { value: 690, kind: 'lunch', label: 'Comida' },
      ]}
    />
  </div>
)

export const OverGoal = () => (
  <div style={{ width: 360 }}>
    <CalorieBar
      total={2050}
      goal={1800}
      segments={[
        { value: 420, kind: 'breakfast', label: 'Desayuno' },
        { value: 780, kind: 'lunch', label: 'Comida' },
        { value: 210, kind: 'snack', label: 'Colación' },
        { value: 640, kind: 'dinner', label: 'Cena' },
      ]}
    />
  </div>
)

export const NoGoal = () => (
  <div style={{ width: 360 }}>
    <CalorieBar
      total={850}
      segments={[
        { value: 310, kind: 'breakfast', label: 'Desayuno' },
        { value: 540, kind: 'lunch', label: 'Comida' },
      ]}
    />
  </div>
)

export const Empty = () => (
  <div style={{ width: 360 }}>
    <CalorieBar total={0} goal={1800} segments={[]} />
  </div>
)
