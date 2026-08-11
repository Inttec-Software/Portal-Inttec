-- =========================================================================
-- DATOS DE PRUEBA INICIALES (SEED DATA FOR LOCAL DOCKER)
-- =========================================================================

-- Insertar Usuarios de Prueba (Contraseñas encriptadas con pgcrypto)
INSERT INTO public.usuarios (id, nombre, email, password, rol, telefono)
VALUES 
  (
    '11111111-1111-1111-1111-111111111111', 
    'Administrador Pruebas', 
    'admin@inttec.com', 
    crypt('admin123', gen_salt('bf')), 
    'ADMIN', 
    '5551234567'
  ),
  (
    '22222222-2222-2222-2222-222222222222', 
    'Técnico Empleado', 
    'empleado@inttec.com', 
    crypt('user123', gen_salt('bf')), 
    'EMPLEADO', 
    '5559876543'
  )
ON CONFLICT (email) DO NOTHING;

-- Insertar Perfiles correspondientes
INSERT INTO public.perfiles (id, nombre, email, rol, telefono)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Administrador Pruebas', 'admin@inttec.com', 'ADMIN', '5551234567'),
  ('22222222-2222-2222-2222-222222222222', 'Técnico Empleado', 'empleado@inttec.com', 'EMPLEADO', '5559876543')
ON CONFLICT (email) DO NOTHING;

-- Insertar Categorías de Ejemplo
INSERT INTO public.categorias (id, nombre)
VALUES
  ('a1111111-1111-1111-1111-111111111111', 'Combustible y Transporte'),
  ('a2222222-2222-2222-2222-222222222222', 'Herramientas y Consumibles'),
  ('a3333333-3333-3333-3333-333333333333', 'Viáticos y Alimentos')
ON CONFLICT (nombre) DO NOTHING;

-- Insertar Subcategorías de Ejemplo
INSERT INTO public.subcategorias (id, categoria_id, nombre)
VALUES
  ('b1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'Gasolina'),
  ('b2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111', 'Peajes / Casetas'),
  ('b3333333-3333-3333-3333-333333333333', 'a2222222-2222-2222-2222-222222222222', 'Material de Instalación'),
  ('b4444444-4444-4444-4444-444444444444', 'a3333333-3333-3333-3333-333333333333', 'Comida en Trabajo Remoto')
ON CONFLICT DO NOTHING;

-- Insertar Cliente de Ejemplo
INSERT INTO public.clientes (id, nombre, rfc, correo_electronico, direccion, codigo_postal, razon_social)
VALUES
  ('c1111111-1111-1111-1111-111111111111', 'Cliente Demo S.A. de C.V.', 'CDM123456789', 'contacto@clientedemo.com', 'Av. Principal 123', '31000', 'Cliente Demo S.A. de C.V.')
ON CONFLICT (nombre) DO NOTHING;

-- Insertar Sucursal de Ejemplo
INSERT INTO public.sucursales_cliente (id, cliente_id, nombre)
VALUES
  ('d1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'Sucursal Matriz')
ON CONFLICT DO NOTHING;
