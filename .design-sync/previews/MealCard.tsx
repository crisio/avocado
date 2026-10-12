import { Chip, MealCard } from '@avocado/ui'

export const Breakfast = () => (
  <div style={{ width: 360 }}>
    <MealCard kind="breakfast" meta="8:15 a.m. · Desayuno" title="Huevos con aguacate y pan" detail="376 kcal · 21 g proteína" href="#" />
  </div>
)

export const Analyzing = () => (
  <div style={{ width: 360 }}>
    <MealCard
      kind="lunch"
      meta="2:40 p.m. · Comida"
      title="Arroz con pollo y ensalada"
      badge={<Chip tone="warning" icon="clock">Analizando…</Chip>}
    />
  </div>
)

export const AllKinds = () => (
  <div style={{ width: 360, display: 'grid', gap: 12 }}>
    <MealCard kind="breakfast" meta="8:15 a.m. · Desayuno" title="Avena con plátano" detail="310 kcal · 11 g proteína" />
    <MealCard kind="lunch" meta="2:40 p.m. · Comida" title="Tacos de pescado" detail="540 kcal · 32 g proteína" />
    <MealCard kind="dinner" meta="8:30 p.m. · Cena" title="Salmón con verduras" detail="480 kcal · 36 g proteína" />
    <MealCard kind="snack" meta="5:00 p.m. · Colación" title="Fresas con yogur" detail="160 kcal · 8 g proteína" />
  </div>
)

export const Compact = () => (
  <div style={{ width: 360, display: 'grid', gap: 10 }}>
    <MealCard compact kind="dinner" meta="Ayer · Cena" title="Sopa de lentejas" detail="420 kcal" />
    <MealCard compact kind="snack" meta="Ayer · Colación" title="Manzana con crema de cacahuate" detail="210 kcal" />
  </div>
)
