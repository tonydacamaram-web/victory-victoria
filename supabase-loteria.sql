-- Semanas de lotería (ciclo lunes–domingo)
CREATE TABLE IF NOT EXISTS semanas_loteria (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_inicio date NOT NULL,
  fecha_fin    date NOT NULL,
  estado       text NOT NULL CHECK (estado IN ('abierta', 'cerrada')) DEFAULT 'abierta',
  notas        text,
  created_at   timestamptz DEFAULT now()
);

-- Recepciones: cuántos tickets llegaron por producto en esa semana
CREATE TABLE IF NOT EXISTS recepciones_loteria (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semana_id   uuid NOT NULL REFERENCES semanas_loteria(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES productos(id),
  cantidad    int  NOT NULL CHECK (cantidad >= 0),
  created_at  timestamptz DEFAULT now(),
  UNIQUE (semana_id, producto_id)
);

-- RLS
ALTER TABLE semanas_loteria     ENABLE ROW LEVEL SECURITY;
ALTER TABLE recepciones_loteria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "autenticados" ON semanas_loteria;
CREATE POLICY "autenticados" ON semanas_loteria
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "autenticados" ON recepciones_loteria;
CREATE POLICY "autenticados" ON recepciones_loteria
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Premios pagados de caja (reintegros y premios mayores)
CREATE TABLE IF NOT EXISTS premios_loteria (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semana_id     uuid REFERENCES semanas_loteria(id) ON DELETE SET NULL,
  caja_id       uuid NOT NULL REFERENCES cajas(id),
  producto_id   uuid REFERENCES productos(id),
  tipo          text NOT NULL CHECK (tipo IN ('reintegro', 'mayor')),
  moneda        text NOT NULL CHECK (moneda IN ('USD', 'VES')),
  monto         numeric(18,4) NOT NULL CHECK (monto > 0),
  observaciones text,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE premios_loteria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "autenticados" ON premios_loteria;
CREATE POLICY "autenticados" ON premios_loteria
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
