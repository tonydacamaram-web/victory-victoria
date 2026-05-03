-- Habilitar cobra_comision en la categoría Tickets Loteria
-- para que el POS use precio_ves (ej: 2000 Bs) en lugar de costo_ves (ej: 1900 Bs)
-- Ejecutar en SQL Editor de Supabase

UPDATE categorias
SET cobra_comision = true
WHERE nombre ILIKE '%ticket%loter%'
   OR nombre ILIKE '%tickets loter%'
   OR nombre ILIKE '%loteria%ticket%';
