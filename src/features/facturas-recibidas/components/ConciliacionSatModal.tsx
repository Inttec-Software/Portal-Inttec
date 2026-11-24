import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { getApiHeaders, getApiUrl } from '@/services/apiHelper';
import { parseConciliacionSatFile, FacturaSatParsedItem } from '@/utils/conciliacionSatParser';
import {
  exportConciliacionSatToExcel,
  ConciliadaItem,
  HuerfanaSatItem,
  HuerfanoGastoItem,
} from '@/utils/conciliacionSatExcel';

interface ConciliacionSatModalProps {
  visible: boolean;
  onClose: () => void;
  themeColors: any;
}

interface ConciliacionKpis {
  totalSatCount: number;
  totalSatMonto: number;
  conciliadasCount: number;
  conciliadasMontoSat: number;
  conciliadasMontoGasto: number;
  huerfanasSatCount: number;
  huerfanasSatMonto: number;
  huerfanasEnPortalCount?: number;
  huerfanasNoEnPortalCount?: number;
  huerfanosGastosCount: number;
  huerfanosGastosMonto: number;
  huerfanosFacturadoSinVincularCount?: number;
  huerfanosPendienteCount: number;
  huerfanosNoFacturadoCount?: number;
  periodo?: {
    inicio: string;
    fin: string;
    nombre?: string;
  };
}

export function ConciliacionSatModal({
  visible,
  onClose,
  themeColors,
}: ConciliacionSatModalProps) {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const isLargeScreen = width >= 768;

  // Estados del flujo
  const [step, setStep] = useState<'upload' | 'loading' | 'results'>('upload');
  const [loadingMessage, setLoadingMessage] = useState('Procesando archivo...');
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  // Datos obtenidos
  const [kpis, setKpis] = useState<ConciliacionKpis | null>(null);
  const [conciliadas, setConciliadas] = useState<ConciliadaItem[]>([]);
  const [huerfanasSat, setHuerfanasSat] = useState<HuerfanaSatItem[]>([]);
  const [huerfanosGastos, setHuerfanosGastos] = useState<HuerfanoGastoItem[]>([]);
  const [periodoNombre, setPeriodoNombre] = useState<string>('');

  // Navegación de pestañas en resultados
  const [activeTab, setActiveTab] = useState<'conciliadas' | 'huerfanas_sat' | 'huerfanos_gastos'>('conciliadas');
  const [searchQuery, setSearchQuery] = useState('');

  // Drag and drop para web
  const [isDragOver, setIsDragOver] = useState(false);
  const dropzoneRef = useRef<any>(null);

  // Reset al cerrar o reabrir
  useEffect(() => {
    if (!visible) {
      setStep('upload');
      setKpis(null);
      setConciliadas([]);
      setHuerfanasSat([]);
      setHuerfanosGastos([]);
      setSearchQuery('');
      setActiveTab('conciliadas');
    }
  }, [visible]);

  // Prevenir navegación por arrastre de archivos en navegador web
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !visible) return;

    const preventDefaultGlobal = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener('dragover', preventDefaultGlobal);
    window.addEventListener('drop', preventDefaultGlobal);

    const el = dropzoneRef.current as any;
    const domNode = el?.addEventListener ? el : el?._nativeNode;

    const handleDropNative = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        const file = e.dataTransfer.files[0];
        const lower = file.name.toLowerCase();
        if (lower.endsWith('.xlsx') || lower.endsWith('.csv') || lower.endsWith('.xls')) {
          await processFileBlob(file, file.name);
        } else {
          Alert.alert('Archivo Inválido', 'Por favor selecciona un archivo con extensión .xlsx o .csv.');
        }
      }
    };

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
    };

    if (domNode) {
      domNode.addEventListener('dragenter', handleDragEnter);
      domNode.addEventListener('dragover', handleDragEnter);
      domNode.addEventListener('dragleave', handleDragLeave);
      domNode.addEventListener('drop', handleDropNative);
    }

    return () => {
      window.removeEventListener('dragover', preventDefaultGlobal);
      window.removeEventListener('drop', preventDefaultGlobal);
      if (domNode) {
        domNode.removeEventListener('dragenter', handleDragEnter);
        domNode.removeEventListener('dragover', handleDragEnter);
        domNode.removeEventListener('dragleave', handleDragLeave);
        domNode.removeEventListener('drop', handleDropNative);
      }
    };
  }, [visible, step]);

  // Procesar archivo File (Web)
  const processFileBlob = async (file: File, fileName: string) => {
    try {
      setStep('loading');
      setLoadingMessage(`Leyendo ${fileName}...`);

      const buffer = await file.arrayBuffer();
      const isCsv = fileName.toLowerCase().endsWith('.csv');
      
      const parsed = parseConciliacionSatFile(buffer, true);
      setPeriodoNombre(parsed.periodo.nombre);

      await sendToBackend(parsed.items, parsed.periodo);
    } catch (err: any) {
      console.error('[processFileBlob] Error:', err);
      Alert.alert('Error al leer archivo', err.message || 'No se pudo interpretar el formato del archivo.');
      setStep('upload');
    }
  };

  // Selector de archivos mediante DocumentPicker
  const handlePickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets && res.assets[0]) {
        const asset = res.assets[0];
        setStep('loading');
        setLoadingMessage(`Procesando ${asset.name}...`);

        let parseResult;
        if (Platform.OS === 'web' && (asset as any).file) {
          const buffer = await (asset as any).file.arrayBuffer();
          parseResult = parseConciliacionSatFile(buffer, true);
        } else {
          const base64 = await readAsStringAsync(asset.uri, { encoding: EncodingType.Base64 });
          parseResult = parseConciliacionSatFile(base64, true);
        }

        setPeriodoNombre(parseResult.periodo.nombre);
        await sendToBackend(parseResult.items, parseResult.periodo);
      }
    } catch (err: any) {
      console.error('[handlePickDocument] Error:', err);
      Alert.alert('Error', err.message || 'Error al cargar el archivo.');
      setStep('upload');
    }
  };

  // Enviar facturas parseadas al backend para realizar el cruce SQL
  const sendToBackend = async (
    items: FacturaSatParsedItem[],
    periodo: { inicio: string; fin: string; nombre: string }
  ) => {
    try {
      setLoadingMessage(`Cruzando ${items.length} facturas contra gastos del portal...`);
      const headers = await getApiHeaders();

      const res = await fetch(`${getApiUrl()}/api/facturas-recibidas/conciliacion-sat`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          facturasSat: items,
          periodo,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Error del servidor (${res.status})`);
      }

      const data = await res.json();
      setKpis(data.kpis);
      setConciliadas(data.conciliadas || []);
      setHuerfanasSat(data.huerfanasSat || []);
      setHuerfanosGastos(data.huerfanosGastos || []);
      setStep('results');
    } catch (err: any) {
      console.error('[sendToBackend] Error:', err);
      Alert.alert('Error en Conciliación', err.message || 'No se pudo completar el cruce en el servidor.');
      setStep('upload');
    }
  };

  // Descarga del reporte en Excel (.xlsx)
  const handleExportExcel = async () => {
    try {
      setIsExportingExcel(true);
      await exportConciliacionSatToExcel({
        conciliadas,
        huerfanasSat,
        huerfanosGastos,
        periodoNombre: periodoNombre || kpis?.periodo?.nombre || 'Mes',
      });
    } catch (err: any) {
      Alert.alert('Error al exportar', err.message || 'No se pudo generar el archivo Excel.');
    } finally {
      setIsExportingExcel(false);
    }
  };

  // Abrir gasto en el módulo de Gastos con su modal de revisión abierto
  const handleOpenGasto = (gastoId: string, status?: string) => {
    const tab = status === 'PENDING' ? 'pendientes' : 'historial';
    const path = `/gastos?gastoId=${encodeURIComponent(gastoId)}&tab=${tab}&search=${encodeURIComponent(gastoId)}`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(path, '_blank');
    } else {
      router.push({ pathname: '/gastos', params: { gastoId, tab, search: gastoId } } as any);
    }
  };

  // Filtrado de registros en la pestaña activa
  const filteredConciliadas = useMemo(() => {
    if (!searchQuery.trim()) return conciliadas;
    const q = searchQuery.toLowerCase().trim();
    return conciliadas.filter((c) => {
      const uuid = (c.sat.uuid || '').toLowerCase();
      const prov = (c.sat.nombreEmisor || '').toLowerCase();
      const rfc = (c.sat.rfcEmisor || '').toLowerCase();
      const emp = (c.gasto.empleado_nombre || '').toLowerCase();
      const gastoId = (c.gasto.gasto_id || '').toLowerCase();
      const amountStr = String(c.sat.total || '');
      return uuid.includes(q) || prov.includes(q) || rfc.includes(q) || emp.includes(q) || gastoId.includes(q) || amountStr.includes(q);
    });
  }, [conciliadas, searchQuery]);

  const filteredHuerfanasSat = useMemo(() => {
    if (!searchQuery.trim()) return huerfanasSat;
    const q = searchQuery.toLowerCase().trim();
    return huerfanasSat.filter((h) => {
      const uuid = (h.uuid || '').toLowerCase();
      const prov = (h.nombreEmisor || '').toLowerCase();
      const rfc = (h.rfcEmisor || '').toLowerCase();
      const conceptos = (h.conceptos || '').toLowerCase();
      const amountStr = String(h.total || '');
      return uuid.includes(q) || prov.includes(q) || rfc.includes(q) || conceptos.includes(q) || amountStr.includes(q);
    });
  }, [huerfanasSat, searchQuery]);

  const filteredHuerfanosGastos = useMemo(() => {
    if (!searchQuery.trim()) return huerfanosGastos;
    const q = searchQuery.toLowerCase().trim();
    return huerfanosGastos.filter((g) => {
      const id = (g.id || '').toLowerCase();
      const emp = (g.empleado_nombre || '').toLowerCase();
      const prov = (g.proveedor_nombre || '').toLowerCase();
      const motivo = (g.motivo_sin_factura || '').toLowerCase();
      const just = (g.justificacion || '').toLowerCase();
      const amountStr = String(g.monto || '');
      return id.includes(q) || emp.includes(q) || prov.includes(q) || motivo.includes(q) || just.includes(q) || amountStr.includes(q);
    });
  }, [huerfanosGastos, searchQuery]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View
          style={[
            styles.modalCard,
            {
              backgroundColor: themeColors.background,
              borderColor: themeColors.border,
              width: isLargeScreen ? '94%' : '98%',
              maxWidth: 1200,
              height: height * 0.92,
            },
          ]}
        >
          {/* HEADER DEL MODAL */}
          <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.headerIconContainer, { backgroundColor: '#6366f118' }]}>
                <Ionicons name="git-compare" size={20} color="#6366f1" />
              </View>
              <View>
                <Text style={[styles.headerTitle, { color: themeColors.text }]}>
                  Conciliación Mensual SAT vs Portal
                </Text>
                <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>
                  {periodoNombre ? `Periodo analizado: ${periodoNombre}` : 'Auditoría de facturas del SAT contra gastos registrados'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: themeColors.backgroundElement }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color={themeColors.text} />
            </TouchableOpacity>
          </View>

          {/* ========================================================= */}
          {/* PASO 1: CARGA DE ARCHIVO                                 */}
          {/* ========================================================= */}
          {step === 'upload' && (
            <ScrollView contentContainerStyle={styles.uploadBody}>
              <View
                ref={dropzoneRef}
                style={[
                  styles.dropzone,
                  {
                    backgroundColor: isDragOver ? '#6366f112' : themeColors.backgroundElement,
                    borderColor: isDragOver ? '#6366f1' : themeColors.border,
                  },
                ]}
              >
                <View style={[styles.uploadIconCircle, { backgroundColor: '#6366f120' }]}>
                  <Ionicons name="cloud-upload-outline" size={38} color="#6366f1" />
                </View>

                <Text style={[styles.dropzoneTitle, { color: themeColors.text }]}>
                  Sube el reporte de facturas recibidas del SAT
                </Text>
                <Text style={[styles.dropzoneSub, { color: themeColors.textSecondary }]}>
                  Arrastra aquí el archivo descargado de tu app del SAT o selecciónalo desde tu equipo.
                </Text>

                <View style={styles.formatPillsRow}>
                  <View style={[styles.formatPill, { backgroundColor: '#10b98118', borderColor: '#10b98140' }]}>
                    <Ionicons name="document-text-outline" size={14} color="#10b981" />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#10b981' }}>Excel (.xlsx / .xls)</Text>
                  </View>
                  <View style={[styles.formatPill, { backgroundColor: '#3b82f618', borderColor: '#3b82f640' }]}>
                    <Ionicons name="list-outline" size={14} color="#3b82f6" />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#3b82f6' }}>Texto CSV (.csv)</Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={handlePickDocument}
                  style={[styles.selectFileBtn, { backgroundColor: '#6366f1' }]}
                >
                  <Ionicons name="folder-open-outline" size={18} color="#fff" />
                  <Text style={styles.selectFileBtnText}>Seleccionar Archivo</Text>
                </TouchableOpacity>

                <Text style={[styles.hintText, { color: themeColors.textSecondary }]}>
                  Tip: Es el archivo que exportas en tu software de descarga masiva (ej. <Text style={{ fontFamily: 'monospace' }}>GENERAL-RFC-RECIBIDOS...xlsx</Text>).
                </Text>
              </View>

              {/* Tarjetas de ayuda / explicación */}
              <View style={styles.featuresCardsRow}>
                <View style={[styles.featureCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                  <Ionicons name="checkmark-done-circle" size={22} color="#10b981" />
                  <Text style={[styles.featureTitle, { color: themeColors.text }]}>1. Facturas Conciliadas</Text>
                  <Text style={[styles.featureDesc, { color: themeColors.textSecondary }]}>
                    Identifica al instante qué facturas del SAT ya tienen comprobación de gasto y qué empleado las realizó.
                  </Text>
                </View>

                <View style={[styles.featureCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                  <Ionicons name="alert-circle" size={22} color="#f59e0b" />
                  <Text style={[styles.featureTitle, { color: themeColors.text }]}>2. Facturas Huérfanas</Text>
                  <Text style={[styles.featureDesc, { color: themeColors.textSecondary }]}>
                    Te muestra qué proveedores timbraron a la empresa pero ningún empleado ha subido el comprobante al portal.
                  </Text>
                </View>

                <View style={[styles.featureCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                  <Ionicons name="receipt-outline" size={22} color="#3b82f6" />
                  <Text style={[styles.featureTitle, { color: themeColors.text }]}>3. Gastos Huérfanos</Text>
                  <Text style={[styles.featureDesc, { color: themeColors.textSecondary }]}>
                    Lista los gastos del mes que están pendientes de factura o sin comprobante para amarrarlos fácilmente.
                  </Text>
                </View>
              </View>
            </ScrollView>
          )}

          {/* ========================================================= */}
          {/* PASO 2: CARGANDO Y PROCESANDO                             */}
          {/* ========================================================= */}
          {step === 'loading' && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#6366f1" />
              <Text style={[styles.loadingTitle, { color: themeColors.text }]}>
                {loadingMessage}
              </Text>
              <Text style={[styles.loadingSub, { color: themeColors.textSecondary }]}>
                Consultando base de datos de PostgreSQL y relacionando UUIDs fiscales...
              </Text>
            </View>
          )}

          {/* ========================================================= */}
          {/* PASO 3: PANTALLA INTERACTIVA DE RESULTADOS                */}
          {/* ========================================================= */}
          {step === 'results' && kpis && (
            <View style={{ flex: 1 }}>
              {/* BARRA SUPERIOR DE ACCIONES Y KPIS */}
              <View style={[styles.resultsActionBar, { borderBottomColor: themeColors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <TouchableOpacity
                    onPress={() => setStep('upload')}
                    style={[styles.btnSecondary, { borderColor: themeColors.border }]}
                  >
                    <Ionicons name="arrow-back" size={14} color={themeColors.text} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text }}>Cargar otro archivo</Text>
                  </TouchableOpacity>

                  <View style={[styles.periodBadge, { backgroundColor: '#6366f115', borderColor: '#6366f140' }]}>
                    <Ionicons name="calendar-outline" size={14} color="#6366f1" />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#6366f1' }}>
                      {periodoNombre || 'Periodo Conciliado'}
                    </Text>
                  </View>
                </View>

                {/* BOTÓN DESCARGAR EXCEL */}
                <TouchableOpacity
                  onPress={handleExportExcel}
                  disabled={isExportingExcel}
                  style={[styles.btnDownloadExcel, { backgroundColor: '#10b981' }]}
                >
                  {isExportingExcel ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="download-outline" size={16} color="#fff" />
                      <Text style={styles.btnDownloadExcelText}>Descargar Excel (.xlsx)</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* FILA DE TARJETAS KPIS */}
              <View style={styles.kpiRow}>
                {/* Total SAT */}
                <View style={[styles.kpiCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                  <Text style={[styles.kpiLabel, { color: themeColors.textSecondary }]}>Total Facturas SAT</Text>
                  <Text style={[styles.kpiValue, { color: themeColors.text }]}>
                    ${kpis.totalSatMonto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </Text>
                  <Text style={[styles.kpiSub, { color: themeColors.textSecondary }]}>
                    {kpis.totalSatCount} facturas en archivo
                  </Text>
                </View>

                {/* Conciliadas */}
                <TouchableOpacity
                  onPress={() => setActiveTab('conciliadas')}
                  style={[
                    styles.kpiCard,
                    {
                      backgroundColor: activeTab === 'conciliadas' ? '#10b98115' : themeColors.backgroundElement,
                      borderColor: activeTab === 'conciliadas' ? '#10b981' : themeColors.border,
                    },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="checkmark-circle" size={14} color="#10b981" />
                    <Text style={[styles.kpiLabel, { color: '#10b981' }]}>Conciliadas (Con Gasto)</Text>
                  </View>
                  <Text style={[styles.kpiValue, { color: '#10b981' }]}>
                    ${kpis.conciliadasMontoSat.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </Text>
                  <Text style={[styles.kpiSub, { color: themeColors.textSecondary }]}>
                    {kpis.conciliadasCount} facturas comprobadas
                  </Text>
                </TouchableOpacity>

                {/* Huérfanas SAT */}
                <TouchableOpacity
                  onPress={() => setActiveTab('huerfanas_sat')}
                  style={[
                    styles.kpiCard,
                    {
                      backgroundColor: activeTab === 'huerfanas_sat' ? '#f59e0b15' : themeColors.backgroundElement,
                      borderColor: activeTab === 'huerfanas_sat' ? '#f59e0b' : themeColors.border,
                    },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="warning" size={14} color="#f59e0b" />
                    <Text style={[styles.kpiLabel, { color: '#f59e0b' }]}>Huérfanas SAT (Sin Gasto)</Text>
                  </View>
                  <Text style={[styles.kpiValue, { color: '#f59e0b' }]}>
                    ${kpis.huerfanasSatMonto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </Text>
                  <Text style={[styles.kpiSub, { color: themeColors.textSecondary }]}>
                    {kpis.huerfanasEnPortalCount !== undefined ? `${kpis.huerfanasEnPortalCount} en portal • ${kpis.huerfanasNoEnPortalCount} nuevas` : `${kpis.huerfanasSatCount} facturas`}
                  </Text>
                </TouchableOpacity>

                {/* Gastos Huérfanos */}
                <TouchableOpacity
                  onPress={() => setActiveTab('huerfanos_gastos')}
                  style={[
                    styles.kpiCard,
                    {
                      backgroundColor: activeTab === 'huerfanos_gastos' ? '#3b82f615' : themeColors.backgroundElement,
                      borderColor: activeTab === 'huerfanos_gastos' ? '#3b82f6' : themeColors.border,
                    },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="receipt" size={14} color="#3b82f6" />
                    <Text style={[styles.kpiLabel, { color: '#3b82f6' }]}>Gastos Huérfanos Mes</Text>
                  </View>
                  <Text style={[styles.kpiValue, { color: '#3b82f6' }]}>
                    ${kpis.huerfanosGastosMonto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </Text>
                  <Text style={[styles.kpiSub, { color: themeColors.textSecondary }]}>
                    {(kpis.huerfanosFacturadoSinVincularCount || 0) > 0 ? `${kpis.huerfanosFacturadoSinVincularCount} facturados • ` : ''}{kpis.huerfanosPendienteCount} pend. • {kpis.huerfanosNoFacturadoCount ?? 0} no facturados
                  </Text>
                </TouchableOpacity>
              </View>

              {/* TABS Y BUSCADOR */}
              <View style={[styles.tabBarContainer, { borderBottomColor: themeColors.border }]}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setActiveTab('conciliadas')}
                    style={[
                      styles.tabBtn,
                      activeTab === 'conciliadas' && { borderBottomColor: '#10b981', borderBottomWidth: 2 },
                    ]}
                  >
                    <Ionicons name="checkmark-circle-outline" size={16} color={activeTab === 'conciliadas' ? '#10b981' : themeColors.textSecondary} />
                    <Text
                      style={[
                        styles.tabBtnText,
                        { color: activeTab === 'conciliadas' ? '#10b981' : themeColors.textSecondary },
                      ]}
                    >
                      Conciliadas ({conciliadas.length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setActiveTab('huerfanas_sat')}
                    style={[
                      styles.tabBtn,
                      activeTab === 'huerfanas_sat' && { borderBottomColor: '#f59e0b', borderBottomWidth: 2 },
                    ]}
                  >
                    <Ionicons name="warning-outline" size={16} color={activeTab === 'huerfanas_sat' ? '#f59e0b' : themeColors.textSecondary} />
                    <Text
                      style={[
                        styles.tabBtnText,
                        { color: activeTab === 'huerfanas_sat' ? '#f59e0b' : themeColors.textSecondary },
                      ]}
                    >
                      Huérfanas SAT ({huerfanasSat.length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setActiveTab('huerfanos_gastos')}
                    style={[
                      styles.tabBtn,
                      activeTab === 'huerfanos_gastos' && { borderBottomColor: '#3b82f6', borderBottomWidth: 2 },
                    ]}
                  >
                    <Ionicons name="receipt-outline" size={16} color={activeTab === 'huerfanos_gastos' ? '#3b82f6' : themeColors.textSecondary} />
                    <Text
                      style={[
                        styles.tabBtnText,
                        { color: activeTab === 'huerfanos_gastos' ? '#3b82f6' : themeColors.textSecondary },
                      ]}
                    >
                      Gastos Huérfanos ({huerfanosGastos.length})
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Búsqueda dentro de la tabla */}
                <View style={[styles.searchBox, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                  <Ionicons name="search" size={14} color={themeColors.textSecondary} />
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Filtrar por proveedor, UUID, empleado..."
                    placeholderTextColor={themeColors.textSecondary}
                    style={[styles.searchInput, { color: themeColors.text }]}
                  />
                  {searchQuery ? (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                      <Ionicons name="close-circle" size={14} color={themeColors.textSecondary} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              {/* CONTENIDO TABULAR SEGÚN LA PESTAÑA ACTIVA */}
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.two }}>
                {/* ========================================== */}
                {/* TAB 1: CONCILIADAS                         */}
                {/* ========================================== */}
                {activeTab === 'conciliadas' && (
                  filteredConciliadas.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <Ionicons name="checkmark-done-circle-outline" size={48} color={themeColors.textSecondary} />
                      <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                        {searchQuery ? 'No hay facturas conciliadas que coincidan con la búsqueda.' : 'No se encontraron facturas conciliadas en este archivo.'}
                      </Text>
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {filteredConciliadas.map((c, idx) => {
                        const totalSat = Number(c.sat.total || 0);
                        const montoGasto = Number(c.gasto.gasto_monto || 0);
                        const propina = Number(c.gasto.monto_propina || 0);
                        return (
                          <View
                            key={idx}
                            style={[styles.recordCard, { backgroundColor: themeColors.backgroundElement, borderColor: '#10b98130' }]}
                          >
                            <View style={styles.recordRowTop}>
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.recordTitle, { color: themeColors.text }]}>
                                  {c.sat.nombreEmisor || 'Proveedor SAT'}
                                </Text>
                                <Text style={[styles.recordSub, { color: themeColors.textSecondary }]}>
                                  RFC: <Text style={{ fontWeight: '700', color: themeColors.text }}>{c.sat.rfcEmisor}</Text> • Fecha: {c.sat.fechaEmision ? c.sat.fechaEmision.substring(0, 10) : 'N/D'}
                                </Text>
                                <Text style={[styles.recordUuid, { color: themeColors.textSecondary }]} numberOfLines={1}>
                                  UUID: {c.sat.uuid}
                                </Text>
                              </View>

                              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                                <Text style={[styles.recordAmountSat, { color: '#10b981' }]}>
                                  SAT: ${totalSat.toFixed(2)}
                                </Text>
                                <Text style={[styles.recordAmountGasto, { color: themeColors.text }]}>
                                  Gasto: ${montoGasto.toFixed(2)}
                                </Text>
                                {propina > 0 && (
                                  <Text style={{ fontSize: 11, color: '#f59e0b', fontWeight: '700' }}>
                                    + Propina ${propina.toFixed(2)}
                                  </Text>
                                )}
                              </View>
                            </View>

                            <View style={[styles.recordDivider, { backgroundColor: themeColors.border }]} />

                            {/* Datos del gasto amarrado */}
                            <View style={[styles.recordGastoDetails, { justifyContent: 'space-between' }]}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                  <Ionicons name="person-outline" size={13} color="#6366f1" />
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.text }}>
                                    {c.gasto.empleado_nombre || 'Empleado'}
                                  </Text>
                                </View>
                                <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                                  • Gasto #{c.gasto.gasto_id.substring(0, 8)}
                                </Text>
                                {c.gasto.categoria_nombre && (
                                  <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                                    • {c.gasto.categoria_nombre}
                                  </Text>
                                )}
                                {(c.gasto.cliente_nombre || c.gasto.venta_cliente) && (
                                  <Text style={{ fontSize: 11, color: '#6366f1' }}>
                                    • Proyecto: {c.gasto.cliente_nombre || c.gasto.venta_cliente}
                                  </Text>
                                )}
                              </View>

                              <TouchableOpacity
                                onPress={() => handleOpenGasto(c.gasto.gasto_id, c.gasto.gasto_status)}
                                style={[
                                  styles.btnOpenGasto,
                                  { backgroundColor: themeColors.primary + '18', borderColor: themeColors.primary + '40', alignSelf: 'center' }
                                ]}
                              >
                                <Ionicons name="open-outline" size={12} color={themeColors.primary} />
                                <Text style={{ fontSize: 10, fontWeight: '700', color: themeColors.primary }}>Ver Gasto</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )
                )}

                {/* ========================================== */}
                {/* TAB 2: HUÉRFANAS SAT                       */}
                {/* ========================================== */}
                {activeTab === 'huerfanas_sat' && (
                  filteredHuerfanasSat.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <Ionicons name="shield-checkmark-outline" size={48} color="#10b981" />
                      <Text style={[styles.emptyText, { color: '#10b981' }]}>
                        ¡Excelente! No hay facturas huérfanas pendientes de comprobar en esta selección.
                      </Text>
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {filteredHuerfanasSat.map((h, idx) => (
                        <View
                          key={idx}
                          style={[styles.recordCard, { backgroundColor: themeColors.backgroundElement, borderColor: '#f59e0b35' }]}
                        >
                          <View style={styles.recordRowTop}>
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <Ionicons name="warning-outline" size={14} color="#f59e0b" />
                                <Text style={[styles.recordTitle, { color: themeColors.text }]}>
                                  {h.nombreEmisor || 'Proveedor SAT'}
                                </Text>
                                {h.en_portal ? (
                                  <View style={[styles.badgePill, { backgroundColor: '#10b98118', borderColor: '#10b98150' }]}>
                                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#10b981' }}>🟢 En Catálogo Portal</Text>
                                  </View>
                                ) : (
                                  <View style={[styles.badgePill, { backgroundColor: '#ef444415', borderColor: '#ef444450' }]}>
                                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#ef4444' }}>⚠️ No existe en Portal</Text>
                                  </View>
                                )}
                              </View>
                              <Text style={[styles.recordSub, { color: themeColors.textSecondary }]}>
                                RFC: <Text style={{ fontWeight: '700', color: themeColors.text }}>{h.rfcEmisor}</Text> • Fecha: {h.fechaEmision ? h.fechaEmision.substring(0, 10) : 'N/D'}
                              </Text>
                              <Text style={[styles.recordUuid, { color: themeColors.textSecondary }]} numberOfLines={1}>
                                UUID: {h.uuid}
                              </Text>
                              {h.conceptos ? (
                                <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 4 }} numberOfLines={2}>
                                  Concepto: {h.conceptos}
                                </Text>
                              ) : null}
                            </View>

                            <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                              <Text style={[styles.recordAmountSat, { color: '#f59e0b' }]}>
                                ${Number(h.total || 0).toFixed(2)}
                              </Text>
                              <View style={[styles.badgePill, { backgroundColor: '#f59e0b20', borderColor: '#f59e0b50', marginTop: 4 }]}>
                                <Text style={{ fontSize: 10, fontWeight: '800', color: '#f59e0b' }}>Sin Gasto Vinculado</Text>
                              </View>
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                  )
                )}

                {/* ========================================== */}
                {/* TAB 3: GASTOS HUÉRFANOS DEL MES            */}
                {/* ========================================== */}
                {activeTab === 'huerfanos_gastos' && (
                  filteredHuerfanosGastos.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <Ionicons name="checkmark-done-circle-outline" size={48} color="#10b981" />
                      <Text style={[styles.emptyText, { color: '#10b981' }]}>
                        ¡Todo en orden! Todos los gastos registrados en este periodo tienen su factura vinculada.
                      </Text>
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {filteredHuerfanosGastos.map((g, idx) => {
                        let badgeColor = '#64748b';
                        let badgeBg = '#64748b18';
                        let badgeBorder = '#64748b50';
                        let badgeText = 'No facturado';
                        let badgeIcon = 'receipt-outline';

                        if (g.clasificacion_fiscal === 'FACTURADO_SIN_VINCULAR') {
                          badgeColor = '#8b5cf6';
                          badgeBg = '#8b5cf618';
                          badgeBorder = '#8b5cf650';
                          badgeText = 'Marcado Facturado (Sin Vincular)';
                          badgeIcon = 'alert-circle-outline';
                        } else if (g.clasificacion_fiscal === 'PENDIENTE_FACTURA') {
                          badgeColor = '#f59e0b';
                          badgeBg = '#f59e0b18';
                          badgeBorder = '#f59e0b50';
                          badgeText = 'Pendiente de Factura';
                          badgeIcon = 'time-outline';
                        }

                        return (
                          <View
                            key={idx}
                            style={[styles.recordCard, { backgroundColor: themeColors.backgroundElement, borderColor: badgeColor + '35' }]}
                          >
                            <View style={styles.recordRowTop}>
                              <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  <Ionicons name={badgeIcon as any} size={14} color={badgeColor} />
                                  <Text style={[styles.recordTitle, { color: themeColors.text }]}>
                                    {g.proveedor_nombre || g.justificacion || 'Gasto sin comprobante SAT'}
                                  </Text>
                                  <View style={[styles.badgePill, { backgroundColor: badgeBg, borderColor: badgeBorder }]}>
                                    <Text style={{ fontSize: 10, fontWeight: '800', color: badgeColor }}>{badgeText}</Text>
                                  </View>
                                </View>
                                <Text style={[styles.recordSub, { color: themeColors.textSecondary }]}>
                                  Empleado: <Text style={{ fontWeight: '700', color: themeColors.text }}>{g.empleado_nombre || 'N/A'}</Text> • Fecha: {g.fecha_comprobante || (g.created_at ? g.created_at.substring(0, 10) : 'N/D')}
                                </Text>
                                <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                                  Categoría: {g.categoria_nombre || 'General'}{g.subcategoria_nombre ? ` • ${g.subcategoria_nombre}` : ''}{g.cliente_nombre ? ` • Cliente: ${g.cliente_nombre}` : ''}
                                </Text>
                                <Text style={[styles.recordUuid, { color: themeColors.textSecondary }]} numberOfLines={1}>
                                  ID Gasto: {g.id}
                                </Text>
                                {g.motivo_sin_factura ? (
                                  <Text style={{ fontSize: 11, color: badgeColor, fontStyle: 'italic', marginTop: 2 }}>
                                    Nota: {g.motivo_sin_factura}
                                  </Text>
                                ) : null}
                              </View>

                              <View style={{ alignItems: 'flex-end', justifyContent: 'center', gap: 6 }}>
                                <Text style={[styles.recordAmountSat, { color: themeColors.text }]}>
                                  ${Number(g.monto || 0).toFixed(2)}
                                </Text>
                                <TouchableOpacity
                                  onPress={() => handleOpenGasto(g.id, g.status)}
                                  style={[
                                    styles.btnOpenGasto,
                                    { backgroundColor: themeColors.primary + '18', borderColor: themeColors.primary + '40' }
                                  ]}
                                >
                                  <Ionicons name="open-outline" size={13} color={themeColors.primary} />
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.primary }}>Abrir Gasto</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )
                )}
              </ScrollView>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.two,
  },
  modalCard: {
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
  },
  headerIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 12,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadBody: {
    padding: Spacing.four,
    alignItems: 'center',
  },
  dropzone: {
    width: '100%',
    maxWidth: 750,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.large,
    padding: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadIconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  dropzoneTitle: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  dropzoneSub: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 500,
    marginBottom: Spacing.three,
  },
  formatPillsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: Spacing.three,
  },
  formatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    borderWidth: 1,
  },
  selectFileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: BorderRadius.medium,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  selectFileBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  hintText: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: Spacing.three,
    textAlign: 'center',
  },
  featuresCardsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.four,
    width: '100%',
    maxWidth: 850,
    flexWrap: 'wrap',
  },
  featureCard: {
    flex: 1,
    minWidth: 240,
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    padding: Spacing.two,
    gap: 4,
  },
  featureTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  featureDesc: {
    fontSize: 11,
    lineHeight: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: 10,
  },
  loadingTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 6,
  },
  loadingSub: {
    fontSize: 12,
    textAlign: 'center',
  },
  resultsActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    flexWrap: 'wrap',
    gap: 8,
  },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  periodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  btnDownloadExcel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: BorderRadius.small,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  btnDownloadExcelText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  kpiRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  kpiCard: {
    flex: 1,
    minWidth: 180,
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    padding: Spacing.two,
    gap: 2,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: '900',
  },
  kpiSub: {
    fontSize: 11,
  },
  tabBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    borderBottomWidth: 1,
    flexWrap: 'wrap',
    gap: 8,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    paddingHorizontal: 8,
    paddingVertical: 4,
    width: 250,
  },
  searchInput: {
    flex: 1,
    fontSize: 11,
    paddingVertical: 0,
  },
  recordCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    padding: Spacing.two,
    gap: 6,
  },
  recordRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  recordTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  recordSub: {
    fontSize: 11,
  },
  recordUuid: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 2,
  },
  recordAmountSat: {
    fontSize: 14,
    fontWeight: '900',
  },
  recordAmountGasto: {
    fontSize: 12,
    fontWeight: '700',
  },
  recordDivider: {
    height: 1,
    width: '100%',
    marginVertical: 2,
  },
  recordGastoDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  badgePill: {
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  btnOpenGasto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 400,
  },
});
