-- ============================================================
-- MIGRACIÓN: Sistema de Inventario (idempotente — se puede correr varias veces)
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

-- 1. Tabla de sistemas de inventario
CREATE TABLE IF NOT EXISTS sistemas_inventario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('saldo_ves', 'unidades')),
  saldo_actual numeric NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Tabla de movimientos (audit trail)
CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sistema_id uuid NOT NULL REFERENCES sistemas_inventario(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('carga', 'venta', 'ajuste')),
  cantidad numeric NOT NULL,   -- positivo = entrada, negativo = consumo
  descripcion text,
  transaccion_id uuid REFERENCES transacciones(id) ON DELETE SET NULL,
  usuario_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Columna sistema_id en productos (si no existe)
ALTER TABLE productos
ADD COLUMN IF NOT EXISTS sistema_id uuid REFERENCES sistemas_inventario(id) ON DELETE SET NULL;

-- 3b. Columna inventario_unidades en categorias (si no existe)
ALTER TABLE categorias
ADD COLUMN IF NOT EXISTS inventario_unidades boolean NOT NULL DEFAULT false;

-- 4. Índices (IF NOT EXISTS para evitar error si ya existen)
CREATE INDEX IF NOT EXISTS idx_movimientos_sistema ON movimientos_inventario(sistema_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_created ON movimientos_inventario(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_productos_sistema ON productos(sistema_id);

-- 5. RLS: habilitar seguridad en filas
ALTER TABLE sistemas_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_inventario ENABLE ROW LEVEL SECURITY;

-- Políticas (DROP IF EXISTS antes de recrear para evitar duplicados)
DROP POLICY IF EXISTS "auth_select_sistemas" ON sistemas_inventario;
DROP POLICY IF EXISTS "auth_insert_sistemas" ON sistemas_inventario;
DROP POLICY IF EXISTS "auth_update_sistemas" ON sistemas_inventario;
DROP POLICY IF EXISTS "auth_select_movimientos" ON movimientos_inventario;
DROP POLICY IF EXISTS "auth_insert_movimientos" ON movimientos_inventario;

CREATE POLICY "auth_select_sistemas" ON sistemas_inventario
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "auth_insert_sistemas" ON sistemas_inventario
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "auth_update_sistemas" ON sistemas_inventario
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "auth_select_movimientos" ON movimientos_inventario
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "auth_insert_movimientos" ON movimientos_inventario
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 6. Función RPC para descuento atómico de saldo
CREATE OR REPLACE FUNCTION decrementar_saldo_sistema(p_sistema_id uuid, p_cantidad numeric)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE sistemas_inventario
  SET saldo_actual = saldo_actual - p_cantidad
  WHERE id = p_sistema_id;
$$;

-- 7. Seed: los 6 sistemas digitales (solo inserta si no existen por nombre)
INSERT INTO sistemas_inventario (nombre, tipo)
SELECT nombre, tipo FROM (VALUES
  ('PAGOLISTO',    'saldo_ves'),
  ('MOVILWAY',     'saldo_ves'),
  ('AVILACASH',    'saldo_ves'),
  ('PAYALL',       'saldo_ves'),
  ('VICTORY',      'saldo_ves'),
  ('LAUNIVERSAL5', 'saldo_ves')
) AS nuevos(nombre, tipo)
WHERE NOT EXISTS (
  SELECT 1 FROM sistemas_inventario s WHERE s.nombre = nuevos.nombre
);
