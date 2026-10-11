// Aplica las migraciones en un Postgres en memoria (PGlite) con stubs mínimos de Supabase y verifica las reglas RLS.
// Uso: npm run test:db
import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'

const dir = new URL('../migrations/', import.meta.url)
const migration = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n')
const db = new PGlite()

await db.exec(`
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  create publication supabase_realtime;
  grant usage on schema public, auth, storage to authenticated;
  grant all on storage.objects to authenticated;
  alter default privileges in schema public grant all on tables to authenticated;
  alter default privileges in schema public grant all on functions to authenticated;
`)
await db.exec(migration)
console.log('✓ migración aplicada')

const P = '11111111-1111-1111-1111-111111111111' // paciente
const N = '22222222-2222-2222-2222-222222222222' // nutrióloga de P
const O = '33333333-3333-3333-3333-333333333333' // otra nutrióloga
const S = '44444444-4444-4444-4444-444444444444' // otro paciente

await db.exec(`
  insert into auth.users values
    ('${P}', 'pac@gmail.com', '{"full_name":"Paciente","role":"patient"}'),
    ('${N}', 'Nutri@Gmail.com', '{"full_name":"Nutri","role":"nutritionist"}'),
    ('${O}', 'otra@gmail.com', '{"role":"nutritionist"}'),
    ('${S}', 'otro@gmail.com', '{"role":"admin"}');
`)

let failures = 0
function check(name, ok) {
  console.log(`${ok ? '✓' : '✗'} ${name}`)
  if (!ok) failures++
}
async function as(user, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user}', false); set role authenticated;`)
  try {
    return { rows: (await db.query(sql, params)).rows }
  } catch (error) {
    return { error: error.message }
  } finally {
    await db.exec('reset role')
  }
}

const roles = (await db.query('select id, role from public.profiles order by id')).rows
check('el trigger crea perfiles; rol desconocido cae en patient', roles.map((r) => r.role).join(',') === 'patient,nutritionist,nutritionist,patient')

const meal = await as(P, `insert into public.meals (photo_path) values ('${P}/a.jpg') returning id, user_id`)
check('paciente crea su comida (user_id por defecto = auth.uid())', meal.rows?.[0]?.user_id === P)
const mealId = meal.rows[0].id
await as(S, `insert into public.meals (photo_path) values ('${S}/b.jpg')`)
const spoof = await as(P, `insert into public.meals (user_id, photo_path) values ('${S}', 'x.jpg')`)
check('no puede crear comidas a nombre de otro', Boolean(spoof.error))

check('nutrióloga sin vínculo no ve comidas', (await as(N, 'select * from public.meals')).rows.length === 0)

const badLink = await as(P, `select public.link_nutritionist('otro@gmail.com')`)
check('no se puede vincular a alguien que no es nutrióloga', /No encontramos/.test(badLink.error ?? ''))
const link = await as(P, `select public.link_nutritionist('  nutri@gmail.com ')`)
check('vincular por correo (sin importar mayúsculas/espacios)', !link.error)
const directLink = await as(S, `insert into public.care_links values ('${S}', '${N}')`)
check('care_links no se pueden insertar directo', Boolean(directLink.error))

const nMeals = (await as(N, 'select user_id from public.meals')).rows
check('nutrióloga ve solo las comidas de su paciente', nMeals.length === 1 && nMeals[0].user_id === P)
check('otra nutrióloga no ve nada', (await as(O, 'select * from public.meals')).rows.length === 0)
const nUpdate = await as(N, `update public.meals set calories = 1 where id = '${mealId}' returning id`)
check('nutrióloga no puede editar comidas', nUpdate.rows?.length === 0)

check('nutrióloga ve el perfil de su paciente', (await as(N, `select * from public.profiles where id = '${P}'`)).rows.length === 1)
check('paciente ve el perfil de su nutrióloga', (await as(P, `select * from public.profiles where id = '${N}'`)).rows.length === 1)
check('nutrióloga no ve perfiles ajenos', (await as(N, `select * from public.profiles where id = '${S}'`)).rows.length === 0)

const c1 = await as(N, `insert into public.meal_comments (meal_id, body) values ('${mealId}', 'Bien, agrega verdura') returning author_id`)
check('nutrióloga comenta la comida de su paciente', c1.rows?.[0]?.author_id === N)
const c2 = await as(O, `insert into public.meal_comments (meal_id, body) values ('${mealId}', 'hola')`)
check('otra nutrióloga no puede comentar', Boolean(c2.error))
check('paciente lee el comentario', (await as(P, 'select * from public.meal_comments')).rows.length === 1)

const roleChange = await as(P, `update public.profiles set role = 'nutritionist' where id = '${P}'`)
check('no se puede cambiar el rol propio', Boolean(roleChange.error))
const rename = await as(P, `update public.profiles set full_name = 'Cris' where id = '${P}' returning full_name`)
check('sí se puede cambiar el nombre propio', rename.rows?.[0]?.full_name === 'Cris')

const up1 = await as(P, `insert into storage.objects (bucket_id, name) values ('meal-photos', '${P}/a.jpg')`)
check('paciente sube foto a su carpeta', !up1.error)
const up2 = await as(P, `insert into storage.objects (bucket_id, name) values ('meal-photos', '${S}/x.jpg')`)
check('no puede subir a la carpeta de otro', Boolean(up2.error))
await db.exec(`insert into storage.objects (bucket_id, name) values ('meal-photos', '${S}/b.jpg')`)
const nPhotos = (await as(N, 'select name from storage.objects')).rows
check('nutrióloga ve solo fotos de su paciente', nPhotos.length === 1 && nPhotos[0].name.startsWith(P))

await as(N, `delete from public.care_links where patient_id = '${P}'`)
check('al desvincular deja de ver comidas', (await as(N, 'select * from public.meals')).rows.length === 0)

console.log(failures ? `\n${failures} prueba(s) fallaron` : '\nTodas las pruebas pasaron')
process.exit(failures ? 1 : 0)
