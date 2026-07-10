import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Platform, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/services/supabase';
import { exportarCotizacionOdooPDF } from '@/utils/reportGenerator';
import { Cotizacion } from '@/types/ventas';

export default function CotizacionesListScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  
  const [cotizaciones, setCotizaciones] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCotizaciones = cotizaciones.filter((cot) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      (cot.folio && cot.folio.toLowerCase().includes(query)) ||
      (cot.cliente_nombre && cot.cliente_nombre.toLowerCase().includes(query)) ||
      (cot.estado && cot.estado.toLowerCase().includes(query))
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
    fetchCotizaciones();
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
      if (Platform.OS === 'web') {
        window.alert('Error al generar PDF: ' + error.message);
      }
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
      if (Platform.OS === 'web') {
        window.alert('Error al eliminar la cotización.');
      } else {
        Alert.alert('Error', 'No se pudo eliminar la cotización.');
      }
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* HEADER */}
      <View style={[styles.header, { borderBottomColor: themeColors.border, backgroundColor: themeColors.backgroundElement }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => router.push('/(admin)/dashboard')} style={{ paddingRight: Spacing.two }}>
            <Ionicons name="arrow-back" size={24} color={themeColors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Cotizaciones</Text>
        </View>
        <TouchableOpacity 
          onPress={() => router.push('/(admin)/nueva-cotizacion')}
          style={[styles.newBtn, { backgroundColor: themeColors.primary }]}
        >
          <Ionicons name="add" size={20} color="#fff" />
          {Platform.OS === 'web' && <Text style={styles.newBtnText}>Nueva</Text>}
        </TouchableOpacity>
      </View>

      {/* BUSCADOR */}
      <View style={{ paddingHorizontal: Spacing.three, paddingBottom: Spacing.two, paddingTop: Spacing.two, backgroundColor: themeColors.backgroundElement, borderBottomWidth: 1, borderBottomColor: themeColors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: themeColors.background, borderRadius: BorderRadius.medium, paddingHorizontal: Spacing.two, borderWidth: 1, borderColor: themeColors.border }}>
          <Ionicons name="search" size={20} color={themeColors.textSecondary} />
          <TextInput
            style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 10, color: themeColors.text }}
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
            <View style={[styles.emptyCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
              <Ionicons name="document-text-outline" size={48} color={themeColors.textSecondary} />
              <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.two, textAlign: 'center' }}>
                {searchQuery ? 'No se encontraron cotizaciones con esa búsqueda.' : 'No hay cotizaciones registradas aún.'}
              </Text>
            </View>
          ) : (
            filteredCotizaciones.map((cot) => (
              <View key={cot.id} style={[styles.card, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <Text style={[styles.folio, { color: themeColors.primary }]}>Folio: {cot.folio}</Text>
                  {(() => {
                    const estado = cot.estado || 'Borrador';
                    let activeColor: string = themeColors.primary;
                    switch(estado) {
                      case 'Borrador': activeColor = '#757575'; break;
                      case 'Enviado': activeColor = '#FF9800'; break;
                      case 'Aprobada': activeColor = '#4CAF50'; break;
                      case 'Orden de Compra': activeColor = '#2196F3'; break;
                    }
                    return (
                      <View style={[styles.badge, { backgroundColor: activeColor + '20', borderWidth: 1, borderColor: activeColor }]}>
                        <Text style={{ fontSize: 10, fontWeight: 'bold', color: activeColor }}>
                          {estado}
                        </Text>
                      </View>
                    );
                  })()}
                </View>
                <Text style={{ fontSize: 15, color: themeColors.text, fontWeight: '600', marginBottom: 4 }}>
                  {cot.cliente_nombre || 'Cliente sin nombre'}
                </Text>
                
                <View style={{ marginTop: Spacing.two }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: Spacing.two }}>
                    <View>
                      <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginBottom: 4 }}>
                        Fecha: {cot.fecha_creacion}
                      </Text>
                      <Text style={{ fontSize: 16, fontWeight: 'bold', color: themeColors.accent }}>
                        {formatearMoneda(cot.total)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                      <TouchableOpacity onPress={() => handleDelete(cot.id)} style={{ padding: 8 }}>
                        <Ionicons name="trash-outline" size={20} color="#e53935" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => router.push(`/(admin)/nueva-cotizacion?id=${cot.id}`)} style={{ padding: 8 }}>
                        <Ionicons name="pencil-outline" size={20} color={themeColors.primary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity 
                      onPress={() => handleDownloadPDF(cot, 'view')}
                      style={{ flex: 1, backgroundColor: themeColors.primary + '15', padding: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Ionicons name="eye-outline" size={16} color={themeColors.primary} style={{ marginRight: 6 }} />
                      <Text style={{ color: themeColors.primary, fontSize: 13, fontWeight: 'bold' }}>Ver PDF</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => handleDownloadPDF(cot, 'download')}
                      style={{ flex: 1, backgroundColor: themeColors.primary, padding: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Ionicons name="download-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                      <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: 'bold' }}>Descargar</Text>
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
          style={[styles.fab, { backgroundColor: themeColors.primary }]}
          onPress={() => router.push('/(admin)/nueva-cotizacion')}
        >
          <Ionicons name="add" size={30} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BorderRadius.medium,
  },
  newBtnText: { color: '#fff', fontWeight: 'bold', marginLeft: 8 },
  card: {
    padding: Spacing.three,
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    marginBottom: Spacing.two,
  },
  folio: { fontSize: 13, fontWeight: 'bold' },
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
  },
});
