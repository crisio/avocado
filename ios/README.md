# Avocado para iOS

App nativa en SwiftUI para **pacientes** (la nutrióloga sigue en la web). Usa la misma API que la PWA
(`https://avocado-api.cristopheropineda.workers.dev`) y los mismos recursos: la mascota (`public/mascot`), el ícono
(`brand/avocado-icon-1024.png`), los colores del kit Fresco y la fuente Bricolage Grotesque.

- Nombre en la App Store: **Avocado: nutrición con foto** · en el iPhone: **Avocado**
- Bundle ID: `com.cristopherpineda.avocado` · iOS 26 o más nuevo · solo iPhone, vertical y en modo claro

## Abrir y correr

1. Abre `ios/Avocado.xcodeproj` en Xcode.
2. En **Signing & Capabilities** elige tu equipo (tu cuenta de Apple Developer). Sin equipo funciona en el simulador.
3. Elige un simulador o tu iPhone y dale ▶︎.

Los archivos nuevos que pongas dentro de `ios/Avocado/` entran solos al proyecto (carpetas sincronizadas).

### Probar con la API local

```bash
cd api && npm run dev
xcrun simctl spawn booted defaults write com.cristopherpineda.avocado AVOCADO_API_URL http://localhost:8787
```

Solo funciona en compilaciones Debug. Con `REVIEW_EMAIL`/`REVIEW_CODE` en `api/.dev.vars` puedes entrar con el código fijo.
El teclado del simulador a veces cambia la "@": `defaults write … AVOCADO_DEBUG_EMAIL revision@avocado.test` precarga el correo.
Para volver a producción: `defaults delete com.cristopherpineda.avocado AVOCADO_API_URL`.

## Qué tiene

| Pantalla | Archivo |
|---|---|
| Entrar con código y elegir tipo de cuenta | `Features/Login/LoginView.swift` |
| Mi día: racha, calorías, macros, comidas | `Features/Today/TodayView.swift` |
| Registrar comida (cámara o galería) y permiso para la IA | `Features/Meal/AddMealView.swift`, `AiConsentView.swift` |
| Detalle: porciones, corrección, comentarios, borrar | `Features/Meal/MealDetailView.swift` |
| Tu semana: racha, gráfica, macros, lo más frecuente | `Features/Week/WeekView.swift` |
| ¿Me lo como? | `Features/Craving/CravingView.swift` |
| Perfil: nombre, meta, nutrióloga, permiso, privacidad, borrar cuenta | `Features/Profile/ProfileView.swift` |

`Core/` tiene la API, los modelos, la sesión (token en el llavero) y la cola sin conexión (`Outbox.swift`: la foto se
guarda en el teléfono y se sube con `client_id` en cuanto hay señal). `Design/` tiene los colores, la fuente, los
componentes, a Avo animado y la celebración.

## Publicar

Lo que pide Apple (cuenta de revisión, etiquetas de privacidad, notas para el revisor) está en
[`docs/app-store.md`](../docs/app-store.md). En Xcode: **Product → Archive → Distribute App → App Store Connect**, y desde
ahí a TestFlight.
