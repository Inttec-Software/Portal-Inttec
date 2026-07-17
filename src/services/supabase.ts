import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const sanitizeUrl = (url: string) => {
  return url ? url.replace(/\/rest\/v1\/?$/, '') : url;
};

const inttecUrl = sanitizeUrl(process.env.EXPO_PUBLIC_SUPABASE_URL_INTTEC || process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co');
const inttecAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY_INTTEC || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

const daravisaUrl = sanitizeUrl(process.env.EXPO_PUBLIC_SUPABASE_URL_DARAVISA || process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co');
const daravisaAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY_DARAVISA || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

if (!inttecUrl || !inttecAnonKey) {
  console.warn(
    'WARNING: Supabase URL or Anon Key is missing in environment variables (.env file).\n' +
    'The app is running with placeholder credentials and database operations will fail.'
  );
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
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const daravisaClient = createClient(daravisaUrl, daravisaAnonKey, {
  auth: {
    storage: ssrSafeStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

let activeCompany: 'inttec' | 'daravisa' = 'inttec';
let activeClient = inttecClient;

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
    activeClient = company === 'daravisa' ? daravisaClient : inttecClient;
    if (isBrowser) {
      await AsyncStorage.setItem('active_company', company);
    }
  },
  async loadSavedCompany(): Promise<'inttec' | 'daravisa'> {
    if (isBrowser) {
      const saved = await AsyncStorage.getItem('active_company');
      if (saved === 'daravisa' || saved === 'inttec') {
        activeCompany = saved;
        activeClient = saved === 'daravisa' ? daravisaClient : inttecClient;
      }
    }
    return activeCompany;
  }
};


export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: 'ADMIN' | 'EMPLEADO';
  telefono?: string;
  created_at?: string;
}

export interface Gasto {
  id: string;
  empleado_id: string;
  empleado_nombre?: string | null;
  monto: number;
  categoria?: string | null;
  subcategoria?: string | null;
  metodo_pago: 'efectivo' | 'tarjeta' | 'tarjeta_credito' | 'tarjeta_debito';
  justificacion?: string | null;
  foto_url?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ACTION_REQUIRED';
  rejection_feedback?: string | null;
  created_at?: string;
  approved_at?: string | null;
  fecha_comprobante?: string | null;
  proveedor?: string | null;
  cliente?: string | null;
  sucursal?: string | null;
  tipo_tarjeta?: string | null;
  ubicacion_registro?: string | null;
  estado?: string | null;
  facturado?: boolean | null;
  factura_url?: string | null;
  motivo_sin_factura?: string | null;
  tipo_servicio_proyecto?: string | null;
  detalle_servicio_proyecto?: string | null;
  venta_id?: string | null;
}

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
      const company = CompanyService.getActiveCompany();
      await AsyncStorage.removeItem(`logged_user_${company}`);
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
   * Obtiene el registro de asistencia de hoy para un empleado.
   */
  async getRegistroHoy(empleadoId: string): Promise<Asistencia | null> {
    const hoy = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const { data, error } = await supabase
      .from('asistencias')
      .select('*')
      .eq('empleado_id', empleadoId)
      .eq('fecha', hoy)
      .maybeSingle();

    if (error) {
      console.error('Error al obtener registro de hoy:', error);
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
    const horaStr = ahora.toTimeString().split(' ')[0]; // HH:MM:SS

    const { data, error } = await supabase
      .from('asistencias')
      .insert([{
        empleado_id: empleadoId,
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
   * Registra la salida del empleado (actualiza el registro existente de hoy).
   */
  async registrarSalida(
    asistenciaId: string,
    fotoUrl: string,
    latitud: number,
    longitud: number,
    direccion: string
  ): Promise<Asistencia> {
    const ahora = new Date();
    const horaStr = ahora.toTimeString().split(' ')[0];

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
    console.log('[Supabase Storage] Iniciando subirFotoAsistencia...');
    const fileName = `asistencias/${empleadoId}/${new Date().toISOString().split('T')[0]}_${tipo}_${Date.now()}.jpg`;
    console.log('[Supabase Storage] Nombre de archivo generado:', fileName);

    let cleanBase64 = base64Data;
    if (base64Data.includes(';base64,')) {
      console.log('[Supabase Storage] Detectado prefijo de Data URL, limpiando base64...');
      const parts = base64Data.split(';base64,');
      if (parts.length > 1) {
        cleanBase64 = parts[1];
        console.log('[Supabase Storage] Limpieza completada. Nueva longitud base64:', cleanBase64.length);
      }
    } else {
      console.log('[Supabase Storage] Base64 recibido parece ser binario puro. Longitud:', base64Data.length);
    }

    try {
      // Convertir base64 a ArrayBuffer
      console.log('[Supabase Storage] Convirtiendo base64 a ArrayBuffer mediante atob...');
      const binaryStr = atob(cleanBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      console.log('[Supabase Storage] ArrayBuffer creado, bytes:', bytes.length);

      console.log('[Supabase Storage] Subiendo archivo al bucket "tickets"...');
      const { error: uploadError } = await supabase.storage
        .from('tickets')
        .upload(fileName, bytes.buffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        console.error('[Supabase Storage] Error en supabase.storage.upload:', uploadError);
        throw uploadError;
      }
      console.log('[Supabase Storage] Subida completada con éxito.');

      const { data: urlData } = supabase.storage
        .from('tickets')
        .getPublicUrl(fileName);

      console.log('[Supabase Storage] URL pública obtenida:', urlData.publicUrl);
      return urlData.publicUrl;
    } catch (err: any) {
      console.error('[Supabase Storage] Excepción capturada en subirFotoAsistencia:', err.message || err);
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
  factura_url?: string | null;
  notas?: string | null;
  descripcion?: string | null;
  agregar_iva?: boolean;
  created_at?: string;
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
    console.log(`[Recalculate] Venta ${ventaId} actualizada en base de datos. Costo Partidas: ${costoPartidas}, Costo Gastos: ${costoGastos}, Costo Total: ${costoTotal}`);
  } catch (err) {
    console.error('[Recalculate] Error recalculating venta totals:', err);
  }
}

