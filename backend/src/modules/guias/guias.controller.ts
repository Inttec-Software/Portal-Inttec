import { Request, Response } from 'express';
import { getDbPool } from '../../config/database';

/**
 * Las guías y categorías se comparten entre INTTEC y DARAVISA usando
 * la base central de INTTEC (respetando test vs prod).
 */
const getSharedGuiasPool = (req: Request) => {
  const tenantEnv = (req as any).tenant?.env || 'cloud';
  return getDbPool('inttec', tenantEnv);
};

const isAdminUser = (req: Request): boolean => {
  const rol = String(req.user?.rol || '').toUpperCase();
  return rol === 'ADMIN' || rol === 'DEV';
};

const extractSearchText = (titulo: string, subtitulo: string, bloques: any[]): string => {
  const parts: string[] = [titulo || '', subtitulo || ''];

  for (const block of Array.isArray(bloques) ? bloques : []) {
    if (!block || typeof block !== 'object') continue;
    if (block.titulo) parts.push(String(block.titulo));
    if (block.mensaje) parts.push(String(block.mensaje));
    if (block.descripcion) parts.push(String(block.descripcion));

    if (Array.isArray(block.items)) {
      for (const item of block.items) {
        if (item?.texto) parts.push(String(item.texto));
        if (item?.cantidad) parts.push(String(item.cantidad));
        if (item?.nota) parts.push(String(item.nota));
      }
    }

    if (Array.isArray(block.grupos)) {
      for (const grupo of block.grupos) {
        if (grupo?.nombre) parts.push(String(grupo.nombre));
        for (const item of grupo?.items || []) {
          if (item?.nombre) parts.push(String(item.nombre));
          if (item?.cantidad) parts.push(String(item.cantidad));
          if (item?.nota) parts.push(String(item.nota));
        }
      }
    }

    if (Array.isArray(block.pasos)) {
      for (const paso of block.pasos) {
        if (paso?.titulo) parts.push(String(paso.titulo));
        if (paso?.detalle) parts.push(String(paso.detalle));
      }
    }

    if (Array.isArray(block.variantes)) {
      for (const v of block.variantes) {
        parts.push(v?.valor_1 || '', v?.valor_2 || '', v?.valor_3 || '', v?.notas || '');
        for (const c of v?.cortes || []) {
          parts.push(c?.pieza || '', c?.instruccion || '');
        }
        for (const m of v?.materiales || []) {
          parts.push(m?.nombre || '', m?.cantidad || '');
        }
      }
    }
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
};

export const listarCategorias = async (req: Request, res: Response) => {
  try {
    const pool = getSharedGuiasPool(req);
    const includeInactive = isAdminUser(req) && req.query.includeInactive === 'true';

    const query = includeInactive
      ? 'SELECT * FROM guias_categorias ORDER BY orden ASC, nombre ASC'
      : 'SELECT * FROM guias_categorias WHERE activo = TRUE ORDER BY orden ASC, nombre ASC';

    const { rows } = await pool.query(query);
    return res.json(rows);
  } catch (error: any) {
    console.error('[Guias] Error listando categorías:', error);
    return res.status(500).json({ error: error.message || 'Error al obtener categorías' });
  }
};

export const crearCategoria = async (req: Request, res: Response) => {
  if (!isAdminUser(req)) {
    return res.status(403).json({ error: 'Solo administradores pueden gestionar categorías.' });
  }

  try {
    const { nombre, icono = 'book-outline', color = '#0284c7', orden = 0, activo = true } = req.body;
    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ error: 'El nombre de la categoría es obligatorio.' });
    }

    const pool = getSharedGuiasPool(req);
    const { rows } = await pool.query(
      `INSERT INTO guias_categorias (nombre, icono, color, orden, activo)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [String(nombre).trim(), String(icono), String(color), Number(orden) || 0, Boolean(activo)]
    );

    return res.status(201).json(rows[0]);
  } catch (error: any) {
    console.error('[Guias] Error creando categoría:', error);
    return res.status(500).json({ error: error.message || 'Error al crear categoría' });
  }
};

export const actualizarCategoria = async (req: Request, res: Response) => {
  if (!isAdminUser(req)) {
    return res.status(403).json({ error: 'Solo administradores pueden gestionar categorías.' });
  }

  try {
    const { id } = req.params;
    const { nombre, icono, color, orden, activo } = req.body;

    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ error: 'El nombre de la categoría es obligatorio.' });
    }

    const pool = getSharedGuiasPool(req);
    const { rows } = await pool.query(
      `UPDATE guias_categorias
       SET nombre = $1,
           icono = COALESCE($2, icono),
           color = COALESCE($3, color),
           orden = COALESCE($4, orden),
           activo = COALESCE($5, activo)
       WHERE id = $6
       RETURNING *`,
      [
        String(nombre).trim(),
        icono ?? null,
        color ?? null,
        orden !== undefined ? Number(orden) : null,
        activo !== undefined ? Boolean(activo) : null,
        id,
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Categoría no encontrada.' });
    }

    return res.json(rows[0]);
  } catch (error: any) {
    console.error('[Guias] Error actualizando categoría:', error);
    return res.status(500).json({ error: error.message || 'Error al actualizar categoría' });
  }
};

export const eliminarCategoria = async (req: Request, res: Response) => {
  if (!isAdminUser(req)) {
    return res.status(403).json({ error: 'Solo administradores pueden gestionar categorías.' });
  }

  try {
    const { id } = req.params;
    const pool = getSharedGuiasPool(req);
    const { rowCount } = await pool.query('DELETE FROM guias_categorias WHERE id = $1', [id]);

    if (!rowCount) {
      return res.status(404).json({ error: 'Categoría no encontrada.' });
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error('[Guias] Error eliminando categoría:', error);
    return res.status(500).json({ error: error.message || 'Error al eliminar categoría' });
  }
};

export const listarGuias = async (req: Request, res: Response) => {
  try {
    const pool = getSharedGuiasPool(req);
    const includeDrafts = isAdminUser(req) && req.query.includeDrafts === 'true';

    const whereClause = includeDrafts ? '' : 'WHERE g.publicada = TRUE';
    const { rows } = await pool.query(`
      SELECT
        g.*,
        c.nombre AS categoria_nombre,
        c.icono AS categoria_icono,
        c.color AS categoria_color
      FROM guias g
      LEFT JOIN guias_categorias c ON c.id = g.categoria_id
      ${whereClause}
      ORDER BY g.destacada DESC, g.orden ASC, g.updated_at DESC
    `);

    return res.json(rows);
  } catch (error: any) {
    console.error('[Guias] Error listando guías:', error);
    return res.status(500).json({ error: error.message || 'Error al obtener guías' });
  }
};

export const obtenerGuiaPorId = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pool = getSharedGuiasPool(req);
    const admin = isAdminUser(req);

    const { rows } = await pool.query(
      `SELECT
        g.*,
        c.nombre AS categoria_nombre,
        c.icono AS categoria_icono,
        c.color AS categoria_color
       FROM guias g
       LEFT JOIN guias_categorias c ON c.id = g.categoria_id
       WHERE g.id = $1 ${admin ? '' : 'AND g.publicada = TRUE'}`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Guía no encontrada.' });
    }

    return res.json(rows[0]);
  } catch (error: any) {
    console.error('[Guias] Error obteniendo guía:', error);
    return res.status(500).json({ error: error.message || 'Error al obtener la guía' });
  }
};

export const crearGuia = async (req: Request, res: Response) => {
  if (!isAdminUser(req)) {
    return res.status(403).json({ error: 'Solo administradores pueden crear guías.' });
  }

  try {
    const {
      categoria_id = null,
      titulo,
      subtitulo = '',
      tipo = 'CHECKLIST_SITIO',
      icono = 'document-text-outline',
      bloques = [],
      destacada = false,
      publicada = true,
      orden = 0,
    } = req.body;

    if (!titulo || !String(titulo).trim()) {
      return res.status(400).json({ error: 'El título de la guía es obligatorio.' });
    }
    if (!Array.isArray(bloques)) {
      return res.status(400).json({ error: 'El campo bloques debe ser un arreglo.' });
    }

    const cleanTitulo = String(titulo).trim();
    const cleanSubtitulo = subtitulo ? String(subtitulo).trim() : '';
    const textoBusqueda = extractSearchText(cleanTitulo, cleanSubtitulo, bloques);
    const userId = req.user?.id || null;
    const userName = req.user?.nombre || req.user?.email || 'Administrador';

    const pool = getSharedGuiasPool(req);
    const { rows } = await pool.query(
      `INSERT INTO guias
        (categoria_id, titulo, subtitulo, tipo, icono, bloques, texto_busqueda, destacada, publicada, orden, creado_por_id, creado_por_nombre, actualizado_por_nombre)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $12)
       RETURNING *`,
      [
        categoria_id || null,
        cleanTitulo,
        cleanSubtitulo,
        String(tipo),
        String(icono || 'document-text-outline'),
        JSON.stringify(bloques),
        textoBusqueda,
        Boolean(destacada),
        Boolean(publicada),
        Number(orden) || 0,
        userId,
        userName,
      ]
    );

    return res.status(201).json(rows[0]);
  } catch (error: any) {
    console.error('[Guias] Error creando guía:', error);
    return res.status(500).json({ error: error.message || 'Error al crear la guía' });
  }
};

export const actualizarGuia = async (req: Request, res: Response) => {
  if (!isAdminUser(req)) {
    return res.status(403).json({ error: 'Solo administradores pueden editar guías.' });
  }

  try {
    const { id } = req.params;
    const {
      categoria_id = null,
      titulo,
      subtitulo = '',
      tipo = 'CHECKLIST_SITIO',
      icono = 'document-text-outline',
      bloques = [],
      destacada = false,
      publicada = true,
      orden = 0,
    } = req.body;

    if (!titulo || !String(titulo).trim()) {
      return res.status(400).json({ error: 'El título de la guía es obligatorio.' });
    }
    if (!Array.isArray(bloques)) {
      return res.status(400).json({ error: 'El campo bloques debe ser un arreglo.' });
    }

    const cleanTitulo = String(titulo).trim();
    const cleanSubtitulo = subtitulo ? String(subtitulo).trim() : '';
    const textoBusqueda = extractSearchText(cleanTitulo, cleanSubtitulo, bloques);
    const userName = req.user?.nombre || req.user?.email || 'Administrador';

    const pool = getSharedGuiasPool(req);
    const { rows } = await pool.query(
      `UPDATE guias
       SET categoria_id = $1,
           titulo = $2,
           subtitulo = $3,
           tipo = $4,
           icono = $5,
           bloques = $6::jsonb,
           texto_busqueda = $7,
           destacada = $8,
           publicada = $9,
           orden = $10,
           actualizado_por_nombre = $11,
           updated_at = NOW()
       WHERE id = $12
       RETURNING *`,
      [
        categoria_id || null,
        cleanTitulo,
        cleanSubtitulo,
        String(tipo),
        String(icono || 'document-text-outline'),
        JSON.stringify(bloques),
        textoBusqueda,
        Boolean(destacada),
        Boolean(publicada),
        Number(orden) || 0,
        userName,
        id,
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Guía no encontrada.' });
    }

    return res.json(rows[0]);
  } catch (error: any) {
    console.error('[Guias] Error actualizando guía:', error);
    return res.status(500).json({ error: error.message || 'Error al actualizar la guía' });
  }
};

export const eliminarGuia = async (req: Request, res: Response) => {
  if (!isAdminUser(req)) {
    return res.status(403).json({ error: 'Solo administradores pueden eliminar guías.' });
  }

  try {
    const { id } = req.params;
    const pool = getSharedGuiasPool(req);
    const { rowCount } = await pool.query('DELETE FROM guias WHERE id = $1', [id]);

    if (!rowCount) {
      return res.status(404).json({ error: 'Guía no encontrada.' });
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error('[Guias] Error eliminando guía:', error);
    return res.status(500).json({ error: error.message || 'Error al eliminar la guía' });
  }
};
