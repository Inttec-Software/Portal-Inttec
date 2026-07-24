-- 1. Ampliación de la tabla Clientes para CFDI 4.0
ALTER TABLE public.clientes
ADD COLUMN razon_social text,
ADD COLUMN regimen_fiscal character varying(3),
ADD COLUMN uso_cfdi character varying(3);

-- 2. Modificaciones a la tabla: ventas
-- =====================================
ALTER TABLE ventas
ADD COLUMN IF NOT EXISTS cfdi_uuid VARCHAR(50),
ADD COLUMN IF NOT EXISTS cfdi_facturapi_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS cfdi_estado VARCHAR(20),
ADD COLUMN IF NOT EXISTS cfdi_pdf_url TEXT,
ADD COLUMN IF NOT EXISTS cfdi_xml_url TEXT;
