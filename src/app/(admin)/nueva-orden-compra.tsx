import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
  useWindowDimensions,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import CustomInput from '@/components/CustomInput';
import { OrdenCompra, OrdenCompraLinea } from '@/types/ordenesCompra';
import { exportarOrdenCompraOdooPDF } from '@/utils/reportGenerator';
import { numeroALetras } from '@/utils/numeroALetras';
import { ThemedText } from '@/components/themed-text';
import { DescripcionProductoEditor } from '@/components/cotizaciones/DescripcionProductoEditor';
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

const ESTATUS_OPCIONES = ['En Proceso', 'Enviada', 'Recibida', 'Borrador', 'Cancelada'] as const;

export default function NuevaOrdenCompraScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const editId = params.id as string | undefined;
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const { user } = useAuth();

  const [orden, setOrden] = useState<OrdenCompra>({
    folio: '1',
    proveedorNombre: '',
    proveedorRFC: '',
    proveedorCorreo: '',
    proveedorCalleNumero: '',
    proveedorColonia: '',
    proveedorCiudad: '',
    proveedorEstado: '',
    proveedorCP: '',
    referencia: '',
    facturar: true,
    estatusProceso: 'En Proceso',
    moneda: 'MXN',
    tipoCambio: 1,
    fechaCreacion: new Date().toLocaleDateString('es-MX'),
    realizoCompra: user?.nombre || '',
    recibidoPor: '',
    lineas: [],
    observaciones: '',
    condicionesTrabajo: '',
    clienteFinal: '',
    subtotal: 0,
    iva: 0,
    total: 0,
  });

  const [tipoCambioStr, setTipoCambioStr] = useState('1');
  const [isSaving, setIsSaving] = useState(false);

  const [providerSearchResults, setProviderSearchResults] = useState<any[]>([]);
  const [showProviderResults, setShowProviderResults] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');

  const [formMessage, setFormMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());

  const [productSearchResults, setProductSearchResults] = useState<any[]>([]);
  const [activeProductLineId, setActiveProductLineId] = useState<string | null>(null);

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setCurrentDate(selectedDate);
      setOrden((prev) => ({ ...prev, fechaCreacion: selectedDate.toLocaleDateString('es-MX') }));
    }
  };

  const showAlert = (title: string, message: string) => {
    setFormMessage({ type: title.toLowerCase().includes('error') ? 'error' : 'success', text: message });
    if (Platform.OS === 'web') {
      try {
        window.alert(`${title}: ${message}`);
      } catch {}
    } else {
      Alert.alert(title, message);
    }
  };

  const searchProviders = async (text: string) => {
    try {
      const headers = await getApiHeaders();
      const url = text.trim()
        ? `${getApiUrl()}/api/ordenes-compra/search-proveedores?q=${encodeURIComponent(text.trim())}`
        : `${getApiUrl()}/api/ordenes-compra/search-proveedores`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        setProviderSearchResults([]);
        return;
      }
      const data = await res.json();
      setProviderSearchResults(data.proveedores || []);
    } catch {
      setProviderSearchResults([]);
    }
  };

  const handleSelectProvider = (prov: any) => {
    setOrden((prev) => ({
      ...prev,
      proveedorId: prov.id,
      proveedorNombre: prov.nombre || '',
      proveedorRFC: prov.rfc || '',
      proveedorCorreo: prov.correo_electronico || '',
      proveedorCalleNumero: prov.calle_numero || '',
      proveedorColonia: prov.colonia || '',
      proveedorCiudad: prov.ciudad || '',
      proveedorEstado: prov.estado || '',
      proveedorCP: prov.codigo_postal || '',
    }));
    setShowProviderResults(false);
    setProviderSearch('');
  };

  const searchProducts = async (lineId: string, text: string) => {
    handleUpdateLine(lineId, 'productoNombre', text);
    setOrden((prev) => ({
      ...prev,
      lineas: prev.lineas.map((l) => (l.id === lineId ? { ...l, productoId: undefined } : l)),
    }));
    setActiveProductLineId(lineId);

    try {
      const headers = await getApiHeaders();
      const q = text.trim();
      const url =
        q.length > 0
          ? `${getApiUrl()}/api/ordenes-compra/search-productos?q=${encodeURIComponent(q)}`
          : `${getApiUrl()}/api/ordenes-compra/search-productos`;
      const res = await fetch(url, { headers });
      if (res.ok) {
        const json = await res.json();
        setProductSearchResults(json.productos || []);
      } else {
        setProductSearchResults([]);
      }
    } catch {
      setProductSearchResults([]);
    }
  };

  const handleSelectProduct = (lineId: string, product: any) => {
    setOrden((prev) => {
      const newLineas = prev.lineas.map((linea) => {
        if (linea.id === lineId) {
          const pLista = Number(product.precio_unitario || product.precio || linea.precioLista || 0);
          const pct = Number(linea.descuentoPorcentaje || 0);
          const pu = Math.round(pLista * (1 + pct / 100) * 100) / 100;
          const cant = Number(linea.cantidad || 1);
          return {
            ...linea,
            productoNombre: product.nombre_oficial || product.nombre || '',
            productoId: product.id,
            unidad: product.unidad || linea.unidad || 'Pieza',
            precioLista: pLista,
            precioListaStr: pLista > 0 ? String(pLista) : linea.precioListaStr,
            precioUnitario: pu,
            precioUnitarioStr: pu > 0 ? String(pu) : linea.precioUnitarioStr,
            impuestoPorcentaje:
              product.impuesto_porcentaje !== null && product.impuesto_porcentaje !== undefined
                ? Number(product.impuesto_porcentaje)
                : 16,
            importe: Math.round(cant * pu * 100) / 100,
          };
        }
        return linea;
      });
      return { ...prev, lineas: newLineas };
    });
    setProductSearchResults([]);
    setActiveProductLineId(null);
  };

  useEffect(() => {
    const loadInitial = async () => {
      if (editId) {
        try {
          const headers = await getApiHeaders();
          const res = await fetch(`${getApiUrl()}/api/ordenes-compra/${editId}`, { headers });
          if (res.ok) {
            const data = await res.json();
            const oc = data.ordenCompra;
            const prov = data.proveedorData;
            if (oc) {
              const tc = Number(oc.tipo_cambio) || 1;
              setTipoCambioStr(String(tc));
              setOrden({
                id: oc.id,
                folio: String(oc.folio || ''),
                proveedorId: oc.proveedor_id || prov?.id,
                proveedorNombre: oc.proveedor_nombre || prov?.nombre || '',
                proveedorRFC: oc.proveedor_rfc || prov?.rfc || '',
                proveedorCorreo: oc.proveedor_correo || prov?.correo_electronico || '',
                proveedorCalleNumero: oc.proveedor_calle_numero || prov?.calle_numero || '',
                proveedorColonia: oc.proveedor_colonia || prov?.colonia || '',
                proveedorCiudad: oc.proveedor_ciudad || prov?.ciudad || '',
                proveedorEstado: oc.proveedor_estado || prov?.estado || '',
                proveedorCP: oc.proveedor_cp || prov?.codigo_postal || '',
                referencia: oc.referencia || '',
                facturar: oc.facturar !== undefined ? Boolean(oc.facturar) : true,
                estatusProceso: oc.estatus_proceso || 'En Proceso',
                moneda: oc.moneda || 'MXN',
                tipoCambio: tc,
                fechaCreacion: oc.fecha_creacion || new Date().toLocaleDateString('es-MX'),
                realizoCompra: oc.realizo_compra || user?.nombre || '',
                recibidoPor: oc.recibido_por || '',
                lineas: Array.isArray(oc.lineas) ? oc.lineas : [],
                observaciones: oc.observaciones || '',
                condicionesTrabajo: oc.condiciones_trabajo || '',
                clienteFinal: oc.cliente_final || '',
                subtotal: Number(oc.subtotal) || 0,
                iva: Number(oc.iva) || 0,
                total: Number(oc.total) || 0,
              });
              return;
            }
          }
        } catch (err) {
          console.error('Error cargando orden de compra:', err);
        }
      }

      try {
        const headers = await getApiHeaders();
        const res = await fetch(`${getApiUrl()}/api/ordenes-compra/last-folio`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (data.nextFolio) {
            setOrden((prev) => ({ ...prev, folio: String(data.nextFolio) }));
          }
        }
      } catch (err) {
        console.error('Error obteniendo último folio de orden de compra:', err);
      }
    };

    loadInitial();
  }, [editId, user?.nombre]);

  useEffect(() => {
    if (!editId && user?.nombre) {
      setOrden((prev) => (prev.realizoCompra ? prev : { ...prev, realizoCompra: user.nombre }));
    }
  }, [user?.nombre, editId]);

  const subtotal = useMemo(() => {
    const sum = orden.lineas.reduce(
      (acc, item) => acc + Number(item.cantidad || 0) * Number(item.precioUnitario || 0),
      0
    );
    return Math.round(sum * 100) / 100;
  }, [orden.lineas]);

  const iva = useMemo(() => {
    const sum = orden.lineas.reduce((acc, item) => {
      const lineaSub = Number(item.cantidad || 0) * Number(item.precioUnitario || 0);
      return acc + lineaSub * (Number(item.impuestoPorcentaje || 0) / 100);
    }, 0);
    return Math.round(sum * 100) / 100;
  }, [orden.lineas]);

  const total = useMemo(() => Math.round((subtotal + iva) * 100) / 100, [subtotal, iva]);

  const importeConLetra = useMemo(() => numeroALetras(total, orden.moneda), [total, orden.moneda]);

  const handleAddLine = () => {
    const nuevaLinea: OrdenCompraLinea = {
      id: Math.random().toString(36).slice(2),
      productoNombre: '',
      productoDescripcion: '',
      tiempoEntrega: '',
      unidad: 'Pieza',
      cantidad: 1,
      precioLista: 0,
      descuentoPorcentaje: 0,
      precioUnitario: 0,
      impuestoPorcentaje: 16,
      importe: 0,
    };
    setOrden((prev) => ({ ...prev, lineas: [...prev.lineas, nuevaLinea] }));
  };

  const handleUpdateLine = (id: string, field: keyof OrdenCompraLinea, value: any) => {
    setOrden((prev) => ({
      ...prev,
      lineas: prev.lineas.map((linea) => (linea.id === id ? { ...linea, [field]: value } : linea)),
    }));
  };

  const handleUpdateLineNumericText = (
    id: string,
    field: 'cantidad' | 'precioLista' | 'descuentoPorcentaje' | 'precioUnitario' | 'impuestoPorcentaje',
    rawText: string
  ) => {
    let sanitized = '';
    if (field === 'descuentoPorcentaje') {
      let raw = rawText.replace(',', '.').replace(/[^0-9.+-]/g, '');
      let sign = '';
      if (raw.startsWith('-')) {
        sign = '-';
        raw = raw.slice(1);
      } else if (raw.startsWith('+')) {
        sign = '+';
        raw = raw.slice(1);
      }
      raw = raw.replace(/[+-]/g, '');
      raw = raw.replace(/(\..*?)\..*/g, '$1');
      sanitized = sign + raw;
    } else {
      sanitized = rawText.replace(',', '.').replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1');
    }

    const parsedNum = parseFloat(sanitized);
    const numVal = isNaN(parsedNum) ? 0 : parsedNum;

    setOrden((prev) => {
      const newLineas = prev.lineas.map((linea) => {
        if (linea.id !== id) return linea;

        const updated: OrdenCompraLinea = { ...linea };

        if (field === 'cantidad') {
          updated.cantidadStr = sanitized;
          updated.cantidad = numVal;
        } else if (field === 'precioLista') {
          updated.precioListaStr = sanitized;
          updated.precioLista = numVal;
          const pct = Number(updated.descuentoPorcentaje || 0);
          const calcPU = Math.round(numVal * (1 + pct / 100) * 100) / 100;
          updated.precioUnitario = calcPU;
          updated.precioUnitarioStr = calcPU > 0 ? String(calcPU) : sanitized;
        } else if (field === 'descuentoPorcentaje') {
          updated.descuentoPorcentajeStr = sanitized;
          updated.descuentoPorcentaje = numVal;
          const pLista = Number(updated.precioLista || 0);
          const calcPU = Math.round(pLista * (1 + numVal / 100) * 100) / 100;
          updated.precioUnitario = calcPU;
          updated.precioUnitarioStr = String(calcPU);
        } else if (field === 'precioUnitario') {
          updated.precioUnitarioStr = sanitized;
          updated.precioUnitario = numVal;
          const pLista = Number(updated.precioLista || 0);
          if (pLista > 0) {
            const diffPct = Math.round(((numVal - pLista) / pLista) * 100 * 100) / 100;
            updated.descuentoPorcentaje = diffPct;
            updated.descuentoPorcentajeStr = diffPct > 0 ? `+${diffPct}` : String(diffPct);
          } else {
            updated.precioLista = numVal;
            updated.precioListaStr = sanitized;
          }
        } else if (field === 'impuestoPorcentaje') {
          updated.impuestoPorcentajeStr = sanitized;
          updated.impuestoPorcentaje = numVal;
        }

        updated.importe = Math.round(Number(updated.cantidad || 0) * Number(updated.precioUnitario || 0) * 100) / 100;
        return updated;
      });

      return { ...prev, lineas: newLineas };
    });
  };

  const handleDuplicateLine = (index: number) => {
    const item = orden.lineas[index];
    if (!item) return;
    const duplicated: OrdenCompraLinea = {
      ...item,
      id: Math.random().toString(36).slice(2),
    };
    const newLineas = [...orden.lineas];
    newLineas.splice(index + 1, 0, duplicated);
    setOrden((prev) => ({ ...prev, lineas: newLineas }));
  };

  const handleRemoveLine = (id: string) => {
    setOrden((prev) => ({
      ...prev,
      lineas: prev.lineas.filter((l) => l.id !== id),
    }));
  };

  const handlePrintPDF = async () => {
    try {
      await exportarOrdenCompraOdooPDF({ ...orden, subtotal, iva, total }, 'download');
    } catch (error: any) {
      showAlert('Error', error.message || 'Error al generar el PDF');
    }
  };

  const handleGuardar = async () => {
    if (!orden.folio.trim()) {
      showAlert('Error', 'Debes ingresar el folio de la orden de compra.');
      return;
    }
    if (!orden.proveedorNombre.trim()) {
      showAlert('Error', 'Debes ingresar el nombre de la empresa / proveedor.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        folio: orden.folio.trim(),
        proveedor_id: orden.proveedorId || null,
        proveedor_nombre: orden.proveedorNombre.trim(),
        proveedor_rfc: orden.proveedorRFC?.trim() || null,
        proveedor_correo: orden.proveedorCorreo?.trim() || null,
        proveedor_calle_numero: orden.proveedorCalleNumero?.trim() || null,
        proveedor_colonia: orden.proveedorColonia?.trim() || null,
        proveedor_ciudad: orden.proveedorCiudad?.trim() || null,
        proveedor_estado: orden.proveedorEstado?.trim() || null,
        proveedor_cp: orden.proveedorCP?.trim() || null,
        referencia: orden.referencia?.trim() || null,
        facturar: orden.facturar,
        estatus_proceso: orden.estatusProceso || 'En Proceso',
        moneda: orden.moneda || 'MXN',
        tipo_cambio: Number(orden.tipoCambio) > 0 ? Number(orden.tipoCambio) : 1,
        fecha_creacion: orden.fechaCreacion,
        realizo_compra: orden.realizoCompra?.trim() || null,
        recibido_por: orden.recibidoPor?.trim() || null,
        subtotal,
        iva,
        total,
        lineas: orden.lineas,
        observaciones: orden.observaciones || null,
        condiciones_trabajo: orden.condicionesTrabajo || null,
        cliente_final: orden.clienteFinal?.trim() || null,
      };

      const proveedorData = {
        id: orden.proveedorId || null,
        nombre: orden.proveedorNombre.trim(),
        rfc: orden.proveedorRFC?.trim() || null,
        correo_electronico: orden.proveedorCorreo?.trim() || null,
        calle_numero: orden.proveedorCalleNumero?.trim() || null,
        colonia: orden.proveedorColonia?.trim() || null,
        ciudad: orden.proveedorCiudad?.trim() || null,
        estado: orden.proveedorEstado?.trim() || null,
        codigo_postal: orden.proveedorCP?.trim() || null,
      };

      const headers = await getApiHeaders();
      const method = editId ? 'PUT' : 'POST';
      const url = editId
        ? `${getApiUrl()}/api/ordenes-compra/${editId}`
        : `${getApiUrl()}/api/ordenes-compra`;

      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify({ payload, proveedorData }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Error al guardar la orden de compra');
      }

      showAlert('Éxito', editId ? 'Orden de compra actualizada exitosamente.' : 'Orden de compra guardada exitosamente.');
      setTimeout(() => {
        router.replace('/(admin)/ordenes-compra');
      }, 1000);
    } catch (error: any) {
      console.error('Error guardando orden de compra:', error);
      showAlert('Error', error.message || 'Hubo un error guardando la orden de compra.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: themeColors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Cabecera y Selector de Estatus de Proceso */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: Spacing.three,
            paddingTop: Spacing.three,
            paddingBottom: Spacing.two,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity
              onPress={() => router.replace('/(admin)/ordenes-compra')}
              style={{ marginRight: Spacing.two, padding: 8 }}
            >
              <Ionicons name="arrow-back" size={24} color={themeColors.text} />
            </TouchableOpacity>
            <ThemedText style={{ fontSize: 20, fontWeight: 'bold', color: themeColors.text }}>
              {editId ? 'Editar Orden de Compra' : 'Nueva Orden de Compra'}
            </ThemedText>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {ESTATUS_OPCIONES.map((status) => {
              const getStatusColor = () => {
                switch (status) {
                  case 'Borrador':
                    return '#757575';
                  case 'En Proceso':
                    return '#0284c7';
                  case 'Enviada':
                    return '#FF9800';
                  case 'Recibida':
                    return '#10b981';
                  case 'Cancelada':
                    return '#ef4444';
                }
              };
              const activeColor = getStatusColor();
              const isActive = orden.estatusProceso === status;

              return (
                <TouchableOpacity
                  key={status}
                  onPress={() => setOrden((prev) => ({ ...prev, estatusProceso: status }))}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: isActive ? activeColor : themeColors.border,
                    backgroundColor: isActive ? activeColor + '20' : 'transparent',
                  }}
                >
                  <ThemedText
                    style={{
                      fontSize: 12,
                      fontWeight: isActive ? 'bold' : 'normal',
                      color: isActive ? activeColor : themeColors.textSecondary,
                    }}
                  >
                    {status}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Banner de Mensajes */}
        {formMessage && (
          <View
            style={{
              marginHorizontal: Spacing.two,
              backgroundColor: formMessage.type === 'error' ? '#ffebee' : '#e8f5e9',
              padding: 12,
              borderRadius: 8,
              marginBottom: 8,
              borderWidth: 1,
              borderColor: formMessage.type === 'error' ? '#ffcdd2' : '#c8e6c9',
            }}
          >
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
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: Spacing.three }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <ThemedText style={{ fontSize: 14, fontWeight: '700', color: themeColors.textSecondary }}>FOLIO:</ThemedText>
              <TextInput
                value={orden.folio}
                onChangeText={(t) => setOrden((prev) => ({ ...prev, folio: t }))}
                style={{
                  fontSize: 22,
                  fontWeight: '800',
                  color: themeColors.text,
                  borderBottomWidth: 2,
                  borderBottomColor: themeColors.primary,
                  minWidth: 90,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
                }}
                placeholder="64"
                placeholderTextColor={themeColors.textSecondary}
              />
            </View>
          </View>

          <View style={[styles.grid, isMobile && styles.gridMobile]}>
            {/* COLUMNA 1: PROVEEDOR Y DIRECCIÓN */}
            <View style={[styles.column, isMobile && styles.columnMobile, { zIndex: 20 }]}>
              <View style={{ zIndex: 3000, marginBottom: Spacing.one }}>
                <ThemedText style={{ fontSize: 13, fontWeight: '700', color: themeColors.textSecondary, marginBottom: Spacing.one }}>
                  EMPRESA / PROVEEDOR
                </ThemedText>
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: themeColors.backgroundElement,
                    borderWidth: 1,
                    borderColor: themeColors.border,
                    borderRadius: 12,
                    padding: 14,
                    height: 50,
                  }}
                  onPress={() => {
                    Keyboard.dismiss();
                    const next = !showProviderResults;
                    setShowProviderResults(next);
                    if (next) searchProviders(providerSearch);
                  }}
                >
                  <ThemedText style={{ color: orden.proveedorNombre ? themeColors.text : themeColors.textSecondary }}>
                    {orden.proveedorNombre || 'Selecciona o agrega un proveedor'}
                  </ThemedText>
                  <Ionicons
                    name={showProviderResults ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={themeColors.textSecondary}
                  />
                </TouchableOpacity>

                {showProviderResults && (
                  <View
                    style={{
                      backgroundColor: themeColors.backgroundElement,
                      borderWidth: 1,
                      borderColor: themeColors.border,
                      borderRadius: 16,
                      marginTop: 6,
                      shadowColor: '#000',
                      shadowOpacity: 0.12,
                      shadowRadius: 8,
                      elevation: 5,
                    }}
                  >
                    <CustomInput
                      placeholder="Buscar o agregar proveedor..."
                      value={providerSearch}
                      onChangeText={(text) => {
                        setProviderSearch(text);
                        searchProviders(text);
                      }}
                      iconName="search-outline"
                      style={{ margin: Spacing.one, height: 40 }}
                    />
                    <ScrollView
                      nestedScrollEnabled
                      style={{ maxHeight: 200, paddingHorizontal: Spacing.half }}
                      keyboardShouldPersistTaps="handled"
                    >
                      {providerSearchResults.map((prov, index, array) => (
                        <TouchableOpacity
                          key={prov.id}
                          onPress={() => handleSelectProvider(prov)}
                          style={{
                            padding: 12,
                            borderBottomWidth: index === array.length - 1 ? 0 : 0.5,
                            borderBottomColor: themeColors.border,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: Spacing.one,
                          }}
                        >
                          <Ionicons name="business-outline" size={22} color={themeColors.primary} />
                          <View style={{ flex: 1 }}>
                            <ThemedText style={{ fontWeight: '600', color: themeColors.text }}>{prov.nombre}</ThemedText>
                            {!!(prov.rfc || prov.ciudad) && (
                              <ThemedText style={{ fontSize: 11, color: themeColors.textSecondary }}>
                                {prov.rfc || ''}
                                {prov.ciudad ? ` • ${prov.ciudad}` : ''}
                              </ThemedText>
                            )}
                          </View>
                        </TouchableOpacity>
                      ))}
                      {providerSearch.trim().length > 0 && (
                        <TouchableOpacity
                          style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: Spacing.one }}
                          onPress={() => {
                            setOrden((prev) => ({
                              ...prev,
                              proveedorId: undefined,
                              proveedorNombre: providerSearch.trim(),
                            }));
                            setProviderSearch('');
                            setShowProviderResults(false);
                          }}
                        >
                          <Ionicons name="add-circle-outline" size={24} color={themeColors.accent} />
                          <ThemedText style={{ color: themeColors.accent, fontWeight: '600' }}>
                            Usar "{providerSearch.trim()}"
                          </ThemedText>
                        </TouchableOpacity>
                      )}
                    </ScrollView>
                  </View>
                )}
              </View>

              <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                <View style={{ flex: 1 }}>
                  <CustomInput
                    label="RFC"
                    value={orden.proveedorRFC || ''}
                    onChangeText={(t) => setOrden((prev) => ({ ...prev, proveedorRFC: t }))}
                    placeholder="WME000218GK3"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <CustomInput
                    label="C.P."
                    value={orden.proveedorCP || ''}
                    onChangeText={(t) => setOrden((prev) => ({ ...prev, proveedorCP: t }))}
                    placeholder="03100"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <CustomInput
                label="Calle y No."
                value={orden.proveedorCalleNumero || ''}
                onChangeText={(t) => setOrden((prev) => ({ ...prev, proveedorCalleNumero: t }))}
                placeholder="Ej. Insurgentes Sur 730, Piso 11"
              />

              <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                <View style={{ flex: 1 }}>
                  <CustomInput
                    label="Colonia"
                    value={orden.proveedorColonia || ''}
                    onChangeText={(t) => setOrden((prev) => ({ ...prev, proveedorColonia: t }))}
                    placeholder="Ej. Del Valle"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <CustomInput
                    label="Ciudad"
                    value={orden.proveedorCiudad || ''}
                    onChangeText={(t) => setOrden((prev) => ({ ...prev, proveedorCiudad: t }))}
                    placeholder="Ej. Ciudad de México"
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                <View style={{ flex: 1 }}>
                  <CustomInput
                    label="Estado"
                    value={orden.proveedorEstado || ''}
                    onChangeText={(t) => setOrden((prev) => ({ ...prev, proveedorEstado: t }))}
                    placeholder="Ej. Estado de México"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <CustomInput
                    label="Correo (Opcional)"
                    value={orden.proveedorCorreo || ''}
                    onChangeText={(t) => setOrden((prev) => ({ ...prev, proveedorCorreo: t }))}
                    placeholder="ventas@proveedor.com"
                    keyboardType="email-address"
                  />
                </View>
              </View>
            </View>

            {/* COLUMNA 2: DETALLES DE LA COMPRA */}
            <View style={[styles.column, isMobile && styles.columnMobile]}>
              <ThemedText style={{ fontSize: 13, fontWeight: '700', color: themeColors.textSecondary, marginBottom: Spacing.one }}>
                DETALLES DE LA COMPRA
              </ThemedText>

              <CustomInput
                label="Referencia"
                value={orden.referencia || ''}
                onChangeText={(t) => setOrden((prev) => ({ ...prev, referencia: t }))}
                placeholder="Ej. Fortinet FGT60FTK21023003 / Proyecto"
              />

              <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                <View style={{ flex: 1 }}>
                  <CustomInput
                    label="Realizó la Compra"
                    value={orden.realizoCompra}
                    onChangeText={(t) => setOrden((prev) => ({ ...prev, realizoCompra: t }))}
                    placeholder="Nombre de quien compra"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <CustomInput
                    label="Recibido Por (Opcional)"
                    value={orden.recibidoPor || ''}
                    onChangeText={(t) => setOrden((prev) => ({ ...prev, recibidoPor: t }))}
                    placeholder="Nombre y Firma"
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap', marginTop: 4 }}>
                {/* Fecha */}
                <View style={{ flex: 1, minWidth: 140 }}>
                  <ThemedText style={{ fontSize: 12, fontWeight: '600', color: themeColors.textSecondary, marginBottom: 4 }}>
                    Fecha
                  </ThemedText>
                  <View style={{ position: 'relative' }}>
                    <TouchableOpacity
                      onPress={() => setShowDatePicker(true)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 12,
                        paddingHorizontal: 12,
                        borderWidth: 1,
                        borderColor: themeColors.border,
                        backgroundColor: themeColors.backgroundElement,
                        borderRadius: 8,
                      }}
                    >
                      <ThemedText style={{ color: themeColors.text }}>{orden.fechaCreacion}</ThemedText>
                      <Ionicons name="calendar-outline" size={16} color={themeColors.textSecondary} />
                    </TouchableOpacity>
                    {Platform.OS === 'web' &&
                      React.createElement('input', {
                        type: 'date',
                        onChange: (e: any) => {
                          const val = e.target.value;
                          if (val) {
                            const [y, m, d] = val.split('-').map(Number);
                            const picked = new Date(y, m - 1, d);
                            setCurrentDate(picked);
                            setOrden((prev) => ({ ...prev, fechaCreacion: picked.toLocaleDateString('es-MX') }));
                          }
                        },
                        onClick: (e: any) => {
                          try {
                            e.currentTarget.showPicker?.();
                          } catch {}
                        },
                        style: {
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          width: '100%',
                          height: '100%',
                          opacity: 0,
                          cursor: 'pointer',
                        },
                      })}
                  </View>
                  {showDatePicker && Platform.OS !== 'web' && (
                    <DateTimePicker value={currentDate} mode="date" display="default" onChange={onDateChange} />
                  )}
                </View>

                {/* Facturar SI / NO */}
                <View style={{ flex: 1, minWidth: 130 }}>
                  <ThemedText style={{ fontSize: 12, fontWeight: '600', color: themeColors.textSecondary, marginBottom: 4 }}>
                    Facturar
                  </ThemedText>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {[
                      { label: 'SI', val: true },
                      { label: 'NO', val: false },
                    ].map((opt) => (
                      <TouchableOpacity
                        key={opt.label}
                        onPress={() => setOrden((prev) => ({ ...prev, facturar: opt.val }))}
                        style={{
                          flex: 1,
                          paddingVertical: 11,
                          alignItems: 'center',
                          borderWidth: 1,
                          borderColor: orden.facturar === opt.val ? themeColors.primary : themeColors.border,
                          backgroundColor: orden.facturar === opt.val ? themeColors.primary : themeColors.backgroundElement,
                          borderRadius: 6,
                        }}
                      >
                        <ThemedText
                          style={{
                            fontSize: 12,
                            fontWeight: '700',
                            color: orden.facturar === opt.val ? '#fff' : themeColors.text,
                          }}
                        >
                          {opt.label}
                        </ThemedText>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              {/* Moneda y Tipo de Cambio */}
              <View style={{ flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap', marginTop: 4 }}>
                <View style={{ flex: 1.3, minWidth: 150 }}>
                  <ThemedText style={{ fontSize: 12, fontWeight: '600', color: themeColors.textSecondary, marginBottom: 4 }}>
                    Tipo de Moneda
                  </ThemedText>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {['MXN', 'USD', 'EUR'].map((m) => (
                      <TouchableOpacity
                        key={m}
                        onPress={() => {
                          setOrden((prev) => ({
                            ...prev,
                            moneda: m,
                            tipoCambio: m === 'MXN' ? 1 : prev.tipoCambio,
                          }));
                          if (m === 'MXN') setTipoCambioStr('1');
                        }}
                        style={{
                          flex: 1,
                          paddingVertical: 11,
                          alignItems: 'center',
                          borderWidth: 1,
                          borderColor: orden.moneda === m ? themeColors.primary : themeColors.border,
                          backgroundColor: orden.moneda === m ? themeColors.primary : themeColors.backgroundElement,
                          borderRadius: 6,
                        }}
                      >
                        <ThemedText style={{ fontSize: 12, fontWeight: '700', color: orden.moneda === m ? '#fff' : themeColors.text }}>
                          {m}
                        </ThemedText>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={{ flex: 1, minWidth: 120 }}>
                  <ThemedText style={{ fontSize: 12, fontWeight: '600', color: themeColors.textSecondary, marginBottom: 4 }}>
                    Tipo de Cambio
                  </ThemedText>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        color: themeColors.text,
                        borderColor: themeColors.border,
                        backgroundColor: themeColors.backgroundElement,
                        height: 44,
                        fontWeight: '600',
                        ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
                      },
                    ]}
                    value={tipoCambioStr}
                    onChangeText={(raw) => {
                      const clean = raw.replace(',', '.').replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1');
                      setTipoCambioStr(clean);
                      const parsed = parseFloat(clean);
                      setOrden((prev) => ({ ...prev, tipoCambio: isNaN(parsed) ? 1 : parsed }));
                    }}
                    placeholder="20.2695"
                    placeholderTextColor={themeColors.textSecondary}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Partidas y Productos */}
        <View
          style={[
            styles.card,
            { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, overflow: 'visible' },
          ]}
        >
          <View style={styles.cardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="cart" size={18} color="#0284c7" />
              <ThemedText style={[styles.cardTitle, { color: themeColors.text, marginBottom: 0 }]}>
                Partidas y Productos ({orden.lineas.length})
              </ThemedText>
            </View>
            <TouchableOpacity
              onPress={handleAddLine}
              style={[styles.addBtn, { backgroundColor: '#0284c715', borderColor: '#0284c730', borderWidth: 1 }]}
            >
              <Ionicons name="add" size={16} color="#0284c7" />
              <ThemedText style={[styles.addBtnText, { color: '#0284c7' }]}>Agregar Línea</ThemedText>
            </TouchableOpacity>
          </View>

          {orden.lineas.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="cube-outline" size={48} color={themeColors.border} />
              <ThemedText style={{ color: themeColors.textSecondary, marginTop: Spacing.one }}>
                No hay productos en esta orden de compra.
              </ThemedText>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerStyle={{ minWidth: isMobile ? 980 : '100%' }}>
              <View style={{ flex: 1, overflow: 'visible' }}>
                {/* Header de Tabla */}
                <View
                  style={[
                    styles.partidasTableHeader,
                    { backgroundColor: themeColors.backgroundElement, borderBottomColor: themeColors.border },
                  ]}
                >
                  <Text style={[styles.partidasColHeader, { width: 32, textAlign: 'center' }]}>#</Text>
                  <Text style={[styles.partidasColHeader, { flex: 1, minWidth: 240 }]}>Descripción / Producto</Text>
                  <Text style={[styles.partidasColHeader, { width: 85 }]}>Unidad</Text>
                  <Text style={[styles.partidasColHeader, { width: 90 }]}>Entrega</Text>
                  <Text style={[styles.partidasColHeader, { width: 62, textAlign: 'right' }]}>Cant.</Text>
                  <Text style={[styles.partidasColHeader, { width: 92, textAlign: 'right' }]}>P. Lista</Text>
                  <Text style={[styles.partidasColHeader, { width: 65, textAlign: 'right' }]}>%+-</Text>
                  <Text style={[styles.partidasColHeader, { width: 92, textAlign: 'right' }]}>P. Unit.</Text>
                  <Text style={[styles.partidasColHeader, { width: 60, textAlign: 'right' }]}>IVA %</Text>
                  <Text style={[styles.partidasColHeader, { width: 100, textAlign: 'center' }]}>Importe</Text>
                  <Text style={[styles.partidasColHeader, { width: 65, textAlign: 'center' }]}>Acciones</Text>
                </View>

                <View style={{ position: 'relative', zIndex: activeProductLineId !== null ? 9999 : 1, overflow: 'visible' }}>
                  {orden.lineas.map((linea, index) => {
                    const cant = Number(linea.cantidad) || 0;
                    const pu = Number(linea.precioUnitario) || 0;
                    const subtotalLinea = cant * pu;
                    const ivaLinea = subtotalLinea * ((Number(linea.impuestoPorcentaje) || 0) / 100);

                    return (
                      <View
                        key={linea.id || index}
                        style={[
                          styles.partidasTableRow,
                          {
                            borderColor: themeColors.border,
                            backgroundColor: themeColors.background,
                            position: 'relative',
                            zIndex: activeProductLineId === linea.id ? 99999 : orden.lineas.length - index,
                            overflow: 'visible',
                          },
                        ]}
                      >
                        {/* 1. # */}
                        <View style={{ width: 32, alignItems: 'center', justifyContent: 'center', paddingTop: 6 }}>
                          <View style={[styles.partidaNumBadge, { backgroundColor: '#0284c7' }]}>
                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{index + 1}</Text>
                          </View>
                        </View>

                        {/* 2. Producto + Descripción */}
                        <View
                          style={{
                            flex: 1,
                            minWidth: 240,
                            paddingRight: 8,
                            position: 'relative',
                            zIndex: activeProductLineId === linea.id ? 99999 : 1,
                            overflow: 'visible',
                          }}
                        >
                          <View
                            style={[
                              styles.cascadeInputContainer,
                              {
                                backgroundColor: themeColors.backgroundElement,
                                borderColor: activeProductLineId === linea.id ? '#0284c7' : themeColors.border,
                                height: 36,
                                borderRadius: 6,
                                paddingHorizontal: 8,
                              },
                            ]}
                          >
                            <TextInput
                              style={[styles.cascadeTextInput, { color: themeColors.text }]}
                              value={linea.productoNombre}
                              onChangeText={(t) => searchProducts(linea.id, t)}
                              onFocus={() => searchProducts(linea.id, linea.productoNombre)}
                              onBlur={() => {
                                setTimeout(() => {
                                  setActiveProductLineId((curr) => (curr === linea.id ? null : curr));
                                }, 250);
                              }}
                              placeholder="Ej. FortiGate-60F 1 Year UTP..."
                              placeholderTextColor={themeColors.textSecondary}
                            />
                            {!!linea.productoNombre && (
                              <TouchableOpacity
                                onPress={() => searchProducts(linea.id, '')}
                                style={{ padding: 4 }}
                              >
                                <Ionicons name="close-circle" size={16} color={themeColors.textSecondary} />
                              </TouchableOpacity>
                            )}
                          </View>

                          {activeProductLineId === linea.id && productSearchResults.length > 0 && (
                            <View
                              style={[
                                styles.autocompleteContainer,
                                {
                                  backgroundColor: themeColors.backgroundElement,
                                  borderColor: themeColors.border,
                                  top: 40,
                                  zIndex: 99999,
                                },
                              ]}
                            >
                              <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 200 }}>
                                {productSearchResults.map((prod) => (
                                  <TouchableOpacity
                                    key={prod.id}
                                    style={[styles.autocompleteItem, { borderBottomColor: themeColors.border }]}
                                    onPress={() => handleSelectProduct(linea.id, prod)}
                                  >
                                    <ThemedText style={{ color: themeColors.text, fontWeight: 'bold' }}>
                                      {prod.nombre_oficial}
                                    </ThemedText>
                                    <ThemedText style={{ color: themeColors.textSecondary, fontSize: 12 }}>
                                      SKU: {prod.sku_interno || 'N/A'} {prod.precio_unitario ? `• $${prod.precio_unitario}` : ''}
                                    </ThemedText>
                                  </TouchableOpacity>
                                ))}
                              </ScrollView>
                            </View>
                          )}

                          <View style={{ marginTop: 6 }}>
                            <DescripcionProductoEditor
                              value={linea.productoDescripcion || ''}
                              onChangeText={(t) => handleUpdateLine(linea.id, 'productoDescripcion', t)}
                              productoNombre={linea.productoNombre}
                              placeholder="Detalles o especificaciones de la partida..."
                            />
                          </View>
                        </View>

                        {/* 3. Unidad */}
                        <View style={{ width: 85, paddingRight: 6, paddingTop: 1 }}>
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
                                paddingHorizontal: 6,
                                minWidth: 0,
                                ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
                              },
                            ]}
                            value={linea.unidad || ''}
                            onChangeText={(val) => handleUpdateLine(linea.id, 'unidad', val)}
                            placeholder="Pieza"
                            placeholderTextColor={themeColors.textSecondary}
                          />
                        </View>

                        {/* 4. Tiempo Entrega */}
                        <View style={{ width: 90, paddingRight: 6, paddingTop: 1 }}>
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
                                paddingHorizontal: 6,
                                minWidth: 0,
                                ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
                              },
                            ]}
                            value={linea.tiempoEntrega || ''}
                            onChangeText={(val) => handleUpdateLine(linea.id, 'tiempoEntrega', val)}
                            placeholder="Ej. 3 días"
                            placeholderTextColor={themeColors.textSecondary}
                          />
                        </View>

                        {/* 5. Cantidad */}
                        <View style={{ width: 62, paddingRight: 6, paddingTop: 1 }}>
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
                            value={
                              linea.cantidadStr !== undefined
                                ? linea.cantidadStr
                                : linea.cantidad
                                ? linea.cantidad.toString()
                                : ''
                            }
                            onChangeText={(val) => handleUpdateLineNumericText(linea.id, 'cantidad', val)}
                            keyboardType="numeric"
                          />
                        </View>

                        {/* 6. Precio de Lista */}
                        <View style={{ width: 92, paddingRight: 6, paddingTop: 1 }}>
                          <View
                            style={[
                              styles.tableCurrencyContainer,
                              {
                                borderColor: themeColors.border,
                                backgroundColor: themeColors.backgroundElement,
                                height: 36,
                                borderRadius: 6,
                                paddingHorizontal: 5,
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
                              value={
                                linea.precioListaStr !== undefined
                                  ? linea.precioListaStr
                                  : linea.precioLista
                                  ? linea.precioLista.toString()
                                  : ''
                              }
                              onChangeText={(val) => handleUpdateLineNumericText(linea.id, 'precioLista', val)}
                              keyboardType="numeric"
                              placeholder="0.00"
                              placeholderTextColor={themeColors.textSecondary}
                            />
                          </View>
                        </View>

                        {/* 7. %+- */}
                        <View style={{ width: 65, paddingRight: 6, paddingTop: 1 }}>
                          <TextInput
                            style={[
                              styles.tableFieldInput,
                              {
                                color:
                                  Number(linea.descuentoPorcentaje || 0) < 0
                                    ? '#ef4444'
                                    : Number(linea.descuentoPorcentaje || 0) > 0
                                    ? '#10b981'
                                    : themeColors.text,
                                borderColor: themeColors.border,
                                backgroundColor: themeColors.backgroundElement,
                                textAlign: 'right',
                                height: 36,
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: '700',
                                paddingHorizontal: 6,
                                minWidth: 0,
                                ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
                              },
                            ]}
                            value={
                              linea.descuentoPorcentajeStr !== undefined
                                ? linea.descuentoPorcentajeStr
                                : linea.descuentoPorcentaje !== undefined
                                ? (linea.descuentoPorcentaje > 0 ? `+${linea.descuentoPorcentaje}` : linea.descuentoPorcentaje.toString())
                                : '0'
                            }
                            onChangeText={(val) => handleUpdateLineNumericText(linea.id, 'descuentoPorcentaje', val)}
                            placeholder="0"
                            placeholderTextColor={themeColors.textSecondary}
                            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                          />
                        </View>

                        {/* 8. Precio Unitario */}
                        <View style={{ width: 92, paddingRight: 6, paddingTop: 1 }}>
                          <View
                            style={[
                              styles.tableCurrencyContainer,
                              {
                                borderColor: themeColors.border,
                                backgroundColor: themeColors.backgroundElement,
                                height: 36,
                                borderRadius: 6,
                                paddingHorizontal: 5,
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
                              value={
                                linea.precioUnitarioStr !== undefined
                                  ? linea.precioUnitarioStr
                                  : linea.precioUnitario
                                  ? linea.precioUnitario.toString()
                                  : ''
                              }
                              onChangeText={(val) => handleUpdateLineNumericText(linea.id, 'precioUnitario', val)}
                              keyboardType="numeric"
                              placeholder="0.00"
                              placeholderTextColor={themeColors.textSecondary}
                            />
                          </View>
                        </View>

                        {/* 9. IVA (%) */}
                        <View style={{ width: 60, paddingRight: 6, paddingTop: 1 }}>
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
                            value={
                              linea.impuestoPorcentajeStr !== undefined
                                ? linea.impuestoPorcentajeStr
                                : linea.impuestoPorcentaje !== undefined
                                ? linea.impuestoPorcentaje.toString()
                                : '16'
                            }
                            onChangeText={(val) => handleUpdateLineNumericText(linea.id, 'impuestoPorcentaje', val)}
                            keyboardType="numeric"
                          />
                        </View>

                        {/* 10. Importe */}
                        <View style={{ width: 100, paddingHorizontal: 4, paddingTop: 4, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#10b981', textAlign: 'center' }}>
                            ${linea.importe.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Text>
                          <Text style={{ fontSize: 9, color: themeColors.textSecondary, marginTop: 1, textAlign: 'center' }}>
                            ${ivaLinea.toFixed(2)} IVA
                          </Text>
                        </View>

                        {/* 11. Acciones */}
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
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#0284c7' }}>+ Agregar una línea</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          )}
        </View>

        {/* Observaciones y Condiciones de Trabajo */}
        <View style={[styles.card, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
          <ThemedText style={[styles.cardTitle, { color: themeColors.primary, fontSize: 16, marginBottom: 12 }]}>
            Observaciones y Condiciones de Trabajo
          </ThemedText>

          <View style={{ gap: Spacing.two }}>
            <View style={styles.inputGroup}>
              <ThemedText style={[styles.label, { color: themeColors.textSecondary }]}>Observaciones</ThemedText>
              <TextInput
                style={[
                  styles.inputMultiline,
                  { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement },
                ]}
                multiline
                numberOfLines={3}
                placeholder="Observaciones adicionales para el proveedor..."
                placeholderTextColor={themeColors.textSecondary}
                value={orden.observaciones || ''}
                onChangeText={(t) => setOrden((prev) => ({ ...prev, observaciones: t }))}
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={[styles.label, { color: themeColors.textSecondary }]}>Condiciones de Trabajo</ThemedText>
              <TextInput
                style={[
                  styles.inputMultiline,
                  { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement },
                ]}
                multiline
                numberOfLines={3}
                placeholder="Condiciones de entrega, garantía, pago o trabajo..."
                placeholderTextColor={themeColors.textSecondary}
                value={orden.condicionesTrabajo || ''}
                onChangeText={(t) => setOrden((prev) => ({ ...prev, condicionesTrabajo: t }))}
              />
            </View>

            <View style={styles.inputGroup}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <ThemedText style={[styles.label, { color: themeColors.textSecondary, marginBottom: 0 }]}>
                  Datos del Cliente Final (Opcional)
                </ThemedText>
                <ThemedText style={{ fontSize: 10, color: themeColors.textSecondary }}>
                  Aparece al final del documento
                </ThemedText>
              </View>
              <TextInput
                style={[
                  styles.inputMultiline,
                  { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement },
                ]}
                multiline
                numberOfLines={3}
                placeholder="Razón Social, Contacto, RFC, Teléfono, Dirección de entrega o datos de registro..."
                placeholderTextColor={themeColors.textSecondary}
                value={orden.clienteFinal || ''}
                onChangeText={(t) => setOrden((prev) => ({ ...prev, clienteFinal: t }))}
              />
            </View>
          </View>
        </View>

        {/* Totales, Importe con Letra y Botones Finales */}
        <View style={styles.bottomSection}>
          <View style={[styles.totalsCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <View style={styles.totalsRow}>
              <ThemedText style={[styles.totalLabel, { color: themeColors.textSecondary }]}>Subtotal:</ThemedText>
              <ThemedText style={[styles.totalValue, { color: themeColors.text }]}>
                ${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </ThemedText>
            </View>
            <View style={styles.totalsRow}>
              <ThemedText style={[styles.totalLabel, { color: themeColors.textSecondary }]}>IVA (Calculado):</ThemedText>
              <ThemedText style={[styles.totalValue, { color: themeColors.text }]}>
                ${iva.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </ThemedText>
            </View>
            <View style={[styles.totalsRow, styles.totalFinalRow, { borderTopColor: themeColors.border }]}>
              <ThemedText style={[styles.totalFinalLabel, { color: themeColors.text }]}>Total ({orden.moneda}):</ThemedText>
              <ThemedText style={[styles.totalFinalValue, { color: themeColors.primary }]}>
                ${total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </ThemedText>
            </View>
            <View
              style={{
                marginTop: 8,
                padding: 8,
                borderRadius: 6,
                backgroundColor: themeColors.background,
                borderLeftWidth: 3,
                borderLeftColor: themeColors.primary,
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: '700', color: themeColors.textSecondary, marginBottom: 2 }}>
                IMPORTE CON LETRA
              </Text>
              <Text style={{ fontSize: 11, fontWeight: '600', color: themeColors.text }}>{importeConLetra}</Text>
            </View>
          </View>

          <View style={[styles.actionButtonsBottom, isMobile && { flexDirection: 'column' }]}>
            <TouchableOpacity
              style={[
                styles.bottomBtnSecondary,
                { borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement },
              ]}
              onPress={handlePrintPDF}
            >
              <Ionicons name="download-outline" size={20} color={themeColors.text} />
              <ThemedText style={{ color: themeColors.text, fontWeight: '600', marginLeft: 8 }}>Descargar PDF</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.bottomBtnPrimary, { backgroundColor: '#2196F3', opacity: isSaving ? 0.7 : 1 }]}
              onPress={handleGuardar}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={18} color="#ffffff" />
                  <ThemedText style={{ color: '#ffffff', fontWeight: 'bold', marginLeft: 8 }}>Guardar</ThemedText>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  },
  cardTitle: { fontSize: 18, fontWeight: '700', marginBottom: Spacing.three },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.small,
  },
  addBtnText: { fontSize: 13, fontWeight: '600', marginLeft: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -8 },
  gridMobile: { flexDirection: 'column' },
  column: { width: '50%', paddingHorizontal: 8, gap: Spacing.two },
  columnMobile: { width: '100%', marginBottom: Spacing.two },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.four },
  inputGroup: { marginTop: Spacing.one },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
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
  bottomSection: { margin: Spacing.two, alignItems: 'flex-end' },
  totalsCard: {
    width: '100%',
    maxWidth: 460,
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    marginBottom: Spacing.three,
  },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  totalLabel: { fontSize: 14 },
  totalValue: { fontSize: 14, fontWeight: '500' },
  totalFinalRow: { borderTopWidth: 1, paddingTop: 12, marginTop: 4 },
  totalFinalLabel: { fontSize: 18, fontWeight: '800' },
  totalFinalValue: { fontSize: 20, fontWeight: '800' },
  actionButtonsBottom: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two, width: '100%' },
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
  autocompleteItem: { padding: 12, borderBottomWidth: 1 },
  partidasTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1.5,
    marginBottom: 4,
  },
  partidasColHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284c7',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  partidasTableRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderRadius: 6,
    marginBottom: 4,
  },
  partidaNumBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cascadeInputContainer: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cascadeTextInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    paddingVertical: 0,
    height: '100%',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  tableFieldInput: { borderWidth: 1 },
  tableCurrencyContainer: { borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  tableActionIconBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
