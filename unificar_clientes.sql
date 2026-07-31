-- =========================================================================================
-- SCRIPT PARA UNIFICAR CLIENTES A "INTTEC"
-- Ejecutar en el SQL Editor de Supabase (Proyecto Portal-Inttec)
-- =========================================================================================

-- 1. Asegurar que exista el cliente principal "INTTEC"
INSERT INTO clientes (nombre)
VALUES ('INTTEC')
ON CONFLICT (nombre) DO NOTHING;

-- 2. Eliminar los clientes que vamos a unificar de la tabla maestra de clientes
-- (Esto asume que no hay llaves foráneas estrictas apuntando a sus IDs, 
--  lo cual es cierto basado en el esquema donde las tablas usan el nombre en texto)
DELETE FROM clientes 
WHERE nombre IN ('Inttec', 'Inttec Integracion De Tecnologias', 'Luly Burciaga', 'Interno');

-- 3. Actualizar el nombre en todas las tablas transaccionales (gastos, evidencias, etc.)
UPDATE gastos 
SET cliente = 'INTTEC' 
WHERE cliente IN ('Inttec', 'Inttec Integracion De Tecnologias', 'Luly Burciaga', 'Interno');

UPDATE evidencias 
SET cliente = 'INTTEC' 
WHERE cliente IN ('Inttec', 'Inttec Integracion De Tecnologias', 'Luly Burciaga', 'Interno');

UPDATE ventas 
SET cliente = 'INTTEC' 
WHERE cliente IN ('Inttec', 'Inttec Integracion De Tecnologias', 'Luly Burciaga', 'Interno');

UPDATE cotizaciones 
SET cliente_nombre = 'INTTEC' 
WHERE cliente_nombre IN ('Inttec', 'Inttec Integracion De Tecnologias', 'Luly Burciaga', 'Interno');

-- Nota: Si hay otras tablas adicionales donde guardes el nombre del cliente en texto, 
-- puedes copiar y pegar uno de los comandos UPDATE de arriba cambiando el nombre de la tabla.
