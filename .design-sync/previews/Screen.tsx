import { Button, CalorieBar, Card, Logo, MealCard, PageHeader, Screen, TextField } from '@avocado/ui'

export const MyDay = () => (
  <div style={{ width: 400, border: '1px solid var(--av-line)', borderRadius: 24, overflow: 'hidden' }}>
    <Screen as="div">
      <PageHeader eyebrow="Domingo 11 de octubre" title="Mi día" />
      <Card>
        <CalorieBar
          total={1226}
          goal={1800}
          segments={[
            { value: 376, kind: 'breakfast', label: 'Desayuno' },
            { value: 850, kind: 'lunch', label: 'Comida' },
          ]}
        />
      </Card>
      <MealCard kind="breakfast" meta="8:15 a.m. · Desayuno" title="Huevos con aguacate y pan" detail="376 kcal · 21 g proteína" />
      <MealCard kind="lunch" meta="2:40 p.m. · Comida" title="Arroz con pollo y ensalada" detail="850 kcal · 48 g proteína" />
    </Screen>
  </div>
)

export const NarrowLogin = () => (
  <div style={{ width: 400, border: '1px solid var(--av-line)', borderRadius: 24, overflow: 'hidden' }}>
    <Screen as="div" narrow>
      <Logo size={56} withWordmark />
      <PageHeader title="Entra a tu cuenta" />
      <TextField label="Correo electrónico" type="email" placeholder="tu@correo.com" />
      <Button size="lg" fullWidth>Enviar código</Button>
    </Screen>
  </div>
)
