-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.perfiles (
  id uuid NOT NULL,
  nombre text NOT NULL,
  email text NOT NULL UNIQUE,
  rol text CHECK (rol = ANY (ARRAY['ADMIN'::text, 'EMPLEADO'::text])),
  telefono text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT perfiles_pkey PRIMARY KEY (id)
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
  CONSTRAINT gastos_pkey PRIMARY KEY (id),
  CONSTRAINT gastos_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.usuarios(id),
  CONSTRAINT gastos_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES public.ventas(id) ON DELETE SET NULL
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
  fotos_adicionales_urls text[],
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
CREATE INDEX idx_asistencias_empleado_fecha ON public.asistencias(empleado_id, fecha);
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
  estado text DEFAULT 'Borrador',
  creado_en timestamp with time zone DEFAULT now(),
  CONSTRAINT cotizaciones_pkey PRIMARY KEY (id)
);
