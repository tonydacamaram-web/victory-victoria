-- Agregar número de ticket premiado a premios_loteria
ALTER TABLE premios_loteria
  ADD COLUMN IF NOT EXISTS numero_ticket text;
