-- Agrega soporte para entregar boletos como parte de pago de premios mayores.
-- Los boletos entregados se descuentan del inventario disponible
-- pero NO se contabilizan como reintegros ni como ventas.

ALTER TABLE premios_boleteria
  ADD COLUMN IF NOT EXISTS boletos_producto_id uuid REFERENCES productos(id),
  ADD COLUMN IF NOT EXISTS boletos_cantidad integer CHECK (boletos_cantidad > 0);
