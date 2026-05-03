-- Agregar columnas de resumen de cierre a semanas_boleteria
-- Ejecutar en Supabase SQL Editor

ALTER TABLE semanas_boleteria
  ADD COLUMN IF NOT EXISTS cierre_recibidos_usd  integer,
  ADD COLUMN IF NOT EXISTS cierre_vendidos_usd   integer,
  ADD COLUMN IF NOT EXISTS cierre_ingreso_usd    numeric,
  ADD COLUMN IF NOT EXISTS cierre_comision_usd   numeric,
  ADD COLUMN IF NOT EXISTS cierre_deuda_usd      numeric,
  ADD COLUMN IF NOT EXISTS cierre_premios_usd    numeric,
  ADD COLUMN IF NOT EXISTS cierre_recibidos_ves  integer,
  ADD COLUMN IF NOT EXISTS cierre_vendidos_ves   integer,
  ADD COLUMN IF NOT EXISTS cierre_ingreso_ves    numeric,
  ADD COLUMN IF NOT EXISTS cierre_comision_ves   numeric,
  ADD COLUMN IF NOT EXISTS cierre_deuda_ves      numeric,
  ADD COLUMN IF NOT EXISTS cierre_premios_ves    numeric;
