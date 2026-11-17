import { Pool, PoolClient } from 'pg';

export type ProyectoCategoriaKey =
  | 'ALIMENTOS'
  | 'HOSPEDAJE'
  | 'MATERIAL'
  | 'EQUIPO'
  | 'TRANSPORTE'
  | 'OTROS';

export type TransporteSubtipoKey = 'COMBUSTIBLE' | 'TRASLADOS' | null;

export interface HospedajeDiaCalculado {
  fecha: string;
  monto_diario: number;
}

const VALID_GASTO_COLUMNS = new Set([
  'id',
  'empleado_id',
  'empleado_nombre',
  'monto',
  'metodo_pago',
  'justificacion',
  'foto_url',
  'status',
  'rejection_feedback',
  'created_at',
  'approved_at',
  'fecha_comprobante',
  'tipo_tarjeta',
  'ubicacion_registro',
  'facturado',
  'factura_url',
  'motivo_sin_factura',
  'tipo_servicio_proyecto',
  'detalle_servicio_proyecto',
  'venta_id',
  'categoria_id',
  'subcategoria_id',
  'proveedor_id',
  'cliente_id',
  'sucursal_id',
  'estado_reembolso',
  'conciliacion_activa',
  'factura_recibida_id',
  'factura_sugerida_id',
  'devuelto_por_factura',
  'facturas_descartadas_ids',
  'monto_propina',
  'es_factura_compartida',
  'proyecto_id',
  'tipo_gasto',
  'subtipo_traslado',
  'fecha_hospedaje_inicio',
  'fecha_hospedaje_fin',
]);

const NULLABLE_UUID_OR_DATE_FIELDS = new Set([
  'venta_id',
  'categoria_id',
  'subcategoria_id',
  'proveedor_id',
  'cliente_id',
  'sucursal_id',
  'factura_recibida_id',
  'factura_sugerida_id',
  'proyecto_id',
  'fecha_comprobante',
  'fecha_hospedaje_inicio',
  'fecha_hospedaje_fin',
  'approved_at',
]);

export const FACTURA_REL_SUBQUERIES_SQL = `
  (SELECT row_to_json(fs_obj) FROM (
    SELECT f.id, f.uuid, f.rfc_emisor, f.nombre_emisor, f.rfc_receptor, f.fecha_emision,
           f.subtotal, f.descuento, f.iva, f.retencion_isr, f.retencion_iva, f.total,
           f.moneda, f.tipo_comprobante, f.estado_sat, f.xml_url, f.pdf_url, f.conceptos_json
    FROM facturas_recibidas f WHERE f.id = g.factura_sugerida_id
  ) fs_obj) as factura_sugerida_rel,
  (SELECT row_to_json(fr_obj) FROM (
    SELECT f.id, f.uuid, f.rfc_emisor, f.nombre_emisor, f.rfc_receptor, f.fecha_emision,
           f.subtotal, f.descuento, f.iva, f.retencion_isr, f.retencion_iva, f.total,
           f.moneda, f.tipo_comprobante, f.estado_sat, f.xml_url, f.pdf_url, f.conceptos_json,
           (
             SELECT COALESCE(SUM(COALESCE(g2.monto, 0) - COALESCE(g2.monto_propina, 0)), 0)
             FROM gastos g2
             WHERE g2.factura_recibida_id = f.id
           ) as total_consumido,
           (
             SELECT COALESCE(COUNT(g2.id), 0)
             FROM gastos g2
             WHERE g2.factura_recibida_id = f.id
           ) as total_gastos_vinculados
    FROM facturas_recibidas f WHERE f.id = g.factura_recibida_id
  ) fr_obj) as factura_recibida_rel
`;

export const GASTO_RELATIONS_SELECT_SQL = `
  (SELECT row_to_json(s_obj) FROM (
    SELECT s.id, s.nombre, s.categoria_id,
           (SELECT row_to_json(c_obj) FROM (SELECT c.id, c.nombre FROM categorias c WHERE c.id = s.categoria_id) c_obj) as categorias
    FROM subcategorias s WHERE s.id = g.subcategoria_id
  ) s_obj) as subcategoria_rel,
  (SELECT row_to_json(p_obj) FROM (SELECT p.id, p.nombre FROM proveedores p WHERE p.id = g.proveedor_id) p_obj) as proveedor_rel,
  (SELECT row_to_json(cl_obj) FROM (SELECT cl.id, cl.nombre FROM clientes cl WHERE cl.id = g.cliente_id) cl_obj) as cliente_rel,
  (SELECT row_to_json(sc_obj) FROM (SELECT sc.id, sc.nombre FROM sucursales_cliente sc WHERE sc.id = g.sucursal_id) sc_obj) as sucursal_rel,
  (SELECT row_to_json(v_obj) FROM (SELECT v.id, v.cliente, v.fecha, v.sucursal, v.tipo_proyecto, v.factura_referencia, v.precio_total_facturado FROM ventas v WHERE v.id = g.venta_id) v_obj) as venta_rel,
  (SELECT row_to_json(pr_obj) FROM (
    SELECT pr.id, pr.nombre, pr.cliente_id, pr.sucursal_id, pr.status,
           (SELECT cl.nombre FROM clientes cl WHERE cl.id = pr.cliente_id) as cliente_nombre,
           (SELECT sc.nombre FROM sucursales_cliente sc WHERE sc.id = pr.sucursal_id) as sucursal_nombre
    FROM proyectos pr WHERE pr.id = g.proyecto_id
  ) pr_obj) as proyecto_rel,
  COALESCE((
    SELECT json_agg(row_to_json(hd_obj) ORDER BY hd_obj.fecha ASC)
    FROM (
      SELECT hd.id, hd.gasto_id, hd.fecha::text AS fecha, hd.monto_diario
      FROM gastos_hospedaje_dias hd
      WHERE hd.gasto_id = g.id
    ) hd_obj
  ), '[]'::json) as hospedaje_dias,
  ${FACTURA_REL_SUBQUERIES_SQL}
`;

const normalizeText = (value: unknown): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export const classifyGastoParaProyecto = (g: any): {
  categoria_proyecto: ProyectoCategoriaKey;
  subcategoria_transporte: TransporteSubtipoKey;
} => {
  const cat = normalizeText(g.subcategoria_rel?.categorias?.nombre || g.categoria_nombre || g.cat);
  const sub = normalizeText(g.subcategoria_rel?.nombre || g.subcategoria_nombre || g.subcat);
  const subtipoTraslado = String(g.subtipo_traslado || '').trim().toUpperCase();

  if (sub === 'alimentos') {
    return { categoria_proyecto: 'ALIMENTOS', subcategoria_transporte: null };
  }

  if (sub === 'hospedaje' || (g.fecha_hospedaje_inicio && g.fecha_hospedaje_fin)) {
    return { categoria_proyecto: 'HOSPEDAJE', subcategoria_transporte: null };
  }

  if (cat === 'material' || sub.startsWith('material')) {
    return { categoria_proyecto: 'MATERIAL', subcategoria_transporte: null };
  }

  if (cat === 'equipo' || sub.startsWith('equipo')) {
    return { categoria_proyecto: 'EQUIPO', subcategoria_transporte: null };
  }

  if (sub === 'combustible') {
    return { categoria_proyecto: 'TRANSPORTE', subcategoria_transporte: 'COMBUSTIBLE' };
  }

  if (
    subtipoTraslado ||
    sub === 'traslados' ||
    sub === 'vuelos' ||
    sub === 'renta de autos'
  ) {
    return { categoria_proyecto: 'TRANSPORTE', subcategoria_transporte: 'TRASLADOS' };
  }

  if (cat === 'vehiculos') {
    return { categoria_proyecto: 'TRANSPORTE', subcategoria_transporte: 'TRASLADOS' };
  }

  return { categoria_proyecto: 'OTROS', subcategoria_transporte: null };
};

export const formatGasto = (g: any) => {
  let cat = 'Sin clasificar';
  let subcat = 'Sin clasificar';
  let prov = '';
  let cli = '';
  let suc = '';

  let catRel = null;

  if (g.subcategoria_rel) {
    subcat = g.subcategoria_rel.nombre;
    if (g.subcategoria_rel.categorias) {
      cat = g.subcategoria_rel.categorias.nombre;
      catRel = g.subcategoria_rel.categorias;
    }
  }
  if (g.proveedor_rel) prov = g.proveedor_rel.nombre;
  if (g.cliente_rel) cli = g.cliente_rel.nombre;
  if (g.sucursal_rel) suc = g.sucursal_rel.nombre;

  const hospedajeDias = Array.isArray(g.hospedaje_dias)
    ? g.hospedaje_dias.map((d: any) => ({
        ...d,
        fecha: d.fecha ? String(d.fecha).slice(0, 10) : d.fecha,
        monto_diario: Number(d.monto_diario || 0),
      }))
    : [];

  const classification = classifyGastoParaProyecto({
    ...g,
    categoria_nombre: cat,
    subcategoria_nombre: subcat,
  });

  return {
    ...g,
    monto_propina: Number(g.monto_propina || 0),
    es_factura_compartida: Boolean(g.es_factura_compartida),
    fecha_hospedaje_inicio: g.fecha_hospedaje_inicio ? String(g.fecha_hospedaje_inicio).slice(0, 10) : null,
    fecha_hospedaje_fin: g.fecha_hospedaje_fin ? String(g.fecha_hospedaje_fin).slice(0, 10) : null,
    cat,
    subcat,
    prov,
    cli,
    suc,
    categoria_nombre: cat,
    subcategoria_nombre: subcat,
    proveedor_nombre: prov,
    cliente_nombre: cli,
    sucursal_nombre: suc,
    categoria_rel: catRel,
    venta_rel: g.venta_rel || null,
    proyecto_rel: g.proyecto_rel || null,
    hospedaje_dias: hospedajeDias,
    categoria_proyecto: classification.categoria_proyecto,
    subcategoria_transporte: classification.subcategoria_transporte,
    factura_sugerida_rel: g.factura_sugerida_rel || null,
    factura_recibida_rel: g.factura_recibida_rel || null,
  };
};

export const sanitizeGastoWritePayload = (raw: Record<string, any>): Record<string, any> => {
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(raw || {})) {
    if (!VALID_GASTO_COLUMNS.has(key) || value === undefined) continue;
    if (NULLABLE_UUID_OR_DATE_FIELDS.has(key) && typeof value === 'string' && value.trim() === '') {
      sanitized[key] = null;
    } else if (key === 'subtipo_traslado') {
      sanitized[key] = value ? String(value).trim().toUpperCase() : null;
    } else if (key === 'tipo_gasto') {
      sanitized[key] = value ? String(value).trim().toUpperCase() : null;
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

const parseIsoDateOnly = (dateStr: string): Date => {
  const clean = String(dateStr).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    throw new Error(`Fecha inválida (${dateStr}). Se esperaba formato YYYY-MM-DD.`);
  }
  const [y, m, d] = clean.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new Error(`Fecha inexistente (${dateStr}).`);
  }
  return dt;
};

const formatUtcDateOnly = (dt: Date): string => dt.toISOString().slice(0, 10);

/**
 * Calcula las noches/días del hospedaje y distribuye el monto al centavo exacto.
 * - Si inicio === fin: 1 día (el mismo día).
 * - Si fin > inicio: N noches [inicio, ..., fin - 1] (ej. 10 al 15 = 5 noches: 10, 11, 12, 13, 14).
 */
export const computeHospedajeDias = (
  fechaInicio: string,
  fechaFin: string,
  montoTotal: number
): HospedajeDiaCalculado[] => {
  const startDt = parseIsoDateOnly(fechaInicio);
  const endDt = parseIsoDateOnly(fechaFin);

  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((endDt.getTime() - startDt.getTime()) / msPerDay);

  if (diffDays < 0) {
    throw new Error('La fecha de salida de hospedaje no puede ser menor a la fecha de entrada.');
  }

  const numNoches = diffDays === 0 ? 1 : diffDays;
  const totalCents = Math.round((Number(montoTotal) || 0) * 100);
  const baseCents = Math.floor(totalCents / numNoches);
  const remainderCents = totalCents - baseCents * numNoches;

  const dias: HospedajeDiaCalculado[] = [];
  for (let i = 0; i < numNoches; i++) {
    const dt = new Date(startDt.getTime() + i * msPerDay);
    const dayCents = baseCents + (i < remainderCents ? 1 : 0);
    dias.push({
      fecha: formatUtcDateOnly(dt),
      monto_diario: Math.round(dayCents) / 100,
    });
  }

  return dias;
};

export const syncHospedajeDias = async (
  db: Pool | PoolClient,
  gastoId: string,
  fechaInicio: string | null | undefined,
  fechaFin: string | null | undefined,
  montoTotal: number
): Promise<HospedajeDiaCalculado[]> => {
  await db.query('DELETE FROM gastos_hospedaje_dias WHERE gasto_id = $1', [gastoId]);

  if (!fechaInicio || !fechaFin) {
    return [];
  }

  const dias = computeHospedajeDias(fechaInicio, fechaFin, montoTotal);
  for (const dia of dias) {
    await db.query(
      `INSERT INTO gastos_hospedaje_dias (gasto_id, fecha, monto_diario)
       VALUES ($1, $2, $3)`,
      [gastoId, dia.fecha, dia.monto_diario]
    );
  }

  return dias;
};

export const buildProyectoResumenFromGastos = (gastos: any[]) => {
  let totalGeneral = 0;
  let alimentos = 0;
  let hospedaje = 0;
  let material = 0;
  let equipo = 0;
  let combustible = 0;
  let traslados = 0;
  let pendientesCount = 0;
  let totalGastosCount = 0;

  for (const g of gastos) {
    const st = String(g.status || '').toUpperCase();
    if (st === 'REJECTED') continue;

    if (st === 'PENDING' || st === 'ACTION_REQUIRED') {
      pendientesCount += 1;
    }
    totalGastosCount += 1;

    const monto = Number(g.monto || 0);
    totalGeneral += monto;

    const { categoria_proyecto, subcategoria_transporte } = classifyGastoParaProyecto(g);
    switch (categoria_proyecto) {
      case 'ALIMENTOS':
        alimentos += monto;
        break;
      case 'HOSPEDAJE':
        hospedaje += monto;
        break;
      case 'MATERIAL':
        material += monto;
        break;
      case 'EQUIPO':
        equipo += monto;
        break;
      case 'TRANSPORTE':
        if (subcategoria_transporte === 'COMBUSTIBLE') {
          combustible += monto;
        } else {
          traslados += monto;
        }
        break;
      default:
        break;
    }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const transporte = round2(combustible + traslados);

  return {
    total_general: round2(totalGeneral),
    totales_por_categoria: {
      alimentos: round2(alimentos),
      hospedaje: round2(hospedaje),
      material: round2(material),
      equipo: round2(equipo),
      transporte,
      combustible: round2(combustible),
      traslados: round2(traslados),
    },
    pendientes_count: pendientesCount,
    total_gastos_count: totalGastosCount,
  };
};
