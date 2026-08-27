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
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/services/supabase';
import { parseCfdiXml } from '../../../supabase/functions/sync-facturas-recibidas/xmlParser';
import { exportFacturaCfdiToPdf } from '@/utils/cfdiPdfGenerator';

interface FacturaRecibida {
  id: string;
  uuid: string;
  rfc_emisor: string;
  nombre_emisor: string;
  rfc_receptor: string;
  fecha_emision: string;
  subtotal: number;
  descuento: number;
  iva: number;
  retencion_isr: number;
  retencion_iva: number;
  total: number;
  moneda: string;
  tipo_comprobante: string;
  estado_sat: string;
  xml_url?: string;
  pdf_url?: string;
  conceptos_json?: any[];
  created_at: string;
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

export default function FacturasRecibidasScreen() {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [facturas, setFacturas] = useState<FacturaRecibida[]>([]);
  const [satSolicitudes, setSatSolicitudes] = useState<SatSolicitud[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPeriodo, setFilterPeriodo] = useState<'mes_actual' | 'mes_anterior' | 'todos'>('mes_actual');
  const [filterEstado, setFilterEstado] = useState<'todos' | 'VIGENTE' | 'CANCELADO'>('todos');

  // Modales
  const [selectedFactura, setSelectedFactura] = useState<FacturaRecibida | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [xmlInputText, setXmlInputText] = useState('');
  const [importingXml, setImportingXml] = useState(false);
  const [syncingSat, setSyncingSat] = useState(false);

  const [tableMissing, setTableMissing] = useState(false);

  useEffect(() => {
    fetchFacturas();
    fetchSatSolicitudes();
  }, []);

  const fetchFacturas = async () => {
    try {
      setLoading(true);
      setTableMissing(false);
      const { data, error } = await supabase
        .from('facturas_recibidas')
        .select('*')
        .order('fecha_emision', { ascending: false });

      if (error) {
        if (error.code === 'PGRST205' || error.message?.includes('Could not find the table')) {
          setTableMissing(true);
        } else {
          console.error('Error fetching facturas recibidas:', error);
        }
      } else {
        setFacturas(data || []);
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
      const { data, error } = await supabase
        .from('sat_descarga_solicitudes')
        .select('*')
        .in('estado_sat', ['PENDIENTE', 'EN_PROCESO'])
        .order('created_at', { ascending: false })
        .limit(3);

      if (!error && data) {
        setSatSolicitudes(data);
      }
    } catch {
      // Ignorar si la tabla aún no existe
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchFacturas();
    fetchSatSolicitudes();
  };

  // Filtrado de datos
  const filteredFacturas = useMemo(() => {
    return facturas.filter((f) => {
      // Filtro de Texto (Nombre emisor, RFC, UUID)
      const q = searchQuery.toLowerCase().trim();
      const matchText =
        !q ||
        f.nombre_emisor.toLowerCase().includes(q) ||
        f.rfc_emisor.toLowerCase().includes(q) ||
        f.uuid.toLowerCase().includes(q);

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

  // Cálculos de Resumen KPI
  const kpis = useMemo(() => {
    const totalMonto = filteredFacturas.reduce((sum, f) => sum + (f.estado_sat === 'VIGENTE' ? Number(f.total || 0) : 0), 0);
    const countTotal = filteredFacturas.length;
    const countVigentes = filteredFacturas.filter((f) => f.estado_sat === 'VIGENTE').length;
    const countCanceladas = filteredFacturas.filter((f) => f.estado_sat === 'CANCELADO').length;

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

      const { error } = await supabase
        .from('facturas_recibidas')
        .upsert(
          {
            uuid: parsed.uuid,
            rfc_emisor: parsed.rfcEmisor,
            nombre_emisor: parsed.nombreEmisor,
            rfc_receptor: parsed.rfcReceptor,
            fecha_emision: parsed.fechaEmision,
            subtotal: parsed.subtotal,
            descuento: parsed.descuento,
            iva: parsed.iva,
            retencion_isr: parsed.retencionIsr,
            retencion_iva: parsed.retencionIva,
            total: parsed.total,
            moneda: parsed.moneda,
            tipo_comprobante: parsed.tipoComprobante,
            estado_sat: parsed.estadoSat,
            conceptos_json: parsed.conceptos,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'uuid' }
        )
        .select()
        .single();

      if (error) throw error;

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
  const handleSyncSat = async () => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`\n======================================================`);
    console.log(`🚀 [SAT SYNC ${timestamp}] Botón 'Sincronizar SAT' presionado.`);
    console.log(`📡 [SAT SYNC] Iniciando llamada a Edge Function 'sync-facturas-recibidas'...`);

    try {
      setSyncingSat(true);

      const startTime = Date.now();
      console.log(`📤 [SAT SYNC] Invocando función con payload: { action: 'sync' }`);

      const { data, error } = await supabase.functions.invoke('sync-facturas-recibidas', {
        body: { action: 'sync' }
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
          msg = `Solicitud enviada al SAT con éxito (ID: ${res.idNuevaSolicitud}). El SAT tarda entre 5 y 60 minutos en empaquetar los XMLs.`;
        }
        console.log(`✅ [SAT SYNC] Sincronización finalizada exitosamente:`, msg);
        showAlert('Sincronización SAT', msg);
        fetchFacturas();
        fetchSatSolicitudes();
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
      await exportFacturaCfdiToPdf({ factura });
    } catch (err: any) {
      console.error('Error exportando PDF:', err);
      showAlert('Error al generar PDF', err.message || 'No se pudo generar el documento PDF de la factura.');
    } finally {
      setExportingPdfId(null);
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

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={themeColors.accent} />}
      >
        {/* Cabecera y Título */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1, minWidth: 260 }}>
            <Text style={[styles.title, { color: themeColors.text }]}>Facturas Recibidas</Text>
            <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
              Comprobantes fiscales (CFDI 4.0) emitidos por proveedores hacia la empresa
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: themeColors.accent }]}
              onPress={() => setShowImportModal(true)}
            >
              <Ionicons name="add-circle-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.actionBtnText}>Importar XML</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#10ac84' }]}
              onPress={handleSyncSat}
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

        {/* Banner de Solicitudes SAT en Proceso */}
        {satSolicitudes.length > 0 && (
          <View style={[styles.satBanner, { backgroundColor: '#54a0ff15', borderColor: '#54a0ff' }]}>
            <Ionicons name="time-outline" size={22} color="#54a0ff" style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.satBannerTitle, { color: '#2e86de' }]}>
                Descarga en proceso en el SAT ({satSolicitudes.length} solicitud{satSolicitudes.length > 1 ? 'es' : ''})
              </Text>
              <Text style={[styles.satBannerSub, { color: themeColors.textSecondary }]}>
                El SAT está agrupando los paquetes de comprobantes solicitados. Al presionar "Sincronizar SAT" o de forma periódica se descargarán automáticamente.
              </Text>
            </View>
          </View>
        )}

        {/* KPI Cards */}
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

        {/* Buscador y Filtros */}
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

        {/* Lista de Facturas */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={themeColors.accent} />
            <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>Cargando comprobantes...</Text>
          </View>
        ) : tableMissing ? (
          <View style={[styles.emptyContainer, { backgroundColor: themeColors.backgroundElement, borderColor: '#feca57' }]}>
            <Ionicons name="warning-outline" size={48} color="#feca57" />
            <Text style={[styles.emptyTitle, { color: themeColors.text }]}>Pendiente: Crear Tabla en Supabase</Text>
            <Text style={[styles.emptySubtitle, { color: themeColors.textSecondary }]}>
              Para activar el almacenamiento de facturas recibidas, ejecuta el archivo SQL <Text style={{ fontWeight: 'bold', color: themeColors.accent }}>BaseDatos_FacturasRecibidas.sql</Text> en el Editor SQL de tu panel de Supabase.
            </Text>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: themeColors.accent, marginTop: 16 }]}
              onPress={fetchFacturas}
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
              Utiliza el botón "Importar XML" para cargar facturas de proveedores o sincroniza directamente con el SAT.
            </Text>
          </View>
        ) : (
          <View style={styles.facturasList}>
            {filteredFacturas.map((f) => (
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
});
