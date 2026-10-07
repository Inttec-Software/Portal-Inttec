import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet, useWindowDimensions, TextInput, KeyboardAvoidingView, Platform, Keyboard, Pressable } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import CustomInput from '@/components/CustomInput';
import SatCatalogAutocomplete from '@/components/SatCatalogAutocomplete';
import { Cotizacion, CotizacionLinea } from '@/types/ventas';
import { exportarCotizacionOdooPDF } from '@/utils/reportGenerator';
import { ThemedText } from '@/components/themed-text';
import { supabase } from '@/services/supabase';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { getApiHeaders, getApiUrl } from '@/services/apiHelper';

function TableTooltipButton({
  icon,
  color,
  bgColor,
  borderColor,
  tooltip,
  onPress,
}: {
  icon: any;
  color: string;
  bgColor: string;
  borderColor: string;
  tooltip: string;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <View style={{ position: 'relative', alignItems: 'center', zIndex: hovered ? 9999 : 1 }}>
      <Pressable
        onPress={(e) => {
          e.stopPropagation();
          onPress();
        }}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={({ hovered: isHover }: any) => [
          styles.tableActionIconBtn,
          {
            borderColor: isHover || hovered ? color : borderColor,
            backgroundColor: isHover || hovered ? color + '28' : bgColor,
            transform: [{ scale: isHover || hovered ? 1.1 : 1 }],
          },
        ]}
        {...(Platform.OS === 'web' ? ({ title: tooltip } as any) : {})}
        accessibilityLabel={tooltip}
      >
        <Ionicons name={icon} size={15} color={color} />
      </Pressable>
    </View>
  );
}

export default function NuevaCotizacionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const editId = params.id as string | undefined;
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const { user } = useAuth();

  const [cotizacion, setCotizacion] = useState<Cotizacion>({
    numeroCotizacion: '26063002',
    clienteNombre: '',
    clienteRFC: '',
    clienteCorreo: '',
    clienteCP: '',
    direccionFactura: '',
    fechaCreacion: new Date().toLocaleDateString(),
    vendedor: user?.nombre || '',
    moneda: 'MXN',
    lineas: [],
    terminosCondiciones: 'Precios sujetos a cambio sin previo aviso. Tiempo de entrega salvo previa venta.',
    notasObservaciones: '',
    estado: 'Borrador',
    subtotal: 0,
    iva: 0,
    total: 0,
  });

  const [clientSearchResults, setClientSearchResults] = useState<any[]>([]);
  const [showClientResults, setShowClientResults] = useState(false);
  const [clienteSearch, setClienteSearch] = useState('');
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [showSucursalDropdown, setShowSucursalDropdown] = useState(false);
  const [sucursalSearch, setSucursalSearch] = useState('');
  
  const [formMessage, setFormMessage] = useState<{type: 'error'|'success', text: string} | null>(null);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());

  const [productSearchResults, setProductSearchResults] = useState<any[]>([]);
  const [activeProductLineId, setActiveProductLineId] = useState<string | null>(null);

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
      try { window.alert(`${title}: ${message}`); } catch {}
    } else {
      Alert.alert(title, message);
    }
  };

  const searchClients = async (text: string) => {
    setCotizacion(prev => ({...prev, clienteNombre: text}));
    if (text.length < 2) {
      setClientSearchResults([]);
      return;
    }
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/cotizaciones/search-clientes?q=${encodeURIComponent(text)}`, { headers });
    if (!res.ok) {
      setClientSearchResults([]);
      return;
    }
    const { clientes } = await res.json();
    const data = clientes;
    
    if (data && data.length > 0) {
      setClientSearchResults(data);
    } else {
      setClientSearchResults([]);
    }
  };

  const handleSelectClient = (client: any) => {
    setCotizacion(prev => ({
      ...prev,
      clienteNombre: client.nombre,
      clienteRFC: client.rfc || '',
      clienteCorreo: client.correo_electronico || '',
      clienteCP: client.codigo_postal || '',
      direccionFactura: client.direccion || ''
    }));
    setShowClientResults(false);
  };

  const searchProducts = async (lineId: string, text: string) => {
    handleUpdateLine(lineId, 'productoNombre', text);
    // Remove productoId if they edit the text manually so it gets saved as new
    setCotizacion(prev => {
      const newLineas = prev.lineas.map(l => l.id === lineId ? { ...l, productoId: undefined } : l);
      return { ...prev, lineas: newLineas };
    });

    setActiveProductLineId(lineId);

    const headers = await getApiHeaders();
    const q = text.trim();
    const url = q.length > 0 
      ? `${getApiUrl()}/api/cotizaciones/search-productos?q=${encodeURIComponent(q)}`
      : `${getApiUrl()}/api/cotizaciones/search-productos`;
    const res = await fetch(url, { headers });
    let data = [];
    if (res.ok) {
      const json = await res.json();
      data = json.productos || [];
    }
    
    if (data && data.length > 0) {
      setProductSearchResults(data);
    } else {
      setProductSearchResults([]);
    }
  };

  const handleSelectProduct = (lineId: string, product: any) => {
    setCotizacion(prev => {
      const newLineas = prev.lineas.map(linea => {
        if (linea.id === lineId) {
          const pu = product.precio_unitario || product.precio || linea.precioUnitario || 0;
          const cant = linea.cantidad || 1;
          return {
            ...linea,
            productoNombre: product.nombre_oficial || product.nombre || '',
            productoId: product.id,
            claveFacturacion: product.sat_code || product.clave_sat || product.clave_facturacion || linea.claveFacturacion || '',
            unidad: product.clave_unidad || product.unidad || linea.unidad || 'H87',
            precioUnitario: pu,
            precioUnitarioStr: pu > 0 ? String(pu) : linea.precioUnitarioStr,
            impuestoPorcentaje: product.impuesto_porcentaje !== null && product.impuesto_porcentaje !== undefined ? product.impuesto_porcentaje : 16,
            importe: cant * pu
          };
        }
        return linea;
      });
      return { ...prev, lineas: newLineas };
    });
    setProductSearchResults([]);
    setActiveProductLineId(null);
  };

  // Calculate totals whenever lines change
  useEffect(() => {
    const fetchCotizacion = async () => {
      if (editId) {
        const headers = await getApiHeaders();
        const res = await fetch(`${getApiUrl()}/api/cotizaciones/${editId}`, { headers });
        if (res.ok) {
          const data = await res.json();
          const cotData = data.cotizacion;
          const clientData = data.clientData;
          if (cotData) {
            setCotizacion({
              id: cotData.id,
              numeroCotizacion: cotData.folio,
              clienteNombre: cotData.cliente_nombre,
              clienteRFC: clientData?.rfc || '',
              clienteCorreo: clientData?.correo_electronico || '',
              clienteCP: clientData?.codigo_postal || '',
              direccionFactura: clientData?.direccion || '',
              sucursal: cotData.sucursal || '',
              fechaCreacion: cotData.fecha_creacion,
              vendedor: cotData.vendedor || user?.nombre || '',
              moneda: cotData.moneda || 'MXN',
              lineas: cotData.lineas || [],
              terminosCondiciones: cotData.terminos_condiciones || 'https://inttec.odoo.com/terms',
              estado: cotData.estado || 'Borrador',
              subtotal: cotData.subtotal || 0,
              iva: cotData.iva || 0,
              total: cotData.total || 0,
            });

            if (data.sucursales) setSucursales(data.sucursales);
            return;
          }
        }
      }

      const fetchLastFolio = async () => {
        // Formato YYMMDD (ej. 260918 para 18 de septiembre de 2026)
        const today = new Date();
        const yy = String(today.getFullYear()).slice(-2);
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const datePrefix = `${yy}${mm}${dd}`;

        try {
          const headers = await getApiHeaders();
          const res = await fetch(`${getApiUrl()}/api/cotizaciones/last-folio?prefix=${encodeURIComponent(datePrefix)}`, { headers });
          if (res.ok) {
            const data = await res.json();
            if (data.nextFolio) {
              setCotizacion(prev => ({ ...prev, numeroCotizacion: data.nextFolio }));
              return;
            }
          }
        } catch (err) {
          console.error('Error fetching last folio:', err);
        }

        const fallbackFolio = `${datePrefix}01`;
        setCotizacion(prev => ({ ...prev, numeroCotizacion: fallbackFolio }));
      };
      
      fetchLastFolio();
    };

    fetchCotizacion();
  }, [editId, user?.nombre]);

  // Actualizar vendedor con el nombre del usuario cuando se cargue (sólo en nueva cotización)
  useEffect(() => {
    if (!editId && user?.nombre) {
      const timer = setTimeout(() => {
        setCotizacion(prev => {
          if (!prev.vendedor && user.nombre) {
            return {
              ...prev,
              vendedor: user.nombre,
            };
          }
          return prev;
        });
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [user?.nombre, editId]);

  const subtotal = useMemo(() => cotizacion.lineas.reduce((acc, item) => acc + (item.cantidad * item.precioUnitario), 0), [cotizacion.lineas]);
  const iva = useMemo(() => cotizacion.lineas.reduce((acc, item) => acc + ((item.cantidad * item.precioUnitario) * (item.impuestoPorcentaje / 100)), 0), [cotizacion.lineas]);
  const total = subtotal + iva;

  const handleAddLine = () => {
    const nuevaLinea: CotizacionLinea = {
      id: Math.random().toString(),
      productoNombre: '',
      productoDescripcion: '',
      claveFacturacion: '',
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
            updated.importe = (updated.cantidad || 0) * (updated.precioUnitario || 0);
          }
          return updated;
        }
        return linea;
      });
      return { ...prev, lineas: newLineas };
    });
  };

  const handleUpdateLineNumericText = (id: string, field: 'precioUnitario' | 'cantidad' | 'impuestoPorcentaje', rawText: string) => {
    // Permite escribir puntos o comas de forma fluida sin perder el foco ni borrar el carácter decimal
    const sanitized = rawText.replace(',', '.').replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1');
    const strKey = `${field}Str` as 'precioUnitarioStr' | 'cantidadStr' | 'impuestoPorcentajeStr';
    
    const parsedNum = parseFloat(sanitized);
    const numVal = isNaN(parsedNum) ? 0 : parsedNum;

    setCotizacion(prev => {
      const newLineas = prev.lineas.map(linea => {
        if (linea.id === id) {
          const updated = { 
            ...linea, 
            [strKey]: sanitized,
            [field]: numVal 
          };
          updated.importe = (updated.cantidad || 0) * (updated.precioUnitario || 0);
          return updated;
        }
        return linea;
      });
      return { ...prev, lineas: newLineas };
    });
  };

  const handleDuplicateLine = (index: number) => {
    const item = cotizacion.lineas[index];
    if (!item) return;
    const duplicated: CotizacionLinea = {
      ...item,
      id: Math.random().toString(),
    };
    const newLineas = [...cotizacion.lineas];
    newLineas.splice(index + 1, 0, duplicated);
    setCotizacion(prev => ({ ...prev, lineas: newLineas }));
  };

  const handleRemoveLine = (id: string) => {
    setCotizacion(prev => ({
      ...prev,
      lineas: prev.lineas.filter(l => l.id !== id)
    }));
  };

  const handlePrintPDF = async () => {
    try {
      console.log('Descargando PDF...');
      await exportarCotizacionOdooPDF({ ...cotizacion, subtotal, iva, total }, 'download');
      console.log('PDF Descargado correctamente.');
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
      console.log('Enviando cotizacion a la API...');
      
      const payload = {
        folio: cotizacion.numeroCotizacion,
        cliente_nombre: cotizacion.clienteNombre.trim(),
        vendedor: cotizacion.vendedor,
        moneda: cotizacion.moneda,
        fecha_creacion: cotizacion.fechaCreacion,
        subtotal,
        iva,
        total,
        lineas: cotizacion.lineas,
        terminos_condiciones: cotizacion.terminosCondiciones,
        notas_observaciones: cotizacion.notasObservaciones,
        estado: cotizacion.estado || 'Borrador'
      };

      const clientData = {
        nombre: cotizacion.clienteNombre.trim(),
        rfc: cotizacion.clienteRFC,
        correo_electronico: cotizacion.clienteCorreo,
        codigo_postal: cotizacion.clienteCP,
        direccion: cotizacion.direccionFactura,
      };

      const updateProducts = cotizacion.lineas;

      const headers = await getApiHeaders();
      const method = editId ? 'PUT' : 'POST';
      const url = editId ? `${getApiUrl()}/api/cotizaciones/${editId}` : `${getApiUrl()}/api/cotizaciones`;

      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify({ payload, clientData, updateProducts })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error en la API');
      }
      
      showAlert('Éxito', editId ? 'Cotización actualizada exitosamente.' : 'Cotización guardada exitosamente.');
      setTimeout(() => {
        router.push('/(admin)/cotizaciones');
      }, 1500);
    } catch (error: any) {
      console.error('Error al guardar:', error);
      if (error.message?.includes('duplicate key value')) {
        showAlert('Éxito', 'Cotización guardada exitosamente.');
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
        
        {/* Cabecera con Botón de Regreso y Selector de Estado */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.two, flexWrap: 'wrap', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => router.push('/(admin)/cotizaciones')} style={{ marginRight: Spacing.two, padding: 8 }}>
              <Ionicons name="arrow-back" size={24} color={themeColors.text} />
            </TouchableOpacity>
            <ThemedText style={{ fontSize: 20, fontWeight: 'bold', color: themeColors.text }}>
              {editId ? 'Editar Cotización' : 'Nueva Cotización'}
            </ThemedText>
          </View>

          {/* Status Picker (Upper Right) */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {['Borrador', 'Enviado', 'Aprobada', 'Orden de Compra'].map(status => {
              const getStatusColor = () => {
                switch(status) {
                  case 'Borrador': return '#757575';
                  case 'Enviado': return '#FF9800';
                  case 'Aprobada': return '#4CAF50';
                  case 'Orden de Compra': return '#2196F3';
                  default: return themeColors.primary;
                }
              };
              const activeColor = getStatusColor();
              const isActive = cotizacion.estado === status;

              return (
                <TouchableOpacity
                  key={status}
                  onPress={() => setCotizacion({...cotizacion, estado: status})}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: isActive ? activeColor : themeColors.border,
                    backgroundColor: isActive ? activeColor + '20' : 'transparent',
                  }}
                >
                  <ThemedText style={{ 
                    fontSize: 12, 
                    fontWeight: isActive ? 'bold' : 'normal',
                    color: isActive ? activeColor : themeColors.textSecondary 
                  }}>
                    {status}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
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
              {/* Selector de Cliente - Estilo premium */}
              <View style={{ zIndex: 3000, marginBottom: Spacing.two }}>
                <ThemedText style={{ fontSize: 13, fontWeight: '700', color: themeColors.textSecondary, marginBottom: Spacing.one }}>CLIENTE</ThemedText>
                <TouchableOpacity
                  style={{
                    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                    backgroundColor: themeColors.backgroundElement, borderWidth: 1, borderColor: themeColors.border,
                    borderRadius: 12, padding: 14, height: 50,
                  }}
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowClientResults(!showClientResults);
                    setShowSucursalDropdown(false);
                  }}
                >
                  <ThemedText style={{ color: cotizacion.clienteNombre ? themeColors.text : themeColors.textSecondary }}>
                    {cotizacion.clienteNombre || 'Selecciona un cliente'}
                  </ThemedText>
                  <Ionicons name={showClientResults ? 'chevron-up' : 'chevron-down'} size={20} color={themeColors.textSecondary} />
                </TouchableOpacity>

                {showClientResults && (
                  <View style={{
                    backgroundColor: themeColors.backgroundElement,
                    borderWidth: 1, borderColor: themeColors.border,
                    borderRadius: 16, marginTop: 6,
                    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 5,
                  }}>
                    <CustomInput
                      placeholder="Buscar o agregar cliente..."
                      value={clienteSearch}
                      onChangeText={(text) => {
                        setClienteSearch(text);
                        searchClients(text);
                      }}
                      iconName="search-outline"
                      style={{ margin: Spacing.one, height: 40 }}
                    />
                    <ScrollView nestedScrollEnabled style={{ maxHeight: 200, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                      {clientSearchResults.map((client, index, array) => (
                        <TouchableOpacity
                          key={client.id}
                          onPress={() => {
                            handleSelectClient(client);
                            setClienteSearch('');
                            setShowClientResults(false);
                          }}
                          style={[
                            { padding: 12, borderBottomWidth: index === array.length - 1 ? 0 : 0.5, borderBottomColor: themeColors.border,
                              flexDirection: 'row', alignItems: 'center', gap: Spacing.one }
                          ]}
                        >
                          <Ionicons name="person-circle-outline" size={24} color={themeColors.primary} />
                          <View style={{ flex: 1 }}>
                            <ThemedText style={{ fontWeight: '600', color: themeColors.text }}>{client.nombre}</ThemedText>
                            {(client.rfc || client.correo_electronico) && (
                              <ThemedText style={{ fontSize: 11, color: themeColors.textSecondary }}>
                                {client.rfc}{client.correo_electronico ? ` • ${client.correo_electronico}` : ''}
                              </ThemedText>
                            )}
                          </View>
                        </TouchableOpacity>
                      ))}
                      {clienteSearch.trim().length > 0 && clientSearchResults.length === 0 && (
                        <TouchableOpacity
                          style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: Spacing.one }}
                          onPress={() => {
                            setCotizacion(prev => ({ ...prev, clienteNombre: clienteSearch.trim() }));
                            setClienteSearch('');
                            setShowClientResults(false);
                          }}
                        >
                          <Ionicons name="add-circle-outline" size={24} color={themeColors.accent} />
                          <ThemedText style={{ color: themeColors.accent, fontWeight: '600' }}>Agregar "{clienteSearch.trim()}"</ThemedText>
                        </TouchableOpacity>
                      )}
                    </ScrollView>
                  </View>
                )}
              </View>


              <View style={{ flexDirection: 'row', gap: Spacing.two, zIndex: 1, marginTop: Spacing.one }}>
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
                      onValueChange={onDateChange}
                      onDismiss={() => setShowDatePicker(false)}
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

        {/* Partidas / Líneas (Estilo Facturación con campo Entrega) */}
        <View style={[styles.card, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, overflow: 'visible' }]}>
          <View style={styles.cardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="cart" size={18} color="#0284c7" />
              <ThemedText style={[styles.cardTitle, { color: themeColors.text, marginBottom: 0 }]}>
                Partidas y Productos ({cotizacion.lineas.length})
              </ThemedText>
            </View>
            <TouchableOpacity onPress={handleAddLine} style={[styles.addBtn, { backgroundColor: '#0284c715', borderColor: '#0284c730', borderWidth: 1 }]}>
              <Ionicons name="add" size={16} color="#0284c7" />
              <ThemedText style={[styles.addBtnText, { color: '#0284c7' }]}>Agregar Línea</ThemedText>
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
            <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerStyle={{ minWidth: isMobile ? 880 : '100%' }}>
              <View style={{ flex: 1, overflow: 'visible' }}>
                {/* Encabezado de la Tabla de Partidas */}
                <View
                  style={[
                    styles.partidasTableHeader,
                    {
                      backgroundColor: themeColors.backgroundElement,
                      borderBottomColor: themeColors.border,
                    },
                  ]}
                >
                  <Text style={[styles.partidasColHeader, { width: 32, textAlign: 'center' }]}>#</Text>
                  <Text style={[styles.partidasColHeader, { flex: 1, minWidth: 200 }]}>Producto / Concepto</Text>
                  <Text style={[styles.partidasColHeader, { width: 120 }]}>Clave SAT</Text>
                  <Text style={[styles.partidasColHeader, { width: 110 }]}>Unidad SAT</Text>
                  <Text style={[styles.partidasColHeader, { width: 100 }]}>Entrega</Text>
                  <Text style={[styles.partidasColHeader, { width: 70, textAlign: 'right' }]}>Cant.</Text>
                  <Text style={[styles.partidasColHeader, { width: 95, textAlign: 'right' }]}>Precio Unit.</Text>
                  <Text style={[styles.partidasColHeader, { width: 65, textAlign: 'right' }]}>IVA (%)</Text>
                  <Text style={[styles.partidasColHeader, { width: 105, textAlign: 'center' }]}>Importe</Text>
                  <Text style={[styles.partidasColHeader, { width: 65, textAlign: 'center' }]}>Acciones</Text>
                </View>

                {/* Filas de Partidas */}
                <View style={{ position: 'relative', zIndex: activeProductLineId !== null ? 9999 : 1, overflow: 'visible' }}>
                  {cotizacion.lineas.map((linea, index) => {
                    const cant = Number(linea.cantidad) || 0;
                    const pu = Number(linea.precioUnitario) || 0;
                    const subtotalLinea = cant * pu;
                    const ivaLinea = subtotalLinea * ((linea.impuestoPorcentaje || 0) / 100);

                    return (
                      <View
                        key={linea.id || index}
                        style={[
                          styles.partidasTableRow,
                          {
                            borderColor: themeColors.border,
                            backgroundColor: themeColors.background,
                            position: 'relative',
                            zIndex: activeProductLineId === linea.id ? 99999 : cotizacion.lineas.length - index,
                            overflow: 'visible',
                          },
                        ]}
                      >
                        {/* 1. Consecutivo # */}
                        <View style={{ width: 32, alignItems: 'center', justifyContent: 'center', paddingTop: 6 }}>
                          <View style={[styles.partidaNumBadge, { backgroundColor: '#0284c7' }]}>
                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{index + 1}</Text>
                          </View>
                        </View>

                        {/* 2. Producto / Concepto (Línea 1: Nombre + Autocompletado, Línea 2: Descripción adicional) */}
                        <View style={{ flex: 1, minWidth: 200, paddingRight: 8, position: 'relative', zIndex: activeProductLineId === linea.id ? 99999 : 1, overflow: 'visible' }}>
                          <View style={[styles.cascadeInputContainer, { backgroundColor: themeColors.backgroundElement, borderColor: activeProductLineId === linea.id ? '#0284c7' : themeColors.border, height: 36, borderRadius: 6, paddingHorizontal: 8 }]}>
                            <TextInput
                              style={[styles.cascadeTextInput, { color: themeColors.text }]}
                              value={linea.productoNombre}
                              onChangeText={(t) => {
                                handleUpdateLine(linea.id, 'productoNombre', t);
                                searchProducts(linea.id, t);
                              }}
                              onFocus={() => searchProducts(linea.id, linea.productoNombre)}
                              onBlur={() => {
                                setTimeout(() => {
                                  setActiveProductLineId((curr) => curr === linea.id ? null : curr);
                                }, 250);
                              }}
                              placeholder="Ej. Cilindro Hidráulico 10T..."
                              placeholderTextColor={themeColors.textSecondary}
                            />
                            {!!linea.productoNombre && (
                              <TouchableOpacity
                                onPress={() => {
                                  handleUpdateLine(linea.id, 'productoNombre', '');
                                  searchProducts(linea.id, '');
                                }}
                                style={{ padding: 4 }}
                              >
                                <Ionicons name="close-circle" size={16} color={themeColors.textSecondary} />
                              </TouchableOpacity>
                            )}
                          </View>

                          {/* Autocomplete Dropdown */}
                          {activeProductLineId === linea.id && productSearchResults.length > 0 && (
                            <View style={[styles.autocompleteContainer, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, top: 40, zIndex: 99999 }]}>
                              <ScrollView nestedScrollEnabled={true} keyboardShouldPersistTaps="handled" style={{ maxHeight: 200 }}>
                                {productSearchResults.map((prod) => (
                                  <TouchableOpacity 
                                    key={prod.id} 
                                    style={[styles.autocompleteItem, { borderBottomColor: themeColors.border }]}
                                    onPress={() => handleSelectProduct(linea.id, prod)}
                                  >
                                    <ThemedText style={{ color: themeColors.text, fontWeight: 'bold' }}>{prod.nombre_oficial}</ThemedText>
                                    <ThemedText style={{ color: themeColors.textSecondary, fontSize: 12 }}>
                                      SKU: {prod.sku_interno || 'N/A'} {prod.precio_unitario ? `• $${prod.precio_unitario}` : ''}
                                    </ThemedText>
                                  </TouchableOpacity>
                                ))}
                              </ScrollView>
                            </View>
                          )}

                          {/* Línea 2: Campo Descripción / Detalles Opcional */}
                          <View style={{ marginTop: 4 }}>
                            <TextInput
                              style={[
                                styles.partidaDescDetalladaInput,
                                {
                                  color: themeColors.text,
                                  backgroundColor: themeColors.backgroundElement + '80',
                                  borderColor: themeColors.border + '60',
                                },
                              ]}
                              value={linea.productoDescripcion || ''}
                              onChangeText={t => handleUpdateLine(linea.id, 'productoDescripcion', t)}
                              placeholder="Describe los detalles (qué incluye, opcional)..."
                              placeholderTextColor={themeColors.textSecondary + '70'}
                            />
                          </View>
                        </View>

                        {/* 3. Clave SAT */}
                        <View style={{ width: 120, paddingRight: 8, paddingTop: 1 }}>
                          <SatCatalogAutocomplete
                            tipo="producto"
                            value={linea.claveFacturacion || ''}
                            onChangeValue={val => handleUpdateLine(linea.id, 'claveFacturacion', val)}
                            style={{ flex: 0 }}
                            hideSearchIcon={true}
                          />
                        </View>

                        {/* 4. Unidad SAT */}
                        <View style={{ width: 110, paddingRight: 8, paddingTop: 1 }}>
                          <SatCatalogAutocomplete
                            tipo="unidad"
                            value={linea.unidad || ''}
                            onChangeValue={val => handleUpdateLine(linea.id, 'unidad', val)}
                            style={{ flex: 0 }}
                            hideSearchIcon={true}
                          />
                        </View>

                        {/* 5. Entrega */}
                        <View style={{ width: 100, paddingRight: 8, paddingTop: 1 }}>
                          <TextInput
                            style={[
                              styles.tableFieldInput,
                              {
                                color: themeColors.text,
                                borderColor: themeColors.border,
                                backgroundColor: themeColors.backgroundElement,
                                height: 36,
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: '600',
                                paddingHorizontal: 8,
                                minWidth: 0,
                                ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
                              },
                            ]}
                            value={linea.tiempoEntrega || ''}
                            onChangeText={val => handleUpdateLine(linea.id, 'tiempoEntrega', val)}
                            placeholder="Ej. 8 días"
                            placeholderTextColor={themeColors.textSecondary}
                          />
                        </View>

                        {/* 6. Cantidad */}
                        <View style={{ width: 70, paddingRight: 8, paddingTop: 1 }}>
                          <TextInput
                            style={[
                              styles.tableFieldInput,
                              {
                                color: themeColors.text,
                                borderColor: themeColors.border,
                                backgroundColor: themeColors.backgroundElement,
                                textAlign: 'right',
                                height: 36,
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: '600',
                                paddingHorizontal: 6,
                                minWidth: 0,
                                ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
                              },
                            ]}
                            value={linea.cantidadStr !== undefined ? linea.cantidadStr : (linea.cantidad ? linea.cantidad.toString() : '')}
                            onChangeText={val => handleUpdateLineNumericText(linea.id, 'cantidad', val)}
                            keyboardType="numeric"
                          />
                        </View>

                        {/* 7. Precio Unitario */}
                        <View style={{ width: 95, paddingRight: 8, paddingTop: 1 }}>
                          <View
                            style={[
                              styles.tableCurrencyContainer,
                              {
                                borderColor: themeColors.border,
                                backgroundColor: themeColors.backgroundElement,
                                height: 36,
                                borderRadius: 6,
                                paddingHorizontal: 6,
                                overflow: 'hidden',
                              },
                            ]}
                          >
                            <Text style={{ color: themeColors.textSecondary, fontSize: 11, marginRight: 2 }}>$</Text>
                            <TextInput
                              style={{
                                flex: 1,
                                minWidth: 0,
                                color: themeColors.text,
                                fontSize: 12,
                                fontWeight: '600',
                                textAlign: 'right',
                                paddingVertical: 0,
                                height: '100%',
                                ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
                              }}
                              value={linea.precioUnitarioStr !== undefined ? linea.precioUnitarioStr : (linea.precioUnitario ? linea.precioUnitario.toString() : '')}
                              onChangeText={val => handleUpdateLineNumericText(linea.id, 'precioUnitario', val)}
                              keyboardType="numeric"
                            />
                          </View>
                        </View>

                        {/* 8. IVA (%) */}
                        <View style={{ width: 65, paddingRight: 8, paddingTop: 1 }}>
                          <TextInput
                            style={[
                              styles.tableFieldInput,
                              {
                                color: themeColors.text,
                                borderColor: themeColors.border,
                                backgroundColor: themeColors.backgroundElement,
                                textAlign: 'right',
                                height: 36,
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: '600',
                                paddingHorizontal: 6,
                                minWidth: 0,
                                ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
                              },
                            ]}
                            value={linea.impuestoPorcentajeStr !== undefined ? linea.impuestoPorcentajeStr : (linea.impuestoPorcentaje !== undefined ? linea.impuestoPorcentaje.toString() : '16')}
                            onChangeText={val => handleUpdateLineNumericText(linea.id, 'impuestoPorcentaje', val)}
                            keyboardType="numeric"
                          />
                        </View>

                        {/* 9. Importe */}
                        <View style={{ width: 105, paddingHorizontal: 4, paddingTop: 4, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#10b981', textAlign: 'center' }}>
                            ${linea.importe.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Text>
                          <Text style={{ fontSize: 9, color: themeColors.textSecondary, marginTop: 1, textAlign: 'center' }}>
                            ${ivaLinea.toFixed(2)} IVA
                          </Text>
                        </View>

                        {/* 10. Acciones */}
                        <View style={{ width: 65, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 4 }}>
                          <TableTooltipButton
                            icon="copy-outline"
                            color="#0284c7"
                            bgColor="#0284c715"
                            borderColor="#0284c730"
                            tooltip="Duplicar partida"
                            onPress={() => handleDuplicateLine(index)}
                          />
                          <TableTooltipButton
                            icon="trash-outline"
                            color="#ef4444"
                            bgColor="#ef444415"
                            borderColor="#ef444430"
                            tooltip="Eliminar partida"
                            onPress={() => handleRemoveLine(linea.id)}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>

                {/* Botón "+ Agregar una línea" al pie de la tabla */}
                <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: themeColors.border + '50', paddingTop: 8 }}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={handleAddLine}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      alignSelf: 'flex-start',
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: '#0284c740',
                      backgroundColor: '#0284c710',
                    }}
                  >
                    <Ionicons name="add-circle" size={16} color="#0284c7" />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#0284c7' }}>
                      + Agregar una línea
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          )}
        </View>

        {/* Términos y Condiciones / Notas y Observaciones */}
        <View style={[styles.card, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
          <ThemedText style={[styles.cardTitle, { color: themeColors.primary, fontSize: 16, marginBottom: 12 }]}>
            Condiciones y Notas Comerciales
          </ThemedText>

          <View style={{ gap: Spacing.two }}>
            <View style={styles.inputGroup}>
              <ThemedText style={[styles.label, { color: themeColors.textSecondary }]}>Términos y Condiciones</ThemedText>
              <TextInput
                style={[styles.inputMultiline, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement }]}
                multiline
                numberOfLines={3}
                placeholder="Escribe las condiciones de venta..."
                placeholderTextColor={themeColors.textSecondary}
                value={cotizacion.terminosCondiciones || ''}
                onChangeText={(t) => setCotizacion(prev => ({ ...prev, terminosCondiciones: t }))}
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={[styles.label, { color: themeColors.textSecondary }]}>Notas u Observaciones</ThemedText>
              <TextInput
                style={[styles.inputMultiline, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement }]}
                multiline
                numberOfLines={3}
                placeholder="Escribe notas u observaciones especiales para el cliente..."
                placeholderTextColor={themeColors.textSecondary}
                value={cotizacion.notasObservaciones || ''}
                onChangeText={(t) => setCotizacion(prev => ({ ...prev, notasObservaciones: t }))}
              />
            </View>
          </View>
        </View>

        {/* Totales y Botones Finales */}
        <View style={styles.bottomSection}>
          <View style={[styles.totalsCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <View style={styles.totalsRow}>
              <ThemedText style={[styles.totalLabel, { color: themeColors.textSecondary }]}>Subtotal:</ThemedText>
              <ThemedText style={[styles.totalValue, { color: themeColors.text }]}>${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</ThemedText>
            </View>
            <View style={styles.totalsRow}>
              <ThemedText style={[styles.totalLabel, { color: themeColors.textSecondary }]}>IVA (Calculado):</ThemedText>
              <ThemedText style={[styles.totalValue, { color: themeColors.text }]}>${iva.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</ThemedText>
            </View>
            <View style={[styles.totalsRow, styles.totalFinalRow, { borderTopColor: themeColors.border }]}>
              <ThemedText style={[styles.totalFinalLabel, { color: themeColors.text }]}>Total a Cobrar:</ThemedText>
              <ThemedText style={[styles.totalFinalValue, { color: themeColors.primary }]}>${total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</ThemedText>
            </View>
          </View>
          
          <View style={[styles.actionButtonsBottom, isMobile && { flexDirection: 'column' }]}>
            <TouchableOpacity 
              style={[styles.bottomBtnSecondary, { borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement }]}
              onPress={handlePrintPDF}
            >
              <Ionicons name="download-outline" size={20} color={themeColors.text} />
              <ThemedText style={{ color: themeColors.text, fontWeight: '600', marginLeft: 8 }}>Descargar PDF</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.bottomBtnPrimary, { backgroundColor: '#2196F3' }]}
              onPress={handleEnviar}
            >
              <Ionicons name="save-outline" size={18} color="#ffffff" />
              <ThemedText style={{ color: '#ffffff', fontWeight: 'bold', marginLeft: 8 }}>Guardar</ThemedText>
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
  },
  autocompleteContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  autocompleteItem: {
    padding: 12,
    borderBottomWidth: 1,
  },
});
