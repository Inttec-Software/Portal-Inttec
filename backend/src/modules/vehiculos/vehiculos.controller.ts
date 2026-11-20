import { Request, Response } from 'express';
import { getDbPool } from '../../config/database';
import {
  ensureGpsSchema,
  fetchEpcomGpsDevices,
  getGpsConfig,
  saveGpsConfig,
  registerWebhookGpsPayload,
  buildSimulatedTelemetryForVehicles,
  matchVehicleToGpsDevice,
  reverseGeocodeCoords,
  fetchVehicleRouteHistory,
  EpcomGpsDevice,
} from '../../services/epcomGpsService';

// Helper for insert queries
const insertInto = async (pool: any, table: string, data: any) => {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const query = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
  const result = await pool.query(query, values);
  return result.rows[0];
};

// Helper for update queries
const updateTable = async (pool: any, table: string, data: any, id: any) => {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const setString = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  values.push(id);
  const query = `UPDATE ${table} SET ${setString} WHERE id = $${values.length} RETURNING *`;
  const result = await pool.query(query, values);
  return result.rows[0];
};

// 1. GET /api/vehiculos
export const getVehiculos = async (req: Request, res: Response) => {
  try {
    const { company, env } = (req as any).tenant;
    const pool = getDbPool(company, env);
    const soloActivos = req.query.soloActivos;
    
    let query = 'SELECT * FROM vehiculos';
    if (soloActivos === 'true' || soloActivos === undefined) {
      query += ' WHERE activo = true';
    }
    query += ' ORDER BY marca ASC';
    
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// 2. POST /api/vehiculos
export const createVehiculo = async (req: Request, res: Response) => {
  try {
    const { env, company: activeCompany } = (req as any).tenant;
    const secondaryCompany = activeCompany === 'inttec' ? 'daravisa' : 'inttec';
    
    const primaryPool = getDbPool(activeCompany, env);
    const secondaryPool = getDbPool(secondaryCompany, env);

    const inserted = await insertInto(primaryPool, 'vehiculos', req.body);

    try {
      // Intentar sincronizar en la secundaria
      const check = await secondaryPool.query('SELECT id FROM vehiculos WHERE id = $1', [inserted.id]);
      if (check.rows.length > 0) {
        await updateTable(secondaryPool, 'vehiculos', req.body, inserted.id);
      } else {
        await insertInto(secondaryPool, 'vehiculos', { ...req.body, id: inserted.id });
      }
    } catch (syncErr: any) {
      console.warn('Error syncing vehiculo to secondary db:', syncErr.message);
    }

    res.status(201).json(inserted);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// 3. PUT /api/vehiculos/:id
export const updateVehiculo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { env, company: activeCompany } = (req as any).tenant;
    const secondaryCompany = activeCompany === 'inttec' ? 'daravisa' : 'inttec';

    const primaryPool = getDbPool(activeCompany, env);
    const secondaryPool = getDbPool(secondaryCompany, env);

    const updated = await updateTable(primaryPool, 'vehiculos', req.body, id);

    try {
      await updateTable(secondaryPool, 'vehiculos', req.body, id);
    } catch (syncErr: any) {
      console.warn('Error updating vehiculo in secondary db:', syncErr.message);
    }

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// 4. DELETE /api/vehiculos/:id
export const deleteVehiculo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { env } = (req as any).tenant;
    
    const poolInttec = getDbPool('inttec', env);
    const poolDaravisa = getDbPool('daravisa', env);

    await Promise.allSettled([
      poolInttec.query('DELETE FROM vehiculos WHERE id = $1', [id]),
      poolDaravisa.query('DELETE FROM vehiculos WHERE id = $1', [id])
    ]);

    res.json({ success: true, message: 'Vehiculo eliminado' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// 5. GET /api/vehiculos/gasolina
export const getRegistrosGasolina = async (req: Request, res: Response) => {
  try {
    const { env, company } = (req as any).tenant;
    const { vehiculoId, empleadoId, placas } = req.query;

    const inttecPool = getDbPool('inttec', env);
    const daravisaPool = getDbPool('daravisa', env);

    let targetPlacas = placas as string | undefined;

    if (vehiculoId && !targetPlacas) {
      try {
        const primaryPool = getDbPool(company, env);
        const { rows } = await primaryPool.query('SELECT placas FROM vehiculos WHERE id = $1', [vehiculoId]);
        if (rows.length > 0) targetPlacas = rows[0].placas;
      } catch (e) {}
    }

    const fetchFromPool = async (pool: any, empresaNombre: string) => {
      try {
        let query = `
          SELECT rg.*, 
                 v.marca as vehiculo_marca, v.modelo as vehiculo_modelo, v.placas as vehiculo_placas,
                 u.nombre as empleado_nombre
          FROM registro_gasolina rg
          LEFT JOIN vehiculos v ON rg.vehiculo_id = v.id
          LEFT JOIN usuarios u ON rg.empleado_id = u.id
          WHERE 1=1
        `;
        const values: any[] = [];
        if (empleadoId) {
          values.push(empleadoId);
          query += ` AND rg.empleado_id = $${values.length}`;
        }

        const { rows } = await pool.query(query, values);
        return rows.map((row: any) => ({
          ...row,
          empresa_origen: empresaNombre,
        }));
      } catch (err) {
        return [];
      }
    };

    const [inttecLogs, daravisaLogs] = await Promise.all([
      fetchFromPool(inttecPool, 'INTTEC'),
      fetchFromPool(daravisaPool, 'DARAVISA'),
    ]);

    const logMap = new Map<string, any>();
    [...inttecLogs, ...daravisaLogs].forEach(item => {
      if (item && item.id) {
        logMap.set(item.id, item);
      }
    });

    let allLogs = Array.from(logMap.values());

    if (targetPlacas) {
      const cleanTarget = targetPlacas.toLowerCase().trim();
      allLogs = allLogs.filter(item => (item.vehiculo_placas || '').toLowerCase().trim() === cleanTarget);
    }

    allLogs.sort((a, b) => {
      const timeA = new Date(a.fecha || a.created_at).getTime();
      const timeB = new Date(b.fecha || b.created_at).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return Number(a.kilometraje_actual || 0) - Number(b.kilometraje_actual || 0);
    });

    for (let i = 0; i < allLogs.length; i++) {
      if (i > 0) {
        const prev = allLogs[i - 1];
        const kmAnterior = Number(prev.kilometraje_actual || 0);
        const kmActual = Number(allLogs[i].kilometraje_actual || 0);
        const litros = Number(allLogs[i].litros || 0);
        const kmRecorridos = Math.max(0, kmActual - kmAnterior);

        allLogs[i].kilometraje_anterior = kmAnterior;
        allLogs[i].distancia_recorrida = kmRecorridos;
        allLogs[i].rendimiento_km_l = litros > 0 && kmRecorridos > 0 ? Number((kmRecorridos / litros).toFixed(2)) : 0;
      } else {
        allLogs[i].kilometraje_anterior = null;
        allLogs[i].distancia_recorrida = 0;
        allLogs[i].rendimiento_km_l = 0;
      }
    }

    res.json(allLogs.reverse());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// 6. POST /api/vehiculos/gasolina
export const createRegistroGasolina = async (req: Request, res: Response) => {
  try {
    const { env, company } = (req as any).tenant;
    const primaryPool = getDbPool(company, env);
    
    const inserted = await insertInto(primaryPool, 'registro_gasolina', req.body);

    if (req.body.vehiculo_id && req.body.kilometraje_actual) {
      try {
        const { rows } = await primaryPool.query('SELECT placas FROM vehiculos WHERE id = $1', [req.body.vehiculo_id]);
        if (rows.length > 0) {
          const placas = rows[0].placas;
          const poolInttec = getDbPool('inttec', env);
          const poolDaravisa = getDbPool('daravisa', env);
          
          await Promise.allSettled([
            poolInttec.query('UPDATE vehiculos SET kilometraje_actual = $1 WHERE placas = $2', [req.body.kilometraje_actual, placas]),
            poolDaravisa.query('UPDATE vehiculos SET kilometraje_actual = $1 WHERE placas = $2', [req.body.kilometraje_actual, placas]),
          ]);
        }
      } catch (err) {
        console.warn('Error syncing km', err);
      }
    }

    res.status(201).json(inserted);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// 7. GET /api/vehiculos/gps/live
export const getFlotaGpsLive = async (req: Request, res: Response) => {
  try {
    const { company, env } = (req as any).tenant;
    await ensureGpsSchema(env);
    const pool = getDbPool(company, env);
    const forceRefresh = req.query.force === 'true';

    // Obtener vehículos y usuarios para mostrar los nombres de los conductores asignados hoy
    const [vehRes, usersRes, gpsData] = await Promise.all([
      pool.query('SELECT * FROM vehiculos WHERE activo = true ORDER BY marca ASC'),
      pool.query('SELECT id, nombre, email, rol FROM usuarios'),
      fetchEpcomGpsDevices(env, forceRefresh),
    ]);

    const vehiculos = vehRes.rows || [];
    const usuariosMap = new Map<string, any>();
    (usersRes.rows || []).forEach((u: any) => usuariosMap.set(u.id, u));

    const normalizeStr = (s?: string | null) =>
      (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    const todayStr = new Date().toISOString().split('T')[0];
    const simulatedMap =
      gpsData.source === 'SIMULACION_DEMO' ? buildSimulatedTelemetryForVehicles(vehiculos) : new Map<string, EpcomGpsDevice>();

    const usedImeis = new Set<string>();

    const flotaEnriquecida = await Promise.all(
      vehiculos.map(async (veh: any) => {
        let matchedDevice: EpcomGpsDevice | undefined;

        if (gpsData.devices.length > 0) {
          matchedDevice = matchVehicleToGpsDevice(veh, gpsData.devices, usedImeis);
        } else if (gpsData.source === 'SIMULACION_DEMO') {
          matchedDevice = simulatedMap.get(veh.id);
        }

        if (matchedDevice) {
          usedImeis.add(matchedDevice.imei);
          if (!matchedDevice.address && matchedDevice.lat && matchedDevice.lng) {
            matchedDevice.address = await reverseGeocodeCoords(matchedDevice.lat, matchedDevice.lng);
          }
          // Actualizar última posición conocida en BD en segundo plano si es dato real
          if (gpsData.source !== 'SIMULACION_DEMO' && matchedDevice.lat && matchedDevice.lng) {
            pool
              .query(
                `UPDATE vehiculos
                 SET gps_imei = COALESCE(gps_imei, $1),
                     gps_lat = $2,
                     gps_lng = $3,
                     gps_velocidad = $4,
                     gps_rumbo = $5,
                     gps_ignicion = $6,
                     gps_direccion = COALESCE($7, gps_direccion),
                     gps_bateria_v = COALESCE($8, gps_bateria_v),
                     gps_ultima_actualizacion = $9
                 WHERE id = $10`,
                [
                  matchedDevice.imei,
                  matchedDevice.lat,
                  matchedDevice.lng,
                  matchedDevice.speed,
                  matchedDevice.angle,
                  matchedDevice.ignition,
                  matchedDevice.address,
                  matchedDevice.battery_voltage,
                  matchedDevice.last_update,
                  veh.id,
                ]
              )
              .catch(() => {});
          }
        }

        // Conductores asignados hoy
        let conductoresIds: string[] = [];
        const fechaConductores = veh.conductores_hoy_fecha
          ? (typeof veh.conductores_hoy_fecha === 'object' && veh.conductores_hoy_fecha.toISOString
              ? veh.conductores_hoy_fecha.toISOString().split('T')[0]
              : String(veh.conductores_hoy_fecha).split('T')[0])
          : null;

        if (Array.isArray(veh.conductores_hoy_ids) && (!fechaConductores || fechaConductores === todayStr)) {
          conductoresIds = veh.conductores_hoy_ids;
        }

        const conductoresDetalle = conductoresIds
          .map((cid) => usuariosMap.get(cid))
          .filter(Boolean)
          .map((u) => ({ id: u.id, nombre: u.nombre, email: u.email }));

        return {
          ...veh,
          gps_imei: matchedDevice?.imei || veh.gps_imei || null,
          gps_nombre_epcom: matchedDevice?.name || null,
          gps_lat: matchedDevice?.lat ?? veh.gps_lat ?? null,
          gps_lng: matchedDevice?.lng ?? veh.gps_lng ?? null,
          gps_velocidad: matchedDevice?.speed ?? Number(veh.gps_velocidad || 0),
          gps_rumbo: matchedDevice?.angle ?? Number(veh.gps_rumbo || 0),
          gps_ignicion: matchedDevice?.ignition ?? Boolean(veh.gps_ignicion),
          gps_bateria_v: matchedDevice?.battery_voltage ?? (veh.gps_bateria_v ? Number(veh.gps_bateria_v) : null),
          gps_direccion: matchedDevice?.address || veh.gps_direccion || null,
          gps_ultima_actualizacion: matchedDevice?.last_update || veh.gps_ultima_actualizacion || null,
          gps_online: matchedDevice ? matchedDevice.online : Boolean(veh.gps_lat && veh.gps_lng),
          gps_modelo_hardware: matchedDevice?.raw_model || 'Ruptela ECO5 Lite',
          conductores_hoy_ids: conductoresIds,
          conductores_hoy: conductoresDetalle,
          _hasGpsDevice: Boolean(matchedDevice || veh.gps_imei),
        };
      })
    );

    // Ocultar del Mapa GPS los autos propios que no llevan localizador Ruptela (ej. "Auto propio Luly Chevrolet Sonic")
    const flotaConGps = flotaEnriquecida.filter((v: any) => {
      const fullTitle = `${v.marca || ''} ${v.modelo || ''}`.toLowerCase();
      if (fullTitle.includes('auto propio') && !v.gps_imei) return false;
      if (gpsData.source === 'EPCOM_LIVE' && !v._hasGpsDevice) return false;
      return true;
    });

    // Enviar todos los dispositivos detectados en EPCOM GPS para que el usuario pueda vincular o cambiar con 1 clic
    const dispositivosParaVincular = gpsData.devices;

    res.json({
      source: gpsData.source,
      configured: gpsData.configured,
      apiUrl: gpsData.apiUrl,
      error: gpsData.error || null,
      vehiculos: flotaConGps,
      dispositivos_epcom_disponibles: dispositivosParaVincular,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// 8. PUT /api/vehiculos/:id/asignar-dia
export const asignarConductoresDia = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { env } = (req as any).tenant;
    await ensureGpsSchema(env);

    const { empleados_ids, gps_imei } = req.body;
    const cleanIds = Array.isArray(empleados_ids) ? empleados_ids.filter(Boolean) : [];
    const todayStr = new Date().toISOString().split('T')[0];

    const poolInttec = getDbPool('inttec', env);
    const poolDaravisa = getDbPool('daravisa', env);

    const updateQuery =
      gps_imei !== undefined
        ? `UPDATE vehiculos SET conductores_hoy_ids = $1::jsonb, conductores_hoy_fecha = $2, gps_imei = $3 WHERE id = $4 RETURNING *`
        : `UPDATE vehiculos SET conductores_hoy_ids = $1::jsonb, conductores_hoy_fecha = $2 WHERE id = $3 RETURNING *`;

    const params =
      gps_imei !== undefined
        ? [JSON.stringify(cleanIds), todayStr, gps_imei || null, id]
        : [JSON.stringify(cleanIds), todayStr, id];

    const [resI, resD] = await Promise.allSettled([
      poolInttec.query(updateQuery, params),
      poolDaravisa.query(updateQuery, params),
    ]);

    const updated =
      resI.status === 'fulfilled' && resI.value.rows[0]
        ? resI.value.rows[0]
        : resD.status === 'fulfilled' && resD.value.rows[0]
          ? resD.value.rows[0]
          : null;

    res.json({ success: true, vehiculo: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// 9. GET / POST /api/vehiculos/gps/config
export const getGpsConfigController = async (req: Request, res: Response) => {
  try {
    const { env } = (req as any).tenant;
    const cfg = await getGpsConfig(env);
    res.json({
      apiUrl: cfg.apiUrl,
      configured: cfg.configured,
      maskedKey: cfg.apiKey ? `${cfg.apiKey.slice(0, 4)}••••${cfg.apiKey.slice(-4)}` : '',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const saveGpsConfigController = async (req: Request, res: Response) => {
  try {
    const { env } = (req as any).tenant;
    const { apiUrl, apiKey } = req.body;
    const saved = await saveGpsConfig(apiUrl, apiKey, env);
    const testFetch = await fetchEpcomGpsDevices(env, true);
    res.json({
      success: true,
      configured: saved.configured,
      apiUrl: saved.apiUrl,
      source: testFetch.source,
      devicesFound: testFetch.devices.length,
      error: testFetch.error || null,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// 10. POST /api/vehiculos/gps/webhook
export const handleGpsWebhook = async (req: Request, res: Response) => {
  try {
    const parsed = registerWebhookGpsPayload(req.body);
    res.status(200).json({ status: 'ok', processed: parsed.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// 11. GET /api/vehiculos/:id/gps/historial?fecha=YYYY-MM-DD
export const getHistorialRutaVehiculo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { fecha } = req.query as { fecha?: string };
    const { company, env } = (req as any).tenant;
    await ensureGpsSchema(env);
    const pool = getDbPool(company, env);

    const { rows } = await pool.query('SELECT * FROM vehiculos WHERE id = $1 LIMIT 1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Vehículo no encontrado' });
    }
    const veh = rows[0];
    let targetImei = veh.gps_imei;

    if (!targetImei) {
      const gpsData = await fetchEpcomGpsDevices(env);
      const matched = matchVehicleToGpsDevice(veh, gpsData.devices);
      if (matched) targetImei = matched.imei;
    }

    if (!targetImei) {
      return res.status(400).json({ error: 'Este vehículo no tiene un localizador GPS vinculado' });
    }

    const history = await fetchVehicleRouteHistory(targetImei, fecha, env);
    res.json({
      vehiculo: {
        id: veh.id,
        marca: veh.marca,
        modelo: veh.modelo,
        anio: veh.anio,
        placas: veh.placas,
      },
      ...history,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
