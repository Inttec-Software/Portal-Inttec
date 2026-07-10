import React, { useState, useEffect } from 'react';
import { View, ScrollView, TouchableOpacity, Alert, StyleSheet, useWindowDimensions, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import CustomInput from '@/components/CustomInput';
import { Cotizacion, CotizacionLinea } from '@/types/ventas';
import { exportarCotizacionOdooPDF } from '@/utils/reportGenerator';
import { ThemedText } from '@/components/themed-text';
import { supabase } from '@/services/supabase';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';

export default function NuevaCotizacionScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [cotizacion, setCotizacion] = useState<Cotizacion>({
    numeroCotizacion: '26063002',
    clienteNombre: '',
    clienteRFC: '',
    clienteCorreo: '',
    clienteCP: '',
    direccionFactura: '',
    fechaCreacion: new Date().toLocaleDateString(),
    vendedor: 'Rafael Fernandez',
    moneda: 'MXN',
    lineas: [],
    terminosCondiciones: 'https://inttec.odoo.com/terms',
    subtotal: 0,
    iva: 0,
    total: 0,
  });

  const [clientSearchResults, setClientSearchResults] = useState<any[]>([]);
  const [showClientResults, setShowClientResults] = useState(false);
  
  const [formMessage, setFormMessage] = useState<{type: 'error'|'success', text: string} | null>(null);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setCurrentDate(selectedDate);
      setCotizacion({ ...cotizacion, fechaCreacion: selectedDate.toLocaleDateString() });
    }
  };

  const showAlert = (title: string, message: string) => {
    setFormMessage({ type: title.toLowerCase().includes('error') ? 'error' : 'success', text: message });
    if (Platform.OS === 'web') {
      try { window.alert(`${title}: ${message}`); } catch(e) {}
    } else {
      Alert.alert(title, message);
    }
  };

  const searchClients = async (text: string) => {
    setCotizacion(prev => ({...prev, clienteNombre: text}));
    if (text.length < 2) {
      setClientSearchResults([]);
      setShowClientResults(false);
      return;
    }
    const { data } = await supabase
      .from('clientes')
      .select('*')
      .ilike('nombre', `%${text}%`)
      .limit(5);
    
    if (data && data.length > 0) {
      setClientSearchResults(data);
      setShowClientResults(true);
    } else {
      setClientSearchResults([]);
      setShowClientResults(false);
    }
  };

  const handleSelectClient = (client: any) => {
    setCotizacion(prev => ({
      ...prev,
      clienteNombre: client.nombre,
      clienteRFC: client.rfc || '',
      clienteCorreo: client.correo_electronico || '',
      clienteCP: client.codigo_postal || '',
      direccionFactura: client.direccion || '',
    }));
    setShowClientResults(false);
  };

  // Calculate totals whenever lines change
  useEffect(() => {
    const fetchLastFolio = async () => {
      const { data, error } = await supabase
        .from('cotizaciones')
        .select('folio')
        .order('folio', { ascending: false })
        .limit(1);
      
      if (!error && data && data.length > 0) {
        const lastFolio = parseInt(data[0].folio, 10);
        if (!isNaN(lastFolio)) {
          setCotizacion(prev => ({ ...prev, numeroCotizacion: (lastFolio + 1).toString() }));
        }
      }
    };
    
    fetchLastFolio();
  }, []);

  useEffect(() => {
    const subtotal = cotizacion.lineas.reduce((acc, item) => acc + (item.cantidad * item.precioUnitario), 0);
    const iva = cotizacion.lineas.reduce((acc, item) => acc + ((item.cantidad * item.precioUnitario) * (item.impuestoPorcentaje / 100)), 0);
    setCotizacion(prev => ({
      ...prev,
      subtotal,
      iva,
      total: subtotal + iva
    }));
  }, [cotizacion.lineas]);

  const handleAddLine = () => {
    const nuevaLinea: CotizacionLinea = {
      id: Math.random().toString(),
      productoNombre: '',
      productoDescripcion: '',
      tiempoEntrega: '',
      cantidad: 1,
      unidad: 'Unidad',
      precioUnitario: 0,
      impuestoPorcentaje: 16,
      importe: 0,
    };
    setCotizacion(prev => ({ ...prev, lineas: [...prev.lineas, nuevaLinea] }));
  };

  const handleUpdateLine = (id: string, field: keyof CotizacionLinea, value: any) => {
    setCotizacion(prev => {
      const newLineas = prev.lineas.map(linea => {
        if (linea.id === id) {
          const updated = { ...linea, [field]: value };
          // Recalculate importe for this line
          if (field === 'cantidad' || field === 'precioUnitario') {
            updated.importe = updated.cantidad * updated.precioUnitario;
          }
          return updated;
        }
        return linea;
      });
      return { ...prev, lineas: newLineas };
    });
  };

  const handleRemoveLine = (id: string) => {
    setCotizacion(prev => ({
      ...prev,
      lineas: prev.lineas.filter(l => l.id !== id)
    }));
  };

  const handlePrintPDF = async () => {
    try {
      console.log('Generando PDF...');
      await exportarCotizacionOdooPDF(cotizacion);
      console.log('PDF Generado correctamente.');
    } catch (error: any) {
      console.error('Error en handlePrintPDF:', error);
      showAlert('Error', error.message || 'Error al generar el PDF');
    }
  };

  const handleEnviar = async () => {
    if (!cotizacion.clienteNombre.trim()) {
      showAlert('Error', 'Debes ingresar el nombre del cliente.');
      return;
    }
    
    try {
      console.log('Guardando cliente...');
      // Upsert client based on name
      const { error: errorCliente } = await supabase.from('clientes').upsert(
        {
          nombre: cotizacion.clienteNombre.trim(),
          rfc: cotizacion.clienteRFC,
          correo_electronico: cotizacion.clienteCorreo,
          codigo_postal: cotizacion.clienteCP,
          direccion: cotizacion.direccionFactura,
        },
        { onConflict: 'nombre' }
      );
      if (errorCliente) throw errorCliente;
      
      console.log('Guardando cotizacion...');
      // Save the cotizacion to database
      const { error: errorCotizacion } = await supabase.from('cotizaciones').insert({
        folio: cotizacion.numeroCotizacion,
        cliente_nombre: cotizacion.clienteNombre.trim(),
        vendedor: cotizacion.vendedor,
        moneda: cotizacion.moneda,
        fecha_creacion: cotizacion.fechaCreacion,
        subtotal: cotizacion.subtotal,
        iva: cotizacion.iva,
        total: cotizacion.total,
        lineas: cotizacion.lineas,
        terminos_condiciones: cotizacion.terminosCondiciones,
        estado: 'Borrador'
      });

      if (errorCotizacion) {
        throw errorCotizacion;
      }
      
      showAlert('Éxito', 'Cotización guardada y cliente registrado.');
      setTimeout(() => {
        router.push('/(admin)/cotizaciones');
      }, 1500);
    } catch (error: any) {
      console.error('Error al guardar:', error);
      if (error.message?.includes('duplicate key value')) {
        showAlert('Éxito', 'Cotización actualizada y guardada.');
        setTimeout(() => {
          router.push('/(admin)/cotizaciones');
        }, 1500);
      } else {
        showAlert('Error', error.message || 'Hubo un error guardando la cotización.');
      }
    }
  };

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1, backgroundColor: themeColors.background }} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
        
        {/* Cabecera con Botón de Regreso */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.two }}>
          <TouchableOpacity onPress={() => router.push('/(admin)/cotizaciones')} style={{ marginRight: Spacing.two, padding: 8 }}>
            <Ionicons name="arrow-back" size={24} color={themeColors.text} />
          </TouchableOpacity>
          <ThemedText style={{ fontSize: 20, fontWeight: 'bold', color: themeColors.text }}>Nueva Cotización</ThemedText>
        </View>

        {/* Barra de Estado (Tracker) */}
        <View style={[styles.statusBar, { backgroundColor: themeColors.backgroundElement, borderBottomColor: themeColors.border }]}>
          <ThemedText style={[styles.statusTitle, { color: themeColors.text }]}>
            Estado de Cotización
          </ThemedText>
          <View style={[styles.tracker, { backgroundColor: themeColors.background }]}>
            <View style={[styles.trackerActive, { backgroundColor: '#E8F0FE' }]}>
              <ThemedText style={[styles.trackerActiveText, { color: '#1967D2' }]}>Borrador</ThemedText>
            </View>
            <View style={styles.trackerInactive}>
              <ThemedText style={[styles.trackerInactiveText, { color: themeColors.textSecondary }]}>Enviado</ThemedText>
            </View>
            <View style={styles.trackerInactive}>
              <ThemedText style={[styles.trackerInactiveText, { color: themeColors.textSecondary }]}>Orden</ThemedText>
            </View>
          </View>
        </View>

        {/* Banner de Mensajes (Errores/Exito) */}
        {formMessage && (
          <View style={{ backgroundColor: formMessage.type === 'error' ? '#ffebee' : '#e8f5e9', padding: 12, borderRadius: 8, marginBottom: 16, borderWidth: 1, borderColor: formMessage.type === 'error' ? '#ffcdd2' : '#c8e6c9' }}>
            <ThemedText style={{ color: formMessage.type === 'error' ? '#c62828' : '#2e7d32', fontWeight: 'bold' }}>
              {formMessage.text}
            </ThemedText>
            <TouchableOpacity onPress={() => setFormMessage(null)} style={{ position: 'absolute', right: 8, top: 8 }}>
              <Ionicons name="close" size={20} color={formMessage.type === 'error' ? '#c62828' : '#2e7d32'} />
            </TouchableOpacity>
          </View>
        )}

        {/* Formulario Principal */}
        <View style={[styles.card, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
          <ThemedText style={[styles.cardTitle, { color: themeColors.text, fontSize: 28 }]}>
            {cotizacion.numeroCotizacion}
          </ThemedText>
          
          <View style={[styles.grid, isMobile && styles.gridMobile]}>
            <View style={[styles.column, isMobile && styles.columnMobile, { zIndex: 10 }]}>
              <ThemedText style={{ fontSize: 13, fontWeight: '700', color: themeColors.textSecondary, marginBottom: Spacing.one }}>DATOS DEL CLIENTE</ThemedText>
              <View style={{ zIndex: 10 }}>
                <CustomInput 
                  label="Nombre" 
                  value={cotizacion.clienteNombre} 
                  onChangeText={searchClients} 
                  placeholder="Escribe para buscar o registrar..." 
                />
                {showClientResults && clientSearchResults.length > 0 && (
                  <View style={{ 
                    position: 'absolute', top: 65, left: 0, right: 0, 
                    backgroundColor: themeColors.backgroundElement, 
                    borderWidth: 1, borderColor: themeColors.border, 
                    borderRadius: 4, zIndex: 100,
                    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 4
                  }}>
                    {clientSearchResults.map(client => (
                      <TouchableOpacity 
                        key={client.id} 
                        onPress={() => handleSelectClient(client)}
                        style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: themeColors.border }}
                      >
                        <ThemedText style={{ fontWeight: 'bold', color: themeColors.text }}>{client.nombre}</ThemedText>
                        {(client.rfc || client.correo_electronico) && (
                          <ThemedText style={{ fontSize: 11, color: themeColors.textSecondary }}>
                            {client.rfc} {client.correo_electronico ? `• ${client.correo_electronico}` : ''}
                          </ThemedText>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              <View style={{ flexDirection: 'row', gap: Spacing.two, zIndex: 1 }}>
                <View style={{ flex: 1 }}>
                  <CustomInput 
                    label="RFC" 
                    value={cotizacion.clienteRFC || ''} 
                    onChangeText={(t) => setCotizacion({...cotizacion, clienteRFC: t})} 
                    placeholder="XAXX010101000"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <CustomInput 
                    label="CP" 
                    value={cotizacion.clienteCP || ''} 
                    onChangeText={(t) => setCotizacion({...cotizacion, clienteCP: t})} 
                    placeholder="31107"
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <CustomInput 
                label="Correo Electrónico" 
                value={cotizacion.clienteCorreo || ''} 
                onChangeText={(t) => setCotizacion({...cotizacion, clienteCorreo: t})} 
                placeholder="ejemplo@correo.com"
                keyboardType="email-address"
              />
              <CustomInput 
                label="Dirección" 
                value={cotizacion.direccionFactura || ''} 
                onChangeText={(t) => setCotizacion({...cotizacion, direccionFactura: t})} 
                placeholder="Ej. Av. Siempre Viva 123"
              />
            </View>
            <View style={[styles.column, isMobile && styles.columnMobile]}>
              <ThemedText style={{ fontSize: 13, fontWeight: '700', color: themeColors.textSecondary, marginBottom: Spacing.one }}>DETALLES COMERCIALES</ThemedText>
              <CustomInput 
                label="Vendedor" 
                value={cotizacion.vendedor} 
                onChangeText={(t) => setCotizacion({...cotizacion, vendedor: t})} 
              />
              <View style={{ flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two, zIndex: 1 }}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ fontSize: 12, fontWeight: '600', color: themeColors.textSecondary, marginBottom: 4 }}>Fecha</ThemedText>
                  <TouchableOpacity 
                    onPress={() => setShowDatePicker(true)}
                    style={{ 
                      paddingVertical: 12, 
                      paddingHorizontal: 12,
                      borderWidth: 1, 
                      borderColor: themeColors.border,
                      backgroundColor: themeColors.backgroundElement,
                      borderRadius: 8
                    }}
                  >
                    <ThemedText style={{ color: themeColors.text }}>{cotizacion.fechaCreacion}</ThemedText>
                  </TouchableOpacity>
                  {showDatePicker && (
                    <DateTimePicker
                      value={currentDate}
                      mode="date"
                      display="default"
                      onChange={onDateChange}
                    />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ fontSize: 12, fontWeight: '600', color: themeColors.textSecondary, marginBottom: 4 }}>Moneda</ThemedText>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {['MXN', 'USD', 'EUR'].map(m => (
                      <TouchableOpacity 
                        key={m} 
                        onPress={() => setCotizacion({...cotizacion, moneda: m})}
                        style={{ 
                          flex: 1, 
                          paddingVertical: 8, 
                          alignItems: 'center', 
                          borderWidth: 1, 
                          borderColor: cotizacion.moneda === m ? themeColors.primary : themeColors.border,
                          backgroundColor: cotizacion.moneda === m ? themeColors.primary : themeColors.backgroundElement,
                          borderRadius: 4
                        }}
                      >
                        <ThemedText style={{ fontSize: 12, color: cotizacion.moneda === m ? '#fff' : themeColors.text }}>{m}</ThemedText>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Partidas / Líneas */}
        <View style={[styles.card, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
          <View style={styles.cardHeader}>
            <ThemedText style={[styles.cardTitle, { color: themeColors.primary, marginBottom: 0 }]}>
              Partidas y Productos
            </ThemedText>
            <TouchableOpacity onPress={handleAddLine} style={[styles.addBtn, { backgroundColor: themeColors.primary + '15' }]}>
              <Ionicons name="add" size={16} color={themeColors.primary} />
              <ThemedText style={[styles.addBtnText, { color: themeColors.primary }]}>Agregar Línea</ThemedText>
            </TouchableOpacity>
          </View>

          {cotizacion.lineas.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="cube-outline" size={48} color={themeColors.border} />
              <ThemedText style={{ color: themeColors.textSecondary, marginTop: Spacing.one }}>
                No hay productos en esta cotización.
              </ThemedText>
            </View>
          ) : (
            cotizacion.lineas.map((linea, index) => (
              <View key={linea.id} style={[styles.lineItemContainer, { borderColor: themeColors.border, backgroundColor: themeColors.background }]}>
                <View style={styles.lineHeader}>
                  <ThemedText style={[styles.lineIndex, { color: themeColors.textSecondary }]}>
                    #{index + 1}
                  </ThemedText>
                  <TouchableOpacity onPress={() => handleRemoveLine(linea.id)} style={styles.deleteBtn}>
                    <Ionicons name="trash-outline" size={18} color="#d32f2f" />
                  </TouchableOpacity>
                </View>

                {/* Inputs Producto (Nombre y Descripcion) */}
                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.label, { color: themeColors.textSecondary }]}>Nombre del producto</ThemedText>
                  <TextInput
                    style={[styles.input, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement }]}
                    placeholder="Ej. Cilindro Hidraulico 10T..."
                    placeholderTextColor={themeColors.textSecondary}
                    value={linea.productoNombre}
                    onChangeText={(t) => handleUpdateLine(linea.id, 'productoNombre', t)}
                  />
                </View>
                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.label, { color: themeColors.textSecondary }]}>Detalles o descripción (Qué incluye)</ThemedText>
                  <TextInput
                    style={[styles.inputMultiline, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement }]}
                    multiline
                    numberOfLines={3}
                    placeholder="Describe los detalles (puedes usar saltos de línea)..."
                    placeholderTextColor={themeColors.textSecondary}
                    value={linea.productoDescripcion}
                    onChangeText={(t) => handleUpdateLine(linea.id, 'productoDescripcion', t)}
                  />
                </View>

                {/* Input Entrega y Precios */}
                <View style={[styles.grid, isMobile && styles.gridMobile, { marginTop: Spacing.two }]}>
                  <View style={[styles.column, isMobile && styles.columnMobile, { flex: 1.5 }]}>
                    <ThemedText style={[styles.label, { color: themeColors.textSecondary }]}>Entrega</ThemedText>
                    <TextInput
                      style={[styles.input, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement }]}
                      placeholder="Ej. 8 días"
                      placeholderTextColor={themeColors.textSecondary}
                      value={linea.tiempoEntrega}
                      onChangeText={(t) => handleUpdateLine(linea.id, 'tiempoEntrega', t)}
                    />
                  </View>
                  <View style={[styles.column, isMobile && styles.columnMobile, { flex: 1 }]}>
                    <ThemedText style={[styles.label, { color: themeColors.textSecondary }]}>Cant.</ThemedText>
                    <TextInput
                      style={[styles.input, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement }]}
                      keyboardType="numeric"
                      value={linea.cantidad.toString()}
                      onChangeText={(t) => handleUpdateLine(linea.id, 'cantidad', Number(t.replace(/[^0-9.]/g, '')) || 0)}
                    />
                  </View>
                  <View style={[styles.column, isMobile && styles.columnMobile, { flex: 1.5 }]}>
                    <ThemedText style={[styles.label, { color: themeColors.textSecondary }]}>Precio U. ($)</ThemedText>
                    <TextInput
                      style={[styles.input, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement }]}
                      keyboardType="numeric"
                      value={linea.precioUnitario.toString()}
                      onChangeText={(t) => handleUpdateLine(linea.id, 'precioUnitario', Number(t.replace(/[^0-9.]/g, '')) || 0)}
                    />
                  </View>
                  <View style={[styles.column, isMobile && styles.columnMobile, { flex: 1 }]}>
                    <ThemedText style={[styles.label, { color: themeColors.textSecondary }]}>IVA (%)</ThemedText>
                    <TextInput
                      style={[styles.input, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement }]}
                      keyboardType="numeric"
                      value={linea.impuestoPorcentaje.toString()}
                      onChangeText={(t) => handleUpdateLine(linea.id, 'impuestoPorcentaje', Number(t.replace(/[^0-9.]/g, '')) || 0)}
                    />
                  </View>
                </View>

                {/* Importe Linea */}
                <View style={styles.lineFooter}>
                  <ThemedText style={{ color: themeColors.textSecondary, fontSize: 13 }}>
                    Importe de partida:
                  </ThemedText>
                  <ThemedText style={{ color: themeColors.text, fontWeight: '700', fontSize: 15 }}>
                    ${linea.importe.toLocaleString(undefined, {minimumFractionDigits: 2})}
                  </ThemedText>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Totales y Botones Finales */}
        <View style={styles.bottomSection}>
          <View style={[styles.totalsCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <View style={styles.totalsRow}>
              <ThemedText style={[styles.totalLabel, { color: themeColors.textSecondary }]}>Subtotal:</ThemedText>
              <ThemedText style={[styles.totalValue, { color: themeColors.text }]}>${cotizacion.subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</ThemedText>
            </View>
            <View style={styles.totalsRow}>
              <ThemedText style={[styles.totalLabel, { color: themeColors.textSecondary }]}>IVA (Calculado):</ThemedText>
              <ThemedText style={[styles.totalValue, { color: themeColors.text }]}>${cotizacion.iva.toLocaleString(undefined, {minimumFractionDigits: 2})}</ThemedText>
            </View>
            <View style={[styles.totalsRow, styles.totalFinalRow, { borderTopColor: themeColors.border }]}>
              <ThemedText style={[styles.totalFinalLabel, { color: themeColors.text }]}>Total a Cobrar:</ThemedText>
              <ThemedText style={[styles.totalFinalValue, { color: themeColors.primary }]}>${cotizacion.total.toLocaleString(undefined, {minimumFractionDigits: 2})}</ThemedText>
            </View>
          </View>
          
          <View style={[styles.actionButtonsBottom, isMobile && { flexDirection: 'column' }]}>
            <TouchableOpacity 
              style={[styles.bottomBtnSecondary, { borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement }]}
              onPress={handlePrintPDF}
            >
              <Ionicons name="print-outline" size={20} color={themeColors.text} />
              <ThemedText style={{ color: themeColors.text, fontWeight: '600', marginLeft: 8 }}>PDF Corporativo</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.bottomBtnPrimary, { backgroundColor: '#714B67' }]}
              onPress={handleEnviar}
            >
              <Ionicons name="send" size={18} color="#ffffff" />
              <ThemedText style={{ color: '#ffffff', fontWeight: 'bold', marginLeft: 8 }}>Guardar y Enviar</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
        
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  tracker: {
    flexDirection: 'row',
    borderRadius: BorderRadius.small,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  trackerActive: {
    paddingHorizontal: Spacing.one,
    paddingVertical: 4,
    borderRadius: BorderRadius.small,
  },
  trackerActiveText: {
    fontWeight: '700',
    fontSize: 12,
  },
  trackerInactive: {
    paddingHorizontal: Spacing.one,
    paddingVertical: 4,
    justifyContent: 'center',
  },
  trackerInactiveText: {
    fontSize: 12,
  },
  card: {
    margin: Spacing.two,
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent', // controlled by parent mostly
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: Spacing.three,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.small,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  gridMobile: {
    flexDirection: 'column',
  },
  column: {
    width: '50%',
    paddingHorizontal: 8,
    gap: Spacing.two,
  },
  columnMobile: {
    width: '100%',
    marginBottom: Spacing.two,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.four,
  },
  lineItemContainer: {
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    padding: Spacing.two,
    marginBottom: Spacing.two,
  },
  lineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.one,
  },
  lineIndex: {
    fontSize: 12,
    fontWeight: '700',
  },
  deleteBtn: {
    padding: 4,
  },
  inputGroup: {
    marginTop: Spacing.one,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  inputMultiline: {
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  lineFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: Spacing.two,
    gap: 8,
  },
  bottomSection: {
    margin: Spacing.two,
    alignItems: 'flex-end',
  },
  totalsCard: {
    width: '100%',
    maxWidth: 400,
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    marginBottom: Spacing.three,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  totalLabel: {
    fontSize: 14,
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  totalFinalRow: {
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 4,
  },
  totalFinalLabel: {
    fontSize: 18,
    fontWeight: '800',
  },
  totalFinalValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  actionButtonsBottom: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
    width: '100%',
  },
  bottomBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    flex: 1,
    maxWidth: 200,
  },
  bottomBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
    borderRadius: BorderRadius.medium,
    flex: 1,
    maxWidth: 200,
  }
});
