-- ============================================================
-- MIGRACIÓN: Campo moneda en sistemas_inventario
-- Permite marcar un sistema como USD o VES para formateo correcto.
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

ALTER TABLE sistemas_inventario
  ADD COLUMN IF NOT EXISTS moneda text NOT NULL DEFAULT 'VES'
  CHECK (moneda IN ('VES', 'USD'));
