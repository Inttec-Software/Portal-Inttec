-- =========================================================================
-- DATOS DE PRUEBA INICIALES (SEED DATA FOR LOCAL DOCKER)
-- =========================================================================

-- Insertar Usuarios de Prueba (Contraseñas encriptadas con pgcrypto)
INSERT INTO "public"."usuarios" ("id", "nombre", "email", "password", "rol", "telefono", "created_at") VALUES ('133f9f8f-dba2-4eeb-86ab-2eafea5516e2', 'Valeria Portillo', 'vportillo@inttec.net', '$2a$08$vR7eQ/2JubFu54TEEd8z2edHmjWryAYTQ0YW8t67hpfnDfeDI/hBi', 'ADMIN', '6144546300', '2026-06-12 16:11:32.253892+00'), ('2ab76427-3c08-48b1-9b51-5539e143f244', 'Alonso Ledezma', 'alonsoledezma@inttec.net', '$2a$08$rtRUsXDVc6zBelWc5G.o0.KLRrWgpIxae1dGY3AB1O3rGz0hS78/.', 'EMPLEADO', '614 174 86 61', '2026-06-22 17:05:09.869819+00'), ('32105cdc-86c4-41bd-ac3c-3e36a066b2e1', 'Alejandro Lopez', 'alejandrolopez@inttec.net', '$2a$08$dFR2kWrHnmwTFWlelWahVORFc.GvvnDL9bB1j/3eZySOdpHX1hKg.', 'EMPLEADO', '614 222 3333', '2026-06-22 17:05:09.869819+00'), ('3458f1d8-7801-4ebe-b023-84fbca584325', 'Saul Bencomo', 'sbencomo@inttec.net', '$2a$08$Rq6l3qIeiS44sXS2xbQAKum1AVv7fFFnS.gfS6AhUh/RGafimhRu2', 'EMPLEADO', null, '2026-07-28 17:45:05.293746+00'), ('6cbd0808-f843-406b-a377-eebf405d8604', 'Carlos Coronado', '2a8caltamirano@gmail.com', '$2a$08$negBI3XxE/3bjtm7VN.TAeEFZg0ld2prYU1l/KYEFo53xLk4vxlgK', 'DEV', '6141545471', '2026-08-11 15:35:03.119514+00'), ('756fb283-3672-4a1f-9d6f-0c725c26572c', 'dev', 'dev@gmail.com', '$2a$08$KjZSiZ0AjSJAomWUaHj2OOsh1VcMy8HXEROxx1LPSOqQhRLZVQnX6', 'DEV', '6145023232', '2026-08-12 14:20:44.850385+00'), ('7698e424-8db3-4503-b66a-4cc72003367b', 'Rafael Fernandez', 'rfernandez@inttec.net', '$2a$08$jM.R0wMXfEqg9J/J7Zxirea7O40Vn910GqVpa0SukS/p0om2ZNesu', 'ADMIN', '614 247 71 19', '2026-06-22 17:05:09.869819+00'), ('9505125e-d0a2-4808-a5e3-11b10bc72e53', 'Aaron Diaz', 'aarondiaz@inttec.net', '$2a$08$IHeSKwURwA0guMQSvTZi3uhEh19tKB/SsHYhXY2xzcGZMHzYW80gW', 'EMPLEADO', '614 133 46 18', '2026-06-22 17:05:09.869819+00'), ('9d0da111-ab8b-4dd9-9c0f-17d54cf65ecc', 'Alexis Espino', 'lexisfri23@gmail.com', '$2a$08$Ry9.QnbRM/JaDLyzKAqwh.1qa4yJ2FQQiXKSvEFhLnN014WjyjOSG', 'DEV', '6145023232', '2026-06-08 15:32:43.567963+00'), ('a3be9c4e-d2a3-4dee-9991-b758e824334d', 'Leonardo Pereda', 'leonardopereda7@hotmail.com', '$2a$08$y0t3R4kRNNCoenaSxPNGfOzoBa4EMAzURk.00Bu7HTVR2WZOs3uPy', 'DEV', '6141689017', '2026-08-10 14:31:04.94075+00'), ('a92dac06-8737-48cd-a698-3a6afc9035e5', 'Omar Rocha', 'omarrocha@inttec.net', '$2a$08$QaS10R2EKhq1gvdf.l.lGuJvqcAbRH2duzLVVivnMxwSjerAEIhhO', 'EMPLEADO', '614 222 3333', '2026-06-22 17:05:09.869819+00'), ('ca425e21-c295-4398-bb45-4aa2a6f6781f', 'Luly Burciaga', 'lburciaga@inttec.net', '$2a$08$YX05hgU1cN9OimYfiY27Be0Y1dV8.tWoF716V1GBq6ieBcnmQP3SG', 'ADMIN', '6141972248', '2026-06-12 16:15:56.566004+00'), ('f6bb36b8-e31b-4429-b855-3a26eb6b0614', 'Jose Angel Torres', 'joseangeltorres@inttec.net', '$2a$08$03BO5xzqq.ADwGgsQxSTs.RsnERT6v85XGBtRukhh3Lx/7v.b5Zr6', 'EMPLEADO', '614 513 22 89', '2026-06-22 17:05:09.869819+00');

-- Insertar Perfiles correspondientes
INSERT INTO "public"."perfiles" ("id", "nombre", "email", "rol", "telefono", "created_at") VALUES ('1b1ebaa6-b16c-4f82-b89d-8b97854fb0f1', 'Empleado de Prueba', 'empleado@empresa.com', 'EMPLEADO', null, '2026-06-04 18:53:33.808809+00'), ('dfce87d2-19ac-4479-abea-95fbb987bfed', 'Administrador Principal', 'admin@empresa.com', 'ADMIN', null, '2026-06-04 18:53:33.808809+00');

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
