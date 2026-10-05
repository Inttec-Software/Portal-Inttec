import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { REGIMENES_FISCALES, USOS_CFDI, FORMAS_PAGO, METODOS_PAGO } from '@/constants/satCatalog';
import { getApiHeaders, getApiUrl } from '@/services/apiHelper';
import { normalizeText } from '@/utils/helpers';

interface ConfirmarFacturaModalProps {
  visible: boolean;
  cotizacion: any | null;
  onClose: () => void;
  onConfirm: (facturaData: any) => void;
}

export default function ConfirmarFacturaModal({
  visible,
  cotizacion,
  onClose,
  onConfirm,
}: ConfirmarFacturaModalProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 768;

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Receptor state
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteRfc, setClienteRfc] = useState('XAXX010101000');
  const [clienteCp, setClienteCp] = useState('31110');
  const [clienteDireccion, setClienteDireccion] = useState('');
  const [clienteRegimen, setClienteRegimen] = useState('601');
  const [clienteUso, setClienteUso] = useState('G03');
  const [clienteId, setClienteId] = useState<string | null>(null);

  // Comprobante state
  const [formaPago, setFormaPago] = useState('03');
  const [metodoPago, setMetodoPago] = useState('PUE');
  const [moneda, setMoneda] = useState('MXN');
  const [ordenCompra, setOrdenCompra] = useState('');

  // Partidas
  const [partidas, setPartidas] = useState<any[]>([]);

  // Modals for selection
  const [showRegimenPicker, setShowRegimenPicker] = useState(false);
  const [searchRegimen, setSearchRegimen] = useState('');
  const [showUsoPicker, setShowUsoPicker] = useState(false);
  const [searchUso, setSearchUso] = useState('');
  const [showFormaPagoPicker, setShowFormaPagoPicker] = useState(false);

  // Load quote details and prefill data
  useEffect(() => {
    if (!visible || !cotizacion) return;

    let isMounted = true;
    const loadQuoteDetails = async () => {
      setIsLoading(true);
      setErrorMsg(null);

      try {
        let clientData: any = null;
        try {
          const headers = await getApiHeaders();
          const res = await fetch(`${getApiUrl()}/api/cotizaciones/${cotizacion.id}/pdf-data`, { headers });
          if (res.ok) {
            const data = await res.json();
            clientData = data.clientData;
          }
        } catch (_) {}

        if (!isMounted) return;

        const cNombre = clientData?.razon_social || clientData?.nombre || cotizacion.cliente_nombre || '';
        const cRfc = (clientData?.rfc || cotizacion.cliente_rfc || 'XAXX010101000').trim().toUpperCase();
        const cCp = (clientData?.codigo_postal || cotizacion.cliente_cp || '31110').trim();
        const cDireccion = clientData?.direccion || cotizacion.direccionFactura || '';
        const cRegimen = clientData?.regimen_fiscal || '601';
        const cId = clientData?.id || null;

        setClienteNombre(cNombre);
        setClienteRfc(cRfc);
        setClienteCp(cCp);
        setClienteDireccion(cDireccion);
        setClienteRegimen(cRegimen);
        setClienteUso('G03');
        setClienteId(cId);

        setFormaPago('03');
        setMetodoPago('PUE');
        setMoneda(cotizacion.moneda || 'MXN');
        setOrdenCompra(cotizacion.folio ? `Cotización ${cotizacion.folio}` : '');

        // Map line items
        const rawLines = cotizacion.lineas || [];
        const mappedItems = rawLines.map((l: any, idx: number) => {
          const pNombre = l.productoNombre || l.descripcion || 'Concepto';
          const pDesc = l.productoDescripcion || l.descripcion_detallada || '';
          const cant = typeof l.cantidad === 'number' ? l.cantidad : parseFloat(l.cantidad) || 1;
          const pu = typeof l.precioUnitario === 'number' ? l.precioUnitario : parseFloat(l.precio_unitario || l.precioUnitario) || 0;
          const uStr = (l.unidad || 'Pieza').trim();
          const isServ = uStr.toLowerCase().includes('serv') || uStr.toLowerCase().includes('obra');
          
          return {
            id: String(l.id || `line_${idx}_${Date.now()}`),
            descripcion: pNombre,
            descripcion_detallada: pDesc,
            cantidad: cant,
            precio_unitario: pu,
            clave_sat: l.claveFacturacion || l.clave_sat || '01010101',
            clave_unidad: l.clave_unidad || (isServ ? 'E48' : 'H87'),
            unidad: uStr,
            objeto_imp: l.impuestoPorcentaje === 0 ? '01' : '02',
            importe: cant * pu,
          };
        });

        setPartidas(mappedItems);
      } catch (err: any) {
        console.error('Error cargando detalles para confirmación de factura:', err);
        setErrorMsg('Error al cargar datos del cliente para la factura.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadQuoteDetails();

    return () => {
      isMounted = false;
    };
  }, [visible, cotizacion]);

  // Financial totals
  const totals = useMemo(() => {
    let subtotal = 0;
    let iva = 0;
    partidas.forEach(p => {
      const imp = (parseFloat(p.cantidad) || 0) * (parseFloat(p.precio_unitario) || 0);
      subtotal += imp;
      if (p.objeto_imp === '02') {
        iva += imp * 0.16;
      }
    });
    const total = subtotal + iva;
    return { subtotal, iva, total };
  }, [partidas]);

  const filteredRegimenes = useMemo(() => {
    if (!searchRegimen.trim()) return REGIMENES_FISCALES;
    const q = normalizeText(searchRegimen);
    return REGIMENES_FISCALES.filter(r =>
      normalizeText(r.code).includes(q) || normalizeText(r.label).includes(q)
    );
  }, [searchRegimen]);

  const filteredUsos = useMemo(() => {
    if (!searchUso.trim()) return USOS_CFDI;
    const q = normalizeText(searchUso);
    return USOS_CFDI.filter(u =>
      normalizeText(u.code).includes(q) || normalizeText(u.label).includes(q)
    );
  }, [searchUso]);

  const handleConfirm = () => {
    setErrorMsg(null);

    // Validation
    if (!clienteNombre.trim()) {
      setErrorMsg('Ingresa la Razón Social o Nombre del cliente.');
      return;
    }
    const cleanRfc = clienteRfc.trim().toUpperCase();
    if (!cleanRfc || cleanRfc.length < 12 || cleanRfc.length > 13) {
      setErrorMsg('El RFC del receptor debe tener 12 o 13 caracteres.');
      return;
    }
    const cleanCp = clienteCp.trim();
    if (!cleanCp || cleanCp.length !== 5) {
      setErrorMsg('El Código Postal fiscal debe contener exactamente 5 dígitos.');
      return;
    }
    if (partidas.length === 0) {
      setErrorMsg('La cotización no contiene partidas válidas para facturar.');
      return;
    }

    const payload = {
      fromCotizacion: true,
      cotizacionId: cotizacion?.id,
      cotizacionFolio: cotizacion?.folio,
      clienteId: clienteId || undefined,
      clienteNombre: clienteNombre.trim().toUpperCase(),
      clienteRfc: cleanRfc,
      clienteCp: cleanCp,
      clienteDireccion: clienteDireccion.trim(),
      clienteRegimen,
      clienteUso,
      formaPago,
      metodoPago,
      moneda,
      ordenCompra: ordenCompra.trim() || (cotizacion?.folio ? `Cotización ${cotizacion.folio}` : ''),
      partidas: partidas.map(p => ({
        id: p.id,
        descripcion: p.descripcion,
        descripcion_detallada: p.descripcion_detallada,
        cantidad: p.cantidad,
        precio_unitario: p.precio_unitario,
        clave_sat: p.clave_sat || '01010101',
        clave_unidad: p.clave_unidad || 'H87',
        unidad: p.unidad || 'Pieza',
        objeto_imp: p.objeto_imp || '02',
      })),
      subtotal: totals.subtotal,
      iva: totals.iva,
      total: totals.total,
    };

    onConfirm(payload);
  };

  const formatearMoneda = (val: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: moneda === 'USD' ? 'USD' : 'MXN',
    }).format(val || 0);
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: themeColors.backgroundElement,
              borderColor: themeColors.border,
              width: isDesktop ? 800 : '94%',
              maxHeight: '90%',
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View style={[styles.headerIconCircle, { backgroundColor: '#00C3F320' }]}>
                <Ionicons name="receipt-outline" size={22} color="#00C3F3" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                    Facturar Cotización
                  </Text>
                  {cotizacion?.folio && (
                    <View style={styles.folioBadge}>
                      <Text style={styles.folioBadgeText}>#{cotizacion.folio}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                  Verifica y confirma los datos fiscales para la emisión del CFDI 4.0
                </Text>
              </View>
            </View>

            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Body */}
          {isLoading ? (
            <View style={{ padding: 40, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator size="large" color={themeColors.primary} />
              <Text style={{ marginTop: 16, color: themeColors.textSecondary, fontSize: 13 }}>
                Cargando datos fiscales del cliente...
              </Text>
            </View>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 20 }}
              showsVerticalScrollIndicator={true}
            >
              {errorMsg && (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={18} color="#ef4444" />
                  <Text style={styles.errorBannerText}>{errorMsg}</Text>
                </View>
              )}

              {/* 1. SECCIÓN: DATOS FISCALES RECEPTOR */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="business-outline" size={16} color="#00C3F3" />
                  <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                    1. Datos Fiscales del Receptor (CFDI 4.0)
                  </Text>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
                    Nombre o Razón Social *
                  </Text>
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        backgroundColor: themeColors.background,
                        borderColor: themeColors.border,
                        color: themeColors.text,
                      },
                    ]}
                    value={clienteNombre}
                    onChangeText={setClienteNombre}
                    placeholder="Ej. EMPRESA SA DE CV"
                    placeholderTextColor={themeColors.textSecondary + '80'}
                  />
                </View>

                <View style={[styles.row, { gap: 12 }]}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
                      RFC del Receptor *
                    </Text>
                    <TextInput
                      style={[
                        styles.textInput,
                        {
                          backgroundColor: themeColors.background,
                          borderColor: themeColors.border,
                          color: themeColors.text,
                        },
                      ]}
                      value={clienteRfc}
                      onChangeText={(t) => setClienteRfc(t.toUpperCase())}
                      maxLength={13}
                      placeholder="RFC (12 o 13 car.)"
                      placeholderTextColor={themeColors.textSecondary + '80'}
                      autoCapitalize="characters"
                    />
                  </View>

                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
                      Código Postal Fiscal *
                    </Text>
                    <TextInput
                      style={[
                        styles.textInput,
                        {
                          backgroundColor: themeColors.background,
                          borderColor: themeColors.border,
                          color: themeColors.text,
                        },
                      ]}
                      value={clienteCp}
                      onChangeText={setClienteCp}
                      keyboardType="numeric"
                      maxLength={5}
                      placeholder="C.P. (5 dígitos)"
                      placeholderTextColor={themeColors.textSecondary + '80'}
                    />
                  </View>
                </View>

                <View style={[styles.row, { gap: 12 }]}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
                      Régimen Fiscal *
                    </Text>
                    <TouchableOpacity
                      onPress={() => setShowRegimenPicker(true)}
                      style={[
                        styles.dropdownSelector,
                        {
                          backgroundColor: themeColors.background,
                          borderColor: themeColors.border,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          color: themeColors.text,
                          flex: 1,
                        }}
                        numberOfLines={1}
                      >
                        {REGIMENES_FISCALES.find((r) => r.code === clienteRegimen)?.label ||
                          `${clienteRegimen} - Seleccionar Régimen`}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color={themeColors.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
                      Uso de CFDI *
                    </Text>
                    <TouchableOpacity
                      onPress={() => setShowUsoPicker(true)}
                      style={[
                        styles.dropdownSelector,
                        {
                          backgroundColor: themeColors.background,
                          borderColor: themeColors.border,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          color: themeColors.text,
                          flex: 1,
                        }}
                        numberOfLines={1}
                      >
                        {USOS_CFDI.find((u) => u.code === clienteUso)?.label ||
                          `${clienteUso} - Seleccionar Uso`}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color={themeColors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
                    Dirección Fiscal (Opcional)
                  </Text>
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        backgroundColor: themeColors.background,
                        borderColor: themeColors.border,
                        color: themeColors.text,
                      },
                    ]}
                    value={clienteDireccion}
                    onChangeText={setClienteDireccion}
                    placeholder="Calle, No. Ext, Colonia, Municipio"
                    placeholderTextColor={themeColors.textSecondary + '80'}
                  />
                </View>
              </View>

              {/* 2. SECCIÓN: CONFIGURACIÓN DE PAGO */}
              <View style={[styles.sectionCard, { marginTop: 14 }]}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="card-outline" size={16} color="#10b981" />
                  <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                    2. Condiciones de Pago & Comprobante
                  </Text>
                </View>

                <View style={[styles.row, { gap: 12 }]}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
                      Forma de Pago *
                    </Text>
                    <TouchableOpacity
                      onPress={() => setShowFormaPagoPicker(true)}
                      style={[
                        styles.dropdownSelector,
                        {
                          backgroundColor: themeColors.background,
                          borderColor: themeColors.border,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          color: themeColors.text,
                          flex: 1,
                        }}
                        numberOfLines={1}
                      >
                        {FORMAS_PAGO.find((f) => f.code === formaPago)?.label || formaPago}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color={themeColors.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
                      Método de Pago *
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
                      {METODOS_PAGO.map((mp) => {
                        const isSelected = metodoPago === mp.code;
                        return (
                          <TouchableOpacity
                            key={mp.code}
                            onPress={() => setMetodoPago(mp.code)}
                            style={[
                              styles.toggleBtn,
                              {
                                backgroundColor: isSelected
                                  ? '#00C3F320'
                                  : themeColors.background,
                                borderColor: isSelected
                                  ? '#00C3F3'
                                  : themeColors.border,
                                flex: 1,
                              },
                            ]}
                          >
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: isSelected ? '700' : '500',
                                color: isSelected ? '#00C3F3' : themeColors.textSecondary,
                                textAlign: 'center',
                              }}
                            >
                              {mp.code}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </View>

                <View style={[styles.row, { gap: 12 }]}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
                      Orden de Compra / Ref *
                    </Text>
                    <TextInput
                      style={[
                        styles.textInput,
                        {
                          backgroundColor: themeColors.background,
                          borderColor: themeColors.border,
                          color: themeColors.text,
                        },
                      ]}
                      value={ordenCompra}
                      onChangeText={setOrdenCompra}
                      placeholder="Ej. Cotización 26070701 / OC-4512"
                      placeholderTextColor={themeColors.textSecondary + '80'}
                    />
                  </View>

                  <View style={[styles.inputGroup, { width: 100 }]}>
                    <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
                      Moneda
                    </Text>
                    <TextInput
                      style={[
                        styles.textInput,
                        {
                          backgroundColor: themeColors.background,
                          borderColor: themeColors.border,
                          color: themeColors.text,
                          fontWeight: 'bold',
                        },
                      ]}
                      value={moneda}
                      onChangeText={setMoneda}
                      placeholder="MXN"
                      placeholderTextColor={themeColors.textSecondary + '80'}
                    />
                  </View>
                </View>
              </View>

              {/* 3. SECCIÓN: PARTIDAS */}
              <View style={[styles.sectionCard, { marginTop: 14 }]}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="cube-outline" size={16} color="#8b5cf6" />
                  <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                    3. Partidas a Facturar ({partidas.length})
                  </Text>
                </View>

                <View style={{ marginTop: 6 }}>
                  {partidas.map((item, idx) => (
                    <View
                      key={item.id || idx}
                      style={[
                        styles.partidaRow,
                        {
                          borderBottomColor: themeColors.border + '50',
                          borderBottomWidth: idx < partidas.length - 1 ? 1 : 0,
                        },
                      ]}
                    >
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={[styles.partidaNombre, { color: themeColors.text }]}>
                          {item.descripcion}
                        </Text>
                        {item.descripcion_detallada ? (
                          <Text
                            style={[
                              styles.partidaDetalle,
                              { color: themeColors.textSecondary },
                            ]}
                            numberOfLines={2}
                          >
                            {item.descripcion_detallada}
                          </Text>
                        ) : null}
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                          <Text style={[styles.partidaMeta, { color: themeColors.textSecondary }]}>
                            SAT: <Text style={{ fontWeight: 'bold' }}>{item.clave_sat}</Text>
                          </Text>
                          <Text style={[styles.partidaMeta, { color: themeColors.textSecondary }]}>
                            Unidad: <Text style={{ fontWeight: 'bold' }}>{item.clave_unidad} ({item.unidad})</Text>
                          </Text>
                        </View>
                      </View>

                      <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                        <Text style={[styles.partidaCant, { color: themeColors.textSecondary }]}>
                          {item.cantidad} x {formatearMoneda(item.precio_unitario)}
                        </Text>
                        <Text style={[styles.partidaImporte, { color: themeColors.text }]}>
                          {formatearMoneda(item.importe)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>

                {/* Resumen de totales */}
                <View
                  style={[
                    styles.totalesBox,
                    {
                      backgroundColor: themeColors.background,
                      borderColor: themeColors.border,
                    },
                  ]}
                >
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, { color: themeColors.textSecondary }]}>
                      Subtotal:
                    </Text>
                    <Text style={[styles.totalVal, { color: themeColors.text }]}>
                      {formatearMoneda(totals.subtotal)}
                    </Text>
                  </View>
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, { color: themeColors.textSecondary }]}>
                      IVA Trasladado (16%):
                    </Text>
                    <Text style={[styles.totalVal, { color: themeColors.text }]}>
                      {formatearMoneda(totals.iva)}
                    </Text>
                  </View>
                  <View style={[styles.totalRow, { marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: themeColors.border }]}>
                    <Text style={[styles.totalLabel, { color: themeColors.text, fontWeight: 'bold', fontSize: 14 }]}>
                      Total Factura:
                    </Text>
                    <Text style={[styles.totalVal, { color: '#00C3F3', fontWeight: '800', fontSize: 16 }]}>
                      {formatearMoneda(totals.total)}
                    </Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          )}

          {/* Footer */}
          <View style={[styles.modalFooter, { borderTopColor: themeColors.border }]}>
            <TouchableOpacity
              onPress={onClose}
              style={[
                styles.cancelBtn,
                {
                  borderColor: themeColors.border,
                  backgroundColor: themeColors.background,
                },
              ]}
            >
              <Text style={[styles.cancelBtnText, { color: themeColors.textSecondary }]}>
                Cancelar
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleConfirm}
              style={styles.confirmBtn}
              disabled={isLoading}
            >
              <Ionicons name="arrow-forward-circle" size={18} color="#fff" />
              <Text style={styles.confirmBtnText}>
                Confirmar y Cargar en Facturación
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* MODAL PICKER: RÉGIMEN FISCAL */}
        <Modal
          visible={showRegimenPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowRegimenPicker(false)}
        >
          <View style={styles.innerModalOverlay}>
            <View
              style={[
                styles.pickerModalBox,
                {
                  backgroundColor: themeColors.backgroundElement,
                  borderColor: themeColors.border,
                },
              ]}
            >
              <View style={[styles.pickerHeader, { borderBottomColor: themeColors.border }]}>
                <Text style={[styles.pickerTitle, { color: themeColors.text }]}>
                  Seleccionar Régimen Fiscal
                </Text>
                <TouchableOpacity onPress={() => setShowRegimenPicker(false)}>
                  <Ionicons name="close" size={20} color={themeColors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={{ padding: 12 }}>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: themeColors.background,
                      borderColor: themeColors.border,
                      color: themeColors.text,
                    },
                  ]}
                  value={searchRegimen}
                  onChangeText={setSearchRegimen}
                  placeholder="Buscar régimen..."
                  placeholderTextColor={themeColors.textSecondary + '80'}
                  autoFocus
                />
              </View>

              <ScrollView style={{ maxHeight: 300, paddingHorizontal: 12, paddingBottom: 12 }}>
                {filteredRegimenes.map((reg) => (
                  <TouchableOpacity
                    key={reg.code}
                    onPress={() => {
                      setClienteRegimen(reg.code);
                      setShowRegimenPicker(false);
                      setSearchRegimen('');
                    }}
                    style={[
                      styles.pickerItem,
                      {
                        backgroundColor:
                          clienteRegimen === reg.code
                            ? '#00C3F320'
                            : 'transparent',
                        borderColor:
                          clienteRegimen === reg.code ? '#00C3F3' : themeColors.border + '30',
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color:
                          clienteRegimen === reg.code ? '#00C3F3' : themeColors.text,
                        fontWeight: clienteRegimen === reg.code ? '700' : '400',
                      }}
                    >
                      {reg.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* MODAL PICKER: USO DE CFDI */}
        <Modal
          visible={showUsoPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowUsoPicker(false)}
        >
          <View style={styles.innerModalOverlay}>
            <View
              style={[
                styles.pickerModalBox,
                {
                  backgroundColor: themeColors.backgroundElement,
                  borderColor: themeColors.border,
                },
              ]}
            >
              <View style={[styles.pickerHeader, { borderBottomColor: themeColors.border }]}>
                <Text style={[styles.pickerTitle, { color: themeColors.text }]}>
                  Seleccionar Uso de CFDI
                </Text>
                <TouchableOpacity onPress={() => setShowUsoPicker(false)}>
                  <Ionicons name="close" size={20} color={themeColors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={{ padding: 12 }}>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: themeColors.background,
                      borderColor: themeColors.border,
                      color: themeColors.text,
                    },
                  ]}
                  value={searchUso}
                  onChangeText={setSearchUso}
                  placeholder="Buscar uso CFDI..."
                  placeholderTextColor={themeColors.textSecondary + '80'}
                  autoFocus
                />
              </View>

              <ScrollView style={{ maxHeight: 300, paddingHorizontal: 12, paddingBottom: 12 }}>
                {filteredUsos.map((u) => (
                  <TouchableOpacity
                    key={u.code}
                    onPress={() => {
                      setClienteUso(u.code);
                      setShowUsoPicker(false);
                      setSearchUso('');
                    }}
                    style={[
                      styles.pickerItem,
                      {
                        backgroundColor:
                          clienteUso === u.code
                            ? '#00C3F320'
                            : 'transparent',
                        borderColor:
                          clienteUso === u.code ? '#00C3F3' : themeColors.border + '30',
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color:
                          clienteUso === u.code ? '#00C3F3' : themeColors.text,
                        fontWeight: clienteUso === u.code ? '700' : '400',
                      }}
                    >
                      {u.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* MODAL PICKER: FORMA DE PAGO */}
        <Modal
          visible={showFormaPagoPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowFormaPagoPicker(false)}
        >
          <View style={styles.innerModalOverlay}>
            <View
              style={[
                styles.pickerModalBox,
                {
                  backgroundColor: themeColors.backgroundElement,
                  borderColor: themeColors.border,
                },
              ]}
            >
              <View style={[styles.pickerHeader, { borderBottomColor: themeColors.border }]}>
                <Text style={[styles.pickerTitle, { color: themeColors.text }]}>
                  Seleccionar Forma de Pago
                </Text>
                <TouchableOpacity onPress={() => setShowFormaPagoPicker(false)}>
                  <Ionicons name="close" size={20} color={themeColors.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 300, padding: 12 }}>
                {FORMAS_PAGO.map((fp) => (
                  <TouchableOpacity
                    key={fp.code}
                    onPress={() => {
                      setFormaPago(fp.code);
                      setShowFormaPagoPicker(false);
                    }}
                    style={[
                      styles.pickerItem,
                      {
                        backgroundColor:
                          formaPago === fp.code
                            ? '#00C3F320'
                            : 'transparent',
                        borderColor:
                          formaPago === fp.code ? '#00C3F3' : themeColors.border + '30',
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color:
                          formaPago === fp.code ? '#00C3F3' : themeColors.text,
                        fontWeight: formaPago === fp.code ? '700' : '400',
                      }}
                    >
                      {fp.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 25,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  folioBadge: {
    backgroundColor: '#00C3F320',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#00C3F340',
  },
  folioBadgeText: {
    color: '#00C3F3',
    fontSize: 12,
    fontWeight: '800',
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeButton: {
    padding: 6,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ef444420',
    borderWidth: 1,
    borderColor: '#ef4444',
    padding: 10,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorBannerText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  sectionCard: {
    borderRadius: BorderRadius.medium,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
  },
  inputGroup: {
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
  },
  dropdownSelector: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partidaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  partidaNombre: {
    fontSize: 13,
    fontWeight: '600',
  },
  partidaDetalle: {
    fontSize: 11,
    marginTop: 2,
  },
  partidaMeta: {
    fontSize: 11,
  },
  partidaCant: {
    fontSize: 11,
  },
  partidaImporte: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  totalesBox: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    marginTop: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  totalLabel: {
    fontSize: 12,
  },
  totalVal: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  cancelBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#00C3F3',
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  confirmBtnText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '700',
  },
  innerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerModalBox: {
    width: '100%',
    maxWidth: 500,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
  },
  pickerTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  pickerItem: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 6,
  },
});
