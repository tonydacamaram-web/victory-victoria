-- Productos con precio de venta en VES y costo indexado en USD
-- La comisión se calcula dinámicamente: (precio_ves / tasa_dia) - costo_usd

ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS costo_indexado_usd boolean NOT NULL DEFAULT false;

-- Índice para consultas de reportes que filtren por este tipo
CREATE INDEX IF NOT EXISTS idx_productos_costo_indexado_usd
  ON productos (costo_indexado_usd)
  WHERE costo_indexado_usd = true;
