-- ============================================================
-- SCHEMA COMPLETO — Sistema de caja para agencia de loterías
-- Ejecutar en Supabase > SQL Editor
-- ============================================================

-- Habilitar extensión UUID
create extension if not exists "pgcrypto";

-- ============================================================
-- TABLAS
-- ============================================================

create table if not exists usuarios (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  email         text unique not null,
  rol           text check (rol in ('admin', 'supervisor', 'cajero', 'auditor')),
  activo        boolean default true,
  created_at    timestamptz default now()
);

create table if not exists cajas (
  id                    uuid primary key default gen_random_uuid(),
  nombre                text not null,
  usuario_id            uuid references usuarios(id),
  saldo_apertura_usd    numeric(12,2) default 0,
  saldo_apertura_ves    numeric(18,2) default 0,
  estado                text check (estado in ('abierta', 'cerrada')) default 'cerrada',
  turno_inicio          timestamptz,
  turno_fin             timestamptz,
  created_at            timestamptz default now()
);

create table if not exists tasas_cambio (
  id               uuid primary key default gen_random_uuid(),
  moneda           text default 'VES',
  tasa             numeric(12,4) not null,
  fuente           text,
  fecha_vigencia   date not null,
  created_at       timestamptz default now()
);

create table if not exists categorias (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  activa      boolean default true
);

create table if not exists productos (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null,
  categoria_id     uuid references categorias(id),
  costo_usd        numeric(12,2) not null default 0,
  precio_usd       numeric(12,2) not null,
  comision_usd     numeric(12,2) not null default 0,
  imagen_url       text,
  activo           boolean default true,
  monto_variable   boolean default false,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create table if not exists transacciones (
  id                  uuid primary key default gen_random_uuid(),
  caja_id             uuid references cajas(id),
  usuario_id          uuid references usuarios(id),
  metodo_pago         text[],
  moneda_cobro        text,
  tasa_aplicada       numeric(12,4),
  subtotal_usd        numeric(12,2),
  comision_total_usd  numeric(12,2),
  total_usd           numeric(12,2),
  total_ves           numeric(18,2),
  referencia          text,
  observaciones       text,
  anulada             boolean default false,
  created_at          timestamptz default now()
);

create table if not exists items_transaccion (
  id                  uuid primary key default gen_random_uuid(),
  transaccion_id      uuid references transacciones(id),
  producto_id         uuid references productos(id),
  nombre_producto     text not null,
  costo_usd           numeric(12,2),
  precio_usd          numeric(12,2),
  comision_cobrada    numeric(12,2),
  comision_definida   numeric(12,2),
  monto_libre_usd     numeric(12,2)
);

create table if not exists pagos_transaccion (
  id               uuid primary key default gen_random_uuid(),
  transaccion_id   uuid references transacciones(id),
  metodo           text not null,
  moneda           text,
  monto            numeric(18,2) not null,
  referencia       text
);

create table if not exists cortes_caja (
  id                       uuid primary key default gen_random_uuid(),
  caja_id                  uuid references cajas(id),
  usuario_id               uuid references usuarios(id),
  tipo                     text check (tipo in ('parcial', 'final')),
  total_sistema_usd        numeric(12,2),
  total_sistema_ves        numeric(18,2),
  efectivo_contado_usd     numeric(12,2),
  efectivo_contado_ves     numeric(18,2),
  diferencia_usd           numeric(12,2),
  diferencia_ves           numeric(18,2),
  comision_total_usd       numeric(12,2),
  observaciones            text,
  aprobado_por             uuid references usuarios(id),
  created_at               timestamptz default now()
);

-- ============================================================
-- TRIGGER: updated_at en productos
-- ============================================================

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger productos_updated_at
  before update on productos
  for each row execute function set_updated_at();

-- ============================================================
-- TRIGGER: solo 1 caja abierta a la vez
-- ============================================================

create or replace function check_caja_unica()
returns trigger as $$
begin
  if new.estado = 'abierta' then
    if exists (
      select 1 from cajas where estado = 'abierta' and id != new.id
    ) then
      raise exception 'Ya existe una caja abierta. Cierre el turno activo primero.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger caja_unica
  before insert or update on cajas
  for each row execute function check_caja_unica();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table usuarios enable row level security;
alter table cajas enable row level security;
alter table tasas_cambio enable row level security;
alter table categorias enable row level security;
alter table productos enable row level security;
alter table transacciones enable row level security;
alter table items_transaccion enable row level security;
alter table pagos_transaccion enable row level security;
alter table cortes_caja enable row level security;

-- Políticas básicas (ajustar según roles en producción)
-- Por ahora: usuarios autenticados pueden leer/escribir

create policy "Usuarios autenticados pueden leer usuarios"
  on usuarios for select using (auth.role() = 'authenticated');

create policy "Usuarios autenticados pueden leer cajas"
  on cajas for select using (auth.role() = 'authenticated');

create policy "Usuarios autenticados pueden crear/editar cajas"
  on cajas for all using (auth.role() = 'authenticated');

create policy "Usuarios autenticados pueden leer tasas"
  on tasas_cambio for select using (auth.role() = 'authenticated');

create policy "Usuarios autenticados pueden insertar tasas"
  on tasas_cambio for insert with check (auth.role() = 'authenticated');

create policy "Usuarios autenticados pueden leer categorias"
  on categorias for select using (auth.role() = 'authenticated');

create policy "Usuarios autenticados pueden leer productos"
  on productos for select using (auth.role() = 'authenticated');

create policy "Usuarios autenticados pueden gestionar productos"
  on productos for all using (auth.role() = 'authenticated');

create policy "Usuarios autenticados pueden leer transacciones"
  on transacciones for select using (auth.role() = 'authenticated');

create policy "Usuarios autenticados pueden insertar transacciones"
  on transacciones for insert with check (auth.role() = 'authenticated');

create policy "Usuarios autenticados pueden leer items"
  on items_transaccion for select using (auth.role() = 'authenticated');

create policy "Usuarios autenticados pueden insertar items"
  on items_transaccion for insert with check (auth.role() = 'authenticated');

create policy "Usuarios autenticados pueden leer pagos"
  on pagos_transaccion for select using (auth.role() = 'authenticated');

create policy "Usuarios autenticados pueden insertar pagos"
  on pagos_transaccion for insert with check (auth.role() = 'authenticated');

create policy "Usuarios autenticados pueden leer cortes"
  on cortes_caja for select using (auth.role() = 'authenticated');

create policy "Usuarios autenticados pueden insertar cortes"
  on cortes_caja for all using (auth.role() = 'authenticated');

-- ============================================================
-- DATOS INICIALES — Categorías
-- ============================================================

insert into categorias (nombre, activa) values
  ('loteria', true),
  ('recarga', true),
  ('servicio', true),
  ('transferencia', true)
on conflict do nothing;
