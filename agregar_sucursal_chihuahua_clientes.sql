-- =========================================================================
-- SCRIPT: INSERTAR SUCURSAL 'CHIHUAHUA' A TODOS LOS CLIENTES (DARAVISA)
-- =========================================================================
-- Propósito:
-- Inserta automáticamente la sucursal 'CHIHUAHUA' para cada uno de los 
-- clientes existentes en la tabla public.clientes que aún no la tengan.
-- =========================================================================

INSERT INTO public.sucursales_cliente (cliente_id, nombre)
SELECT 
  c.id, 
  'CHIHUAHUA'
FROM public.clientes c
WHERE NOT EXISTS (
  SELECT 1 
  FROM public.sucursales_cliente sc 
  WHERE sc.cliente_id = c.id 
    AND UPPER(TRIM(sc.nombre)) = 'CHIHUAHUA'
);

-- =========================================================================
-- VERIFICACIÓN
-- =========================================================================
-- Consulta para verificar las sucursales Chihuahua recién creadas:
SELECT 
  c.nombre AS cliente, 
  sc.nombre AS sucursal, 
  sc.created_at
FROM public.sucursales_cliente sc
JOIN public.clientes c ON c.id = sc.cliente_id
WHERE UPPER(TRIM(sc.nombre)) = 'CHIHUAHUA'
ORDER BY c.nombre ASC;
