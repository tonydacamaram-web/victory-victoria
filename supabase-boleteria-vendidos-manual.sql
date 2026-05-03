-- Permite al admin corregir manualmente el conteo de vendidos por producto/semana.
-- Si vendidos_manual no es NULL, la API lo usa en lugar del calculado desde transacciones.
alter table public.recepciones_boleteria
  add column if not exists vendidos_manual integer null;
