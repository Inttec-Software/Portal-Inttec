import * as XLSX from 'xlsx';
import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { cacheDirectory, writeAsStringAsync, EncodingType } from 'expo-file-system/legacy';

export interface ConciliadaItem {
  sat: {
    uuid: string;
    fechaEmision: string;
    rfcEmisor: string;
    nombreEmisor: string;
    total: number;
    estadoSat: string;
    conceptos?: string;
    moneda?: string;
  };
  gasto: {
    gasto_id: string;
    empleado_nombre: string;
    fecha_comprobante?: string;
    gasto_monto: number;
    monto_propina?: number;
    motivo_sin_factura?: string;
    gasto_status?: string;
    categoria_nombre?: string;
    subcategoria_nombre?: string;
    cliente_nombre?: string;
    venta_cliente?: string;
    detalle_servicio_proyecto?: string;
  };
}

export interface HuerfanaSatItem {
  uuid: string;
  fechaEmision: string;
  rfcEmisor: string;
  nombreEmisor: string;
  total: number;
  estadoSat: string;
  conceptos?: string;
  moneda?: string;
  en_portal?: boolean;
}

export interface HuerfanoGastoItem {
  id: string;
  empleado_nombre: string;
  fecha_comprobante?: string;
  created_at?: string;
  monto: number;
  status: string;
  facturado?: boolean;
  motivo_sin_factura?: string;
  justificacion?: string;
  categoria_nombre?: string;
  subcategoria_nombre?: string;
  proveedor_nombre?: string;
  cliente_nombre?: string;
  clasificacion_fiscal: 'FACTURADO_SIN_VINCULAR' | 'PENDIENTE_FACTURA' | 'NO_FACTURADO';
}

export interface ConciliacionData {
  conciliadas: ConciliadaItem[];
  huerfanasSat: HuerfanaSatItem[];
  huerfanosGastos: HuerfanoGastoItem[];
  periodoNombre?: string;
}

/**
 * Genera y descarga el archivo Excel (.xlsx) con 3 hojas estructuradas para la conciliación contable
 */
export async function exportConciliacionSatToExcel(
  data: ConciliacionData,
  filename?: string
): Promise<void> {
  const wb = XLSX.utils.book_new();
  const periodoLabel = data.periodoNombre || 'Periodo';

  // ==========================================
  // HOJA 1: FACTURAS CONCILIADAS
  // ==========================================
  const headersHoja1 = [
    'UUID Fiscal SAT',
    'Fecha SAT',
    'RFC Emisor',
    'Proveedor / Razón Social',
    'Total SAT ($)',
    'ID Gasto',
    'Empleado',
    'Categoría',
    'Subcategoría',
    'Proyecto / Cliente',
    'Monto Pagado Gasto ($)',
    'Propina ($)',
    'Diferencia ($)',
    'Estatus Gasto'
  ];

  const rowsHoja1 = data.conciliadas.map((item) => {
    const totalSat = Number(item.sat.total || 0);
    const montoGasto = Number(item.gasto.gasto_monto || 0);
    const propina = Number(item.gasto.monto_propina || 0);
    const diferencia = Math.max(0, montoGasto - propina - totalSat);

    return [
      item.sat.uuid,
      item.sat.fechaEmision,
      item.sat.rfcEmisor,
      item.sat.nombreEmisor,
      totalSat,
      item.gasto.gasto_id,
      item.gasto.empleado_nombre || 'N/A',
      item.gasto.categoria_nombre || 'General',
      item.gasto.subcategoria_nombre || '',
      item.gasto.cliente_nombre || item.gasto.venta_cliente || item.gasto.detalle_servicio_proyecto || 'General',
      montoGasto,
      propina,
      diferencia,
      item.gasto.gasto_status || 'APPROVED'
    ];
  });

  const ws1 = XLSX.utils.aoa_to_sheet([headersHoja1, ...rowsHoja1]);
  ws1['!cols'] = [
    { wch: 38 }, // UUID
    { wch: 20 }, // Fecha SAT
    { wch: 15 }, // RFC
    { wch: 40 }, // Proveedor
    { wch: 14 }, // Total SAT
    { wch: 38 }, // ID Gasto
    { wch: 25 }, // Empleado
    { wch: 20 }, // Categoría
    { wch: 20 }, // Subcategoría
    { wch: 25 }, // Proyecto
    { wch: 20 }, // Monto Gasto
    { wch: 14 }, // Propina
    { wch: 14 }, // Diferencia
    { wch: 15 }, // Estatus
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Facturas Conciliadas');

  // ==========================================
  // HOJA 2: FACTURAS HUÉRFANAS SAT
  // ==========================================
  const headersHoja2 = [
    'UUID Fiscal SAT',
    'Fecha Emisión',
    'RFC Emisor',
    'Proveedor / Razón Social',
    'Conceptos / Descripción',
    'Total Factura ($)',
    'Moneda',
    'Estado SAT',
    '¿En Catálogo del Portal?'
  ];

  const rowsHoja2 = data.huerfanasSat.map((sat) => [
    sat.uuid,
    sat.fechaEmision,
    sat.rfcEmisor,
    sat.nombreEmisor,
    sat.conceptos || 'N/A',
    Number(sat.total || 0),
    sat.moneda || 'MXN',
    sat.estadoSat || 'VIGENTE',
    sat.en_portal ? 'SÍ (Sin vincular a gasto)' : 'NO (No existe en portal)'
  ]);

  const ws2 = XLSX.utils.aoa_to_sheet([headersHoja2, ...rowsHoja2]);
  ws2['!cols'] = [
    { wch: 38 }, // UUID
    { wch: 20 }, // Fecha Emisión
    { wch: 15 }, // RFC
    { wch: 40 }, // Proveedor
    { wch: 50 }, // Conceptos
    { wch: 16 }, // Total Factura
    { wch: 10 }, // Moneda
    { wch: 14 }, // Estado SAT
    { wch: 26 }, // ¿En Portal?
  ];
  XLSX.utils.book_append_sheet(wb, ws2, 'Facturas Huérfanas SAT');

  // ==========================================
  // HOJA 3: GASTOS HUÉRFANOS DEL MES
  // ==========================================
  const headersHoja3 = [
    'ID Gasto',
    'Empleado',
    'Fecha Comprobante',
    'Categoría',
    'Subcategoría',
    'Proveedor / Concepto Registrado',
    'Monto Gasto ($)',
    'Estatus Fiscal',
    'Motivo / Justificación',
    'Estado Aprobación'
  ];

  const rowsHoja3 = data.huerfanosGastos.map((g) => {
    let estatusFiscal = 'NO FACTURADO';
    if (g.clasificacion_fiscal === 'FACTURADO_SIN_VINCULAR') {
      estatusFiscal = 'MARCADO FACTURADO (SIN VINCULAR)';
    } else if (g.clasificacion_fiscal === 'PENDIENTE_FACTURA') {
      estatusFiscal = 'PENDIENTE DE FACTURA';
    }

    const fecha = g.fecha_comprobante || (g.created_at ? g.created_at.substring(0, 10) : 'N/D');

    return [
      g.id,
      g.empleado_nombre || 'N/A',
      fecha,
      g.categoria_nombre || 'General',
      g.subcategoria_nombre || '',
      g.proveedor_nombre || g.justificacion || 'N/A',
      Number(g.monto || 0),
      estatusFiscal,
      g.motivo_sin_factura || g.justificacion || 'N/A',
      g.status || 'PENDING'
    ];
  });

  const ws3 = XLSX.utils.aoa_to_sheet([headersHoja3, ...rowsHoja3]);
  ws3['!cols'] = [
    { wch: 38 }, // ID Gasto
    { wch: 25 }, // Empleado
    { wch: 18 }, // Fecha Comprobante
    { wch: 20 }, // Categoría
    { wch: 20 }, // Subcategoría
    { wch: 35 }, // Proveedor
    { wch: 16 }, // Monto Gasto
    { wch: 28 }, // Estatus Fiscal
    { wch: 40 }, // Motivo
    { wch: 18 }, // Estado Aprobación
  ];
  XLSX.utils.book_append_sheet(wb, ws3, 'Gastos Huérfanos Mes');

  // ==========================================
  // EXPORTACIÓN MULTIPLATAFORMA
  // ==========================================
  const finalFilename = filename
    ? (filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
    : `Conciliacion_SAT_${periodoLabel.replace(/\s+/g, '_')}_${new Date().toISOString().substring(0, 10)}.xlsx`;

  if (Platform.OS === 'web') {
    XLSX.writeFile(wb, finalFilename, { bookType: 'xlsx' });
  } else {
    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    const fileUri = `${cacheDirectory}${finalFilename}`;
    await writeAsStringAsync(fileUri, base64, { encoding: EncodingType.Base64 });
    const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType,
        dialogTitle: `Exportar Conciliación SAT (${periodoLabel})`,
      });
    } else {
      throw new Error('La función de compartir no está disponible en este dispositivo.');
    }
  }
}
