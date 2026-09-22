-- ==============================================================================
-- MIGRACIÓN: Tablas para Complementos de Recepción de Pagos (REP - CFDI 4.0 Pagos 2.0)
-- Ejecutar en el SQL Editor de Supabase (tanto para Inttec como para Daravisa si aplica)
-- ==============================================================================

-- 1. Cabecera de Complementos de Pago
CREATE TABLE IF NOT EXISTS complementos_pago (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serie VARCHAR(10) NOT NULL DEFAULT 'P',
  folio VARCHAR(20) NOT NULL,
  cliente_id UUID,
  cliente_nombre TEXT NOT NULL,
  cliente_rfc VARCHAR(15) NOT NULL,
  cliente_cp VARCHAR(10),
  cliente_regimen VARCHAR(10),
  monto_total NUMERIC(12, 2) NOT NULL,
  fecha_pago TIMESTAMPTZ NOT NULL,
  forma_pago_sat VARCHAR(5) NOT NULL DEFAULT '03',
  moneda VARCHAR(5) NOT NULL DEFAULT 'MXN',
  num_operacion TEXT,
  cfdi_uuid VARCHAR(50),
  cfdi_xml_url TEXT,
  cfdi_estado VARCHAR(20) NOT NULL DEFAULT 'TIMBRADA',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Detalle de Documentos Relacionados por Pago (Soporta 1 a N facturas)
CREATE TABLE IF NOT EXISTS complementos_pago_doctos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complemento_pago_id UUID NOT NULL REFERENCES complementos_pago(id) ON DELETE CASCADE,
  venta_id BIGINT,
  uuid_documento VARCHAR(50) NOT NULL,
  serie VARCHAR(10),
  folio VARCHAR(20),
  moneda_dr VARCHAR(5) DEFAULT 'MXN',
  num_parcialidad INT NOT NULL DEFAULT 1,
  saldo_anterior NUMERIC(12, 2) NOT NULL,
  importe_pagado NUMERIC(12, 2) NOT NULL,
  saldo_insoluto NUMERIC(12, 2) NOT NULL,
  objeto_imp_dr VARCHAR(5) DEFAULT '02',
  base_iva NUMERIC(12, 2) NOT NULL,
  importe_iva NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Extender ventas_pagos para vincular con el CFDI de pago
ALTER TABLE ventas_pagos ADD COLUMN IF NOT EXISTS complemento_pago_id UUID;
ALTER TABLE ventas_pagos ADD COLUMN IF NOT EXISTS cfdi_uuid VARCHAR(50);
ALTER TABLE ventas_pagos ADD COLUMN IF NOT EXISTS parcialidad INT DEFAULT 1;
ALTER TABLE ventas_pagos ADD COLUMN IF NOT EXISTS saldo_anterior NUMERIC(12, 2);
ALTER TABLE ventas_pagos ADD COLUMN IF NOT EXISTS saldo_insoluto NUMERIC(12, 2);

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_comp_pago_uuid ON complementos_pago(cfdi_uuid);
CREATE INDEX IF NOT EXISTS idx_comp_pago_cliente ON complementos_pago(cliente_id);
CREATE INDEX IF NOT EXISTS idx_comp_pago_folio ON complementos_pago(folio);
CREATE INDEX IF NOT EXISTS idx_comp_doctos_pago ON complementos_pago_doctos(complemento_pago_id);
CREATE INDEX IF NOT EXISTS idx_comp_doctos_uuid ON complementos_pago_doctos(uuid_documento);
