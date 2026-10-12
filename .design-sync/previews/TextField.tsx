import { TextField } from '@avocado/ui'

export const Default = () => (
  <div style={{ width: 340 }}>
    <TextField label="Correo electrónico" type="email" placeholder="tu@correo.com" hint="Te enviaremos un código de acceso." />
  </div>
)

export const Filled = () => (
  <div style={{ width: 340 }}>
    <TextField label="Nombre" defaultValue="María Fernanda López" />
  </div>
)

export const WithError = () => (
  <div style={{ width: 340 }}>
    <TextField label="Código de la nutrióloga" defaultValue="AV-12" error="No encontramos ese código. Revisa que esté completo." />
  </div>
)

export const Multiline = () => (
  <div style={{ width: 340 }}>
    <TextField label="Comentario para tu paciente" multiline rows={3} defaultValue="Muy buen desayuno. Intenta agregar una porción de fruta en la colación." />
  </div>
)

export const Disabled = () => (
  <div style={{ width: 340 }}>
    <TextField label="Correo electrónico" defaultValue="maria@correo.com" disabled />
  </div>
)
