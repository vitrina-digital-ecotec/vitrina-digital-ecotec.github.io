-- =========================================================
-- 01-esquema.sql — base de datos y seguridad de la Vitrina Digital
--
-- Cómo usarlo: Supabase → SQL Editor → New query → pega TODO este archivo → Run.
-- Se puede correr más de una vez sin romper nada (crea solo lo que falta).
--
-- Qué crea:
--   administradores  → correos que pueden editar (hoy: Diana). Sumar un docente = una fila.
--   ajustes          → periodoActual y configuracion (por ejemplo el interruptor arPropia).
--   carreras         → Arquitectura, Multimedia…
--   proyectos        → cada proyecto. Sus datos van en «datos» (jsonb) con la MISMA forma
--                      que data/proyectos.json: así el sitio público no cambia y el Plan B
--                      (el archivo JSON) sigue sirviendo tal cual.
--   eventos          → contador de visitas y métricas, anónimo.
--   buckets          → imagenes, modelos y videos (lectura pública, escritura solo admin).
--
-- La seguridad la da RLS (Row Level Security): cada tabla dice quién puede leer y quién escribir.
-- La clave pública (publishable / anon) que va en js/config.js solo puede:
--   leer lo publicado y registrar eventos. Nada más.
-- =========================================================


-- ---------------------------------------------------------
-- 1. Administradores
-- ---------------------------------------------------------
create table if not exists public.administradores (
  email text primary key check (email = lower(email)),
  creado timestamptz not null default now()
);

insert into public.administradores (email)
values ('dianapaolaespinoza2002@gmail.com')
on conflict (email) do nothing;

-- ¿La persona que hace la consulta es administradora? (lee su correo del token de sesión)
-- «security definer» le permite mirar la tabla administradores aunque esa tabla esté protegida.
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.administradores
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;


-- ---------------------------------------------------------
-- 2. Contenido: ajustes, carreras y proyectos
-- ---------------------------------------------------------
create table if not exists public.ajustes (
  clave text primary key,                 -- 'periodoActual', 'configuracion'
  valor jsonb not null,
  actualizado timestamptz not null default now()
);

create table if not exists public.carreras (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  orden int not null default 99,
  publicado boolean not null default true,
  datos jsonb not null default '{}' check (jsonb_typeof(datos) = 'object'),   -- nombre, nombreCorto, descripcion, icono
  actualizado timestamptz not null default now()
);

create table if not exists public.proyectos (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  carrera text not null references public.carreras (id) on update cascade,
  orden int not null default 99,          -- orden en el carrusel y en la lista de su carrera
  publicado boolean not null default false,
  datos jsonb not null default '{}' check (jsonb_typeof(datos) = 'object'),   -- título, ficha, ar, galería, video…
  actualizado timestamptz not null default now()
);

-- «actualizado» se pone solo cada vez que se guarda un cambio
create or replace function public.marcar_actualizado()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.actualizado := now();
  return new;
end;
$$;

drop trigger if exists ajustes_actualizado on public.ajustes;
create trigger ajustes_actualizado before update on public.ajustes for each row execute function public.marcar_actualizado();
drop trigger if exists carreras_actualizado on public.carreras;
create trigger carreras_actualizado before update on public.carreras for each row execute function public.marcar_actualizado();
drop trigger if exists proyectos_actualizado on public.proyectos;
create trigger proyectos_actualizado before update on public.proyectos for each row execute function public.marcar_actualizado();


-- ---------------------------------------------------------
-- 3. Eventos (métricas anónimas: sin nombres, sin correos, sin IP)
-- ---------------------------------------------------------
create table if not exists public.eventos (
  id bigint generated always as identity primary key,
  creado timestamptz not null default now(),   -- la hora la pone el servidor, no el celular
  sesion text not null check (char_length(sesion) between 8 and 64),   -- número al azar de sessionStorage
  tipo text not null,
  datos jsonb not null default '{}' check (jsonb_typeof(datos) = 'object' and octet_length(datos::text) <= 2048)
);

-- Lista de eventos permitidos (sección 5.G + los nuevos). Se reemplaza entera para poder sumar tipos.
alter table public.eventos drop constraint if exists eventos_tipo_valido;
alter table public.eventos add constraint eventos_tipo_valido check (tipo in (
  'visita', 'carrera_elegida', 'proyecto_visto', 'ficha_escuchada',
  'ar_abierta', 'ar_iniciada', 'ar_colocada', 'ar_fallida',
  'punto_tocado', 'pregunta',
  'video_reproducido', 'video_completado', 'letra_ocultada', 'letra_mostrada', 'modo_video',
  'tutorial_ocultado', 'navegador_no_compatible'
));

create index if not exists eventos_creado on public.eventos (creado);
create index if not exists eventos_tipo_creado on public.eventos (tipo, creado);


-- ---------------------------------------------------------
-- 4. RLS: quién puede leer y quién puede escribir
-- ---------------------------------------------------------
alter table public.administradores enable row level security;
alter table public.ajustes enable row level security;
alter table public.carreras enable row level security;
alter table public.proyectos enable row level security;
alter table public.eventos enable row level security;

-- administradores: solo un admin ve la lista. Nadie la cambia desde el sitio (solo aquí, en el SQL Editor).
drop policy if exists "admin ve administradores" on public.administradores;
create policy "admin ve administradores" on public.administradores
  for select to authenticated using (public.es_admin());

-- ajustes: todos leen; solo admin escribe
drop policy if exists "todos leen ajustes" on public.ajustes;
create policy "todos leen ajustes" on public.ajustes for select to anon, authenticated using (true);
drop policy if exists "admin escribe ajustes" on public.ajustes;
create policy "admin escribe ajustes" on public.ajustes for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- carreras y proyectos: el público ve solo lo publicado; el admin ve todo y escribe
drop policy if exists "todos leen carreras publicadas" on public.carreras;
create policy "todos leen carreras publicadas" on public.carreras for select to anon, authenticated
  using (publicado or public.es_admin());
drop policy if exists "admin escribe carreras" on public.carreras;
create policy "admin escribe carreras" on public.carreras for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

drop policy if exists "todos leen proyectos publicados" on public.proyectos;
create policy "todos leen proyectos publicados" on public.proyectos for select to anon, authenticated
  using (publicado or public.es_admin());
drop policy if exists "admin escribe proyectos" on public.proyectos;
create policy "admin escribe proyectos" on public.proyectos for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- eventos: cualquiera REGISTRA (sin leer); solo el admin los ve o los borra
drop policy if exists "todos registran eventos" on public.eventos;
create policy "todos registran eventos" on public.eventos for insert to anon, authenticated
  with check (true);   -- el tipo y el tamaño ya los limitan los «check» de la tabla
drop policy if exists "admin ve eventos" on public.eventos;
create policy "admin ve eventos" on public.eventos for select to authenticated using (public.es_admin());
drop policy if exists "admin borra eventos" on public.eventos;
create policy "admin borra eventos" on public.eventos for delete to authenticated using (public.es_admin());

-- Permisos de la API (RLS decide fila por fila; esto decide qué operaciones existen).
-- Supabase da TODOS los permisos por defecto; se quitan los que el público no necesita (doble candado).
revoke all on public.ajustes, public.carreras, public.proyectos, public.eventos, public.administradores from anon;
grant select on public.ajustes, public.carreras, public.proyectos to anon, authenticated;
grant insert, update, delete on public.ajustes, public.carreras, public.proyectos to authenticated;
grant insert on public.eventos to anon, authenticated;
grant select, delete on public.eventos to authenticated;
grant select on public.administradores to authenticated;
revoke insert, update, delete on public.administradores from authenticated;
revoke update on public.eventos from authenticated;


-- ---------------------------------------------------------
-- 5. Storage: buckets para los archivos que sube el admin
--    Límites del plan gratuito: 50 MB por archivo como máximo.
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('imagenes', 'imagenes', true, 2097152,                       -- 2 MB
     array['image/webp', 'image/png', 'image/jpeg']),
  ('modelos',  'modelos',  true, 15728640,                      -- 15 MB
     array['model/gltf-binary', 'model/vnd.usdz+zip', 'application/octet-stream']),
  ('videos',   'videos',   true, 52428800,                      -- 50 MB (video, póster no, subtítulos .vtt sí)
     array['video/mp4', 'video/webm', 'text/vtt'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Lectura: los buckets son públicos (cualquiera abre la URL del archivo).
-- Escritura (subir, reemplazar, borrar) y listar: solo admin.
drop policy if exists "admin lista archivos" on storage.objects;
create policy "admin lista archivos" on storage.objects for select to authenticated
  using (bucket_id in ('imagenes', 'modelos', 'videos') and public.es_admin());
drop policy if exists "admin sube archivos" on storage.objects;
create policy "admin sube archivos" on storage.objects for insert to authenticated
  with check (bucket_id in ('imagenes', 'modelos', 'videos') and public.es_admin());
drop policy if exists "admin reemplaza archivos" on storage.objects;
create policy "admin reemplaza archivos" on storage.objects for update to authenticated
  using (bucket_id in ('imagenes', 'modelos', 'videos') and public.es_admin());
drop policy if exists "admin borra archivos" on storage.objects;
create policy "admin borra archivos" on storage.objects for delete to authenticated
  using (bucket_id in ('imagenes', 'modelos', 'videos') and public.es_admin());
