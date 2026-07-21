import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { supabase, CompanyService } from './supabase';

const getOfflineQueueKey = () => `offline_gastos_queue_${CompanyService.getActiveCompany()}`;

export interface OfflineGastoItem {
  id: string;
  empleado_id: string;
  empleado_nombre?: string | null;
  monto: number;
  categoria?: string | null;
  subcategoria?: string | null;
  metodo_pago: 'efectivo' | 'tarjeta' | 'tarjeta_credito' | 'tarjeta_debito';
  justificacion?: string | null;
  base64Foto?: string | null; // Foto en base64 para guardado offline
  fotoExt?: string | null;
  fecha_comprobante?: string | null;
  proveedor?: string | null;
  cliente?: string | null;
  sucursal?: string | null;
  tipo_tarjeta?: string | null;
  ubicacion_registro?: string | null;
  estado?: string | null;
  facturado?: boolean | null;
  base64Factura?: string | null;
  facturaExt?: string | null;
  motivo_sin_factura?: string | null;
  tipo_servicio_proyecto?: string | null;
  detalle_servicio_proyecto?: string | null;
  vehiculo_id?: string | null;
  kilometraje_actual?: number | null;
  litros?: number | null;
  created_at: string;
}

// Convertidor base64 a ArrayBuffer autónomo para subir archivos a Supabase en React Native
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const lookup = new Uint8Array(256);
for (let i = 0; i < chars.length; i++) {
  lookup[chars.charCodeAt(i)] = i;
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  // 1. Limpiar cualquier cabecera de Data URL (imágenes, PDFs, etc.)
  let cleanBase64 = base64.replace(/^data:[a-zA-Z0-9/\-+.]+;base64,/, '');

  // 2. Limpiar espacios en blanco, saltos de línea o caracteres no válidos de base64
  cleanBase64 = cleanBase64.replace(/[^A-Za-z0-9+/=]/g, '');

  let bufferLength = cleanBase64.length * 0.75;
  const len = cleanBase64.length;
  let p = 0;
  let encoded1, encoded2, encoded3, encoded4;

  if (cleanBase64[cleanBase64.length - 1] === '=') {
    bufferLength--;
    if (cleanBase64[cleanBase64.length - 2] === '=') bufferLength--;
  }

  const arrayBuffer = new ArrayBuffer(bufferLength);
  const bytes = new Uint8Array(arrayBuffer);

  for (let i = 0; i < len; i += 4) {
    encoded1 = lookup[cleanBase64.charCodeAt(i)];
    encoded2 = lookup[cleanBase64.charCodeAt(i + 1)];
    encoded3 = lookup[cleanBase64.charCodeAt(i + 2)];
    encoded4 = lookup[cleanBase64.charCodeAt(i + 3)];

    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
    if (p < bufferLength) {
      bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    }
    if (p < bufferLength) {
      bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
    }
  }

  return arrayBuffer;
}

let isSyncingInProgress = false;

export const SyncService = {
  /**
   * Agrega un gasto a la cola local fuera de línea
   */
  async enqueueGasto(item: Omit<OfflineGastoItem, 'id' | 'created_at'>): Promise<void> {
    const queueKey = getOfflineQueueKey();
    const queueStr = await AsyncStorage.getItem(queueKey);
    const queue: OfflineGastoItem[] = queueStr ? JSON.parse(queueStr) : [];

    const newItem: OfflineGastoItem = {
      ...item,
      id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      created_at: new Date().toISOString(),
    };

    queue.push(newItem);
    await AsyncStorage.setItem(queueKey, JSON.stringify(queue));
  },

  /**
   * Obtiene la cola actual de gastos offline
   */
  async getOfflineQueue(): Promise<OfflineGastoItem[]> {
    const queueKey = getOfflineQueueKey();
    const queueStr = await AsyncStorage.getItem(queueKey);
    return queueStr ? JSON.parse(queueStr) : [];
  },

  /**
   * Intenta sincronizar todos los gastos en la cola local con Supabase
   * Retorna la cantidad de gastos sincronizados exitosamente
   */
  async syncPendingGastos(): Promise<number> {
    if (isSyncingInProgress) {
      console.log('Sincronización ya está en curso. Omitiendo ejecución duplicada.');
      return 0;
    }

    const isConnected = (await NetInfo.fetch()).isConnected;
    if (!isConnected) return 0;

    isSyncingInProgress = true;
    let syncedCount = 0;

    const queueKey = getOfflineQueueKey();

    try {
      const queueStr = await AsyncStorage.getItem(queueKey);
      if (!queueStr) return 0;

      const queue: OfflineGastoItem[] = JSON.parse(queueStr);
      if (queue.length === 0) return 0;

      const remainingQueue: OfflineGastoItem[] = [];

      for (const item of queue) {
        try {
          let publicUrl = '';
          let publicInvoiceUrl = '';

          // 1. Subir foto a Supabase Storage si existe
          if (item.base64Foto) {
            const ext = item.fotoExt || 'jpg';
            const contentType = ext === 'pdf' ? 'application/pdf' : 'image/jpeg';
            const fileName = `${item.empleado_id}/${Date.now()}.${ext}`;
            const arrayBuffer = base64ToArrayBuffer(item.base64Foto);

            const { data: _uploadData, error: uploadError } = await supabase.storage
              .from('tickets')
              .upload(fileName, arrayBuffer, {
                contentType: contentType,
                upsert: true,
              });

            if (uploadError) {
              throw new Error(`Storage upload error: ${uploadError.message}`);
            }

            const { data: urlData } = supabase.storage.from('tickets').getPublicUrl(fileName);
            publicUrl = urlData.publicUrl;
          }

          // 1.5 Subir factura a Supabase Storage si existe
          if (item.base64Factura) {
            const ext = item.facturaExt || 'jpg';
            const contentType = ext === 'pdf' ? 'application/pdf' : 'image/jpeg';
            const fileName = `${item.empleado_id}/factura_${Date.now()}.${ext}`;
            const arrayBuffer = base64ToArrayBuffer(item.base64Factura);

            const { data: _uploadData, error: uploadError } = await supabase.storage
              .from('tickets')
              .upload(fileName, arrayBuffer, {
                contentType: contentType,
                upsert: true,
              });

            if (uploadError) {
              throw new Error(`Storage invoice upload error: ${uploadError.message}`);
            }

            const { data: urlData } = supabase.storage.from('tickets').getPublicUrl(fileName);
            publicInvoiceUrl = urlData.publicUrl;
          }

          // 2. Insertar registro en Supabase Gastos Table
          const { data: insertedData, error: dbError } = await supabase
            .from('gastos')
            .insert([
              {
                empleado_id: item.empleado_id,
                empleado_nombre: item.empleado_nombre,
                monto: item.monto,
                categoria: item.categoria,
                subcategoria: item.subcategoria,
                metodo_pago: item.metodo_pago,
                justificacion: item.justificacion,
                foto_url: publicUrl || null,
                status: 'PENDING',
                fecha_comprobante: item.fecha_comprobante || new Date().toISOString().split('T')[0],
                proveedor: item.proveedor || null,
                cliente: item.cliente || null,
                sucursal: item.sucursal || null,
                tipo_tarjeta: item.tipo_tarjeta || null,
                ubicacion_registro: item.ubicacion_registro || 'Móvil (Offline Sync)',
                estado: item.estado || null,
                facturado: item.facturado || false,
                factura_url: publicInvoiceUrl || null,
                motivo_sin_factura: item.motivo_sin_factura || null,
                tipo_servicio_proyecto: item.tipo_servicio_proyecto || null,
                detalle_servicio_proyecto: item.detalle_servicio_proyecto || null,
                created_at: item.created_at,
              },
            ])
            .select();

          if (dbError) {
            throw new Error(`Database insert error: ${dbError.message}`);
          }

          // 3. Si es combustible y se insertó con éxito, insertar el registro de gasolina
          if (insertedData && insertedData.length > 0 && item.vehiculo_id) {
            const gastoId = insertedData[0].id;
            const { error: gasError } = await supabase
              .from('registro_gasolina')
              .insert([
                {
                  gasto_id: gastoId,
                  vehiculo_id: item.vehiculo_id,
                  empleado_id: item.empleado_id,
                  fecha: item.fecha_comprobante || new Date().toISOString().split('T')[0],
                  kilometraje_actual: item.kilometraje_actual || 0,
                  litros: item.litros || 0,
                  costo_total: item.monto,
                  ticket_foto_url: publicUrl || null,
                },
              ]);

            if (gasError) {
              console.error('Failed to insert gasoline log during sync:', gasError);
            }
          }

          syncedCount++;
        } catch (err) {
          console.error('Failed to sync offline item:', item.id, err);
          // Volver a encolar los elementos fallidos para reintentar después
          remainingQueue.push(item);
        }
      }

      await AsyncStorage.setItem(queueKey, JSON.stringify(remainingQueue));
    } catch (err) {
      console.error('Error general en syncPendingGastos:', err);
    } finally {
      isSyncingInProgress = false;
    }

    return syncedCount;
  },

  /**
   * Inicializa el listener de red para sincronizar de manera transparente
   */
  initNetworkSyncListener(onSyncComplete?: (count: number) => void) {
    return NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        this.syncPendingGastos().then((count) => {
          if (count > 0 && onSyncComplete) {
            onSyncComplete(count);
          }
        });
      }
    });
  },
};
