import { Request, Response } from 'express';
import { getSupabaseClient } from '../../config/supabase';

// === GET /api/retiro-material/productos ===
export const getProductosDisponibles = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const client = getSupabaseClient(tenant.company, tenant.env);

    const { data, error } = await client
      .from('productos')
      .select('id, sku_interno, nombre_oficial, stock_actual, stock_nuevo, stock_usado, stock_por_revisar, unidad')
      .eq('activo', true)
      .gt('stock_actual', 0)
      .order('nombre_oficial');

    if (error) throw error;
    
    const mapped = (data || []).map((p: any) => {
      let unidad = p.unidad;
      if (!unidad || unidad.trim() === '') {
        const name = (p.nombre_oficial || '').toLowerCase();
        if (name.includes('metro') || name.includes('cable') || name.includes('bobina')) {
          unidad = 'mts';
        } else {
          unidad = 'pza';
        }
      }
      return {
        ...p,
        unidad
      };
    });

    return res.json({ productos: mapped });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === POST /api/retiro-material/confirmar ===
export const confirmarRetiro = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const client = getSupabaseClient(tenant.company, tenant.env);
    
    const {
      cart,
      motivoRetiro,
      currentUser,
      tipoGasto,
      detalleServicioProyecto,
      proveedor,
      proveedorId,
      clienteId,
      clienteNombre,
      sucursalId,
      sucursalNombre,
      isSplit,
      splits
    } = req.body;

    if (!cart || !Array.isArray(cart) || cart.length === 0 || !currentUser || !currentUser.id) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const materialesSnapshot = cart.map(item => ({
      producto_id: item.producto.id,
      sku: item.producto.sku_interno || '',
      nombre: item.producto.nombre_oficial || 'Producto',
      cantidad: item.cantidad,
      cantidad_nuevo: Number(item.cantidad_nuevo) || 0,
      cantidad_usado: Number(item.cantidad_usado) || 0,
      cantidad_por_revisar: Number(item.cantidad_por_revisar) || 0,
      unidad: item.producto.unidad || 'pza'
    }));

    const sanitizeUuid = (val: any): string | null => {
      if (!val || typeof val !== 'string') return null;
      const trimmed = val.trim();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return uuidRegex.test(trimmed) ? trimmed : null;
    };

    // 1. Guardar registro estructurado en retiros_material
    try {
      const { error: retiroErr } = await client
        .from('retiros_material')
        .insert([{
          empleado_id: sanitizeUuid(currentUser.id) || currentUser.id,
          empleado_nombre: currentUser.nombre || currentUser.email || 'Empleado',
          tipo_gasto: tipoGasto || 'Operativo',
          detalle_servicio_proyecto: detalleServicioProyecto || '',
          proveedor: proveedor || '',
          proveedor_id: sanitizeUuid(proveedorId),
          cliente_id: sanitizeUuid(clienteId),
          cliente_nombre: clienteNombre || '',
          sucursal_id: sanitizeUuid(sucursalId),
          sucursal_nombre: sucursalNombre || '',
          is_split: Boolean(isSplit),
          splits_json: splits || [],
          materiales: materialesSnapshot,
          motivo: (motivoRetiro || '').trim(),
          created_at: new Date().toISOString()
        }]);

      if (retiroErr) {
        console.warn('Aviso al insertar en retiros_material:', retiroErr.message);
      }
    } catch (saveRetiroErr: any) {
      console.warn('Error capturado en retiros_material insert:', saveRetiroErr.message);
    }

    // 2. Procesar cada material: descontar stock por estado específico, movimiento salida, inventario empleado
    for (const item of cart) {
      const { data: prodData, error: prodErr } = await client
        .from('productos')
        .select('*')
        .eq('id', item.producto.id)
        .single();
        
      if (prodErr || !prodData) continue;
      
      let nuevo = Number(prodData.stock_nuevo) || 0;
      let usado = Number(prodData.stock_usado) || 0;
      let porRevisar = Number(prodData.stock_por_revisar) || 0;

      const reqNuevo = Number(item.cantidad_nuevo) || 0;
      const reqUsado = Number(item.cantidad_usado) || 0;
      const reqPorRevisar = Number(item.cantidad_por_revisar) || 0;

      if (reqNuevo > 0 || reqUsado > 0 || reqPorRevisar > 0) {
        // Descuento exacto por estado solicitado
        nuevo = Math.max(0, nuevo - reqNuevo);
        usado = Math.max(0, usado - reqUsado);
        porRevisar = Math.max(0, porRevisar - reqPorRevisar);
      } else {
        // Descuento por orden de prioridad (FIFO) si no se especificó desglose
        let toDiscount = item.cantidad;
        if (nuevo >= toDiscount) {
          nuevo -= toDiscount;
          toDiscount = 0;
        } else {
          toDiscount -= nuevo;
          nuevo = 0;
          if (usado >= toDiscount) {
            usado -= toDiscount;
            toDiscount = 0;
          } else {
            toDiscount -= usado;
            usado = 0;
            porRevisar = Math.max(0, porRevisar - toDiscount);
          }
        }
      }

      const newStock = Math.round((nuevo + usado + porRevisar) * 100) / 100;

      // Descontar del inventario
      const { error: stockErr } = await client
        .from('productos')
        .update({ stock_actual: newStock, stock_nuevo: nuevo, stock_usado: usado, stock_por_revisar: porRevisar })
        .eq('id', item.producto.id);

      if (stockErr) throw stockErr;

      // Registrar movimiento de salida
      const clientLabel = isSplit ? 'Varios clientes' : (clienteNombre ? `${clienteNombre}${sucursalNombre ? ` - ${sucursalNombre}` : ''}` : '');
      const fullFolio = `RETIRO: ${(motivoRetiro || '').trim()}${tipoGasto ? ` [${tipoGasto}]` : ''}${clientLabel ? ` (${clientLabel})` : ''}`;

      const { error: moveErr } = await client
        .from('movimientos_inventario')
        .insert([
          {
            producto_id: item.producto.id,
            tipo: 'SALIDA',
            cantidad: item.cantidad,
            folio_factura: fullFolio,
            creado_por: currentUser.id,
          },
        ]);

      if (moveErr) {
        console.warn('No se pudo registrar histórico:', moveErr.message);
      }

      // Agregar al inventario del empleado
      const { data: invEmp } = await client
        .from('inventario_empleados')
        .select('id, cantidad_disponible')
        .eq('empleado_id', currentUser.id)
        .eq('producto_id', item.producto.id)
        .maybeSingle();

      if (invEmp) {
        await client
          .from('inventario_empleados')
          .update({ cantidad_disponible: invEmp.cantidad_disponible + item.cantidad, updated_at: new Date().toISOString() })
          .eq('id', invEmp.id);
      } else {
        await client
          .from('inventario_empleados')
          .insert([{
            empleado_id: currentUser.id,
            producto_id: item.producto.id,
            cantidad_disponible: item.cantidad
          }]);
      }
    }

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === GET /api/retiro-material/historial ===
export const getHistorialRetiros = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const client = getSupabaseClient(tenant.company, tenant.env);

    // 1. Intentar consultar de la tabla dedicada retiros_material
    let structuredRetiros: any[] = [];
    try {
      const { data: retirosData, error: retirosErr } = await client
        .from('retiros_material')
        .select('*')
        .order('created_at', { ascending: false });

      if (!retirosErr && Array.isArray(retirosData)) {
        structuredRetiros = retirosData;
      } else if (retirosErr) {
        console.warn('Aviso al consultar retiros_material:', retirosErr.message);
      }
    } catch (dbErr: any) {
      console.warn('Excepción al consultar retiros_material:', dbErr?.message);
    }

    // 2. Consultar movimientos_inventario para incluir retiros históricos / legados
    const [movsRes, usersRes] = await Promise.all([
      client
        .from('movimientos_inventario')
        .select('*, producto:productos(id, sku_interno, nombre_oficial, unidad)')
        .eq('tipo', 'SALIDA')
        .ilike('folio_factura', 'RETIRO:%')
        .order('fecha', { ascending: false })
        .limit(200),
      client
        .from('usuarios')
        .select('id, nombre, email')
    ]);

    const usersMap = new Map<string, string>();
    if (usersRes.data) {
      usersRes.data.forEach((u: any) => {
        usersMap.set(u.id, u.nombre || u.email || 'Empleado');
      });
    }

    // Agrupar movimientos_inventario en transacciones de retiro
    const rawMovs = movsRes.data || [];
    const legacyGroups: any[] = [];

    for (const m of rawMovs) {
      const mTime = new Date(m.fecha).getTime();
      const folio = m.folio_factura || '';

      const prod = m.producto || {};
      const mat = {
        producto_id: m.producto_id || prod.id,
        sku: prod.sku_interno || '-',
        nombre: prod.nombre_oficial || 'Producto',
        cantidad: m.cantidad || 0,
        unidad: prod.unidad || 'pza'
      };

      // Buscar si pertenece a un grupo legado existente (mismo creador, mismo folio, fecha dentro de 60 segundos)
      const existingGroup = legacyGroups.find(g =>
        g.empleado_id === m.creado_por &&
        g.raw_folio === folio &&
        Math.abs(new Date(g.created_at).getTime() - mTime) < 60000
      );

      if (existingGroup) {
        existingGroup.materiales.push(mat);
      } else {
        let tipo = 'Operativo';
        const tipoMatch = folio.match(/\[(Servicio|Proyecto|Venta|Operativo)\]/i);
        if (tipoMatch) tipo = tipoMatch[1];

        let clienteNombre = '';
        const clientMatch = folio.match(/\((.*?)\)/);
        if (clientMatch) clienteNombre = clientMatch[1];

        const cleanMotivo = folio
          .replace(/^RETIRO:\s*/i, '')
          .replace(/\[(Servicio|Proyecto|Venta|Operativo)\]/gi, '')
          .replace(/\(.*?\)/g, '')
          .trim();

        legacyGroups.push({
          id: m.id,
          raw_folio: folio,
          empleado_id: m.creado_por,
          empleado_nombre: usersMap.get(m.creado_por) || 'Empleado',
          tipo_gasto: tipo,
          detalle_servicio_proyecto: '',
          proveedor: '',
          cliente_nombre: clienteNombre,
          sucursal_nombre: '',
          is_split: clienteNombre.toLowerCase().includes('varios'),
          splits_json: [],
          materiales: [mat],
          motivo: cleanMotivo,
          created_at: m.fecha
        });
      }
    }

    // 3. Fusionar: Conservar retiros_material estructurados y agregar legados que no estén duplicados
    const combinedRetiros = [...structuredRetiros];

    for (const leg of legacyGroups) {
      const legTime = new Date(leg.created_at).getTime();
      // Verificar si ya existe en structuredRetiros con mismo empleado y fecha similar (+/- 60s)
      const alreadyInStructured = structuredRetiros.some(st =>
        st.empleado_id === leg.empleado_id &&
        Math.abs(new Date(st.created_at).getTime() - legTime) < 60000
      );

      if (!alreadyInStructured) {
        combinedRetiros.push(leg);
      }
    }

    // Ordenar descendente por fecha
    combinedRetiros.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return res.json({ retiros: combinedRetiros });
  } catch (error: any) {
    console.error('Error en getHistorialRetiros:', error);
    return res.json({ retiros: [] });
  }
};

