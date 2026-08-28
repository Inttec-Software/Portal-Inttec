import { Request, Response } from 'express';
import { getSupabaseClient } from '../../config/supabase';
import { GoogleGenAI } from '@google/genai';

const safeFetch = async (client: any, table: string) => {
  try {
    let query = table === 'gastos'
      ? client.from('gastos').select(`
          *,
          subcategoria_rel:subcategorias(id, nombre, categoria_id, categorias(id, nombre)),
          proveedor_rel:proveedores(id, nombre),
          cliente_rel:clientes(id, nombre),
          sucursal_rel:sucursales_cliente(id, nombre)
        `)
      : client.from(table).select('*');

    if (['gastos', 'ventas', 'asistencias', 'registro_gasolina'].includes(table)) {
      query = query.order('created_at', { ascending: false }).limit(1000);
    } else {
      query = query.limit(500);
    }
    const { data, error } = await query;
    if (error) {
      const fallback = await client.from(table).select('*').limit(500);
      if (fallback.error) {
        return [];
      }
      return fallback.data || [];
    }
    return data || [];
  } catch (e: any) {
    return [];
  }
};

const fetchCompanyData = async (client: any, companyName: string) => {
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
      safeFetch(client, 'gastos'),
      safeFetch(client, 'ventas'),
      safeFetch(client, 'ventas_partidas'),
      safeFetch(client, 'usuarios'),
      safeFetch(client, 'asistencias'),
      safeFetch(client, 'vehiculos'),
      safeFetch(client, 'registro_gasolina'),
      safeFetch(client, 'auditorias_tarjeta'),
      safeFetch(client, 'clientes'),
      safeFetch(client, 'sucursales_cliente'),
      safeFetch(client, 'productos'),
      safeFetch(client, 'categorias_productos'),
      safeFetch(client, 'proveedores'),
      safeFetch(client, 'movimientos_inventario'),
      safeFetch(client, 'cotizaciones')
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

    // Client for the active tenant
    const activeClient = getSupabaseClient(tenant.company, tenant.env);
    // Hardcoded clients for INTTEC and DARAVISA to match frontend logic
    const inttecClient = getSupabaseClient('inttec', 'cloud');
    const daravisaClient = getSupabaseClient('daravisa', 'cloud');

    const [activeData, inttecData, daravisaData] = await Promise.all([
      fetchCompanyData(activeClient, 'Empresa Activa'),
      fetchCompanyData(inttecClient, 'Inttec'),
      fetchCompanyData(daravisaClient, 'Daravisa')
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
    const client = getSupabaseClient(tenant.company, tenant.env);

    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'Falta userId' });
    }

    const safeQuery = async (queryPromise: any) => {
      try {
        const { data, error } = await queryPromise;
        if (error) return [];
        return data || [];
      } catch {
        return [];
      }
    };

    const [misGastos, misAsistencias, misGasolinas] = await Promise.all([
      safeQuery(client.from('gastos').select(`
        *,
        subcategoria_rel:subcategorias(id, nombre, categoria_id, categorias(id, nombre)),
        proveedor_rel:proveedores(id, nombre),
        cliente_rel:clientes(id, nombre),
        sucursal_rel:sucursales_cliente(id, nombre)
      `).eq('empleado_id', userId).order('created_at', { ascending: false }).limit(500)),
      safeQuery(client.from('asistencias').select('*').eq('usuario_id', userId).order('fecha', { ascending: false }).limit(100)),
      safeQuery(client.from('registro_gasolina').select('*').eq('empleado_id', userId).order('fecha', { ascending: false }).limit(100))
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
