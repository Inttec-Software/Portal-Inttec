import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  useWindowDimensions,
  TextInput,
  Modal,
  Pressable,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/services/supabase';
import { getApiHeaders, getApiUrl } from '@/services/apiHelper';
import SatCatalogAutocomplete from '@/components/SatCatalogAutocomplete';
import CustomInput from '@/components/CustomInput';
import CustomButton from '@/components/CustomButton';
import { parseCFDIXML } from '@/utils/cfdiParser';
import { exportarFacturaOdooPDF } from '@/utils/reportGenerator';
import DateTimePicker from '@react-native-community/datetimepicker';

interface ClienteCatalogo {
  id: string;
  nombre: string;
  razon_social?: string;
  rfc?: string;
  codigo_postal?: string;
  regimen_fiscal?: string;
  uso_cfdi?: string;
}

interface FacturaPartida {
  id: string;
  descripcion: string;
  cantidad: string;
  precio_unitario: string;
  clave_sat: string;
  clave_unidad: string;
  unidad: string;
  objeto_imp: string;
}

interface FacturaEmitida {
  id: string;
  cliente: string;
  fecha: string;
  factura_referencia?: string;
  folio?: string;
  cfdi_uuid?: string;
  cfdi_estado?: 'TIMBRADA' | 'CANCELADA' | 'PENDIENTE';
  cfdi_xml_url?: string;
  precio_total_facturado: number;
  created_at?: string;
}

const REGIMENES_FISCALES = [
  { code: '601', label: '601 - General de Ley Personas Morales' },
  { code: '612', label: '612 - Personas Físicas con Actividades Empresariales y Profesionales' },
  { code: '626', label: '626 - Régimen Simplificado de Confianza (RESICO)' },
  { code: '616', label: '616 - Sin obligaciones fiscales' },
  { code: '603', label: '603 - Personas Morales con Fines no Lucrativos' },
  { code: '605', label: '605 - Sueldos y Salarios e Ingresos Asimilados a Salarios' },
  { code: '621', label: '621 - Incorporación Fiscal' },
  { code: '625', label: '625 - Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas' },
];

const USOS_CFDI = [
  { code: 'G03', label: 'G03 - Gastos en general' },
  { code: 'G01', label: 'G01 - Adquisición de mercancías' },
  { code: 'S01', label: 'S01 - Sin efectos fiscales' },
  { code: 'CP01', label: 'CP01 - Pagos' },
  { code: 'I01', label: 'I01 - Construcciones' },
  { code: 'I02', label: 'I02 - Mobilario y equipo de oficina' },
  { code: 'I03', label: 'I03 - Equipo de transporte' },
  { code: 'I04', label: 'I04 - Equipo de computo y accesorios' },
  { code: 'D01', label: 'D01 - Honorarios médicos, dentales y gastos hospitalarios' },
];

const FORMAS_PAGO = [
  { code: '03', label: '03 - Transferencia electrónica de fondos' },
  { code: '01', label: '01 - Efectivo' },
  { code: '04', label: '04 - Tarjeta de crédito' },
  { code: '28', label: '28 - Tarjeta de débito' },
  { code: '02', label: '02 - Cheque nominativo' },
  { code: '99', label: '99 - Por definir' },
];

export default function FacturacionScreen() {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [activeTab, setActiveTab] = useState<'emitir' | 'historial'>('emitir');

  // Catálogo de Clientes
  const [clientes, setClientes] = useState<ClienteCatalogo[]>([]);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');

  // 1. Datos del Receptor
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteRfc, setClienteRfc] = useState('XAXX010101000');
  const [clienteCp, setClienteCp] = useState('31110');
  const [clienteRegimen, setClienteRegimen] = useState('601');
  const [clienteUso, setClienteUso] = useState('G03');

  // 2. Configuración del Comprobante
  const [formaPago, setFormaPago] = useState('03');
  const [metodoPago, setMetodoPago] = useState('PUE');
  const [serie, setSerie] = useState('F');
  const [folio, setFolio] = useState('');
  const [moneda, setMoneda] = useState('MXN');

  // 3. Partidas
  const [partidas, setPartidas] = useState<FacturaPartida[]>([
    {
      id: '1',
      descripcion: 'Servicio de telemetría y rastreo satelital',
      cantidad: '1',
      precio_unitario: '1000',
      clave_sat: '81111811',
      clave_unidad: 'E48',
      unidad: 'Servicio',
      objeto_imp: '02',
    },
  ]);

  // Historial de Facturas Emitidas
  const [historialFacturas, setHistorialFacturas] = useState<FacturaEmitida[]>([]);
  const [isLoadingHistorial, setIsLoadingHistorial] = useState(false);
  const [historialSearch, setHistorialSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'TODAS' | 'TIMBRADA' | 'CANCELADA'>('TODAS');

  // Estados de proceso
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchClientes();
    fetchHistorialFacturas();
    // Folio por defecto
    setFolio(String(Date.now()).slice(-5));
  }, []);

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const fetchClientes = async () => {
    try {
      // 1. Intentar API backend
      try {
        const headers = await getApiHeaders();
        const res = await fetch(`${getApiUrl()}/api/catalogos/clientes`, { headers });
        if (res.ok) {
          const json = await res.json();
          const items = json.data || json || [];
          if (Array.isArray(items) && items.length > 0) {
            setClientes(items);
            return;
          }
        }
      } catch (_) {}

      // 2. Fallback directo a Supabase
      const { data } = await supabase
        .from('clientes')
        .select('id, nombre, razon_social, rfc, codigo_postal, regimen_fiscal, uso_cfdi')
        .order('nombre');

      if (data) {
        setClientes(data);
      }
    } catch (err) {
      console.warn('Error fetching clientes:', err);
    }
  };

  const fetchHistorialFacturas = async () => {
    try {
      setIsLoadingHistorial(true);
      // 1. Intentar API backend (/api/ventas/historial)
      try {
        const headers = await getApiHeaders();
        const res = await fetch(`${getApiUrl()}/api/ventas/historial`, { headers });
        if (res.ok) {
          const json = await res.json();
          const ventasList: FacturaEmitida[] = json.ventas || json.data || [];
          if (Array.isArray(ventasList) && ventasList.length > 0) {
            const facturadas = ventasList.filter(v => v.cfdi_uuid || v.cfdi_estado === 'TIMBRADA' || v.cfdi_estado === 'CANCELADA');
            setHistorialFacturas(facturadas);
            return;
          }
        }
      } catch (_) {}

      // 2. Fallback directo a Supabase
      const { data } = await supabase
        .from('ventas')
        .select('id, cliente, fecha, factura_referencia, folio, cfdi_uuid, cfdi_estado, cfdi_xml_url, precio_total_facturado, created_at')
        .order('created_at', { ascending: false });

      if (data) {
        const facturadas = (data as FacturaEmitida[]).filter(v => v.cfdi_uuid || v.cfdi_estado === 'TIMBRADA' || v.cfdi_estado === 'CANCELADA');
        setHistorialFacturas(facturadas);
      }
    } catch (err) {
      console.error('Error fetching facturas emitidas:', err);
    } finally {
      setIsLoadingHistorial(false);
    }
  };

  // Cálculos en tiempo real
  const financialTotals = useMemo(() => {
    let subtotal = 0;
    let totalIva = 0;

    partidas.forEach(p => {
      const cant = parseFloat(p.cantidad) || 0;
      const pu = parseFloat(p.precio_unitario) || 0;
      const imp = cant * pu;
      subtotal += imp;
      if (p.objeto_imp === '02') {
        totalIva += imp * 0.16;
      }
    });

    const total = subtotal + totalIva;
    return { subtotal, totalIva, total };
  }, [partidas]);

  const handleSelectClient = (c: ClienteCatalogo) => {
    setClienteNombre(c.razon_social || c.nombre || '');
    if (c.rfc) setClienteRfc(c.rfc.trim().toUpperCase());
    if (c.codigo_postal) setClienteCp(c.codigo_postal);
    if (c.regimen_fiscal) setClienteRegimen(c.regimen_fiscal);
    if (c.uso_cfdi) setClienteUso(c.uso_cfdi);
    setIsClientModalOpen(false);
  };

  const handleAddPartida = () => {
    setPartidas(prev => [
      ...prev,
      {
        id: String(Date.now()),
        descripcion: '',
        cantidad: '1',
        precio_unitario: '0',
        clave_sat: '01010101',
        clave_unidad: 'H87',
        unidad: 'Pieza',
        objeto_imp: '02',
      },
    ]);
  };

  const handleDuplicatePartida = (index: number) => {
    const item = partidas[index];
    if (!item) return;
    const duplicated: FacturaPartida = {
      ...item,
      id: String(Date.now()),
    };
    setPartidas(prev => [...prev.slice(0, index + 1), duplicated, ...prev.slice(index + 1)]);
  };

  const handleRemovePartida = (index: number) => {
    if (partidas.length <= 1) {
      showAlert('Aviso', 'Debes incluir al menos una partida en la factura.');
      return;
    }
    setPartidas(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdatePartida = (index: number, field: keyof FacturaPartida, val: string) => {
    setPartidas(prev => {
      const next = [...prev];
      const current = { ...next[index], [field]: val };
      next[index] = current;
      return next;
    });
  };

  const handleResetForm = () => {
    setClienteNombre('');
    setClienteRfc('XAXX010101000');
    setClienteCp('31110');
    setClienteRegimen('601');
    setClienteUso('G03');
    setFormaPago('03');
    setMetodoPago('PUE');
    setSerie('F');
    setFolio(String(Date.now()).slice(-5));
    setPartidas([
      {
        id: '1',
        descripcion: '',
        cantidad: '1',
        precio_unitario: '0',
        clave_sat: '01010101',
        clave_unidad: 'H87',
        unidad: 'Pieza',
        objeto_imp: '02',
      },
    ]);
  };

  // Emisión y Timbrado Oficial CFDI 4.0
  const handleTimbrarFactura = async () => {
    if (!clienteNombre.trim()) {
      showAlert('Validación', 'Ingresa la Razón Social o Nombre del cliente.');
      return;
    }
    if (!clienteRfc.trim() || clienteRfc.trim().length < 12) {
      showAlert('Validación', 'Ingresa un RFC de receptor válido (12 o 13 caracteres).');
      return;
    }
    if (!clienteCp.trim() || clienteCp.trim().length !== 5) {
      showAlert('Validación', 'Ingresa un Código Postal fiscal válido de 5 dígitos.');
      return;
    }
    if (partidas.length === 0) {
      showAlert('Validación', 'Agrega al menos una partida a la factura.');
      return;
    }

    const invalidPartida = partidas.find(p => !p.descripcion.trim() || (parseFloat(p.cantidad) || 0) <= 0);
    if (invalidPartida) {
      showAlert('Validación', 'Verifica que todas las partidas tengan descripción y cantidad mayor a 0.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        cliente_override: {
          nombre: clienteNombre.trim().toUpperCase(),
          razon_social: clienteNombre.trim().toUpperCase(),
          rfc: clienteRfc.trim().toUpperCase(),
          codigo_postal: clienteCp.trim(),
          regimen_fiscal: clienteRegimen,
          uso_cfdi: clienteUso,
        },
        cfdi_config: {
          forma_pago: formaPago,
          metodo_pago_cfdi: metodoPago,
          serie: serie.trim().toUpperCase(),
          folio: folio.trim(),
        },
        custom_partidas: partidas.map(p => ({
          descripcion: p.descripcion.trim(),
          cantidad: parseFloat(p.cantidad) || 1,
          precio_unitario_venta: parseFloat(p.precio_unitario) || 0,
          clave_sat: p.clave_sat.trim() || '01010101',
          clave_unidad: p.clave_unidad.trim() || 'H87',
          unidad: p.unidad || 'Pieza',
        })),
      };

      const { data, error } = await supabase.functions.invoke('facturar-venta', {
        body: payload,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      showAlert('Éxito', `Factura timbrada exitosamente (CFDI 4.0).\n\nFolio Fiscal (UUID):\n${data.cfdi_uuid}`);
      fetchHistorialFacturas();
      setActiveTab('historial');
      handleResetForm();
    } catch (err: any) {
      console.error('Error al timbrar factura:', err);
      let errorMsg = err.message || 'Error desconocido al timbrar la factura.';
      if (err.context) {
        try {
          if (typeof err.context.json === 'function') {
            const body = await err.context.json();
            if (body?.error) errorMsg = body.error;
          }
        } catch (_) {}
      }
      showAlert('Error al Timbrar', errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Generar Vista Previa en PDF
  const handleVistaPreviaPDF = async () => {
    try {
      setIsSubmitting(true);
      const uuidSimulado = `BORRADOR-${Date.now()}`;
      const fakeVenta = {
        id: 0,
        folio: `${serie}${folio || '1'}`,
        cliente: clienteNombre || 'PUBLICO EN GENERAL',
        fecha: new Date().toISOString(),
        precio_total_facturado: financialTotals.total,
      };

      const fakeFacturaData = {
        uuid: uuidSimulado,
        folio_number: folio || '1',
        series: serie,
        created_at: new Date().toISOString(),
        payment_form: formaPago,
        payment_method: metodoPago,
        use: clienteUso,
        issuer: {
          tax_id: 'FETR83041461A',
          legal_name: 'RAFAEL ALONSO FERNANDEZ TINAJERO',
          tax_system: '612',
          zip: '31110',
        },
        customer: {
          tax_id: clienteRfc,
          legal_name: clienteNombre || 'PUBLICO EN GENERAL',
          tax_system: clienteRegimen,
          address: { zip: clienteCp },
        },
        items: partidas.map(p => ({
          quantity: parseFloat(p.cantidad) || 1,
          product: {
            product_key: p.clave_sat,
            unit_key: p.clave_unidad,
            description: p.descripcion || 'Concepto a facturar',
            price: parseFloat(p.precio_unitario) || 0,
          },
        })),
        stamp: {
          uuid: uuidSimulado,
          date: new Date().toISOString(),
          sat_cert_number: '30001000000500003416',
          signature: 'VISTA_PREVIA_BORRADOR_SELLO_CFD',
          sat_signature: 'VISTA_PREVIA_BORRADOR_SELLO_SAT',
          pac_rfc: 'FIN1203015JA',
          original_chain: `||1.1|${uuidSimulado}|${new Date().toISOString()}|FIN1203015JA||`,
        },
      };

      await exportarFacturaOdooPDF(fakeVenta, fakeFacturaData, 'download');
    } catch (err: any) {
      console.error('Error generando vista previa PDF:', err);
      showAlert('Error en Vista Previa', err.message || 'No se pudo generar la vista previa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper para leer XML de facturas emitidas
  const retrieveXml = async (factura: FacturaEmitida): Promise<string> => {
    if (factura.cfdi_xml_url && factura.cfdi_xml_url.startsWith('data:application/xml;base64,')) {
      try {
        const b64 = factura.cfdi_xml_url.replace('data:application/xml;base64,', '');
        return decodeURIComponent(escape(atob(b64)));
      } catch (_) {}
    }
    if (factura.cfdi_xml_url && factura.cfdi_xml_url.startsWith('http')) {
      try {
        const resp = await fetch(factura.cfdi_xml_url);
        if (resp.ok) return await resp.text();
      } catch (_) {}
    }
    if (factura.cfdi_uuid) {
      try {
        const { data } = await supabase.storage.from('facturas').download(`${factura.cfdi_uuid}.xml`);
        if (data) return await data.text();
      } catch (_) {}
    }
    return '';
  };

  const handleDescargarXML = async (factura: FacturaEmitida) => {
    try {
      const xmlText = await retrieveXml(factura);
      if (!xmlText) {
        showAlert('Aviso', 'No se encontró el archivo XML timbrado.');
        return;
      }

      const fileName = `Factura_${(factura.cliente || 'Cliente').replace(/\s+/g, '_')}_${factura.folio || factura.cfdi_uuid?.slice(-6)}.xml`;

      if (Platform.OS === 'web') {
        const blob = new Blob([xmlText], { type: 'application/xml;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const { cacheDirectory, writeAsStringAsync } = await import('expo-file-system/legacy');
        const { shareAsync, isAvailableAsync } = await import('expo-sharing');
        const fileUri = `${cacheDirectory}${fileName}`;
        await writeAsStringAsync(fileUri, xmlText, { encoding: 'utf8' as any });
        if (await isAvailableAsync()) {
          await shareAsync(fileUri, { mimeType: 'application/xml' });
        }
      }
    } catch (err: any) {
      showAlert('Error al Descargar', err.message);
    }
  };

  const handleVerPDF = async (factura: FacturaEmitida) => {
    try {
      const xmlText = await retrieveXml(factura);
      if (!xmlText) {
        showAlert('Aviso', 'No se encontró el XML timbrado para construir el PDF.');
        return;
      }
      const isCanceled = factura.cfdi_estado === 'CANCELADA';
      const parsed = parseCFDIXML(xmlText, isCanceled ? 'canceled' : 'valid');
      await exportarFacturaOdooPDF(factura, parsed, 'download');
    } catch (err: any) {
      showAlert('Error en PDF', err.message);
    }
  };

  const handleCancelarFacturaSAT = async (factura: FacturaEmitida) => {
    const doCancel = async () => {
      try {
        setIsSubmitting(true);
        const { data, error } = await supabase.functions.invoke('cancelar-factura', {
          body: { venta_id: factura.id, motivo: '02' },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        showAlert('Éxito', 'La factura ha sido cancelada correctamente ante el SAT.');
        fetchHistorialFacturas();
      } catch (err: any) {
        showAlert('Error al Cancelar', err.message);
      } finally {
        setIsSubmitting(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`¿Estás seguro de que deseas cancelar ante el SAT la factura de ${factura.cliente}?`)) {
        await doCancel();
      }
    } else {
      Alert.alert('Cancelar Factura', `¿Deseas cancelar la factura de ${factura.cliente} ante el SAT?`, [
        { text: 'No', style: 'cancel' },
        { text: 'Sí, Cancelar', style: 'destructive', onPress: doCancel },
      ]);
    }
  };

  // Filtrado de historial
  const facturasFiltradas = useMemo(() => {
    return historialFacturas.filter(f => {
      if (filtroEstado !== 'TODAS' && f.cfdi_estado !== filtroEstado) return false;
      if (historialSearch.trim()) {
        const q = historialSearch.toLowerCase();
        const cl = (f.cliente || '').toLowerCase();
        const fo = (f.folio || '').toLowerCase();
        const uu = (f.cfdi_uuid || '').toLowerCase();
        return cl.includes(q) || fo.includes(q) || uu.includes(q);
      }
      return true;
    });
  }, [historialFacturas, filtroEstado, historialSearch]);

  const clientesFiltrados = useMemo(() => {
    if (!clientSearch.trim()) return clientes;
    const q = clientSearch.toLowerCase();
    return clientes.filter(c =>
      (c.nombre || '').toLowerCase().includes(q) ||
      (c.razon_social || '').toLowerCase().includes(q) ||
      (c.rfc || '').toLowerCase().includes(q)
    );
  }, [clientes, clientSearch]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: themeColors.background }} edges={['bottom', 'left', 'right']}>
      {/* Header y Selector de Pestañas */}
      <View style={[styles.headerContainer, { borderBottomColor: themeColors.border, backgroundColor: themeColors.backgroundElement }]}>
        <View style={styles.titleRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={[styles.headerIconCircle, { backgroundColor: '#0284c7' + '20' }]}>
              <Ionicons name="receipt" size={24} color="#0284c7" />
            </View>
            <View>
              <Text style={[styles.screenTitle, { color: themeColors.text }]}>Módulo de Facturación CFDI 4.0</Text>
              <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>Emisión, timbrado oficial ante el SAT y gestión de comprobantes</Text>
            </View>
          </View>
        </View>

        {/* Pestañas */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            onPress={() => setActiveTab('emitir')}
            style={[
              styles.tabBtn,
              activeTab === 'emitir' && {
                borderBottomColor: '#0284c7',
                borderBottomWidth: 2.5,
              },
            ]}
          >
            <Ionicons
              name="add-circle-outline"
              size={18}
              color={activeTab === 'emitir' ? '#0284c7' : themeColors.textSecondary}
            />
            <Text
              style={[
                styles.tabBtnText,
                { color: activeTab === 'emitir' ? '#0284c7' : themeColors.textSecondary, fontWeight: activeTab === 'emitir' ? 'bold' : '500' },
              ]}
            >
              Emitir Factura (CFDI 4.0)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTab('historial')}
            style={[
              styles.tabBtn,
              activeTab === 'historial' && {
                borderBottomColor: '#0284c7',
                borderBottomWidth: 2.5,
              },
            ]}
          >
            <Ionicons
              name="list-outline"
              size={18}
              color={activeTab === 'historial' ? '#0284c7' : themeColors.textSecondary}
            />
            <Text
              style={[
                styles.tabBtnText,
                { color: activeTab === 'historial' ? '#0284c7' : themeColors.textSecondary, fontWeight: activeTab === 'historial' ? 'bold' : '500' },
              ]}
            >
              Facturas Emitidas ({historialFacturas.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Contenido Principal */}
      {activeTab === 'emitir' ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.three, gap: Spacing.three, maxWidth: 1100, alignSelf: 'center', width: '100%' }}>
          
          {/* SECCIÓN 1: DATOS FISCALES DEL RECEPTOR */}
          <View style={[styles.card, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <View style={styles.cardHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="person" size={18} color="#0284c7" />
                <Text style={[styles.cardTitle, { color: themeColors.text }]}>1. Datos Fiscales del Receptor (Cliente)</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setClientSearch('');
                  setIsClientModalOpen(true);
                }}
                style={[styles.quickSelectBtn, { borderColor: '#0284c7', backgroundColor: '#0284c7' + '15' }]}
              >
                <Ionicons name="search" size={14} color="#0284c7" />
                <Text style={{ color: '#0284c7', fontSize: 12, fontWeight: '700' }}>Cargar del Catálogo</Text>
              </TouchableOpacity>
            </View>

            <CustomInput
              label="Razón Social / Nombre Oficial *"
              value={clienteNombre}
              onChangeText={setClienteNombre}
              placeholder="Ej. RAUL HERNANDEZ PEREZ o TECNOLOGIAS INTTEC"
            />

            <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 12 }}>
              <View style={{ flex: 1.2 }}>
                <CustomInput
                  label="RFC Receptor *"
                  value={clienteRfc}
                  onChangeText={txt => setClienteRfc(txt.toUpperCase())}
                  placeholder="XAXX010101000"
                  autoCapitalize="characters"
                />
              </View>
              <View style={{ flex: 0.8 }}>
                <CustomInput
                  label="Código Postal (Domicilio) *"
                  value={clienteCp}
                  onChangeText={setClienteCp}
                  placeholder="31110"
                  keyboardType="numeric"
                />
              </View>
            </View>

            {/* Régimen Fiscal Selector */}
            <View style={{ marginTop: 4 }}>
              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Régimen Fiscal del Receptor *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {REGIMENES_FISCALES.map(reg => (
                    <TouchableOpacity
                      key={reg.code}
                      onPress={() => setClienteRegimen(reg.code)}
                      style={[
                        styles.chipBtn,
                        {
                          borderColor: clienteRegimen === reg.code ? '#0284c7' : themeColors.border,
                          backgroundColor: clienteRegimen === reg.code ? '#0284c7' + '20' : themeColors.background,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: clienteRegimen === reg.code ? '800' : '500',
                          color: clienteRegimen === reg.code ? '#0284c7' : themeColors.textSecondary,
                        }}
                      >
                        {reg.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Uso CFDI Selector */}
            <View style={{ marginTop: 8 }}>
              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Uso de CFDI *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {USOS_CFDI.map(uso => (
                    <TouchableOpacity
                      key={uso.code}
                      onPress={() => setClienteUso(uso.code)}
                      style={[
                        styles.chipBtn,
                        {
                          borderColor: clienteUso === uso.code ? '#0284c7' : themeColors.border,
                          backgroundColor: clienteUso === uso.code ? '#0284c7' + '20' : themeColors.background,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: clienteUso === uso.code ? '800' : '500',
                          color: clienteUso === uso.code ? '#0284c7' : themeColors.textSecondary,
                        }}
                      >
                        {uso.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>

          {/* SECCIÓN 2: CONFIGURACIÓN DEL COMPROBANTE */}
          <View style={[styles.card, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="options" size={18} color="#0284c7" />
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>2. Configuración del Comprobante Fiscal</Text>
            </View>

            {/* Forma de Pago */}
            <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Forma de Pago *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6, marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {FORMAS_PAGO.map(fp => (
                  <TouchableOpacity
                    key={fp.code}
                    onPress={() => setFormaPago(fp.code)}
                    style={[
                      styles.chipBtn,
                      {
                        borderColor: formaPago === fp.code ? '#0284c7' : themeColors.border,
                        backgroundColor: formaPago === fp.code ? '#0284c7' + '20' : themeColors.background,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: formaPago === fp.code ? '800' : '500',
                        color: formaPago === fp.code ? '#0284c7' : themeColors.textSecondary,
                      }}
                    >
                      {fp.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 12 }}>
              {/* Método de Pago */}
              <View style={{ flex: 1.5 }}>
                <Text style={[styles.fieldLabel, { color: themeColors.textSecondary, marginBottom: 6 }]}>Método de Pago</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[
                    { code: 'PUE', label: 'PUE (Contado)' },
                    { code: 'PPD', label: 'PPD (Crédito / Diferido)' },
                  ].map(mp => (
                    <TouchableOpacity
                      key={mp.code}
                      onPress={() => setMetodoPago(mp.code)}
                      style={[
                        styles.chipBtn,
                        {
                          flex: 1,
                          alignItems: 'center',
                          paddingVertical: 10,
                          borderColor: metodoPago === mp.code ? '#0284c7' : themeColors.border,
                          backgroundColor: metodoPago === mp.code ? '#0284c7' + '20' : themeColors.background,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: metodoPago === mp.code ? '800' : '500',
                          color: metodoPago === mp.code ? '#0284c7' : themeColors.textSecondary,
                        }}
                      >
                        {mp.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={{ flex: 0.8 }}>
                <CustomInput label="Serie" value={serie} onChangeText={setSerie} placeholder="F" autoCapitalize="characters" />
              </View>
              <View style={{ flex: 0.8 }}>
                <CustomInput label="Folio" value={folio} onChangeText={setFolio} placeholder="101" keyboardType="numeric" />
              </View>
              <View style={{ flex: 0.8 }}>
                <CustomInput label="Moneda" value={moneda} onChangeText={setMoneda} placeholder="MXN" autoCapitalize="characters" />
              </View>
            </View>
          </View>

          {/* SECCIÓN 3: PARTIDAS / CONCEPTOS A FACTURAR */}
          <View style={[styles.card, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <View style={styles.cardHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="cart" size={18} color="#0284c7" />
                <Text style={[styles.cardTitle, { color: themeColors.text }]}>
                  3. Partidas / Conceptos a Facturar ({partidas.length})
                </Text>
              </View>
              <TouchableOpacity onPress={handleAddPartida} style={[styles.quickSelectBtn, { borderColor: '#10b981', backgroundColor: '#10b98115' }]}>
                <Ionicons name="add-circle" size={16} color="#10b981" />
                <Text style={{ color: '#10b981', fontSize: 12, fontWeight: '700' }}>Agregar Partida</Text>
              </TouchableOpacity>
            </View>

            <View style={{ gap: Spacing.two }}>
              {partidas.map((item, index) => {
                const cant = parseFloat(item.cantidad) || 0;
                const pu = parseFloat(item.precio_unitario) || 0;
                const subtotalPartida = cant * pu;
                const ivaPartida = item.objeto_imp === '02' ? subtotalPartida * 0.16 : 0;
                const totalPartida = subtotalPartida + ivaPartida;

                return (
                  <View key={item.id || index} style={[styles.partidaBox, { borderColor: themeColors.border, backgroundColor: themeColors.background }]}>
                    <View style={styles.partidaHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={[styles.partidaNumBadge, { backgroundColor: '#0284c7' }]}>
                          <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>#{index + 1}</Text>
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: 'bold', color: themeColors.text }}>
                          {item.descripcion || 'Nuevo Concepto'}
                        </Text>
                      </View>

                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity onPress={() => handleDuplicatePartida(index)} style={styles.partidaIconBtn}>
                          <Ionicons name="copy-outline" size={16} color={themeColors.textSecondary} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleRemovePartida(index)} style={styles.partidaIconBtn}>
                          <Ionicons name="trash-outline" size={16} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Descripción */}
                    <CustomInput
                      label="Descripción del Producto o Servicio *"
                      value={item.descripcion}
                      onChangeText={val => handleUpdatePartida(index, 'descripcion', val)}
                      placeholder="Ej. Servicio de instalación y configuración de GPS 4G"
                    />

                    {/* Buscadores Interactivos del SAT */}
                    <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 10, marginTop: 4 }}>
                      <SatCatalogAutocomplete
                        tipo="producto"
                        label="Clave SAT (c_ClaveProdServ) *"
                        value={item.clave_sat}
                        onChangeValue={val => handleUpdatePartida(index, 'clave_sat', val)}
                      />
                      <SatCatalogAutocomplete
                        tipo="unidad"
                        label="Unidad SAT (c_ClaveUnidad) *"
                        value={item.clave_unidad}
                        onChangeValue={val => handleUpdatePartida(index, 'clave_unidad', val)}
                      />
                    </View>

                    {/* Valores Numéricos */}
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                      <View style={{ flex: 0.8 }}>
                        <CustomInput
                          label="Cantidad *"
                          value={item.cantidad}
                          onChangeText={val => handleUpdatePartida(index, 'cantidad', val)}
                          keyboardType="numeric"
                        />
                      </View>
                      <View style={{ flex: 1.2 }}>
                        <CustomInput
                          label="Precio Unitario ($) *"
                          value={item.precio_unitario}
                          onChangeText={val => handleUpdatePartida(index, 'precio_unitario', val)}
                          keyboardType="numeric"
                        />
                      </View>
                      <View style={{ flex: 1.2, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 8 }}>
                        <Text style={{ fontSize: 10, color: themeColors.textSecondary }}>Total Partida (IVA inc.)</Text>
                        <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#0284c7' }}>
                          ${totalPartida.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          {/* SECCIÓN 4: RESUMEN FINANCIERO Y ACCIONES */}
          <View style={[styles.card, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="calculator" size={18} color="#0284c7" />
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>4. Resumen de Totales Fiscales</Text>
            </View>

            <View style={styles.totalsContainer}>
              <View style={styles.totalRow}>
                <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>Subtotal:</Text>
                <Text style={{ color: themeColors.text, fontSize: 14, fontWeight: '600' }}>
                  ${financialTotals.subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                </Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>IVA Trasladado (16%):</Text>
                <Text style={{ color: themeColors.text, fontSize: 14, fontWeight: '600' }}>
                  + ${financialTotals.totalIva.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                </Text>
              </View>
              <View style={[styles.totalRow, { borderTopWidth: 1.5, borderTopColor: themeColors.border, paddingTop: 8, marginTop: 4 }]}>
                <Text style={{ color: themeColors.text, fontSize: 16, fontWeight: 'bold' }}>Total a Facturar:</Text>
                <Text style={{ color: '#10b981', fontSize: 19, fontWeight: 'bold' }}>
                  ${financialTotals.total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                </Text>
              </View>
            </View>

            {/* Botones de Acción */}
            <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                onPress={handleVistaPreviaPDF}
                disabled={isSubmitting}
                style={[styles.actionBtn, { borderColor: '#0284c7', backgroundColor: '#0284c7' + '15', flex: 1 }]}
              >
                <Ionicons name="eye-outline" size={18} color="#0284c7" />
                <Text style={{ color: '#0284c7', fontWeight: '700', fontSize: 13 }}>Vista Previa / Borrador PDF</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleTimbrarFactura}
                disabled={isSubmitting}
                style={[styles.actionBtn, { backgroundColor: '#10b981', borderColor: '#10b981', flex: 1.5 }]}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="flash" size={18} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>
                      ⚡ Emitir y Timbrar Factura Oficial ante SAT
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      ) : (
        /* HISTORIAL DE FACTURAS EMITIDAS */
        <View style={{ flex: 1, padding: Spacing.three, maxWidth: 1200, alignSelf: 'center', width: '100%' }}>
          {/* Barra de Búsqueda y Filtros */}
          <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 10, marginBottom: 14 }}>
            <View style={[styles.searchBox, { borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement, flex: 1 }]}>
              <Ionicons name="search" size={18} color={themeColors.textSecondary} />
              <TextInput
                style={[styles.searchInput, { color: themeColors.text }]}
                placeholder="Buscar por cliente, folio o UUID..."
                placeholderTextColor={themeColors.textSecondary}
                value={historialSearch}
                onChangeText={setHistorialSearch}
              />
              {!!historialSearch && (
                <TouchableOpacity onPress={() => setHistorialSearch('')}>
                  <Ionicons name="close-circle" size={18} color={themeColors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            <View style={{ flexDirection: 'row', gap: 6 }}>
              {(['TODAS', 'TIMBRADA', 'CANCELADA'] as const).map(est => (
                <TouchableOpacity
                  key={est}
                  onPress={() => setFiltroEstado(est)}
                  style={[
                    styles.chipBtn,
                    {
                      borderColor: filtroEstado === est ? '#0284c7' : themeColors.border,
                      backgroundColor: filtroEstado === est ? '#0284c7' + '20' : themeColors.backgroundElement,
                    },
                  ]}
                >
                  <Text style={{ fontSize: 11, fontWeight: filtroEstado === est ? '800' : '500', color: filtroEstado === est ? '#0284c7' : themeColors.textSecondary }}>
                    {est}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {isLoadingHistorial ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#0284c7" />
              <Text style={{ color: themeColors.textSecondary, marginTop: 8 }}>Cargando facturas emitidas...</Text>
            </View>
          ) : facturasFiltradas.length === 0 ? (
            <View style={[styles.emptyContainer, { borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement }]}>
              <Ionicons name="receipt-outline" size={48} color={themeColors.textSecondary} />
              <Text style={[styles.emptyTitle, { color: themeColors.text }]}>No hay facturas emitidas</Text>
              <Text style={{ color: themeColors.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                Las facturas timbradas desde este módulo o desde el módulo de Ventas aparecerán aquí.
              </Text>
              <TouchableOpacity onPress={() => setActiveTab('emitir')} style={[styles.quickSelectBtn, { borderColor: '#0284c7', backgroundColor: '#0284c7' + '15', marginTop: 14 }]}>
                <Ionicons name="add-circle" size={16} color="#0284c7" />
                <Text style={{ color: '#0284c7', fontWeight: 'bold' }}>Emitir Primera Factura</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }}>
              <View style={{ gap: 8 }}>
                {facturasFiltradas.map((factura) => {
                  const isCanceled = factura.cfdi_estado === 'CANCELADA';
                  return (
                    <View
                      key={factura.id}
                      style={[
                        styles.facturaRowCard,
                        {
                          backgroundColor: themeColors.backgroundElement,
                          borderColor: isCanceled ? '#ef4444' + '60' : themeColors.border,
                        },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontSize: 15, fontWeight: 'bold', color: themeColors.text }}>
                            {factura.cliente || 'Cliente General'}
                          </Text>
                          <View
                            style={[
                              styles.statusBadge,
                              { backgroundColor: isCanceled ? '#ef444420' : '#10b98120' },
                            ]}
                          >
                            <Text style={{ fontSize: 10, fontWeight: '800', color: isCanceled ? '#ef4444' : '#10b981' }}>
                              {factura.cfdi_estado || 'TIMBRADA'}
                            </Text>
                          </View>
                        </View>

                        <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 2 }}>
                          Folio: <Text style={{ fontWeight: 'bold', color: themeColors.text }}>{factura.folio || factura.factura_referencia || '--'}</Text> | Fecha: {factura.fecha || factura.created_at?.slice(0, 10) || '--'}
                        </Text>
                        {factura.cfdi_uuid && (
                          <Text style={{ fontSize: 10, color: '#0284c7', marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>
                            UUID: {factura.cfdi_uuid}
                          </Text>
                        )}
                      </View>

                      <View style={{ alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 8 }}>
                        <Text style={{ fontSize: 16, fontWeight: 'bold', color: isCanceled ? themeColors.textSecondary : '#10b981' }}>
                          ${(factura.precio_total_facturado || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Text>
                      </View>

                      {/* Botones de acción por factura */}
                      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                        <TouchableOpacity
                          onPress={() => handleVerPDF(factura)}
                          style={[styles.smallActionBtn, { borderColor: '#0284c7', backgroundColor: '#0284c7' + '15' }]}
                        >
                          <Ionicons name="document-text" size={16} color="#0284c7" />
                          <Text style={{ color: '#0284c7', fontSize: 11, fontWeight: '700' }}>PDF</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => handleDescargarXML(factura)}
                          style={[styles.smallActionBtn, { borderColor: '#10b981', backgroundColor: '#10b98115' }]}
                        >
                          <Ionicons name="code-download" size={16} color="#10b981" />
                          <Text style={{ color: '#10b981', fontSize: 11, fontWeight: '700' }}>XML</Text>
                        </TouchableOpacity>

                        {!isCanceled && (
                          <TouchableOpacity
                            onPress={() => handleCancelarFacturaSAT(factura)}
                            style={[styles.smallActionBtn, { borderColor: '#ef4444', backgroundColor: '#ef444415' }]}
                          >
                            <Ionicons name="close-circle" size={16} color="#ef4444" />
                            <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '700' }}>Cancelar</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          )}
        </View>
      )}

      {/* MODAL PARA SELECCIONAR CLIENTE DEL CATÁLOGO */}
      <Modal visible={isClientModalOpen} animationType="slide" transparent onRequestClose={() => setIsClientModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Seleccionar Cliente del Catálogo</Text>
              <TouchableOpacity onPress={() => setIsClientModalOpen(false)}>
                <Ionicons name="close" size={22} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <View style={[styles.searchBox, { borderColor: themeColors.border, backgroundColor: themeColors.background, marginBottom: 12 }]}>
              <Ionicons name="search" size={18} color={themeColors.textSecondary} />
              <TextInput
                style={[styles.searchInput, { color: themeColors.text }]}
                placeholder="Buscar por nombre, razón social o RFC..."
                placeholderTextColor={themeColors.textSecondary}
                value={clientSearch}
                onChangeText={setClientSearch}
                autoFocus
              />
            </View>

            <ScrollView style={{ maxHeight: 400 }}>
              <View style={{ gap: 6 }}>
                {clientesFiltrados.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => handleSelectClient(c)}
                    style={[styles.clientOptionItem, { borderColor: themeColors.border, backgroundColor: themeColors.background }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: 'bold', color: themeColors.text }}>
                        {c.razon_social || c.nombre}
                      </Text>
                      <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 2 }}>
                        RFC: {c.rfc || 'Sin RFC'} | CP: {c.codigo_postal || 'N/D'} | Régimen: {c.regimen_fiscal || '601'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#0284c7" />
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    borderBottomWidth: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  tabsContainer: {
    flexDirection: 'row',
    gap: 16,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 10,
    paddingHorizontal: 4,
  },
  tabBtnText: {
    fontSize: 13,
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: Spacing.three,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  quickSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  chipBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  partidaBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  partidaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  partidaNumBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  partidaIconBtn: {
    padding: 4,
  },
  totalsContainer: {
    gap: 6,
    paddingVertical: 6,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  emptyContainer: {
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 10,
  },
  facturaRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 12,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  smallActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxWidth: 580,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  clientOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
});
