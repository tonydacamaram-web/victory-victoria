-- Control por producto de la comisión fija de segunda capa (20% surcharge).
-- DEFAULT true para preservar el comportamiento de los productos existentes.
-- Desmarcar en productos de Lotería u otros donde no aplica el 20%.

ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS cobra_comision_fija boolean NOT NULL DEFAULT true;
