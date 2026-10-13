# App Store: lo que Apple revisa

Nombre en la tienda: **Avocado: nutrición con foto**.
Política de privacidad: **https://avocadoapp.cristopherpineda.com/privacidad.html** (`public/privacidad.html`).

## Dónde está cada requisito

| Regla de Apple | Dónde está en Avocado |
|---|---|
| 5.1.1(v) Borrar la cuenta desde la app | Perfil → **Borrar mi cuenta**. API: `DELETE /me` (borra fotos en R2, comidas, comentarios, vínculos, sesiones y el usuario). |
| 5.1.2(i) Permiso para IA de terceros | Antes de la primera foto o del primer antojo (`src/components/AiConsent.tsx`). Se retira en Perfil → **Análisis con IA**. Sin permiso la API responde 403 y no manda nada a OpenRouter. API: `PATCH /me { "ai_consent": true \| false }`; el usuario trae `ai_consent_at`. |
| 1.4.1 Datos de salud | Aviso «Estimación con IA: puede equivocarse y no es consejo médico» en el detalle de cada comida, en «¿Me lo como?» y en el permiso. |
| 5.1.1(i) Política de privacidad | Enlace en la pantalla de entrar, en Perfil y en el permiso para la IA. |
| 2.1 Acceso para la revisión | Cuenta de revisión con código fijo (abajo). |

La app de iOS debe mostrar lo mismo: el permiso antes del primer análisis, el aviso de estimación, el enlace a la política y el botón
para borrar la cuenta.

## Cuenta para la revisión

Los revisores de Apple no reciben nuestros correos, así que un correo elegido entra con un código fijo y no se le manda nada. Los
límites siguen igual: un código por minuto, 5 por hora y 5 intentos por código.

1. Elige un correo (p. ej. `revision@cristopherpineda.com`, no necesita existir) y un código de 6 dígitos que no sea obvio.
2. En GitHub: **Settings → Secrets and variables → Actions** → crea `REVIEW_EMAIL` y `REVIEW_CODE`. Luego vuelve a publicar la API
   (**Actions → Deploy API → Run workflow**).
3. Entra a la app con ese correo y el código, elige **Paciente**, acepta el permiso para la IA, pon una meta diaria y registra 2 o 3
   comidas, para que el revisor vea la app con datos.
4. En App Store Connect → tu app → **App Review Information**: marca *Sign-in required*, pon el correo como *User name*, el código
   como *Password* y estas notas:

> Avocado signs in with a one-time code sent by email (no passwords). For this review account, type the email above, tap
> "Enviarme un código" and enter the code above as the 6-digit code; no email is sent to this address.
> The account is a patient with sample meals. Photo analysis uses third-party AI (OpenRouter → Google Gemini / OpenAI) only after the
> user grants permission in the app. Accounts can be deleted in Perfil → Borrar mi cuenta.

Si el revisor prueba **Borrar mi cuenta**, la cuenta se borra de verdad: vuelve a hacer el paso 3 antes de mandar otra versión.

## Etiquetas de privacidad (App Privacy)

En App Store Connect → **App Privacy**. Avocado no hace *tracking*, no tiene publicidad ni SDKs de analítica. Todo lo de abajo es
**App Functionality** y está **vinculado a la identidad** del usuario.

| Tipo de dato (Apple) | Qué es en Avocado |
|---|---|
| Contact Info → Email Address | correo para entrar |
| Contact Info → Name | nombre (opcional) |
| Health & Fitness → Health | comidas, calorías, macros, meta diaria y cómo se siente (ánimo, energía, si va con su plan) |
| User Content → Photos or Videos | fotos de las comidas |
| User Content → Audio Data | audios que el paciente le manda a Avo (se transcriben con la IA y no se guardan) |
| User Content → Other User Content | notas, correcciones, comentarios con la nutrióloga y la conversación con Avo |
| Identifiers → User ID | id interno de la cuenta |

Si algún día agregas analítica, reportes de fallos o notificaciones con otro servicio, actualiza esta tabla y la política.
