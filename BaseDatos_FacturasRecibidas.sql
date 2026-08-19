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
