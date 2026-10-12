import { Notice } from '@avocado/ui'

export const Info = () => (
  <div style={{ width: 360 }}>
    <Notice>Te enviamos un código a maria@correo.com. Revisa también tu carpeta de spam.</Notice>
  </div>
)

export const Warning = () => (
  <div style={{ width: 360 }}>
    <Notice tone="warning">La foto se ve oscura; el análisis puede ser menos preciso.</Notice>
  </div>
)

export const Error = () => (
  <div style={{ width: 360 }}>
    <Notice tone="error">Código incorrecto. Intenta de nuevo o pide uno nuevo.</Notice>
  </div>
)
