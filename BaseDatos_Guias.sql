-- ============================================================================
-- Módulo de Guías y Checklists Rápidos (Compartido entre INTTEC y DARAVISA)
-- Ejecutar en la base central (inttec_test / inttec_prod)
-- Envuelto en bloque DO $$ para ejecutarse en una sola sentencia en CloudBeaver/DBeaver
-- ============================================================================

DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS guias_categorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(100) NOT NULL,
    icono VARCHAR(60) NOT NULL DEFAULT 'book-outline',
    color VARCHAR(20) NOT NULL DEFAULT '#0284c7',
    orden INT NOT NULL DEFAULT 0,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS guias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    categoria_id UUID REFERENCES guias_categorias(id) ON DELETE SET NULL,
    titulo VARCHAR(200) NOT NULL,
    subtitulo VARCHAR(300),
    tipo VARCHAR(40) NOT NULL DEFAULT 'CHECKLIST_SITIO',
    icono VARCHAR(60) DEFAULT 'document-text-outline',
    bloques JSONB NOT NULL DEFAULT '[]'::jsonb,
    texto_busqueda TEXT NOT NULL DEFAULT '',
    destacada BOOLEAN NOT NULL DEFAULT FALSE,
    publicada BOOLEAN NOT NULL DEFAULT TRUE,
    orden INT NOT NULL DEFAULT 0,
    creado_por_id UUID,
    creado_por_nombre VARCHAR(150),
    actualizado_por_nombre VARCHAR(150),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_guias_categoria ON guias(categoria_id);
  CREATE INDEX IF NOT EXISTS idx_guias_publicada ON guias(publicada, orden);

  -- Categorías iniciales (idempotente)
  INSERT INTO guias_categorias (nombre, icono, color, orden)
  SELECT 'Paneles Solares', 'sunny-outline', '#f59e0b', 1
  WHERE NOT EXISTS (SELECT 1 FROM guias_categorias WHERE LOWER(nombre) = LOWER('Paneles Solares'));

  INSERT INTO guias_categorias (nombre, icono, color, orden)
  SELECT 'CCTV / Cámaras', 'videocam-outline', '#0284c7', 2
  WHERE NOT EXISTS (SELECT 1 FROM guias_categorias WHERE LOWER(nombre) = LOWER('CCTV / Cámaras'));

  INSERT INTO guias_categorias (nombre, icono, color, orden)
  SELECT 'Minisplits', 'snow-outline', '#06b6d4', 3
  WHERE NOT EXISTS (SELECT 1 FROM guias_categorias WHERE LOWER(nombre) = LOWER('Minisplits'));

  INSERT INTO guias_categorias (nombre, icono, color, orden)
  SELECT 'Seguridad Eléctrica', 'flash-outline', '#dc2626', 4
  WHERE NOT EXISTS (SELECT 1 FROM guias_categorias WHERE LOWER(nombre) = LOWER('Seguridad Eléctrica'));
END $$;
