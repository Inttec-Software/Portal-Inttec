import { Request, Response } from 'express';
import { getSupabaseClient } from '../../config/supabase';

// 1. Obtener todos los datos necesarios para el dashboard de inventario (GET /api/inventario/dashboard)
export const getDashboardData = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);

    const [
      categoriasRes,
      proveedoresRes,
      productosRes,
      historialRes,
      clientesRes,
      usuariosRes
    ] = await Promise.all([
      client.from('categorias_productos').select('*').order('nombre'),
      client.from('proveedores').select('*').order('nombre'),
      client.from('productos').select('*').order('nombre_oficial'),
      client.from('movimientos_inventario').select('*, producto:productos(nombre_oficial, sku_interno, precio_unitario, unidad)').eq('tipo', 'SALIDA').order('fecha', { ascending: false }).limit(50),
      client.from('clientes').select('*').order('nombre'),
      client.from('usuarios').select('id, nombre, rol, email').order('nombre')
    ]);

    if (categoriasRes.error) throw categoriasRes.error;
    if (proveedoresRes.error) throw proveedoresRes.error;
    if (productosRes.error) throw productosRes.error;
    if (historialRes.error) throw historialRes.error;
    if (clientesRes.error) throw clientesRes.error;
    if (usuariosRes.error) throw usuariosRes.error;

    const userMap = new Map((usuariosRes.data || []).map((u: any) => [u.id, u]));
    const historialWithUser = (historialRes.data || []).map((m: any) => ({
      ...m,
      usuario: userMap.get(m.creado_por || m.empleado_id) || null
    }));

    const normalizedProductos = (productosRes.data || []).map((p: any) => {
      const sNuevo = Number(p.stock_nuevo) || 0;
      const sUsado = Number(p.stock_usado) || 0;
      const sPorRev = Number(p.stock_por_revisar) || 0;
      const sumConditions = Math.round((sNuevo + sUsado + sPorRev) * 100) / 100;
      const totalStock = sumConditions > 0 ? sumConditions : (Number(p.stock_actual) || 0);

      return {
        ...p,
        stock_actual: totalStock,
        stock_nuevo: sNuevo > 0 ? sNuevo : (sUsado === 0 && sPorRev === 0 ? totalStock : 0),
        stock_usado: sUsado,
        stock_por_revisar: sPorRev
      };
    });

    return res.json({
      categorias: categoriasRes.data || [],
      proveedores: proveedoresRes.data || [],
      productos: normalizedProductos,
      historial_consumo: historialWithUser,
      clientes: clientesRes.data || [],
      usuarios: (usuariosRes.data || []).filter((u: any) => ['EMPLEADO', 'DEV'].includes(u.rol))
    });
  } catch (error: any) {
    console.error('Error in getDashboardData:', error);
    return res.status(500).json({ error: error.message });
  }
};

// 2. Aprobar Devolución (POST /api/inventario/devoluciones/aprobar)
export const aprobarDevolucion = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env, user } = tenant;
    const client = getSupabaseClient(company, env);
    const { dev } = req.body; 

    const materiales = typeof dev.materiales === 'string' ? JSON.parse(dev.materiales || '[]') : dev.materiales;
    for (const m of materiales) {
      const totalDevolver = Number(m.devolver) || 0;
      if (totalDevolver > 0) {
        const { data: pData } = await client
          .from('productos')
          .select('id, stock_actual, stock_nuevo, stock_usado, stock_por_revisar')
          .eq('id', m.productoId)
          .single();

        if (pData) {
          let currNuevo = Number(pData.stock_nuevo) || 0;
          let currUsado = Number(pData.stock_usado) || 0;
          let currPorRevisar = Number(pData.stock_por_revisar) || 0;

          // Si el material tiene desglose específico de estados
          let addNuevo = Number(m.devolver_nuevo) || 0;
          let addUsado = Number(m.devolver_usado) || 0;
          let addPorRevisar = Number(m.devolver_por_revisar) || 0;

          if (addNuevo === 0 && addUsado === 0 && addPorRevisar === 0) {
            // Si vino con un estado único o formato anterior
            if (m.estado === 'usado') addUsado = totalDevolver;
            else if (m.estado === 'por_revisar') addPorRevisar = totalDevolver;
            else addNuevo = totalDevolver;
          }

          const nuevoTotalNuevo = currNuevo + addNuevo;
          const nuevoTotalUsado = currUsado + addUsado;
          const nuevoTotalPorRevisar = currPorRevisar + addPorRevisar;
          const nuevoStockActual = Math.round((nuevoTotalNuevo + nuevoTotalUsado + nuevoTotalPorRevisar) * 100) / 100;

          await client
            .from('productos')
            .update({
              stock_actual: nuevoStockActual,
              stock_nuevo: nuevoTotalNuevo,
              stock_usado: nuevoTotalUsado,
              stock_por_revisar: nuevoTotalPorRevisar
            })
            .eq('id', m.productoId);

          const estadosDesglose = [];
          if (addNuevo > 0) estadosDesglose.push(`Nuevas: ${addNuevo}`);
          if (addUsado > 0) estadosDesglose.push(`Usadas: ${addUsado}`);
          if (addPorRevisar > 0) estadosDesglose.push(`Dañadas/Incompletas: ${addPorRevisar}`);
          const labelEstados = estadosDesglose.length > 0 ? ` (${estadosDesglose.join(', ')})` : '';

          await client.from('movimientos_inventario').insert([{
            producto_id: m.productoId,
            tipo: 'ENTRADA',
            cantidad: totalDevolver,
            folio_factura: `DEVOLUCIÓN ${dev.id.substring(0,8)}${labelEstados}`,
            creado_por: user?.id || dev.empleado_id
          }]);
        }
      }
    }

    const { error: devError } = await client.from('devoluciones_empleado').update({ estado: 'APROBADO', revisado_por: user?.id }).eq('id', dev.id);
    if (devError) throw devError;

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// 3. Fetch Employee Retribuciones
export const getEmpleadoRetribuciones = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);
    const { id } = req.params;
    const [evidenciasRes, devolucionesRes, invRes] = await Promise.all([
      client.from('evidencias').select('id, cliente, created_at, descripcion_trabajo, empleado_nombre, sobrantes_verificados').eq('empleado_id', id).order('created_at', { ascending: false }),
      client.from('devoluciones_empleado').select('*').eq('empleado_id', id).eq('estado', 'PENDIENTE').order('creado_en', { ascending: false }),
      client.from('inventario_empleados').select('id, cantidad_disponible, productos(id, nombre_oficial, sku_interno, unidad)').eq('empleado_id', id).gt('cantidad_disponible', 0)
    ]);
    return res.json({ evidencias: evidenciasRes.data || [], devoluciones: devolucionesRes.data || [], inventario: invRes.data || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// 4. Confirmar Verificación de Evidencia (POST /api/inventario/evidencias/verificar)
export const verificarEvidencia = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);
    const { evidenciaId, action, reason, userActionName } = req.body;

    const { error } = await client.from('evidencias').update({ 
      sobrantes_verificados: true,
      notas_verificacion: `[${action} por ${userActionName}] ${reason || ''}`.trim()
    }).eq('id', evidenciaId);

    if (error) throw error;
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// 5. CRUD Producto (POST /api/inventario/productos, PUT /api/inventario/productos/:id)
export const upsertProducto = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);
    
    const id = req.params.id;
    const isUpdate = !!id;
    const body = { ...req.body };

    // Si se enviaron stocks por condición o stock_actual directo:
    if (body.stock_nuevo !== undefined || body.stock_usado !== undefined || body.stock_por_revisar !== undefined) {
      const nuevo = Math.max(0, Number(body.stock_nuevo) || 0);
      const usado = Math.max(0, Number(body.stock_usado) || 0);
      const porRevisar = Math.max(0, Number(body.stock_por_revisar) || 0);
      
      // Si no hay usados ni por revisar, todo el stock va automáticamente a nuevo
      if (usado === 0 && porRevisar === 0 && body.stock_actual !== undefined) {
        const total = Math.max(0, Number(body.stock_actual) || 0);
        body.stock_actual = total;
        body.stock_nuevo = total;
        body.stock_usado = 0;
        body.stock_por_revisar = 0;
      } else {
        body.stock_nuevo = nuevo;
        body.stock_usado = usado;
        body.stock_por_revisar = porRevisar;
        body.stock_actual = Math.round((nuevo + usado + porRevisar) * 100) / 100;
      }
    } else if (body.stock_actual !== undefined) {
      const total = Math.max(0, Number(body.stock_actual) || 0);
      body.stock_actual = total;
      body.stock_nuevo = total;
      body.stock_usado = 0;
      body.stock_por_revisar = 0;
    }
    
    if (isUpdate) {
      const { data: oldProd } = await client.from('productos').select('*').eq('id', id).maybeSingle();
      const { error } = await client.from('productos').update(body).eq('id', id);
      if (error) throw error;

      // Registrar movimiento si hubo cambio manual de stock
      if (oldProd && body.stock_actual !== undefined) {
        const oldStock = Number(oldProd.stock_actual) || 0;
        const newStock = Number(body.stock_actual) || 0;
        const diff = Math.round((newStock - oldStock) * 100) / 100;

        if (diff > 0) {
          await client.from('movimientos_inventario').insert([{
            producto_id: id,
            tipo: 'ENTRADA',
            cantidad: diff,
            folio_factura: 'AJUSTE MANUAL / INCREMENTO DE STOCK',
            proveedor_id: body.proveedor_id || oldProd.proveedor_id || null,
            creado_por: (req as any).user?.id || tenant.user?.id || null
          }]);
        } else if (diff < 0) {
          await client.from('movimientos_inventario').insert([{
            producto_id: id,
            tipo: 'SALIDA',
            cantidad: Math.abs(diff),
            folio_factura: 'AJUSTE MANUAL / DISMINUCIÓN DE STOCK',
            proveedor_id: body.proveedor_id || oldProd.proveedor_id || null,
            creado_por: (req as any).user?.id || tenant.user?.id || null
          }]);
        }
      }

      return res.json({ success: true });
    } else {
      const { data, error } = await client.from('productos').insert([body]).select().single();
      if (error) throw error;

      // Registrar movimiento de ENTRADA por alta inicial si tiene stock
      const initialStock = Number(data.stock_actual) || 0;
      if (initialStock > 0) {
        const estadosDesglose: string[] = [];
        if (data.stock_nuevo > 0) estadosDesglose.push(`Nuevas: ${data.stock_nuevo}`);
        if (data.stock_usado > 0) estadosDesglose.push(`Usadas: ${data.stock_usado}`);
        if (data.stock_por_revisar > 0) estadosDesglose.push(`Dañadas/Incompletas: ${data.stock_por_revisar}`);
        const desgloseStr = estadosDesglose.length > 0 ? ` (${estadosDesglose.join(', ')})` : '';

        await client.from('movimientos_inventario').insert([{
          producto_id: data.id,
          tipo: 'ENTRADA',
          cantidad: initialStock,
          folio_factura: `ALTA DE PRODUCTO / INVENTARIO INICIAL${desgloseStr}`,
          proveedor_id: data.proveedor_id || null,
          creado_por: (req as any).user?.id || tenant.user?.id || null
        }]);
      }

      return res.json({ success: true, data });
    }
  } catch (error: any) {
    console.error('Error in upsertProducto:', error);
    return res.status(500).json({ error: error.message });
  }
};

// 6. Agregar Stock Rápido (POST /api/inventario/productos/:id/stock)
export const addStock = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);
    const { id } = req.params;
    const { cantidad, motivo, currentStock, estado } = req.body;

    const { data: prodData } = await client.from('productos').select('*').eq('id', id).single();
    let updates: any = {};
    if (prodData) {
      const curStock = Number(prodData.stock_actual) || 0;
      const curNuevo = Number(prodData.stock_nuevo) || 0;
      const curUsado = Number(prodData.stock_usado) || 0;
      const curPorRevisar = Number(prodData.stock_por_revisar) || 0;

      if (estado === 'USADO') {
        updates = {
          stock_usado: curUsado + cantidad,
          stock_actual: curStock + cantidad,
        };
      } else if (estado === 'POR_REVISAR') {
        updates = {
          stock_por_revisar: curPorRevisar + cantidad,
          stock_actual: curStock + cantidad,
        };
      } else {
        updates = {
          stock_nuevo: curNuevo + cantidad,
          stock_actual: curStock + cantidad,
        };
      }
    } else {
      updates = { stock_actual: (currentStock || 0) + cantidad };
    }

    const { error: updErr } = await client.from('productos').update(updates).eq('id', id);
    if (updErr) throw updErr;

    const { error: movErr } = await client.from('movimientos_inventario').insert([{
      producto_id: id,
      cantidad,
      tipo: 'ENTRADA',
      motivo
    }]);
    if (movErr) throw movErr;

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// 7. Consumo/Asignación de Material (POST /api/inventario/consumos)
export const guardarConsumo = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env, user } = tenant;
    const client = getSupabaseClient(company, env);
    const { items, esAsignacionEmpleado, destinoId, motivoGeneral } = req.body; 

    for (const item of items) {
      const { data: prodData } = await client.from('productos').select('*').eq('id', item.productoId).single();
      if (prodData) {
        let toDiscount = item.qty;
        let nuevo = Number(prodData.stock_nuevo) || 0;
        let usado = Number(prodData.stock_usado) || 0;
        let porRevisar = Number(prodData.stock_por_revisar) || 0;

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
        const total = Math.round((nuevo + usado + porRevisar) * 100) / 100;
        const { error: updErr } = await client.from('productos')
          .update({ stock_actual: total, stock_nuevo: nuevo, stock_usado: usado, stock_por_revisar: porRevisar })
          .eq('id', item.productoId);
        if (updErr) throw updErr;
      } else {
        const { error: updErr } = await client.from('productos')
          .update({ stock_actual: Math.max(0, item.currentStock - item.qty) })
          .eq('id', item.productoId);
        if (updErr) throw updErr;
      }

      if (esAsignacionEmpleado && destinoId) {
        const { data: invEmp } = await client.from('inventario_empleados')
          .select('*').eq('empleado_id', destinoId).eq('producto_id', item.productoId).maybeSingle();
        
        if (invEmp) {
          await client.from('inventario_empleados')
            .update({ cantidad_disponible: invEmp.cantidad_disponible + item.qty, updated_at: new Date().toISOString() })
            .eq('id', invEmp.id);
        } else {
          await client.from('inventario_empleados').insert([{
            empleado_id: destinoId,
            producto_id: item.productoId,
            cantidad_disponible: item.qty
          }]);
        }
      }

      const { error: movErr } = await client.from('movimientos_inventario').insert([{
        producto_id: item.productoId,
        empleado_id: esAsignacionEmpleado ? destinoId : (user ? user.id : null),
        cantidad: item.qty,
        tipo: 'SALIDA',
        motivo: motivoGeneral
      }]);
      if (movErr) throw movErr;
    }

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// 8. Guardar Importación IA (POST /api/inventario/importar)
export const guardarImportacion = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env, user } = tenant;
    const client = getSupabaseClient(company, env);
    const { mappedItems, proveedorId, folioFactura } = req.body;

    if (folioFactura && folioFactura.trim() !== '') {
      const { data: duplicateMov } = await client.from('movimientos_inventario')
        .select('id')
        .eq('folio_factura', folioFactura.trim())
        .limit(1)
        .maybeSingle();

      if (duplicateMov) {
        return res.status(400).json({ error: 'El folio de factura ingresado ya ha sido registrado previamente en el sistema.' });
      }
    }

    for (const item of mappedItems) {
      let finalProductId = item.matchedProductId;

      if (item.esNuevoProducto) {
        const finalSku = item.skuSugerido && item.skuSugerido.trim() !== '' ? item.skuSugerido.trim() : 'SKU-AI-' + Math.random().toString(36).substring(3, 8).toUpperCase();
        const { data: newProd, error: newProdErr } = await client.from('productos').insert([{
          sku_interno: finalSku,
          nombre_oficial: item.descripcionFactura,
          categoria_id: item.categoriaSeleccionadaId,
          stock_actual: item.cantidad,
          stock_nuevo: item.cantidad,
          stock_usado: 0,
          stock_por_revisar: 0,
          precio_unitario: item.precioUnitario || 0,
          activo: true,
          proveedor_id: proveedorId,
        }]).select().single();
        
        if (newProdErr) throw newProdErr;
        finalProductId = newProd.id;

        await client.from('alias_proveedor_producto').insert([{
          proveedor_id: proveedorId,
          producto_id: finalProductId,
          nombre_segun_proveedor: item.descripcionFactura,
        }]);
      } else if (finalProductId) {
        const { data: pData } = await client.from('productos').select('stock_actual, stock_nuevo, precio_unitario').eq('id', finalProductId).single();
        if (pData) {
          const updates: any = { 
            stock_actual: (Number(pData.stock_actual) || 0) + item.cantidad,
            stock_nuevo: (Number(pData.stock_nuevo) || 0) + item.cantidad,
          };
          if (item.precioUnitario > 0) updates.precio_unitario = item.precioUnitario;
          await client.from('productos').update(updates).eq('id', finalProductId);

          if (proveedorId) {
            const { data: existingAlias } = await client.from('alias_proveedor_producto')
              .select('id').eq('proveedor_id', proveedorId).eq('nombre_segun_proveedor', item.descripcionFactura).maybeSingle();
            
            if (!existingAlias) {
              await client.from('alias_proveedor_producto').insert([{
                proveedor_id: proveedorId,
                producto_id: finalProductId,
                nombre_segun_proveedor: item.descripcionFactura
              }]);
            }
          }
        }
      }

      if (finalProductId) {
        const { error: movErr } = await client.from('movimientos_inventario').insert([{
          producto_id: finalProductId,
          cantidad: item.cantidad,
          tipo: 'ENTRADA',
          folio_factura: folioFactura,
          creado_por: user?.id
        }]);
        if (movErr) throw movErr;
      }
    }

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// 9. Crear Catálogos (POST /api/inventario/catalogos/:tipo)
export const crearCatalogo = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);
    const { tipo } = req.params; // 'categoria', 'proveedor', 'cliente'

    let table = '';
    if (tipo === 'categoria') table = 'categorias_productos';
    else if (tipo === 'proveedor') table = 'proveedores';
    else if (tipo === 'cliente') table = 'clientes';
    else return res.status(400).json({ error: 'Tipo inválido' });

    const { data, error } = await client.from(table).insert([req.body]).select().single();
    if (error) throw error;
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// 10. Verificar si el folio de factura ya existe (GET /api/inventario/verificar-folio)
export const verificarFolioFactura = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);
    const folio = req.query.folio as string;

    if (!folio || folio.trim() === '') {
      return res.json({ existe: false });
    }

    const { data, error } = await client
      .from('movimientos_inventario')
      .select('id')
      .eq('folio_factura', folio.trim())
      .limit(1);

    if (error) throw error;
    return res.json({ existe: data && data.length > 0 });
  } catch (error: any) {
    console.error('Error verificando folio:', error);
    return res.status(500).json({ error: error.message });
  }
};

// 11. Eliminación Masiva de Productos (POST /api/inventario/productos/bulk-delete)
export const bulkDeleteProductos = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Se requiere un arreglo de IDs de productos.' });
    }

    const { error } = await client.from('productos').update({ activo: false }).in('id', ids);
    if (error) throw error;

    return res.json({ success: true, count: ids.length });
  } catch (error: any) {
    console.error('Error in bulkDeleteProductos:', error);
    return res.status(500).json({ error: error.message });
  }
};

// 12. Actualización Masiva de Productos (POST /api/inventario/productos/bulk-update)
export const bulkUpdateProductos = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);
    const { ids, updates } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Se requiere un arreglo de IDs de productos.' });
    }

    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No se enviaron campos válidos para actualizar.' });
    }

    const allowedFields = ['categoria_id', 'proveedor_id', 'stock_actual', 'precio_unitario', 'activo'];
    const cleanUpdates: any = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        cleanUpdates[key] = updates[key];
      }
    }

    if (Object.keys(cleanUpdates).length === 0) {
      return res.status(400).json({ error: 'No hay campos válidos para actualizar en lote.' });
    }

    const { error } = await client.from('productos').update(cleanUpdates).in('id', ids);
    if (error) throw error;

    return res.json({ success: true, count: ids.length });
  } catch (error: any) {
    console.error('Error in bulkUpdateProductos:', error);
    return res.status(500).json({ error: error.message });
  }
};

// 13. Eliminación Definitiva (Hard Delete) de Producto (DELETE /api/inventario/productos/:id)
export const hardDeleteProducto = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);

    const { id } = req.params;

    const { error } = await client
      .from('productos')
      .delete()
      .eq('id', id);

    if (error) {
      if (error.code === '23503' || error.message?.includes('foreign key constraint') || error.message?.includes('violates foreign key')) {
        return res.status(409).json({ 
          error: 'No se puede eliminar este producto definitivamente porque tiene ventas, cotizaciones o movimientos históricos asociados. Puedes marcarlo como inactivo.',
          isForeignKeyConstraint: true
        });
      }
      throw error;
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error('Error in hardDeleteProducto:', error);
    return res.status(500).json({ error: error.message || 'Error al eliminar el producto de la base de datos' });
  }
};

// 14. Obtener todos los movimientos de inventario (GET /api/inventario/movimientos)
export const getMovimientosInventario = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);

    const [movsRes, retirosRes, devsRes, usersRes, provsRes] = await Promise.all([
      client
        .from('movimientos_inventario')
        .select('id, producto_id, tipo, cantidad, fecha, folio_factura, proveedor_id, creado_por, producto:productos(id, nombre_oficial, sku_interno, unidad, precio_unitario)')
        .order('fecha', { ascending: false })
        .limit(500),
      client
        .from('retiros_material')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200),
      client
        .from('devoluciones_empleado')
        .select('*')
        .eq('estado', 'APROBADO')
        .order('created_at', { ascending: false })
        .limit(200),
      client
        .from('usuarios')
        .select('id, nombre, email, rol'),
      client
        .from('proveedores')
        .select('id, nombre')
    ]);

    if (movsRes.error) throw movsRes.error;

    const userMap = new Map((usersRes.data || []).map((u: any) => [u.id, u.nombre || u.email || 'Usuario']));
    const provMap = new Map((provsRes.data || []).map((p: any) => [p.id, p.nombre]));

    // 1. Mapear retiros estructurados desde retiros_material (englobando todas sus partidas)
    const structuredRetiros = (retirosRes.data || []).map((r: any) => {
      const mats = Array.isArray(r.materiales) ? r.materiales : [];
      const totalQty = mats.reduce((s: number, m: any) => s + (Number(m.cantidad) || 0), 0);
      const clientLabel = r.is_split ? 'Varios clientes' : (r.cliente_nombre ? (r.cliente_nombre + (r.sucursal_nombre ? ' - ' + r.sucursal_nombre : '')) : '');
      const fullFolio = `RETIRO: ${(r.motivo || '').trim()}${r.tipo_gasto ? ` [${r.tipo_gasto}]` : ''}${clientLabel ? ` (${clientLabel})` : ''}`;
      
      return {
        id: r.id,
        tipo: 'SALIDA',
        subtipo: 'RETIRO',
        cantidad: totalQty,
        fecha: r.created_at,
        folio_factura: fullFolio,
        detalle_motivo: r.detalle_servicio_proyecto || r.motivo || fullFolio,
        motivo: r.motivo || '',
        cliente_nombre: r.cliente_nombre || '',
        sucursal_nombre: r.sucursal_nombre || '',
        is_split: Boolean(r.is_split),
        tipo_gasto: r.tipo_gasto || 'Operativo',
        proveedor_id: r.proveedor_id || null,
        proveedor_nombre: r.proveedor || provMap.get(r.proveedor_id) || '',
        usuario_id: r.empleado_id,
        usuario_nombre: r.empleado_nombre || userMap.get(r.empleado_id) || 'Empleado',
        producto_id: mats[0]?.producto_id || '',
        producto_nombre: mats.length === 1 ? (mats[0].nombre || 'Material') : `${mats.length} materiales: ${mats.map((m: any) => m.nombre).join(', ')}`,
        producto_sku: mats.length === 1 ? (mats[0].sku || '-') : `${mats.length} partidas`,
        producto_unidad: mats.length === 1 ? (mats[0].unidad || 'pza') : 'pzas',
        precio_unitario: 0,
        materiales: mats
      };
    });

    // 2. Mapear devoluciones estructuradas desde devoluciones_empleado (englobando todas sus partidas devueltas)
    const structuredDevs = (devsRes.data || []).map((d: any) => {
      let rawMats: any[] = [];
      try {
        rawMats = typeof d.materiales === 'string' ? JSON.parse(d.materiales) : (d.materiales || []);
      } catch (_) {
        rawMats = [];
      }
      const mats = rawMats.filter((m: any) => (Number(m.devolver) || 0) > 0);
      const totalQty = mats.reduce((s: number, m: any) => s + (Number(m.devolver) || 0), 0);
      const shortId = d.id ? d.id.substring(0, 8) : 'DEV';
      const fullFolio = `DEVOLUCIÓN #${shortId}`;

      return {
        id: d.id,
        tipo: 'ENTRADA',
        subtipo: 'DEVOLUCIÓN',
        cantidad: totalQty,
        fecha: d.updated_at || d.created_at,
        folio_factura: fullFolio,
        detalle_motivo: d.observaciones || fullFolio,
        motivo: d.observaciones || 'Devolución de material',
        cliente_nombre: '',
        sucursal_nombre: '',
        tipo_gasto: '',
        proveedor_id: null,
        proveedor_nombre: '',
        usuario_id: d.empleado_id,
        usuario_nombre: d.empleado_nombre || userMap.get(d.empleado_id) || 'Empleado',
        producto_id: mats[0]?.productoId || mats[0]?.producto_id || '',
        producto_nombre: mats.length === 1 ? (mats[0].nombre || 'Material') : `${mats.length} materiales: ${mats.map((m: any) => m.nombre).join(', ')}`,
        producto_sku: mats.length === 1 ? (mats[0].sku || '-') : `${mats.length} partidas`,
        producto_unidad: mats.length === 1 ? (mats[0].unidad || 'pza') : 'pzas',
        precio_unitario: 0,
        materiales: mats.map((m: any) => ({
          producto_id: m.productoId || m.producto_id,
          sku: m.sku || '-',
          nombre: m.nombre || 'Material',
          cantidad: Number(m.devolver) || 0,
          unidad: m.unidad || 'pza',
          devolver_nuevo: Number(m.devolver_nuevo) || 0,
          devolver_usado: Number(m.devolver_usado) || 0,
          devolver_por_revisar: Number(m.devolver_por_revisar) || 0
        }))
      };
    });

    // 3. Mapear movimientos de inventario individuales y agrupar registros legados
    const otherMovs: any[] = [];
    const legacyRetirosMap = new Map<string, any>();
    const legacyDevsMap = new Map<string, any>();

    (movsRes.data || []).forEach((m: any) => {
      const prod = Array.isArray(m.producto) ? m.producto[0] : (m.producto || {});
      const folio = m.folio_factura || '';

      if (folio.startsWith('RETIRO:')) {
        const mTime = new Date(m.fecha).getTime();
        const alreadyInStructured = structuredRetiros.some((st: any) => {
          const stTime = new Date(st.fecha).getTime();
          return (st.usuario_id === m.creado_por || st.usuario_nombre === userMap.get(m.creado_por)) && Math.abs(stTime - mTime) < 60000;
        });

        if (!alreadyInStructured) {
          const groupKey = `${m.creado_por}_${folio}_${Math.floor(mTime / 60000)}`;
          if (!legacyRetirosMap.has(groupKey)) {
            let tipoGasto = '';
            const tipoMatch = folio.match(/\[(Servicio|Proyecto|Venta|Operativo)\]/i);
            if (tipoMatch) tipoGasto = tipoMatch[1];
            let clienteNombre = '';
            const clientMatch = folio.match(/\((.*?)\)/);
            if (clientMatch) clienteNombre = clientMatch[1];
            const detalle = folio.replace(/^RETIRO:\s*/i, '').replace(/\[(Servicio|Proyecto|Venta|Operativo)\]/gi, '').replace(/\(.*?\)/g, '').trim();

            legacyRetirosMap.set(groupKey, {
              id: m.id,
              tipo: 'SALIDA',
              subtipo: 'RETIRO',
              cantidad: 0,
              fecha: m.fecha,
              folio_factura: folio,
              detalle_motivo: detalle || folio,
              motivo: detalle,
              cliente_nombre: clienteNombre,
              sucursal_nombre: '',
              tipo_gasto: tipoGasto || 'Operativo',
              proveedor_id: m.proveedor_id,
              proveedor_nombre: provMap.get(m.proveedor_id) || '',
              usuario_id: m.creado_por,
              usuario_nombre: userMap.get(m.creado_por) || 'Empleado',
              producto_id: m.producto_id,
              producto_nombre: prod.nombre_oficial || 'Producto',
              producto_sku: prod.sku_interno || '-',
              producto_unidad: prod.unidad || 'pza',
              precio_unitario: prod.precio_unitario || 0,
              materiales: []
            });
          }

          const leg = legacyRetirosMap.get(groupKey);
          leg.cantidad = Math.round((leg.cantidad + (Number(m.cantidad) || 0)) * 100) / 100;
          leg.materiales.push({
            producto_id: m.producto_id,
            sku: prod.sku_interno || '-',
            nombre: prod.nombre_oficial || 'Producto',
            cantidad: Number(m.cantidad) || 0,
            unidad: prod.unidad || 'pza'
          });
          if (leg.materiales.length > 1) {
            leg.producto_nombre = `${leg.materiales.length} materiales: ${leg.materiales.map((x: any) => x.nombre).join(', ')}`;
            leg.producto_sku = `${leg.materiales.length} partidas`;
          }
        }
      } else if (folio.startsWith('DEVOLUCIÓN')) {
        const mTime = new Date(m.fecha).getTime();
        // Verificar si este movimiento ya está representado en structuredDevs
        const alreadyInStructuredDev = structuredDevs.some((sd: any) => {
          const sdIdShort = sd.id ? sd.id.substring(0, 8).toLowerCase() : '';
          const matchFolioId = sdIdShort && folio.toLowerCase().includes(sdIdShort);
          const sdTime = new Date(sd.fecha).getTime();
          return matchFolioId || ((sd.usuario_id === m.creado_por || sd.usuario_nombre === userMap.get(m.creado_por)) && Math.abs(sdTime - mTime) < 60000);
        });

        if (!alreadyInStructuredDev) {
          const groupKey = `${m.creado_por}_${folio.substring(0, 20)}_${Math.floor(mTime / 60000)}`;
          if (!legacyDevsMap.has(groupKey)) {
            legacyDevsMap.set(groupKey, {
              id: m.id,
              tipo: 'ENTRADA',
              subtipo: 'DEVOLUCIÓN',
              cantidad: 0,
              fecha: m.fecha,
              folio_factura: folio,
              detalle_motivo: folio,
              motivo: 'Devolución de material',
              cliente_nombre: '',
              sucursal_nombre: '',
              tipo_gasto: '',
              proveedor_id: null,
              proveedor_nombre: '',
              usuario_id: m.creado_por,
              usuario_nombre: userMap.get(m.creado_por) || 'Empleado',
              producto_id: m.producto_id,
              producto_nombre: prod.nombre_oficial || 'Producto',
              producto_sku: prod.sku_interno || '-',
              producto_unidad: prod.unidad || 'pza',
              precio_unitario: prod.precio_unitario || 0,
              materiales: []
            });
          }

          const legDev = legacyDevsMap.get(groupKey);
          legDev.cantidad = Math.round((legDev.cantidad + (Number(m.cantidad) || 0)) * 100) / 100;
          legDev.materiales.push({
            producto_id: m.producto_id,
            sku: prod.sku_interno || '-',
            nombre: prod.nombre_oficial || 'Producto',
            cantidad: Number(m.cantidad) || 0,
            unidad: prod.unidad || 'pza'
          });
          if (legDev.materiales.length > 1) {
            legDev.producto_nombre = `${legDev.materiales.length} materiales: ${legDev.materiales.map((x: any) => x.nombre).join(', ')}`;
            legDev.producto_sku = `${legDev.materiales.length} partidas`;
          }
        }
      } else {
        let subtipo = m.tipo;
        if (folio.startsWith('IMPORTACIÓN') || folio.startsWith('FACTURA') || m.proveedor_id) subtipo = 'COMPRA/FACTURA';
        else if (folio.startsWith('CONSUMO')) subtipo = 'CONSUMO';
        else if (folio.startsWith('ALTA DE PRODUCTO')) subtipo = 'ENTRADA';

        otherMovs.push({
          id: m.id,
          tipo: m.tipo,
          subtipo,
          cantidad: Number(m.cantidad) || 0,
          fecha: m.fecha,
          folio_factura: folio,
          detalle_motivo: folio,
          cliente_nombre: '',
          tipo_gasto: '',
          proveedor_id: m.proveedor_id,
          proveedor_nombre: provMap.get(m.proveedor_id) || '',
          usuario_id: m.creado_por,
          usuario_nombre: userMap.get(m.creado_por) || 'Sistema / Almacén',
          producto_id: m.producto_id,
          producto_nombre: prod.nombre_oficial || 'Producto',
          producto_sku: prod.sku_interno || '-',
          producto_unidad: prod.unidad || 'pza',
          precio_unitario: prod.precio_unitario || 0,
          materiales: [{
            producto_id: m.producto_id,
            sku: prod.sku_interno || '-',
            nombre: prod.nombre_oficial || 'Producto',
            cantidad: Number(m.cantidad) || 0,
            unidad: prod.unidad || 'pza'
          }]
        });
      }
    });

    const allMovs = [
      ...structuredRetiros, 
      ...Array.from(legacyRetirosMap.values()), 
      ...structuredDevs, 
      ...Array.from(legacyDevsMap.values()), 
      ...otherMovs
    ];
    allMovs.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    return res.json({ movimientos: allMovs, retiros: allMovs });
  } catch (error: any) {
    console.error('Error en getMovimientosInventario:', error);
    return res.status(500).json({ error: error.message });
  }
};
