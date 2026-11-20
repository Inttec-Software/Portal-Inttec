import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
  TextInput,
  Alert,
  useWindowDimensions,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { exportarOrdenCompraOdooPDF } from '@/utils/reportGenerator';
import { OrdenCompra } from '@/types/ordenesCompra';
import { getApiHeaders, getApiUrl } from '@/services/apiHelper';
import { useAuth } from '@/context/AuthContext';
import { ModuleCache } from '@/services/moduleCache';
import { CotizacionesTableSkeleton, CotizacionesCardsListSkeleton } from '@/components/skeleton';
import PaginationControls from '@/components/PaginationControls';
import FormattedDescription from '@/components/FormattedDescription';

const getStatusConfig = (estatus: string, isDark: boolean) => {
  const norm = (estatus || '').toLowerCase().trim();
  switch (norm) {
    case 'borrador':
      return {
        color: isDark ? '#f8f9fa' : '#343a40',
        bg: isDark ? '#495057' : '#e9ecef',
        icon: 'document-outline' as const,
      };
    case 'en proceso':
      return {
        color: isDark ? '#bae6fd' : '#0369a1',
        bg: isDark ? '#0c4a6e' : '#e0f2fe',
        icon: 'time-outline' as const,
      };
    case 'enviada':
    case 'enviado':
      return {
        color: isDark ? '#fef08a' : '#b45309',
        bg: isDark ? '#78350f' : '#fef3c7',
        icon: 'paper-plane-outline' as const,
      };
    case 'recibida':
    case 'recibido':
    case 'completada':
      return {
        color: isDark ? '#a7f3d0' : '#047857',
        bg: isDark ? '#064e3b' : '#d1fae5',
        icon: 'checkmark-circle-outline' as const,
      };
    case 'cancelada':
    case 'cancelado':
      return {
        color: isDark ? '#fca5a5' : '#b91c1c',
        bg: isDark ? '#450a0a' : '#fee2e2',
        icon: 'close-circle-outline' as const,
      };
    default:
      return {
        color: isDark ? '#bae6fd' : '#0369a1',
        bg: isDark ? '#0c4a6e' : '#e0f2fe',
        icon: 'document-text-outline' as const,
      };
  }
};

const getActionBtnStyle = (action: 'view' | 'download' | 'edit' | 'delete', isDark: boolean) => {
  switch (action) {
    case 'view':
      return {
        bg: isDark ? '#2c3036' : '#f1f3f5',
        color: isDark ? '#adb5bd' : '#495057',
      };
    case 'download':
      return {
        bg: isDark ? '#062f22' : '#d1fae5',
        color: isDark ? '#34d399' : '#059669',
      };
    case 'edit':
      return {
        bg: isDark ? '#3d2c00' : '#fef3c7',
        color: isDark ? '#fbbf24' : '#d97706',
      };
    case 'delete':
      return {
        bg: isDark ? '#3b1219' : '#ffebee',
        color: isDark ? '#f87171' : '#e53935',
      };
  }
};

function ActionButtonWithTooltip({
  icon,
  iconSize = 14,
  color,
  bgColor,
  tooltip,
  onPress,
  isCircular = false,
  align = 'center',
}: {
  icon: string;
  iconSize?: number;
  color: string;
  bgColor?: string;
  tooltip: string;
  onPress: () => void;
  isCircular?: boolean;
  align?: 'center' | 'left' | 'right';
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <View style={{ position: 'relative', alignItems: 'center', zIndex: isHovered ? 99999 : 1 }}>
      <Pressable
        onPress={onPress}
        onHoverIn={() => setIsHovered(true)}
        onHoverOut={() => setIsHovered(false)}
        style={({ pressed }) => [
          isCircular
            ? { flex: 1, minWidth: 32, maxWidth: 42, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }
            : { paddingHorizontal: 4, paddingVertical: 4, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
          bgColor ? { backgroundColor: bgColor } : null,
          pressed && { opacity: 0.7 },
          isHovered && { transform: [{ scale: 1.15 }] },
        ]}
        accessibilityLabel={tooltip}
      >
        <Ionicons name={icon as any} size={iconSize} color={color} />
      </Pressable>

      {isHovered && Platform.OS === 'web' && (
        <View
          pointerEvents="none"
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
              alignItems: 'center',
              justifyContent: 'center',
            },
            align === 'right' ? { right: -2 } : align === 'left' ? { left: -2 } : { alignSelf: 'center' },
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
          <Text style={{ color: '#f8fafc', fontSize: 11, fontWeight: '700', textAlign: 'center' }} numberOfLines={1}>
            {tooltip}
          </Text>
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

export default function OrdenesCompraListScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { width } = useWindowDimensions();
  const styles = React.useMemo(() => getStyles(themeColors), [themeColors]);
  const { company } = useAuth();

  const isDesktop = Platform.OS === 'web' && width >= 1024;

  const cachedOrdenes = ModuleCache.get<any[]>('ordenes_compra_list');
  const [ordenes, setOrdenes] = useState<any[]>(() => cachedOrdenes || []);
  const [isLoading, setIsLoading] = useState(() => !cachedOrdenes);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('TODAS');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const fetchOrdenes = useCallback(async (silent = false) => {
    if (!silent && !ModuleCache.has('ordenes_compra_list')) {
      setIsLoading(true);
    }
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/ordenes-compra`, { headers });
      if (!res.ok) throw new Error('Error en API');
      const data = await res.json();
      const items = data.ordenesCompra || [];
      ModuleCache.set('ordenes_compra_list', items);
      setOrdenes(items);
    } catch (err) {
      console.error('Error fetching ordenes de compra:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setExpandedRowId(null);
      fetchOrdenes(true);
    }, [fetchOrdenes])
  );

  const filteredOrdenes = ordenes.filter((oc) => {
    if (filtroEstado !== 'TODAS') {
      const normEstado = (oc.estatus_proceso || 'en proceso').toLowerCase().trim();
      const normFiltro = filtroEstado.toLowerCase().trim();
      if (!normEstado.includes(normFiltro)) return false;
    }
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      (oc.folio && String(oc.folio).toLowerCase().includes(query)) ||
      (oc.proveedor_nombre && oc.proveedor_nombre.toLowerCase().includes(query)) ||
      (oc.referencia && oc.referencia.toLowerCase().includes(query)) ||
      (oc.estatus_proceso && oc.estatus_proceso.toLowerCase().includes(query)) ||
      (oc.realizo_compra && oc.realizo_compra.toLowerCase().includes(query))
    );
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filtroEstado]);

  const totalPages = Math.ceil(filteredOrdenes.length / pageSize) || 1;
  const paginatedOrdenes = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredOrdenes.slice(start, start + pageSize);
  }, [filteredOrdenes, currentPage, pageSize]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrdenes();
  };

  const formatearMoneda = (cantidad: number, moneda?: string) => {
    const code = (moneda || 'MXN').toUpperCase();
    try {
      return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: code === 'USD' || code === 'EUR' ? code : 'MXN',
      }).format(Number(cantidad) || 0);
    } catch {
      return `$${(Number(cantidad) || 0).toFixed(2)}`;
    }
  };

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleDownloadPDF = async (oc: any, action: 'view' | 'download' = 'view') => {
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/ordenes-compra/${oc.id}/pdf-data`, { headers });
      let apiOc = oc;
      let prov = null;
      if (res.ok) {
        const data = await res.json();
        if (data.ordenCompra) apiOc = data.ordenCompra;
        prov = data.proveedorData;
      }

      const ordenData: OrdenCompra = {
        id: apiOc.id,
        folio: String(apiOc.folio || ''),
        proveedorId: apiOc.proveedor_id || prov?.id,
        proveedorNombre: apiOc.proveedor_nombre || prov?.nombre || '',
        proveedorRFC: apiOc.proveedor_rfc || prov?.rfc || '',
        proveedorCorreo: apiOc.proveedor_correo || prov?.correo_electronico || '',
        proveedorCalleNumero: apiOc.proveedor_calle_numero || prov?.calle_numero || '',
        proveedorColonia: apiOc.proveedor_colonia || prov?.colonia || '',
        proveedorCiudad: apiOc.proveedor_ciudad || prov?.ciudad || '',
        proveedorEstado: apiOc.proveedor_estado || prov?.estado || '',
        proveedorCP: apiOc.proveedor_cp || prov?.codigo_postal || '',
        referencia: apiOc.referencia || '',
        facturar: apiOc.facturar !== undefined ? Boolean(apiOc.facturar) : true,
        estatusProceso: apiOc.estatus_proceso || 'En Proceso',
        moneda: apiOc.moneda || 'MXN',
        tipoCambio: Number(apiOc.tipo_cambio) || 1,
        fechaCreacion: apiOc.fecha_creacion || '',
        realizoCompra: apiOc.realizo_compra || '',
        recibidoPor: apiOc.recibido_por || '',
        lineas: Array.isArray(apiOc.lineas) ? apiOc.lineas : [],
        observaciones: apiOc.observaciones || '',
        condicionesTrabajo: apiOc.condiciones_trabajo || '',
        clienteFinal: apiOc.cliente_final || '',
        subtotal: Number(apiOc.subtotal) || 0,
        iva: Number(apiOc.iva) || 0,
        total: Number(apiOc.total) || 0,
      };

      await exportarOrdenCompraOdooPDF(ordenData, action);
    } catch (error: any) {
      showAlert('Error al generar PDF', error.message || 'Ocurrió un error.');
    }
  };

  const handleDelete = (id: string) => {
    if (Platform.OS === 'web') {
      if (window.confirm('¿Estás seguro de que deseas eliminar esta orden de compra?')) {
        ejecutarEliminacion(id);
      }
    } else {
      Alert.alert('Eliminar Orden de Compra', '¿Estás seguro de que deseas eliminar esta orden de compra?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => ejecutarEliminacion(id) },
      ]);
    }
  };

  const ejecutarEliminacion = async (id: string) => {
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/ordenes-compra/${id}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) throw new Error('Error al eliminar');
      fetchOrdenes();
    } catch (err) {
      console.error('Error al eliminar orden de compra:', err);
      showAlert('Error', 'No se pudo eliminar la orden de compra.');
    }
  };

  const handleDuplicate = async (oc: any) => {
    try {
      setIsLoading(true);
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/ordenes-compra/duplicate/${oc.id}`, {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al duplicar la orden de compra');
      }
      showAlert('Éxito', `Orden de compra duplicada con éxito. Se asignó el folio: ${data.newFolio}`);
      fetchOrdenes();
    } catch (err: any) {
      console.error('Error duplicando orden de compra:', err);
      showAlert('Error', 'No se pudo duplicar la orden de compra: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleRowExpansion = (id: string) => {
    setExpandedRowId((prev) => (prev === id ? null : id));
  };

  const renderDesktopToolbar = () => (
    <View style={styles.desktopToolbar}>
      <View style={styles.desktopToolbarLeft}>
        <View style={styles.iconCircle}>
          <Ionicons name="bag-handle" size={16} color="#fff" />
        </View>
        <Text style={styles.desktopModuleTitle}>Órdenes de Compra</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{filteredOrdenes.length}</Text>
        </View>
        <View style={styles.desktopSearchContainer}>
          <Ionicons name="search" size={15} color={themeColors.textSecondary} style={{ marginRight: 2 }} />
          <TextInput
            style={styles.desktopSearchInput}
            placeholder="Buscar por folio, proveedor, referencia..."
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

        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          {(['TODAS', 'EN PROCESO', 'ENVIADA', 'RECIBIDA', 'CANCELADA'] as const).map((est) => (
            <TouchableOpacity
              key={est}
              onPress={() => setFiltroEstado(est)}
              style={[
                styles.chipBtn,
                {
                  borderColor: filtroEstado === est ? themeColors.accent : themeColors.border,
                  backgroundColor: filtroEstado === est ? themeColors.accent + '20' : themeColors.background,
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: filtroEstado === est ? '800' : '500',
                  color: filtroEstado === est ? themeColors.accent : themeColors.textSecondary,
                }}
              >
                {est}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.desktopToolbarRight}>
        <TouchableOpacity
          onPress={() => router.push('/(admin)/nueva-orden-compra')}
          style={styles.addButton}
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.addButtonText}>Nueva Orden de Compra</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderDesktopTable = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ width: '100%' }}>
      <View style={styles.tableContainer}>
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.tableHeaderCell, { width: '7%', textAlign: 'center' }]}>Folio</Text>
          <Text style={[styles.tableHeaderCell, { width: '9%', textAlign: 'center' }]}>Fecha</Text>
          <Text style={[styles.tableHeaderCell, { width: '18%', textAlign: 'left', paddingHorizontal: 6 }]}>Proveedor</Text>
          <Text style={[styles.tableHeaderCell, { width: '14%', textAlign: 'left', paddingHorizontal: 6 }]}>Referencia</Text>
          <Text style={[styles.tableHeaderCell, { width: '10%', textAlign: 'center' }]}>Realizó</Text>
          <Text style={[styles.tableHeaderCell, { width: '6%', textAlign: 'center' }]}>Facturar</Text>
          <Text style={[styles.tableHeaderCell, { width: '9%', textAlign: 'center' }]}>Estatus</Text>
          <Text style={[styles.tableHeaderCell, { width: '10%', textAlign: 'right', paddingRight: 8 }]}>Total</Text>
          <Text style={[styles.tableHeaderCell, { width: '17%', textAlign: 'center' }]}>Acciones</Text>
        </View>

        {isLoading ? (
          <CotizacionesTableSkeleton count={8} />
        ) : filteredOrdenes.length === 0 ? (
          <View style={styles.noResultsTable}>
            <Text style={{ color: '#888', textAlign: 'center', padding: 24 }}>
              {searchQuery ? 'No se encontraron órdenes de compra con esa búsqueda.' : 'No hay órdenes de compra registradas aún.'}
            </Text>
          </View>
        ) : (
          paginatedOrdenes.map((oc) => {
            const estadoDisplay = oc.estatus_proceso || 'En Proceso';
            const config = getStatusConfig(estadoDisplay, scheme === 'dark');
            const lineas = Array.isArray(oc.lineas) ? oc.lineas : [];
            const refDisplay = oc.referencia || lineas[0]?.productoNombre || '—';

            return (
              <View key={oc.id}>
                <Pressable
                  onPress={() => toggleRowExpansion(oc.id)}
                  onHoverIn={() => setHoveredRowId(oc.id)}
                  onHoverOut={() => setHoveredRowId(null)}
                  style={[
                    styles.tableRow,
                    hoveredRowId === oc.id && { backgroundColor: themeColors.backgroundSelected },
                    expandedRowId === oc.id && { borderBottomWidth: 0, backgroundColor: themeColors.backgroundSelected },
                  ]}
                >
                  <Text style={[styles.tableCell, { width: '7%', textAlign: 'center', fontWeight: '700', color: themeColors.primary }]}>
                    {oc.folio}
                  </Text>
                  <Text style={[styles.tableCell, { width: '9%', textAlign: 'center' }]}>{oc.fecha_creacion}</Text>
                  <Text
                    style={[styles.tableCell, { width: '18%', textAlign: 'left', paddingHorizontal: 6, fontWeight: '600', color: themeColors.text }]}
                    numberOfLines={1}
                  >
                    {oc.proveedor_nombre}
                  </Text>
                  <Text
                    style={[styles.tableCell, { width: '14%', textAlign: 'left', paddingHorizontal: 6, color: themeColors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {refDisplay}
                  </Text>
                  <Text style={[styles.tableCell, { width: '10%', textAlign: 'center' }]} numberOfLines={1}>
                    {oc.realizo_compra || 'Admin'}
                  </Text>
                  <View style={{ width: '6%', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: oc.facturar ? '#10b981' : themeColors.textSecondary }}>
                      {oc.facturar ? 'SI' : 'NO'}
                    </Text>
                  </View>
                  <View style={{ width: '9%', alignItems: 'center', justifyContent: 'center' }}>
                    <View
                      style={[
                        styles.badge,
                        {
                          backgroundColor: config.bg,
                          borderWidth: 1,
                          borderColor: config.color + '30',
                          paddingVertical: 2,
                          paddingHorizontal: 6,
                          borderRadius: 10,
                          alignSelf: 'center',
                        },
                      ]}
                    >
                      <Text style={{ fontSize: 9, fontWeight: 'bold', color: config.color }}>{estadoDisplay}</Text>
                    </View>
                  </View>
                  <View style={{ width: '10%', alignItems: 'flex-end', paddingRight: 8 }}>
                    <Text style={[styles.tableCell, { fontWeight: 'bold' }]}>{formatearMoneda(oc.total, oc.moneda)}</Text>
                    <Text style={{ fontSize: 9, color: themeColors.textSecondary }}>{oc.moneda || 'MXN'}</Text>
                  </View>

                  <View style={[styles.rowActionsContainer, { width: '17%' }]}>
                    <ActionButtonWithTooltip
                      icon="eye-outline"
                      color={themeColors.textSecondary}
                      tooltip="Ver PDF"
                      onPress={() => handleDownloadPDF(oc, 'view')}
                    />
                    <ActionButtonWithTooltip
                      icon="pencil-outline"
                      color={themeColors.textSecondary}
                      tooltip="Editar Orden"
                      onPress={() => router.push(`/(admin)/nueva-orden-compra?id=${oc.id}`)}
                    />
                    <ActionButtonWithTooltip
                      icon="copy-outline"
                      color={themeColors.textSecondary}
                      tooltip="Duplicar Orden"
                      onPress={() => handleDuplicate(oc)}
                    />
                    <ActionButtonWithTooltip
                      icon="download-outline"
                      color={themeColors.textSecondary}
                      tooltip="Descargar PDF"
                      onPress={() => handleDownloadPDF(oc, 'download')}
                    />
                    <ActionButtonWithTooltip
                      icon={expandedRowId === oc.id ? 'chevron-up' : 'chevron-down'}
                      color={themeColors.textSecondary}
                      tooltip={expandedRowId === oc.id ? 'Ocultar Partidas' : 'Ver Partidas'}
                      onPress={() => toggleRowExpansion(oc.id)}
                    />
                    <ActionButtonWithTooltip
                      icon="trash-outline"
                      color={themeColors.danger}
                      tooltip="Eliminar Orden"
                      align="right"
                      onPress={() => handleDelete(oc.id)}
                    />
                  </View>
                </Pressable>

                {expandedRowId === oc.id && (
                  <View style={styles.expandedDetailRow}>
                    <Text style={styles.detailTitle}>Partidas de la Orden de Compra #{oc.folio}:</Text>
                    {lineas.length > 0 ? (
                      lineas.map((linea: any, lIndex: number) => (
                        <View key={lIndex} style={styles.detailLineItem}>
                          <Text style={{ width: '35%', fontWeight: '500', color: themeColors.text }}>
                            {linea.productoNombre}
                          </Text>
                          <View style={{ width: '25%', paddingRight: 8 }}>
                            <FormattedDescription
                              content={linea.productoDescripcion}
                              style={{ color: themeColors.textSecondary, fontSize: 12, lineHeight: 17 }}
                              boldColor={themeColors.text}
                            />
                          </View>
                          <Text style={{ width: '8%', textAlign: 'center', color: themeColors.textSecondary }}>
                            {linea.unidad || 'Pieza'}
                          </Text>
                          <Text style={{ width: '8%', textAlign: 'right', color: themeColors.textSecondary }}>
                            Cant: {linea.cantidad}
                          </Text>
                          <Text style={{ width: '12%', textAlign: 'right', color: themeColors.textSecondary }}>
                            P.U: {formatearMoneda(linea.precioUnitario, oc.moneda)}
                          </Text>
                          <Text style={{ width: '12%', textAlign: 'right', fontWeight: 'bold', color: themeColors.text }}>
                            {formatearMoneda(linea.importe || linea.cantidad * linea.precioUnitario, oc.moneda)}
                          </Text>
                        </View>
                      ))
                    ) : (
                      <Text style={{ color: themeColors.textSecondary, fontStyle: 'italic' }}>Sin partidas registradas</Text>
                    )}

                    <View style={styles.detailFooter}>
                      <Text style={styles.detailFooterText}>Subtotal: {formatearMoneda(oc.subtotal, oc.moneda)}</Text>
                      <Text style={styles.detailFooterText}>IVA: {formatearMoneda(oc.iva, oc.moneda)}</Text>
                      <Text style={[styles.detailFooterText, { fontWeight: 'bold', fontSize: 14 }]}>
                        Total: {formatearMoneda(oc.total, oc.moneda)} ({oc.moneda || 'MXN'})
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      {isDesktop ? (
        <View style={{ flex: 1 }}>
          {renderDesktopToolbar()}
          <ScrollView style={styles.desktopScrollView}>
            <View style={{ paddingHorizontal: 20, paddingVertical: 8 }}>
              {renderDesktopTable()}
              {filteredOrdenes.length > 0 && (
                <PaginationControls
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={filteredOrdenes.length}
                  itemsPerPage={pageSize}
                  onPageChange={setCurrentPage}
                  onItemsPerPageChange={(newSize: number) => {
                    setPageSize(newSize);
                    setCurrentPage(1);
                  }}
                  itemsPerPageOptions={[20, 25, 50, 100]}
                  isLoading={isLoading}
                  style={{ marginTop: 14, marginBottom: 24 }}
                />
              )}
            </View>
          </ScrollView>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Image
                  source={
                    company === 'daravisa'
                      ? require('@/assets/images/logo_daravisa.png')
                      : require('@/assets/images/logo.jpeg')
                  }
                  style={{ width: 28, height: 28, borderRadius: 6, marginRight: 8 }}
                  contentFit="contain"
                />
                <Text style={styles.headerTitle}>Órdenes de Compra</Text>
              </View>
              <TouchableOpacity onPress={() => router.push('/(admin)/nueva-orden-compra')} style={styles.newBtn}>
                <Ionicons name="add" size={20} color="#fff" />
                {Platform.OS === 'web' && <Text style={styles.newBtnText}>Nueva</Text>}
              </TouchableOpacity>
            </View>

            <View style={styles.mobileSearchWrapper}>
              <View style={styles.mobileSearchContainer}>
                <Ionicons name="search" size={20} color={themeColors.textSecondary} />
                <TextInput
                  style={styles.mobileSearchInput}
                  placeholder="Buscar por folio, proveedor o referencia..."
                  placeholderTextColor={themeColors.textSecondary}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={20} color={themeColors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {isLoading ? (
              <View style={{ padding: Spacing.three, paddingBottom: 100 }}>
                <CotizacionesCardsListSkeleton count={5} />
              </View>
            ) : (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: Spacing.three, paddingBottom: 100 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              >
                {filteredOrdenes.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Ionicons name="bag-handle-outline" size={48} color={themeColors.textSecondary} />
                    <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.two, textAlign: 'center' }}>
                      {searchQuery ? 'No se encontraron órdenes con esa búsqueda.' : 'No hay órdenes de compra registradas aún.'}
                    </Text>
                  </View>
                ) : (
                  paginatedOrdenes.map((oc) => {
                    const estado = oc.estatus_proceso || 'En Proceso';
                    const config = getStatusConfig(estado, scheme === 'dark');
                    const lineas = Array.isArray(oc.lineas) ? oc.lineas : [];
                    return (
                      <View key={oc.id} style={styles.card}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="bag-handle" size={16} color={themeColors.primary} />
                            <Text style={styles.folio}>FOLIO #{oc.folio}</Text>
                          </View>
                          <View
                            style={[
                              styles.badge,
                              {
                                backgroundColor: config.bg,
                                borderWidth: 1,
                                borderColor: config.color + '30',
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 4,
                                paddingVertical: 2,
                                paddingHorizontal: 6,
                              },
                            ]}
                          >
                            <Ionicons name={config.icon} size={11} color={config.color} />
                            <Text style={{ fontSize: 9, fontWeight: 'bold', color: config.color }}>{estado}</Text>
                          </View>
                        </View>

                        <Text style={styles.cardProveedor}>{oc.proveedor_nombre || 'Proveedor sin nombre'}</Text>
                        {!!oc.referencia && (
                          <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginBottom: 4 }}>
                            Ref: {oc.referencia}
                          </Text>
                        )}

                        {lineas.length > 0 && (
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 6,
                              marginVertical: 8,
                              backgroundColor: themeColors.background,
                              padding: 8,
                              borderRadius: 6,
                            }}
                          >
                            <Ionicons name="cube-outline" size={14} color={themeColors.textSecondary} />
                            <Text style={{ fontSize: 11, color: themeColors.textSecondary, flex: 1 }} numberOfLines={1}>
                              {lineas.length} {lineas.length === 1 ? 'partida' : 'partidas'} • {lineas[0]?.productoNombre || ''}
                            </Text>
                          </View>
                        )}

                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginTop: 8,
                            borderTopWidth: 1,
                            borderTopColor: themeColors.border + '50',
                            paddingTop: 8,
                          }}
                        >
                          <View style={{ gap: 2 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Ionicons name="calendar-outline" size={12} color={themeColors.textSecondary} />
                              <Text style={styles.cardFecha}>Fecha: {oc.fecha_creacion}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Ionicons name="person-outline" size={12} color={themeColors.textSecondary} />
                              <Text style={styles.cardFecha}>Realizó: {oc.realizo_compra || 'Admin'}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Ionicons name="receipt-outline" size={12} color={themeColors.textSecondary} />
                              <Text style={styles.cardFecha}>
                                Facturar: {oc.facturar ? 'SI' : 'NO'} • {oc.moneda || 'MXN'}
                              </Text>
                            </View>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text
                              style={{
                                fontSize: 10,
                                color: themeColors.textSecondary,
                                fontWeight: 'bold',
                                textTransform: 'uppercase',
                              }}
                            >
                              Total
                            </Text>
                            <Text style={styles.cardTotal}>{formatearMoneda(oc.total, oc.moneda)}</Text>
                          </View>
                        </View>

                        <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: themeColors.border + '50', paddingTop: 10 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                            <ActionButtonWithTooltip
                              icon="eye-outline"
                              iconSize={16}
                              color={getActionBtnStyle('view', scheme === 'dark').color}
                              bgColor={getActionBtnStyle('view', scheme === 'dark').bg}
                              tooltip="Ver PDF"
                              isCircular
                              onPress={() => handleDownloadPDF(oc, 'view')}
                            />
                            <ActionButtonWithTooltip
                              icon="download-outline"
                              iconSize={16}
                              color={getActionBtnStyle('download', scheme === 'dark').color}
                              bgColor={getActionBtnStyle('download', scheme === 'dark').bg}
                              tooltip="Descargar PDF"
                              isCircular
                              onPress={() => handleDownloadPDF(oc, 'download')}
                            />
                            <ActionButtonWithTooltip
                              icon="copy-outline"
                              iconSize={16}
                              color={getActionBtnStyle('view', scheme === 'dark').color}
                              bgColor={getActionBtnStyle('view', scheme === 'dark').bg}
                              tooltip="Duplicar Orden"
                              isCircular
                              onPress={() => handleDuplicate(oc)}
                            />
                            <ActionButtonWithTooltip
                              icon="pencil-outline"
                              iconSize={16}
                              color={getActionBtnStyle('edit', scheme === 'dark').color}
                              bgColor={getActionBtnStyle('edit', scheme === 'dark').bg}
                              tooltip="Editar Orden"
                              isCircular
                              onPress={() => router.push(`/(admin)/nueva-orden-compra?id=${oc.id}`)}
                            />
                            <ActionButtonWithTooltip
                              icon="trash-outline"
                              iconSize={16}
                              color={getActionBtnStyle('delete', scheme === 'dark').color}
                              bgColor={getActionBtnStyle('delete', scheme === 'dark').bg}
                              tooltip="Eliminar Orden"
                              isCircular
                              onPress={() => handleDelete(oc.id)}
                            />
                          </View>
                        </View>
                      </View>
                    );
                  })
                )}

                {filteredOrdenes.length > 0 && (
                  <PaginationControls
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={filteredOrdenes.length}
                    itemsPerPage={pageSize}
                    onPageChange={setCurrentPage}
                    onItemsPerPageChange={(newSize: number) => {
                      setPageSize(newSize);
                      setCurrentPage(1);
                    }}
                    itemsPerPageOptions={[20, 25, 50, 100]}
                    isLoading={isLoading}
                    style={{ marginTop: 14, marginBottom: 20 }}
                  />
                )}
              </ScrollView>
            )}

            {Platform.OS !== 'web' && (
              <TouchableOpacity style={styles.fab} onPress={() => router.push('/(admin)/nueva-orden-compra')}>
                <Ionicons name="add" size={30} color="#fff" />
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const getStyles = (themeColors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: themeColors.background },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: Spacing.three,
      paddingVertical: Spacing.three,
      borderBottomWidth: 1,
      borderBottomColor: themeColors.border,
      backgroundColor: themeColors.backgroundElement,
    },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: themeColors.text },
    newBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: BorderRadius.medium,
      backgroundColor: themeColors.primary,
    },
    newBtnText: { color: '#fff', fontWeight: 'bold', marginLeft: 8 },
    card: {
      padding: Spacing.three,
      borderRadius: BorderRadius.large,
      borderWidth: 1,
      marginBottom: Spacing.two,
      backgroundColor: themeColors.backgroundElement,
      borderColor: themeColors.border,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.05,
          shadowRadius: 12,
        },
        android: { elevation: 2 },
        web: { boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)' },
      }),
    },
    folio: { fontSize: 14, fontWeight: '800', color: themeColors.text },
    badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
    emptyCard: {
      padding: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderRadius: BorderRadius.large,
      marginTop: Spacing.four,
      backgroundColor: themeColors.backgroundElement,
      borderColor: themeColors.border,
    },
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 20,
      width: 60,
      height: 60,
      borderRadius: 30,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 5,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      backgroundColor: themeColors.primary,
    },
    desktopToolbar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 8,
      backgroundColor: themeColors.backgroundElement,
      borderBottomWidth: 1,
      borderBottomColor: themeColors.border,
    },
    desktopToolbarLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
    iconCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: '#e67e22',
      alignItems: 'center',
      justifyContent: 'center',
    },
    desktopModuleTitle: { fontSize: 16, fontWeight: '700', color: themeColors.text },
    countBadge: {
      backgroundColor: themeColors.accent + '20',
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 10,
    },
    countBadgeText: { fontSize: 11, fontWeight: '700', color: themeColors.accent },
    desktopSearchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: themeColors.background,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: themeColors.border,
      paddingHorizontal: 10,
      paddingVertical: 4,
      width: 260,
      marginLeft: 6,
      gap: 6,
    },
    desktopSearchInput: {
      flex: 1,
      fontSize: 12,
      color: themeColors.text,
      padding: 0,
      outlineStyle: 'none',
    } as any,
    desktopToolbarRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: themeColors.primary,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 6,
    },
    addButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
    chipBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
    tableContainer: {
      width: '100%',
      backgroundColor: themeColors.backgroundElement,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: themeColors.border,
      overflow: 'hidden',
      ...Platform.select({
        web: { boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)' },
      }),
    },
    tableHeaderRow: {
      flexDirection: 'row',
      backgroundColor: themeColors.background,
      borderBottomWidth: 1,
      borderBottomColor: themeColors.border,
      paddingVertical: 10,
      paddingHorizontal: 8,
      alignItems: 'center',
      width: '100%',
    },
    tableHeaderCell: { fontSize: 12, fontWeight: 'bold', color: themeColors.text },
    tableRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: themeColors.border,
      paddingVertical: 10,
      paddingHorizontal: 8,
      alignItems: 'center',
      width: '100%',
    },
    tableCell: { fontSize: 12, color: themeColors.text },
    rowActionsContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
    noResultsTable: { alignItems: 'center', justifyContent: 'center', padding: 30 },
    expandedDetailRow: {
      backgroundColor: themeColors.background,
      borderBottomWidth: 1,
      borderBottomColor: themeColors.border,
      padding: 16,
      paddingLeft: 40,
    },
    detailTitle: { fontSize: 13, fontWeight: 'bold', color: themeColors.accent, marginBottom: 8 },
    detailLineItem: {
      flexDirection: 'row',
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: themeColors.border,
      alignItems: 'flex-start',
    },
    detailFooter: { marginTop: 12, alignItems: 'flex-end', gap: 4, paddingRight: 10 },
    detailFooterText: { fontSize: 12, color: themeColors.text },
    desktopScrollView: { flex: 1, backgroundColor: themeColors.background },
    mobileSearchWrapper: {
      paddingHorizontal: Spacing.three,
      paddingBottom: Spacing.two,
      paddingTop: Spacing.two,
      backgroundColor: themeColors.backgroundElement,
      borderBottomWidth: 1,
      borderBottomColor: themeColors.border,
    },
    mobileSearchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: themeColors.background,
      borderRadius: BorderRadius.medium,
      paddingHorizontal: Spacing.two,
      borderWidth: 1,
      borderColor: themeColors.border,
    },
    mobileSearchInput: { flex: 1, paddingVertical: 10, paddingHorizontal: 10, color: themeColors.text },
    cardProveedor: { fontSize: 15, color: themeColors.text, fontWeight: '600', marginBottom: 2 },
    cardFecha: { fontSize: 11, color: themeColors.textSecondary },
    cardTotal: { fontSize: 18, fontWeight: '900', color: themeColors.primary },
  });
