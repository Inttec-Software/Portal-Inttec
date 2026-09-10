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
      client.from('movimientos_inventario').select('*, producto:productos(nombre_oficial, sku_interno, precio_unitario)').eq('tipo', 'SALIDA').order('fecha', { ascending: false }).limit(50),
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

    return res.json({
      categorias: categoriasRes.data || [],
      proveedores: proveedoresRes.data || [],
      productos: productosRes.data || [],
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
      if (m.devolver > 0) {
        const { data: pData } = await client.from('productos').select('stock_actual').eq('id', m.productoId).single();
        if (pData) {
          await client.from('productos').update({ stock_actual: pData.stock_actual + m.devolver }).eq('id', m.productoId);
          await client.from('movimientos_inventario').insert([{
            producto_id: m.productoId,
            tipo: 'ENTRADA',
            cantidad: m.devolver,
            folio_factura: `DEVOLUCIÓN MANUAL ${dev.id.substring(0,8)}`,
            creado_por: user?.id
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

// 9. Fetch Employee Retribuciones
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
      client.from('inventario_empleados').select('id, cantidad_disponible, productos(id, nombre_oficial, sku_interno)').eq('empleado_id', id).gt('cantidad_disponible', 0)
    ]);
    return res.json({ evidencias: evidenciasRes.data || [], devoluciones: devolucionesRes.data || [], inventario: invRes.data || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// 3. Confirmar Verificación de Evidencia (POST /api/inventario/evidencias/verificar)
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

// 4. CRUD Producto (POST /api/inventario/productos, PUT /api/inventario/productos/:id)
export const upsertProducto = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);
    
    const id = req.params.id;
    const isUpdate = !!id;
    
    if (isUpdate) {
      const { error } = await client.from('productos').update(req.body).eq('id', id);
      if (error) throw error;
      return res.json({ success: true });
    } else {
      const { data, error } = await client.from('productos').insert([req.body]).select().single();
      if (error) throw error;
      return res.json({ success: true, data });
    }
  } catch (error: any) {
    console.error('Error in upsertProducto:', error);
    return res.status(500).json({ error: error.message });
  }
};

// 5. Agregar Stock Rápido (POST /api/inventario/productos/:id/stock)
export const addStock = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);
    const { id } = req.params;
    const { cantidad, motivo, currentStock } = req.body;

    const { error: updErr } = await client.from('productos').update({ stock_actual: currentStock + cantidad }).eq('id', id);
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

// 6. Consumo/Asignación de Material (POST /api/inventario/consumos)
export const guardarConsumo = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env, user } = tenant;
    const client = getSupabaseClient(company, env);
    const { items, esAsignacionEmpleado, destinoId, motivoGeneral } = req.body; 

    for (const item of items) {
      const { error: updErr } = await client.from('productos')
        .update({ stock_actual: Math.max(0, item.currentStock - item.qty) })
        .eq('id', item.productoId);
      if (updErr) throw updErr;

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

// 7. Guardar Importación IA (POST /api/inventario/importar)
export const guardarImportacion = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env, user } = tenant;
    const client = getSupabaseClient(company, env);
    const { mappedItems, proveedorId, folioFactura } = req.body;

    if (folioFactura && folioFactura.trim() !== '') {
      const { data: existingMov, error: existingErr } = await client
        .from('movimientos_inventario')
        .select('id')
        .eq('folio_factura', folioFactura.trim())
        .limit(1);

      if (existingErr) throw existingErr;
      if (existingMov && existingMov.length > 0) {
        return res.status(400).json({ error: `Ya existe un registro previo en el inventario con el folio de factura: ${folioFactura.trim()}` });
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
        const { data: pData } = await client.from('productos').select('stock_actual, precio_unitario').eq('id', finalProductId).single();
        if (pData) {
          const updates: any = { stock_actual: pData.stock_actual + item.cantidad };
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

// 8. Crear Catálogos (POST /api/inventario/catalogos/:tipo)
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

// 9. Verificar si el folio de factura ya existe (GET /api/inventario/verificar-folio)
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

// 10. Eliminación Masiva de Productos (POST /api/inventario/productos/bulk-delete)
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

// 11. Actualización Masiva de Productos (POST /api/inventario/productos/bulk-update)
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


