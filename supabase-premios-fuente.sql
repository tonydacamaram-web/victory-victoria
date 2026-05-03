-- Migración: Fuente de pago de premios (caja vs fondo externo) en premios_loteria
-- Ejecutar en SQL Editor de Supabase

ALTER TABLE premios_loteria
  ADD COLUMN IF NOT EXISTS fuente text NOT NULL DEFAULT 'caja'
    CHECK (fuente IN ('caja', 'externo')),
  ADD COLUMN IF NOT EXISTS metodo_externo text
    CHECK (metodo_externo IN ('efectivo', 'pago_movil'));
