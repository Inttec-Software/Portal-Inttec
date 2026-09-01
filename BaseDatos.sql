-- Extensiones necesarias para UUIDs y Hashes de Contraseña
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Crear roles genéricos de Supabase si no existen para evitar errores en GRANTs
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;

-- =========================================================================
-- ESQUEMA DE BASE DE DATOS LOCAL DOCKER: INTTEC
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.usuarios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  email text NOT NULL UNIQUE,
  password text NOT NULL,
  rol text NOT NULL CHECK (rol = ANY (ARRAY['ADMIN'::text, 'EMPLEADO'::text, 'DEV'::text])),
  telefono text,
  expo_push_token text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT usuarios_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.perfiles (
  id uuid NOT NULL,
  nombre text NOT NULL,
  email text NOT NULL UNIQUE,
  rol text CHECK (rol = ANY (ARRAY['ADMIN'::text, 'EMPLEADO'::text, 'DEV'::text])),
  telefono text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT perfiles_pkey PRIMARY KEY (id),
  CONSTRAINT perfiles_id_fkey FOREIGN KEY (id) REFERENCES public.usuarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.clientes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  rfc text,
  correo_electronico text,
  direccion text,
  codigo_postal text,
  razon_social text,
  regimen_fiscal character varying,
  uso_cfdi character varying,
  CONSTRAINT clientes_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.sucursales_cliente (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  nombre text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT sucursales_cliente_pkey PRIMARY KEY (id),
  CONSTRAINT sucursales_cliente_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.categorias (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  CONSTRAINT categorias_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.subcategorias (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  categoria_id uuid NOT NULL,
  nombre text NOT NULL,
  CONSTRAINT subcategorias_pkey PRIMARY KEY (id),
  CONSTRAINT subcat_cat_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.proveedores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  rfc character varying UNIQUE,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT proveedores_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.cotizaciones (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  folio text NOT NULL UNIQUE,
  cliente_nombre text,
  vendedor text,
  moneda text,
  fecha_creacion text,
  subtotal numeric,
  iva numeric,
  total numeric,
  lineas jsonb,
  terminos_condiciones text,
  estado text DEFAULT 'Borrador'::text,
  creado_en timestamp with time zone DEFAULT now(),
  sucursal text,
  CONSTRAINT cotizaciones_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.ventas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  registrado_por uuid,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  cliente text NOT NULL DEFAULT ''::text,
  factura_referencia text,
  tipo_proyecto text,
  proveedor text,
  precio_total_facturado numeric DEFAULT 0,
  costo_total numeric DEFAULT 0,
  utilidad_bruta numeric DEFAULT 0,
  margen_porcentual numeric DEFAULT 0,
  factura_url text,
  notas text,
  created_at timestamp with time zone DEFAULT now(),
  descripcion text,
  agregar_iva boolean DEFAULT false,
  cfdi_uuid uuid UNIQUE,
  cfdi_pdf_url text,
  cfdi_xml_url text,
  cfdi_estado text DEFAULT 'PENDIENTE'::text,
  cfdi_facturapi_id character varying,
  cotizacion_id uuid,
  sucursal text,
  total_pagado numeric DEFAULT 0,
  saldo_pendiente numeric DEFAULT 0,
  estado_pago text DEFAULT 'PENDIENTE DE PAGO'::text,
  folio text,
  CONSTRAINT ventas_pkey PRIMARY KEY (id),
  CONSTRAINT ventas_cotizacion_id_fkey FOREIGN KEY (cotizacion_id) REFERENCES public.cotizaciones(id),
  CONSTRAINT ventas_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.usuarios(id)
);

CREATE TABLE IF NOT EXISTS public.ventas_partidas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venta_id uuid,
  descripcion text NOT NULL,
  cantidad numeric DEFAULT 1,
  unidad text DEFAULT 'PZA'::text,
  precio_unitario_venta numeric DEFAULT 0,
  costo_unitario_proveedor numeric DEFAULT 0,
  precio_total_venta numeric DEFAULT 0,
  costo_total_proveedor numeric DEFAULT 0,
  CONSTRAINT ventas_partidas_pkey PRIMARY KEY (id),
  CONSTRAINT ventas_partidas_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES public.ventas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.ventas_pagos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venta_id uuid NOT NULL,
  monto numeric NOT NULL CHECK (monto > 0),
  fecha_pago date NOT NULL DEFAULT CURRENT_DATE,
  metodo_pago text DEFAULT 'Transferencia'::text,
  referencia text,
  registrado_por uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ventas_pagos_pkey PRIMARY KEY (id),
  CONSTRAINT ventas_pagos_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES public.ventas(id) ON DELETE CASCADE,
  CONSTRAINT ventas_pagos_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.usuarios(id)
);

CREATE TABLE IF NOT EXISTS public.gastos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  empleado_id uuid NOT NULL,
  empleado_nombre text,
  monto numeric NOT NULL,
  metodo_pago text CHECK (metodo_pago = ANY (ARRAY['efectivo'::text, 'tarjeta'::text, 'tarjeta_credito'::text, 'tarjeta_debito'::text])),
  tipo_tarjeta character varying,
  justificacion text,
  foto_url text,
  status text DEFAULT 'PENDING'::text CHECK (status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text, 'ACTION_REQUIRED'::text])),
  rejection_feedback text,
  created_at timestamp with time zone DEFAULT now(),
  approved_at timestamp with time zone,
  fecha_comprobante date,
  ubicacion_registro character varying,
  facturado boolean DEFAULT false,
  factura_url text,
  motivo_sin_factura text,
  tipo_servicio_proyecto text,
  detalle_servicio_proyecto text,
  venta_id uuid,
  subcategoria_id uuid,
  proveedor_id uuid,
  cliente_id uuid,
  sucursal_id uuid,
  CONSTRAINT gastos_pkey PRIMARY KEY (id),
  CONSTRAINT gastos_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.usuarios(id),
  CONSTRAINT gastos_subcategoria_id_fkey FOREIGN KEY (subcategoria_id) REFERENCES public.subcategorias(id) ON DELETE SET NULL,
  CONSTRAINT gastos_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(id) ON DELETE SET NULL,
  CONSTRAINT gastos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE SET NULL,
  CONSTRAINT gastos_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES public.sucursales_cliente(id) ON DELETE SET NULL,
  CONSTRAINT gastos_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES public.ventas(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.evidencias (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  empleado_id uuid NOT NULL,
  empleado_nombre text,
  cliente text NOT NULL,
  descripcion_trabajo text NOT NULL,
  materiales_usados text,
  observaciones text,
  foto_antes_url text,
  foto_despues_url text,
  fotos_adicionales_urls text[],
  resumen_ia text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT evidencias_pkey PRIMARY KEY (id),
  CONSTRAINT evidencias_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.usuarios(id)
);

CREATE TABLE IF NOT EXISTS public.asistencias (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  empleado_id uuid NOT NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  hora_entrada time with time zone,
  foto_entrada_url text,
  latitud_entrada numeric,
  longitud_entrada numeric,
  direccion_entrada text,
  hora_salida time with time zone,
  foto_salida_url text,
  latitud_salida numeric,
  longitud_salida numeric,
  direccion_salida text,
  creado_en timestamp with time zone DEFAULT now(),
  CONSTRAINT asistencias_pkey PRIMARY KEY (id),
  CONSTRAINT asistencias_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.usuarios(id)
);

CREATE TABLE IF NOT EXISTS public.vehiculos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  marca text NOT NULL,
  modelo text NOT NULL,
  anio integer NOT NULL,
  placas text NOT NULL UNIQUE,
  numero_economico text,
  kilometraje_actual integer DEFAULT 0,
  activo boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT vehiculos_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.registro_gasolina (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  gasto_id uuid,
  vehiculo_id uuid NOT NULL,
  empleado_id uuid NOT NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  kilometraje_actual integer NOT NULL,
  litros numeric NOT NULL,
  costo_total numeric NOT NULL,
  ticket_foto_url text,
  observaciones text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT registro_gasolina_pkey PRIMARY KEY (id),
  CONSTRAINT registro_gasolina_gasto_id_fkey FOREIGN KEY (gasto_id) REFERENCES public.gastos(id) ON DELETE SET NULL,
  CONSTRAINT registro_gasolina_vehiculo_id_fkey FOREIGN KEY (vehiculo_id) REFERENCES public.vehiculos(id),
  CONSTRAINT registro_gasolina_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.usuarios(id)
);

CREATE TABLE IF NOT EXISTS public.categorias_productos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  descripcion text,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT categorias_productos_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.productos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sku_interno character varying NOT NULL UNIQUE,
  nombre_oficial text NOT NULL,
  categoria_id uuid NOT NULL,
  stock_actual integer NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  precio_unitario numeric DEFAULT 0,
  impuesto_porcentaje numeric DEFAULT 16,
  clave_facturacion text,
  CONSTRAINT productos_pkey PRIMARY KEY (id),
  CONSTRAINT productos_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias_productos(id)
);

CREATE TABLE IF NOT EXISTS public.alias_proveedor_producto (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  proveedor_id uuid NOT NULL,
  producto_id uuid NOT NULL,
  nombre_segun_proveedor text NOT NULL,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT alias_proveedor_producto_pkey PRIMARY KEY (id),
  CONSTRAINT alias_proveedor_producto_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(id),
  CONSTRAINT alias_proveedor_producto_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id)
);

CREATE TABLE IF NOT EXISTS public.movimientos_inventario (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL,
  tipo character varying NOT NULL CHECK (tipo::text = ANY (ARRAY['ENTRADA'::character varying::text, 'SALIDA'::character varying::text])),
  cantidad integer NOT NULL CHECK (cantidad > 0),
  fecha timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  folio_factura character varying,
  proveedor_id uuid,
  creado_por uuid,
  CONSTRAINT movimientos_inventario_pkey PRIMARY KEY (id),
  CONSTRAINT movimientos_inventario_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id),
  CONSTRAINT movimientos_inventario_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(id),
  CONSTRAINT movimientos_inventario_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id)
);

CREATE TABLE IF NOT EXISTS public.auditorias_tarjeta (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tarjeta text NOT NULL,
  metodo_pago text NOT NULL,
  titular text,
  periodo_inicio date,
  periodo_fin date,
  total_cargos numeric NOT NULL,
  total_conciliado numeric NOT NULL,
  total_faltante numeric NOT NULL,
  resultado_json jsonb NOT NULL,
  creado_por uuid,
  creado_por_nombre text,
  creado_en timestamp with time zone DEFAULT now(),
  CONSTRAINT auditorias_tarjeta_pkey PRIMARY KEY (id),
  CONSTRAINT auditorias_tarjeta_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id)
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  timestamp timestamp with time zone DEFAULT now(),
  action text CHECK (action = ANY (ARRAY['CREATE'::text, 'APPROVE'::text, 'REJECT'::text, 'UPDATE'::text])),
  actor_id uuid,
  target_id text NOT NULL,
  details text,
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.app_settings (
  id integer NOT NULL DEFAULT 1,
  min_version_code integer NOT NULL DEFAULT 1,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT app_settings_pkey PRIMARY KEY (id)
);

-- =========================================================================
-- MÓDULO DE TICKETS
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  creado_por uuid NOT NULL,
  asignado_a uuid,
  categoria text NOT NULL CHECK (categoria IN ('Bug', 'Feature', 'Mejora')),
  empresa text NOT NULL CHECK (empresa IN ('Daravisa', 'Inttec')),
  asunto text NOT NULL,
  descripcion text NOT NULL,
  prioridad text NOT NULL CHECK (prioridad IN ('Urgente', 'Alto', 'Medio', 'Bajo')),
  status text NOT NULL DEFAULT 'Abierto' CHECK (status IN ('Abierto', 'En proceso', 'Cerrado')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT tickets_pkey PRIMARY KEY (id),
  CONSTRAINT tickets_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id),
  CONSTRAINT tickets_asignado_a_fkey FOREIGN KEY (asignado_a) REFERENCES public.usuarios(id)
);

CREATE TABLE IF NOT EXISTS public.ticket_imagenes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  url text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT ticket_imagenes_pkey PRIMARY KEY (id),
  CONSTRAINT ticket_imagenes_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE
);

-- =========================================================================
-- ÍNDICES DE RENDIMIENTO
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_gastos_subcategoria_id ON public.gastos(subcategoria_id);
CREATE INDEX IF NOT EXISTS idx_gastos_proveedor_id ON public.gastos(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_gastos_cliente_id ON public.gastos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_gastos_sucursal_id ON public.gastos(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_gastos_empleado_id ON public.gastos(empleado_id);
CREATE INDEX IF NOT EXISTS idx_gastos_venta_id ON public.gastos(venta_id);
CREATE INDEX IF NOT EXISTS idx_gastos_created_at ON public.gastos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sucursales_cliente_cliente_id ON public.sucursales_cliente(cliente_id);
CREATE INDEX IF NOT EXISTS idx_subcategorias_categoria_id ON public.subcategorias(categoria_id);
CREATE INDEX IF NOT EXISTS idx_ventas_partidas_venta_id ON public.ventas_partidas(venta_id);
CREATE INDEX IF NOT EXISTS idx_productos_categoria_id ON public.productos(categoria_id);

-- =========================================================================
-- FUNCIONES RPC
-- =========================================================================
DROP FUNCTION IF EXISTS public.login_usuario(text, text);
DROP FUNCTION IF EXISTS public.login_usuario();

-- Función y Trigger para hashear contraseñas automáticamente
CREATE OR REPLACE FUNCTION public.hash_password_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- Si la contraseña no está encriptada con bcrypt (no empieza con $2), la encriptamos
  IF NEW.password IS NOT NULL AND NEW.password NOT LIKE '$2%' THEN
    NEW.password = crypt(NEW.password, gen_salt('bf'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS hash_usuarios_password ON public.usuarios;
CREATE TRIGGER hash_usuarios_password
BEFORE INSERT OR UPDATE OF password ON public.usuarios
FOR EACH ROW
EXECUTE FUNCTION public.hash_password_trigger();

CREATE OR REPLACE FUNCTION public.login_usuario(email_param text, password_param text)
RETURNS TABLE (
  id uuid,
  nombre text,
  email text,
  rol text,
  telefono text,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.nombre, u.email, u.rol, u.telefono, u.created_at
  FROM public.usuarios u
  WHERE LOWER(TRIM(u.email)) = LOWER(TRIM(email_param))
    AND u.password = crypt(password_param, u.password);
END;
$$;

GRANT EXECUTE ON FUNCTION public.login_usuario(text, text) TO anon, authenticated, service_role;

-- =========================================================================
-- MÓDULO DE TAREAS PENDIENTES
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.tareas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descripcion text,
  creado_por uuid NOT NULL,
  responsable_id uuid NOT NULL,
  fecha_compromiso date NOT NULL,
  status text NOT NULL DEFAULT 'Pendiente' CHECK (status IN ('Pendiente', 'Completada', 'Cancelada')),
  vinculo_tipo text CHECK (vinculo_tipo IN ('Venta', 'Cliente', 'Interna')),
  vinculo_id uuid, -- Referencia opcional (depende del vinculo_tipo)
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT tareas_pkey PRIMARY KEY (id),
  CONSTRAINT tareas_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id),
  CONSTRAINT tareas_responsable_id_fkey FOREIGN KEY (responsable_id) REFERENCES public.usuarios(id)
);

CREATE TABLE IF NOT EXISTS public.tarea_corresponsables (
  tarea_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT tarea_corresponsables_pkey PRIMARY KEY (tarea_id, usuario_id),
  CONSTRAINT tarea_corresponsables_tarea_id_fkey FOREIGN KEY (tarea_id) REFERENCES public.tareas(id) ON DELETE CASCADE,
  CONSTRAINT tarea_corresponsables_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.tarea_notas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tarea_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  comentario text NOT NULL,
  adjunto_url text,
  created_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT tarea_notas_pkey PRIMARY KEY (id),
  CONSTRAINT tarea_notas_tarea_id_fkey FOREIGN KEY (tarea_id) REFERENCES public.tareas(id) ON DELETE CASCADE,
  CONSTRAINT tarea_notas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id)
);

CREATE TABLE IF NOT EXISTS public.tarea_reprogramaciones (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tarea_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  fecha_original date NOT NULL,
  nueva_fecha date NOT NULL,
  motivo_cambio text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT tarea_reprogramaciones_pkey PRIMARY KEY (id),
  CONSTRAINT tarea_reprogramaciones_tarea_id_fkey FOREIGN KEY (tarea_id) REFERENCES public.tareas(id) ON DELETE CASCADE,
  CONSTRAINT tarea_reprogramaciones_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id)
);

-- Políticas RLS opcionales (Si tienen RLS activado)
-- Para asegurar el acceso y modificación


-- =========================================================================
-- MIGRACIÃ“N: SISTEMA DE INVENTARIO PERSONAL Y DEVOLUCIONES
-- =========================================================================

-- 1. Tabla de Inventario de Camioneta (Personal por Empleado)
CREATE TABLE IF NOT EXISTS public.inventario_empleados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id UUID REFERENCES public.usuarios(id) NOT NULL,
  producto_id UUID REFERENCES public.productos(id) NOT NULL,
  cantidad_disponible INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT inventario_empleados_unique UNIQUE(empleado_id, producto_id)
);

-- 2. ModificaciÃ³n a Evidencias (Para auditorÃ­a de sobrantes)
ALTER TABLE public.evidencias 
ADD COLUMN IF NOT EXISTS sobrantes_verificados BOOLEAN NOT NULL DEFAULT false;

-- 3. Tabla de Solicitudes de DevoluciÃ³n
CREATE TABLE IF NOT EXISTS public.devoluciones_empleado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id UUID REFERENCES public.usuarios(id) NOT NULL,
  empleado_nombre TEXT NOT NULL,
  estado VARCHAR NOT NULL CHECK (estado IN ('PENDIENTE', 'APROBADO', 'RECHAZADO')) DEFAULT 'PENDIENTE',
  materiales JSONB NOT NULL,
  observaciones TEXT,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  revisado_por UUID REFERENCES public.usuarios(id)
);


-- 4. Agregar proveedor principal a productos
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS proveedor_id UUID REFERENCES public.proveedores(id);



-- =========================================================================
-- ESTRUCTURA DE BASE DE DATOS: MÓDULO DE DOCUMENTOS Y FIRMAS DIGITALES
-- =========================================================================

-- 1. Tabla de Documentos y Plantillas de la Empresa (Emitidos por Admin)
CREATE TABLE IF NOT EXISTS public.documentos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descripcion text,
  contenido_html text,
  archivo_pdf_url text, -- URL del archivo PDF original subido por el admin (si aplica)
  tipo_documento text NOT NULL DEFAULT 'TEXTO' CHECK (tipo_documento IN ('TEXTO', 'PDF')),
  creador_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  creador_nombre text NOT NULL,
  requiere_todos boolean DEFAULT true,
  estado text NOT NULL DEFAULT 'PUBLICADO' CHECK (estado IN ('BORRADOR', 'PUBLICADO', 'ARCHIVADO')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT documentos_pkey PRIMARY KEY (id)
);

-- Si la tabla ya existía, agregar columnas para soporte de PDF original:
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS archivo_pdf_url text;
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS tipo_documento text DEFAULT 'TEXTO';
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS posicion_firma text DEFAULT 'AL_FINAL';

-- 2. Tabla de Asignaciones y Firmas por Empleado (Audit Log & Evidencia)
CREATE TABLE IF NOT EXISTS public.documentos_firmados (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL REFERENCES public.documentos(id) ON DELETE CASCADE,
  empleado_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  empleado_nombre text NOT NULL,
  empleado_email text,
  estado text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'FIRMADO', 'RECHAZADO')),
  firma_base64 text,
  firma_url text,
  pdf_firmado_url text,
  ip_registro text,
  ubicacion_gps text,
  dispositivo_info text,
  hash_sha256 text,
  motivo_rechazo text,
  firmado_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT documentos_firmados_pkey PRIMARY KEY (id),
  CONSTRAINT uq_documento_empleado UNIQUE (documento_id, empleado_id)
);

-- Permisos y Grantes para los roles de Supabase
GRANT ALL ON TABLE public.documentos TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.documentos_firmados TO anon, authenticated, service_role;



-- =========================================================================
-- ESQUEMA BASE DE DATOS: MÓDULO DE FACTURAS RECIBIDAS (CFDI SAT)
-- =========================================================================

-- 1. Tabla Principal de Facturas Recibidas (Comprobantes de Proveedores)
CREATE TABLE IF NOT EXISTS public.facturas_recibidas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  uuid text NOT NULL UNIQUE,
  rfc_emisor text NOT NULL,
  nombre_emisor text NOT NULL,
  rfc_receptor text NOT NULL,
  fecha_emision timestamp with time zone NOT NULL,
  subtotal numeric DEFAULT 0,
  descuento numeric DEFAULT 0,
  iva numeric DEFAULT 0,
  retencion_isr numeric DEFAULT 0,
  retencion_iva numeric DEFAULT 0,
  total numeric DEFAULT 0,
  moneda text DEFAULT 'MXN',
  tipo_comprobante text DEFAULT 'I', -- 'I': Ingreso, 'E': Egreso, 'P': Pago, 'N': Nómina
  estado_sat text DEFAULT 'VIGENTE', -- 'VIGENTE', 'CANCELADO'
  xml_url text,
  pdf_url text,
  conciliado_gasto_id uuid,
  conceptos_json jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),

  CONSTRAINT facturas_recibidas_pkey PRIMARY KEY (id),
  CONSTRAINT facturas_recibidas_gasto_fkey FOREIGN KEY (conciliado_gasto_id) REFERENCES public.gastos(id) ON DELETE SET NULL
);

-- Índices de alto rendimiento para facturas_recibidas
CREATE INDEX IF NOT EXISTS idx_facturas_recibidas_uuid ON public.facturas_recibidas(uuid);
CREATE INDEX IF NOT EXISTS idx_facturas_recibidas_rfc_emisor ON public.facturas_recibidas(rfc_emisor);
CREATE INDEX IF NOT EXISTS idx_facturas_recibidas_rfc_receptor ON public.facturas_recibidas(rfc_receptor);
CREATE INDEX IF NOT EXISTS idx_facturas_recibidas_fecha ON public.facturas_recibidas(fecha_emision DESC);
CREATE INDEX IF NOT EXISTS idx_facturas_recibidas_estado ON public.facturas_recibidas(estado_sat);

-- 2. Tabla de Control de Solicitudes Asíncronas de Descarga Masiva del SAT
CREATE TABLE IF NOT EXISTS public.sat_descarga_solicitudes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  id_solicitud text NOT NULL UNIQUE,
  rfc text NOT NULL,
  fecha_inicio timestamp with time zone NOT NULL,
  fecha_fin timestamp with time zone NOT NULL,
  tipo_solicitud text DEFAULT 'RECIBIDOS', -- 'RECIBIDOS', 'EMITIDOS'
  estado_sat text DEFAULT 'PENDIENTE', -- 'PENDIENTE' (1), 'EN_PROCESO' (2), 'TERMINADA' (3), 'ERROR' (4), 'RECHAZADA' (5)
  codigo_estatus text,
  mensaje_sat text,
  paquetes_ids text[] DEFAULT '{}',
  paquetes_descargados text[] DEFAULT '{}',
  total_facturas_procesadas integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),

  CONSTRAINT sat_descarga_solicitudes_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_sat_solicitudes_id_solicitud ON public.sat_descarga_solicitudes(id_solicitud);
CREATE INDEX IF NOT EXISTS idx_sat_solicitudes_estado ON public.sat_descarga_solicitudes(estado_sat);
CREATE INDEX IF NOT EXISTS idx_sat_solicitudes_rfc ON public.sat_descarga_solicitudes(rfc);

-- 3. Habilitar RLS
ALTER TABLE public.facturas_recibidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sat_descarga_solicitudes ENABLE ROW LEVEL SECURITY;

-- Políticas de seguridad
DO $$
BEGIN
  -- Políticas para facturas_recibidas
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'facturas_recibidas' AND policyname = 'Permitir lectura a usuarios autenticados'
  ) THEN
    CREATE POLICY "Permitir lectura a usuarios autenticados"
      ON public.facturas_recibidas
      FOR SELECT
      TO authenticated, anon
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'facturas_recibidas' AND policyname = 'Permitir insercion y edicion a service_role y authenticated'
  ) THEN
    CREATE POLICY "Permitir insercion y edicion a service_role y authenticated"
      ON public.facturas_recibidas
      FOR ALL
      TO service_role, authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  -- Políticas para sat_descarga_solicitudes
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sat_descarga_solicitudes' AND policyname = 'Permitir lectura solicitudes a autenticados'
  ) THEN
    CREATE POLICY "Permitir lectura solicitudes a autenticados"
      ON public.sat_descarga_solicitudes
      FOR SELECT
      TO authenticated, anon
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sat_descarga_solicitudes' AND policyname = 'Permitir insercion y edicion solicitudes a service_role y authenticated'
  ) THEN
    CREATE POLICY "Permitir insercion y edicion solicitudes a service_role y authenticated"
      ON public.sat_descarga_solicitudes
      FOR ALL
      TO service_role, authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- 4. Creación del Storage Bucket para los XMLs si no existe
INSERT INTO storage.buckets (id, name, public)
VALUES ('facturas_recibidas', 'facturas_recibidas', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Lectura publica facturas_recibidas'
  ) THEN
    CREATE POLICY "Lectura publica facturas_recibidas"
      ON storage.objects FOR SELECT
      TO anon, authenticated
      USING (bucket_id = 'facturas_recibidas');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Permitir carga facturas_recibidas'
  ) THEN
    CREATE POLICY "Permitir carga facturas_recibidas"
      ON storage.objects FOR INSERT
      TO anon, authenticated, service_role
      WITH CHECK (bucket_id = 'facturas_recibidas');
  END IF;
END $$;



-- =========================================================================
-- AUTOMATIZACIÓN DIARIA DE SINCRONIZACIÓN CON EL SAT (6:00 AM)
-- =========================================================================
-- Este script programa un Cron Job en la base de datos de Supabase
-- para invocar la Edge Function 'sync-facturas-recibidas' todos los días
-- a las 6:00 AM (Hora Centro de México / 12:00 UTC).
--
-- Requisitos en Supabase: Extensiones 'pg_cron' y 'pg_net'.
-- =========================================================================

-- 1. Habilitar extensiones de Cron y llamadas HTTP
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Otorgar permisos de ejecución a postgres
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- 2. Eliminar programación anterior si ya existía para evitar duplicados
DO $$
BEGIN
  PERFORM cron.unschedule('sync-facturas-sat-diario-6am');
EXCEPTION WHEN OTHERS THEN
  -- Ignorar si no existía el job previo
END $$;

-- 3. Crear el Cron Job para ejecutarse a las 12:00 UTC (06:00 AM Hora CDMX UTC-6)
-- Cron syntax: minuto hora dia_mes mes dia_semana
-- '0 12 * * *' = Todos los días a las 12:00:00 UTC (06:00 AM México)

SELECT cron.schedule(
  'sync-facturas-sat-diario-6am',
  '0 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://etpdebclhaxbpbuwxdmy.supabase.co/functions/v1/sync-facturas-recibidas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0cGRlYmNsaGF4YnBidXd4ZG15Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDQ5Nzg0MywiZXhwIjoyMDk2MDczODQzfQ.g1vYd_BiKcoEdNrTnN-jyQpXp-zqIoIPNu73l389u9s',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0cGRlYmNsaGF4YnBidXd4ZG15Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDQ5Nzg0MywiZXhwIjoyMDk2MDczODQzfQ.g1vYd_BiKcoEdNrTnN-jyQpXp-zqIoIPNu73l389u9s'
    ),
    body := jsonb_build_object('action', 'sync')
  ) AS request_id;
  $$
);

-- =========================================================================
-- CONSULTA PARA VERIFICAR LOS CRON JOBS ACTIVOS
-- =========================================================================
SELECT jobid, jobname, schedule, active FROM cron.job;
