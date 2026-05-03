-- Tabla de premios exclusiva del módulo Boletería
-- Ejecutar en Supabase SQL Editor DESPUÉS de supabase-rename-tablas-boleteria.sql

CREATE TABLE IF NOT EXISTS premios_boleteria (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semana_id      uuid REFERENCES semanas_boleteria(id) ON DELETE SET NULL,
  caja_id        uuid NOT NULL REFERENCES cajas(id),
  producto_id    uuid REFERENCES productos(id),
  tipo           text NOT NULL CHECK (tipo IN ('reintegro', 'mayor')),
  moneda         text NOT NULL CHECK (moneda IN ('USD', 'VES')),
  monto          numeric(18,4) NOT NULL CHECK (monto > 0),
  observaciones  text,
  fuente         text NOT NULL DEFAULT 'caja' CHECK (fuente IN ('caja', 'externo')),
  metodo_externo text CHECK (metodo_externo IN ('efectivo', 'pago_movil')),
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE premios_boleteria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "autenticados" ON premios_boleteria;
CREATE POLICY "autenticados" ON premios_boleteria
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
