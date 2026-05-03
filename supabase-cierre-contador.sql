-- ============================================================
-- MIGRACIÓN: Cierre de contadores en turno
-- Permite registrar el reseteo de sistemas tipo 'contador'
-- al cerrar un turno como movimiento tipo 'cierre'.
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

-- 1. Ampliar el CHECK constraint de movimientos_inventario.tipo
--    para incluir 'cierre' junto a 'carga', 'venta', 'ajuste'
ALTER TABLE movimientos_inventario
  DROP CONSTRAINT IF EXISTS movimientos_inventario_tipo_check;

ALTER TABLE movimientos_inventario
  ADD CONSTRAINT movimientos_inventario_tipo_check
  CHECK (tipo IN ('carga', 'venta', 'ajuste', 'cierre'));
