import { Request, Response } from 'express';
import { getDbPool } from '../../config/database';
import { GoogleGenAI } from '@google/genai';

const safeFetch = async (pool: any, table: string) => {
  try {
    let query = '';
    if (table === 'gastos') {
      query = `
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
        ORDER BY g.created_at DESC LIMIT 1000
      `;
    } else if (['ventas', 'asistencias', 'registro_gasolina'].includes(table)) {
      query = `SELECT * FROM ${table} ORDER BY created_at DESC LIMIT 1000`;
    } else {
      query = `SELECT * FROM ${table} LIMIT 500`;
    }
    const { rows } = await pool.query(query);
    return rows || [];
  } catch (e: any) {
    try {
      const fallback = await pool.query(`SELECT * FROM ${table} LIMIT 500`);
      return fallback.rows || [];
    } catch {
      return [];
    }
  }
};

const fetchCompanyData = async (pool: any, companyName: string) => {
  try {
    const [
      gastosData,
      ventasData,
      ventasPartidasData,
      usuariosData,
      asistenciasData,
      vehiculosData,
      gasolinaData,
      auditoriasData,
      clientesData,
      sucursalesData,
      productosData,
      categoriasProductosData,
      proveedoresData,
      movimientosData,
      cotizacionesData
    ] = await Promise.all([
      safeFetch(pool, 'gastos'),
      safeFetch(pool, 'ventas'),
      safeFetch(pool, 'ventas_partidas'),
      safeFetch(pool, 'usuarios'),
      safeFetch(pool, 'asistencias'),
      safeFetch(pool, 'vehiculos'),
      safeFetch(pool, 'registro_gasolina'),
      safeFetch(pool, 'auditorias_tarjeta'),
      safeFetch(pool, 'clientes'),
      safeFetch(pool, 'sucursales_cliente'),
      safeFetch(pool, 'productos'),
      safeFetch(pool, 'categorias_productos'),
      safeFetch(pool, 'proveedores'),
      safeFetch(pool, 'movimientos_inventario'),
      safeFetch(pool, 'cotizaciones')
    ]);

    const userMap: Record<string, string> = {};
    usuariosData.forEach((u: any) => { userMap[u.id] = u.nombre || u.email || 'Desconocido'; });

    const vehiculoMap: Record<string, string> = {};
    vehiculosData.forEach((v: any) => { vehiculoMap[v.id] = `${v.marca || ''} ${v.modelo || ''} (${v.placas || ''})`.trim(); });

    const gastos = gastosData.map((g: any) => ({
      ...g,
      empresa: companyName,
      empleado_nombre: userMap[g.empleado_id || g.usuario_id] || 'Desconocido'
    }));

    const asistencias = asistenciasData.map((a: any) => ({
      ...a,
      empresa: companyName,
      empleado_nombre: userMap[a.usuario_id || a.empleado_id] || 'Desconocido'
    }));

    const gasolina = gasolinaData.map((reg: any) => ({
      ...reg,
      empresa: companyName,
      empleado_nombre: userMap[reg.empleado_id || reg.usuario_id] || 'Desconocido',
      vehiculo_info: vehiculoMap[reg.vehiculo_id] || 'Desconocido'
    }));

    return {
      empresa: companyName,
      total_registros_gastos: gastos.length,
      total_registros_ventas: ventasData.length,
      usuarios: usuariosData.map((u: any) => ({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, empresa: companyName })),
      gastos,
      ventas: ventasData.map((v: any) => ({ ...v, empresa: companyName })),
      ventas_partidas: ventasPartidasData,
      asistencias,
      vehiculos: vehiculosData.map((v: any) => ({ ...v, empresa: companyName })),
      registro_gasolina: gasolina,
      auditorias_tarjeta: auditoriasData.map((aud: any) => ({ ...aud, empresa: companyName })),
      clientes: clientesData,
      sucursales_cliente: sucursalesData,
      productos: productosData,
      categorias_productos: categoriasProductosData,
      proveedores: proveedoresData,
      movimientos_inventario: movimientosData,
      cotizaciones: cotizacionesData
    };
  } catch (e) {
    console.error(`Error fetching data for ${companyName}:`, e);
    return null;
  }
};

// === GET /api/chat-ia/context ===
export const getChatContext = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });

    const activePool = getDbPool(tenant.company, tenant.env);
    const inttecPool = getDbPool('inttec', 'cloud');
    const daravisaPool = getDbPool('daravisa', 'cloud');

    const [activeData, inttecData, daravisaData] = await Promise.all([
      fetchCompanyData(activePool, 'Empresa Activa'),
      fetchCompanyData(inttecPool, 'Inttec'),
      fetchCompanyData(daravisaPool, 'Daravisa')
    ]);

    const context = {
      fecha_actual_sistema: new Date().toISOString(),
      datos_empresa_actual_autenticada: activeData,
      datos_empresa_inttec: inttecData,
      datos_empresa_daravisa: daravisaData
    };

    return res.json({ context });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === GET /api/chat-ia/employee-context ===
export const getEmployeeChatContext = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const pool = getDbPool(tenant.company, tenant.env);

    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'Falta userId' });
    }

    const safeQuery = async (queryPromise: any) => {
      try {
        const { rows } = await queryPromise;
        return rows || [];
      } catch {
        return [];
      }
    };

    const gastosQuery = pool.query(`
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
      WHERE g.empleado_id = $1
      ORDER BY g.created_at DESC LIMIT 500
    `, [userId]);

    const asistenciasQuery = pool.query(`SELECT * FROM asistencias WHERE usuario_id = $1 ORDER BY fecha DESC LIMIT 100`, [userId]);
    const gasolinasQuery = pool.query(`SELECT * FROM registro_gasolina WHERE empleado_id = $1 ORDER BY fecha DESC LIMIT 100`, [userId]);

    const [misGastos, misAsistencias, misGasolinas] = await Promise.all([
      safeQuery(gastosQuery),
      safeQuery(asistenciasQuery),
      safeQuery(gasolinasQuery)
    ]);

    const context = {
      mis_gastos_registrados: misGastos,
      mis_asistencias: misAsistencias,
      mis_cargas_gasolina: misGasolinas
    };

    return res.json({ context });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === POST /api/chat-ia/mejorar-redaccion ===
export const mejorarRedaccion = async (req: Request, res: Response) => {
  try {
    const { texto, tipo } = req.body;
    if (!texto) {
      return res.status(400).json({ error: 'Falta el texto a mejorar' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY no está configurada en el servidor' });
    }

    const ai = new GoogleGenAI({ apiKey });
    
    let reglasEspeciales = '';
    if (tipo === 'situacion') {
      reglasEspeciales = '- Asegúrate de que la redacción comience exactamente con "Se solicitó " (o similar) y luego continúa con la redacción, ajustando el verbo principal.';
    } else if (tipo === 'solucion') {
      reglasEspeciales = '- Asegúrate de que la redacción comience exactamente con "Se realizó " (o similar) y luego continúa con la redacción, ajustando el verbo principal.';
    }

    const prompt = `
Corrige la ortografía y mejora la redacción del siguiente texto técnico de un reporte de mantenimiento.
Instrucciones:
- Mantén el tono profesional y técnico.
- No agregues ni inventes información nueva ni quites hechos.
- Si el texto está en formato de viñetas, devuélvelo en formato de viñetas usando guiones (-).
${reglasEspeciales}
- Retorna ÚNICAMENTE el texto mejorado, sin introducciones ni comentarios adicionales.

Texto original:
"${texto}"
`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    
    return res.json({ textoMejorado: response.text });
  } catch (error: any) {
    console.error('Error mejorando redacción:', error);
    return res.status(500).json({ error: error.message || 'Error al procesar el texto con IA' });
  }
};
