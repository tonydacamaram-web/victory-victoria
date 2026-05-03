-- Renombrar categoría "Tickets Loteria" a "Boleteria"
-- Ejecutar en Supabase SQL Editor antes del despliegue

UPDATE categorias
SET nombre = 'Boleteria'
WHERE nombre = 'Tickets Loteria';
