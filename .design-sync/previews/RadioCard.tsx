import { RadioCard } from '@avocado/ui'

export const RoleChoice = () => (
  <div style={{ width: 360, display: 'grid', gap: 10 }}>
    <RadioCard name="role" value="patient" defaultChecked title="Paciente" description="Registro mis comidas y recibo indicaciones." />
    <RadioCard name="role" value="nutritionist" title="Nutrióloga" description="Sigo a mis pacientes y les dejo comentarios." />
  </div>
)

export const MealKind = () => (
  <div style={{ width: 360, display: 'grid', gap: 10 }}>
    <RadioCard name="kind" value="breakfast" title="Desayuno" />
    <RadioCard name="kind" value="lunch" defaultChecked title="Comida" />
    <RadioCard name="kind" value="dinner" title="Cena" />
    <RadioCard name="kind" value="snack" title="Colación" disabled />
  </div>
)
