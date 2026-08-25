import { logger } from '@/utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import Constants from 'expo-constants';

const sanitizeUrl = (url: string) => {
  return url ? url.replace(/\/rest\/v1\/?$/, '') : url;
};

const resolveLocalhost = (url: string) => {
  // Solo en desarrollo y si la URL tiene localhost
  if (__DEV__ && url && (url.includes('localhost') || url.includes('127.0.0.1'))) {
    const debuggerHost = Constants.expoConfig?.hostUri || (Constants.manifest as any)?.debuggerHost;
    if (debuggerHost) {
      const ip = debuggerHost.split(':')[0];
      // Reemplaza localhost por la IP real de tu PC en la red local
      return url.replace(/localhost|127\.0\.0\.1/, ip);
    }
  }
  return url;
};

const inttecUrl = sanitizeUrl(process.env.EXPO_PUBLIC_SUPABASE_URL_INTTEC || process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co');
const inttecAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY_INTTEC || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

const daravisaUrl = sanitizeUrl(process.env.EXPO_PUBLIC_SUPABASE_URL_DARAVISA || process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co');
const daravisaAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY_DARAVISA || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

const inttecTestUrl = resolveLocalhost(sanitizeUrl(process.env.EXPO_PUBLIC_SUPABASE_URL_TEST || 'http://localhost:54321'));
const inttecTestAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY_TEST || 'placeholder-anon-key';

const daravisaTestUrl = resolveLocalhost(sanitizeUrl(process.env.EXPO_PUBLIC_SUPABASE_URL_DARAVISA_TEST || 'http://localhost:54321'));
const daravisaTestAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY_DARAVISA_TEST || 'placeholder-anon-key';

const isLocalUrl = (url: string) => url ? (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('192.168.') || url.includes('10.') || url.startsWith('http://')) : false;

if (!inttecUrl || !inttecAnonKey) {
  logger.error('WARNING: Supabase INTTEC credentials missing in .env file.');
} else {
  console.log(isLocalUrl(inttecUrl) ? `🐳 [DATABASE INTTEC] Local Docker (${inttecUrl})` : `☁️ [DATABASE INTTEC] Supabase Cloud (${inttecUrl})`);
}

if (!daravisaUrl || !daravisaAnonKey) {
  logger.error('WARNING: Supabase DARAVISA credentials missing in .env file.');
} else {
  console.log(isLocalUrl(daravisaUrl) ? `🐳 [DATABASE DARAVISA] Local Docker (${daravisaUrl})` : `☁️ [DATABASE DARAVISA] Supabase Cloud (${daravisaUrl})`);
}

const isBrowser = Platform.OS !== 'web' || typeof window !== 'undefined';

const ssrSafeStorage = {
  getItem: async (key: string) => {
    if (isBrowser) {
      return AsyncStorage.getItem(key);
    }
    return null;
  },
  setItem: async (key: string, value: string) => {
    if (isBrowser) {
      await AsyncStorage.setItem(key, value);
    }
  },
  removeItem: async (key: string) => {
    if (isBrowser) {
      await AsyncStorage.removeItem(key);
    }
  },
};

export const inttecClient = createClient(inttecUrl, inttecAnonKey, {
  auth: {
    storage: ssrSafeStorage,
    storageKey: 'supabase.auth.token.inttec',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const daravisaClient = createClient(daravisaUrl, daravisaAnonKey, {
  auth: {
    storage: ssrSafeStorage,
    storageKey: 'supabase.auth.token.daravisa',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const inttecTestClient = createClient(inttecTestUrl, inttecTestAnonKey, {
  auth: {
    storage: ssrSafeStorage,
    storageKey: 'supabase.auth.token.inttec.test',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const daravisaTestClient = createClient(daravisaTestUrl, daravisaTestAnonKey, {
  auth: {
    storage: ssrSafeStorage,
    storageKey: 'supabase.auth.token.daravisa.test',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

let activeCompany: 'inttec' | 'daravisa' = 'inttec';
let activeEnv: 'cloud' | 'test' = 'cloud';
let activeClient = inttecClient;

const updateActiveClient = () => {
  if (activeEnv === 'test') {
    activeClient = activeCompany === 'daravisa' ? daravisaTestClient : inttecTestClient;
  } else {
    activeClient = activeCompany === 'daravisa' ? daravisaClient : inttecClient;
  }
};

export const supabase = new Proxy({}, {
  get(target, prop) {
    const value = Reflect.get(activeClient, prop);
    if (typeof value === 'function') {
      return value.bind(activeClient);
    }
    return value;
  }
}) as unknown as typeof inttecClient;

export const CompanyService = {
  getActiveCompany(): 'inttec' | 'daravisa' {
    return activeCompany;
  },
  async setActiveCompany(company: 'inttec' | 'daravisa'): Promise<void> {
    activeCompany = company;
    updateActiveClient();
    if (isBrowser) {
      await AsyncStorage.setItem('active_company', company);
    }
  },
  async loadSavedCompany(): Promise<'inttec' | 'daravisa'> {
    if (isBrowser) {
      const saved = await AsyncStorage.getItem('active_company');
      if (saved === 'daravisa' || saved === 'inttec') {
        activeCompany = saved;
        updateActiveClient();
      }
    }
    return activeCompany;
  }
};

export const EnvService = {
  getActiveEnv(): 'cloud' | 'test' {
    return activeEnv;
  },
  async setActiveEnv(env: 'cloud' | 'test'): Promise<void> {
    activeEnv = env;
    updateActiveClient();
    if (isBrowser) {
      await AsyncStorage.setItem('active_env', env);
    }
  },
  async loadSavedEnv(): Promise<'cloud' | 'test'> {
    if (isBrowser) {
      const saved = await AsyncStorage.getItem('active_env');
      if (saved === 'cloud' || saved === 'test') {
        activeEnv = saved;
        updateActiveClient();
      }
    }
    return activeEnv;
  }
};

export const getInttecClient = () => EnvService.getActiveEnv() === 'test' ? inttecTestClient : inttecClient;
export const getDaravisaClient = () => EnvService.getActiveEnv() === 'test' ? daravisaTestClient : daravisaClient;

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: 'ADMIN' | 'EMPLEADO' | 'DEV';
  telefono?: string;
  created_at?: string;
}

export interface Gasto {
  id: string;
  empleado_id: string;
  empleado_nombre?: string | null;
  monto: number;
  categoria?: string | null;
  categoria_id?: string | null; // Deprecado: la categoría se obtiene a través de subcategoria_id
  subcategoria?: string | null;
  subcategoria_id?: string | null;
  metodo_pago: 'efectivo' | 'tarjeta' | 'tarjeta_credito' | 'tarjeta_debito';
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
  facturado?: boolean | null;
  factura_url?: string | null;
  motivo_sin_factura?: string | null;
  tipo_servicio_proyecto?: string | null;
  detalle_servicio_proyecto?: string | null;
  venta_id?: string | null;
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
 * Servicio de Autenticación
 */
export const AuthService = {
  async login(email: string, password: string): Promise<Usuario> {
    const { data, error } = await supabase
      .rpc('login_usuario', {
        email_param: email.trim().toLowerCase(),
        password_param: password,
      })
      .maybeSingle();

    if (error) {
      throw new Error(`Error de conexión: ${error.message}`);
    }

    if (!data) {
      throw new Error('Credenciales incorrectas');
    }

    // Guardar usuario en almacenamiento local
    if (isBrowser) {
      const company = CompanyService.getActiveCompany();
      await AsyncStorage.setItem(`logged_user_${company}`, JSON.stringify(data));
    }
    return data as Usuario;
  },

  async logout(): Promise<void> {
    if (isBrowser) {
      await AsyncStorage.removeItem('logged_user_inttec');
      await AsyncStorage.removeItem('logged_user_daravisa');
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
  }
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
  creado_en?: string;
}

/**
 * Servicio de Asistencias (Auto-Checador)
 */
export const AsistenciaService = {
  /**
   * Obtiene la fecha de la jornada laboral en formato YYYY-MM-DD en hora local.
   * La jornada laboral se reinicia a las 6:00 AM de cada día:
   * - A partir de las 06:00:00 AM: Jornada del día actual (siempre pide entrada).
   * - Antes de las 06:00:00 AM (00:00 - 05:59): Jornada del día anterior (permite checar salida de turnos que terminan de madrugada).
   */
  getFechaJornada(date: Date = new Date()): string {
    const d = new Date(date);
    if (d.getHours() < 6) {
      d.setDate(d.getDate() - 1);
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  /**
   * Obtiene la hora local formateada en HH:MM:SS
   */
  getHoraLocal(date: Date = new Date()): string {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  },

  /**
   * Obtiene el registro de asistencia de la jornada actual (iniciada a las 6:00 AM) para un empleado.
   */
  async getRegistroHoy(empleadoId: string): Promise<Asistencia | null> {
    const fechaJornada = this.getFechaJornada();
    const { data, error } = await supabase
      .from('asistencias')
      .select('*')
      .eq('empleado_id', empleadoId)
      .eq('fecha', fechaJornada)
      .order('creado_en', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.error('Error al obtener registro de la jornada actual:', error);
      throw error;
    }
    return data as Asistencia | null;
  },

  /**
   * Registra la entrada del empleado.
   */
  async registrarEntrada(
    empleadoId: string,
    fotoUrl: string,
    latitud: number,
    longitud: number,
    direccion: string
  ): Promise<Asistencia> {
    const ahora = new Date();
    const horaStr = this.getHoraLocal(ahora);
    const fechaStr = this.getFechaJornada(ahora);

    const { data, error } = await supabase
      .from('asistencias')
      .insert([{
        empleado_id: empleadoId,
        fecha: fechaStr,
        hora_entrada: horaStr,
        foto_entrada_url: fotoUrl,
        latitud_entrada: latitud,
        longitud_entrada: longitud,
        direccion_entrada: direccion,
      }])
      .select()
      .single();

    if (error) throw error;
    return data as Asistencia;
  },

  /**
   * Registra la salida del empleado (actualiza el registro existente de la jornada).
   */
  async registrarSalida(
    asistenciaId: string,
    fotoUrl: string,
    latitud: number,
    longitud: number,
    direccion: string
  ): Promise<Asistencia> {
    const ahora = new Date();
    const horaStr = this.getHoraLocal(ahora);

    const { data, error } = await supabase
      .from('asistencias')
      .update({
        hora_salida: horaStr,
        foto_salida_url: fotoUrl,
        latitud_salida: latitud,
        longitud_salida: longitud,
        direccion_salida: direccion,
      })
      .eq('id', asistenciaId)
      .select()
      .single();

    if (error) throw error;
    return data as Asistencia;
  },

  /**
   * Obtiene el historial de asistencia de un empleado (para vista de admin).
   */
  async getHistorialEmpleado(empleadoId: string): Promise<Asistencia[]> {
    const { data, error } = await supabase
      .from('asistencias')
      .select('*')
      .eq('empleado_id', empleadoId)
      .order('fecha', { ascending: false });

    if (error) throw error;
    return (data || []) as Asistencia[];
  },

  /**
   * Sube una foto de asistencia a Supabase Storage.
   */
  async subirFotoAsistencia(
    empleadoId: string,
    base64Data: string,
    tipo: 'entrada' | 'salida'
  ): Promise<string> {
    logger.error('[Supabase Storage] Iniciando subirFotoAsistencia...');
    const fechaStr = this.getFechaJornada();
    const fileName = `asistencias/${empleadoId}/${fechaStr}_${tipo}_${Date.now()}.jpg`;
    logger.error('[Supabase Storage] Nombre de archivo generado:', fileName);

    let cleanBase64 = base64Data;
    if (base64Data.includes(';base64,')) {
      logger.error('[Supabase Storage] Detectado prefijo de Data URL, limpiando base64...');
      const parts = base64Data.split(';base64,');
      if (parts.length > 1) {
        cleanBase64 = parts[1];
        logger.error('[Supabase Storage] Limpieza completada. Nueva longitud base64:', cleanBase64.length);
      }
    } else {
      logger.error('[Supabase Storage] Base64 recibido parece ser binario puro. Longitud:', base64Data.length);
    }

    try {
      // Convertir base64 a ArrayBuffer
      logger.error('[Supabase Storage] Convirtiendo base64 a ArrayBuffer mediante atob...');
      const binaryStr = atob(cleanBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      logger.error('[Supabase Storage] ArrayBuffer creado, bytes:', bytes.length);

      logger.error('[Supabase Storage] Subiendo archivo al bucket "tickets"...');
      const { error: uploadError } = await supabase.storage
        .from('tickets')
        .upload(fileName, bytes.buffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        logger.error('[Supabase Storage] Error en supabase.storage.upload:', uploadError);
        throw uploadError;
      }
      logger.error('[Supabase Storage] Subida completada con éxito.');

      const { data: urlData } = supabase.storage
        .from('tickets')
        .getPublicUrl(fileName);

      logger.error('[Supabase Storage] URL pública obtenida:', urlData.publicUrl);
      return urlData.publicUrl;
    } catch (err: any) {
      logger.error('[Supabase Storage] Excepción capturada en subirFotoAsistencia:', err.message || err);
      throw err;
    }
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

export type EstadoPagoVenta = 'PAGADO' | 'PAGO PARCIAL' | 'PENDIENTE DE PAGO';

export function calcularEstadoPago(precioTotalFacturado: number, totalPagado: number): EstadoPagoVenta {
  if (totalPagado >= precioTotalFacturado && precioTotalFacturado > 0) {
    return 'PAGADO';
  } else if (totalPagado > 0) {
    return 'PAGO PARCIAL';
  } else {
    return 'PENDIENTE DE PAGO';
  }
}

export async function recalculateVentaTotals(ventaId: string): Promise<void> {
  try {
    // 1. Obtener la venta
    const { data: venta, error: ventaErr } = await supabase
      .from('ventas')
      .select('precio_total_facturado')
      .eq('id', ventaId)
      .single();
    if (ventaErr || !venta) throw ventaErr || new Error('Sale not found');

    // 2. Obtener la suma del costo de las partidas de la venta
    const { data: partidas, error: partidasErr } = await supabase
      .from('ventas_partidas')
      .select('costo_total_proveedor')
      .eq('venta_id', ventaId);
    if (partidasErr) throw partidasErr;

    const costoPartidas = (partidas || []).reduce((sum, p) => sum + (Number(p.costo_total_proveedor) || 0), 0);

    // 3. Obtener la suma de los montos de los gastos aprobados vinculados a la venta
    const { data: gastos, error: gastosErr } = await supabase
      .from('gastos')
      .select('monto')
      .eq('venta_id', ventaId)
      .eq('status', 'APPROVED');
    if (gastosErr) throw gastosErr;

    const costoGastos = (gastos || []).reduce((sum, g) => sum + (Number(g.monto) || 0), 0);

    // 4. Calcular nuevos totales
    const costoTotal = Math.round((costoPartidas + costoGastos) * 100) / 100;
    const precioTotal = Number(venta.precio_total_facturado) || 0;
    const utilidadBruta = Math.round((precioTotal - costoTotal) * 100) / 100;
    const margenPorcentual = precioTotal > 0 ? Math.round((utilidadBruta / precioTotal) * 10000) / 10000 : 0;

    // 5. Actualizar la venta
    const { error: updateErr } = await supabase
      .from('ventas')
      .update({
        costo_total: costoTotal,
        utilidad_bruta: utilidadBruta,
        margen_porcentual: margenPorcentual
      })
      .eq('id', ventaId);
    
    if (updateErr) throw updateErr;
    logger.error(`[Recalculate] Venta ${ventaId} actualizada en base de datos. Costo Partidas: ${costoPartidas}, Costo Gastos: ${costoGastos}, Costo Total: ${costoTotal}`);
  } catch (err) {
    logger.error('[Recalculate] Error recalculating venta totals:', err);
  }
}

export async function syncVentaPaymentStatus(ventaId: string): Promise<void> {
  try {
    const { data: venta, error: vErr } = await supabase
      .from('ventas')
      .select('precio_total_facturado')
      .eq('id', ventaId)
      .single();

    if (vErr || !venta) return;

    const { data: pagos, error: pErr } = await supabase
      .from('ventas_pagos')
      .select('monto')
      .eq('venta_id', ventaId);

    if (pErr) return; // Si la tabla aún no existe, omitimos silenciosamente

    const precioTotal = Number(venta?.precio_total_facturado) || 0;
    const totalPagado = (pagos || []).reduce((sum, p) => sum + (Number(p.monto) || 0), 0);
    const saldoPendiente = Math.max(0, precioTotal - totalPagado);
    const estadoPago = calcularEstadoPago(precioTotal, totalPagado);

    const { error: updErr } = await supabase
      .from('ventas')
      .update({
        total_pagado: totalPagado,
        saldo_pendiente: saldoPendiente,
        estado_pago: estadoPago
      })
      .eq('id', ventaId);

    if (updErr) {
      console.warn('[SyncPaymentStatus] No se pudieron actualizar columnas de pago en ventas:', updErr.message);
    }
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
    let query = supabase.from('vehiculos').select('*');
    if (soloActivos) {
      query = query.eq('activo', true);
    }
    const { data, error } = await query.order('marca', { ascending: true });
    if (error) throw error;
    return (data || []) as Vehiculo[];
  },

  async crearVehiculo(vehiculo: Omit<Vehiculo, 'id' | 'created_at'>): Promise<Vehiculo> {
    const { data, error } = await supabase
      .from('vehiculos')
      .insert([vehiculo])
      .select()
      .single();
    if (error) throw error;
    return data as Vehiculo;
  },

  async actualizarVehiculo(id: string, updates: Partial<Vehiculo>): Promise<Vehiculo> {
    const { data, error } = await supabase
      .from('vehiculos')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Vehiculo;
  },

  async eliminarVehiculo(id: string): Promise<void> {
    const { error } = await supabase.from('vehiculos').delete().eq('id', id);
    if (error) throw error;
  },

  /**
   * Sincroniza el kilometraje actual de un vehículo en AMBAS bases de datos (Inttec y Daravisa)
   */
  async syncVehiculoKilometraje(placas: string | undefined | null, nuevoKilometraje: number): Promise<void> {
    if (!placas || !nuevoKilometraje || isNaN(nuevoKilometraje)) return;
    try {
      await Promise.allSettled([
        inttecClient.from('vehiculos').update({ kilometraje_actual: nuevoKilometraje }).eq('placas', placas),
        daravisaClient.from('vehiculos').update({ kilometraje_actual: nuevoKilometraje }).eq('placas', placas),
      ]);
    } catch (e) {
      console.warn('Error sincronizando kilometraje entre empresas:', e);
    }
  },

  /**
   * Obtiene la bitácora unificada de consumo de gasolina combinando registros de Inttec y Daravisa
   * para trazabilidad 100% coherente y cálculo exacto de rendimiento km/L sin importar en qué portal se registró.
   */
  async getRegistrosGasolina(filtros?: { vehiculoId?: string; empleadoId?: string; placas?: string }): Promise<RegistroGasolina[]> {
    let targetPlacas = filtros?.placas;

    // Si se pasa vehiculoId pero no placas, buscar las placas
    if (filtros?.vehiculoId && !targetPlacas) {
      try {
        const { data: v } = await supabase.from('vehiculos').select('placas').eq('id', filtros.vehiculoId).single();
        if (v?.placas) targetPlacas = v.placas;
      } catch {}
    }

    const fetchFromClient = async (client: typeof supabase, empresaNombre: string) => {
      try {
        let query = client
          .from('registro_gasolina')
          .select(`
            *,
            vehiculo:vehiculo_id (marca, modelo, placas),
            empleado:empleado_id (nombre)
          `);

        if (filtros?.empleadoId) {
          query = query.eq('empleado_id', filtros.empleadoId);
        }

        const { data, error } = await query;
        if (error || !data) return [];
        return data.map((row: any) => ({
          ...row,
          vehiculo_marca: row.vehiculo?.marca,
          vehiculo_modelo: row.vehiculo?.modelo,
          vehiculo_placas: row.vehiculo?.placas,
          empleado_nombre: row.empleado?.nombre,
          empresa_origen: empresaNombre,
        }));
      } catch {
        return [];
      }
    };

    const [inttecLogs, daravisaLogs] = await Promise.all([
      fetchFromClient(inttecClient, 'INTTEC'),
      fetchFromClient(daravisaClient, 'DARAVISA'),
    ]);

    // Combinar sin duplicados
    const logMap = new Map<string, any>();
    [...inttecLogs, ...daravisaLogs].forEach(item => {
      if (item && item.id) {
        logMap.set(item.id, item);
      }
    });

    let allLogs = Array.from(logMap.values());

    // Filtrar por placas si aplica
    if (targetPlacas) {
      const cleanTarget = targetPlacas.toLowerCase().trim();
      allLogs = allLogs.filter(item => (item.vehiculo_placas || '').toLowerCase().trim() === cleanTarget);
    }

    // Ordenar de más antiguo a más reciente para trazar el kilometraje en orden cronológico
    allLogs.sort((a, b) => {
      const timeA = new Date(a.fecha || a.created_at).getTime();
      const timeB = new Date(b.fecha || b.created_at).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return Number(a.kilometraje_actual || 0) - Number(b.kilometraje_actual || 0);
    });

    // Trazar el rendimiento real entre cargas consecutivas sin importar la empresa
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

    // Retornar de más reciente a más antiguo para vista de lista / reporte
    return allLogs.reverse() as RegistroGasolina[];
  },

  async crearRegistroGasolina(registro: Omit<RegistroGasolina, 'id' | 'created_at'>): Promise<RegistroGasolina> {
    const { data, error } = await supabase
      .from('registro_gasolina')
      .insert([registro])
      .select()
      .single();
    if (error) throw error;

    // Sincronizar kilometraje actual en vehículos de ambas empresas
    if (registro.vehiculo_id && registro.kilometraje_actual) {
      try {
        const { data: v } = await supabase.from('vehiculos').select('placas').eq('id', registro.vehiculo_id).single();
        if (v?.placas) {
          await VehiculoService.syncVehiculoKilometraje(v.placas, registro.kilometraje_actual);
        }
      } catch {}
    }

    return data as RegistroGasolina;
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
    const { data, error } = await supabase
      .from('auditorias_tarjeta')
      .insert([auditoria])
      .select()
      .single();

    if (error) {
      logger.error('Error al guardar auditoría de tarjeta:', error);
      throw error;
    }
    return data as AuditoriaTarjeta;
  },

  async obtenerAuditorias(tarjeta?: string): Promise<AuditoriaTarjeta[]> {
    let query = supabase
      .from('auditorias_tarjeta')
      .select('*')
      .order('creado_en', { ascending: false });

    if (tarjeta && tarjeta !== 'TODAS') {
      query = query.eq('tarjeta', tarjeta);
    }

    const { data, error } = await query;
    if (error) {
      logger.error('Error al obtener auditorías de tarjeta:', error);
      throw error;
    }
    return (data || []) as AuditoriaTarjeta[];
  },

  async eliminarAuditoria(id: string): Promise<void> {
    const { error } = await supabase
      .from('auditorias_tarjeta')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('Error al eliminar auditoría de tarjeta:', error);
      throw error;
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
    const { data: docs, error } = await supabase
      .from('documentos')
      .select('*, documentos_firmados(id, estado)')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error al obtener documentos (Admin):', error);
      throw error;
    }

    return (docs || []).map((doc: any) => {
      const firmadosList = doc.documentos_firmados || [];
      return {
        ...doc,
        total_asignados: firmadosList.length,
        total_firmados: firmadosList.filter((f: any) => f.estado === 'FIRMADO').length,
      };
    }) as Documento[];
  },

  async crearDocumento(
    doc: Omit<Documento, 'id' | 'created_at' | 'updated_at'>,
    empleadosIds: string[]
  ): Promise<Documento> {
    let { data: newDoc, error: docError } = await supabase
      .from('documentos')
      .insert([doc])
      .select()
      .single();

    if (docError) {
      if (
        docError.message?.includes('posicion_firma') ||
        docError.code === 'PGRST204' ||
        docError.details?.includes('posicion_firma')
      ) {
        const { posicion_firma, ...docSinPosicion } = doc;
        const { data: retryDoc, error: retryErr } = await supabase
          .from('documentos')
          .insert([docSinPosicion])
          .select()
          .single();

        if (retryErr) {
          logger.error('Error al crear documento (reintento sin posicion_firma):', retryErr);
          throw retryErr;
        }
        newDoc = retryDoc;
      } else {
        logger.error('Error al crear documento:', docError);
        throw docError;
      }
    }

    let targetEmpleados: Usuario[] = [];
    if (doc.requiere_todos || empleadosIds.length === 0) {
      const { data: users } = await supabase.from('usuarios').select('*');
      targetEmpleados = users || [];
    } else {
      const { data: users } = await supabase.from('usuarios').select('*').in('id', empleadosIds);
      targetEmpleados = users || [];
    }

    if (targetEmpleados.length > 0) {
      const asignaciones = targetEmpleados.map((emp) => ({
        documento_id: newDoc.id,
        empleado_id: emp.id,
        empleado_nombre: emp.nombre,
        empleado_email: emp.email,
        estado: 'PENDIENTE',
      }));

      const { error: asigError } = await supabase
        .from('documentos_firmados')
        .insert(asignaciones);

      if (asigError) {
        logger.error('Error al asignar empleados al documento:', asigError);
      }
    }

    return newDoc as Documento;
  },

  async obtenerMisDocumentosEmpleado(empleadoId: string): Promise<DocumentoFirmado[]> {
    const { data, error } = await supabase
      .from('documentos_firmados')
      .select('*, documentos(*)')
      .eq('empleado_id', empleadoId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error al obtener documentos del empleado:', error);
      throw error;
    }
    return (data || []) as DocumentoFirmado[];
  },

  async obtenerFirmasDeDocumento(documentoId: string): Promise<DocumentoFirmado[]> {
    const { data, error } = await supabase
      .from('documentos_firmados')
      .select('*')
      .eq('documento_id', documentoId)
      .order('empleado_nombre', { ascending: true });

    if (error) {
      logger.error('Error al obtener detalle de firmas:', error);
      throw error;
    }
    return (data || []) as DocumentoFirmado[];
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
    const { data, error } = await supabase
      .from('documentos_firmados')
      .update({
        estado: 'FIRMADO',
        firma_base64: params.firmaBase64,
        pdf_firmado_url: params.pdfUrl,
        ip_registro: params.ipRegistro,
        ubicacion_gps: params.ubicacionGps,
        dispositivo_info: params.dispositivoInfo,
        hash_sha256: params.hashSha256,
        firmado_at: new Date().toISOString(),
      })
      .eq('id', idAsignacion)
      .select()
      .maybeSingle();

    if (error) {
      logger.error('Error al registrar firma:', error);
      throw error;
    }
    return (data || { id: idAsignacion, estado: 'FIRMADO' }) as DocumentoFirmado;
  },

  async eliminarDocumento(id: string): Promise<void> {
    const { error } = await supabase.from('documentos').delete().eq('id', id);
    if (error) {
      logger.error('Error al eliminar documento:', error);
      throw error;
    }
  },

  async subirPdfOriginal(fileUri: string, fileName: string): Promise<string> {
    try {
      const response = await fetch(fileUri);
      const blob = await response.blob();
      const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `originales/${Date.now()}_${cleanFileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documentos-firmados')
        .upload(filePath, blob, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (uploadError) {
        logger.error('Error al subir PDF original:', uploadError);
        throw uploadError;
      }

      const { data } = supabase.storage.from('documentos-firmados').getPublicUrl(filePath);
      return data.publicUrl;
    } catch (e) {
      logger.error('Fallo la subida de PDF original:', e);
      throw e;
    }
  },

  async subirPdfFirmado(fileUri: string, fileName: string): Promise<string> {
    try {
      const response = await fetch(fileUri);
      const blob = await response.blob();
      const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `firmados/${Date.now()}_${cleanFileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documentos-firmados')
        .upload(filePath, blob, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (uploadError) {
        logger.error('Error al subir PDF firmado:', uploadError);
        throw uploadError;
      }

      const { data } = supabase.storage.from('documentos-firmados').getPublicUrl(filePath);
      return data.publicUrl;
    } catch (e) {
      logger.error('Fallo la subida de PDF firmado:', e);
      throw e;
    }
  }
};


