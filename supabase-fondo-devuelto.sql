-- Agregar columnas de fondo devuelto al cierre de caja
-- Ejecutar en SQL Editor de Supabase

ALTER TABLE cortes_caja
  ADD COLUMN IF NOT EXISTS fondo_devuelto_usd numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fondo_devuelto_ves numeric(18,2) NOT NULL DEFAULT 0;
