-- ==============================================================================
-- MIGRACIÓN: Tablas Independientes para Facturación Fiscal (CFDI 4.0)
-- Desacopla Facturación de la tabla Ventas para evitar duplicar montos comerciales.
-- Ejecutar en el SQL Editor de Supabase (Inttec y Daravisa).
-- ==============================================================================

-- 1. TABLA DEDICADA DE FACTURAS EMITIDAS
CREATE TABLE IF NOT EXISTS public.facturas_emitidas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serie VARCHAR(10) NOT NULL DEFAULT 'A',
  folio VARCHAR(20) NOT NULL,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nombre TEXT NOT NULL,
  cliente_rfc VARCHAR(15) NOT NULL,
  cliente_cp VARCHAR(10),
  cliente_regimen VARCHAR(10),
  cliente_uso_cfdi VARCHAR(10) DEFAULT 'G03',
  forma_pago VARCHAR(5) DEFAULT '03',
  metodo_pago VARCHAR(5) DEFAULT 'PUE',
  moneda VARCHAR(5) DEFAULT 'MXN',
  subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0,
  iva NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_pagado NUMERIC(14, 2) DEFAULT 0,
  saldo_pendiente NUMERIC(14, 2) DEFAULT 0,
  estado_pago VARCHAR(30) DEFAULT 'PENDIENTE DE PAGO',
  cfdi_uuid VARCHAR(50) UNIQUE,
  cfdi_estado VARCHAR(20) NOT NULL DEFAULT 'BORRADOR', -- 'BORRADOR', 'TIMBRADA', 'CANCELADA'
  cfdi_xml_url TEXT,
  cfdi_pdf_url TEXT,
  fecha_emision TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  orden_compra TEXT,
  notas JSONB,
  venta_id UUID REFERENCES public.ventas(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. PARTIDAS FISCALES DE LA FACTURA
CREATE TABLE IF NOT EXISTS public.facturas_emitidas_partidas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_id UUID NOT NULL REFERENCES public.facturas_emitidas(id) ON DELETE CASCADE,
  descripcion TEXT NOT NULL,
  cantidad NUMERIC(12, 4) NOT NULL DEFAULT 1,
  precio_unitario NUMERIC(14, 2) NOT NULL DEFAULT 0,
  importe NUMERIC(14, 2) NOT NULL DEFAULT 0,
  clave_sat VARCHAR(20) NOT NULL DEFAULT '01010101',
  clave_unidad VARCHAR(10) NOT NULL DEFAULT 'H87',
  unidad VARCHAR(30) DEFAULT 'Pieza',
  objeto_imp VARCHAR(5) DEFAULT '02',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_fact_emit_uuid ON public.facturas_emitidas(cfdi_uuid);
CREATE INDEX IF NOT EXISTS idx_fact_emit_folio ON public.facturas_emitidas(serie, folio);
CREATE INDEX IF NOT EXISTS idx_fact_emit_estado ON public.facturas_emitidas(cfdi_estado);
CREATE INDEX IF NOT EXISTS idx_fact_emit_cliente ON public.facturas_emitidas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_fact_emit_venta ON public.facturas_emitidas(venta_id);
CREATE INDEX IF NOT EXISTS idx_fact_partidas_factura ON public.facturas_emitidas_partidas(factura_id);

-- 3. ACTUALIZAR COMPLEMENTOS DE PAGO PARA VINCULAR DIRECTO A FACTURAS EMITIDAS
ALTER TABLE public.complementos_pago_doctos 
  ADD COLUMN IF NOT EXISTS factura_id UUID REFERENCES public.facturas_emitidas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_comp_doctos_factura ON public.complementos_pago_doctos(factura_id);

-- 4. MIGRAR HISTÓRICO DE FACTURAS DESDE VENTAS A FACTURAS_EMITIDAS
INSERT INTO public.facturas_emitidas (
  id,
  serie,
  folio,
  cliente_nombre,
  cliente_rfc,
  total,
  subtotal,
  iva,
  saldo_pendiente,
  total_pagado,
  estado_pago,
  cfdi_uuid,
  cfdi_estado,
  cfdi_xml_url,
  cfdi_pdf_url,
  fecha_emision,
  orden_compra,
  created_at
)
SELECT 
  v.id,
  COALESCE(NULLIF(SUBSTRING(v.folio FROM '^[A-Za-z]+'), ''), 'A') AS serie,
  COALESCE(NULLIF(SUBSTRING(v.folio FROM '[0-9]+$'), ''), v.folio, '0001') AS folio,
  COALESCE(v.cliente, 'PUBLICO EN GENERAL'),
  'XAXX010101000',
  COALESCE(v.precio_total_facturado, 0),
  ROUND((COALESCE(v.precio_total_facturado, 0) / 1.16), 2),
  ROUND(COALESCE(v.precio_total_facturado, 0) - (COALESCE(v.precio_total_facturado, 0) / 1.16), 2),
  COALESCE(v.saldo_pendiente, 0),
  COALESCE(v.total_pagado, 0),
  COALESCE(v.estado_pago, 'PENDIENTE DE PAGO'),
  v.cfdi_uuid::text,
  COALESCE(v.cfdi_estado, 'TIMBRADA'),
  v.cfdi_xml_url,
  v.cfdi_pdf_url,
  COALESCE(v.fecha::timestamptz, v.created_at),
  v.orden_compra,
  v.created_at
FROM public.ventas v
WHERE v.cfdi_uuid IS NOT NULL 
   OR v.cfdi_estado IN ('TIMBRADA', 'CANCELADA', 'BORRADOR')
   OR v.tipo_proyecto = 'Factura Directa'
ON CONFLICT (id) DO NOTHING;

-- Migrar partidas históricas
INSERT INTO public.facturas_emitidas_partidas (
  factura_id,
  descripcion,
  cantidad,
  precio_unitario,
  importe,
  clave_sat,
  clave_unidad,
  unidad
)
SELECT 
  vp.venta_id,
  COALESCE(vp.descripcion, 'Concepto'),
  COALESCE(vp.cantidad, 1),
  COALESCE(vp.precio_unitario_venta, 0),
  COALESCE(vp.precio_total_venta, COALESCE(vp.cantidad, 1) * COALESCE(vp.precio_unitario_venta, 0)),
  '01010101',
  'H87',
  COALESCE(vp.unidad, 'Pieza')
FROM public.ventas_partidas vp
WHERE vp.venta_id IN (SELECT id FROM public.facturas_emitidas)
ON CONFLICT DO NOTHING;

-- 5. VISTA DE AUDITORÍA Y CONCILIACIÓN
CREATE OR REPLACE VIEW vista_conciliacion_duplicados_ventas AS
SELECT 
  id,
  cliente,
  fecha,
  folio,
  factura_referencia,
  tipo_proyecto,
  precio_total_facturado,
  cfdi_uuid,
  cfdi_estado,
  created_at
FROM public.ventas
WHERE tipo_proyecto = 'Factura Directa'
  AND (factura_referencia IS NULL OR factura_referencia = '' OR factura_referencia = folio);
