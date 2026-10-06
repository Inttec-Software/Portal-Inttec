import { Request, Response } from 'express';
import { getDbPool } from '../../config/database';

// === GET /api/auditoria/gastos ===
export const getGastosParaAuditoria = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const pool = getDbPool(tenant.company, tenant.env);

    const { tarjeta, metodoPago, minDate, maxDate } = req.query;

    let sql = `
      SELECT 
        g.*,
        CASE WHEN s.id IS NOT NULL THEN json_build_object(
          'id', s.id, 
          'nombre', s.nombre, 
          'categoria_id', s.categoria_id, 
          'categorias', json_build_object('id', c.id, 'nombre', c.nombre)
        ) ELSE null END as subcategoria_rel,
        CASE WHEN p.id IS NOT NULL THEN json_build_object('id', p.id, 'nombre', p.nombre) ELSE null END as proveedor_rel,
        CASE WHEN cl.id IS NOT NULL THEN json_build_object('id', cl.id, 'nombre', cl.nombre) ELSE null END as cliente_rel,
        CASE WHEN sc.id IS NOT NULL THEN json_build_object('id', sc.id, 'nombre', sc.nombre) ELSE null END as sucursal_rel
      FROM gastos g
      LEFT JOIN subcategorias s ON g.subcategoria_id = s.id
      LEFT JOIN categorias c ON s.categoria_id = c.id
      LEFT JOIN proveedores p ON g.proveedor_id = p.id
      LEFT JOIN clientes cl ON g.cliente_id = cl.id
      LEFT JOIN sucursales_cliente sc ON g.sucursal_id = sc.id
      WHERE g.status = 'APPROVED'
        AND g.tipo_tarjeta = $1
        AND g.fecha_comprobante >= $2
        AND g.fecha_comprobante <= $3
    `;
    const values: any[] = [tarjeta, minDate, maxDate];

    if (metodoPago !== 'tarjeta') {
      sql += ` AND g.metodo_pago = $4`;
      values.push(metodoPago);
    } else {
      sql += ` AND g.metodo_pago IN ('tarjeta', 'tarjeta_credito', 'tarjeta_debito')`;
    }

    const { rows } = await pool.query(sql, values);
    return res.json({ gastos: rows || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === POST /api/auditoria ===
export const guardarAuditoria = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const pool = getDbPool(tenant.company, tenant.env);

    const auditoria = req.body;
    const keys = Object.keys(auditoria);
    const values = Object.values(auditoria);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

    const { rows } = await pool.query(
      `INSERT INTO auditorias_tarjeta (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values
    );

    return res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === GET /api/auditoria ===
export const obtenerAuditorias = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const pool = getDbPool(tenant.company, tenant.env);

    const { tarjeta } = req.query;
    
    let sql = `SELECT * FROM auditorias_tarjeta`;
    const values: any[] = [];

    if (tarjeta && tarjeta !== 'TODAS') {
      sql += ` WHERE tarjeta = $1`;
      values.push(tarjeta);
    }
    
    sql += ` ORDER BY creado_en DESC`;

    const { rows } = await pool.query(sql, values);
    return res.json({ auditorias: rows || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === DELETE /api/auditoria/:id ===
export const eliminarAuditoria = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const pool = getDbPool(tenant.company, tenant.env);

    const { id } = req.params;

    await pool.query(`DELETE FROM auditorias_tarjeta WHERE id = $1`, [id]);
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
