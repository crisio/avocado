import { Button, Card, MacroChips } from '@avocado/ui'

export const Default = () => (
  <div style={{ width: 360 }}>
    <Card>
      <h3 className="av-display" style={{ margin: 0, fontSize: 20 }}>Resumen de hoy</h3>
      <p style={{ margin: 0, color: 'var(--av-muted)' }}>Llevas 3 comidas registradas. ¡Vas muy bien!</p>
      <MacroChips protein={82} carbs={130} fat={41} />
    </Card>
  </div>
)

export const LargePadding = () => (
  <div style={{ width: 360 }}>
    <Card padding="lg">
      <h3 className="av-display" style={{ margin: 0, fontSize: 20 }}>Vincula a tu nutrióloga</h3>
      <p style={{ margin: 0, color: 'var(--av-muted)' }}>Escribe el código que te dio en consulta para compartir tus comidas.</p>
      <Button fullWidth>Agregar código</Button>
    </Card>
  </div>
)

export const Outlined = () => (
  <div style={{ width: 360, background: 'var(--av-surface)', padding: 12 }}>
    <Card outlined>
      <p style={{ margin: 0 }}>Tarjeta con borde fino, para usar sobre fondo blanco.</p>
    </Card>
  </div>
)
