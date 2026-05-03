-- Renombrar tablas del módulo Boletería
-- Ejecutar en Supabase SQL Editor

ALTER TABLE semanas_loteria     RENAME TO semanas_boleteria;
ALTER TABLE recepciones_loteria RENAME TO recepciones_boleteria;

-- PostgreSQL actualiza automáticamente las FK que apuntan a estas tablas
-- (incluyendo premios_loteria.semana_id que referencia semanas_loteria)
