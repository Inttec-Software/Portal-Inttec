-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.usuarios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  email text NOT NULL UNIQUE,
  password text NOT NULL,
  rol text NOT NULL CHECK (rol = ANY (ARRAY['ADMIN'::text, 'EMPLEADO'::text])),
  telefono text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT usuarios_pkey PRIMARY KEY (id)
);
CREATE TABLE public.perfiles (
  id uuid NOT NULL,
  nombre text NOT NULL,
  email text NOT NULL UNIQUE,
  rol text CHECK (rol = ANY (ARRAY['ADMIN'::text, 'EMPLEADO'::text])),
  telefono text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT perfiles_pkey PRIMARY KEY (id)
);
CREATE TABLE public.clientes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  rfc text,
  correo_electronico text,
  direccion text,
  codigo_postal text,
  CONSTRAINT clientes_pkey PRIMARY KEY (id)
);
CREATE TABLE public.categorias (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  CONSTRAINT categorias_pkey PRIMARY KEY (id)
);
CREATE TABLE public.subcategorias (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  categoria_id uuid NOT NULL,
  nombre text NOT NULL,
  CONSTRAINT subcategorias_pkey PRIMARY KEY (id),
  CONSTRAINT subcat_cat_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id)
);
CREATE TABLE public.gastos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  empleado_id uuid NOT NULL,
  empleado_nombre text,
  monto numeric NOT NULL,
  categoria text,
  subcategoria text,
  metodo_pago text CHECK (metodo_pago = ANY (ARRAY['efectivo'::text, 'tarjeta'::text, 'tarjeta_credito'::text, 'tarjeta_debito'::text])),
  justificacion text,
  foto_url text,
  status text DEFAULT 'PENDING'::text CHECK (status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text, 'ACTION_REQUIRED'::text])),
  rejection_feedback text,
  created_at timestamp with time zone DEFAULT now(),
  approved_at timestamp with time zone,
  fecha_comprobante date,
  proveedor text,
  cliente text,
  sucursal text,
  tipo_tarjeta character varying,
  ubicacion_registro character varying,
  estado text,
  facturado boolean DEFAULT false,
  factura_url text,
  motivo_sin_factura text,
  venta_id uuid,
  tipo_servicio_proyecto text,
  detalle_servicio_proyecto text,
  CONSTRAINT gastos_pkey PRIMARY KEY (id),
  CONSTRAINT gastos_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.usuarios(id),
  CONSTRAINT gastos_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES public.ventas(id)
);
CREATE TABLE public.evidencias (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  empleado_id uuid NOT NULL,
  empleado_nombre text,
  cliente text NOT NULL,
  descripcion_trabajo text NOT NULL,
  materiales_usados text,
  observaciones text,
  foto_antes_url text,
  foto_despues_url text,
  fotos_adicionales_urls ARRAY,
  resumen_ia text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT evidencias_pkey PRIMARY KEY (id),
  CONSTRAINT evidencias_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.usuarios(id)
);
CREATE TABLE public.asistencias (
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
CREATE TABLE public.cotizaciones (
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
  CONSTRAINT cotizaciones_pkey PRIMARY KEY (id)
);
CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  timestamp timestamp with time zone DEFAULT now(),
  action text CHECK (action = ANY (ARRAY['CREATE'::text, 'APPROVE'::text, 'REJECT'::text, 'UPDATE'::text])),
  actor_id uuid,
  target_id text NOT NULL,
  details text,
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.vehiculos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  marca text NOT NULL,
  modelo text NOT NULL,
  anio integer NOT NULL,
  placas text NOT NULL UNIQUE,
  numero_economico text,
  activo boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT vehiculos_pkey PRIMARY KEY (id)
);
CREATE TABLE public.registro_gasolina (
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
  CONSTRAINT registro_gasolina_gasto_id_fkey FOREIGN KEY (gasto_id) REFERENCES public.gastos(id),
  CONSTRAINT registro_gasolina_vehiculo_id_fkey FOREIGN KEY (vehiculo_id) REFERENCES public.vehiculos(id),
  CONSTRAINT registro_gasolina_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.usuarios(id)
);
CREATE TABLE public.ventas (
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
  CONSTRAINT ventas_pkey PRIMARY KEY (id),
  CONSTRAINT ventas_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.usuarios(id)
);
CREATE TABLE public.categorias_productos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  descripcion text,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT categorias_productos_pkey PRIMARY KEY (id)
);
CREATE TABLE public.proveedores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  rfc character varying UNIQUE,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT proveedores_pkey PRIMARY KEY (id)
);
CREATE TABLE public.productos (
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
CREATE TABLE public.alias_proveedor_producto (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  proveedor_id uuid NOT NULL,
  producto_id uuid NOT NULL,
  nombre_segun_proveedor text NOT NULL,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT alias_proveedor_producto_pkey PRIMARY KEY (id),
  CONSTRAINT alias_proveedor_producto_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(id),
  CONSTRAINT alias_proveedor_producto_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id)
);
CREATE TABLE public.movimientos_inventario (
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
CREATE TABLE public.ventas_partidas (
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
  CONSTRAINT ventas_partidas_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES public.ventas(id)
);
CREATE TABLE public.auditorias_tarjeta (
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
CREATE TABLE public.app_settings (
  id integer NOT NULL DEFAULT 1,
  min_version_code integer NOT NULL DEFAULT 1,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT app_settings_pkey PRIMARY KEY (id)
);
