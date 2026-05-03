-- ============================================================
-- MIGRACIÓN: Tipo 'contador' para sistemas de saldo compartido
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

-- 1. Ampliar el CHECK constraint para incluir 'contador'
ALTER TABLE sistemas_inventario DROP CONSTRAINT sistemas_inventario_tipo_check;
ALTER TABLE sistemas_inventario ADD CONSTRAINT sistemas_inventario_tipo_check
  CHECK (tipo IN ('saldo_ves', 'unidades', 'contador'));

-- 2. Cambiar PAGOLISTO y PAYALL a tipo contador
UPDATE sistemas_inventario SET tipo = 'contador' WHERE nombre IN ('PAGOLISTO', 'PAYALL');
