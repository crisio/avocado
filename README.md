# 🥑 Avocado

Registra tus comidas con una foto. La IA reconoce qué comiste, estima porciones, calorías y macros, y tu nutrióloga
ve tu día en tiempo real para dejarte indicaciones. Algo como Whoop, pero para nutrición y con tu nutrióloga en el loop.

**App:** https://crisio.github.io/avocado/ (se instala en el teléfono como app)

## Qué hace hoy (v0.1)

- **Cuentas con correo y contraseña.** Al registrarte te llega un correo de confirmación; también hay recuperación de contraseña.
- **Dos roles:** paciente y nutrióloga.
- **Registrar comida:** tomas la foto (o la eliges de la galería), pones la hora y una nota opcional.
- **Análisis con IA** (vía [OpenRouter](https://openrouter.ai)): detecta alimentos, porciones, calorías, proteína, carbohidratos y grasa.
- **Mi día:** las comidas del día con sus horas y los totales. Puedes navegar a días anteriores.
- **Nutrióloga:** ve la lista de sus pacientes y el día de cada uno, y comenta cada comida. Los comentarios aparecen en tiempo real.
- **Privacidad:** cada paciente decide a qué nutrióloga vincula, y la nutrióloga solo ve a esos pacientes. Lo aplica la base de datos con RLS, no la app.

## Arquitectura

```
Teléfono (PWA: React + Vite)  ──►  GitHub Pages (hosting gratis)
        │
        ├──►  Supabase Auth       usuario/contraseña + correos de confirmación
        ├──►  Supabase Postgres   comidas, vínculos, comentarios (con RLS) + Realtime
        ├──►  Supabase Storage    fotos privadas: meal-photos/<user_id>/<uuid>.jpg
        └──►  Edge Function analyze-meal ──► OpenRouter (modelo con visión)
                                  (la API key vive solo en el servidor)
```

```
src/
  App.tsx              rutas según rol (paciente / nutrióloga)
  auth.tsx             sesión y perfil
  pages/               Login, Today, AddMeal, MealDetail, Patients, PatientDay, Settings, NewPassword
  components/DayView   día con comidas + totales (lo usan paciente y nutrióloga)
  lib/                 cliente Supabase, tipos, formato, compresión de fotos
supabase/
  migrations/          esquema, políticas RLS, bucket de fotos, realtime
  functions/analyze-meal/  análisis de la foto con IA
  tests/rls.test.mjs   pruebas de las reglas de seguridad (Postgres en memoria)
```

## Puesta en marcha

### 1. Supabase (gratis)

1. Crea un proyecto en https://supabase.com.
2. **Base de datos:** en *SQL Editor* pega el contenido de `supabase/migrations/20261011000000_init.sql` y dale *Run*.
3. **URLs de autenticación:** en *Authentication → URL Configuration*:
   - *Site URL*: `https://crisio.github.io/avocado/`
   - *Redirect URLs*: `https://crisio.github.io/avocado/**` y `http://localhost:5173/avocado/**`
4. **Correos:** el correo integrado de Supabase solo envía a los miembros de tu equipo de Supabase y tiene un límite muy
   bajo. Antes de invitar a tu nutrióloga configura un SMTP propio en *Authentication → Emails → SMTP Settings*
   ([Resend](https://resend.com) tiene plan gratis; también sirve Gmail con una "contraseña de aplicación"). Ahí mismo
   puedes traducir las plantillas de correo al español.
5. Copia el *Project URL* y la *Publishable key* (o *anon key*) de *Project Settings → API*.

> En el plan gratis, Supabase pausa el proyecto tras una semana sin uso. Si pasa, se reactiva desde el dashboard.

### 2. IA con OpenRouter

1. Crea una API key en https://openrouter.ai/keys.
2. Elige un modelo que acepte imágenes en https://openrouter.ai/models (filtra por *Input: image*) y copia su id
   (formato `proveedor/modelo`).
3. Despliega la función con el CLI de Supabase:

```bash
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase secrets set OPENROUTER_API_KEY=sk-or-... OPENROUTER_MODEL=proveedor/modelo
npx supabase functions deploy analyze-meal
```

Para cambiar de modelo después basta con volver a correr `secrets set`, sin tocar código.

### 3. GitHub Pages

1. En el repo: *Settings → Pages → Source: GitHub Actions*.
2. *Settings → Secrets and variables → Actions → pestaña Variables* y crea:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_KEY` = Publishable / anon key (es pública por diseño; la seguridad la dan las políticas RLS)
3. Cada push a `main` corre las pruebas, compila y publica en https://crisio.github.io/avocado/.

### 4. Instalar en el teléfono

- **iPhone:** abre la URL en Safari → *Compartir* → *Agregar a pantalla de inicio*.
- **Android:** abre la URL en Chrome → menú → *Instalar app*.

### 5. Conectar a tu nutrióloga

1. Ella crea su cuenta eligiendo **Nutrióloga / nutriólogo**.
2. Tú vas a **Ajustes → Mi nutrióloga** y escribes su correo.
3. Desde ese momento ella ve tus comidas y puede comentarlas. Puedes quitar el vínculo cuando quieras.

## Desarrollo local

```bash
cp .env.example .env.local   # pon tu URL y key de Supabase
npm install
npm run dev                  # http://localhost:5173/avocado/
npm run test:db              # pruebas de RLS (no necesita Supabase)
npm run build
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
