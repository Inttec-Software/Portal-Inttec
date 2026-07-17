import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Platform, TextInput, Alert, useWindowDimensions, Image, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/services/supabase';
import { exportarCotizacionOdooPDF } from '@/utils/reportGenerator';
import { Cotizacion } from '@/types/ventas';

const getStatusConfig = (estado: string, isDark: boolean) => {
  switch(estado) {
    case 'Borrador':
      return {
        color: isDark ? '#f8f9fa' : '#343a40',
        bg: isDark ? '#495057' : '#e9ecef',
        icon: 'document-outline' as const
      };
    case 'Enviado':
      return {
        color: isDark ? '#fef08a' : '#b45309',
        bg: isDark ? '#78350f' : '#fef3c7',
        icon: 'paper-plane-outline' as const
      };
    case 'Aprobada':
      return {
        color: isDark ? '#a7f3d0' : '#047857',
        bg: isDark ? '#064e3b' : '#d1fae5',
        icon: 'checkmark-circle-outline' as const
      };
    case 'Orden de Compra':
      return {
        color: isDark ? '#bae6fd' : '#0369a1',
        bg: isDark ? '#0c4a6e' : '#e0f2fe',
        icon: 'cart-outline' as const
      };
    default:
      return {
        color: isDark ? '#e0f2fe' : '#0369a1',
        bg: isDark ? '#0c4a6e' : '#e0f2fe',
        icon: 'document-text-outline' as const
      };
  }
};

const getActionBtnStyle = (action: 'view' | 'download' | 'email' | 'edit' | 'delete', isDark: boolean) => {
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
    case 'email':
      return {
        bg: isDark ? '#07354c' : '#e0f2fe',
        color: isDark ? '#38bdf8' : '#0284c7',
      };
    case 'edit':
      return {
        bg: isDark ? '#3d2c00' : '#fef3c7',
        color: isDark ? '#fbbf24' : '#d97706',
      };
    case 'delete':
      return {
        bg: isDark ? '#450a0a' : '#fee2e2',
        color: isDark ? '#f87171' : '#ef4444',
      };
  }
};

export default function CotizacionesListScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { width } = useWindowDimensions();
  const styles = React.useMemo(() => getStyles(themeColors), [themeColors]);

  // Se considera Desktop si es ambiente web y el ancho de pantalla es >= 1024
  const isDesktop = Platform.OS === 'web' && width >= 1024;

  const [cotizaciones, setCotizaciones] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const filteredCotizaciones = cotizaciones.filter((cot) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      (cot.folio && cot.folio.toLowerCase().includes(query)) ||
      (cot.cliente_nombre && cot.cliente_nombre.toLowerCase().includes(query)) ||
      (cot.estado && cot.estado.toLowerCase().includes(query)) ||
      (cot.vendedor && cot.vendedor.toLowerCase().includes(query))
    );
  });

  const fetchCotizaciones = async () => {
    try {
      const { data, error } = await supabase
        .from('cotizaciones')
        .select('*')
        .order('creado_en', { ascending: false });

      if (error) throw error;
      setCotizaciones(data || []);
    } catch (err) {
      console.error('Error fetching cotizaciones:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        const { data, error } = await supabase
          .from('cotizaciones')
          .select('*')
          .order('creado_en', { ascending: false });

        if (error) throw error;
        if (active) setCotizaciones(data || []);
      } catch (err) {
        console.error('Error fetching cotizaciones:', err);
      } finally {
        if (active) {
          setIsLoading(false);
          setRefreshing(false);
        }
      }
    };
    init();
    return () => {
      active = false;
    };
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchCotizaciones();
  };

  const formatearMoneda = (cantidad: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(cantidad || 0);
  };

  const handleDownloadPDF = async (cot: any, action: 'view' | 'download' = 'view') => {
    try {
      // Intentar obtener los datos completos del cliente de la base de datos
      const { data: clientData } = await supabase
        .from('clientes')
        .select('*')
        .eq('nombre', cot.cliente_nombre)
        .single();

      // Reconstruir objeto Cotizacion a partir de la BD
      const cotData: Cotizacion = {
        id: cot.id,
        numeroCotizacion: cot.folio,
        clienteNombre: cot.cliente_nombre,
        clienteRFC: clientData?.rfc || '',
        clienteCorreo: clientData?.correo_electronico || '',
        clienteCP: clientData?.codigo_postal || '',
        direccionFactura: clientData?.direccion || '',
        vendedor: cot.vendedor || '',
        moneda: cot.moneda || 'MXN',
        fechaCreacion: cot.fecha_creacion,
        subtotal: cot.subtotal,
        iva: cot.iva,
        total: cot.total,
        lineas: cot.lineas || [],
        terminosCondiciones: cot.terminos_condiciones || 'https://inttec.odoo.com/terms',
      };
      
      await exportarCotizacionOdooPDF(cotData, action);
    } catch (error: any) {
      showAlert('Error al generar PDF', error.message || 'Ocurrió un error.');
    }
  };

  const handleDelete = (id: string) => {
    if (Platform.OS === 'web') {
      if (window.confirm('¿Estás seguro de que deseas eliminar esta cotización?')) {
        ejecutarEliminacion(id);
      }
    } else {
      Alert.alert(
        'Eliminar Cotización',
        '¿Estás seguro de que deseas eliminar esta cotización?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Eliminar', style: 'destructive', onPress: () => ejecutarEliminacion(id) }
        ]
      );
    }
  };

  const ejecutarEliminacion = async (id: string) => {
    try {
      const { error } = await supabase.from('cotizaciones').delete().eq('id', id);
      if (error) throw error;
      fetchCotizaciones();
    } catch (err) {
      console.error('Error al eliminar:', err);
      showAlert('Error', 'No se pudo eliminar la cotización.');
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleDuplicate = async (cot: any) => {
    try {
      setIsLoading(true);
      // Obtener el último folio secuencial para generar el siguiente
      const { data: lastData } = await supabase
        .from('cotizaciones')
        .select('folio')
        .order('folio', { ascending: false })
        .limit(1);

      let newFolio = (new Date().getFullYear() % 100).toString() + "0001";
      if (lastData && lastData.length > 0) {
        const lastFolio = parseInt(lastData[0].folio, 10);
        if (!isNaN(lastFolio)) {
          newFolio = (lastFolio + 1).toString();
        }
      }

      const { error } = await supabase.from('cotizaciones').insert([
        {
          folio: newFolio,
          cliente_nombre: cot.cliente_nombre,
          vendedor: cot.vendedor,
          moneda: cot.moneda,
          fecha_creacion: new Date().toLocaleDateString('es-MX'),
          subtotal: cot.subtotal,
          iva: cot.iva,
          total: cot.total,
          lineas: cot.lineas,
          terminos_condiciones: cot.terminos_condiciones,
          estado: 'Borrador'
        }
      ]);

      if (error) throw error;
      showAlert('Éxito', `Cotización duplicada con éxito. Nuevo folio: ${newFolio}`);
      fetchCotizaciones();
    } catch (err: any) {
      console.error('Error duplicando cotización:', err);
      showAlert('Error', 'No se pudo duplicar la cotización: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmail = async (cot: any) => {
    try {
      const { data: clientData } = await supabase
        .from('clientes')
        .select('correo_electronico')
        .eq('nombre', cot.cliente_nombre)
        .single();

      const defaultEmail = clientData?.correo_electronico || 'cliente@correo.com';

      if (Platform.OS === 'web') {
        const dest = window.prompt(`Enviar cotización folio ${cot.folio} a:`, defaultEmail);
        if (dest) {
          showAlert('Éxito', `La cotización se ha enviado correctamente a: ${dest}`);
        }
      } else {
        Alert.alert(
          'Enviar Cotización',
          `¿Deseas enviar la cotización ${cot.folio} a ${defaultEmail}?`,
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Enviar', onPress: () => showAlert('Éxito', `Cotización enviada a ${defaultEmail}`) }
          ]
        );
      }
    } catch (_err) {
      showAlert('Error', 'No se pudo obtener el correo del cliente.');
    }
  };

  const handleComments = (cot: any) => {
    const comments = cot.lineas?.[0]?.productoDescripcion || 'Sin comentarios registrados.';
    if (Platform.OS === 'web') {
      window.alert(`Notas y descripción de Cotización ${cot.folio}:\n\n${comments}`);
    } else {
      Alert.alert(`Comentarios - ${cot.folio}`, comments);
    }
  };

  const toggleRowExpansion = (id: string) => {
    if (expandedRowId === id) {
      setExpandedRowId(null);
    } else {
      setExpandedRowId(id);
    }
  };

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  // HEADER CORPORATIVO (EXCLUSIVO ESCRITORIO WEB)
  const renderDesktopHeader = () => (
    <View style={styles.desktopNavBar}>
      <View style={styles.desktopNavBarLeft}>
        <Image 
          source={require('@/assets/images/logo.jpeg')} 
          style={styles.desktopLogo} 
          resizeMode="contain"
        />
        <View style={styles.desktopLogoTexts}>
          <Text style={styles.desktopLogoTitle}>INTTEC</Text>
          <Text style={styles.desktopLogoSubtitle}>INTEGRACIÓN DE TECNOLOGÍAS</Text>
        </View>
      </View>
      <View style={styles.desktopNavBarRight}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.push('/(admin)/dashboard')}
        >
          <Ionicons name="arrow-back" size={16} color="#ffffff" />
          <Text style={styles.backButtonText}>Regresar al Dashboard</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // SUB-HEADER BAR (EXCLUSIVO ESCRITORIO WEB)
  const renderDesktopToolbar = () => (
    <View style={styles.desktopToolbar}>
      <View style={styles.desktopToolbarLeft}>
        <View style={styles.calculatorCircle}>
          <Ionicons name="calculator" size={20} color="#fff" />
        </View>
        <Text style={styles.desktopModuleTitle}>Cotizaciones</Text>
        <View style={styles.desktopSearchContainer}>
          <TextInput
            style={styles.desktopSearchInput}
            placeholder="Buscar"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <Ionicons name="search" size={18} color="#00C3F3" style={styles.searchIconInside} />
        </View>
      </View>
      <View style={styles.desktopToolbarRight}>
        <TouchableOpacity 
          onPress={() => router.push('/(admin)/nueva-cotizacion')}
          style={styles.addCotizacionButton}
        >
          <Text style={styles.addCotizacionButtonText}>+ Agregar Cotización</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // TABLA DE COTIZACIONES DE ALTA FIDELIDAD (WEB/DESKTOP)
  const renderDesktopTable = () => (
    <View style={styles.tableContainer}>
      {/* Encabezado de la Tabla */}
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.tableHeaderCell, { width: '5%', fontWeight: 'bold' }]}>No. C</Text>
        <Text style={[styles.tableHeaderCell, { width: '8%', fontWeight: 'bold' }]}>Folio Alt</Text>
        <Text style={[styles.tableHeaderCell, { width: '10%', fontWeight: 'bold' }]}>Fecha de Emisión</Text>
        <Text style={[styles.tableHeaderCell, { width: '8%', fontWeight: 'bold' }]}>Usuario</Text>
        <Text style={[styles.tableHeaderCell, { width: '18%', fontWeight: 'bold' }]}>Empresa</Text>
        <Text style={[styles.tableHeaderCell, { width: '13%', fontWeight: 'bold' }]}>Referencia</Text>
        <Text style={[styles.tableHeaderCell, { width: '10%', fontWeight: 'bold' }]}>Estado</Text>
        <Text style={[styles.tableHeaderCell, { width: '12%', fontWeight: 'bold', textAlign: 'right' }]}>Total</Text>
        
        {/* Acciones Header con iconos pequeños */}
        <View style={[styles.tableHeaderCell, styles.headerActionsContainer, { width: '16%' }]}>
          <Ionicons name="eye-outline" size={12} color={themeColors.accent} />
          <Ionicons name="pencil-outline" size={12} color={themeColors.accent} />
          <Ionicons name="document-text-outline" size={12} color={themeColors.accent} />
          <Ionicons name="mail-outline" size={12} color={themeColors.accent} />
          <Ionicons name="chatbubble-ellipses-outline" size={12} color={themeColors.accent} />
          <Ionicons name="chevron-down" size={12} color={themeColors.accent} />
          <Ionicons name="trash-outline" size={12} color={themeColors.danger} />
        </View>
      </View>

      {/* Cuerpo de la Tabla */}
      {filteredCotizaciones.length === 0 ? (
        <View style={styles.noResultsTable}>
          <Text style={{ color: '#888', textAlign: 'center', padding: 24 }}>
            {searchQuery ? 'No se encontraron cotizaciones con esa búsqueda.' : 'No hay cotizaciones registradas aún.'}
          </Text>
        </View>
      ) : (
        filteredCotizaciones.map((cot, index) => {
          const sequentialId = 1532 + (filteredCotizaciones.length - 1 - index);
          const firstLineName = cot.lineas?.[0]?.productoNombre || 'Sin referencia';
          
          return (
            <View key={cot.id}>
              <Pressable 
                onPress={() => toggleRowExpansion(cot.id)}
                onHoverIn={() => setHoveredRowId(cot.id)}
                onHoverOut={() => setHoveredRowId(null)}
                style={[
                  styles.tableRow,
                  hoveredRowId === cot.id && { backgroundColor: themeColors.backgroundSelected },
                  expandedRowId === cot.id && { borderBottomWidth: 0, backgroundColor: themeColors.backgroundSelected }
                ]}
              >
                <Text style={[styles.tableCell, { width: '5%', color: themeColors.textSecondary }]}>{sequentialId}</Text>
                <Text style={[styles.tableCell, { width: '8%', color: themeColors.textSecondary }]}>{cot.folio}</Text>
                <Text style={[styles.tableCell, { width: '10%' }]}>{cot.fecha_creacion}</Text>
                <Text style={[styles.tableCell, { width: '8%' }]}>{cot.vendedor || 'Admin'}</Text>
                <Text style={[styles.tableCell, { width: '18%', fontWeight: '500' }]} numberOfLines={1}>{cot.cliente_nombre}</Text>
                <Text style={[styles.tableCell, { width: '13%', color: themeColors.textSecondary }]} numberOfLines={1}>{firstLineName}</Text>
                <View style={[styles.tableCell, { width: '10%' }]}>
                  {(() => {
                    const estado = cot.estado || 'Borrador';
                    const config = getStatusConfig(estado, scheme === 'dark');
                    return (
                      <View style={[styles.badge, { backgroundColor: config.bg, borderWidth: 1, borderColor: config.color + '30', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 10, alignSelf: 'flex-start' }]}>
                        <Text style={{ fontSize: 9, fontWeight: 'bold', color: config.color }}>
                          {estado}
                        </Text>
                      </View>
                    );
                  })()}
                </View>
                <Text style={[styles.tableCell, { width: '12%', fontWeight: 'bold', textAlign: 'right' }]}>{formatearMoneda(cot.total)}</Text>
                
                {/* 7 Iconos de acción */}
                <View style={[styles.tableCell, styles.rowActionsContainer, { width: '16%' }]}>
                  {/* 1. Ver PDF */}
                  <TouchableOpacity onPress={() => handleDownloadPDF(cot, 'view')} style={styles.rowActionBtn}>
                    <Ionicons name="eye-outline" size={14} color={themeColors.textSecondary} />
                  </TouchableOpacity>
                  {/* 2. Editar */}
                  <TouchableOpacity onPress={() => router.push(`/(admin)/nueva-cotizacion?id=${cot.id}`)} style={styles.rowActionBtn}>
                    <Ionicons name="pencil-outline" size={14} color={themeColors.textSecondary} />
                  </TouchableOpacity>
                  {/* 3. Descargar PDF */}
                  <TouchableOpacity onPress={() => handleDownloadPDF(cot, 'download')} style={styles.rowActionBtn}>
                    <Ionicons name="document-text-outline" size={14} color={themeColors.textSecondary} />
                  </TouchableOpacity>
                  {/* 4. Enviar Correo */}
                  <TouchableOpacity onPress={() => handleEmail(cot)} style={styles.rowActionBtn}>
                    <Ionicons name="mail-outline" size={14} color={themeColors.textSecondary} />
                  </TouchableOpacity>
                  {/* 5. Comentarios */}
                  <TouchableOpacity onPress={() => handleComments(cot)} style={styles.rowActionBtn}>
                    <Ionicons name="chatbubble-ellipses-outline" size={14} color={themeColors.textSecondary} />
                  </TouchableOpacity>
                  {/* 6. Detalles */}
                  <TouchableOpacity onPress={() => toggleRowExpansion(cot.id)} style={styles.rowActionBtn}>
                    <Ionicons name={expandedRowId === cot.id ? "chevron-up" : "chevron-down"} size={14} color={themeColors.textSecondary} />
                  </TouchableOpacity>
                  {/* 7. Eliminar */}
                  <TouchableOpacity onPress={() => handleDelete(cot.id)} style={styles.rowActionBtn}>
                    <Ionicons name="trash-outline" size={14} color={themeColors.danger} />
                  </TouchableOpacity>
                </View>
              </Pressable>

              {/* Fila expandida con detalles de partidas */}
              {expandedRowId === cot.id && (
                <View style={styles.expandedDetailRow}>
                  <Text style={styles.detailTitle}>Partidas de la Cotización {cot.folio}:</Text>
                  {cot.lineas && cot.lineas.length > 0 ? (
                    cot.lineas.map((linea: any, lIndex: number) => (
                      <View key={lIndex} style={styles.detailLineItem}>
                        <Text style={{ width: '40%', fontWeight: '500', color: themeColors.text }}>{linea.productoNombre}</Text>
                        <Text style={{ width: '30%', color: themeColors.textSecondary, fontSize: 13 }}>{linea.productoDescripcion}</Text>
                        <Text style={{ width: '10%', textAlign: 'right', color: themeColors.textSecondary }}>Cant: {linea.cantidad}</Text>
                        <Text style={{ width: '10%', textAlign: 'right', color: themeColors.textSecondary }}>P.U: {formatearMoneda(linea.precioUnitario)}</Text>
                        <Text style={{ width: '10%', textAlign: 'right', fontWeight: 'bold', color: themeColors.text }}>{formatearMoneda(linea.importe || (linea.cantidad * linea.precioUnitario))}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={{ color: themeColors.textSecondary, fontStyle: 'italic' }}>Sin partidas registradas</Text>
                  )}
                  
                  <View style={styles.detailFooter}>
                    <Text style={styles.detailFooterText}>Subtotal: {formatearMoneda(cot.subtotal)}</Text>
                    <Text style={styles.detailFooterText}>IVA: {formatearMoneda(cot.iva)}</Text>
                    <Text style={[styles.detailFooterText, { fontWeight: 'bold', fontSize: 14 }]}>Total: {formatearMoneda(cot.total)}</Text>
                  </View>
                </View>
              )}
            </View>
          );
        })
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {isDesktop ? (
        // --- DISEÑO DESCRITORIO WEB (ALTA FIDELIDAD) ---
        <View style={{ flex: 1 }}>
          {renderDesktopHeader()}
          {renderDesktopToolbar()}
          <ScrollView style={styles.desktopScrollView}>
            <View style={{ paddingHorizontal: 24, paddingVertical: 12 }}>
              {renderDesktopTable()}
            </View>
          </ScrollView>
        </View>
      ) : (
        // --- DISEÑO MÓVIL/TABLETA ORIGINAL RESPETADO ---
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
          {/* HEADER MÓVIL */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity onPress={() => router.push('/(admin)/dashboard')} style={{ paddingRight: Spacing.two }}>
                <Ionicons name="arrow-back" size={24} color={themeColors.text} />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Cotizaciones</Text>
            </View>
            <TouchableOpacity 
              onPress={() => router.push('/(admin)/nueva-cotizacion')}
              style={styles.newBtn}
            >
              <Ionicons name="add" size={20} color="#fff" />
              {Platform.OS === 'web' && <Text style={styles.newBtnText}>Nueva</Text>}
            </TouchableOpacity>
          </View>

          {/* BUSCADOR MÓVIL */}
          <View style={styles.mobileSearchWrapper}>
            <View style={styles.mobileSearchContainer}>
              <Ionicons name="search" size={20} color={themeColors.textSecondary} />
              <TextInput
                style={styles.mobileSearchInput}
                placeholder="Buscar por folio, cliente o estado..."
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
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color={themeColors.primary} />
            </View>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: Spacing.three, paddingBottom: 100 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
              {filteredCotizaciones.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="document-text-outline" size={48} color={themeColors.textSecondary} />
                  <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.two, textAlign: 'center' }}>
                    {searchQuery ? 'No se encontraron cotizaciones con esa búsqueda.' : 'No hay cotizaciones registradas aún.'}
                  </Text>
                </View>
              ) : (
                filteredCotizaciones.map((cot) => (
                  <View key={cot.id} style={styles.card}>
                    {/* Header: Folio & Status Badge */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="document-text-sharp" size={16} color={themeColors.primary} />
                        <Text style={styles.folio}>#{cot.folio}</Text>
                      </View>
                      {(() => {
                        const estado = cot.estado || 'Borrador';
                        const config = getStatusConfig(estado, scheme === 'dark');
                        return (
                          <View style={[styles.badge, { backgroundColor: config.bg, borderWidth: 1, borderColor: config.color + '30', flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2, paddingHorizontal: 6 }]}>
                            <Ionicons name={config.icon} size={11} color={config.color} />
                            <Text style={{ fontSize: 9, fontWeight: 'bold', color: config.color }}>
                              {estado}
                            </Text>
                          </View>
                        );
                      })()}
                    </View>

                    {/* Client Name */}
                    <Text style={styles.cardCliente}>
                      {cot.cliente_nombre || 'Cliente sin nombre'}
                    </Text>

                    {/* Summary of Line Items */}
                    {(() => {
                      const count = cot.lineas?.length || 0;
                      const desc = cot.lineas?.[0]?.productoNombre || '';
                      if (count === 0) return null;
                      return (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 8, backgroundColor: themeColors.background, padding: 8, borderRadius: 6 }}>
                          <Ionicons name="cube-outline" size={14} color={themeColors.textSecondary} />
                          <Text style={{ fontSize: 11, color: themeColors.textSecondary, flex: 1 }} numberOfLines={1}>
                            {count} {count === 1 ? 'partida' : 'partidas'} • {desc}
                          </Text>
                        </View>
                      );
                    })()}
                    
                    {/* Meta info: Date, Vendor, and Total */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, borderTopWidth: 1, borderTopColor: themeColors.border + '50', paddingTop: 8 }}>
                      <View style={{ gap: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="calendar-outline" size={12} color={themeColors.textSecondary} />
                          <Text style={styles.cardFecha}>Fecha: {cot.fecha_creacion}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="person-outline" size={12} color={themeColors.textSecondary} />
                          <Text style={styles.cardFecha}>Vendedor: {cot.vendedor || 'Admin'}</Text>
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 10, color: themeColors.textSecondary, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total</Text>
                        <Text style={styles.cardTotal}>{formatearMoneda(cot.total)}</Text>
                      </View>
                    </View>

                    {/* Action buttons (Row of 5 circular buttons) */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, borderTopWidth: 1, borderTopColor: themeColors.border + '50', paddingTop: 10 }}>
                      <Text style={{ fontSize: 11, color: themeColors.textSecondary, fontWeight: 'bold' }}>Acciones</Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {/* 1. Ver PDF */}
                        <TouchableOpacity 
                          onPress={() => handleDownloadPDF(cot, 'view')}
                          style={[styles.circularActionBtn, { backgroundColor: getActionBtnStyle('view', scheme === 'dark').bg }]}
                        >
                          <Ionicons name="eye-outline" size={15} color={getActionBtnStyle('view', scheme === 'dark').color} />
                        </TouchableOpacity>
                        
                        {/* 2. Descargar PDF */}
                        <TouchableOpacity 
                          onPress={() => handleDownloadPDF(cot, 'download')}
                          style={[styles.circularActionBtn, { backgroundColor: getActionBtnStyle('download', scheme === 'dark').bg }]}
                        >
                          <Ionicons name="download-outline" size={15} color={getActionBtnStyle('download', scheme === 'dark').color} />
                        </TouchableOpacity>

                        {/* 3. Enviar Correo */}
                        <TouchableOpacity 
                          onPress={() => handleEmail(cot)}
                          style={[styles.circularActionBtn, { backgroundColor: getActionBtnStyle('email', scheme === 'dark').bg }]}
                        >
                          <Ionicons name="mail-outline" size={15} color={getActionBtnStyle('email', scheme === 'dark').color} />
                        </TouchableOpacity>

                        {/* 4. Editar */}
                        <TouchableOpacity 
                          onPress={() => router.push(`/(admin)/nueva-cotizacion?id=${cot.id}`)}
                          style={[styles.circularActionBtn, { backgroundColor: getActionBtnStyle('edit', scheme === 'dark').bg }]}
                        >
                          <Ionicons name="pencil-outline" size={15} color={getActionBtnStyle('edit', scheme === 'dark').color} />
                        </TouchableOpacity>

                        {/* 5. Eliminar */}
                        <TouchableOpacity 
                          onPress={() => handleDelete(cot.id)}
                          style={[styles.circularActionBtn, { backgroundColor: getActionBtnStyle('delete', scheme === 'dark').bg }]}
                        >
                          <Ionicons name="trash-outline" size={15} color={getActionBtnStyle('delete', scheme === 'dark').color} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          )}
          
          {/* Floating Action Button (Mobile) */}
          {Platform.OS !== 'web' && (
            <TouchableOpacity 
              style={styles.fab}
              onPress={() => router.push('/(admin)/nueva-cotizacion')}
            >
              <Ionicons name="add" size={30} color="#fff" />
            </TouchableOpacity>
          )}
        </SafeAreaView>
      )}
    </View>
  );
}

const getStyles = (themeColors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: themeColors.background },
  // --- ESTILOS MÓVIL ---
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
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 4px 20px rgba(0,0, 0, 0.03)',
      }
    })
  },
  folio: { fontSize: 14, fontWeight: '800', color: themeColors.text },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
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

  // --- ESTILOS DESKTOP/WEB DE ALTA FIDELIDAD ---
  desktopNavBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: themeColors.backgroundElement,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
  },
  desktopNavBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  desktopLogo: {
    width: 60,
    height: 40,
    marginRight: 10,
  },
  desktopLogoTexts: {
    flexDirection: 'column',
  },
  desktopLogoTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
    color: themeColors.text,
  },
  desktopLogoSubtitle: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: themeColors.textSecondary,
    marginTop: -2,
  },
  desktopNavBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  helpButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: themeColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: themeColors.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 6,
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  adminText: {
    fontSize: 14,
    fontWeight: '600',
    color: themeColors.text,
  },
  matrizText: {
    fontSize: 11,
    color: themeColors.textSecondary,
    marginLeft: -5,
    marginRight: 5,
  },
  avatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  menuNavButton: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  menuNavText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: themeColors.accent,
    marginTop: -2,
  },

  // Toolbar
  desktopToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: themeColors.backgroundElement,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
  },
  desktopToolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  calculatorCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: themeColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  desktopModuleTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: themeColors.text,
  },
  desktopSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: themeColors.background,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    width: 250,
    marginLeft: 15,
  },
  desktopSearchInput: {
    flex: 1,
    fontSize: 13,
    color: themeColors.text,
    padding: 0,
    outlineStyle: 'none',
  } as any,
  searchIconInside: {
    marginLeft: 8,
  },
  desktopToolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addCotizacionButton: {
    backgroundColor: themeColors.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
  },
  addCotizacionButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  menuRightButton: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  menuRightText: {
    fontSize: 8,
    color: themeColors.accent,
    fontWeight: 'bold',
    marginTop: -2,
  },

  // Table
  tableContainer: {
    width: '100%',
    backgroundColor: themeColors.backgroundElement,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: themeColors.border,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)',
      }
    })
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: themeColors.background,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  tableHeaderCell: {
    fontSize: 12,
    color: themeColors.text,
    paddingRight: 10,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  tableCell: {
    fontSize: 13,
    color: themeColors.text,
    paddingRight: 10,
  },
  headerActionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  rowActionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  rowActionBtn: {
    padding: 3,
  },
  noResultsTable: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },

  // Expanded details row
  expandedDetailRow: {
    backgroundColor: themeColors.background,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
    padding: 16,
    paddingLeft: 48,
  },
  detailTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: themeColors.accent,
    marginBottom: 8,
  },
  detailLineItem: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
    alignItems: 'center',
  },
  detailFooter: {
    marginTop: 12,
    alignItems: 'flex-end',
    gap: 4,
    paddingRight: 10,
  },
  detailFooterText: {
    fontSize: 12,
    color: themeColors.text,
  },

  // Extra styles for layout cleaning
  desktopScrollView: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
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
  mobileSearchInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    color: themeColors.text,
  },
  cardCliente: {
    fontSize: 15,
    color: themeColors.text,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardFecha: {
    fontSize: 11,
    color: themeColors.textSecondary,
  },
  cardTotal: {
    fontSize: 18,
    fontWeight: '900',
    color: themeColors.primary,
  },
  viewPdfBtn: {
    flex: 1,
    backgroundColor: themeColors.primary + '15',
    padding: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewPdfBtnText: {
    color: themeColors.primary,
    fontSize: 13,
    fontWeight: 'bold',
  },
  downloadPdfBtn: {
    flex: 1,
    backgroundColor: themeColors.primary,
    padding: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadPdfBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  circularActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
