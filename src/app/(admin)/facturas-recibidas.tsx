import { supabase } from '@/services/supabase';
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Modal,
  Alert,
  Platform,
  RefreshControl,
  useWindowDimensions,
  Linking,
  Pressable,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { getApiHeaders, getApiUrl } from '@/services/apiHelper';
import { parseCfdiXml } from '@/utils/xmlParser';
import { exportFacturaCfdiToPdf } from '@/utils/cfdiPdfGenerator';
import { ModuleCache } from '@/services/moduleCache';
import { FacturasKpiGridSkeleton, FacturasListSkeleton } from '@/components/skeleton';
import PaginationControls from '@/components/PaginationControls';
import { exportFacturasRecibidasToExcel } from '@/utils/facturasRecibidasExcel';

interface FacturaRecibida {
  id: string;
  uuid: string;
  rfc_emisor: string;
  nombre_emisor: string;
  rfc_receptor: string;
  nombre_receptor?: string;
  rfc_pac?: string;
  fecha_emision: string;
  fecha_certificacion_sat?: string;
  subtotal: number;
  descuento: number;
  iva: number;
  retencion_isr: number;
  retencion_iva: number;
  total: number;
  moneda: string;
  tipo_cambio?: number;
  tipo_comprobante: string;
  estado_sat: string;
  fecha_cancelacion?: string;
  tipo_proveedor?: string;
  xml_url?: string;
  pdf_url?: string;
  conceptos_json?: any[];
  created_at: string;
  serie?: string;
  folio?: string;
}

interface SatSolicitud {
  id: string;
  id_solicitud: string;
  rfc: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado_sat: string;
  mensaje_sat?: string;
  total_facturas_procesadas?: number;
  created_at: string;
}

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    window.alert(title ? `${title}\n\n${message}` : message);
  } else {
    Alert.alert(title, message);
  }
};

function TableTooltipButton({
  icon,
  color,
  bgColor,
  borderColor,
  tooltip,
  onPress,
  disabled,
  align = 'center',
}: {
  icon: any;
  color: string;
  bgColor: string;
  borderColor: string;
  tooltip: string;
  onPress: () => void;
  disabled?: boolean;
  align?: 'center' | 'left' | 'right';
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <View style={{ position: 'relative', alignItems: 'center', zIndex: hovered ? 99999 : 1 }}>
      <Pressable
        onPress={(e) => {
          e.stopPropagation?.();
          if (!disabled) onPress();
        }}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={({ hovered: isHover }: any) => [
          styles.tableActionIconBtn,
          {
            borderColor: isHover || hovered ? color : borderColor,
            backgroundColor: isHover || hovered ? color + '28' : bgColor,
            transform: [{ scale: isHover || hovered ? 1.1 : 1 }],
            opacity: disabled ? 0.4 : 1,
          },
        ]}
        accessibilityLabel={tooltip}
      >
        <Ionicons name={icon} size={15} color={color} />
      </Pressable>

      {hovered && Platform.OS === 'web' && (
        <View
          style={[
            {
              position: 'absolute',
              bottom: 34,
              backgroundColor: '#0f172a',
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: '#334155',
              zIndex: 999999,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.4,
              shadowRadius: 5,
              elevation: 12,
              pointerEvents: 'none',
              alignItems: 'center',
              justifyContent: 'center',
            },
            align === 'right'
              ? { right: -2 }
              : align === 'left'
              ? { left: -2 }
              : { alignSelf: 'center' },
            Platform.select({
              web: {
                width: 'max-content',
                minWidth: 'max-content',
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
              } as any,
            }),
          ]}
        >
          <Text
            style={[
              {
                color: '#f8fafc',
                fontSize: 11,
                fontWeight: '700',
                textAlign: 'center',
              },
              Platform.select({
                web: {
                  whiteSpace: 'nowrap',
                  wordBreak: 'keep-all',
                } as any,
              }),
            ]}
            numberOfLines={1}
          >
            {tooltip}
          </Text>

          {/* Flecha indicadora hacia el botón */}
          <View
            style={{
              position: 'absolute',
              top: '100%',
              width: 0,
              height: 0,
              borderLeftWidth: 4,
              borderRightWidth: 4,
              borderTopWidth: 4,
              borderLeftColor: 'transparent',
              borderRightColor: 'transparent',
              borderTopColor: '#0f172a',
              ...(align === 'right' ? { right: 10 } : align === 'left' ? { left: 10 } : { alignSelf: 'center' }),
            }}
          />
        </View>
      )}
    </View>
  );
}

export default function FacturasRecibidasScreen() {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 1024;
  const isMobile = !isDesktop;

  const cachedFacturas = ModuleCache.get<FacturaRecibida[]>('facturas_recibidas');
  const [loading, setLoading] = useState(() => !cachedFacturas);
  const [refreshing, setRefreshing] = useState(false);
  const [facturas, setFacturas] = useState<FacturaRecibida[]>(() => cachedFacturas || []);
  const [satSolicitudes, setSatSolicitudes] = useState<SatSolicitud[]>([]);
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPeriodo, setFilterPeriodo] = useState<'mes_actual' | 'mes_anterior' | 'todos'>('todos');
  const [filterEstado, setFilterEstado] = useState<'todos' | 'VIGENTE' | 'CANCELADO'>('todos');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modales
  const [selectedFactura, setSelectedFactura] = useState<FacturaRecibida | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showSolicitudesModal, setShowSolicitudesModal] = useState(false);
  const [verifyingSolId, setVerifyingSolId] = useState<string | null>(null);
  const [syncPeriodType, setSyncPeriodType] = useState<'30_dias' | 'anio_actual' | 'custom'>('30_dias');
  const [customFechaInicio, setCustomFechaInicio] = useState('');
  const [customFechaFin, setCustomFechaFin] = useState('');
  const [xmlInputText, setXmlInputText] = useState('');
  const [importingXml, setImportingXml] = useState(false);
  const [syncingSat, setSyncingSat] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [periodoMenuOpen, setPeriodoMenuOpen] = useState(false);
  const [satMenuOpen, setSatMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const [tableMissing, setTableMissing] = useState(false);

  useEffect(() => {
    fetchFacturas();
    fetchSatSolicitudes();
    fetchSyncStatus();
  }, []);

  const fetchSyncStatus = async () => {
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/facturas-recibidas/sync-status`, { headers });
      if (res.ok) {
        const json = await res.json();
        if (json.status) {
          setSyncStatus(json.status);
        }
      }
    } catch {
      // Ignorar fallo silencioso
    }
  };

  const fetchFacturas = async (silent = false) => {
    try {
      if (!silent && !ModuleCache.has('facturas_recibidas')) {
        setLoading(true);
      }
      setTableMissing(false);
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/facturas-recibidas`, { headers });
      if (!res.ok) {
        throw new Error('Error de red al cargar facturas recibidas');
      }
      const json = await res.json();
      
      if (json.tableMissing) {
        setTableMissing(true);
      } else if (json.facturas) {
        ModuleCache.set('facturas_recibidas', json.facturas);
        setFacturas(json.facturas);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchSatSolicitudes = async () => {
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/facturas-recibidas/sat-solicitudes`, { headers });
      if (res.ok) {
        const json = await res.json();
        if (json.solicitudes) {
          setSatSolicitudes(json.solicitudes);
        }
      }
    } catch (err) {
      console.error('Error fetching SAT solicitudes:', err);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchFacturas();
    fetchSatSolicitudes();
    fetchSyncStatus();
  };

  // Filtrado de datos
  const filteredFacturas = useMemo(() => {
    return facturas.filter((f) => {
      // Filtro de Texto (Nombre emisor, RFC, UUID)
      const q = searchQuery.toLowerCase().trim();
      const matchText =
        !q ||
        (f.nombre_emisor || '').toLowerCase().includes(q) ||
        (f.rfc_emisor || '').toLowerCase().includes(q) ||
        (f.uuid || '').toLowerCase().includes(q);

      // Filtro de Estatus
      const matchEstado = filterEstado === 'todos' || f.estado_sat === filterEstado;

      // Filtro de Período
      let matchPeriodo = true;
      if (filterPeriodo !== 'todos') {
        const fecha = new Date(f.fecha_emision);
        const hoy = new Date();
        const yearHoy = hoy.getFullYear();
        const monthHoy = hoy.getMonth();

        if (filterPeriodo === 'mes_actual') {
          matchPeriodo = fecha.getFullYear() === yearHoy && fecha.getMonth() === monthHoy;
        } else if (filterPeriodo === 'mes_anterior') {
          const prevMonth = monthHoy === 0 ? 11 : monthHoy - 1;
          const prevYear = monthHoy === 0 ? yearHoy - 1 : yearHoy;
          matchPeriodo = fecha.getFullYear() === prevYear && fecha.getMonth() === prevMonth;
        }
      }

      return matchText && matchEstado && matchPeriodo;
    });
  }, [facturas, searchQuery, filterEstado, filterPeriodo]);

  // Paginación
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterEstado, filterPeriodo]);

  const totalPages = Math.ceil(filteredFacturas.length / pageSize) || 1;
  const paginatedFacturas = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredFacturas.slice(start, start + pageSize);
  }, [filteredFacturas, currentPage, pageSize]);

  // Cálculos de Resumen KPI (bucle único de alto rendimiento)
  const kpis = useMemo(() => {
    let totalMonto = 0;
    const countTotal = filteredFacturas.length;
    let countVigentes = 0;
    let countCanceladas = 0;

    for (let i = 0; i < countTotal; i++) {
      const f = filteredFacturas[i];
      if (f.estado_sat === 'CANCELADO') {
        countCanceladas++;
      } else {
        countVigentes++;
        totalMonto += Number(f.total || 0);
      }
    }

    return { totalMonto, countTotal, countVigentes, countCanceladas };
  }, [filteredFacturas]);

  // Importación Manual de XML CFDI
  const handleImportXml = async () => {
    if (!xmlInputText.trim()) {
      showAlert('Atención', 'Por favor pega o ingresa el contenido XML de la factura.');
      return;
    }

    try {
      setImportingXml(true);
      const parsed = parseCfdiXml(xmlInputText);

      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/facturas-recibidas/import`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ parsed })
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Error al importar XML en el servidor');
      }

      showAlert('Éxito', `Factura de ${parsed.nombreEmisor} ($${parsed.total.toFixed(2)}) importada correctamente.`);
      setShowImportModal(false);
      setXmlInputText('');
      fetchFacturas();
    } catch (err: any) {
      showAlert('Error al procesar XML', err.message || 'No se pudo leer el XML proporcionado.');
    } finally {
      setImportingXml(false);
    }
  };

  // Sincronización SAT WebService Directo
  const handleSyncSat = async (overrideOptions?: { action?: string; fecha_inicio?: string; fecha_fin?: string }) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`\n======================================================`);
    console.log(`🚀 [SAT SYNC ${timestamp}] Botón 'Sincronizar SAT' presionado.`);
    console.log(`📡 [SAT SYNC] Iniciando llamada a Edge Function 'sync-facturas-recibidas'...`);

    try {
      setSyncingSat(true);

      const payload: any = { action: overrideOptions?.action || 'sync' };
      if (overrideOptions?.fecha_inicio) payload.fecha_inicio = overrideOptions.fecha_inicio;
      if (overrideOptions?.fecha_fin) payload.fecha_fin = overrideOptions.fecha_fin;

      const startTime = Date.now();
      console.log(`📤 [SAT SYNC] Invocando función con payload:`, payload);

      const { data, error } = await supabase.functions.invoke('sync-facturas-recibidas', {
        body: payload
      });

      const elapsed = Date.now() - startTime;
      console.log(`⏱️ [SAT SYNC] Respuesta recibida tras ${elapsed}ms`);

      if (error) {
        console.error(`❌ [SAT SYNC] Error retornado por Supabase Functions:`, error);
        
        let errorDetail = error.message || 'Error desconocido';
        try {
          if ((error as any).context) {
            const contextText = await (error as any).context.text();
            console.error(`📄 [SAT SYNC] Cuerpo del error HTTP:`, contextText);
            errorDetail = contextText || errorDetail;
          }
        } catch {
          // Ignorar error al leer contexto
        }

        let userFriendlyMsg = `Hubo un problema al conectar con el servicio de sincronización.\n\nDetalle: ${errorDetail}`;
        if (errorDetail.includes('IDLE_TIMEOUT') || errorDetail.includes('timeout')) {
          userFriendlyMsg = 'El servidor del SAT tardó más de 2.5 minutos en responder debido a saturación en sus servicios web.\n\nTe sugerimos reintentar en unos momentos o subir tus archivos al instante usando el botón "+ Importar XML".';
        }

        showAlert(
          'Tiempo de Espera del SAT Agotado',
          userFriendlyMsg
        );
        return;
      }

      console.log(`📥 [SAT SYNC] Datos recibidos con éxito:`, JSON.stringify(data, null, 2));

      if (data?.missingCredentials) {
        console.warn(`⚠️ [SAT SYNC] Faltan credenciales de e.firma en Supabase Secrets.`);
        showAlert(
          'Configuración SAT Requerida',
          'Para que el sistema descargue las facturas automáticamente del SAT, agrega las variables SAT_RFC, SAT_CER_B64, SAT_KEY_B64 y SAT_PASSWORD en los Secrets de Supabase.\n\nMientras tanto, puedes importar tus XMLs directamente usando el botón "+ Importar XML".'
        );
      } else if (data?.success) {
        const res = data.resumen;
        let msg = data.message || 'Sincronización procesada.';
        if (res?.facturasProcesadas > 0) {
          msg = `¡Se descargaron y procesaron ${res.facturasProcesadas} facturas del SAT con éxito!`;
        } else if (res?.nuevaSolicitudCreada) {
          msg = `Solicitud enviada al SAT con éxito (ID: ${res.idNuevaSolicitud}). El SAT tarda entre 10 y 60 minutos en empaquetar los XMLs. El servicio automático los descargará en cuanto estén listos.`;
        }
        console.log(`✅ [SAT SYNC] Sincronización finalizada exitosamente:`, msg);
        showAlert('Sincronización SAT', msg);
        setShowSyncModal(false);
        fetchFacturas();
        fetchSatSolicitudes();
        fetchSyncStatus();
      } else {
        console.warn(`⚠️ [SAT SYNC] La función no reportó éxito:`, data?.message || data?.error);
        showAlert('Aviso SAT', data?.message || data?.error || 'No se pudo completar la sincronización.');
      }
    } catch (err: any) {
      console.error(`💥 [SAT SYNC] Excepción no controlada en cliente:`, err);
      showAlert(
        'Aviso de Sincronización',
        `No se pudo contactar con la función en Supabase.\nDetalle: ${err?.message || 'Error de red o conexión'}.\n\nPuedes importar tus facturas manualmente con "+ Importar XML" mientras tanto.`
      );
    } finally {
      setSyncingSat(false);
      console.log(`🏁 [SAT SYNC] Proceso de sincronización terminado.`);
      console.log(`======================================================\n`);
    }
  };

  const handleExecuteSyncModal = () => {
    if (syncPeriodType === '30_dias') {
      handleSyncSat({ action: 'sync' });
    } else if (syncPeriodType === 'anio_actual') {
      const currentYear = new Date().getFullYear();
      handleSyncSat({
        action: 'solicitar',
        fecha_inicio: `${currentYear}-01-01T00:00:00`,
        fecha_fin: new Date().toISOString().substring(0, 10) + 'T23:59:59'
      });
    } else if (syncPeriodType === 'custom') {
      if (!customFechaInicio.trim()) {
        showAlert('Atención', 'Por favor ingresa la fecha de inicio en formato AAAA-MM-DD (ej. 2026-01-01)');
        return;
      }
      const fInicio = customFechaInicio.includes('T') ? customFechaInicio : `${customFechaInicio.trim()}T00:00:00`;
      const fFin = customFechaFin.trim() 
        ? (customFechaFin.includes('T') ? customFechaFin : `${customFechaFin.trim()}T23:59:59`)
        : (new Date().toISOString().substring(0, 10) + 'T23:59:59');

      handleSyncSat({
        action: 'solicitar',
        fecha_inicio: fInicio,
        fecha_fin: fFin
      });
    }
  };

  const handleVerifySingleSolicitud = async (solicitud: SatSolicitud) => {
    try {
      setVerifyingSolId(solicitud.id);
      await handleSyncSat({ action: 'sync' });
      await fetchSatSolicitudes();
    } finally {
      setVerifyingSolId(null);
    }
  };

  const handleOpenXmlUrl = (url?: string) => {
    if (!url) {
      showAlert('Aviso', 'Esta factura no tiene archivo XML en almacenamiento.');
      return;
    }
    Linking.openURL(url).catch(() => {
      showAlert('Error', 'No se pudo abrir el enlace al archivo XML.');
    });
  };

  const [exportingPdfId, setExportingPdfId] = useState<string | null>(null);

  const handleExportPdf = async (factura: FacturaRecibida) => {
    try {
      setExportingPdfId(factura.id);
      
      // Obtener factura completa (con conceptos_json) si no la tenemos en memoria
      let facturaCompleta = factura;
      if (!factura.xml_url && !factura.conceptos_json) {
        try {
          const headers = await getApiHeaders();
          const res = await fetch(`${getApiUrl()}/api/facturas-recibidas/${factura.id}`, { headers });
          if (res.ok) {
            const data = await res.json();
            if (data.factura) {
              facturaCompleta = data.factura;
            }
          }
        } catch (e) {
          console.warn('No se pudo obtener el detalle de la factura:', e);
        }
      }

      await exportFacturaCfdiToPdf({ factura: facturaCompleta });
    } catch (err: any) {
      console.error('Error exportando PDF:', err);
      showAlert('Error al generar PDF', err.message || 'No se pudo generar el documento PDF de la factura.');
    } finally {
      setExportingPdfId(null);
    }
  };

  const handleExportWithFormat = async (format: 'xlsx' | 'csv' = 'xlsx') => {
    setExportMenuOpen(false);
    const listToExport = filteredFacturas.length > 0 ? filteredFacturas : facturas;
    if (listToExport.length === 0) {
      showAlert('Aviso', 'No hay facturas recibidas disponibles para exportar.');
      return;
    }

    try {
      setExportingExcel(true);
      const hoyStr = new Date().toISOString().substring(0, 10);
      let sufijo = filterPeriodo === 'mes_actual' ? 'mes_actual' : filterPeriodo === 'mes_anterior' ? 'mes_anterior' : hoyStr;
      if (filterEstado !== 'todos') {
        sufijo += `_${filterEstado.toLowerCase()}`;
      }
      const filename = `facturas_recibidas_${sufijo}.${format}`;

      await exportFacturasRecibidasToExcel(listToExport, {
        filename,
        format,
        sheetName: 'Facturas Recibidas',
      });

      if (Platform.OS === 'web') {
        showAlert('Descarga Exitosa', `Se ha generado el archivo ${format.toUpperCase()} con ${listToExport.length} facturas.`);
      }
    } catch (err: any) {
      console.error('Error exportando:', err);
      showAlert(`Error al exportar ${format.toUpperCase()}`, err.message || 'No se pudo generar el archivo.');
    } finally {
      setExportingExcel(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount || 0);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  // SUB-HEADER BAR (EXCLUSIVO ESCRITORIO WEB)
  const renderDesktopToolbar = () => (
    <View
      style={[
        styles.desktopToolbar,
        {
          backgroundColor: themeColors.backgroundElement,
          borderBottomColor: themeColors.border,
          position: 'relative',
          zIndex: 500,
          elevation: 10,
        },
      ]}
    >
      <View style={[styles.desktopToolbarLeft, { position: 'relative', zIndex: periodoMenuOpen ? 501 : 10 }]}>
        <View style={[styles.calculatorCircle, { backgroundColor: '#0284c7' }]}>
          <Ionicons name="receipt-outline" size={16} color="#fff" />
        </View>
        <Text style={[styles.desktopModuleTitle, { color: themeColors.text }]}>Facturas Recibidas</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{filteredFacturas.length}</Text>
        </View>
        <View style={[styles.desktopSearchContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
          <Ionicons name="search" size={15} color={themeColors.textSecondary} style={{ marginRight: 2 }} />
          <TextInput
            style={[styles.desktopSearchInput, { color: themeColors.text }]}
            placeholder="Buscar proveedor, RFC o UUID..."
            placeholderTextColor={themeColors.textSecondary + '80'}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 2 }}>
              <Ionicons name="close-circle" size={14} color={themeColors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Segmented Control Unificado de Estado SAT */}
        <View style={[styles.segmentedWrapper, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
          {[
            { id: 'todos', label: 'Todas' },
            { id: 'VIGENTE', label: 'Vigentes' },
            { id: 'CANCELADO', label: 'Canceladas' },
          ].map((est) => {
            const isActive = filterEstado === est.id;
            return (
              <TouchableOpacity
                key={est.id}
                onPress={() => setFilterEstado(est.id as any)}
                style={[
                  styles.segmentedBtn,
                  isActive && { backgroundColor: themeColors.accent },
                ]}
              >
                <Text
                  style={[
                    styles.segmentedBtnText,
                    { color: isActive ? '#fff' : themeColors.textSecondary },
                  ]}
                >
                  {est.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Selector de Período (Dropdown Compacto) */}
        <View style={{ position: 'relative', zIndex: periodoMenuOpen ? 502 : 10 }}>
          <TouchableOpacity
            style={[styles.dropdownTriggerBtn, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}
            onPress={() => {
              setPeriodoMenuOpen(!periodoMenuOpen);
              setSatMenuOpen(false);
              setExportMenuOpen(false);
            }}
          >
            <Ionicons name="calendar-outline" size={14} color={themeColors.accent} />
            <Text style={[styles.dropdownTriggerText, { color: themeColors.text }]}>
              {filterPeriodo === 'mes_actual' ? 'Mes Actual' : filterPeriodo === 'mes_anterior' ? 'Mes Anterior' : 'Todo el año'}
            </Text>
            <Ionicons name="chevron-down" size={12} color={themeColors.textSecondary} />
          </TouchableOpacity>

          {periodoMenuOpen && (
            <>
              <Pressable style={styles.dropdownBackdrop} onPress={() => setPeriodoMenuOpen(false)} />
              <View style={[styles.dropdownMenuBox, { left: 0, right: 'auto', backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                {[
                  { id: 'mes_actual', label: 'Mes Actual' },
                  { id: 'mes_anterior', label: 'Mes Anterior' },
                  { id: 'todos', label: 'Todo el año' },
                ].map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.dropdownMenuItem,
                      filterPeriodo === item.id && { backgroundColor: themeColors.accent + '15' },
                    ]}
                    onPress={() => {
                      setFilterPeriodo(item.id as any);
                      setPeriodoMenuOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.dropdownMenuItemText,
                        { color: filterPeriodo === item.id ? themeColors.accent : themeColors.text, fontWeight: filterPeriodo === item.id ? '700' : '500' },
                      ]}
                    >
                      {item.label}
                    </Text>
                    {filterPeriodo === item.id && <Ionicons name="checkmark" size={14} color={themeColors.accent} />}
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </View>
      </View>

      <View style={[styles.desktopToolbarRight, { position: 'relative', zIndex: (exportMenuOpen || satMenuOpen) ? 501 : 10 }]}>
        {/* Menú de Exportar (Excel / CSV) */}
        <View style={{ position: 'relative', zIndex: exportMenuOpen ? 502 : 10 }}>
          <TouchableOpacity
            style={[styles.actionBtnOutline, { backgroundColor: '#16a34a15', borderColor: '#16a34a50' }]}
            onPress={() => {
              setExportMenuOpen(!exportMenuOpen);
              setSatMenuOpen(false);
              setPeriodoMenuOpen(false);
            }}
            disabled={exportingExcel}
          >
            {exportingExcel ? (
              <ActivityIndicator size="small" color="#16a34a" />
            ) : (
              <>
                <Ionicons name="document-text-outline" size={15} color="#16a34a" />
                <Text style={[styles.actionBtnOutlineText, { color: '#16a34a' }]}>Exportar</Text>
                <Ionicons name="chevron-down" size={12} color="#16a34a" />
              </>
            )}
          </TouchableOpacity>

          {exportMenuOpen && (
            <>
              <Pressable style={styles.dropdownBackdrop} onPress={() => setExportMenuOpen(false)} />
              <View style={[styles.dropdownMenuBox, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                <TouchableOpacity
                  style={styles.dropdownMenuItem}
                  onPress={() => handleExportWithFormat('xlsx')}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="grid-outline" size={15} color="#16a34a" />
                    <Text style={[styles.dropdownMenuItemText, { color: themeColors.text }]}>Excel (.xlsx)</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.dropdownMenuItem}
                  onPress={() => handleExportWithFormat('csv')}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="document-outline" size={15} color="#0284c7" />
                    <Text style={[styles.dropdownMenuItemText, { color: themeColors.text }]}>CSV (.csv)</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* Menú de Opciones SAT (Sincronizar / Solicitudes) */}
        <View style={{ position: 'relative', zIndex: satMenuOpen ? 502 : 10 }}>
          <TouchableOpacity
            style={[styles.actionBtnOutline, { backgroundColor: '#10ac8415', borderColor: '#10ac8450' }]}
            onPress={() => {
              setSatMenuOpen(!satMenuOpen);
              setExportMenuOpen(false);
              setPeriodoMenuOpen(false);
            }}
            disabled={syncingSat}
          >
            {syncingSat ? (
              <ActivityIndicator size="small" color="#10ac84" />
            ) : (
              <>
                <Ionicons name="sync-outline" size={15} color="#10ac84" />
                <Text style={[styles.actionBtnOutlineText, { color: '#10ac84' }]}>SAT</Text>
                <Ionicons name="chevron-down" size={12} color="#10ac84" />
              </>
            )}
          </TouchableOpacity>

          {satMenuOpen && (
            <>
              <Pressable style={styles.dropdownBackdrop} onPress={() => setSatMenuOpen(false)} />
              <View style={[styles.dropdownMenuBox, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, minWidth: 200 }]}>
                <TouchableOpacity
                  style={styles.dropdownMenuItem}
                  onPress={() => {
                    setSatMenuOpen(false);
                    setShowSyncModal(true);
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="cloud-download-outline" size={16} color="#10ac84" />
                    <Text style={[styles.dropdownMenuItemText, { color: themeColors.text }]}>Sincronizar SAT</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.dropdownMenuItem}
                  onPress={() => {
                    setSatMenuOpen(false);
                    fetchSatSolicitudes();
                    setShowSolicitudesModal(true);
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="list-outline" size={16} color="#3b5998" />
                    <Text style={[styles.dropdownMenuItemText, { color: themeColors.text }]}>Estado de Solicitudes</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* Botón Principal: Importar XML */}
        <TouchableOpacity
          style={[styles.addToolbarBtn, { backgroundColor: themeColors.accent }]}
          onPress={() => setShowImportModal(true)}
        >
          <Ionicons name="add-circle-outline" size={16} color="#fff" />
          <Text style={styles.addToolbarBtnText}>Importar XML</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // TABLA DE FACTURAS RECIBIDAS DE ALTA FIDELIDAD (WEB/DESKTOP)
  const renderDesktopTable = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ width: '100%' }}>
      <View style={[styles.tableContainer, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
        {/* Encabezado de la Tabla */}
        <View style={[styles.tableHeaderRow, { backgroundColor: themeColors.background, borderBottomColor: themeColors.border }]}>
          <Text style={[styles.tableHeaderCell, { width: '10%', textAlign: 'center', color: themeColors.text }]}>Folio / Serie</Text>
          <Text style={[styles.tableHeaderCell, { width: '10%', textAlign: 'center', color: themeColors.text }]}>Fecha</Text>
          <Text style={[styles.tableHeaderCell, { width: '24%', textAlign: 'left', paddingHorizontal: 6, color: themeColors.text }]}>Proveedor / Emisor</Text>
          <Text style={[styles.tableHeaderCell, { width: '18%', textAlign: 'left', paddingHorizontal: 6, color: themeColors.text }]}>UUID Fiscal</Text>
          <Text style={[styles.tableHeaderCell, { width: '7%', textAlign: 'center', color: themeColors.text }]}>Moneda</Text>
          <Text style={[styles.tableHeaderCell, { width: '11%', textAlign: 'center', color: themeColors.text }]}>Estado SAT</Text>
          <Text style={[styles.tableHeaderCell, { width: '10%', textAlign: 'right', paddingRight: 8, color: themeColors.text }]}>Total</Text>
          <Text style={[styles.tableHeaderCell, { width: '10%', textAlign: 'center', color: themeColors.text }]}>Acciones</Text>
        </View>

        {/* Filas Paginadas de Alto Rendimiento */}
        {paginatedFacturas.map((f) => {
          const isCanceled = f.estado_sat === 'CANCELADO';
          const folioStr = f.folio ? (f.serie ? `${f.serie}-${f.folio}` : f.folio) : (f.serie || (f.uuid ? f.uuid.substring(0, 8).toUpperCase() : '--'));

          return (
            <Pressable
              key={f.id}
              onPress={() => {
                setSelectedFactura(f);
                setShowDetailModal(true);
              }}
              style={({ hovered }: any) => [
                styles.tableRow,
                { borderBottomColor: themeColors.border },
                hovered && { backgroundColor: (themeColors as any).backgroundSelected || '#0284c715' },
              ]}
            >
              {/* Folio / Serie */}
              <View style={{ width: '10%', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#0284c7' }}>
                  {folioStr}
                </Text>
              </View>

              {/* Fecha */}
              <Text style={[styles.tableCell, { width: '10%', textAlign: 'center', color: themeColors.textSecondary }]}>
                {formatDate(f.fecha_emision)}
              </Text>

              {/* Proveedor / Emisor */}
              <View style={{ width: '24%', paddingHorizontal: 6, justifyContent: 'center' }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.text }} numberOfLines={1}>
                  {f.nombre_emisor || 'Proveedor General'}
                </Text>
                <Text style={{ fontSize: 10, color: themeColors.textSecondary }} numberOfLines={1}>
                  RFC: {f.rfc_emisor || '--'}
                </Text>
              </View>

              {/* UUID Fiscal */}
              <View style={{ width: '18%', paddingHorizontal: 6, justifyContent: 'center' }}>
                <Text
                  style={{
                    fontSize: 10.5,
                    color: themeColors.textSecondary,
                    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
                  }}
                  numberOfLines={1}
                >
                  {f.uuid || '--'}
                </Text>
              </View>

              {/* Moneda */}
              <Text style={[styles.tableCell, { width: '7%', textAlign: 'center', color: themeColors.textSecondary }]}>
                {f.moneda || 'MXN'}
              </Text>

              {/* Estado SAT */}
              <View style={{ width: '11%', alignItems: 'center', justifyContent: 'center' }}>
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: isCanceled ? '#ef444418' : '#10b98118',
                      borderColor: isCanceled ? '#ef444450' : '#10b98150',
                      borderWidth: 1,
                      paddingVertical: 2,
                      paddingHorizontal: 8,
                      borderRadius: 10,
                      marginTop: 0,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '800',
                      color: isCanceled ? '#ef4444' : '#10b981',
                    }}
                  >
                    {f.estado_sat || 'VIGENTE'}
                  </Text>
                </View>
              </View>

              {/* Total */}
              <View style={{ width: '10%', alignItems: 'flex-end', paddingRight: 8, justifyContent: 'center' }}>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: themeColors.text }}>
                  {formatCurrency(f.total)}
                </Text>
              </View>

              {/* Acciones */}
              <View style={{ width: '10%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <TableTooltipButton
                  icon="eye-outline"
                  color="#0284c7"
                  bgColor="#0284c715"
                  borderColor="#0284c750"
                  tooltip="Ver Detalle"
                  onPress={() => {
                    setSelectedFactura(f);
                    setShowDetailModal(true);
                  }}
                />
                <TableTooltipButton
                  icon="document-text-outline"
                  color="#ef4444"
                  bgColor="#ef444415"
                  borderColor="#ef444450"
                  tooltip="Descargar PDF SAT"
                  onPress={() => handleExportPdf(f)}
                  disabled={exportingPdfId === f.id}
                  align={f.xml_url ? 'center' : 'right'}
                />
                {f.xml_url ? (
                  <TableTooltipButton
                    icon="code-download-outline"
                    color="#10b981"
                    bgColor="#10b98115"
                    borderColor="#10b98150"
                    tooltip="Descargar XML"
                    align="right"
                    onPress={() => handleOpenXmlUrl(f.xml_url)}
                  />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {isDesktop && renderDesktopToolbar()}

      <ScrollView
        style={{ flex: 1, zIndex: 1 }}
        contentContainerStyle={[styles.scrollContent, isDesktop && { paddingHorizontal: 20, paddingTop: 14 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={themeColors.accent} />}
      >
        {!isDesktop && (
          /* Cabecera y Título Móvil */
          <View style={styles.headerRow}>
            <View style={{ flex: 1, minWidth: 260 }}>
              <Text style={[styles.title, { color: themeColors.text }]}>Facturas Recibidas</Text>
              <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
                Comprobantes fiscales (CFDI 4.0) emitidos por proveedores hacia la empresa
              </Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#3b5998' }]}
                onPress={() => {
                  fetchSatSolicitudes();
                  setShowSolicitudesModal(true);
                }}
              >
                <Ionicons name="list-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.actionBtnText}>Estado de Solicitudes</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: themeColors.accent }]}
                onPress={() => setShowImportModal(true)}
              >
                <Ionicons name="add-circle-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.actionBtnText}>Importar XML</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#16a34a' }]}
                onPress={() => handleExportWithFormat('xlsx')}
                disabled={exportingExcel}
              >
                {exportingExcel ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="document-text-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.actionBtnText}>Descargar Excel</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#10ac84' }]}
                onPress={() => setShowSyncModal(true)}
                disabled={syncingSat}
              >
                {syncingSat ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="sync-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.actionBtnText}>Sincronizar SAT</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Barra Informativa de Sincronización Automática SAT */}
        <View style={[styles.autoSyncBar, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, flexWrap: 'wrap', gap: 8 }}>
            <View style={[styles.syncStatusDot, { backgroundColor: syncStatus?.lastStatus === 'error' ? '#ff6b6b' : '#1dd1a1' }]} />
            <Text style={[styles.autoSyncText, { color: themeColors.text }]}>
              Sincronización Automática: <Text style={{ fontWeight: 'bold', color: '#10ac84' }}>Activa</Text> (cada 30 min)
            </Text>
            {syncStatus?.lastSyncTime && (
              <Text style={[styles.autoSyncSubText, { color: themeColors.textSecondary }]}>
                • Última revisión: {formatDate(syncStatus.lastSyncTime)} ({new Date(syncStatus.lastSyncTime).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })})
              </Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              onPress={() => {
                fetchSatSolicitudes();
                setShowSolicitudesModal(true);
              }}
              style={styles.viewSolLinkBtn}
            >
              <Text style={[styles.viewSolLinkText, { color: themeColors.accent }]}>Ver historial</Text>
              <Ionicons name="chevron-forward" size={14} color={themeColors.accent} />
            </TouchableOpacity>
            <TouchableOpacity onPress={fetchSyncStatus} style={{ padding: 4 }}>
              <Ionicons name="refresh" size={16} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Banner de Solicitudes SAT en Proceso */}
        {satSolicitudes.filter(s => s.estado_sat === 'PENDIENTE' || s.estado_sat === 'EN_PROCESO').length > 0 && (
          <TouchableOpacity
            style={[styles.satBanner, { backgroundColor: '#54a0ff15', borderColor: '#54a0ff' }]}
            onPress={() => {
              fetchSatSolicitudes();
              setShowSolicitudesModal(true);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="time-outline" size={22} color="#54a0ff" style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.satBannerTitle, { color: '#2e86de' }]}>
                Descarga en proceso en el SAT ({satSolicitudes.filter(s => s.estado_sat === 'PENDIENTE' || s.estado_sat === 'EN_PROCESO').length} solicitud{satSolicitudes.filter(s => s.estado_sat === 'PENDIENTE' || s.estado_sat === 'EN_PROCESO').length > 1 ? 'es' : ''})
              </Text>
              <Text style={[styles.satBannerSub, { color: themeColors.textSecondary }]}>
                El SAT está empaquetando los comprobantes. Toca aquí para ver el estado detallado o consultar manualmente.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#2e86de" />
          </TouchableOpacity>
        )}

        {/* KPI Cards */}
        {loading ? (
          <FacturasKpiGridSkeleton />
        ) : (
          <View style={styles.kpiGrid}>
            <View style={[styles.kpiCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
              <View style={[styles.kpiIcon, { backgroundColor: '#54a0ff15' }]}>
                <Ionicons name="cash-outline" size={24} color="#54a0ff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.kpiLabel, { color: themeColors.textSecondary }]}>Monto Total Recibido</Text>
                <Text style={[styles.kpiValue, { color: themeColors.text }]}>{formatCurrency(kpis.totalMonto)}</Text>
              </View>
            </View>

            <View style={[styles.kpiCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
              <View style={[styles.kpiIcon, { backgroundColor: '#1dd1a115' }]}>
                <Ionicons name="document-text-outline" size={24} color="#1dd1a1" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.kpiLabel, { color: themeColors.textSecondary }]}>Facturas Vigentes</Text>
                <Text style={[styles.kpiValue, { color: themeColors.text }]}>{kpis.countVigentes} de {kpis.countTotal}</Text>
              </View>
            </View>

            <View style={[styles.kpiCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
              <View style={[styles.kpiIcon, { backgroundColor: '#ff6b6b15' }]}>
                <Ionicons name="close-circle-outline" size={24} color="#ff6b6b" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.kpiLabel, { color: themeColors.textSecondary }]}>Canceladas</Text>
                <Text style={[styles.kpiValue, { color: themeColors.text }]}>{kpis.countCanceladas}</Text>
              </View>
            </View>
          </View>
        )}

        {!isDesktop && (
          /* Buscador y Filtros Móvil */
          <View style={[styles.filtersContainer, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <View style={[styles.searchBox, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
              <Ionicons name="search-outline" size={18} color={themeColors.textSecondary} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.searchInput, { color: themeColors.text }]}
                placeholder="Buscar por Proveedor, RFC o UUID..."
                placeholderTextColor={themeColors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery !== '' && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color={themeColors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
              <View style={styles.pillsRow}>
                {/* Filtro Período */}
                <TouchableOpacity
                  style={[styles.pill, filterPeriodo === 'mes_actual' && { backgroundColor: themeColors.accent }]}
                  onPress={() => setFilterPeriodo('mes_actual')}
                >
                  <Text style={[styles.pillText, { color: filterPeriodo === 'mes_actual' ? '#fff' : themeColors.text }]}>Mes Actual</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.pill, filterPeriodo === 'mes_anterior' && { backgroundColor: themeColors.accent }]}
                  onPress={() => setFilterPeriodo('mes_anterior')}
                >
                  <Text style={[styles.pillText, { color: filterPeriodo === 'mes_anterior' ? '#fff' : themeColors.text }]}>Mes Anterior</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.pill, filterPeriodo === 'todos' && { backgroundColor: themeColors.accent }]}
                  onPress={() => setFilterPeriodo('todos')}
                >
                  <Text style={[styles.pillText, { color: filterPeriodo === 'todos' ? '#fff' : themeColors.text }]}>Todos los períodos</Text>
                </TouchableOpacity>

                <View style={styles.divider} />

                {/* Filtro Estatus */}
                <TouchableOpacity
                  style={[styles.pill, filterEstado === 'todos' && { backgroundColor: themeColors.accent }]}
                  onPress={() => setFilterEstado('todos')}
                >
                  <Text style={[styles.pillText, { color: filterEstado === 'todos' ? '#fff' : themeColors.text }]}>Todos los estados</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.pill, filterEstado === 'VIGENTE' && { backgroundColor: '#1dd1a1' }]}
                  onPress={() => setFilterEstado('VIGENTE')}
                >
                  <Text style={[styles.pillText, { color: filterEstado === 'VIGENTE' ? '#fff' : themeColors.text }]}>Vigentes</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.pill, filterEstado === 'CANCELADO' && { backgroundColor: '#ff6b6b' }]}
                  onPress={() => setFilterEstado('CANCELADO')}
                >
                  <Text style={[styles.pillText, { color: filterEstado === 'CANCELADO' ? '#fff' : themeColors.text }]}>Canceladas</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        )}

        {/* Lista de Facturas */}
        {loading ? (
          <FacturasListSkeleton count={6} />
        ) : tableMissing ? (
          <View style={[styles.emptyContainer, { backgroundColor: themeColors.backgroundElement, borderColor: '#feca57' }]}>
            <Ionicons name="warning-outline" size={48} color="#feca57" />
            <Text style={[styles.emptyTitle, { color: themeColors.text }]}>Pendiente: Crear Tabla en Supabase</Text>
            <Text style={[styles.emptySubtitle, { color: themeColors.textSecondary }]}>
              Para activar el almacenamiento de facturas recibidas, ejecuta el archivo SQL <Text style={{ fontWeight: 'bold', color: themeColors.accent }}>BaseDatos_FacturasRecibidas.sql</Text> en el Editor SQL de tu panel de Supabase.
            </Text>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: themeColors.accent, marginTop: 16 }]}
              onPress={() => fetchFacturas()}
            >
              <Ionicons name="refresh-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.actionBtnText}>Reintentar Conexión</Text>
            </TouchableOpacity>
          </View>
        ) : filteredFacturas.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <Ionicons name="document-text-outline" size={48} color={themeColors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: themeColors.text }]}>No se encontraron facturas recibidas</Text>
            <Text style={[styles.emptySubtitle, { color: themeColors.textSecondary }]}>
              {searchQuery ? 'No se encontraron facturas con esa búsqueda.' : 'Utiliza el botón "Importar XML" para cargar facturas de proveedores o sincroniza directamente con el SAT.'}
            </Text>
          </View>
        ) : (
          <>
            {isDesktop ? (
              renderDesktopTable()
            ) : (
              <View style={styles.facturasList}>
                {paginatedFacturas.map((f) => (
                  <TouchableOpacity
                    key={f.id}
                    style={[styles.facturaCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                    onPress={() => {
                      setSelectedFactura(f);
                      setShowDetailModal(true);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.cardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.emisorName, { color: themeColors.text }]} numberOfLines={1}>
                          {f.nombre_emisor}
                        </Text>
                        <Text style={[styles.emisorRfc, { color: themeColors.textSecondary }]}>
                          RFC: {f.rfc_emisor} • {formatDate(f.fecha_emision)}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.facturaTotal, { color: themeColors.text }]}>
                          {formatCurrency(f.total)} {f.moneda}
                        </Text>
                        <View
                          style={[
                            styles.badge,
                            { backgroundColor: f.estado_sat === 'CANCELADO' ? '#ff6b6b20' : '#1dd1a120' }
                          ]}
                        >
                          <Text
                            style={[
                              styles.badgeText,
                              { color: f.estado_sat === 'CANCELADO' ? '#ff6b6b' : '#1dd1a1' }
                            ]}
                          >
                            {f.estado_sat}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View style={[styles.cardFooter, { borderTopColor: themeColors.border }]}>
                      <Text style={[styles.uuidText, { color: themeColors.textSecondary }]} numberOfLines={1}>
                        UUID: {f.uuid}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity
                          style={styles.cardPdfBtn}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            handleExportPdf(f);
                          }}
                          disabled={exportingPdfId === f.id}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          {exportingPdfId === f.id ? (
                            <ActivityIndicator size="small" color="#e74c3c" />
                          ) : (
                            <Ionicons name="document-text" size={18} color="#e74c3c" />
                          )}
                        </TouchableOpacity>
                        <Ionicons name="chevron-forward" size={16} color={themeColors.textSecondary} />
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {filteredFacturas.length > 0 && (
              <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filteredFacturas.length}
                itemsPerPage={pageSize}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={(newSize: number) => {
                  setPageSize(newSize);
                  setCurrentPage(1);
                }}
                itemsPerPageOptions={[20, 25, 50, 100]}
                isLoading={loading}
                style={{ marginTop: 14, marginBottom: 24 }}
              />
            )}
          </>
        )}
      </ScrollView>

      {/* Modal de Detalle de Factura */}
      <Modal statusBarTranslucent={true} visible={showDetailModal} animationType="slide" transparent={true} onRequestClose={() => setShowDetailModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: themeColors.backgroundElement }]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Detalle del Comprobante CFDI</Text>
                <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>Factura Recibida</Text>
              </View>
              <TouchableOpacity onPress={() => setShowDetailModal(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            {selectedFactura && (
              <ScrollView style={{ padding: 16 }}>
                {/* Botón principal de exportación a PDF */}
                <TouchableOpacity
                  style={[styles.pdfExportMainBtn, { backgroundColor: '#e74c3c' }]}
                  onPress={() => handleExportPdf(selectedFactura)}
                  disabled={exportingPdfId === selectedFactura.id}
                  activeOpacity={0.8}
                >
                  {exportingPdfId === selectedFactura.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="document-text-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                      <Text style={styles.pdfExportMainBtnText}>Descargar / Exportar Factura en PDF (Formato SAT)</Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Info General */}
                <View style={[styles.infoSection, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                  <Text style={[styles.sectionTitle, { color: themeColors.accent }]}>Emisor / Proveedor</Text>
                  <Text style={[styles.infoMain, { color: themeColors.text }]}>{selectedFactura.nombre_emisor}</Text>
                  <Text style={[styles.infoSub, { color: themeColors.textSecondary }]}>RFC: {selectedFactura.rfc_emisor}</Text>

                  <View style={styles.dividerLight} />

                  <Text style={[styles.sectionTitle, { color: themeColors.accent }]}>Datos Fiscales</Text>
                  <Text style={[styles.infoSub, { color: themeColors.textSecondary }]}>
                    Fecha Emisión: {formatDate(selectedFactura.fecha_emision)}
                  </Text>
                  <Text style={[styles.infoSub, { color: themeColors.textSecondary }]}>Tipo Comprobante: {selectedFactura.tipo_comprobante}</Text>
                  <Text style={[styles.infoSub, { color: themeColors.textSecondary }]}>UUID: {selectedFactura.uuid}</Text>
                  {selectedFactura.xml_url && (
                    <TouchableOpacity
                      style={styles.xmlLinkBtn}
                      onPress={() => handleOpenXmlUrl(selectedFactura.xml_url)}
                    >
                      <Ionicons name="download-outline" size={16} color={themeColors.accent} style={{ marginRight: 6 }} />
                      <Text style={[styles.xmlLinkText, { color: themeColors.accent }]}>Ver / Descargar XML Original</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Desglose de Montos */}
                <View style={[styles.infoSection, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                  <Text style={[styles.sectionTitle, { color: themeColors.accent }]}>Resumen Financiero</Text>
                  <View style={styles.montoRow}>
                    <Text style={{ color: themeColors.textSecondary }}>Subtotal:</Text>
                    <Text style={{ color: themeColors.text, fontWeight: '600' }}>{formatCurrency(selectedFactura.subtotal)}</Text>
                  </View>
                  {selectedFactura.descuento > 0 && (
                    <View style={styles.montoRow}>
                      <Text style={{ color: themeColors.textSecondary }}>Descuento:</Text>
                      <Text style={{ color: '#ff6b6b', fontWeight: '600' }}>-{formatCurrency(selectedFactura.descuento)}</Text>
                    </View>
                  )}
                  <View style={styles.montoRow}>
                    <Text style={{ color: themeColors.textSecondary }}>IVA (16%):</Text>
                    <Text style={{ color: themeColors.text, fontWeight: '600' }}>{formatCurrency(selectedFactura.iva)}</Text>
                  </View>
                  {selectedFactura.retencion_isr > 0 && (
                    <View style={styles.montoRow}>
                      <Text style={{ color: themeColors.textSecondary }}>Retención ISR:</Text>
                      <Text style={{ color: '#ff6b6b', fontWeight: '600' }}>-{formatCurrency(selectedFactura.retencion_isr)}</Text>
                    </View>
                  )}
                  {selectedFactura.retencion_iva > 0 && (
                    <View style={styles.montoRow}>
                      <Text style={{ color: themeColors.textSecondary }}>Retención IVA:</Text>
                      <Text style={{ color: '#ff6b6b', fontWeight: '600' }}>-{formatCurrency(selectedFactura.retencion_iva)}</Text>
                    </View>
                  )}
                  <View style={[styles.montoRow, { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: themeColors.border }]}>
                    <Text style={{ color: themeColors.text, fontWeight: 'bold', fontSize: 16 }}>TOTAL:</Text>
                    <Text style={{ color: themeColors.accent, fontWeight: 'bold', fontSize: 18 }}>
                      {formatCurrency(selectedFactura.total)} {selectedFactura.moneda}
                    </Text>
                  </View>
                </View>

                {/* Conceptos / Partidas */}
                {selectedFactura.conceptos_json && selectedFactura.conceptos_json.length > 0 && (
                  <View style={[styles.infoSection, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                    <Text style={[styles.sectionTitle, { color: themeColors.accent }]}>Partidas ({selectedFactura.conceptos_json.length})</Text>
                    {selectedFactura.conceptos_json.map((c, i) => (
                      <View key={i} style={[styles.conceptoCard, { borderBottomColor: themeColors.border }]}>
                        <Text style={{ color: themeColors.text, fontWeight: '600' }}>{c.descripcion}</Text>
                        <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>
                          Cant: {c.cantidad || 1} • P.U: {formatCurrency(c.valorUnitario || 0)} • Importe: {formatCurrency(c.importe || 0)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal de Importación Manual de XML */}
      <Modal statusBarTranslucent={true} visible={showImportModal} animationType="fade" transparent={true} onRequestClose={() => setShowImportModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: themeColors.backgroundElement }]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Importar XML de Factura</Text>
              <TouchableOpacity onPress={() => setShowImportModal(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 16 }}>
              <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary, marginBottom: 12 }]}>
                Pega el contenido XML completo del CFDI emitido por tu proveedor para registrarlo en el sistema.
              </Text>

              <TextInput
                style={[
                  styles.xmlTextArea,
                  { backgroundColor: themeColors.background, color: themeColors.text, borderColor: themeColors.border }
                ]}
                multiline
                numberOfLines={10}
                placeholder="<cfdi:Comprobante ... > ... </cfdi:Comprobante>"
                placeholderTextColor={themeColors.textSecondary}
                value={xmlInputText}
                onChangeText={setXmlInputText}
              />

              <TouchableOpacity
                style={[styles.importSubmitBtn, { backgroundColor: themeColors.accent }]}
                onPress={handleImportXml}
                disabled={importingXml}
              >
                {importingXml ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.importSubmitText}>Procesar e Importar Factura</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de Selección de Período de Sincronización SAT */}
      <Modal statusBarTranslucent={true} visible={showSyncModal} animationType="fade" transparent={true} onRequestClose={() => setShowSyncModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: themeColors.backgroundElement }]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Sincronización con el SAT</Text>
                <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                  Selecciona el período de comprobantes fiscales a solicitar
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowSyncModal(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 16 }}>
              {/* Opción 1: Últimos 30 días */}
              <TouchableOpacity
                style={[
                  styles.syncOptionCard,
                  { backgroundColor: themeColors.background, borderColor: syncPeriodType === '30_dias' ? themeColors.accent : themeColors.border }
                ]}
                onPress={() => setSyncPeriodType('30_dias')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={syncPeriodType === '30_dias' ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={syncPeriodType === '30_dias' ? themeColors.accent : themeColors.textSecondary}
                  style={{ marginRight: 10 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.syncOptionTitle, { color: themeColors.text }]}>Últimos 30 Días (Recomendado)</Text>
                  <Text style={[styles.syncOptionSub, { color: themeColors.textSecondary }]}>
                    Consulta comprobantes emitidos en el último mes y procesa paquetes pendientes.
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Opción 2: Todo el Año Actual */}
              <TouchableOpacity
                style={[
                  styles.syncOptionCard,
                  { backgroundColor: themeColors.background, borderColor: syncPeriodType === 'anio_actual' ? themeColors.accent : themeColors.border }
                ]}
                onPress={() => setSyncPeriodType('anio_actual')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={syncPeriodType === 'anio_actual' ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={syncPeriodType === 'anio_actual' ? themeColors.accent : themeColors.textSecondary}
                  style={{ marginRight: 10 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.syncOptionTitle, { color: themeColors.text }]}>Todo el Año Actual ({new Date().getFullYear()})</Text>
                  <Text style={[styles.syncOptionSub, { color: themeColors.textSecondary }]}>
                    Solicita todas las facturas recibidas desde el 01 de enero de {new Date().getFullYear()} hasta hoy.
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Opción 3: Rango Personalizado */}
              <TouchableOpacity
                style={[
                  styles.syncOptionCard,
                  { backgroundColor: themeColors.background, borderColor: syncPeriodType === 'custom' ? themeColors.accent : themeColors.border }
                ]}
                onPress={() => setSyncPeriodType('custom')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={syncPeriodType === 'custom' ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={syncPeriodType === 'custom' ? themeColors.accent : themeColors.textSecondary}
                  style={{ marginRight: 10 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.syncOptionTitle, { color: themeColors.text }]}>Rango Personalizado</Text>
                  <Text style={[styles.syncOptionSub, { color: themeColors.textSecondary }]}>
                    Define manualmente la fecha de inicio y fin (ej. para un trimestre específico).
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Inputs para Rango Personalizado */}
              {syncPeriodType === 'custom' && (
                <View style={[styles.customDateContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={[styles.dateInputLabel, { color: themeColors.textSecondary }]}>Fecha Inicio (AAAA-MM-DD):</Text>
                    <TextInput
                      style={[styles.dateInput, { backgroundColor: themeColors.backgroundElement, color: themeColors.text, borderColor: themeColors.border }]}
                      placeholder="2026-01-01"
                      placeholderTextColor={themeColors.textSecondary}
                      value={customFechaInicio}
                      onChangeText={setCustomFechaInicio}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={[styles.dateInputLabel, { color: themeColors.textSecondary }]}>Fecha Fin (AAAA-MM-DD):</Text>
                    <TextInput
                      style={[styles.dateInput, { backgroundColor: themeColors.backgroundElement, color: themeColors.text, borderColor: themeColors.border }]}
                      placeholder="2026-09-07"
                      placeholderTextColor={themeColors.textSecondary}
                      value={customFechaFin}
                      onChangeText={setCustomFechaFin}
                    />
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={[styles.importSubmitBtn, { backgroundColor: '#10ac84', marginTop: 16 }]}
                onPress={handleExecuteSyncModal}
                disabled={syncingSat}
              >
                {syncingSat ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.importSubmitText}>Iniciar Sincronización SAT</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de Historial y Estado de Solicitudes SAT */}
      <Modal statusBarTranslucent={true} visible={showSolicitudesModal} animationType="slide" transparent={true} onRequestClose={() => setShowSolicitudesModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: themeColors.backgroundElement, maxHeight: '90%' }]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Estado de Solicitudes SAT</Text>
                <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                  Historial de peticiones de Descarga Masiva ({satSolicitudes.length} registradas)
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <TouchableOpacity
                  onPress={fetchSatSolicitudes}
                  style={[styles.solRefreshBtn, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}
                >
                  <Ionicons name="refresh" size={18} color={themeColors.accent} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowSolicitudesModal(false)}>
                  <Ionicons name="close" size={24} color={themeColors.text} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={{ padding: 16 }}>
              {/* Nota Explicativa */}
              <View style={[styles.solInfoCard, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                <Ionicons name="information-circle-outline" size={20} color={themeColors.accent} style={{ marginRight: 8 }} />
                <Text style={[styles.solInfoText, { color: themeColors.textSecondary }]}>
                  El SAT genera paquetes de descarga que tardan de 15 a 60 minutos en procesarse. El servicio en segundo plano los verifica automáticamente cada 30 minutos.
                </Text>
              </View>

              {satSolicitudes.length === 0 ? (
                <View style={[styles.emptyContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border, marginVertical: 20 }]}>
                  <Ionicons name="cloud-download-outline" size={40} color={themeColors.textSecondary} />
                  <Text style={[styles.emptyTitle, { color: themeColors.text }]}>No hay solicitudes registradas</Text>
                  <Text style={[styles.emptySubtitle, { color: themeColors.textSecondary }]}>
                    Presiona "Sincronizar SAT" para generar tu primera solicitud de descarga masiva.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 12, paddingBottom: 24 }}>
                  {satSolicitudes.map((sol) => {
                    let badgeBg = '#54a0ff20';
                    let badgeColor = '#2e86de';
                    let iconName: any = 'time-outline';

                    if (sol.estado_sat === 'TERMINADA') {
                      badgeBg = '#1dd1a120';
                      badgeColor = '#10ac84';
                      iconName = 'checkmark-circle-outline';
                    } else if (sol.estado_sat === 'PENDIENTE') {
                      badgeBg = '#feca5720';
                      badgeColor = '#d97706';
                      iconName = 'hourglass-outline';
                    } else if (sol.estado_sat === 'EXPIRADA') {
                      badgeBg = '#8395a720';
                      badgeColor = '#576574';
                      iconName = 'alert-circle-outline';
                    } else if (sol.estado_sat === 'RECHAZADA' || sol.estado_sat === 'ERROR') {
                      badgeBg = '#ff6b6b20';
                      badgeColor = '#ee5253';
                      iconName = 'close-circle-outline';
                    }

                    const isPending = sol.estado_sat === 'PENDIENTE' || sol.estado_sat === 'EN_PROCESO';

                    return (
                      <View
                        key={sol.id}
                        style={[
                          styles.solicitudItemCard,
                          { backgroundColor: themeColors.background, borderColor: isPending ? '#54a0ff' : themeColors.border }
                        ]}
                      >
                        <View style={styles.solItemHeader}>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <Text style={[styles.solIdText, { color: themeColors.text }]} numberOfLines={1}>
                              ID: {sol.id_solicitud}
                            </Text>
                            <Text style={[styles.solDateText, { color: themeColors.textSecondary }]}>
                              Período: {formatDate(sol.fecha_inicio)} – {formatDate(sol.fecha_fin)}
                            </Text>
                          </View>
                          <View style={[styles.solBadge, { backgroundColor: badgeBg }]}>
                            <Ionicons name={iconName} size={14} color={badgeColor} style={{ marginRight: 4 }} />
                            <Text style={[styles.solBadgeText, { color: badgeColor }]}>{sol.estado_sat}</Text>
                          </View>
                        </View>

                        <View style={[styles.solItemBody, { borderTopColor: themeColors.border }]}>
                          <View style={styles.solMetaRow}>
                            <Text style={[styles.solMetaLabel, { color: themeColors.textSecondary }]}>Facturas Procesadas:</Text>
                            <Text style={[styles.solMetaVal, { color: themeColors.text, fontWeight: 'bold' }]}>
                              {sol.total_facturas_procesadas || 0} comprobantes
                            </Text>
                          </View>

                          {sol.mensaje_sat && (
                            <View style={styles.solMetaRow}>
                              <Text style={[styles.solMetaLabel, { color: themeColors.textSecondary }]}>Mensaje SAT:</Text>
                              <Text style={[styles.solMetaVal, { color: themeColors.text }]} numberOfLines={2}>
                                {sol.mensaje_sat}
                              </Text>
                            </View>
                          )}

                          <View style={styles.solMetaRow}>
                            <Text style={[styles.solMetaLabel, { color: themeColors.textSecondary }]}>Fecha Solicitud:</Text>
                            <Text style={[styles.solMetaVal, { color: themeColors.textSecondary }]}>
                              {formatDate(sol.created_at)} ({new Date(sol.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })})
                            </Text>
                          </View>
                        </View>

                        {isPending && (
                          <TouchableOpacity
                            style={[styles.solVerifyBtn, { backgroundColor: '#54a0ff' }]}
                            onPress={() => handleVerifySingleSolicitud(sol)}
                            disabled={verifyingSolId === sol.id || syncingSat}
                          >
                            {verifyingSolId === sol.id ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <>
                                <Ionicons name="refresh-circle-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                                <Text style={styles.solVerifyBtnText}>Verificar Estado con el SAT Ahora</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: Spacing.four },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.four,
    flexWrap: 'wrap',
    gap: 12,
  },
  title: { fontSize: 24, fontWeight: 'bold' },
  subtitle: { fontSize: 13, marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: BorderRadius.medium,
  },
  actionBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },

  autoSyncBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    marginBottom: Spacing.four,
  },
  syncStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  autoSyncText: {
    fontSize: 13,
  },
  autoSyncSubText: {
    fontSize: 12,
  },

  satBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    marginBottom: Spacing.four,
  },
  satBannerTitle: { fontSize: 13, fontWeight: 'bold' },
  satBannerSub: { fontSize: 12, marginTop: 2 },

  kpiGrid: { flexDirection: 'row', gap: 12, marginBottom: Spacing.four, flexWrap: 'wrap' },
  kpiCard: {
    flex: 1,
    minWidth: 200,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
  kpiIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  kpiLabel: { fontSize: 12 },
  kpiValue: { fontSize: 18, fontWeight: 'bold', marginTop: 2 },

  filtersContainer: { padding: Spacing.three, borderRadius: BorderRadius.medium, borderWidth: 1, marginBottom: Spacing.four },
  searchBox: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 42, borderRadius: BorderRadius.medium, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14 },
  pillsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(150,150,150,0.1)' },
  pillText: { fontSize: 12, fontWeight: '600' },
  divider: { width: 1, height: 20, backgroundColor: '#ccc', marginHorizontal: 4 },

  loadingContainer: { padding: 40, alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14 },
  emptyContainer: { padding: 40, alignItems: 'center', borderRadius: BorderRadius.medium, borderWidth: 1 },
  emptyTitle: { fontSize: 16, fontWeight: 'bold', marginTop: 12 },
  emptySubtitle: { fontSize: 13, textAlign: 'center', marginTop: 4, maxWidth: 400 },

  facturasList: { gap: 12 },
  facturaCard: { padding: Spacing.three, borderRadius: BorderRadius.medium, borderWidth: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  emisorName: { fontSize: 15, fontWeight: 'bold' },
  emisorRfc: { fontSize: 12, marginTop: 2 },
  facturaTotal: { fontSize: 16, fontWeight: 'bold' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginTop: 4 },
  badgeText: { fontSize: 10, fontWeight: 'bold' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1 },
  uuidText: { fontSize: 11, flex: 1, marginRight: 8 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalContainer: { width: '100%', maxWidth: 600, maxHeight: '85%', borderRadius: BorderRadius.large, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  modalSubtitle: { fontSize: 13 },
  infoSection: { padding: 14, borderRadius: BorderRadius.medium, borderWidth: 1, marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 6 },
  infoMain: { fontSize: 15, fontWeight: 'bold' },
  infoSub: { fontSize: 13, marginTop: 2 },
  xmlLinkBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingVertical: 4 },
  xmlLinkText: { fontSize: 13, fontWeight: '600' },
  pdfExportMainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.medium,
    marginBottom: 14,
  },
  pdfExportMainBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  cardPdfBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
  },
  dividerLight: { height: 1, backgroundColor: 'rgba(150,150,150,0.2)', marginVertical: 10 },
  montoRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 2 },
  conceptoCard: { paddingVertical: 8, borderBottomWidth: 1 },

  xmlTextArea: { height: 160, borderWidth: 1, borderRadius: BorderRadius.medium, padding: 12, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 12 },
  importSubmitBtn: { marginTop: 16, padding: 14, borderRadius: BorderRadius.medium, alignItems: 'center' },
  importSubmitText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },

  syncOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: BorderRadius.medium,
    borderWidth: 1.5,
    marginBottom: 10,
  },
  syncOptionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  syncOptionSub: {
    fontSize: 12,
    marginTop: 2,
  },
  customDateContainer: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    marginTop: 6,
    marginBottom: 10,
  },
  dateInputLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  dateInput: {
    height: 38,
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    paddingHorizontal: 8,
    fontSize: 13,
  },

  viewSolLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  viewSolLinkText: {
    fontSize: 12,
    fontWeight: '600',
    marginRight: 2,
  },
  solRefreshBtn: {
    padding: 6,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
  },
  solInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    marginBottom: 14,
  },
  solInfoText: {
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  solicitudItemCard: {
    padding: 14,
    borderRadius: BorderRadius.medium,
    borderWidth: 1.5,
    marginBottom: 10,
  },
  solItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  solIdText: {
    fontSize: 13,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  solDateText: {
    fontSize: 12,
    marginTop: 2,
  },
  solBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  solBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  solItemBody: {
    paddingTop: 8,
    borderTopWidth: 1,
    gap: 4,
  },
  solMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  solMetaLabel: {
    fontSize: 12,
  },
  solMetaVal: {
    fontSize: 12,
  },
  solVerifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.small,
    marginTop: 10,
  },
  solVerifyBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },

  /* Desktop ERP Toolbar & Table Styles */
  desktopToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    position: 'relative',
    zIndex: 500,
    elevation: 10,
  },
  desktopToolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  calculatorCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  desktopModuleTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  countBadge: {
    backgroundColor: '#0284c720',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284c7',
  },
  desktopSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    width: 250,
    marginLeft: 4,
    gap: 6,
  },
  desktopSearchInput: {
    flex: 1,
    fontSize: 12,
    padding: 0,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
      } as any,
    }),
  },
  chipBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  segmentedWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    padding: 2,
    gap: 2,
  },
  segmentedBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  segmentedBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  dropdownTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  dropdownTriggerText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  dropdownBackdrop: {
    position: 'absolute',
    top: -1000,
    left: -1000,
    right: -1000,
    bottom: -1000,
    zIndex: 9998,
    ...Platform.select({
      web: {
        position: 'fixed' as any,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      },
    }),
  },
  dropdownMenuBox: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 6,
    minWidth: 175,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 4,
    zIndex: 9999,
    elevation: 20,
    ...Platform.select({
      web: {
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.16)',
      },
    }),
  },
  dropdownMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    cursor: 'pointer' as any,
  },
  dropdownMenuItemText: {
    fontSize: 12,
  },
  actionBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
  },
  actionBtnOutlineText: {
    fontSize: 12,
    fontWeight: '600',
  },
  desktopToolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addToolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 7,
  },
  addToolbarBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  tableContainer: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)',
      },
    }),
  },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    width: '100%',
  },
  tableHeaderCell: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    width: '100%',
  },
  tableCell: {
    fontSize: 12,
  },
  tableActionIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});


