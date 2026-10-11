-- Avocado: esquema inicial
-- Pacientes registran comidas (foto + análisis IA); las nutriólogas ven solo a los pacientes que las vincularon.

-- ───────────────────────── Perfiles ─────────────────────────
create type public.user_role as enum ('patient', 'nutritionist');

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  full_name text,
  role public.user_role not null default 'patient',
  created_at timestamptz not null default now()
);

-- Crea el perfil al registrarse. El rol y el nombre llegan en user_metadata desde el formulario de registro.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    case when new.raw_user_meta_data ->> 'role' = 'nutritionist'
      then 'nutritionist'::public.user_role
      else 'patient'::public.user_role
    end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── Vínculo paciente ↔ nutrióloga ─────────────────────────
create table public.care_links (
  patient_id uuid not null references public.profiles on delete cascade,
  nutritionist_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (patient_id, nutritionist_id)
);

create index care_links_nutritionist_idx on public.care_links (nutritionist_id);

-- ¿El usuario actual puede ver los datos de `owner`? (es él mismo o es su nutrióloga)
-- security definer para que las políticas no entren en recursión con RLS de care_links.
create function public.can_see_user(owner uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select owner = auth.uid()
    or exists (
      select 1 from public.care_links
      where patient_id = owner and nutritionist_id = auth.uid()
    );
$$;

-- Igual que can_see_user pero con el nombre de carpeta de Storage (texto), sin casts que puedan fallar.
create function public.can_see_folder(folder text)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select folder = auth.uid()::text
    or exists (
      select 1 from public.care_links
      where patient_id::text = folder and nutritionist_id = auth.uid()
    );
$$;

-- El paciente vincula a su nutrióloga escribiendo el correo con el que ella se registró.
create function public.link_nutritionist(nutritionist_email text)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  target uuid;
begin
  if auth.uid() is null then
    raise exception 'Necesitas iniciar sesión';
  end if;

  select id into target
  from public.profiles
  where lower(email) = lower(trim(nutritionist_email)) and role = 'nutritionist';

  if target is null then
    raise exception 'No encontramos una nutrióloga registrada con ese correo';
  end if;
  if target = auth.uid() then
    raise exception 'No puedes vincularte contigo misma';
  end if;

  insert into public.care_links (patient_id, nutritionist_id)
  values (auth.uid(), target)
  on conflict do nothing;

  return target;
end;
$$;

-- ───────────────────────── Comidas ─────────────────────────
create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  eaten_at timestamptz not null default now(),
  photo_path text not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'analyzed', 'error')),
  analysis jsonb,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  created_at timestamptz not null default now()
);

create index meals_user_eaten_idx on public.meals (user_id, eaten_at desc);

-- Comentarios / indicaciones sobre una comida (de la nutrióloga o del paciente)
create table public.meal_comments (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index meal_comments_meal_idx on public.meal_comments (meal_id, created_at);

-- ───────────────────────── Row Level Security ─────────────────────────
alter table public.profiles enable row level security;
alter table public.care_links enable row level security;
alter table public.meals enable row level security;
alter table public.meal_comments enable row level security;

-- profiles: me veo a mí, a mis pacientes y a mis nutriólogas
create policy "profiles_select" on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.can_see_user(id)
    or exists (
      select 1 from public.care_links
      where nutritionist_id = profiles.id and patient_id = auth.uid()
    )
  );

-- Solo se puede editar el nombre propio (el rol y el correo no se cambian desde la app)
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

-- care_links: cada parte ve y puede romper el vínculo; se crean solo con link_nutritionist()
create policy "care_links_select" on public.care_links for select to authenticated
  using (patient_id = auth.uid() or nutritionist_id = auth.uid());
create policy "care_links_delete" on public.care_links for delete to authenticated
  using (patient_id = auth.uid() or nutritionist_id = auth.uid());

-- meals: el dueño hace todo; la nutrióloga vinculada solo lee
create policy "meals_select" on public.meals for select to authenticated
  using (public.can_see_user(user_id));
create policy "meals_insert_own" on public.meals for insert to authenticated
  with check (user_id = auth.uid());
create policy "meals_update_own" on public.meals for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "meals_delete_own" on public.meals for delete to authenticated
  using (user_id = auth.uid());

-- meal_comments: quien puede ver la comida puede leer y comentar
create policy "meal_comments_select" on public.meal_comments for select to authenticated
  using (exists (
    select 1 from public.meals m
    where m.id = meal_comments.meal_id and public.can_see_user(m.user_id)
  ));
create policy "meal_comments_insert" on public.meal_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.meals m
      where m.id = meal_comments.meal_id and public.can_see_user(m.user_id)
    )
  );
create policy "meal_comments_delete_own" on public.meal_comments for delete to authenticated
  using (author_id = auth.uid());

-- ───────────────────────── Storage: fotos ─────────────────────────
-- Las fotos se guardan como meal-photos/<user_id>/<uuid>.jpg
insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', false)
on conflict (id) do nothing;

create policy "meal_photos_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "meal_photos_select" on storage.objects for select to authenticated
  using (bucket_id = 'meal-photos' and public.can_see_folder((storage.foldername(name))[1]));
create policy "meal_photos_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ───────────────────────── Realtime ─────────────────────────
-- Para que el análisis de IA y los comentarios aparezcan al instante.
alter publication supabase_realtime add table public.meals, public.meal_comments;
