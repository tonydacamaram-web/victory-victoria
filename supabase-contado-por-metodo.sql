-- ============================================================
-- MIGRACIÓN: Contado por método de pago en cortes_caja
-- Guarda el desglose declarado por el operador al cierre.
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

ALTER TABLE cortes_caja
  ADD COLUMN IF NOT EXISTS contado_por_metodo jsonb;