# Cambios

La web (PWA), la API y la app de iOS llevan la misma versión. Mientras la versión empiece con 0, la app sigue en pruebas.

## 0.5.0 — 13 de octubre de 2026

- **Widget de iOS** (chico, mediano y de pantalla bloqueada): calorías del día contra la meta en un anillo, macros y racha. Tocarlo abre «Registrar comida» con la cámara; el botón Avo abre el chat. Los datos los comparte la app por un App Group (requiere la cuenta de pago de Apple; con la gratuita el widget solo muestra el acceso a registrar).
- **Atajos de la web instalada** (Android y escritorio): «Registrar comida» y «Hablar con Avo» al mantener presionado el ícono.

## 0.4.0 — 13 de octubre de 2026

- **¿Cómo te sientes? en un toque:** una fila de emojis; se guarda al tocar. La tarjeta se quita deslizándola (o con la ✕) y no vuelve a salir en Mi día por 3 horas.
- **Objetivo** en Perfil (bajar, mantener o subir) y **saldo de los últimos 7 días** en la semana: si vas por debajo de tu meta, la comida libre (cheat meal) que te puedes dar hoy, con tope de media meta diaria; si estás en volumen, lo que te falta. «Recomiéndame un cheat meal» le pregunta a Avo. Avo usa el saldo en el chat, en ¿Me lo como? y en sus consejos.
- **Ver la foto en grande** y guardarla o compartirla (también desde la tarjeta del sticker).
- **Sticker:** 5 temas (Día, Noche, Cena romántica, Cheat meal y Fresco) y transparencia de 0 a 70 %.

## 0.3.0 — 13 de octubre de 2026

- **App de iOS** nativa en SwiftUI (`ios/`) para pacientes, con la misma API y la misma marca.
- **Requisitos de la App Store:** borrar la cuenta desde Perfil, cuenta de revisión con código fijo, permiso explícito para la IA de terceros, aviso de que las calorías son estimaciones y política de privacidad (`/privacidad.html`).
- **¿Cómo te sientes?** en Mi día y después de cada comida, con el consejo de Avo; lo ve la nutrióloga.
- **Patrones de la semana:** horarios, ánimo y análisis de Avo con la IA.
- **Chat con Avo** por texto o audio en una pestaña nueva; anota cómo te sientes.
- **Sticker para historias de Instagram** con los macros de cada comida.
- Ícono nuevo con Avo guiñando el ojo.
- Arreglos: lo que falta para la meta ya cuadra con el total redondeado.

## 0.2.0 — 12 de octubre de 2026

- Kit de componentes «Fresco» y app rediseñada; Avo, la mascota, reacciona a lo que haces.
- Funciona sin conexión: cola de envíos, caché y fotos guardadas en el teléfono.
- Porciones (cuánto te comiste de cada alimento), corrección con tus palabras y resumen semanal.
- «¿Me lo como?» para los antojos, meta diaria y rachas.

## 0.1.0

- Primera versión: entrar con código por correo, registrar comidas con foto, análisis con IA y la nutrióloga comentando cada comida.
