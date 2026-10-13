<p align="center"><img src="brand/avocado-logo.png" alt="Avocado" width="420"></p>

# Avocado

Registra tus comidas con una foto. La IA reconoce qué comiste, estima porciones, calorías y macros, y tu nutrióloga
ve tu día para dejarte indicaciones. Algo como Whoop, pero para nutrición y con tu nutrióloga en el loop.

**App:** https://avocadoapp.cristopherpineda.com (se instala en el teléfono como app)

## Qué hace hoy (v0.4)

Los cambios de cada versión están en [CHANGELOG.md](CHANGELOG.md). La web, la API y la app de iOS llevan la misma versión.

- **Entrar con código por correo:** escribes tu correo y te llega un código de 6 dígitos (enviado desde `avocado@cristopherpineda.com`). No hay contraseña, y la sesión dura 90 días en el teléfono.
- **Dos roles:** paciente y nutrióloga. Se elige al crear la cuenta.
- **Registrar comida:** tomas la foto (o la eliges de la galería), pones la hora y una nota opcional.
- **Análisis con IA** (vía [OpenRouter](https://openrouter.ai)): alimentos, porciones, calorías, proteína, carbohidratos y grasa.
- **Mi día:** comidas con horas y totales; puedes navegar a días anteriores.
- **Nutrióloga:** ve a sus pacientes y el día de cada uno, y comenta cada comida. Los comentarios aparecen solos, sin recargar.
- **¿Cómo te sientes?:** con hambre, ansioso/a, lleno/a, sin energía…, tu energía y si vas con tu plan. Avo te aconseja con la hora, tu última comida y cómo te has sentido; la nutrióloga lo ve.
- **Patrones de la semana:** horarios (primera y última comida, huecos largos, cenas tarde), ánimo y, con la IA, qué cambiar.
- **Chat con Avo** por texto o audio (4.ª pestaña): si le cuentas cómo te sientes, lo anota. La conversación es privada.
- **Sticker para Instagram** con los macros de la comida (5 estilos y transparencia), y la foto para guardarla.
- **Saldo de la semana y comida libre:** con tu meta y tu objetivo (bajar, mantener o subir), Avo te dice si te alcanza para un cheat meal.
- **App de iOS** nativa para pacientes (`ios/`), con la misma API.
- **Privacidad:** el paciente decide qué nutrióloga lo ve y puede quitarla cuando quiera. Las fotos solo se abren con enlaces firmados que vencen.
  Antes de la primera foto pide permiso para mandarla a la IA (se puede retirar en Perfil), cualquiera puede borrar su cuenta con todo lo
  suyo desde Perfil, y la [política de privacidad](https://avocadoapp.cristopherpineda.com/privacidad.html) está en `public/privacidad.html`.
  Lo que pide la App Store está en [docs/app-store.md](docs/app-store.md).

## Arquitectura (todo en planes gratis)

```
Teléfono (PWA: React + Vite) ──► GitHub Pages (avocadoapp.cristopherpineda.com)
        │  token de sesión (Bearer)
        ▼
Cloudflare Worker  avocado-api (Hono)          ← api/
   ├─ D1 (SQLite)   usuarios, sesiones, comidas, vínculos, comentarios
   ├─ R2            fotos: <user_id>/<meal_id>.jpg
   ├─ Resend        códigos de acceso (desde avocado@cristopherpineda.com)
   └─ OpenRouter    análisis de la foto con un modelo de visión
```

```
ios/                 la app nativa de iOS (SwiftUI), para pacientes; ver ios/README.md
src/                 la app (PWA)
  lib/api.ts         cliente de la API + token
  pages/             Login, Onboarding, Today, AddMeal, MealDetail, Patients, PatientDay, Settings
api/                 la API (Cloudflare Worker)
  src/auth.ts        códigos por correo, sesiones
  src/access.ts      quién puede ver qué (paciente ↔ nutrióloga)
  src/meals.ts       comidas, fotos, comentarios, análisis
  src/ai.ts          OpenRouter
  migrations/        esquema de D1
  test/              pruebas (corren en el runtime real de Workers)
```

### Costos

| Servicio | Gratis | Para Avocado |
|---|---|---|
| Cloudflare Workers | 100,000 peticiones/día | sobra |
| D1 | 5 GB, 5 M lecturas/día | sobra |
| R2 | 10 GB (~60,000 fotos) | pide tarjeta como verificación; $0 dentro del límite |
| Resend | 3,000 correos/mes (100/día) | sobra |
| GitHub Pages | ilimitado para repos públicos | $0 |
| OpenRouter | pagas por uso | centavos por foto según el modelo |

## Puesta en marcha

### 1. Cloudflare

1. Crea una cuenta gratis en https://dash.cloudflare.com.
2. Entra a **Workers & Pages** una vez para elegir tu subdominio `*.workers.dev` (p. ej. `crisio`).
3. Entra a **R2 Object Storage** y actívalo (plan gratis; te pide una tarjeta como verificación).
4. Copia tu **Account ID** (aparece en la barra lateral de *Workers & Pages*).
5. Crea un **API Token**: *My Profile → API Tokens → Create Token →* plantilla **"Edit Cloudflare Workers"**, y
   agrégale los permisos de cuenta **D1: Edit** y **Workers R2 Storage: Edit**.

### 2. Resend (para enviar los códigos)

1. Crea una cuenta gratis en https://resend.com.
2. **Domains → Add Domain →** `cristopherpineda.com`. Usa la opción para configurar el DNS automáticamente con
   Cloudflare (o copia los registros a *Cloudflare → DNS*). Espera a que diga **Verified**.
   Los registros van en `send.` y `resend._domainkey.`, no tocan el correo que ya tengas en el dominio.
3. **API Keys → Create API Key** (permiso *Sending access*). Esa es `RESEND_API_KEY`.

El remitente se cambia en `api/wrangler.jsonc` (`EMAIL_FROM`). Para usar Gmail en lugar de Resend:
`EMAIL_MODE: "smtp"` y los secretos `GMAIL_USER` / `GMAIL_APP_PASSWORD` (contraseña de aplicación).

### 3. OpenRouter

1. Crea una API key en https://openrouter.ai/keys.
2. Elige un modelo con entrada de imagen en https://openrouter.ai/models (filtra por *Input: image*) y copia su id
   (`proveedor/modelo`).

### 4. Secretos en GitHub

En el repo: **Settings → Secrets and variables → Actions → New repository secret**:

| Secreto | Valor |
|---|---|
| `CLOUDFLARE_API_TOKEN` | el token del paso 1 |
| `CLOUDFLARE_ACCOUNT_ID` | tu Account ID |
| `AUTH_SECRET` | texto aleatorio de 32+ caracteres. En la Terminal de tu Mac: `openssl rand -hex 32` |
| `RESEND_API_KEY` | la API key de Resend del paso 2 |
| `OPENROUTER_API_KEY` | tu API key de OpenRouter |
| `REVIEW_EMAIL` y `REVIEW_CODE` | opcionales: la cuenta para la revisión de la App Store (ver [docs/app-store.md](docs/app-store.md)) |

El modelo de IA no es secreto: está en `AI_MODELS` dentro de `api/wrangler.jsonc` (hoy Gemini 3.1 Flash-Lite, con GPT-6 Luna de respaldo).
Para comparar modelos con tus propias fotos: `cd api && OPENROUTER_API_KEY=... npm run bench -- --photos ../fotos --models a,b,c`.

### 5. Publicar

1. **Actions → "Deploy API (Cloudflare)" → Run workflow.** La primera vez crea la base de datos y el bucket de
   fotos. Al terminar, la API queda en `https://avocado-api.<tu-subdominio>.workers.dev`.
2. En **Settings → Secrets and variables → Actions → pestaña Variables** crea `VITE_API_URL` con esa URL.
3. **Actions → "Deploy a GitHub Pages" → Run workflow.**

Después de eso, cada push a `main` publica solo lo que cambió (la app o la API).

### 6. Instalar en el teléfono

- **iPhone:** abre https://avocadoapp.cristopherpineda.com en Safari → *Compartir* → *Agregar a pantalla de inicio*.
- **Android:** ábrela en Chrome → menú → *Instalar app*.

### 7. Conectar a tu nutrióloga

1. Ella entra con su correo y elige **Nutrióloga / nutriólogo**.
2. Tú vas a **Ajustes → Mi nutrióloga** y escribes su correo.

## Desarrollo local

```bash
# API (terminal 1): en modo "log" el código de acceso se imprime aquí en lugar de enviarse
cd api
cp .dev.vars.example .dev.vars
npm install
npm run db:migrate:local
npm run dev                 # http://localhost:8787

# App (terminal 2)
cp .env.example .env.local
npm install
npm run dev                 # http://localhost:5173/

npm test                    # pruebas de la API
```

## Siguientes pasos (ideas)

- [ ] Metas diarias por paciente (calorías y macros) definidas por la nutrióloga, con barras de progreso
- [ ] Notificaciones push cuando la nutrióloga comenta
- [ ] Corregir a mano el análisis de la IA (porciones, alimentos)
- [ ] Resumen diario y semanal con IA y un "score" del día, estilo Whoop
- [ ] Panel de la nutrióloga con alertas (p. ej. "no ha registrado comida en 6 h")
- [ ] Recordatorios de horario de comidas, registro de agua
- [ ] Subidas offline (cola cuando no hay señal)
- [ ] Exportar reporte en PDF para la consulta
