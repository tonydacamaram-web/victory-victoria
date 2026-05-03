-- Agregar columnas de premios de lotería a cortes_caja
ALTER TABLE cortes_caja
  ADD COLUMN IF NOT EXISTS premios_usd numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS premios_ves numeric(18,2) NOT NULL DEFAULT 0;
