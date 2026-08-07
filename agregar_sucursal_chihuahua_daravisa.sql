-- Script SQL para insertar la sucursal "CHIHUAHUA" a todos los clientes existentes
-- en la base de datos de Daravisa (evitando duplicados si ya existe).

INSERT INTO public.sucursales_cliente (cliente_id, nombre)
SELECT c.id, 'CHIHUAHUA'
FROM public.clientes c
WHERE NOT EXISTS (
    SELECT 1 
    FROM public.sucursales_cliente sc 
    WHERE sc.cliente_id = c.id 
      AND UPPER(TRIM(sc.nombre)) = 'CHIHUAHUA'
);
