import { CommentBubble } from '@avocado/ui'

export const Nutritionist = () => (
  <div style={{ width: 360 }}>
    <CommentBubble author="Lic. Daniela Ruiz" role="nutritionist" time="hace 20 min">
      Muy buen desayuno. Agrega una porción de fruta en la colación de la tarde.
    </CommentBubble>
  </div>
)

export const Patient = () => (
  <div style={{ width: 360 }}>
    <CommentBubble author="María Fernanda López" time="hace 5 min">
      ¡Gracias! Mañana pruebo con fresas.
    </CommentBubble>
  </div>
)

export const Thread = () => (
  <div style={{ width: 360, display: 'grid', gap: 12 }}>
    <CommentBubble author="Lic. Daniela Ruiz" role="nutritionist" time="9:40 a.m.">
      La porción de arroz está bien, pero intenta acompañarla con más verdura.
    </CommentBubble>
    <CommentBubble author="María Fernanda López" time="10:02 a.m.">
      Va, en la cena agrego ensalada.
    </CommentBubble>
  </div>
)
