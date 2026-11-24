import { getApiHeaders, getApiUrl } from '@/services/apiHelper';
import { Gasto, supabase } from '@/services/supabase';
import {
  Proyecto,
  ProyectoDetailResponse,
  ProyectoResumen,
  ProyectoStatus,
  TipoGasto,
  computeProyectoResumenFromGastos,
  getOrComputeHospedajeDias,
} from '../types';

function normalizeProyectoResumen(raw: any): ProyectoResumen {
  const totales = raw?.totales_por_categoria || {};
  return {
    id: String(raw?.id || ''),
    nombre: String(raw?.nombre || 'Proyecto sin nombre'),
    cliente_id: raw?.cliente_id || null,
    cliente_nombre:
      raw?.cliente_nombre ||
      raw?.cliente_rel?.nombre ||
      raw?.clientes?.nombre ||
      null,
    sucursal_id: raw?.sucursal_id || null,
    sucursal_nombre:
      raw?.sucursal_nombre ||
      raw?.sucursal_rel?.nombre ||
      raw?.sucursales_cliente?.nombre ||
      null,
    venta_id: raw?.venta_id || null,
    status: (raw?.status === 'CERRADO' ? 'CERRADO' : 'ACTIVO') as ProyectoStatus,
    notas: raw?.notas || null,
    created_by: raw?.created_by || null,
    created_at: raw?.created_at,
    updated_at: raw?.updated_at,
    total_general: Number(raw?.total_general ?? 0),
    totales_por_categoria: {
      alimentos: Number(totales.alimentos ?? 0),
      hospedaje: Number(totales.hospedaje ?? 0),
      material: Number(totales.material ?? 0),
      equipo: Number(totales.equipo ?? 0),
      transporte: Number(
        totales.transporte ??
          Number(totales.combustible ?? 0) + Number(totales.traslados ?? 0)
      ),
      combustible: Number(totales.combustible ?? 0),
      traslados: Number(totales.traslados ?? 0),
    },
    pendientes_count: Number(raw?.pendientes_count ?? 0),
    gastos_count: raw?.gastos_count !== undefined ? Number(raw.gastos_count) : undefined,
  };
}

export const proyectosApi = {
  async fetchProyectos(
    status: 'ACTIVO' | 'CERRADO' | 'ALL' = 'ALL'
  ): Promise<ProyectoResumen[]> {
    try {
      const headers = await getApiHeaders();
      const query = status ? `?status=${encodeURIComponent(status)}` : '';
      const res = await fetch(`${getApiUrl()}/api/proyectos${query}`, {
        headers,
      });

      if (res.ok) {
        const data = await res.json();
        const rawList = Array.isArray(data)
          ? data
          : Array.isArray(data?.proyectos)
          ? data.proyectos
          : [];
        return rawList.map(normalizeProyectoResumen);
      }
    } catch (err) {
      console.warn('[proyectosApi.fetchProyectos] Fallback a Supabase:', err);
    }

    // Fallback directo a Supabase si el endpoint aún no está disponible
    try {
      let queryBuilder = supabase
        .from('proyectos')
        .select(
          `
          *,
          cliente_rel:clientes(id, nombre),
          sucursal_rel:sucursales_cliente(id, nombre)
        `
        )
        .order('created_at', { ascending: false });

      if (status === 'ACTIVO' || status === 'CERRADO') {
        queryBuilder = queryBuilder.eq('status', status);
      }

      const { data: proys, error } = await queryBuilder;
      if (error || !proys) return [];

      const proyIds = proys.map((p: any) => p.id);
      let gastosByProy: Record<string, Gasto[]> = {};

      if (proyIds.length > 0) {
        const { data: gastosData } = await supabase
          .from('gastos')
          .select(
            `
            *,
            subcategoria_rel:subcategorias(id, nombre, categoria_id, categorias(id, nombre)),
            proveedor_rel:proveedores(id, nombre),
            cliente_rel:clientes(id, nombre),
            sucursal_rel:sucursales_cliente(id, nombre)
          `
          )
          .in('proyecto_id', proyIds);

        if (Array.isArray(gastosData)) {
          for (const g of gastosData as any[]) {
            const pid = g.proyecto_id;
            if (pid) {
              if (!gastosByProy[pid]) gastosByProy[pid] = [];
              gastosByProy[pid].push(g);
            }
          }
        }
      }

      return proys.map((p: any) => {
        const baseProy: Proyecto = {
          id: p.id,
          nombre: p.nombre,
          cliente_id: p.cliente_id,
          cliente_nombre: p.cliente_rel?.nombre || p.cliente_nombre || null,
          sucursal_id: p.sucursal_id,
          sucursal_nombre: p.sucursal_rel?.nombre || p.sucursal_nombre || null,
          venta_id: p.venta_id || null,
          status: p.status === 'CERRADO' ? 'CERRADO' : 'ACTIVO',
          notas: p.notas || null,
          created_by: p.created_by || null,
          created_at: p.created_at,
          updated_at: p.updated_at,
        };
        return computeProyectoResumenFromGastos(
          baseProy,
          gastosByProy[p.id] || []
        );
      });
    } catch {
      return [];
    }
  },

  async fetchProyectoDetail(id: string): Promise<ProyectoDetailResponse> {
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/proyectos/${id}`, {
        headers,
      });

      if (res.ok) {
        const data = await res.json();
        const rawProyecto = data?.proyecto || data;
        const rawGastos: Gasto[] = Array.isArray(data?.gastos)
          ? data.gastos.map((g: Gasto) => ({
              ...g,
              hospedaje_dias: getOrComputeHospedajeDias(g),
            }))
          : [];

        const baseProy: Proyecto = {
          id: String(rawProyecto?.id || id),
          nombre: String(rawProyecto?.nombre || 'Proyecto'),
          cliente_id: rawProyecto?.cliente_id || null,
          cliente_nombre:
            rawProyecto?.cliente_nombre ||
            rawProyecto?.cliente_rel?.nombre ||
            null,
          sucursal_id: rawProyecto?.sucursal_id || null,
          sucursal_nombre:
            rawProyecto?.sucursal_nombre ||
            rawProyecto?.sucursal_rel?.nombre ||
            null,
          venta_id: rawProyecto?.venta_id || null,
          status:
            rawProyecto?.status === 'CERRADO' ? 'CERRADO' : 'ACTIVO',
          notas: rawProyecto?.notas || null,
          created_by: rawProyecto?.created_by || null,
          created_at: rawProyecto?.created_at,
          updated_at: rawProyecto?.updated_at,
        };

        const computed = computeProyectoResumenFromGastos(baseProy, rawGastos);
        const backendResumen = data?.resumen;

        return {
          proyecto: baseProy,
          resumen: backendResumen
            ? {
                total_general: Number(
                  backendResumen.total_general ?? computed.total_general
                ),
                totales_por_categoria: {
                  alimentos: Number(
                    backendResumen.totales_por_categoria?.alimentos ??
                      computed.totales_por_categoria.alimentos
                  ),
                  hospedaje: Number(
                    backendResumen.totales_por_categoria?.hospedaje ??
                      computed.totales_por_categoria.hospedaje
                  ),
                  material: Number(
                    backendResumen.totales_por_categoria?.material ??
                      computed.totales_por_categoria.material
                  ),
                  equipo: Number(
                    backendResumen.totales_por_categoria?.equipo ??
                      computed.totales_por_categoria.equipo
                  ),
                  transporte: Number(
                    backendResumen.totales_por_categoria?.transporte ??
                      computed.totales_por_categoria.transporte
                  ),
                  combustible: Number(
                    backendResumen.totales_por_categoria?.combustible ??
                      computed.totales_por_categoria.combustible
                  ),
                  traslados: Number(
                    backendResumen.totales_por_categoria?.traslados ??
                      computed.totales_por_categoria.traslados
                  ),
                },
                pendientes_count: Number(
                  backendResumen.pendientes_count ?? computed.pendientes_count
                ),
              }
            : {
                total_general: computed.total_general,
                totales_por_categoria: computed.totales_por_categoria,
                pendientes_count: computed.pendientes_count,
              },
          gastos: rawGastos,
        };
      }
    } catch (err) {
      console.warn('[proyectosApi.fetchProyectoDetail] Fallback a Supabase:', err);
    }

    // Fallback a Supabase
    const { data: pData, error: pErr } = await supabase
      .from('proyectos')
      .select(
        `
        *,
        cliente_rel:clientes(id, nombre),
        sucursal_rel:sucursales_cliente(id, nombre)
      `
      )
      .eq('id', id)
      .single();

    if (pErr || !pData) {
      throw new Error('No se pudo cargar el detalle del proyecto');
    }

    const { data: gData } = await supabase
      .from('gastos')
      .select(
        `
        *,
        subcategoria_rel:subcategorias(id, nombre, categoria_id, categorias(id, nombre)),
        proveedor_rel:proveedores(id, nombre),
        cliente_rel:clientes(id, nombre),
        sucursal_rel:sucursales_cliente(id, nombre),
        hospedaje_dias:gastos_hospedaje_dias(*)
      `
      )
      .eq('proyecto_id', id)
      .order('created_at', { ascending: false });

    const proyecto: Proyecto = {
      id: pData.id,
      nombre: pData.nombre,
      cliente_id: pData.cliente_id || null,
      cliente_nombre: pData.cliente_rel?.nombre || null,
      sucursal_id: pData.sucursal_id || null,
      sucursal_nombre: pData.sucursal_rel?.nombre || null,
      venta_id: pData.venta_id || null,
      status: pData.status === 'CERRADO' ? 'CERRADO' : 'ACTIVO',
      notas: pData.notas || null,
      created_by: pData.created_by || null,
      created_at: pData.created_at,
      updated_at: pData.updated_at,
    };

    const gastos = ((gData || []) as Gasto[]).map((g) => ({
      ...g,
      hospedaje_dias: getOrComputeHospedajeDias(g),
    }));

    const computed = computeProyectoResumenFromGastos(proyecto, gastos);
    return {
      proyecto,
      resumen: {
        total_general: computed.total_general,
        totales_por_categoria: computed.totales_por_categoria,
        pendientes_count: computed.pendientes_count,
      },
      gastos,
    };
  },

  async createProyecto(body: {
    nombre: string;
    cliente_id?: string | null;
    sucursal_id?: string | null;
    venta_id?: string | null;
    notas?: string | null;
    created_by?: string | null;
  }): Promise<Proyecto> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/proyectos`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      return data?.proyecto || data;
    }

    if (res.status === 404) {
      const { data, error } = await supabase
        .from('proyectos')
        .insert({
          nombre: body.nombre.trim(),
          cliente_id: body.cliente_id || null,
          sucursal_id: body.sucursal_id || null,
          venta_id: body.venta_id || null,
          notas: body.notas || null,
          created_by: body.created_by || null,
          status: 'ACTIVO',
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as Proyecto;
    }

    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Error al crear el proyecto');
  },

  async updateProyecto(
    id: string,
    body: {
      nombre?: string;
      cliente_id?: string | null;
      sucursal_id?: string | null;
      venta_id?: string | null;
      status?: ProyectoStatus;
      notas?: string | null;
    }
  ): Promise<Proyecto> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/proyectos/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      return data?.proyecto || data;
    }

    if (res.status === 404) {
      const { data, error } = await supabase
        .from('proyectos')
        .update({
          ...body,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as Proyecto;
    }

    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Error al actualizar el proyecto');
  },

  async assignProyectoToGasto(
    gastoId: string,
    payload: {
      proyecto_id: string | null;
      tipo_gasto: TipoGasto;
    }
  ): Promise<any> {
    const headers = await getApiHeaders();
    const res = await fetch(
      `${getApiUrl()}/api/reportes/gastos/${gastoId}/assign-proyecto`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload),
      }
    );

    if (res.ok) {
      return await res.json().catch(() => ({}));
    }

    // Fallback a PUT /api/reportes/gastos/:id si la ruta específica aún no está desplegada
    const fallbackRes = await fetch(
      `${getApiUrl()}/api/reportes/gastos/${gastoId}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          proyecto_id: payload.proyecto_id,
          tipo_gasto: payload.tipo_gasto,
        }),
      }
    );

    if (fallbackRes.ok) {
      return await fallbackRes.json().catch(() => ({}));
    }

    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'No se pudo asignar el proyecto al gasto');
  },
};
