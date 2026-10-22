import { logger } from '@/utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiHeaders, getApiUrl, invalidateHeaderCache } from './apiHelper';
import { apiClient } from './apiClient';
import { Platform } from 'react-native';
import { COMPANY_BASE_TIMEZONE, detectUserTimezone, embedTimezoneInAddress } from '@/utils/timezoneUtils';

// Permitir Storage en dispositivos nativos (iOS/Android) o en el navegador (Web)
const isBrowser = Platform.OS !== 'web' || (typeof window !== 'undefined' && typeof window.document !== 'undefined');


let activeCompany: 'inttec' | 'daravisa' = 'inttec';

export const CompanyService = {
  getActiveCompany(): 'inttec' | 'daravisa' {
    return activeCompany;
  },
  async setActiveCompany(company: 'inttec' | 'daravisa'): Promise<void> {
    activeCompany = company;
        invalidateHeaderCache();
    if (isBrowser) {
      await AsyncStorage.setItem('active_company', company);
    }
  },
  async loadSavedCompany(): Promise<'inttec' | 'daravisa'> {
    if (isBrowser) {
      const saved = await AsyncStorage.getItem('active_company');
      if (saved === 'daravisa' || saved === 'inttec') {
        activeCompany = saved;
                invalidateHeaderCache();
      }
    }
    return activeCompany;
  }
};

let activeEnv: 'cloud' | 'test' = typeof __DEV__ !== 'undefined' && __DEV__ ? 'test' : 'cloud';
export const EnvService = {
  getActiveEnv(): 'cloud' | 'test' {
    return activeEnv;
  },
  async setActiveEnv(env: 'cloud' | 'test'): Promise<void> {
    activeEnv = env;
        invalidateHeaderCache();
    if (isBrowser) {
      await AsyncStorage.setItem('active_env', env);
    }
  },
  async loadSavedEnv(): Promise<'cloud' | 'test'> {
    if (isBrowser) {
      const saved = await AsyncStorage.getItem('active_env');
      if (saved === 'cloud' || saved === 'test') {
        activeEnv = saved;
              }
    }
    return activeEnv;
  }
};



export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: 'ADMIN' | 'EMPLEADO' | 'DEV';
  telefono?: string;
  sucursal?: string;
  created_at?: string;
}

export type EstadoReembolsoGasto = 'NORMAL' | 'PENDIENTE_REEMBOLSO' | 'REEMBOLSADO';

export interface Gasto {
  id: string;
  empleado_id: string;
  empleado_nombre?: string | null;
  monto: number;
  categoria?: string | null;
  categoria_id?: string | null; // Deprecado: la categorÃ­a se obtiene a travÃ©s de subcategoria_id
  subcategoria?: string | null;
  subcategoria_id?: string | null;
  metodo_pago: 'efectivo' | 'tarjeta' | 'tarjeta_credito' | 'tarjeta_debito' | 'transferencia';
  justificacion?: string | null;
  foto_url?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ACTION_REQUIRED';
  rejection_feedback?: string | null;
  created_at?: string;
  approved_at?: string | null;
  fecha_comprobante?: string | null;
  proveedor?: string | null;
  proveedor_id?: string | null;
  cliente?: string | null;
  cliente_id?: string | null;
  sucursal?: string | null;
  sucursal_id?: string | null;
  tipo_tarjeta?: string | null;
  ubicacion_registro?: string | null;
  estado?: string | null;
  estado_reembolso?: EstadoReembolsoGasto | null;
  facturado?: boolean | null;
  factura_url?: string | null;
  motivo_sin_factura?: string | null;
  tipo_servicio_proyecto?: string | null;
  detalle_servicio_proyecto?: string | null;
  venta_id?: string | null;
  venta_rel?: {
    id: string;
    cliente?: string;
    fecha?: string;
    sucursal?: string;
    tipo_proyecto?: string;
    factura_referencia?: string;
    precio_total_facturado?: number;
  } | null;
  // Relaciones Joins normalizadas
  categoria_rel?: { id: string; nombre: string } | null;
  subcategoria_rel?: { 
    id: string; 
    nombre: string; 
    categoria_id?: string;
    categoria_rel?: { id: string; nombre: string } | null;
  } | null;
  proveedor_rel?: { id: string; nombre: string } | null;
  cliente_rel?: { id: string; nombre: string } | null;
  sucursal_rel?: { id: string; nombre: string } | null;
}

export const GastoHelper = {
  getVentaInfo: (g: Gasto | null | undefined): string => {
    if (!g) return '';
    if (g.venta_rel?.cliente) {
      return `${g.venta_rel.cliente}${g.venta_rel.fecha ? ` (${g.venta_rel.fecha})` : ''}`;
    }
    return g.venta_id ? `Venta ID: ${g.venta_id.slice(0, 8)}...` : '';
  },
  getCategoria: (g: Gasto | null | undefined): string => {
    if (!g) return '';
    return (
      (g.subcategoria_rel as any)?.categorias?.nombre ||
      g.subcategoria_rel?.categoria_rel?.nombre ||
      g.categoria_rel?.nombre ||
      g.categoria ||
      ''
    );
  },
  getSubcategoria: (g: Gasto | null | undefined): string => {
    if (!g) return '';
    return g.subcategoria_rel?.nombre || g.subcategoria || '';
  },
  getProveedor: (g: Gasto | null | undefined): string => {
    if (!g) return '';
    return g.proveedor_rel?.nombre || g.proveedor || '';
  },
  getCliente: (g: Gasto | null | undefined): string => {
    if (!g) return '';
    return g.cliente_rel?.nombre || g.cliente || '';
  },
  getSucursal: (g: Gasto | null | undefined): string => {
    if (!g) return '';
    return g.sucursal_rel?.nombre || g.sucursal || '';
  },
  getFacturaUrls: (g: Gasto | null | undefined): string[] => {
    if (!g || !g.factura_url) return [];
    return g.factura_url.split(',').map(u => u.trim()).filter(Boolean);
  },
  getFotoUrls: (g: Gasto | null | undefined): string[] => {
    if (!g) return [];
    if (Array.isArray((g as any).base64Fotos) && (g as any).base64Fotos.length > 0) {
      return (g as any).base64Fotos.map((item: any) => {
        if (typeof item === 'string') {
          return item.startsWith('data:') || item.startsWith('http') ? item : `data:image/jpeg;base64,${item}`;
        }
        const b64 = item.base64 || item.uri || item.url;
        if (!b64) return '';
        return b64.startsWith('data:') || b64.startsWith('http') ? b64 : `data:image/jpeg;base64,${b64}`;
      }).filter(Boolean);
    }
    const raw = g.foto_url || ((g as any).isOffline ? (g as any).base64Foto : null);
    if (!raw) return [];
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    if (!trimmed) return [];
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((item: any) => typeof item === 'string' ? item : item?.uri || item?.url).filter(Boolean);
        }
      } catch {}
    }
    return trimmed.split(',').map(u => {
      const s = u.trim();
      if (!s) return '';
      if (!s.startsWith('http') && !s.startsWith('data:') && !s.startsWith('file:') && !s.startsWith('/') && s.length > 100) {
        return `data:image/jpeg;base64,${s}`;
      }
      return s;
    }).filter(Boolean);
  },
  getEstadoReembolsoLabel: (g: Gasto | null | undefined): string => {
    if (!g) return 'Normal';
    if (g.estado_reembolso === 'PENDIENTE_REEMBOLSO') return 'Pendiente de Reembolso';
    if (g.estado_reembolso === 'REEMBOLSADO') return 'Reembolsado';
    return 'Normal';
  },
  GASTOS_SELECT_QUERY: `*, subcategoria_rel:subcategorias(id, nombre, categoria_id, categorias(id, nombre)), proveedor_rel:proveedores(id, nombre), cliente_rel:clientes(id, nombre), sucursal_rel:sucursales_cliente(id, nombre)`
};

export const GastoService = {
  enrichGastosWithCatalogs: (
    gastos: any[],
    categorias: { id: string; nombre: string }[] = [],
    subcategorias: { id: string; nombre: string; categoria_id?: string }[] = [],
    proveedores: { id: string; nombre: string }[] = [],
    clientes: { id: string; nombre: string }[] = [],
    sucursales: { id: string; nombre: string }[] = []
  ): Gasto[] => {
    const catMap = new Map(categorias.map(c => [c.id, c.nombre]));
    const subMap = new Map(subcategorias.map(s => [s.id, s]));
    const provMap = new Map(proveedores.map(p => [p.id, p.nombre]));
    const cliMap = new Map(clientes.map(c => [c.id, c.nombre]));
    const sucMap = new Map(sucursales.map(s => [s.id, s.nombre]));

    return gastos.map(g => {
      let subRel = g.subcategoria_rel;
      let catRel = g.categoria_rel;
      let provRel = g.proveedor_rel;
      let cliRel = g.cliente_rel;
      let sucRel = g.sucursal_rel;

      if (!subRel && g.subcategoria_id) {
        const foundSub = subMap.get(g.subcategoria_id);
        if (foundSub) {
          const parentCatName = foundSub.categoria_id ? catMap.get(foundSub.categoria_id) : undefined;
          subRel = {
            id: foundSub.id,
            nombre: foundSub.nombre,
            categoria_id: foundSub.categoria_id,
            categoria_rel: parentCatName ? { id: foundSub.categoria_id!, nombre: parentCatName } : null,
          };
        }
      } else if (subRel && !subRel.categoria_rel && subRel.categoria_id) {
        const parentCatName = catMap.get(subRel.categoria_id);
        if (parentCatName) {
          subRel.categoria_rel = { id: subRel.categoria_id, nombre: parentCatName };
        }
      }

      if (!provRel && g.proveedor_id) {
        const pName = provMap.get(g.proveedor_id);
        if (pName) provRel = { id: g.proveedor_id, nombre: pName };
      }

      if (!cliRel && g.cliente_id) {
        const cName = cliMap.get(g.cliente_id);
        if (cName) cliRel = { id: g.cliente_id, nombre: cName };
      }

      if (!sucRel && g.sucursal_id) {
        const sName = sucMap.get(g.sucursal_id);
        if (sName) sucRel = { id: g.sucursal_id, nombre: sName };
      }

      return {
        ...g,
        subcategoria_rel: subRel || null,
        categoria_rel: catRel || null,
        proveedor_rel: provRel || null,
        cliente_rel: cliRel || null,
        sucursal_rel: sucRel || null,
      } as Gasto;
    });
  }
};

export interface Evidencia {
  id: string;
  empleado_id: string;
  empleado_nombre?: string | null;
  cliente: string;
  descripcion_trabajo: string;
  materiales_usados?: string | null;
  observaciones?: string | null;
  foto_antes_url?: string | null;
  foto_despues_url?: string | null;
  fotos_adicionales_urls?: string[] | null;
  resumen_ia?: string | null;
  created_at?: string;
}

export interface CatalogoItem {
  id: string;
  nombre: string;
}

export interface SubcategoriaItem {
  id: string;
  categoria_id: string;
  nombre: string;
}

export interface ClienteItem {
  id: string;
  nombre: string;
  rfc?: string | null;
  correo_electronico?: string | null;
  direccion?: string | null;
  codigo_postal?: string | null;
  razon_social?: string | null;
  regimen_fiscal?: string | null;
  uso_cfdi?: string | null;
}

export interface SucursalCliente {
  id: string;
  cliente_id: string;
  nombre: string;
}

export interface ProveedorItem {
  id: string;
  nombre: string;
  rfc?: string | null;
  created_at?: string;
}

/**
 * Servicio de AutenticaciÃ³n
 */
export const AuthService = {
  async login(email: string, password: string): Promise<Usuario> {
    const apiUrl = getApiUrl();
    const company = CompanyService.getActiveCompany();
    const env = EnvService.getActiveEnv();

    try {
      const response = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-company': company,
          'x-env': env
        },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        let errorMsg = `Error ${response.status}: no se pudo conectar con el servidor`;
        try {
          const errData = await response.json();
          if (errData && errData.message) errorMsg = errData.message;
        } catch (_) {
          const text = await response.text().catch(() => '');
          if (text) errorMsg = `Servidor respondiÃ³ con cÃ³digo ${response.status}`;
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();

      if (isBrowser) {
        // Guardamos tanto el usuario como el token
        await AsyncStorage.setItem(`logged_user_${company}`, JSON.stringify(data.usuario));
        await AsyncStorage.setItem(`jwt_token_${company}`, data.token);
        invalidateHeaderCache();
      }

      return data.usuario as Usuario;
    } catch (error: any) {
      throw new Error(`Error de conexiÃ³n: ${error.message}`);
    }
  },

  async logout(): Promise<void> {
    if (isBrowser) {
      await AsyncStorage.removeItem('logged_user_inttec');
      await AsyncStorage.removeItem('logged_user_daravisa');
      await AsyncStorage.removeItem('jwt_token_inttec');
      await AsyncStorage.removeItem('jwt_token_daravisa');
      invalidateHeaderCache();
    }
  },

  async getCurrentUser(): Promise<Usuario | null> {
    if (isBrowser) {
      const company = CompanyService.getActiveCompany();
      const userStr = await AsyncStorage.getItem(`logged_user_${company}`);
      if (!userStr) return null;
      try {
        return JSON.parse(userStr) as Usuario;
      } catch {
        return null;
      }
    }
    return null;
  },

  async getToken(): Promise<string | null> {
    if (isBrowser) {
      const company = CompanyService.getActiveCompany();
      return await AsyncStorage.getItem(`jwt_token_${company}`);
    }
    return null;
  }
};

export const sortUsuariosByRoleAndName = (usuarios: Usuario[]): Usuario[] => {
  const getRolePriority = (role?: string | null) => {
    const r = (role || '').toUpperCase();
    if (r === 'ADMIN') return 1;
    if (r === 'DEV') return 2;
    if (r === 'EMPLEADO') return 3;
    return 4;
  };

  return [...usuarios].sort((a, b) => {
    const pA = getRolePriority(a.rol);
    const pB = getRolePriority(b.rol);
    if (pA !== pB) return pA - pB;
    return (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });
  });
};

export interface Asistencia {
  id: string;
  empleado_id: string;
  fecha: string; // YYYY-MM-DD
  hora_entrada?: string | null;
  foto_entrada_url?: string | null;
  latitud_entrada?: number | null;
  longitud_entrada?: number | null;
  direccion_entrada?: string | null;
  hora_salida?: string | null;
  foto_salida_url?: string | null;
  latitud_salida?: number | null;
  longitud_salida?: number | null;
  direccion_salida?: string | null;
  descripcion?: string | null;
  autoCerrado?: boolean;
  creado_en?: string;
}

/**
 * Servicio de Asistencias (Auto-Checador)
 */
export const AsistenciaService = {
  /**
   * Obtiene los componentes de fecha/hora desglosados en una zona horaria específica (ej. America/Tijuana, America/Cancun, etc.)
   */
  getZonedParts(date: Date = new Date(), timeZone?: string) {
    const tz = timeZone || detectUserTimezone();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const get = (type: string) => Number(parts.find(p => p.type === type)?.value || 0);

    return {
      year: get('year'),
      month: get('month'),
      day: get('day'),
      hour: get('hour'),
      minute: get('minute'),
      second: get('second'),
      timeZone: tz,
    };
  },

  /**
   * Obtiene la fecha de la jornada laboral en formato YYYY-MM-DD en la zona horaria del empleado.
   * La jornada laboral se reinicia a las 6:00 AM locales de cada día:
   * - A partir de las 06:00:00 AM: Jornada del día actual (siempre pide entrada).
   * - Antes de las 06:00:00 AM (00:00 - 05:59): Jornada del día anterior (permite checar salida de turnos que terminan de madrugada).
   */
  getFechaJornada(date: Date = new Date(), timeZone?: string): string {
    const z = this.getZonedParts(date, timeZone);
    const localD = new Date(Date.UTC(z.year, z.month - 1, z.day));
    if (z.hour < 6) {
      localD.setUTCDate(localD.getUTCDate() - 1);
    }
    const y = localD.getUTCFullYear();
    const m = String(localD.getUTCMonth() + 1).padStart(2, '0');
    const d = String(localD.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  /**
   * Obtiene la hora local formateada en HH:MM:SS en la zona horaria correspondiente.
   */
  getHoraLocal(date: Date = new Date(), timeZone?: string): string {
    const z = this.getZonedParts(date, timeZone);
    const hours = String(z.hour).padStart(2, '0');
    const minutes = String(z.minute).padStart(2, '0');
    const seconds = String(z.second).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  },

  /**
   * Obtiene el registro de asistencia de la jornada actual (iniciada a las 6:00 AM) para un empleado.
   */
  async getRegistroHoy(empleadoId: string, timeZone?: string): Promise<Asistencia | null> {
    const fechaJornada = this.getFechaJornada(new Date(), timeZone);
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/asistencias/hoy/${empleadoId}?fecha=${fechaJornada}`, { headers });
    if (!res.ok) throw new Error('Error al obtener registro de asistencia');
    const data = await res.json();
    if (data && data.fecha) {
      data.fecha = String(data.fecha).split('T')[0];
    }
    return data;
  },

  /**
   * Registra la entrada del empleado con soporte para múltiples zonas horarias.
   */
  async registrarEntrada(
    empleadoId: string,
    fotoUrl: string,
    latitud: number,
    longitud: number,
    direccion: string,
    timeZone?: string
  ): Promise<Asistencia> {
    const resolvedTz = timeZone || detectUserTimezone(latitud, longitud, direccion);
    const ahora = new Date();
    const horaStr = this.getHoraLocal(ahora, resolvedTz);
    const fechaStr = this.getFechaJornada(ahora, resolvedTz);
    const direccionConTz = embedTimezoneInAddress(direccion, resolvedTz);

    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/asistencias/entrada`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        empleado_id: empleadoId,
        fecha: fechaStr,
        hora_entrada: horaStr,
        foto_entrada_url: fotoUrl,
        latitud_entrada: latitud,
        longitud_entrada: longitud,
        direccion_entrada: direccionConTz,
      })
    });
    if (!res.ok) throw new Error('Error al registrar entrada');
    const data = await res.json();
    if (data && data.fecha) {
      data.fecha = String(data.fecha).split('T')[0];
    }
    return data;
  },

  /**
   * Registra la salida del empleado (actualiza el registro existente de la jornada).
   */
  async registrarSalida(
    asistenciaId: string | null | undefined,
    fotoUrl: string,
    latitud: number,
    longitud: number,
    direccion: string,
    empleadoId?: string,
    fecha?: string,
    timeZone?: string
  ): Promise<Asistencia> {
    const resolvedTz = timeZone || detectUserTimezone(latitud, longitud, direccion);
    const ahora = new Date();
    const horaStr = this.getHoraLocal(ahora, resolvedTz);
    const fechaStr = fecha || this.getFechaJornada(ahora, resolvedTz);
    const direccionConTz = embedTimezoneInAddress(direccion, resolvedTz);

    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/asistencias/salida`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        id: asistenciaId || undefined,
        empleado_id: empleadoId,
        fecha: fechaStr,
        hora_salida: horaStr,
        foto_salida_url: fotoUrl,
        latitud_salida: latitud,
        longitud_salida: longitud,
        direccion_salida: direccionConTz,
      })
    });
    if (!res.ok) throw new Error('Error al registrar salida');
    const data = await res.json();
    if (data && data.fecha) {
      data.fecha = String(data.fecha).split('T')[0];
    }
    return data;
  },

  /**
   * Obtiene el historial de asistencias de un empleado (opcionalmente filtrado por rango de fechas).
   */
  async getHistorialEmpleado(empleadoId: string, startDate?: string, endDate?: string): Promise<Asistencia[]> {
    const headers = await getApiHeaders();
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${getApiUrl()}/api/asistencias/historial/${empleadoId}${qs}`, { headers });
    if (!res.ok) throw new Error('Error al obtener historial de asistencia');
    const list = await res.json();
    return (list || []).map((item: Asistencia) => ({
      ...item,
      fecha: item.fecha ? String(item.fecha).split('T')[0] : item.fecha
    }));
  },

  /**
   * Sube una foto de asistencia a Supabase Storage.
   */
  async subirFotoAsistencia(
    empleadoId: string,
    base64Data: string,
    tipo: 'entrada' | 'salida'
  ): Promise<string> {
    const fechaStr = this.getFechaJornada();
    const fileName = `asistencias/${empleadoId}/${fechaStr}_${tipo}_${Date.now()}.jpg`;

    let cleanBase64 = base64Data;
    if (base64Data.includes(';base64,')) {
      const parts = base64Data.split(';base64,');
      if (parts.length > 1) {
        cleanBase64 = parts[1];
      }
    }

    try {
      const b64 = "data:image/jpeg;base64," + cleanBase64;
      const url = await apiClient.uploadBase64(b64, fileName, 'image/jpeg', 'asistencias');
      return url;
    } catch (err: any) {
      logger.error('[Supabase Storage] ExcepciÃ³n capturada en subirFotoAsistencia:', err.message || err);
      throw err;
    }
  },

  /**
   * Edita las horas de entrada y/o salida de un registro de asistencia (Exclusivo para usuarios con rol DEV).
   */
  async editarHorasAsistencia(
    asistenciaId: string,
    horaEntrada: string,
    horaSalida: string | null,
    observaciones?: string,
    fecha?: string
  ): Promise<{ success: boolean; message: string; data: any }> {
    const headers = await getApiHeaders();
    try {
      const res = await fetch(`${getApiUrl()}/api/asistencias/admin/editar-horas/${asistenciaId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          hora_entrada: horaEntrada,
          hora_salida: horaSalida,
          limpiar_salida: horaSalida === null,
          observaciones,
          fecha,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Error al actualizar horas de asistencia');
      }
      return data;
    } catch (err: any) {
      // Fallback a clientes de Supabase directos
      const updateData: any = {
        hora_entrada: horaEntrada,
        hora_salida: horaSalida,
      };
      if (horaSalida === null) {
        updateData.foto_salida_url = null;
        updateData.direccion_salida = null;
        updateData.latitud_salida = null;
        updateData.longitud_salida = null;
      }
      if (fecha) {
        updateData.fecha = fecha;
      }
      await Promise.allSettled([
        inttecClient.from('asistencias').update(updateData).eq('id', asistenciaId),
        daravisaClient.from('asistencias').update(updateData).eq('id', asistenciaId),
      ]);
      return { success: true, message: 'Horas actualizadas (fallback directo)', data: updateData };
    }
  },

  /**
   * Elimina un registro de asistencia (Exclusivo para usuarios con rol DEV).
   */
  async eliminarAsistencia(
    asistenciaId: string
  ): Promise<{ success: boolean; message: string }> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/asistencias/admin/eliminar/${asistenciaId}`, {
      method: 'DELETE',
      headers,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.error || 'Error al eliminar el registro de asistencia');
    }
    return data;
  },
};

export interface Venta {
  id: string;
  registrado_por: string;
  fecha: string;
  cliente: string;
  factura_referencia?: string | null;
  tipo_proyecto?: string | null;
  proveedor?: string | null;
  precio_total_facturado: number;
  costo_total: number;
  utilidad_bruta: number;
  margen_porcentual: number;
  total_pagado?: number;
  saldo_pendiente?: number;
  estado_pago?: EstadoPagoVenta;
  factura_url?: string | null;
  notas?: string | null;
  descripcion?: string | null;
  agregar_iva?: boolean;
  folio?: string | null;
  created_at?: string;
  cfdi_uuid?: string | null;
  cfdi_facturapi_id?: string | null;
  cfdi_estado?: string | null;
  cfdi_xml_url?: string | null;
  sucursal?: string | null;
  cotizaciones?: { folio: string } | null;
  usuarios?: { nombre: string } | null;
  cotizacion_id?: string | null;
  ventas_partidas?: { descripcion: string; unidad?: string }[] | null;
}

export interface VentaPartida {
  id: string;
  venta_id: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  precio_unitario_venta: number;
  costo_unitario_proveedor: number;
  precio_total_venta: number;
  costo_total_proveedor: number;
}

export interface VentaPago {
  id: string;
  venta_id: string;
  monto: number;
  fecha_pago: string;
  metodo_pago?: string | null;
  referencia?: string | null;
  registrado_por?: string | null;
  created_at?: string;
}

export type EstadoPagoVenta = 'PAGADO' | 'PAGO PARCIAL' | 'PENDIENTE DE PAGO' | 'SIN PRECIO';

export function calcularEstadoPago(precioTotalFacturado: number, totalPagado: number): EstadoPagoVenta {
  if (precioTotalFacturado > 0 && totalPagado >= precioTotalFacturado - 0.01) {
    return 'PAGADO';
  } else if (totalPagado > 0 && totalPagado < precioTotalFacturado - 0.01) {
    return 'PAGO PARCIAL';
  } else if (precioTotalFacturado <= 0 && totalPagado <= 0) {
    return 'SIN PRECIO';
  } else {
    return 'PENDIENTE DE PAGO';
  }
}

export async function recalculateVentaTotals(ventaId: string): Promise<void> {
  try {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/reportes/ventas/${ventaId}/recalculate`, {
      method: 'POST',
      headers
    });
    if (!res.ok) throw new Error('Error recalculating venta totals via API');
    const data = await res.json();
    logger.info(`[Recalculate] Venta ${ventaId} actualizada en base de datos. Costo Total: ${data.costoTotal}`);
  } catch (err) {
    logger.error('[Recalculate] Error recalculating venta totals:', err);
  }
}

export async function syncVentaPaymentStatus(ventaId: string): Promise<void> {
  try {
    const headers = await getApiHeaders();
    await fetch(`${getApiUrl()}/api/ventas/${ventaId}/sync-payment`, {
      method: 'POST',
      headers
    });
  } catch (err) {
    // Captura limpia sin romper la ejecucion
  }
}


export interface Vehiculo {
  id: string;
  marca: string;
  modelo: string;
  anio: number;
  placas: string;
  numero_economico?: string | null;
  activo: boolean;
  created_at?: string;
}

export interface RegistroGasolina {
  id: string;
  gasto_id?: string | null;
  vehiculo_id: string;
  empleado_id: string;
  fecha: string;
  kilometraje_actual: number;
  kilometraje_anterior?: number | null;
  distancia_recorrida?: number | null;
  rendimiento_km_l?: number | null;
  litros: number;
  costo_total: number;
  ticket_foto_url?: string | null;
  observaciones?: string | null;
  created_at?: string;
  vehiculo_marca?: string;
  vehiculo_modelo?: string;
  vehiculo_placas?: string;
  empleado_nombre?: string;
  empresa_origen?: string;
}

export const VehiculoService = {
  async getVehiculos(soloActivos = true): Promise<Vehiculo[]> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/vehiculos?soloActivos=${soloActivos}`, { headers });
    if (!res.ok) throw new Error('Error al obtener vehÃ­culos');
    return res.json();
  },

  async crearVehiculo(vehiculo: Omit<Vehiculo, 'id' | 'created_at'>): Promise<Vehiculo> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/vehiculos`, {
      method: 'POST',
      headers,
      body: JSON.stringify(vehiculo)
    });
    if (!res.ok) throw new Error('Error al crear vehÃ­culo');
    return res.json();
  },

  async actualizarVehiculo(id: string, updates: Partial<Vehiculo>): Promise<Vehiculo> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/vehiculos/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updates)
    });
    if (!res.ok) throw new Error('Error al actualizar vehÃ­culo');
    return res.json();
  },

  async eliminarVehiculo(id: string): Promise<void> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/vehiculos/${id}`, {
      method: 'DELETE',
      headers
    });
    if (!res.ok) throw new Error('Error al eliminar vehÃ­culo');
  },

  async syncVehiculoKilometraje(placas: string | undefined | null, nuevoKilometraje: number): Promise<void> {
    // This is handled automatically by the backend now, but we'll leave it as a no-op just in case it's called manually somewhere
  },

  async getRegistrosGasolina(filtros?: { vehiculoId?: string; empleadoId?: string; placas?: string }): Promise<RegistroGasolina[]> {
    const headers = await getApiHeaders();
    
    let url = `${getApiUrl()}/api/vehiculos/gasolina?`;
    if (filtros?.vehiculoId) url += `vehiculoId=${filtros.vehiculoId}&`;
    if (filtros?.empleadoId) url += `empleadoId=${filtros.empleadoId}&`;
    if (filtros?.placas) url += `placas=${filtros.placas}&`;
    
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error('Error al obtener registros de gasolina');
    return res.json();
  },

  async crearRegistroGasolina(registro: Omit<RegistroGasolina, 'id' | 'created_at'>): Promise<RegistroGasolina> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/vehiculos/gasolina`, {
      method: 'POST',
      headers,
      body: JSON.stringify(registro)
    });
    if (!res.ok) throw new Error('Error al crear registro de gasolina');
    return res.json();
  },
};

export interface AuditoriaTarjeta {
  id: string;
  tarjeta: string;
  metodo_pago: string;
  titular?: string | null;
  periodo_inicio?: string | null;
  periodo_fin?: string | null;
  total_cargos: number;
  total_conciliado: number;
  total_faltante: number;
  resultado_json: any;
  creado_por?: string | null;
  creado_por_nombre?: string | null;
  creado_en?: string;
}

export const AuditoriaService = {
  async guardarAuditoria(auditoria: Omit<AuditoriaTarjeta, 'id' | 'creado_en'>): Promise<AuditoriaTarjeta> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/auditoria`, {
      method: 'POST',
      headers,
      body: JSON.stringify(auditoria)
    });

    if (!res.ok) {
      const errorText = await res.text();
      logger.error('Error al guardar auditorÃ­a de tarjeta:', errorText);
      throw new Error(errorText);
    }
    const json = await res.json();
    return json.data as AuditoriaTarjeta;
  },

  async obtenerAuditorias(tarjeta?: string): Promise<AuditoriaTarjeta[]> {
    const headers = await getApiHeaders();
    const url = tarjeta && tarjeta !== 'TODAS' 
      ? `${getApiUrl()}/api/auditoria?tarjeta=${encodeURIComponent(tarjeta)}`
      : `${getApiUrl()}/api/auditoria`;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      const errorText = await res.text();
      logger.error('Error al obtener auditorÃ­as de tarjeta:', errorText);
      throw new Error(errorText);
    }
    const json = await res.json();
    return (json.auditorias || []) as AuditoriaTarjeta[];
  },

  async eliminarAuditoria(id: string): Promise<void> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/auditoria/${id}`, {
      method: 'DELETE',
      headers
    });

    if (!res.ok) {
      const errorText = await res.text();
      logger.error('Error al eliminar auditorÃ­a de tarjeta:', errorText);
      throw new Error(errorText);
    }
  }
};

export interface Documento {
  id: string;
  titulo: string;
  descripcion?: string | null;
  contenido_html: string;
  archivo_pdf_url?: string | null;
  tipo_documento?: 'TEXTO' | 'PDF';
  posicion_firma?: string | null;
  creador_id?: string | null;
  creador_nombre: string;
  requiere_todos: boolean;
  estado: 'BORRADOR' | 'PUBLICADO' | 'ARCHIVADO';
  created_at?: string;
  updated_at?: string;
  total_asignados?: number;
  total_firmados?: number;
}

export interface DocumentoFirmado {
  id: string;
  documento_id: string;
  empleado_id: string;
  empleado_nombre: string;
  empleado_email?: string | null;
  estado: 'PENDIENTE' | 'FIRMADO' | 'RECHAZADO';
  firma_base64?: string | null;
  firma_url?: string | null;
  pdf_firmado_url?: string | null;
  ip_registro?: string | null;
  ubicacion_gps?: string | null;
  dispositivo_info?: string | null;
  hash_sha256?: string | null;
  motivo_rechazo?: string | null;
  firmado_at?: string | null;
  created_at?: string;
  documentos?: Documento;
}

export const DocumentoService = {
  async obtenerDocumentosAdmin(): Promise<Documento[]> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/documentos/admin`, { headers });
    if (!res.ok) throw new Error('Error al obtener documentos (Admin)');
    return res.json();
  },

  async crearDocumento(
    doc: Omit<Documento, 'id' | 'created_at' | 'updated_at'>,
    empleadosIds: string[]
  ): Promise<Documento> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/documentos`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ doc, empleadosIds })
    });
    if (!res.ok) throw new Error('Error al crear documento');
    return res.json();
  },

  async obtenerMisDocumentosEmpleado(empleadoId: string): Promise<DocumentoFirmado[]> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/documentos/empleado/${empleadoId}`, { headers });
    if (!res.ok) throw new Error('Error al obtener documentos del empleado');
    return res.json();
  },

  async obtenerFirmasDeDocumento(documentoId: string): Promise<DocumentoFirmado[]> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/documentos/${documentoId}/firmas`, { headers });
    if (!res.ok) throw new Error('Error al obtener firmas');
    return res.json();
  },

  async registrarFirma(
    idAsignacion: string,
    params: {
      firmaBase64: string;
      pdfUrl?: string;
      ipRegistro?: string;
      ubicacionGps?: string;
      dispositivoInfo?: string;
      hashSha256?: string;
    }
  ): Promise<DocumentoFirmado> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/documentos/firmas/${idAsignacion}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(params)
    });
    if (!res.ok) throw new Error('Error al registrar firma');
    return res.json();
  },

  async eliminarDocumento(id: string): Promise<void> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/documentos/${id}`, { method: 'DELETE', headers });
    if (!res.ok) throw new Error('Error al eliminar documento');
  },

  async subirPdfOriginal(fileUri: string, fileName: string): Promise<string> {
    try {
      const response = await fetch(fileUri);
      const blob = await response.blob();
      const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `originales/${Date.now()}_${cleanFileName}`;

      const b64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      const url = await apiClient.uploadBase64(b64, filePath, 'application/pdf', 'documentos-firmados');
      return url;
    } catch (e) {
      logger.error('Fallo la subida de PDF original:', e);
      throw e;
    }
  },

  async subirPdfFirmado(fileUri: string, fileName: string): Promise<string> {
    try {
      let b64: string;
      if (fileUri.startsWith('data:')) {
        b64 = fileUri;
      } else if (fileUri.startsWith('blob:') || Platform.OS === 'web') {
        const response = await fetch(fileUri);
        const blob = await response.blob();
        b64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } else {
        try {
          const { readAsStringAsync, EncodingType } = await import('expo-file-system/legacy');
          const fileData = await readAsStringAsync(fileUri, { encoding: EncodingType.Base64 });
          b64 = `data:application/pdf;base64,${fileData}`;
        } catch {
          const response = await fetch(fileUri);
          const blob = await response.blob();
          b64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }
      }

      const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `firmados/${Date.now()}_${cleanFileName}`;
      const url = await apiClient.uploadBase64(b64, filePath, 'application/pdf', 'documentos-firmados');
      return url;
    } catch (e) {
      logger.error('Fallo la subida de PDF firmado:', e);
      throw e;
    }
  }
};

// =========================================================================
// MÃ“DULO DE HERRAMIENTAS, KITS Y CHECKLISTS DE VEHÃCULOS
// =========================================================================

export interface Herramienta {
  id: string;
  codigo: string;
  nombre: string;
  categoria: string;
  descripcion?: string | null;
  numero_serie?: string | null;
  foto_url?: string | null;
  estado: 'NUEVO' | 'BUENO' | 'REGULAR' | 'INCOMPLETO' | 'DANADO' | 'EN_REPARACION' | 'BAJA' | 'FALTANTE';
  cantidad?: number;
  unidades_estado?: Record<string, number>;
  activo: boolean;
  created_at?: string;
  custodia_actual?: {
    tipo: 'EMPLEADO' | 'VEHICULO' | 'BODEGA';
    descripcion: string;
    entidad?: any;
    fecha_asignacion?: string;
  };
  ultimo_usuario?: {
    nombre: string;
    tipo: 'ASIGNACION_PERSONAL' | 'CHECKLIST_VEHICULO' | 'SIN_REGISTRO';
    fecha?: string;
    detalles?: string;
    condicion_reportada?: string;
  };
}

export interface TrazabilidadHerramienta {
  herramienta: Herramienta;
  custodia_actual: {
    tipo: 'EMPLEADO' | 'VEHICULO' | 'BODEGA';
    nombre?: string;
    email?: string;
    vehiculo?: any;
    descripcion?: string;
    fecha_asignacion?: string;
    condicion?: string;
    notas?: string;
  };
  historial_checklists: Array<{
    id: string;
    tipo: string;
    fecha: string;
    hora?: string;
    usuario: string;
    vehiculo: string;
    presente: boolean;
    estado_reportado: string;
    observaciones?: string;
    ubicacion_gps?: string | null;
  }>;
}

export interface HerramientaEmpleado {
  id: string;
  empleado_id: string;
  herramienta_id: string;
  cantidad: number;
  condicion: 'NUEVO' | 'BUENO' | 'REGULAR' | 'INCOMPLETO' | 'DANADO';
  notas?: string | null;
  fecha_asignacion?: string;
  updated_at?: string;
  herramienta?: Herramienta;
  empleado?: {
    id: string;
    nombre: string;
    email: string;
    rol: string;
  };
}

export interface HerramientaVehiculo {
  id: string;
  vehiculo_id: string;
  herramienta_id: string;
  cantidad: number;
  condicion: 'NUEVO' | 'BUENO' | 'REGULAR' | 'INCOMPLETO' | 'DANADO';
  notas?: string | null;
  fecha_asignacion?: string;
  updated_at?: string;
  herramienta?: Herramienta;
  vehiculo?: {
    id: string;
    marca: string;
    modelo: string;
    placas: string;
    numero_economico?: string | null;
  };
}

export interface ChecklistItem {
  herramienta_id: string;
  nombre: string;
  codigo: string;
  presente: boolean;
  estado: 'NUEVO' | 'BUENO' | 'REGULAR' | 'INCOMPLETO' | 'DANADO';
  observaciones?: string;
}

export interface ChecklistVehiculoHerramientas {
  id: string;
  vehiculo_id: string;
  empleado_id: string;
  fecha: string;
  hora?: string;
  items: ChecklistItem[];
  total_herramientas: number;
  total_presentes: number;
  total_faltantes: number;
  total_danadas: number;
  observaciones_generales?: string | null;
  ubicacion_gps?: string | null;
  foto_evidencia_url?: string | null;
  created_at?: string;
  vehiculo?: {
    id: string;
    marca: string;
    modelo: string;
    placas: string;
    numero_economico?: string | null;
  };
  empleado?: {
    id: string;
    nombre: string;
    email?: string;
  };
}

export const HerramientasService = {
  // CatÃ¡logo Maestro
  async getHerramientas(soloActivos = true, categoria?: string): Promise<Herramienta[]> {
    const headers = await getApiHeaders();
    let url = `${getApiUrl()}/api/herramientas?soloActivos=${soloActivos}`;
    if (categoria) url += `&categoria=${encodeURIComponent(categoria)}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error('Error al obtener catÃ¡logo de herramientas');
    return res.json();
  },

  async getSiguienteCodigo(): Promise<string> {
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/herramientas/siguiente-codigo`, { headers });
      if (!res.ok) return 'H-1';
      const data = await res.json();
      return data.codigo || 'H-1';
    } catch {
      return 'H-1';
    }
  },

  async crearHerramienta(herramienta: Omit<Herramienta, 'id' | 'created_at'>): Promise<Herramienta> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/herramientas`, {
      method: 'POST',
      headers,
      body: JSON.stringify(herramienta),
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error || 'Error al crear herramienta');
    }
    return res.json();
  },

  async actualizarHerramienta(id: string, updates: Partial<Herramienta>): Promise<Herramienta> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/herramientas/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error || 'Error al actualizar herramienta');
    }
    return res.json();
  },

  async importarExcel(
    fileBase64: string,
    previewOnly = false,
    overwriteExisting = true
  ): Promise<{
    success: boolean;
    previewOnly: boolean;
    totalEncontrados: number;
    totalNuevos?: number;
    totalExistentes?: number;
    totalProcesados?: number;
    insertCount?: number;
    updateCount?: number;
    herramientas: any[];
    errores?: string[];
    mensaje?: string;
  }> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/herramientas/importar-excel`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ fileBase64, previewOnly, overwriteExisting }),
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error || 'Error al importar archivo Excel');
    }
    return res.json();
  },

  async eliminarHerramienta(id: string): Promise<void> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/herramientas/${id}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error || 'Error al eliminar herramienta');
    }
  },

  // Kits de Empleados
  async getKitsEmpleados(empleadoId?: string): Promise<HerramientaEmpleado[]> {
    const headers = await getApiHeaders();
    let url = `${getApiUrl()}/api/herramientas/empleados`;
    if (empleadoId) url += `?empleado_id=${empleadoId}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error || errJson?.message || 'Error al obtener kits de empleados');
    }
    return res.json();
  },

  async asignarHerramientaEmpleado(params: {
    empleado_id: string;
    herramienta_id: string;
    cantidad?: number;
    condicion?: 'NUEVO' | 'BUENO' | 'REGULAR' | 'INCOMPLETO' | 'DANADO';
    notas?: string;
  }): Promise<HerramientaEmpleado> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/herramientas/empleados/asignar`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error || errJson?.message || 'Error al asignar herramienta al empleado');
    }
    return res.json();
  },

  async desasignarHerramientaEmpleado(id: string): Promise<void> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/herramientas/empleados/${id}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error || errJson?.message || 'Error al desasignar herramienta del empleado');
    }
  },

  // Kits de VehÃ­culos
  async getKitsVehiculos(vehiculoId?: string): Promise<HerramientaVehiculo[]> {
    const headers = await getApiHeaders();
    let url = `${getApiUrl()}/api/herramientas/vehiculos`;
    if (vehiculoId) url += `?vehiculo_id=${vehiculoId}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error || errJson?.message || 'Error al obtener kits de vehÃ­culos');
    }
    return res.json();
  },

  async asignarHerramientaVehiculo(params: {
    vehiculo_id: string;
    herramienta_id: string;
    cantidad?: number;
    condicion?: 'NUEVO' | 'BUENO' | 'REGULAR' | 'INCOMPLETO' | 'DANADO';
    notas?: string;
  }): Promise<HerramientaVehiculo> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/herramientas/vehiculos/asignar`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error || errJson?.message || 'Error al asignar herramienta al vehÃ­culo');
    }
    return res.json();
  },

  async desasignarHerramientaVehiculo(id: string): Promise<void> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/herramientas/vehiculos/${id}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error || errJson?.message || 'Error al desasignar herramienta del vehÃ­culo');
    }
  },

  // Checklists
  async getChecklists(params?: {
    vehiculo_id?: string;
    empleado_id?: string;
    fecha?: string;
    limit?: number;
  }): Promise<ChecklistVehiculoHerramientas[]> {
    const headers = await getApiHeaders();
    const query = new URLSearchParams();
    if (params?.vehiculo_id) query.append('vehiculo_id', params.vehiculo_id);
    if (params?.empleado_id) query.append('empleado_id', params.empleado_id);
    if (params?.fecha) query.append('fecha', params.fecha);
    if (params?.limit) query.append('limit', params.limit.toString());

    const url = `${getApiUrl()}/api/herramientas/checklists?${query.toString()}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error || errJson?.message || 'Error al obtener checklists de herramientas');
    }
    return res.json();
  },

  async crearChecklist(checklist: {
    vehiculo_id: string;
    empleado_id?: string;
    items: ChecklistItem[];
    observaciones_generales?: string;
    ubicacion_gps?: string | null;
    foto_evidencia_url?: string | null;
  }): Promise<ChecklistVehiculoHerramientas> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/herramientas/checklists`, {
      method: 'POST',
      headers,
      body: JSON.stringify(checklist),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || 'Error al registrar checklist de herramientas');
    }
    return res.json();
  },

  async getUltimoChecklistVehiculo(vehiculoId: string): Promise<ChecklistVehiculoHerramientas | null> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/herramientas/checklists/ultimo/${vehiculoId}`, { headers });
    if (!res.ok) return null;
    return res.json();
  },

  async getTrazabilidadHerramienta(id: string): Promise<TrazabilidadHerramienta> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/herramientas/${id}/trazabilidad`, { headers });
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error || 'Error al obtener la trazabilidad de la herramienta');
    }
    return res.json();
  },
};

export interface Notificacion {
  id: string;
  usuario_id: string;
  titulo: string;
  mensaje: string;
  tipo: string;
  referencia_id?: string;
  leido: boolean;
  created_at: string;
}

export const NotificacionesService = {
  async getMisNotificaciones(usuario_id: string): Promise<Notificacion[]> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/notificaciones/${usuario_id}`, { headers });
    if (!res.ok) throw new Error('Error getting notificaciones');
    return res.json();
  },

  async marcarComoLeida(id: string): Promise<void> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/notificaciones/${id}/leida`, { method: 'PUT', headers });
    if (!res.ok) throw new Error('Error marking as read');
  }
};


class FrontendQueryBuilder {
  table: string;
  clientType: 'inttec' | 'daravisa' | 'active';
  query: any;

  constructor(table: string, clientType: 'inttec' | 'daravisa' | 'active') {
    this.table = table;
    this.clientType = clientType;
    this.query = { table, action: 'select', cols: '*', conditions: [] };
  }

  select(cols = '*') { this.query.action = 'select'; this.query.cols = cols; return this; }
  insert(payload: any) { this.query.action = 'insert'; this.query.payload = payload; return this; }
  update(payload: any) { this.query.action = 'update'; this.query.payload = payload; return this; }
  delete() { this.query.action = 'delete'; return this; }

  eq(col: string, val: any) { this.query.conditions.push({ col, op: 'eq', val }); return this; }
  neq(col: string, val: any) { this.query.conditions.push({ col, op: 'neq', val }); return this; }
  in(col: string, val: any[]) { this.query.conditions.push({ col, op: 'in', val }); return this; }
  ilike(col: string, val: any) { this.query.conditions.push({ col, op: 'ilike', val }); return this; }
  or(val: string) { this.query.conditions.push({ col: '', op: 'or', val }); return this; }

  order(col: string, opts: { ascending?: boolean } = {}) { 
    this.query.orderCol = col; 
    this.query.orderAsc = opts.ascending ?? true; 
    return this; 
  }
  limit(n: number) { this.query.limitCount = n; return this; }
  single() { this.query.isSingle = true; this.query.limitCount = 1; return this; }
  maybeSingle() { this.query.isSingle = true; this.query.limitCount = 1; return this; }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  async execute(): Promise<any> {
    try {
      const headers = await getApiHeaders();
      let company = CompanyService.getActiveCompany();
      if (this.clientType !== 'active') {
        company = this.clientType;
      }
      const reqHeaders = { ...headers, 'x-query-client': company };
      const res = await fetch(`${getApiUrl()}/api/query`, {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify(this.query)
      });
      const json = await res.json();
      if (!res.ok) {
        return { data: null, error: json.error || new Error('Query error') };
      } else {
        return { data: json.data, error: null };
      }
    } catch(e) {
      return { data: null, error: e };
    }
  }
}

const createShimClient = (clientType: 'inttec' | 'daravisa' | 'active') => {
  return {
    from: (table: string) => new FrontendQueryBuilder(table, clientType),
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, file: any, opts: any) => {
          try {
            let b64 = '';
            if (typeof file === 'string') {
              b64 = file;
            } else if (file instanceof Blob) {
              b64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
              });
            } else {
              const blob = new Blob([file], { type: opts?.contentType || 'application/octet-stream' });
              b64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
            }
            const headers = await getApiHeaders();
            const res = await fetch(`${getApiUrl()}/api/upload`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                fileBase64: b64,
                fileName: path.split('/').pop(),
                filePath: path,
                contentType: opts?.contentType || 'application/octet-stream',
                folder: bucket
              })
            });
            const json = await res.json();
            if(!res.ok) return { data: null, error: json.error || new Error('Error al subir archivo') };
            return { data: { path }, error: null };
          } catch(e) {
            return { data: null, error: e };
          }
        },
        download: async (path: string) => {
          const bucketName = 'portal-inttec-storage'; 
          const region = 'us-east-2';
          const company = CompanyService.getActiveCompany();
          const fullPath = path.startsWith('http')
            ? path
            : path.startsWith(`${company}/`)
              ? `${bucket}/${path}`
              : `${company}/${bucket}/${path}`;
          const url = path.startsWith('http') ? path : `https://${bucketName}.s3.${region}.amazonaws.com/${fullPath}`;
          try {
            const res = await fetch(url);
            if (!res.ok) return { data: null, error: new Error('Not found') };
            const blob = await res.blob();
            return { data: blob, error: null };
          } catch(e) {
            return { data: null, error: e };
          }
        },
        getPublicUrl: (path: string) => {
          const bucketName = 'portal-inttec-storage'; 
          const region = 'us-east-2';
          const company = CompanyService.getActiveCompany();
          if (path.startsWith('http')) return { data: { publicUrl: path } };
          const fullPath = path.startsWith(`${company}/`)
            ? `${bucket}/${path}`
            : `${company}/${bucket}/${path}`;
          return { data: { publicUrl: `https://${bucketName}.s3.${region}.amazonaws.com/${fullPath}` } };
        }
      })
    },
    auth: { updateUser: async (updates: any) => { return { data: null, error: null }; } }, 
    functions: { 
      invoke: async (functionName: string, options?: any) => { 
        const headers = await getApiHeaders(); 
        let endpoint = `/api/functions/${functionName}`;
        if (functionName === 'facturar-venta') endpoint = '/api/sat/timbrar-factura';
        if (functionName === 'cancelar-factura') endpoint = '/api/sat/cancelar-factura';
        if (functionName === 'sync-facturas-recibidas') endpoint = '/api/sat/sync-facturas-recibidas';
        if (functionName === 'send-push') endpoint = '/api/notificaciones/send-push';
        
        const res = await fetch(`${getApiUrl()}${endpoint}`, { 
          method: 'POST', 
          headers: { ...headers, 'Content-Type': 'application/json' }, 
          body: JSON.stringify(options?.body || {}) 
        }); 
        const json = await res.json().catch(() => ({})); 
        if (!res.ok) return { data: null, error: json.error || new Error('Invoke failed') }; 
        return { data: json.data || json, error: null }; 
      } 
    }
  };
};

export const supabase = createShimClient('active');
export const inttecClient = createShimClient('inttec');
export const daravisaClient = createShimClient('daravisa');
