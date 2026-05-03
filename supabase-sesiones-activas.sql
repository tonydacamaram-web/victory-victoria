-- Sesiones activas del sistema
-- Una sesión por usuario. Se crea al login y se elimina al logout,
-- al iniciar sesión desde otro dispositivo, o por inactividad (ver middleware).

create table if not exists public.sesiones_activas (
  id            uuid         primary key default gen_random_uuid(),
  usuario_id    uuid         not null references auth.users(id) on delete cascade,
  last_activity timestamptz  not null default now(),
  user_agent    text,
  created_at    timestamptz  not null default now()
);

create index if not exists idx_sesiones_activas_usuario_id
  on public.sesiones_activas(usuario_id);

-- Solo se accede vía service role (middleware y rutas de API internas)
alter table public.sesiones_activas enable row level security;
