-- Comisión porcentual configurable para productos de monto variable
-- Cuando está definida, se deduce del monto ingresado por el cajero:
--   comision = monto * (comision_pct / 100)
--   costo    = monto * (1 - comision_pct / 100)
-- Si es NULL, aplica la comisión fija de segunda capa (20% surcharge).

ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS comision_pct numeric(6,4) DEFAULT NULL;
