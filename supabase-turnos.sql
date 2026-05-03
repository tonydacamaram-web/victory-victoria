-- ============================================================
-- MIGRACIÓN: Inventario por turno (T1 Mañana / T2 Tarde)
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

-- 1. Turno en cajas (1=Mañana, 2=Tarde)
ALTER TABLE cajas ADD COLUMN IF NOT EXISTS turno smallint CHECK (turno IN (1, 2));

-- 2. Saldos independientes por turno en sistemas_inventario
--    (solo usado cuando tipo IN ('saldo_ves', 'unidades'); los 'contador' siguen en saldo_actual)
ALTER TABLE sistemas_inventario
  ADD COLUMN IF NOT EXISTS saldo_turno_1 numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_turno_2 numeric NOT NULL DEFAULT 0;

-- 3. Turno en movimientos (trazabilidad)
ALTER TABLE movimientos_inventario
  ADD COLUMN IF NOT EXISTS turno smallint CHECK (turno IN (1, 2));

-- 4. RPC para ajustar saldo por turno (cantidad negativa = descuento, positiva = carga/acumulación)
CREATE OR REPLACE FUNCTION ajustar_saldo_turno(
  p_sistema_id uuid,
  p_cantidad    numeric,
  p_turno       smallint
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_turno = 1 THEN
    UPDATE sistemas_inventario SET saldo_turno_1 = saldo_turno_1 - p_cantidad WHERE id = p_sistema_id;
  ELSIF p_turno = 2 THEN
    UPDATE sistemas_inventario SET saldo_turno_2 = saldo_turno_2 - p_cantidad WHERE id = p_sistema_id;
  END IF;
END;
$$;
