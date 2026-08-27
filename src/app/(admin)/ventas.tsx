import React, { useEffect, useState, useMemo, createElement } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  FlatList,
  useWindowDimensions,
  Modal,
  Pressable,
  Linking,
  Keyboard,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { supabase, AuthService, Usuario, Venta, VentaPartida, VentaPago, calcularEstadoPago, EstadoPagoVenta, syncVentaPaymentStatus, recalculateVentaTotals, ClienteItem, SucursalCliente, GastoHelper } from '@/services/supabase';
import { GeminiService } from '@/services/gemini';
import { CatalogService } from '@/services/catalogService';
import { base64ToArrayBuffer } from '@/services/sync';
import { exportarFacturaOdooPDF, exportarCotizacionOdooPDF } from '@/utils/reportGenerator';
import { parseCFDIXML } from '@/utils/cfdiParser';
import StepIndicator from '@/components/StepIndicator';
import CustomInput from '@/components/CustomInput';
import CustomButton from '@/components/CustomButton';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';

// Tipo local para las partidas editables en la UI
interface PartidaEditable {
  id: string; // ID temporal en UI
  descripcion: string;
  cantidad: string;
  unidad: string;
  precio_unitario_venta: string;
  costo_unitario_proveedor: string;
}

export interface VentaConPago extends Venta {
  total_pagado?: number;
  saldo_pendiente?: number;
  estado_pago?: EstadoPagoVenta;
  fecha_ultimo_pago?: string | null;
  pagos_count?: number;
}

const getEstadoPagoStyle = (estado?: EstadoPagoVenta) => {
  switch (estado) {
    case 'PAGADO':
      return { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: '#10b981' };
    case 'PAGO PARCIAL':
      return { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b', border: '#f59e0b' };
    case 'PENDIENTE DE PAGO':
    default:
      return { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', border: '#ef4444' };
  }
};

const getEstadoCfdiStyle = (estado?: string | null) => {
  switch (estado) {
    case 'TIMBRADA':
      return { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: '#10b981', label: 'CFDI TIMBRADO' };
    case 'CANCELADA':
      return { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', border: '#ef4444', label: 'CANCELADA' };
    default:
      return { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b', border: '#f59e0b', label: 'SIN TIMBRAR' };
  }
};

const REGIMENES_FISCALES = [
  { code: '601', label: '601 - General de Ley Personas Morales' },
  { code: '612', label: '612 - Personas Físicas con Actividades Empresariales y Profesionales' },
  { code: '626', label: '626 - Régimen Simplificado de Confianza (RESICO)' },
  { code: '605', label: '605 - Sueldos y Salarios e Ingresos Asimilados a Salarios' },
  { code: '616', label: '616 - Sin obligaciones fiscales (Público General)' },
  { code: '603', label: '603 - Personas Morales con Fines no Lucrativos' },
  { code: '621', label: '621 - Incorporación Fiscal' },
];

const USOS_CFDI = [
  { code: 'G03', label: 'G03 - Gastos en general' },
  { code: 'G01', label: 'G01 - Adquisición de mercancías' },
  { code: 'S01', label: 'S01 - Sin efectos fiscales' },
  { code: 'CP01', label: 'CP01 - Pagos' },
  { code: 'I04', label: 'I04 - Equipo de cómputo y accesorios' },
  { code: 'I08', label: 'I08 - Otra maquinaria y equipo' },
  { code: 'I01', label: 'I01 - Construcciones' },
];

const FORMAS_PAGO_CFDI = [
  { code: '03', label: '03 - Transferencia electrónica de fondos' },
  { code: '01', label: '01 - Efectivo' },
  { code: '04', label: '04 - Tarjeta de crédito' },
  { code: '28', label: '28 - Tarjeta de débito' },
  { code: '02', label: '02 - Cheque nominativo' },
  { code: '99', label: '99 - Por definir' },
];

const TIPOS_PROYECTO = ['Venta', 'Servicio', 'Proyecto'];

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    window.alert(title + '\n\n' + message);
  } else {
    Alert.alert(title, message);
  }
};

const formatCurrency = (val: number) =>
  '$' + val.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const getTimestampFileName = (userId: string, ext: string) => {
  return `ventas/${userId}/${Date.now()}_factura.${ext}`;
};

const MESES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

const MESES_ABR = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic'
];

// Helper para normalizar texto (sin acentos/tildes y en minúsculas)
const normalizeSearchText = (str?: string | number | null): string => {
  if (str === undefined || str === null) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
};

// Extrae múltiples formatos de texto a partir de una fecha ISO o YYYY-MM-DD
const getDateSearchStrings = (dateStr?: string | null): string[] => {
  if (!dateStr) return [];
  const variations: string[] = [dateStr];
  try {
    const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
    const parts = cleanDate.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const monthIdx = parseInt(parts[1], 10) - 1;
      const day = parts[2];
      const dayNum = parseInt(day, 10);

      variations.push(`${day}/${parts[1]}/${year}`);
      variations.push(`${day}-${parts[1]}-${year}`);
      variations.push(`${dayNum}/${monthIdx + 1}/${year}`);
      variations.push(`${parts[1]}/${year}`);
      variations.push(year);

      if (monthIdx >= 0 && monthIdx < 12) {
        const mesNombre = MESES_ES[monthIdx];
        const mesAbr = MESES_ABR[monthIdx];
        variations.push(mesNombre);
        variations.push(mesAbr);
        variations.push(`${mesNombre} ${year}`);
        variations.push(`${dayNum} de ${mesNombre}`);
        variations.push(`${dayNum} de ${mesNombre} de ${year}`);
        variations.push(`${dayNum} ${mesAbr} ${year}`);
      }
    }
  } catch {
    // fallback
  }
  return variations;
};

// Genera un texto consolidado con todos los campos de la venta para búsqueda universal
const buildVentaSearchableText = (v: VentaConPago): string => {
  const parts: string[] = [
    v.cliente || '',
    v.sucursal || '',
    v.factura_referencia || '',
    v.folio || '',
    v.cotizaciones?.folio || '',
    v.descripcion || '',
    v.tipo_proyecto || '',
    v.proveedor || '',
    v.notas || '',
    v.usuarios?.nombre || '',
    v.estado_pago || '',
    v.cfdi_estado || '',
    v.cfdi_uuid || '',
    v.precio_total_facturado !== undefined ? String(v.precio_total_facturado) : '',
    v.precio_total_facturado !== undefined ? formatCurrency(v.precio_total_facturado) : '',
    v.total_pagado !== undefined ? String(v.total_pagado) : '',
    v.total_pagado !== undefined ? formatCurrency(v.total_pagado) : '',
    v.saldo_pendiente !== undefined ? String(v.saldo_pendiente) : '',
    v.saldo_pendiente !== undefined ? formatCurrency(v.saldo_pendiente) : '',
    v.costo_total !== undefined ? String(v.costo_total) : '',
    v.costo_total !== undefined ? formatCurrency(v.costo_total) : '',
    v.utilidad_bruta !== undefined ? String(v.utilidad_bruta) : '',
    v.utilidad_bruta !== undefined ? formatCurrency(v.utilidad_bruta) : '',
    ...getDateSearchStrings(v.fecha),
    ...getDateSearchStrings(v.fecha_ultimo_pago),
    ...getDateSearchStrings(v.created_at),
  ];

  if (v.ventas_partidas && Array.isArray(v.ventas_partidas)) {
    v.ventas_partidas.forEach((p) => {
      if (p.descripcion) parts.push(p.descripcion);
      if (p.unidad) parts.push(p.unidad);
    });
  }

  return normalizeSearchText(parts.join(' '));
};

export default function VentasScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { width: windowWidth } = useWindowDimensions();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const isMobile = windowWidth < 600;
  const isDesktop = Platform.OS === 'web' && windowWidth >= 1024;
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // === Paso 1: Escanear Factura ===
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [fileMimeType, setFileMimeType] = useState<string>('image/jpeg');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(false);

  // === Paso 2: Datos Generales + Partidas ===
  const [fecha, setFecha] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateValue, setDateValue] = useState(new Date());
  const [cliente, setCliente] = useState('');
  const [sucursal, setSucursal] = useState('');
  const [facturaReferencia, setFacturaReferencia] = useState('');
  const [tipoProyecto, setTipoProyecto] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [showTipoDropdown, setShowTipoDropdown] = useState(false);
  const [notas, setNotas] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [agregarIva, setAgregarIva] = useState(false);
  const [partidas, setPartidas] = useState<PartidaEditable[]>([]);
  const [cotizacionIdOrigen, setCotizacionIdOrigen] = useState<string | null>(null);

  // === Historial ===
  const [activeTab, setActiveTab] = useState<'registrar' | 'historial'>('registrar');
  const [ventasHistorial, setVentasHistorial] = useState<VentaConPago[]>([]);
  const [isLoadingHistorial, setIsLoadingHistorial] = useState(false);
  const [historialSearch, setHistorialSearch] = useState('');
  const [filterDate, setFilterDate] = useState<Date | null>(null);
  const [showFilterDatePicker, setShowFilterDatePicker] = useState(false);

  // === Edición y Detalle de Ventas ===
  const [selectedVenta, setSelectedVenta] = useState<VentaConPago | null>(null);
  const [selectedVentaPartidas, setSelectedVentaPartidas] = useState<VentaPartida[]>([]);
  const [selectedVentaGastos, setSelectedVentaGastos] = useState<any[]>([]);
  const [isLoadingPartidas, setIsLoadingPartidas] = useState(false);
  const [isDetailModalVisible, setIsDetailModalVisible] = useState(false);
  const [editingVentaId, setEditingVentaId] = useState<string | null>(null);

  // === Pagos y Parcialidades ===
  const [isPagoModalVisible, setIsPagoModalVisible] = useState(false);
  const [selectedVentaPagos, setSelectedVentaPagos] = useState<VentaPago[]>([]);
  const [isLoadingPagos, setIsLoadingPagos] = useState(false);
  const [pagoMonto, setPagoMonto] = useState('');
  const [pagoFecha, setPagoFecha] = useState(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [pagoMetodo, setPagoMetodo] = useState('Transferencia');
  const [pagoReferencia, setPagoReferencia] = useState('');
  const [isSubmittingPago, setIsSubmittingPago] = useState(false);
  const [showPagoDatePicker, setShowPagoDatePicker] = useState(false);
  const [pagoDateValue, setPagoDateValue] = useState(new Date());

  // === Clientes de Supabase ===
  const [clientes, setClientes] = useState<any[]>([]);
  const [clienteSearch, setClienteSearch] = useState('');
  const [showCliDropdown, setShowCliDropdown] = useState(false);
  const [sucursalesCliente, setSucursalesCliente] = useState<SucursalCliente[]>([]);
  const [showSucursalDropdown, setShowSucursalDropdown] = useState(false);
  const [sucursalSearch, setSucursalSearch] = useState('');

  // === Modal de Pre-Timbrado / Edición Fiscal CFDI 4.0 ===
  const [isTimbradoModalVisible, setIsTimbradoModalVisible] = useState(false);
  const [timbrandoVenta, setTimbrandoVenta] = useState<Venta | null>(null);
  const [cfdiClienteNombre, setCfdiClienteNombre] = useState('');
  const [cfdiClienteRfc, setCfdiClienteRfc] = useState('');
  const [cfdiClienteCp, setCfdiClienteCp] = useState('');
  const [cfdiClienteRegimen, setCfdiClienteRegimen] = useState('601');
  const [cfdiClienteUso, setCfdiClienteUso] = useState('G03');
  const [cfdiFormaPago, setCfdiFormaPago] = useState('03');
  const [cfdiMetodoPago, setCfdiMetodoPago] = useState('PUE');
  const [cfdiSerie, setCfdiSerie] = useState('A');
  const [cfdiFolio, setCfdiFolio] = useState('');
  const [cfdiPartidas, setCfdiPartidas] = useState<Array<{
    id: string;
    descripcion: string;
    cantidad: string;
    precio_unitario_venta: string;
    clave_sat: string;
    clave_unidad: string;
    unidad: string;
  }>>([]);
  const [isSubmittingTimbrado, setIsSubmittingTimbrado] = useState(false);

  // === Auth Check ===
  useEffect(() => {
    const init = async () => {
      const user = await AuthService.getCurrentUser();
      if (!user || (user.rol !== 'ADMIN' && user.rol !== 'DEV')) {
        router.replace('/');
        return;
      }
      setCurrentUser(user);

      // Cargar catálogo de clientes y sucursales
      try {
        const [cliRes, sucRes] = await Promise.all([
          supabase.from('clientes').select('*').order('nombre'),
          supabase.from('sucursales_cliente').select('*').order('nombre')
        ]);
        if (cliRes.data) setClientes(cliRes.data);
        if (sucRes.data) setSucursalesCliente(sucRes.data);
      } catch (err) {
        console.error('Error loading catalogs:', err);
      }
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // === Recibir parámetros de Cotización ===
  useEffect(() => {
    if (params.fromCotizacion === 'true' && params.cotizacionData) {
      setTimeout(() => {
        try {
          const data = JSON.parse(params.cotizacionData as string);
          if (data.cliente_nombre) setCliente(data.cliente_nombre);
          if (data.id) setCotizacionIdOrigen(data.id);
          
          // Auto-completar la fecha actual para la nueva venta
          const today = new Date();
          const yyyy = today.getFullYear();
          const mm = String(today.getMonth() + 1).padStart(2, '0');
          const dd = String(today.getDate()).padStart(2, '0');
          setFecha(`${yyyy}-${mm}-${dd}`);
          setDateValue(today);
          
          if (data.lineas && Array.isArray(data.lineas)) {
             const partidasUI: PartidaEditable[] = data.lineas.map((l: any, idx: number) => {
               const desc = [l.productoNombre, l.productoDescripcion].filter(Boolean).join(' - ');
               return {
                 id: `cot_${Date.now()}_${idx}`,
                 descripcion: desc || 'Sin descripción',
                 cantidad: String(l.cantidad || 1),
                 unidad: 'PZA',
                 precio_unitario_venta: String(l.precioUnitario || 0),
                 costo_unitario_proveedor: '0',
               };
             });
             setPartidas(partidasUI);
          }
          
          setActiveTab('registrar');
          setCurrentStep(2); // Avanzar directamente al paso 2
        } catch (e) {
          console.error("Error al parsear cotizacion para venta:", e);
        }
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.fromCotizacion]);

  const handleAddNewSucursal = async (nombre: string) => {
    if (!nombre.trim()) return;
    const currentCliente = clientes.find(c => c.nombre?.trim().toLowerCase() === cliente?.trim().toLowerCase());
    if (!currentCliente) {
      Alert.alert('Validación', 'Primero debes seleccionar un cliente para vincular la sucursal.');
      return;
    }

    try {
      const newSuc = await CatalogService.crearSucursal({
        cliente_id: currentCliente.id,
        nombre: nombre.trim().toUpperCase(),
      });
      setSucursalesCliente(prev => [...prev, newSuc].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setSucursal(newSuc.nombre);
      setSucursalSearch('');
      setShowSucursalDropdown(false);
      Alert.alert('Éxito', `Sucursal "${newSuc.nombre}" agregada y vinculada a ${currentCliente.nombre}.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo agregar la sucursal.');
    }
  };

  // === Cargar Historial ===
  const loadHistorial = async () => {
    setIsLoadingHistorial(true);
    try {
      const { data: ventasData, error } = await supabase
        .from('ventas')
        .select('*, cotizaciones(folio), usuarios!ventas_registrado_por_fkey(nombre), ventas_partidas(descripcion, unidad)')
        .order('created_at', { ascending: false })
        .limit(300);

      if (error) throw error;

      const rawVentas = ventasData || [];
      const ventaIds = rawVentas.map(v => v.id);

      let pagosMap: Record<string, VentaPago[]> = {};
      if (ventaIds.length > 0) {
        try {
          const { data: pagosData, error: pagosErr } = await supabase
            .from('ventas_pagos')
            .select('*')
            .in('venta_id', ventaIds)
            .order('fecha_pago', { ascending: false });

          if (!pagosErr && pagosData) {
            pagosData.forEach((p: VentaPago) => {
              if (!pagosMap[p.venta_id]) pagosMap[p.venta_id] = [];
              pagosMap[p.venta_id].push(p);
            });
          }
        } catch (errPagos) {
          // Ignorar si la tabla no existe en Supabase aun
        }
      }

      const ventasConPagos: VentaConPago[] = rawVentas.map(v => {
        const pagos = pagosMap[v.id] || [];
        const totalPagado = pagos.length > 0
          ? pagos.reduce((sum, p) => sum + (Number(p.monto) || 0), 0)
          : (Number(v.total_pagado) || 0);

        const precioFacturado = Number(v.precio_total_facturado) || 0;
        const saldoPendiente = v.saldo_pendiente !== undefined && v.saldo_pendiente !== null
          ? Number(v.saldo_pendiente)
          : Math.max(0, precioFacturado - totalPagado);

        const estadoPago = v.estado_pago || calcularEstadoPago(precioFacturado, totalPagado);
        const fechaUltimoPago = pagos.length > 0 ? pagos[0].fecha_pago : null;

        return {
          ...v,
          total_pagado: totalPagado,
          saldo_pendiente: saldoPendiente,
          estado_pago: estadoPago,
          fecha_ultimo_pago: fechaUltimoPago,
          pagos_count: pagos.length,
        };
      });

      setVentasHistorial(ventasConPagos);
    } catch (err: any) {
      console.error('Error loading sales history:', err);
    } finally {
      setIsLoadingHistorial(false);
    }
  };

  const loadPagosForSelectedVenta = async (ventaId: string, currentVentaObj?: VentaConPago) => {
    setIsLoadingPagos(true);
    try {
      const { data: pagosData, error } = await supabase
        .from('ventas_pagos')
        .select('*')
        .eq('venta_id', ventaId)
        .order('fecha_pago', { ascending: false });

      if (error) {
        console.warn('Error fetching pagos for sale:', error);
        setSelectedVentaPagos([]);
        return [];
      }

      const pagos = pagosData || [];
      setSelectedVentaPagos(pagos);

      // Recalcular métricas de pago para la venta seleccionada
      const totalPagado = pagos.reduce((sum, p) => sum + (Number(p.monto) || 0), 0);
      const targetVenta = currentVentaObj || selectedVenta;
      if (targetVenta) {
        const precioFacturado = Number(targetVenta.precio_total_facturado) || 0;
        const saldoPendiente = Math.max(0, precioFacturado - totalPagado);
        const estadoPago = calcularEstadoPago(precioFacturado, totalPagado);
        const fechaUltimo = pagos.length > 0 ? pagos[0].fecha_pago : null;

        const updatedSelectedVenta: VentaConPago = {
          ...targetVenta,
          total_pagado: totalPagado,
          saldo_pendiente: saldoPendiente,
          estado_pago: estadoPago,
          fecha_ultimo_pago: fechaUltimo,
          pagos_count: pagos.length,
        };
        setSelectedVenta(updatedSelectedVenta);

        // Actualizar en la base de datos Supabase
        await syncVentaPaymentStatus(ventaId);

        // Actualizar en el estado de historial local
        setVentasHistorial(prev => prev.map(v => (v.id === ventaId ? updatedSelectedVenta : v)));
      }
      return pagos;
    } catch (err) {
      console.error('Error loading pagos:', err);
      setSelectedVentaPagos([]);
      return [];
    } finally {
      setIsLoadingPagos(false);
    }
  };

  const handleOpenPagoModal = async (venta: VentaConPago) => {
    setSelectedVenta(venta);
    setIsPagoModalVisible(true);

    const totalPag = venta.total_pagado || 0;
    const saldoSug = venta.saldo_pendiente !== undefined ? venta.saldo_pendiente : Math.max(0, (Number(venta.precio_total_facturado) || 0) - totalPag);
    setPagoMonto(saldoSug > 0 ? String(saldoSug) : '');

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    setPagoFecha(`${yyyy}-${mm}-${dd}`);
    setPagoReferencia('');

    await loadPagosForSelectedVenta(venta.id, venta);
  };


  const handleSelectVenta = async (venta: VentaConPago) => {
    setSelectedVenta(venta);
    setIsDetailModalVisible(true);
    setIsLoadingPartidas(true);
    // Reiniciar form de pago con monto pendiente sugerido
    const saldoSug = venta.saldo_pendiente !== undefined ? venta.saldo_pendiente : (Number(venta.precio_total_facturado) || 0);
    setPagoMonto(saldoSug > 0 ? String(saldoSug) : '');
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    setPagoFecha(`${yyyy}-${mm}-${dd}`);
    setPagoReferencia('');

    try {
      // 1. Cargar partidas
      const { data: partData, error: partError } = await supabase
        .from('ventas_partidas')
        .select('*')
        .eq('venta_id', venta.id);
      if (partError) throw partError;
      setSelectedVentaPartidas(partData || []);

      // 2. Cargar gastos vinculados
      const { data: gastosData, error: gastosError } = await supabase
        .from('gastos')
        .select(GastoHelper.GASTOS_SELECT_QUERY)
        .eq('venta_id', venta.id)
        .eq('status', 'APPROVED');
      if (gastosError) throw gastosError;
      setSelectedVentaGastos(gastosData || []);

      // 3. Cargar pagos
      await loadPagosForSelectedVenta(venta.id, venta);
    } catch (err: any) {
      console.error('Error fetching venta details:', err);
      showAlert('Error', 'No se pudieron cargar los detalles de la venta.');
    } finally {
      setIsLoadingPartidas(false);
    }
  };

  const handleRegistrarPago = async () => {
    if (!selectedVenta) return;
    const montoNum = parseFloat(pagoMonto);
    if (isNaN(montoNum) || montoNum <= 0) {
      showAlert('Validación', 'Por favor ingresa un monto válido mayor a 0.');
      return;
    }

    if (!pagoFecha.trim()) {
      showAlert('Validación', 'Por favor ingresa la fecha del pago.');
      return;
    }

    setIsSubmittingPago(true);
    try {
      const payload = {
        venta_id: selectedVenta.id,
        monto: montoNum,
        fecha_pago: pagoFecha,
        metodo_pago: pagoMetodo || 'Transferencia',
        referencia: pagoReferencia.trim() || null,
        registrado_por: currentUser?.id || null,
      };

      const { error } = await supabase
        .from('ventas_pagos')
        .insert([payload]);

      if (error) throw error;

      showAlert('Éxito', `Se registró la parcialidad de ${formatCurrency(montoNum)} correctamente.`);
      
      const updatedPagos = await loadPagosForSelectedVenta(selectedVenta.id);
      const nuevoTotalPagado = updatedPagos.reduce((sum, p) => sum + (Number(p.monto) || 0), 0);
      const nuevoSaldo = Math.max(0, (Number(selectedVenta.precio_total_facturado) || 0) - nuevoTotalPagado);
      setPagoMonto(nuevoSaldo > 0 ? String(nuevoSaldo) : '');
      setPagoReferencia('');
    } catch (err: any) {
      console.error('Error al registrar pago:', err);
      const isMissingTable = err?.code === '42P01' || err?.message?.includes('ventas_pagos');
      const msg = isMissingTable
        ? 'La tabla "ventas_pagos" aún no existe en Supabase. Por favor ejecuta el script SQL en el Dashboard de Supabase.'
        : (err?.message || 'No se pudo registrar el pago.');
      showAlert('Error', msg);
    } finally {
      setIsSubmittingPago(false);
    }
  };

  const handleDeletePago = async (pagoId: string) => {
    if (!selectedVenta) return;

    const performDelete = async () => {
      try {
        const { error } = await supabase
          .from('ventas_pagos')
          .delete()
          .eq('id', pagoId);

        if (error) throw error;

        showAlert('Éxito', 'Pago/Parcialidad eliminada correctamente.');
        await loadPagosForSelectedVenta(selectedVenta.id);
      } catch (err: any) {
        console.error('Error al eliminar pago:', err);
        showAlert('Error', err.message || 'No se pudo eliminar el pago.');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('¿Estás seguro de que deseas eliminar este pago del historial?')) {
        await performDelete();
      }
    } else {
      Alert.alert(
        'Confirmar Eliminación',
        '¿Estás seguro de que deseas eliminar este pago del historial?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Eliminar', style: 'destructive', onPress: performDelete }
        ]
      );
    }
  };


  const handleDeleteVenta = async () => {
    if (!selectedVenta) return;

    const performDelete = async () => {
      setIsSubmitting(true);
      try {
        // Eliminar partidas primero (clave foránea)
        const { error: partError } = await supabase
          .from('ventas_partidas')
          .delete()
          .eq('venta_id', selectedVenta.id);

        if (partError) throw partError;

        // Eliminar venta
        const { error: ventError } = await supabase
          .from('ventas')
          .delete()
          .eq('id', selectedVenta.id);

        if (ventError) throw ventError;

        showAlert('Éxito', 'La venta fue eliminada correctamente.');
        setIsDetailModalVisible(false);
        resetForm();
        loadHistorial();
      } catch (err: any) {
        console.error('Error deleting sale:', err);
        showAlert('Error', err.message || 'No se pudo eliminar la venta.');
      } finally {
        setIsSubmitting(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('¿Estás seguro de que deseas eliminar esta venta y todas sus partidas? Esta acción no se puede deshacer.')) {
        await performDelete();
      }
    } else {
      Alert.alert(
        'Confirmar Eliminación',
        '¿Estás seguro de que deseas eliminar esta venta y todas sus partidas? Esta acción no se puede deshacer.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Eliminar', style: 'destructive', onPress: performDelete }
        ]
      );
    }
  };
  const handleDuplicateVenta = async (venta?: VentaConPago) => {
    const targetVenta = venta || selectedVenta;
    if (!targetVenta) return;

    try {
      setIsLoadingHistorial(true);
      setIsDetailModalVisible(false);

      let partidasToCopy: any[] = [];
      if (venta) {
        const { data: partData, error: partError } = await supabase
          .from('ventas_partidas')
          .select('*')
          .eq('venta_id', targetVenta.id);
        if (partError) throw partError;
        partidasToCopy = partData || [];
      } else {
        partidasToCopy = selectedVentaPartidas;
      }

      const editablePartidas: PartidaEditable[] = partidasToCopy.map(p => ({
        id: `temp-${Date.now()}-${Math.random()}`,
        descripcion: p.descripcion,
        cantidad: String(p.cantidad),
        unidad: p.unidad,
        precio_unitario_venta: String(p.precio_unitario_venta),
        costo_unitario_proveedor: String(p.costo_unitario_proveedor),
      }));

      const today = new Date();
      setDateValue(today);
      setFecha(today.toISOString().split('T')[0]);
      
      setCliente(targetVenta.cliente);
      setSucursal(targetVenta.sucursal || '');
      setFacturaReferencia('');
      setDescripcion(`(Copia) ${targetVenta.descripcion || ''}`);
      setAgregarIva(targetVenta.agregar_iva || false);
      setTipoProyecto(targetVenta.tipo_proyecto || '');
      setProveedor(targetVenta.proveedor || '');
      setNotas(targetVenta.notas || '');
      setPartidas(editablePartidas);
      setEditingVentaId(null);

      setActiveTab('registrar');
      setCurrentStep(2);
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo duplicar la venta.');
    } finally {
      setIsLoadingHistorial(false);
    }
  };

  const handleEditVenta = () => {
    if (!selectedVenta) return;

    const editablePartidas: PartidaEditable[] = selectedVentaPartidas.map(p => ({
      id: p.id,
      descripcion: p.descripcion,
      cantidad: String(p.cantidad),
      unidad: p.unidad,
      precio_unitario_venta: String(p.precio_unitario_venta),
      costo_unitario_proveedor: String(p.costo_unitario_proveedor),
    }));

    setFecha(selectedVenta.fecha);
    // Sync dateValue so the calendar picker shows the correct date
    if (selectedVenta.fecha) {
      const parts = selectedVenta.fecha.split('-');
      if (parts.length === 3) {
        const parsed = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        if (!isNaN(parsed.getTime())) setDateValue(parsed);
      }
    }
    setCliente(selectedVenta.cliente);
    setFacturaReferencia(selectedVenta.factura_referencia || '');
    setDescripcion(selectedVenta.descripcion || '');
    setAgregarIva(selectedVenta.agregar_iva || false);
    setTipoProyecto(selectedVenta.tipo_proyecto || '');
    setProveedor(selectedVenta.proveedor || '');
    setNotas(selectedVenta.notas || '');
    setPartidas(editablePartidas);
    setEditingVentaId(selectedVenta.id);

    setIsDetailModalVisible(false);
    setActiveTab('registrar');
    setCurrentStep(2);
  };

  const cancelEditing = () => {
    setEditingVentaId(null);
    resetForm();
    if (params.fromCotizacion === 'true') {
      router.setParams({ fromCotizacion: 'false', cotizacionData: '' });
    }
  };

  const handleAddNewCliente = async (nombre: string) => {
    try {
      const newCli = await CatalogService.crearCliente({ nombre: nombre.trim() });
      setClientes(prev => [...prev, newCli].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')));
      setCliente(newCli.nombre);
      setSucursal('');
      setProveedor('');
      setClienteSearch('');
      setShowCliDropdown(false);
      showAlert('Éxito', `Cliente "${nombre.trim()}" agregado correctamente.`);
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo agregar el cliente.');
    }
  };



  // === Filtrar Historial ===
  const ventasFiltradas = useMemo(() => {
    let filtradas = ventasHistorial;

    if (filterDate) {
      const dd = String(filterDate.getDate()).padStart(2, '0');
      const mm = String(filterDate.getMonth() + 1).padStart(2, '0');
      const yyyy = filterDate.getFullYear();
      const formattedFilterDate = `${yyyy}-${mm}-${dd}`;
      
      filtradas = filtradas.filter(v => v.fecha?.startsWith(formattedFilterDate));
    }

    const rawQuery = normalizeSearchText(historialSearch);
    if (rawQuery) {
      const queryTokens = rawQuery.split(/\s+/).filter(Boolean);

      filtradas = filtradas.filter(v => {
        const itemText = buildVentaSearchableText(v);
        // Cada término de búsqueda debe estar presente en los datos consolidados de la venta
        return queryTokens.every(token => itemText.includes(token));
      });
    }
    
    return filtradas;
  }, [ventasHistorial, historialSearch, filterDate]);

  // === Calcular totales de las partidas ===
  const calculatedTotals = useMemo(() => {
    let precioTotal = 0;
    let costoTotal = 0;

    partidas.forEach(p => {
      const cant = Number(p.cantidad) || 0;
      const precioUV = Number(p.precio_unitario_venta) || 0;
      const costoUP = Number(p.costo_unitario_proveedor) || 0;
      precioTotal += Math.round(cant * precioUV * 100) / 100;
      costoTotal += Math.round(cant * costoUP * 100) / 100;
    });

    if (agregarIva) {
      precioTotal = Math.round(precioTotal * 1.16 * 100) / 100;
    }

    // Sumar el costo de los gastos vinculados si existen
    const costoGastos = selectedVentaGastos.reduce((sum, g) => sum + (Number(g.monto) || 0), 0);
    const costoTotalConGastos = costoTotal + costoGastos;

    const utilidad = Math.round((precioTotal - costoTotalConGastos) * 100) / 100;
    const margen = precioTotal > 0
      ? Math.round((utilidad / precioTotal) * 10000) / 10000
      : 0;

    return {
      precioTotal,
      costoTotal: costoTotalConGastos,
      utilidad,
      margen,
    };
  }, [partidas, selectedVentaGastos, agregarIva]);

  // === Permisos ===
  const requestCameraPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'web') return true;
    const status = await ImagePicker.requestCameraPermissionsAsync();
    if (status.status !== 'granted') {
      showAlert('Permiso requerido', 'Se necesita permiso de cámara para capturar la factura.');
      return false;
    }
    return true;
  };

  const requestLibraryPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'web') return true;
    const status = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status.status !== 'granted') {
      showAlert('Permiso requerido', 'Se necesita permiso de galería para seleccionar la factura.');
      return false;
    }
    return true;
  };

  // === Capturar / Seleccionar Archivo ===
  const handleCapturePhoto = async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: Platform.OS !== 'web',
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        setFileUri(result.assets[0].uri);
        setFileBase64(result.assets[0].base64 || null);
        setFileMimeType('image/jpeg');
        setScanSuccess(false);
      }
    } catch (err) {
      console.error('Camera error:', err);
      showAlert('Error', 'No se pudo abrir la cámara.');
    }
  };

  const handleSelectGallery = async () => {
    const hasPermission = await requestLibraryPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        setFileUri(result.assets[0].uri);
        setFileBase64(result.assets[0].base64 || null);
        setFileMimeType('image/jpeg');
        setScanSuccess(false);
      }
    } catch (err) {
      console.error('Gallery error:', err);
      showAlert('Error', 'No se pudo abrir la galería.');
    }
  };

  const handleSelectDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*', 
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const uri = asset.uri;
        const mimeType = asset.mimeType || '';

        const isPdf = mimeType.includes('pdf') || uri.endsWith('.pdf') || asset.name?.endsWith('.pdf');
        const isImage = mimeType.startsWith('image/') || uri.endsWith('.jpg') || uri.endsWith('.jpeg') || uri.endsWith('.png') || uri.endsWith('.webp');

        if (!isPdf && !isImage) {
          showAlert('Validación', 'Por favor selecciona únicamente archivos PDF o imágenes (JPG, PNG, WEBP).');
          return;
        }

        setFileMimeType(mimeType || (uri.endsWith('.pdf') || asset.name?.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'));
        setScanSuccess(false);

        // Leer el archivo como base64 de manera robusta
        try {
          if (Platform.OS !== 'web') {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const FileSys = require('expo-file-system/legacy');
            // Actualizar la URI al archivo (que ya está en caché)
            setFileUri(uri);

            // Leer directamente
            const b64 = await new Promise<string>((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.onload = () => {
                try {
                  const base64Str = require('buffer').Buffer.from(xhr.response).toString('base64');
                  resolve(base64Str);
                } catch (e) {
                  reject(e);
                }
              };
              xhr.onerror = reject;
              xhr.responseType = 'arraybuffer';
              xhr.open('GET', uri, true);
              xhr.send(null);
            });
            setFileBase64(b64);
          } else {
            setFileUri(uri);
            // Web: fetch el blob y convertir
            const response = await fetch(uri);
            const blob = await response.blob();
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result as string;
              const b64 = dataUrl.split(',')[1] || '';
              setFileBase64(b64);
            };
            reader.readAsDataURL(blob);
          }
        } catch (readErr: any) {
          console.error('Robust read error:', readErr);
          showAlert('Error', 'No se pudo procesar el archivo seleccionado. Por favor intenta de nuevo.');
        }
      }
    } catch (err) {
      console.error('Document picker error:', err);
      showAlert('Error', 'No se pudo seleccionar el archivo.');
    }
  };

  // === Analizar con IA ===
  const handleAnalyzeWithIA = async () => {
    if (!fileBase64) {
      showAlert('Error', 'No hay archivo para analizar. Por favor selecciona una factura primero.');
      return;
    }

    setIsAnalyzing(true);
    try {
      const result = await GeminiService.analyzeInvoiceSales(fileBase64, fileMimeType);

      // Poblar datos generales
      if (result.informacion_general.fecha) setFecha(result.informacion_general.fecha);
      if (result.informacion_general.cliente) setCliente(result.informacion_general.cliente);
      if (result.informacion_general.factura_o_referencia) setFacturaReferencia(result.informacion_general.factura_o_referencia);
      if (result.informacion_general.descripcion) setDescripcion(result.informacion_general.descripcion);
      if (result.informacion_general.tipo_de_proyecto) setTipoProyecto(result.informacion_general.tipo_de_proyecto);
      // No auto-poblamos la sucursal con el proveedor de la factura de compra ya que son conceptos distintos
      // if (result.informacion_general.proveedor) setProveedor(result.informacion_general.proveedor);

      // Poblar partidas
      const partidasUI: PartidaEditable[] = result.partidas_o_productos.map((p, idx) => ({
        id: `ia_${Date.now()}_${idx}`,
        descripcion: p.descripcion || '',
        cantidad: String(p.cantidad || 1),
        unidad: p.unidad || 'PZA',
        precio_unitario_venta: String(p.precio_unitario_venta || 0),
        costo_unitario_proveedor: String(p.costo_unitario_proveedor || 0),
      }));

      // Validar factura duplicada
      let warningMsg = '';
      if (result.informacion_general.factura_o_referencia) {
        try {
          const { data: existing } = await supabase
            .from('ventas')
            .select('id')
            .ilike('factura_referencia', result.informacion_general.factura_o_referencia.trim())
            .maybeSingle();
          if (existing) {
            warningMsg = `\n\n⚠️ ADVERTENCIA: La orden/factura "${result.informacion_general.factura_o_referencia}" ya existe registrada en el sistema. Verifica que no la estés duplicando.`;
          }
        } catch (e) {
          console.warn('Error checking duplicate reference:', e);
        }
      }

      setPartidas(partidasUI);
      setScanSuccess(true);
      setCurrentStep(2);
      showAlert(
        warningMsg ? '⚠️ Posible Duplicado' : 'Costos Extraídos',
        `La IA extrajo ${partidasUI.length} partida(s) con sus costos de compra. Ahora ingresa los precios de venta para calcular márgenes.${warningMsg}`
      );
    } catch (err: any) {
      showAlert('Error de IA', err.message || 'No se pudo procesar la factura.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // === Partidas CRUD ===
  const addPartida = () => {
    setPartidas(prev => [
      ...prev,
      {
        id: `manual_${Date.now()}`,
        descripcion: '',
        cantidad: '1',
        unidad: 'PZA',
        precio_unitario_venta: '0',
        costo_unitario_proveedor: '0',
      },
    ]);
  };

  const removePartida = (id: string) => {
    setPartidas(prev => prev.filter(p => p.id !== id));
  };

  const updatePartida = (id: string, field: keyof PartidaEditable, value: string) => {
    setPartidas(prev =>
      prev.map(p => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  // === Guardar Venta ===
  const handleSaveVenta = async () => {
    if (!currentUser) return;

    // Validaciones
    if (!fecha.trim()) {
      showAlert('Validación', 'Por favor ingresa la fecha de la factura.');
      return;
    }
    if (!cliente.trim()) {
      showAlert('Validación', 'Por favor ingresa el nombre del cliente.');
      return;
    }
    if (!sucursal || !sucursal.trim()) {
      showAlert('Validación', 'Por favor selecciona la sucursal del cliente.');
      return;
    }
    if (partidas.length === 0) {
      showAlert('Validación', 'Agrega al menos una partida o producto.');
      return;
    }

    const hasEmptyDescriptions = partidas.some(p => !p.descripcion.trim());
    if (hasEmptyDescriptions) {
      showAlert('Validación', 'Todas las partidas deben tener una descripción.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Subir factura a Storage si hay base64
      let facturaPublicUrl: string | null = selectedVenta?.factura_url || null;
      if (fileBase64) {
        const ext = fileMimeType.includes('pdf') ? 'pdf' : 'jpg';
        const contentType = fileMimeType.includes('pdf') ? 'application/pdf' : 'image/jpeg';
        const fileName = getTimestampFileName(currentUser.id, ext);
        const arrayBuffer = base64ToArrayBuffer(fileBase64);

        const { error: uploadError } = await supabase.storage
          .from('tickets')
          .upload(fileName, arrayBuffer, { contentType, upsert: true });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          // No bloqueamos el guardado por error de subida
        } else {
          const { data: urlData } = supabase.storage.from('tickets').getPublicUrl(fileName);
          facturaPublicUrl = urlData.publicUrl;
        }
      }

      // Payload común
      const ventaPayload = {
        registrado_por: currentUser.id,
        fecha: fecha,
        cliente: cliente,
        sucursal: sucursal || null,
        factura_referencia: facturaReferencia.trim() || null,
        tipo_proyecto: tipoProyecto || null,
        proveedor: proveedor.trim() || null,
        precio_total_facturado: calculatedTotals.precioTotal,
        costo_total: calculatedTotals.costoTotal,
        utilidad_bruta: calculatedTotals.utilidad,
        margen_porcentual: calculatedTotals.margen,
        factura_url: facturaPublicUrl,
        notas: notas.trim() || null,
        descripcion: descripcion.trim() || null,
        agregar_iva: agregarIva,
        cotizacion_id: cotizacionIdOrigen || null,
      };

      let activeVentaId = '';

      if (editingVentaId) {
        // ACTUALIZAR VENTA EXISTENTE
        const { error: updateError } = await supabase
          .from('ventas')
          .update(ventaPayload)
          .eq('id', editingVentaId);

        if (updateError) throw updateError;
        activeVentaId = editingVentaId;

        // Eliminar partidas anteriores
        const { error: deletePartidasError } = await supabase
          .from('ventas_partidas')
          .delete()
          .eq('venta_id', editingVentaId);

        if (deletePartidasError) throw deletePartidasError;
      } else {
        // Generar folio secuencial
        const { data: lastVenta } = await supabase
          .from('ventas')
          .select('folio')
          .not('folio', 'is', null)
          .ilike('folio', 'A4%')
          .order('folio', { ascending: false })
          .limit(1);

        let nextFolio = 'A4000';
        if (lastVenta && lastVenta.length > 0 && lastVenta[0].folio) {
          const lastNumStr = lastVenta[0].folio.substring(2);
          const lastNum = parseInt(lastNumStr, 10);
          if (!isNaN(lastNum)) {
            nextFolio = `A${lastNum + 1}`;
          }
        }

        const ventaPayloadWithFolio = { ...ventaPayload, folio: nextFolio };

        // INSERTAR NUEVA VENTA
        const { data: ventaData, error: ventaError } = await supabase
          .from('ventas')
          .insert([ventaPayloadWithFolio])
          .select()
          .single();

        if (ventaError) throw ventaError;
        activeVentaId = ventaData.id;
      }

      // Insertar partidas nuevas/editadas
      const partidasPayload = partidas.map(p => {
        const cant = Number(p.cantidad) || 0;
        const precioUV = Number(p.precio_unitario_venta) || 0;
        const costoUP = Number(p.costo_unitario_proveedor) || 0;

        return {
          venta_id: activeVentaId,
          descripcion: p.descripcion.trim(),
          cantidad: cant,
          unidad: p.unidad || 'PZA',
          precio_unitario_venta: precioUV,
          costo_unitario_proveedor: costoUP,
          precio_total_venta: Math.round(cant * precioUV * 100) / 100,
          costo_total_proveedor: Math.round(cant * costoUP * 100) / 100,
        };
      });

      const { error: partidasError } = await supabase
        .from('ventas_partidas')
        .insert(partidasPayload);

      if (partidasError) throw partidasError;

      // Recalcular y sincronizar totales con gastos en la base de datos
      await recalculateVentaTotals(activeVentaId);

      if (editingVentaId) {
        showAlert('Éxito', 'La venta fue actualizada correctamente.');
        cancelEditing();
        setActiveTab('historial');
        loadHistorial();
      } else {
        showAlert('Éxito', 'La venta fue registrada correctamente.');
        resetForm();
      }
    } catch (err: any) {
      showAlert('Error al guardar', err.message || 'No se pudo registrar/actualizar la venta.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setCurrentStep(1);
    setFileUri(null);
    setFileBase64(null);
    setFileMimeType('image/jpeg');
    setScanSuccess(false);
    setFecha('');
    setCliente('');
    setSucursal('');
    setFacturaReferencia('');
    setDescripcion('');
    setAgregarIva(false);
    setTipoProyecto('');
    setProveedor('');
    setNotas('');
    setPartidas([]);
    setSelectedVenta(null);
    setSelectedVentaPartidas([]);
    setEditingVentaId(null);
    setCotizacionIdOrigen(null);
  };

  // === Navigation between steps ===
  const nextStep = () => {
    if (currentStep === 1) {
      if (!fileUri && partidas.length === 0) {
        showAlert('Factura requerida', 'Sube una factura o agrega partidas manualmente.');
        return;
      }
    }
    if (currentStep === 2) {
      if (!fecha.trim()) {
        showAlert('Validación', 'Ingresa la fecha de la factura.');
        return;
      }
      if (!cliente.trim()) {
        showAlert('Validación', 'Ingresa el nombre del cliente.');
        return;
      }
      if (partidas.length === 0) {
        showAlert('Validación', 'Agrega al menos una partida.');
        return;
      }
    }
    setCurrentStep(prev => Math.min(prev + 1, 3));
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  // === Timbrado CFDI con Finkok (Menú de Pre-Emisión y Edición) ===
  const handleOpenTimbradoModal = async (ventaToStamp: Venta) => {
    setTimbrandoVenta(ventaToStamp);

    // Buscar cliente en catálogo
    const clienteData = clientes.find(c => c.nombre?.trim().toLowerCase() === ventaToStamp.cliente?.trim().toLowerCase());

    setCfdiClienteNombre(clienteData?.razon_social || clienteData?.nombre || ventaToStamp.cliente || 'PUBLICO EN GENERAL');
    setCfdiClienteRfc(clienteData?.rfc || 'XAXX010101000');
    setCfdiClienteCp(clienteData?.codigo_postal || '31110');
    setCfdiClienteRegimen(clienteData?.regimen_fiscal || '601');
    setCfdiClienteUso(clienteData?.uso_cfdi || 'G03');

    setCfdiFormaPago('03'); // Transferencia por defecto
    setCfdiMetodoPago('PUE');
    setCfdiSerie('A');
    setCfdiFolio(String(ventaToStamp.id || Date.now()).slice(-6));

    // Cargar partidas de la venta
    try {
      let partidasList = selectedVentaPartidas;
      if (partidasList.length === 0 || selectedVenta?.id !== ventaToStamp.id) {
        const { data } = await supabase.from('ventas_partidas').select('*').eq('venta_id', ventaToStamp.id);
        partidasList = data || [];
      }

      if (partidasList.length > 0) {
        setCfdiPartidas(partidasList.map(p => ({
          id: String(p.id || Math.random()),
          descripcion: p.descripcion || 'Producto / Servicio',
          cantidad: String(p.cantidad || 1),
          precio_unitario_venta: String(p.precio_unitario_venta || 0),
          clave_sat: (p as any).clave_sat || '01010101',
          clave_unidad: (p as any).clave_unidad || 'H87',
          unidad: p.unidad || 'Pieza'
        })));
      } else {
        setCfdiPartidas([{
          id: '1',
          descripcion: ventaToStamp.descripcion || 'Venta de productos / servicios',
          cantidad: '1',
          precio_unitario_venta: String(ventaToStamp.precio_total_facturado || 0),
          clave_sat: '01010101',
          clave_unidad: 'H87',
          unidad: 'Pieza'
        }]);
      }
    } catch (err) {
      setCfdiPartidas([{
        id: '1',
        descripcion: ventaToStamp.descripcion || 'Venta de productos / servicios',
        cantidad: '1',
        precio_unitario_venta: String(ventaToStamp.precio_total_facturado || 0),
        clave_sat: '01010101',
        clave_unidad: 'H87',
        unidad: 'Pieza'
      }]);
    }

    setIsTimbradoModalVisible(true);
  };

  const handleAddCfdiPartida = () => {
    setCfdiPartidas(prev => [
      ...prev,
      {
        id: Date.now().toString(),
        descripcion: '',
        cantidad: '1',
        precio_unitario_venta: '0',
        clave_sat: '01010101',
        clave_unidad: 'H87',
        unidad: 'Pieza'
      }
    ]);
  };

  const handleUpdateCfdiPartida = (id: string, field: string, val: string) => {
    setCfdiPartidas(prev => prev.map(p => p.id === id ? { ...p, [field]: val } : p));
  };

  const handleRemoveCfdiPartida = (id: string) => {
    if (cfdiPartidas.length <= 1) {
      showAlert('Aviso', 'Debes mantener al menos una partida para facturar.');
      return;
    }
    setCfdiPartidas(prev => prev.filter(p => p.id !== id));
  };

  const handleExecuteTimbrado = async () => {
    if (!timbrandoVenta) return;

    if (!cfdiClienteNombre.trim()) {
      showAlert('Validación', 'Ingresa la Razón Social / Nombre del receptor.');
      return;
    }
    if (!cfdiClienteRfc.trim()) {
      showAlert('Validación', 'Ingresa el RFC del receptor.');
      return;
    }
    if (!cfdiClienteCp.trim()) {
      showAlert('Validación', 'Ingresa el Código Postal del receptor (Domicilio Fiscal en CFDI 4.0).');
      return;
    }
    if (cfdiPartidas.length === 0) {
      showAlert('Validación', 'Agrega al menos una partida a facturar.');
      return;
    }

    setIsSubmittingTimbrado(true);
    try {
      const formattedPartidas = cfdiPartidas.map(p => ({
        id: p.id,
        descripcion: p.descripcion || 'Producto / Servicio',
        cantidad: parseFloat(p.cantidad) || 1,
        precio_unitario_venta: parseFloat(p.precio_unitario_venta) || 0,
        clave_sat: p.clave_sat || '01010101',
        clave_unidad: p.clave_unidad || 'H87',
        unidad: p.unidad || 'Pieza'
      }));

      const payload = {
        venta_id: timbrandoVenta.id,
        custom_receptor: {
          nombre: cfdiClienteNombre.toUpperCase().trim(),
          razon_social: cfdiClienteNombre.toUpperCase().trim(),
          rfc: cfdiClienteRfc.toUpperCase().trim(),
          codigo_postal: cfdiClienteCp.trim(),
          regimen_fiscal: cfdiClienteRegimen,
          uso_cfdi: cfdiClienteUso
        },
        custom_condiciones: {
          metodo_pago: cfdiFormaPago,
          forma_pago: cfdiFormaPago,
          metodo_pago_cfdi: cfdiMetodoPago,
          serie: cfdiSerie.trim(),
          folio: cfdiFolio.trim()
        },
        custom_partidas: formattedPartidas
      };

      const { data, error } = await supabase.functions.invoke('facturar-venta', {
        body: payload
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      showAlert('Éxito', `Factura timbrada exitosamente ante el SAT con Finkok.\n\nFolio Fiscal (UUID):\n${data.cfdi_uuid}`);
      setIsTimbradoModalVisible(false);
      if (selectedVenta?.id === timbrandoVenta.id) {
        setSelectedVenta(prev => prev ? {
          ...prev,
          cfdi_uuid: data.cfdi_uuid,
          cfdi_estado: 'TIMBRADA',
          cfdi_xml_url: data.xml_url
        } : null);
      }
      loadHistorial();
    } catch (err: any) {
      console.error('Error al timbrar con Finkok:', err);
      let errorMsg = err.message || 'Error desconocido al timbrar.';
      if (err.context) {
        try {
          if (typeof err.context.json === 'function') {
            const body = await err.context.json();
            if (body?.error) errorMsg = body.error;
            else if (body?.message) errorMsg = body.message;
          } else if (typeof err.context.text === 'function') {
            const txt = await err.context.text();
            if (txt) errorMsg = txt;
          }
        } catch (e) {
          try {
            if (typeof err.context.text === 'function') {
              const txt = await err.context.text();
              if (txt) errorMsg = txt;
            }
          } catch (e2) {}
        }
      }
      showAlert('Error al timbrar con Finkok', errorMsg);
    } finally {
      setIsSubmittingTimbrado(false);
    }
  };

  const handleTimbrarFactura = async (ventaToStamp?: Venta) => {
    const targetVenta = ventaToStamp || selectedVenta;
    if (!targetVenta) return;
    await handleOpenTimbradoModal(targetVenta);
  };

  const handleViewFacturaPDF = async () => {
    if (!selectedVenta) return;
    setIsSubmitting(true);
    try {
      const uuid = selectedVenta.cfdi_uuid;
      if (!uuid) throw new Error('La venta no tiene Folio Fiscal (UUID)');

      // 1. Descargar el XML desde Supabase Storage
      const { data: fileBlob, error: downloadError } = await supabase.storage
        .from('facturas')
        .download(`${uuid}.xml`);

      let xmlText = '';
      if (!downloadError && fileBlob) {
        xmlText = await fileBlob.text();
      } else {
        // Fallback: si falla el download directo, intentar vía URL pública si existe
        if (selectedVenta.cfdi_xml_url && selectedVenta.cfdi_xml_url.startsWith('http')) {
          const resp = await fetch(selectedVenta.cfdi_xml_url);
          if (resp.ok) xmlText = await resp.text();
        }
      }

      if (!xmlText) {
        throw new Error('No se pudo recuperar el archivo XML timbrado desde Supabase Storage.');
      }

      // 2. Parsear el XML con timbres SAT
      const isCanceled = selectedVenta.cfdi_estado === 'CANCELADA';
      const facturaData = parseCFDIXML(xmlText, isCanceled ? 'canceled' : 'valid');

      // 3. Exportar representación impresa PDF
      await exportarFacturaOdooPDF(selectedVenta, facturaData, 'download');
    } catch (err: any) {
      console.error('Error al generar PDF CFDI:', err);
      showAlert('Error al generar PDF', err.message || 'No se pudo generar el documento PDF.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadFacturaXML = async () => {
    if (!selectedVenta) return;
    setIsSubmitting(true);
    try {
      const uuid = selectedVenta.cfdi_uuid;
      if (!uuid) throw new Error('La venta no tiene Folio Fiscal (UUID)');

      const cliente = (selectedVenta.cliente || 'Cliente').replace(/[^a-z0-9]/gi, '_').substring(0, 20);
      const folio = uuid.split('-')[0];
      const fileName = `Factura_${cliente}_${folio}.xml`;

      const { data: fileBlob, error: downloadError } = await supabase.storage
        .from('facturas')
        .download(`${uuid}.xml`);

      let xmlText = '';
      if (!downloadError && fileBlob) {
        xmlText = await fileBlob.text();
      } else if (selectedVenta.cfdi_xml_url && selectedVenta.cfdi_xml_url.startsWith('http')) {
        const resp = await fetch(selectedVenta.cfdi_xml_url);
        if (resp.ok) xmlText = await resp.text();
      }

      if (!xmlText) {
        throw new Error('No se pudo descargar el archivo XML.');
      }

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
          await shareAsync(fileUri, {
            mimeType: 'application/xml',
            dialogTitle: 'Compartir XML CFDI 4.0'
          });
        } else {
          showAlert('Éxito', `XML guardado en ${fileUri}`);
        }
      }
    } catch (err: any) {
      console.error('Error al descargar XML:', err);
      showAlert('Error al descargar XML', err.message || 'No se pudo descargar el archivo XML.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelarFactura = async () => {
    if (!selectedVenta) return;

    const performCancel = async () => {
      setIsSubmitting(true);
      try {
        const { data, error } = await supabase.functions.invoke('cancelar-factura', {
          body: { venta_id: selectedVenta.id, motivo: '02' }
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        showAlert('Éxito', 'La factura ha sido cancelada correctamente ante el SAT.');
        setIsDetailModalVisible(false);
        loadHistorial();
      } catch (err: any) {
        console.error('Error cancelando factura:', err);
        showAlert('Error al cancelar', err.message || 'Ocurrió un error al intentar cancelar la factura ante el SAT.');
      } finally {
        setIsSubmitting(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('¿Estás seguro de que deseas cancelar esta factura ante el SAT? Esta acción no se puede deshacer.')) {
        await performCancel();
      }
    } else {
      Alert.alert(
        'Cancelar Factura ante el SAT',
        '¿Estás seguro de que deseas cancelar esta factura ante el SAT? Esta acción no se puede deshacer.',
        [
          { text: 'No, regresar', style: 'cancel' },
          { 
            text: 'Sí, cancelar', 
            style: 'destructive',
            onPress: performCancel
          }
        ]
      );
    }
  };

  // ===========================
  // RENDER
  // ===========================

  const renderStep1 = () => (
    <View style={{ gap: Spacing.three }}>
      {/* Instrucciones */}
      <View style={[styles.infoCard, { backgroundColor: themeColors.accent + '10', borderColor: themeColors.accent + '30' }]}>
        <Ionicons name="information-circle" size={20} color={themeColors.accent} />
        <Text style={[styles.infoText, { color: themeColors.textSecondary }]}>
          Sube la factura de COMPRA del proveedor (imagen o PDF). La IA extraerá los productos y costos automáticamente. Después tú ingresarás los precios de venta para calcular márgenes.
        </Text>
      </View>

      {/* Preview */}
      {fileUri && (
        <View style={[styles.previewContainer, { borderColor: themeColors.border }]}>
          {fileMimeType.includes('pdf') ? (
            <View style={[styles.pdfPlaceholder, { backgroundColor: themeColors.backgroundElement }]}>
              <Ionicons name="document-text" size={48} color={themeColors.accent} />
              <Text style={[styles.pdfLabel, { color: themeColors.text }]}>PDF Seleccionado</Text>
            </View>
          ) : (
            <Image source={{ uri: fileUri }} style={styles.previewImage} resizeMode="contain" />
          )}

          {scanSuccess && (
            <View style={[styles.scanBadge, { backgroundColor: themeColors.success }]}>
              <Ionicons name="checkmark-circle" size={16} color="#fff" />
              <Text style={styles.scanBadgeText}>Analizado</Text>
            </View>
          )}
        </View>
      )}

      {/* Botones de captura */}
      <View style={styles.captureRow}>
        <TouchableOpacity
          onPress={handleCapturePhoto}
          style={[styles.captureBtn, { backgroundColor: themeColors.accent }]}
        >
          <Ionicons name="camera" size={22} color="#fff" />
          <Text style={styles.captureBtnText}>Cámara</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSelectGallery}
          style={[styles.captureBtn, { backgroundColor: themeColors.secondary }]}
        >
          <Ionicons name="images" size={22} color="#fff" />
          <Text style={styles.captureBtnText}>Galería</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSelectDocument}
          style={[styles.captureBtn, { backgroundColor: themeColors.actionRequired || '#7b1fa2' }]}
        >
          <Ionicons name="document-attach" size={22} color="#fff" />
          <Text style={styles.captureBtnText}>Archivo</Text>
        </TouchableOpacity>
      </View>

      {/* Botón Analizar con IA */}
      {fileBase64 && (
        <TouchableOpacity
          onPress={handleAnalyzeWithIA}
          disabled={isAnalyzing}
          style={[
            styles.analyzeBtn,
            {
              backgroundColor: isAnalyzing ? themeColors.border : themeColors.success,
              opacity: isAnalyzing ? 0.7 : 1,
            },
          ]}
        >
          {isAnalyzing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="sparkles" size={22} color="#fff" />
          )}
          <Text style={styles.analyzeBtnText}>
            {isAnalyzing ? 'Analizando factura de compra...' : 'Extraer Costos con IA'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Opción manual */}
      <TouchableOpacity
        onPress={() => {
          if (partidas.length === 0) addPartida();
          setCurrentStep(2);
        }}
        style={[styles.skipLink]}
      >
        <Text style={[styles.skipLinkText, { color: themeColors.accent }]}>
          O ingresar datos manualmente →
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderStep2 = () => (
    <View style={{ gap: Spacing.three }}>
      {/* Datos Generales */}
      <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Información General</Text>

      <>
        {Platform.OS === 'web' ? (
          <View style={{ marginBottom: Spacing.two }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: themeColors.text, marginBottom: Spacing.one }}>Fecha de la Venta *</Text>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: themeColors.backgroundElement,
              borderColor: themeColors.border,
              borderWidth: 1,
              borderRadius: BorderRadius.medium,
              height: 50,
              paddingHorizontal: Spacing.three,
            }}>
              <Ionicons name="calendar-outline" size={20} color={themeColors.textSecondary} style={{ marginRight: Spacing.two }} />
              
              {Platform.OS === 'web' && createElement('style', null, `
                .custom-web-date::-webkit-calendar-picker-indicator {
                  background: transparent;
                  bottom: 0;
                  color: transparent;
                  cursor: pointer;
                  height: auto;
                  left: 0;
                  position: absolute;
                  right: 0;
                  top: 0;
                  width: auto;
                }
              `)}

              {createElement('input', {
                type: 'date',
                className: 'custom-web-date',
                value: fecha,
                onChange: (e: any) => setFecha(e.target.value),
                style: {
                  flex: 1,
                  backgroundColor: 'transparent',
                  color: themeColors.text,
                  fontSize: '15px',
                  border: 'none',
                  outline: 'none',
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  position: 'relative'
                }
              })}
            </View>
          </View>
        ) : (
          <>
            <TouchableOpacity onPress={() => setShowDatePicker(true)} activeOpacity={0.7}>
              <View pointerEvents="none">
                <CustomInput
                  label="Fecha de la Venta *"
                  placeholder="Selecciona la fecha"
                  value={fecha}
                  editable={false}
                  iconName="calendar-outline"
                />
              </View>
            </TouchableOpacity>

            {showDatePicker && (
              <View style={{
                backgroundColor: themeColors.backgroundElement,
                borderRadius: BorderRadius.medium,
                padding: Spacing.two,
                borderWidth: 1,
                borderColor: themeColors.border,
                marginTop: -Spacing.two,
                marginBottom: Spacing.two,
              }}>
                <DateTimePicker
                  value={dateValue}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onValueChange={(event: any, selectedDate?: Date) => {
                    if (Platform.OS === 'android') {
                      setShowDatePicker(false);
                    }
                    if (selectedDate) {
                      setDateValue(selectedDate);
                      const dd = String(selectedDate.getDate()).padStart(2, '0');
                      const mm = String(selectedDate.getMonth() + 1).padStart(2, '0');
                      const yyyy = selectedDate.getFullYear();
                      setFecha(`${yyyy}-${mm}-${dd}`);
                    }
                  }}
                  onDismiss={() => setShowDatePicker(false)}
                  maximumDate={new Date()}
                />
                {Platform.OS === 'ios' && (
                  <CustomButton
                    title="Confirmar Fecha"
                    onPress={() => setShowDatePicker(false)}
                    style={{ marginTop: Spacing.one }}
                  />
                )}
              </View>
            )}
          </>
        )}
      </>

      {/* Selector de Cliente Desplegable */}
      {(() => {
        const currentCliente = clientes.find(c => c.nombre === cliente);
        const sucursales = currentCliente ? sucursalesCliente.filter(s => s.cliente_id === currentCliente.id) : [];

        return (
          <View key="cliente-selector" style={{ zIndex: 3000, width: '100%' }}>
            <View style={{ marginBottom: Spacing.three }}>
              <Text style={[styles.label, { color: themeColors.textSecondary }]}>
                Cliente <Text style={{ color: themeColors.danger }}>*</Text>
              </Text>
              <TouchableOpacity
                style={[styles.customDropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                onPress={() => {
                  Keyboard.dismiss();
                  setShowCliDropdown(!showCliDropdown);
                }}
              >
                <Text style={{ color: cliente ? themeColors.text : themeColors.textSecondary }}>
                  {cliente || 'Selecciona un cliente'}
                </Text>
                <Ionicons name={showCliDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.textSecondary} />
              </TouchableOpacity>
              {showCliDropdown && (
                <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', zIndex: 1000 }}>
                  <View style={[styles.customDropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                    <CustomInput
                      placeholder="Buscar o agregar cliente..."
                      value={clienteSearch}
                      onChangeText={setClienteSearch}
                      iconName="search-outline"
                      style={{ margin: Spacing.one, height: 40 }}
                    />
                    <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 250, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                      {clienteSearch.trim().length > 0 && !clientes.some(c => c.nombre && c.nombre.toLowerCase() === clienteSearch.trim().toLowerCase()) && (
                        <TouchableOpacity
                          style={[styles.customDropdownItem, { backgroundColor: themeColors.accent + '15', flexDirection: 'row', alignItems: 'center', gap: Spacing.one }]}
                          onPress={() => handleAddNewCliente(clienteSearch)}
                        >
                          <Ionicons name="add-circle-outline" size={24} color={themeColors.accent} />
                          <Text style={{ color: themeColors.accent, fontWeight: '600', fontSize: 14 }}>
                            {`Agregar "${clienteSearch.trim()}"`}
                          </Text>
                        </TouchableOpacity>
                      )}
                      {clientes
                        .filter(cli => cli.nombre && cli.nombre.toLowerCase().includes(clienteSearch.toLowerCase()))
                        .map((cli, index, array) => (
                          <TouchableOpacity
                            key={cli.id}
                            style={[
                              styles.customDropdownItem,
                              index === array.length - 1 && { borderBottomWidth: 0 },
                              { flexDirection: 'row', alignItems: 'center', gap: Spacing.one }
                            ]}
                            onPress={() => {
                              setCliente(cli.nombre);
                              setSucursal('');
                              setClienteSearch('');
                              setShowCliDropdown(false);
                            }}
                          >
                            <Ionicons name="person-circle-outline" size={24} color={themeColors.primary} />
                            <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 14 }}>{cli.nombre}</Text>
                          </TouchableOpacity>
                        ))}
                    </ScrollView>
                  </View>
                </Pressable>
              )}
            </View>

            <View style={{ zIndex: 2000, marginBottom: Spacing.three }}>
              <Text style={[styles.label, { color: themeColors.textSecondary }]}>
                Sucursal <Text style={{ color: themeColors.danger }}>*</Text>
              </Text>
              <TouchableOpacity
                style={[styles.customDropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, opacity: !cliente ? 0.5 : 1 }]}
                disabled={!cliente}
                onPress={() => {
                  Keyboard.dismiss();
                  setShowSucursalDropdown(!showSucursalDropdown);
                }}
              >
                <Text style={{ color: sucursal ? themeColors.text : themeColors.textSecondary }}>
                  {sucursal || (cliente ? 'Selecciona una sucursal' : 'Selecciona un cliente primero')}
                </Text>
                <Ionicons name={showSucursalDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.textSecondary} />
              </TouchableOpacity>
              {showSucursalDropdown && (
                <View style={{ width: '100%', zIndex: 1000 }}>
                  <View style={[styles.customDropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                    <CustomInput
                      placeholder="Buscar sucursal..."
                      value={sucursalSearch}
                      onChangeText={setSucursalSearch}
                      iconName="search-outline"
                      style={{ margin: Spacing.one, height: 40 }}
                    />
                    <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                      {(() => {
                        const currentCliente = clientes.find(c => c.nombre?.trim().toLowerCase() === cliente?.trim().toLowerCase());
                        const filteredSucursales = currentCliente ? sucursales.filter(s => s.cliente_id === currentCliente.id && s.nombre.toLowerCase().includes(sucursalSearch.toLowerCase())) : [];
                        const existsExact = currentCliente && sucursales.some(s => s.cliente_id === currentCliente.id && s.nombre.trim().toLowerCase() === sucursalSearch.trim().toLowerCase());

                        return (
                          <>
                            {sucursalSearch.trim().length > 0 && !existsExact && currentCliente && (
                              <TouchableOpacity
                                style={[styles.customDropdownItem, { backgroundColor: themeColors.accent + '15', flexDirection: 'row', alignItems: 'center', gap: Spacing.one }]}
                                onPress={() => handleAddNewSucursal(sucursalSearch)}
                              >
                                <Ionicons name="add-circle-outline" size={24} color={themeColors.accent} />
                                <View style={{ flex: 1 }}>
                                  <Text style={{ color: themeColors.accent, fontWeight: '700', fontSize: 13 }}>
                                    {`➕ Agregar "${sucursalSearch.trim().toUpperCase()}"`}
                                  </Text>
                                  <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>
                                    {`Vincular a cliente: ${currentCliente.nombre}`}
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            )}
                            
                            {filteredSucursales.length === 0 && (!sucursalSearch.trim() || existsExact) && (
                              <Text style={{ padding: Spacing.two, color: themeColors.textSecondary }}>No hay sucursales registradas.</Text>
                            )}
                            
                            {filteredSucursales.map((suc, index, array) => (
                              <TouchableOpacity
                                key={suc.id}
                                style={[
                                  styles.customDropdownItem,
                                  index === array.length - 1 && { borderBottomWidth: 0 },
                                  { flexDirection: 'row', alignItems: 'center', gap: Spacing.one }
                                ]}
                                onPress={() => {
                                  setSucursal(suc.nombre);
                                  setShowSucursalDropdown(false);
                                }}
                              >
                                <Ionicons name="business-outline" size={24} color={themeColors.primary} />
                                <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 14 }}>{suc.nombre}</Text>
                              </TouchableOpacity>
                            ))}
                          </>
                        );
                      })()}
                    </ScrollView>
                  </View>
                </View>
              )}
            </View>
          </View>
        );
      })()}

      <CustomInput
        label="PO / Referencia"
        value={facturaReferencia}
        onChangeText={setFacturaReferencia}
        placeholder="No. de PO o referencia"
      />

      <CustomInput
        label="Descripción General"
        value={descripcion}
        onChangeText={setDescripcion}
        placeholder="Concepto principal de la venta"
      />

      <View style={{ marginBottom: Spacing.two }}>
        <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>¿Agregar IVA? (Sumar 16%)</Text>
        <View style={{ flexDirection: 'row', gap: Spacing.one }}>
          <TouchableOpacity
            style={[
              { flex: 1, padding: Spacing.one, borderRadius: BorderRadius.medium, borderWidth: 1, alignItems: 'center' },
              agregarIva 
                ? { backgroundColor: themeColors.accent, borderColor: themeColors.accent }
                : { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }
            ]}
            onPress={() => setAgregarIva(true)}
          >
            <Text style={{ color: agregarIva ? '#ffffff' : themeColors.textSecondary, fontWeight: '600' }}>Sí</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              { flex: 1, padding: Spacing.one, borderRadius: BorderRadius.medium, borderWidth: 1, alignItems: 'center' },
              !agregarIva 
                ? { backgroundColor: themeColors.accent, borderColor: themeColors.accent }
                : { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }
            ]}
            onPress={() => setAgregarIva(false)}
          >
            <Text style={{ color: !agregarIva ? '#ffffff' : themeColors.textSecondary, fontWeight: '600' }}>No</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tipo de Proyecto */}
      <View>
        <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Tipo de Proyecto</Text>
        <TouchableOpacity
          onPress={() => setShowTipoDropdown(!showTipoDropdown)}
          style={[styles.dropdownBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
        >
          <Text style={{ color: tipoProyecto ? themeColors.text : themeColors.textSecondary, flex: 1 }}>
            {tipoProyecto || 'Seleccionar tipo...'}
          </Text>
          <Ionicons name={showTipoDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.textSecondary} />
        </TouchableOpacity>
        {showTipoDropdown && (
          <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            {TIPOS_PROYECTO.map(tipo => (
              <TouchableOpacity
                key={tipo}
                onPress={() => {
                  setTipoProyecto(tipo);
                  setShowTipoDropdown(false);
                }}
                style={[styles.dropdownItem, tipoProyecto === tipo && { backgroundColor: themeColors.accent + '20' }]}
              >
                <Text style={{ color: themeColors.text }}>{tipo}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <CustomInput
        label="Notas adicionales"
        value={notas}
        onChangeText={setNotas}
        placeholder="Observaciones, notas internas..."
        multiline
      />

      {/* ---- PARTIDAS ---- */}
      <View style={styles.partidasHeader}>
        <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 0 }]}>
          Partidas ({partidas.length})
        </Text>
        <TouchableOpacity onPress={addPartida} style={[styles.addPartidaBtn, { backgroundColor: themeColors.accent }]}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addPartidaBtnText}>Agregar</Text>
        </TouchableOpacity>
      </View>

      {partidas.length === 0 ? (
        <View style={[styles.emptyPartidas, { borderColor: themeColors.border }]}>
          <Ionicons name="receipt-outline" size={32} color={themeColors.textSecondary} />
          <Text style={{ color: themeColors.textSecondary, textAlign: 'center', fontSize: 13 }}>
            No hay partidas. Escanea la factura de compra con IA o agrega manualmente.
          </Text>
        </View>
      ) : (
        partidas.map((partida, index) => (
          <View
            key={partida.id}
            style={[styles.partidaCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
          >
            <View style={styles.partidaCardHeader}>
              <Text style={[styles.partidaIndex, { color: themeColors.accent }]}>#{index + 1}</Text>
              <TouchableOpacity onPress={() => removePartida(partida.id)}>
                <Ionicons name="trash-outline" size={20} color={themeColors.danger} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.partidaInput, { color: themeColors.text, borderColor: themeColors.textSecondary + '50', backgroundColor: themeColors.background }]}
              value={partida.descripcion}
              onChangeText={val => updatePartida(partida.id, 'descripcion', val)}
              placeholder="Descripción del producto/servicio"
              placeholderTextColor={themeColors.textSecondary}
            />

            <View style={styles.partidaRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.partidaFieldLabel, { color: themeColors.textSecondary }]}>Cantidad</Text>
                <TextInput
                  style={[styles.partidaInputSmall, { color: themeColors.text, borderColor: themeColors.textSecondary + '50', backgroundColor: themeColors.background }]}
                  value={partida.cantidad}
                  onChangeText={val => updatePartida(partida.id, 'cantidad', val)}
                  keyboardType="numeric"
                  placeholder="1"
                  placeholderTextColor={themeColors.textSecondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.partidaFieldLabel, { color: themeColors.textSecondary }]}>Unidad</Text>
                <TextInput
                  style={[styles.partidaInputSmall, { color: themeColors.text, borderColor: themeColors.textSecondary + '50', backgroundColor: themeColors.background }]}
                  value={partida.unidad}
                  onChangeText={val => updatePartida(partida.id, 'unidad', val)}
                  placeholder="PZA"
                  placeholderTextColor={themeColors.textSecondary}
                />
              </View>
            </View>

            <View style={styles.partidaRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.partidaFieldLabel, { color: themeColors.success }]}>💰 Precio Venta</Text>
                <TextInput
                  style={[styles.partidaInputSmall, { color: themeColors.text, borderColor: themeColors.success + '80', backgroundColor: themeColors.background }]}
                  value={partida.precio_unitario_venta}
                  onChangeText={val => updatePartida(partida.id, 'precio_unitario_venta', val)}
                  keyboardType="numeric"
                  placeholder="0.00"
                  placeholderTextColor={themeColors.textSecondary}
                />
              </View>
            </View>

            {/* Subtotal por partida */}
            <View style={[styles.partidaSubtotal, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
              <Text style={[styles.partidaSubtotalText, { color: themeColors.textSecondary }]}>
                Subtotal Venta: {formatCurrency((Number(partida.cantidad) || 0) * (Number(partida.precio_unitario_venta) || 0))}
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );

  const renderStep3 = () => {
    const isProfit = calculatedTotals.utilidad >= 0;
    const margenPercent = (calculatedTotals.margen * 100).toFixed(1);

    return (
      <View style={{ gap: Spacing.three }}>
        <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Resumen de la Venta</Text>

        {/* Datos generales summary */}
        <View style={[styles.summaryBlock, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]}>Fecha:</Text>
            <Text style={[styles.summaryValue, { color: themeColors.text }]}>{fecha}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]}>Cliente:</Text>
            <Text style={[styles.summaryValue, { color: themeColors.text }]}>{cliente}</Text>
          </View>
          {facturaReferencia ? (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]}>PO:</Text>
              <Text style={[styles.summaryValue, { color: themeColors.text }]}>{facturaReferencia}</Text>
            </View>
          ) : null}
          {descripcion ? (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]}>Descripción:</Text>
              <Text style={[styles.summaryValue, { color: themeColors.text }]}>{descripcion}</Text>
            </View>
          ) : null}
          {tipoProyecto ? (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]}>Tipo:</Text>
              <Text style={[styles.summaryValue, { color: themeColors.text }]}>{tipoProyecto}</Text>
            </View>
          ) : null}
          {sucursal ? (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]}>Sucursal:</Text>
              <Text style={[styles.summaryValue, { color: themeColors.text }]}>{sucursal}</Text>
            </View>
          ) : null}
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]}>Partidas:</Text>
            <Text style={[styles.summaryValue, { color: themeColors.text }]}>{partidas.length}</Text>
          </View>
        </View>

        {/* Totales financieros agrupados en filas explícitas para evitar fallos de altura de flexWrap en React Native */}
        <View style={{ gap: Spacing.two, marginBottom: Spacing.two }}>
          {/* Fila 1 */}
          <View style={{ flexDirection: 'row', gap: Spacing.two }}>
            <View style={[styles.financialCard, { backgroundColor: themeColors.accent + '22', borderColor: themeColors.accent + '50' }]}>
              <Text style={[styles.financialLabel, { color: themeColors.accent, fontWeight: '800' }]}>FACTURADO</Text>
              <Text style={[styles.financialAmount, { color: themeColors.accent, fontWeight: '900' }]}>
                {formatCurrency(calculatedTotals.precioTotal)}
              </Text>
            </View>

            <View style={[styles.financialCard, { backgroundColor: themeColors.danger + '22', borderColor: themeColors.danger + '50' }]}>
              <Text style={[styles.financialLabel, { color: themeColors.danger, fontWeight: '800' }]}>COSTO</Text>
              <Text style={[styles.financialAmount, { color: themeColors.danger, fontWeight: '900' }]}>
                {formatCurrency(calculatedTotals.costoTotal)}
              </Text>
            </View>
          </View>

          {/* Fila 2 */}
          <View style={{ flexDirection: 'row', gap: Spacing.two }}>
            <View style={[
              styles.financialCard,
              {
                backgroundColor: isProfit ? themeColors.success + '22' : themeColors.danger + '22',
                borderColor: isProfit ? themeColors.success + '50' : themeColors.danger + '50',
              },
            ]}>
              <Text style={[styles.financialLabel, { color: isProfit ? themeColors.success : themeColors.danger, fontWeight: '800' }]}>
                UTILIDAD BRUTA
              </Text>
              <Text style={[styles.financialAmount, { color: isProfit ? themeColors.success : themeColors.danger, fontWeight: '900' }]}>
                {formatCurrency(calculatedTotals.utilidad)}
              </Text>
            </View>

            <View style={[
              styles.financialCard,
              {
                backgroundColor: isProfit ? themeColors.success + '22' : themeColors.danger + '22',
                borderColor: isProfit ? themeColors.success + '50' : themeColors.danger + '50',
              },
            ]}>
              <Text style={[styles.financialLabel, { color: isProfit ? themeColors.success : themeColors.danger, fontWeight: '800' }]}>
                MARGEN
              </Text>
              <Text style={[styles.financialAmount, { color: isProfit ? themeColors.success : themeColors.danger, fontWeight: '900' }]}>
                {margenPercent}%
              </Text>
            </View>
          </View>
        </View>

        {/* Lista de partidas readonly */}
        <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Detalle de Partidas</Text>
        {partidas.map((p, i) => {
          const cant = Number(p.cantidad) || 0;
          const precioUV = Number(p.precio_unitario_venta) || 0;
          const costoUP = Number(p.costo_unitario_proveedor) || 0;
          const subtotalVenta = cant * precioUV;
          const subtotalCosto = cant * costoUP;
          const utilidadPartida = subtotalVenta - subtotalCosto;

          return (
            <View key={p.id} style={[styles.summaryPartida, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
              <Text style={[styles.summaryPartidaDesc, { color: themeColors.text }]}>
                {i + 1}. {p.descripcion || 'Sin descripción'}
              </Text>
              <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>
                {cant} {p.unidad} × Venta: {formatCurrency(precioUV)} | Costo: {formatCurrency(costoUP)}
              </Text>
              <View style={styles.summaryPartidaRow}>
                <Text style={{ color: themeColors.accent, fontSize: 13, fontWeight: '700' }}>
                  Venta: {formatCurrency(subtotalVenta)}
                </Text>
                <Text style={{ color: utilidadPartida >= 0 ? themeColors.success : themeColors.danger, fontSize: 13, fontWeight: '700' }}>
                  Utilidad: {formatCurrency(utilidadPartida)}
                </Text>
              </View>
            </View>
          );
        })}

        {/* Botón Guardar */}
        <TouchableOpacity
          onPress={handleSaveVenta}
          disabled={isSubmitting}
          style={[
            styles.saveBtn,
            { backgroundColor: isSubmitting ? themeColors.border : themeColors.success },
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="checkmark-circle" size={22} color="#fff" />
          )}
          <Text style={styles.saveBtnText}>
            {isSubmitting ? 'Guardando...' : editingVentaId ? 'Guardar Cambios' : 'Registrar Venta'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderScreenHeader = () => (
    <View>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>
          {editingVentaId ? 'Editar Venta' : 'Registro de Ventas'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs / Banner de edición */}
      {editingVentaId ? (
        <View style={[styles.editingBanner, { backgroundColor: themeColors.accent + '20', borderBottomColor: themeColors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.one }}>
            <Ionicons name="create" size={20} color={themeColors.accent} />
            <Text style={[styles.editingBannerText, { color: themeColors.text }]}>
              Editando Venta de: <Text style={{ fontWeight: '800' }}>{cliente}</Text>
            </Text>
          </View>
          <TouchableOpacity 
            onPress={cancelEditing} 
            style={[styles.cancelEditBtn, { borderColor: themeColors.danger + '40', backgroundColor: themeColors.danger + '15' }]}
          >
            <Text style={{ color: themeColors.danger, fontWeight: '700', fontSize: 13 }}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.tabsContainer, { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}>
          <TouchableOpacity
            onPress={() => setActiveTab('registrar')}
            style={[
              styles.tab,
              activeTab === 'registrar'
                ? {
                    backgroundColor: themeColors.accent,
                    ...Platform.select({
                      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
                      android: { elevation: 2 },
                      web: { boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }
                    })
                  }
                : { backgroundColor: 'transparent' },
            ]}
          >
            <Text style={[styles.tabText, { color: activeTab === 'registrar' ? '#fff' : themeColors.textSecondary }]}>
              Registrar Venta
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setActiveTab('historial');
              loadHistorial();
            }}
            style={[
              styles.tab,
              activeTab === 'historial'
                ? {
                    backgroundColor: themeColors.accent,
                    ...Platform.select({
                      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
                      android: { elevation: 2 },
                      web: { boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }
                    })
                  }
                : { backgroundColor: 'transparent' },
            ]}
          >
            <Text style={[styles.tabText, { color: activeTab === 'historial' ? '#fff' : themeColors.textSecondary }]}>
              Historial
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderHistorial = () => (
    <View style={{ flex: 1 }}>
      {/* Buscador */}
      <View
        style={[
          styles.searchContainer,
          { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
        ]}
      >
        <Ionicons name="search" size={18} color={themeColors.textSecondary} style={{ marginRight: 8 }} />
        <TextInput
          style={[styles.searchInput, { color: themeColors.text }]}
          placeholder="Buscar por cliente, sucursal, fecha, referencia, monto, vendedor..."
          placeholderTextColor={themeColors.textSecondary}
          value={historialSearch}
          onChangeText={setHistorialSearch}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {historialSearch.length > 0 && (
          <TouchableOpacity onPress={() => setHistorialSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginRight: 8 }}>
            <Ionicons name="close-circle" size={18} color={themeColors.textSecondary} />
          </TouchableOpacity>
        )}
        <View style={{ position: 'relative' }}>
          <TouchableOpacity
            onPress={() => {
              if (Platform.OS !== 'web') setShowFilterDatePicker(true);
            }}
            style={{ padding: 4, borderRadius: 6, backgroundColor: filterDate ? themeColors.accent + '20' : 'transparent' }}
          >
            <Ionicons name="calendar-outline" size={20} color={filterDate ? themeColors.accent : themeColors.textSecondary} />
          </TouchableOpacity>
          {Platform.OS === 'web' && createElement('input', {
            type: 'date',
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              opacity: 0,
              cursor: 'pointer',
              zIndex: 100,
            },
            onClick: (e: any) => {
              try { e.target.showPicker(); } catch (err) {}
            },
            onChange: (e: any) => {
              if (e.target.value) {
                const parts = e.target.value.split('-');
                if (parts.length === 3) {
                  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                  setFilterDate(d);
                }
              }
            }
          })}
        </View>
        {filterDate && (
          <TouchableOpacity onPress={() => setFilterDate(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 4 }}>
            <Ionicons name="close" size={16} color={themeColors.danger} />
          </TouchableOpacity>
        )}
      </View>
      
      {showFilterDatePicker && Platform.OS !== 'web' && (
        <DateTimePicker
          value={filterDate || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onValueChange={(event: any, selectedDate?: Date) => {
            if (Platform.OS === 'android') setShowFilterDatePicker(false);
            if (selectedDate) setFilterDate(selectedDate);
          }}
          onDismiss={() => setShowFilterDatePicker(false)}
          maximumDate={new Date()}
        />
      )}

      {isLoadingHistorial ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={themeColors.accent} />
          <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.one }}>Cargando historial...</Text>
        </View>
      ) : ventasHistorial.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="receipt-outline" size={48} color={themeColors.textSecondary} />
          <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
            No hay ventas registradas aún.
          </Text>
        </View>
      ) : ventasFiltradas.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="search-outline" size={48} color={themeColors.textSecondary} />
          <Text style={[styles.emptyText, { color: themeColors.textSecondary, marginTop: Spacing.one }]}>
            No se encontraron ventas que coincidan con los criterios de búsqueda.
          </Text>
          <TouchableOpacity
            onPress={() => {
              setHistorialSearch('');
              setFilterDate(null);
            }}
            style={{ marginTop: Spacing.two, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: themeColors.accent + '20', borderRadius: 8 }}
          >
            <Text style={{ color: themeColors.accent, fontWeight: '600', fontSize: 13 }}>Limpiar búsqueda</Text>
          </TouchableOpacity>
        </View>
      ) : isDesktop ? (
        <ScrollView style={{ flex: 1 }}>
          {renderScreenHeader()}
          <View style={{ paddingHorizontal: Spacing.three, paddingVertical: Spacing.two }}>
            <View style={[styles.tableHeaderRow, { backgroundColor: themeColors.background, borderBottomColor: themeColors.border }]}>
              <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '14%', fontWeight: 'bold' }]}>Cliente</Text>
              <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '10%', fontWeight: 'bold' }]}>Sucursal</Text>
              <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '8%', fontWeight: 'bold' }]}>Fecha</Text>
              <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '9%', fontWeight: 'bold' }]}>Referencia</Text>
              <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '9%', fontWeight: 'bold' }]}>Proyecto</Text>
              <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '12%', fontWeight: 'bold' }]}>Estado Pago</Text>
              <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '11%', fontWeight: 'bold', textAlign: 'right' }]}>Facturado</Text>
              <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '13%', fontWeight: 'bold', textAlign: 'right' }]}>Pagado / Saldo</Text>
              <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '7%', fontWeight: 'bold', textAlign: 'right' }]}>Utilidad</Text>
              <View style={{ width: '7%', alignItems: 'center' }}>
                <Text style={{ fontSize: 11, fontWeight: 'bold', color: themeColors.text }}>Acciones</Text>
              </View>
            </View>
            <View style={{ backgroundColor: themeColors.backgroundElement, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, borderWidth: 1, borderColor: themeColors.border, borderTopWidth: 0 }}>
              {ventasFiltradas.map((item) => {
                const isProfit = item.utilidad_bruta >= 0;
                const margenPct = (item.margen_porcentual * 100).toFixed(1);
                const totalPag = item.total_pagado || 0;
                const saldoPen = item.saldo_pendiente !== undefined ? item.saldo_pendiente : Math.max(0, item.precio_total_facturado - totalPag);
                const estadoPago = item.estado_pago || calcularEstadoPago(item.precio_total_facturado, totalPag);
                const styleCfg = getEstadoPagoStyle(estadoPago);

                return (
                  <Pressable
                    key={item.id}
                    onPress={() => handleSelectVenta(item)}
                    style={({ hovered }: any) => [
                      styles.tableRow,
                      { borderBottomColor: themeColors.border },
                      hovered && { backgroundColor: themeColors.backgroundSelected }
                    ] as any}
                  >
                    <Text style={[styles.tableCell, { color: themeColors.text, width: '14%', fontWeight: '600' }]} numberOfLines={1}>{item.cliente}</Text>
                    <Text style={[styles.tableCell, { color: themeColors.textSecondary, width: '10%' }]} numberOfLines={1}>{item.sucursal || '--'}</Text>
                    <Text style={[styles.tableCell, { color: themeColors.text, width: '8%' }]}>{item.fecha}</Text>
                    <Text style={[styles.tableCell, { width: '9%', color: themeColors.textSecondary }]} numberOfLines={1}>{item.factura_referencia || '--'}</Text>
                    <View style={{ width: '9%' }}>
                      {item.tipo_proyecto ? (
                        <View style={[styles.tipoBadge, { backgroundColor: themeColors.accent + '15', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 12, alignSelf: 'flex-start' }]}>
                          <Text style={{ color: themeColors.accent, fontSize: 10, fontWeight: '700' }}>{item.tipo_proyecto}</Text>
                        </View>
                      ) : <Text style={{ color: themeColors.textSecondary }}>--</Text>}
                    </View>

                    {/* Badge Estado de Pago y CFDI */}
                    <View style={{ width: '12%', justifyContent: 'center', gap: 4 }}>
                      <View style={{ backgroundColor: styleCfg.bg, borderColor: styleCfg.border, borderWidth: 1, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 12, alignSelf: 'flex-start' }}>
                        <Text style={{ color: styleCfg.text, fontSize: 9, fontWeight: '800' }}>{estadoPago}</Text>
                      </View>
                      {(() => {
                        const cfdiCfg = getEstadoCfdiStyle(item.cfdi_estado);
                        return (
                          <View style={{ backgroundColor: cfdiCfg.bg, borderColor: cfdiCfg.border, borderWidth: 1, paddingVertical: 1, paddingHorizontal: 5, borderRadius: 10, alignSelf: 'flex-start' }}>
                            <Text style={{ color: cfdiCfg.text, fontSize: 8, fontWeight: '800' }}>{cfdiCfg.label}</Text>
                          </View>
                        );
                      })()}
                    </View>

                    <Text style={[styles.tableCell, { width: '11%', fontWeight: '700', color: themeColors.accent, textAlign: 'right' }]}>{formatCurrency(item.precio_total_facturado)}</Text>
                    
                    {/* Pagado / Saldo Pendiente */}
                    <View style={{ width: '13%', alignItems: 'flex-end', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.success }}>
                        {formatCurrency(totalPag)}
                      </Text>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: saldoPen > 0 ? themeColors.danger : themeColors.textSecondary }}>
                        Pend: {formatCurrency(saldoPen)}
                      </Text>
                    </View>

                    <Text style={[styles.tableCell, { width: '7%', fontWeight: '700', color: isProfit ? themeColors.success : themeColors.danger, textAlign: 'right' }]}>{formatCurrency(item.utilidad_bruta)}</Text>
                    
                    {/* Acciones */}
                    <View style={{ width: '8%', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          handleOpenPagoModal(item);
                        }}
                        style={{ padding: 5, backgroundColor: themeColors.success + '20', borderColor: themeColors.success + '40', borderWidth: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Ionicons name="cash-outline" size={16} color={themeColors.success} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          handleSelectVenta(item);
                        }}
                        style={{ padding: 4 }}
                      >
                        <Ionicons name="eye-outline" size={16} color={themeColors.accent} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          handleDuplicateVenta(item);
                        }}
                        style={{ padding: 4 }}
                      >
                        <Ionicons name="copy-outline" size={16} color={themeColors.primary} />
                      </TouchableOpacity>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>
      ) : (
        <FlatList scrollEnabled={true} style={{ flex: 1 }}
          ListHeaderComponent={renderScreenHeader()}
          data={ventasFiltradas}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={true}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: Spacing.three, gap: Spacing.two }}
          renderItem={({ item }) => {
            const isProfit = item.utilidad_bruta >= 0;
            const margenPct = (item.margen_porcentual * 100).toFixed(1);
            const totalPag = item.total_pagado || 0;
            const saldoPen = item.saldo_pendiente !== undefined ? item.saldo_pendiente : Math.max(0, item.precio_total_facturado - totalPag);
            const estadoPago = item.estado_pago || calcularEstadoPago(item.precio_total_facturado, totalPag);
            const styleCfg = getEstadoPagoStyle(estadoPago);

            return (
              <TouchableOpacity
                onPress={() => handleSelectVenta(item)}
                style={[styles.historialCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                activeOpacity={0.7}
              >
                {/* 1. Header: Categoría / Tipo e Icono a la izquierda, y Badges de Estado a la derecha */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: themeColors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="cart-outline" size={15} color={themeColors.primary} />
                    </View>
                    {item.tipo_proyecto ? (
                      <View style={[styles.tipoBadge, { backgroundColor: themeColors.accent + '15', paddingVertical: 2, paddingHorizontal: 7, borderRadius: 10 }]}>
                        <Text style={{ color: themeColors.accent, fontSize: 10, fontWeight: '700' }}>{item.tipo_proyecto}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Badges de Estado */}
                  <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 1 }}>
                    <View style={{ backgroundColor: styleCfg.bg, borderColor: styleCfg.border, borderWidth: 1, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 10 }}>
                      <Text style={{ color: styleCfg.text, fontSize: 9, fontWeight: '800' }}>{estadoPago}</Text>
                    </View>
                    {(() => {
                      const cfdiCfg = getEstadoCfdiStyle(item.cfdi_estado);
                      return (
                        <View style={{ backgroundColor: cfdiCfg.bg, borderColor: cfdiCfg.border, borderWidth: 1, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 10 }}>
                          <Text style={{ color: cfdiCfg.text, fontSize: 8, fontWeight: '800' }}>{cfdiCfg.label}</Text>
                        </View>
                      );
                    })()}
                  </View>
                </View>

                {/* 2. Nombre del Cliente (Fila dedicada de ancho completo para evitar que se empalme) */}
                <View style={{ marginBottom: 6 }}>
                  <Text style={[styles.cardTitle, { color: themeColors.text, fontSize: 15, fontWeight: '800', lineHeight: 20 }]}>
                    {item.cliente || 'Cliente sin nombre'}
                  </Text>
                  {item.sucursal ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Ionicons name="business-outline" size={13} color={themeColors.textSecondary} />
                      <Text style={{ color: themeColors.textSecondary, fontSize: 12, fontWeight: '600' }}>
                        {item.sucursal}
                      </Text>
                    </View>
                  ) : null}
                </View>
                
                {/* 3. Metadatos: Factura/PO y Descripción */}
                {(item.factura_referencia || item.descripcion) ? (
                  <View style={{ gap: 3, marginBottom: 8, backgroundColor: themeColors.background, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: themeColors.border + '40' }}>
                    {item.factura_referencia ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="document-text-outline" size={13} color={themeColors.textSecondary} />
                        <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>
                          <Text style={{ fontWeight: '700', color: themeColors.text }}>Ref / PO: </Text>
                          {item.factura_referencia}
                        </Text>
                      </View>
                    ) : null}
                    {item.descripcion ? (
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}>
                        <Ionicons name="information-circle-outline" size={13} color={themeColors.textSecondary} style={{ marginTop: 1 }} />
                        <Text style={{ color: themeColors.textSecondary, fontSize: 12, flex: 1 }} numberOfLines={2}>
                          <Text style={{ fontWeight: '700', color: themeColors.text }}>Detalle: </Text>
                          {item.descripcion}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {/* 4. Totales y Saldos de Pago */}
                <View style={[styles.historialTotals, { marginBottom: 8, backgroundColor: themeColors.background, borderColor: themeColors.border + '40', borderWidth: 1, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 8 }]}>
                  <View style={{ alignItems: 'flex-start', flex: 1 }}>
                    <Text style={{ color: themeColors.textSecondary, fontSize: 9, fontWeight: '700' }}>FECHA</Text>
                    <Text style={[styles.historialFecha, { color: themeColors.text, fontSize: 11, fontWeight: '700', marginTop: 1 }]}>{item.fecha}</Text>
                    {item.fecha_ultimo_pago && (
                      <Text style={{ color: themeColors.textSecondary, fontSize: 9, marginTop: 2 }}>
                        Pago: {item.fecha_ultimo_pago}
                      </Text>
                    )}
                  </View>
                  <View style={{ alignItems: 'center', flex: 1 }}>
                    <Text style={{ color: themeColors.textSecondary, fontSize: 9, fontWeight: '700' }}>FACTURADO</Text>
                    <Text style={{ color: themeColors.accent, fontSize: 12, fontWeight: '800', marginTop: 1 }}>
                      {formatCurrency(item.precio_total_facturado)}
                    </Text>
                    <Text style={{ color: themeColors.success, fontSize: 10, fontWeight: '700', marginTop: 2 }}>
                      Pag: {formatCurrency(totalPag)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', flex: 1 }}>
                    <Text style={{ color: themeColors.textSecondary, fontSize: 9, fontWeight: '700' }}>SALDO PEND.</Text>
                    <Text style={{ color: saldoPen > 0 ? themeColors.danger : themeColors.success, fontSize: 12, fontWeight: '800', marginTop: 1 }}>
                      {formatCurrency(saldoPen)}
                    </Text>
                    <Text style={{ color: isProfit ? themeColors.success : themeColors.danger, fontSize: 10, fontWeight: '700', marginTop: 2 }}>
                      Util: {formatCurrency(item.utilidad_bruta)}
                    </Text>
                  </View>
                </View>

                {/* 5. Botones de Acción */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      handleDuplicateVenta(item);
                    }}
                    style={{
                      flex: 1,
                      backgroundColor: themeColors.primary + '15',
                      borderColor: themeColors.primary + '40',
                      borderWidth: 1,
                      borderRadius: 8,
                      paddingVertical: 6,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                      gap: 4
                    }}
                  >
                    <Ionicons name="copy-outline" size={13} color={themeColors.primary} />
                    <Text style={{ color: themeColors.primary, fontWeight: '700', fontSize: 11 }}>Duplicar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      handleOpenPagoModal(item);
                    }}
                    style={{
                      flex: 1.4,
                      backgroundColor: themeColors.success + '15',
                      borderColor: themeColors.success + '40',
                      borderWidth: 1,
                      borderRadius: 8,
                      paddingVertical: 6,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                      gap: 4
                    }}
                  >
                    <Ionicons name="cash-outline" size={13} color={themeColors.success} />
                    <Text style={{ color: themeColors.success, fontWeight: '700', fontSize: 11 }}>+ Reg. Pago</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
          refreshing={isLoadingHistorial}
          onRefresh={loadHistorial}
        />
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.background }]}>
      <View style={{ flex: 1 }}>


      {activeTab === 'historial' ? (
        renderHistorial()
      ) : (
        <>
          {Platform.OS === 'web' ? (
            <View style={{ flex: 1, overflow: 'hidden' }}>
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={[styles.scrollContent, { maxWidth: 700, alignSelf: 'center', width: '100%' }]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={true}
              >
                {renderScreenHeader()}
                <StepIndicator 
                  currentStep={currentStep} 
                  steps={['Factura Compra', 'Costos y Precios', 'Resumen']} 
                  onStepPress={(step) => {
                    if (step < currentStep || true) {
                      setCurrentStep(step);
                    }
                  }}
                />
                {currentStep === 1 && renderStep1()}
                {currentStep === 2 && renderStep2()}
                {currentStep === 3 && renderStep3()}
              </ScrollView>
            </View>
          ) : (
            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={[styles.scrollContent, { maxWidth: 700, alignSelf: 'center', width: '100%' }]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {renderScreenHeader()}
                <StepIndicator 
                  currentStep={currentStep} 
                  steps={['Factura Compra', 'Costos y Precios', 'Resumen']} 
                  onStepPress={(step) => {
                    if (step < currentStep || true) {
                      setCurrentStep(step);
                    }
                  }}
                />
                {currentStep === 1 && renderStep1()}
                {currentStep === 2 && renderStep2()}
                {currentStep === 3 && renderStep3()}
              </ScrollView>
            </KeyboardAvoidingView>
          )}

          {/* Footer Navigation */}
          {currentStep < 3 && (
            <View style={[styles.footer, { borderTopColor: themeColors.border, backgroundColor: themeColors.background }]}>
              {currentStep > 1 ? (
                <TouchableOpacity onPress={prevStep} style={[styles.footerBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                  <Ionicons name="arrow-back" size={18} color={themeColors.text} />
                  <Text style={[styles.footerBtnText, { color: themeColors.text }]}>Anterior</Text>
                </TouchableOpacity>
              ) : (
                <View />
              )}
              <TouchableOpacity onPress={nextStep} style={[styles.footerBtn, { backgroundColor: themeColors.accent }]}>
                <Text style={[styles.footerBtnText, { color: '#fff' }]}>Siguiente</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* Modal de Detalle de Venta */}
      <Modal statusBarTranslucent={true}
        visible={isDetailModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
            {/* Header del Modal */}
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Detalle de Venta</Text>
              <TouchableOpacity onPress={() => setIsDetailModalVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            {selectedVenta ? (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
                {/* Bloque Información General */}
                <View style={[styles.modalCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                  <Text style={[styles.modalSectionTitle, { color: themeColors.accent }]}>Información General</Text>
                  
                  <View style={styles.modalRow}>
                    <Text style={[styles.modalLabel, { color: themeColors.textSecondary }]}>Cliente:</Text>
                    <Text style={[styles.modalValue, { color: themeColors.text }]}>{selectedVenta.cliente}</Text>
                  </View>
                  
                  <View style={styles.modalRow}>
                    <Text style={[styles.modalLabel, { color: themeColors.textSecondary }]}>Fecha:</Text>
                    <Text style={[styles.modalValue, { color: themeColors.text }]}>{selectedVenta.fecha}</Text>
                  </View>
                  
                  {selectedVenta.factura_referencia ? (
                    <View style={styles.modalRow}>
                      <Text style={[styles.modalLabel, { color: themeColors.textSecondary }]}>PO/Ref:</Text>
                      <Text style={[styles.modalValue, { color: themeColors.text }]}>{selectedVenta.factura_referencia}</Text>
                    </View>
                  ) : null}
                  {selectedVenta.descripcion ? (
                    <View style={styles.modalRow}>
                      <Text style={[styles.modalLabel, { color: themeColors.textSecondary }]}>Descripción:</Text>
                      <Text style={[styles.modalValue, { color: themeColors.text }]}>{selectedVenta.descripcion}</Text>
                    </View>
                  ) : null}

                  {selectedVenta.tipo_proyecto ? (
                    <View style={styles.modalRow}>
                      <Text style={[styles.modalLabel, { color: themeColors.textSecondary }]}>Tipo de Proyecto:</Text>
                      <Text style={[styles.modalValue, { color: themeColors.text }]}>{selectedVenta.tipo_proyecto}</Text>
                    </View>
                  ) : null}

                  {selectedVenta.sucursal ? (
                    <View style={styles.modalRow}>
                      <Text style={[styles.modalLabel, { color: themeColors.textSecondary }]}>Sucursal:</Text>
                      <Text style={[styles.modalValue, { color: themeColors.text }]}>{selectedVenta.sucursal}</Text>
                    </View>
                  ) : null}

                  {selectedVenta.proveedor ? (
                    <View style={styles.modalRow}>
                      <Text style={[styles.modalLabel, { color: themeColors.textSecondary }]}>Proveedor:</Text>
                      <Text style={[styles.modalValue, { color: themeColors.text }]}>{selectedVenta.proveedor}</Text>
                    </View>
                  ) : null}

                  {selectedVenta.notas ? (
                    <View style={[styles.modalRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 4, marginTop: Spacing.one }]}>
                      <Text style={[styles.modalLabel, { color: themeColors.textSecondary }]}>Notas:</Text>
                      <Text style={[styles.modalValue, { color: themeColors.text, fontWeight: 'normal' }]}>{selectedVenta.notas}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Bloque Totales Financieros */}
                <View style={[styles.modalCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                  <Text style={[styles.modalSectionTitle, { color: themeColors.accent }]}>Resumen Financiero</Text>
                  
                  <View style={{ gap: Spacing.one }}>
                    <View style={styles.modalRow}>
                      <Text style={[styles.modalLabel, { color: themeColors.textSecondary }]}>Total Facturado:</Text>
                      <Text style={[styles.modalValue, { color: themeColors.accent, fontSize: 16, fontWeight: '800' }]}>
                        {formatCurrency(selectedVenta.precio_total_facturado)}
                      </Text>
                    </View>

                    {/* Costo de Partidas / Productos */}
                    {/* Costo de Gastos vinculados */}
                    {selectedVentaGastos.length > 0 && (
                      <View style={styles.modalRow}>
                        <Text style={[styles.modalLabel, { color: themeColors.textSecondary }]}>Gastos Operativos Vinculados:</Text>
                        <Text style={[styles.modalValue, { color: themeColors.danger, fontSize: 13, fontWeight: '500' }]}>
                          {formatCurrency(selectedVentaGastos.reduce((sum, g) => sum + (Number(g.monto) || 0), 0))}
                        </Text>
                      </View>
                    )}

                    {/* Costo Total consolidado */}
                    <View style={styles.modalRow}>
                      <Text style={[styles.modalLabel, { color: themeColors.textSecondary, fontWeight: '700' }]}>Costo Total:</Text>
                      <Text style={[styles.modalValue, { color: themeColors.danger, fontSize: 14, fontWeight: '800' }]}>
                        {formatCurrency(selectedVenta.costo_total)}
                      </Text>
                    </View>

                    <View style={[styles.modalDivider, { backgroundColor: themeColors.border }]} />

                    <View style={styles.modalRow}>
                      <Text style={[styles.modalLabel, { color: themeColors.textSecondary }]}>Utilidad Bruta:</Text>
                      <Text style={[styles.modalValue, { color: selectedVenta.utilidad_bruta >= 0 ? themeColors.success : themeColors.danger, fontSize: 15, fontWeight: '800' }]}>
                        {formatCurrency(selectedVenta.utilidad_bruta)}
                      </Text>
                    </View>

                    <View style={styles.modalRow}>
                      <Text style={[styles.modalLabel, { color: themeColors.textSecondary }]}>Margen Porcentual:</Text>
                      <Text style={[styles.modalValue, { color: selectedVenta.utilidad_bruta >= 0 ? themeColors.success : themeColors.danger, fontSize: 15, fontWeight: '800' }]}>
                        {(selectedVenta.margen_porcentual * 100).toFixed(1)}%
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Bloque Facturación Electrónica (CFDI 4.0 con Finkok) */}
                <View style={[styles.modalCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="receipt" size={18} color={selectedVenta.cfdi_estado === 'TIMBRADA' ? themeColors.success : themeColors.accent} />
                      <Text style={[styles.modalSectionTitle, { color: themeColors.text, marginBottom: 0 }]}>
                        Factura Electrónica (CFDI 4.0)
                      </Text>
                    </View>
                    {(() => {
                      const cfdiCfg = getEstadoCfdiStyle(selectedVenta.cfdi_estado);
                      return (
                        <View style={{ backgroundColor: cfdiCfg.bg, borderColor: cfdiCfg.border, borderWidth: 1, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 12 }}>
                          <Text style={{ color: cfdiCfg.text, fontSize: 10, fontWeight: '800' }}>{cfdiCfg.label}</Text>
                        </View>
                      );
                    })()}
                  </View>

                  {selectedVenta.cfdi_estado === 'TIMBRADA' ? (
                    <View style={{ gap: 8 }}>
                      <View style={{ backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: themeColors.border }}>
                        <Text style={{ fontSize: 10, color: themeColors.textSecondary, fontWeight: '700' }}>FOLIO FISCAL (UUID SAT):</Text>
                        <Text style={{ fontSize: 12, color: themeColors.text, fontWeight: '600', marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }} selectable>
                          {selectedVenta.cfdi_uuid}
                        </Text>
                      </View>

                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                        <TouchableOpacity
                          onPress={handleViewFacturaPDF}
                          disabled={isSubmitting}
                          style={[styles.modalActionBtn, { flex: 1, backgroundColor: themeColors.primary + '15', borderColor: themeColors.primary }]}
                        >
                          <Ionicons name="document-text-outline" size={16} color={themeColors.primary} />
                          <Text style={[styles.modalActionText, { color: themeColors.primary, fontSize: 12 }]}>PDF CFDI</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={handleDownloadFacturaXML}
                          disabled={isSubmitting}
                          style={[styles.modalActionBtn, { flex: 1, backgroundColor: themeColors.primary + '15', borderColor: themeColors.primary }]}
                        >
                          <Ionicons name="code-outline" size={16} color={themeColors.primary} />
                          <Text style={[styles.modalActionText, { color: themeColors.primary, fontSize: 12 }]}>XML CFDI</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>
                        Esta venta aún no ha sido timbrada ante el SAT. Puedes generar y timbrar el comprobante CFDI 4.0 directamente con el PAC Finkok.
                      </Text>

                      <TouchableOpacity
                        onPress={() => handleTimbrarFactura(selectedVenta)}
                        disabled={isSubmitting}
                        style={{
                          backgroundColor: themeColors.success,
                          borderRadius: 8,
                          paddingVertical: 11,
                          paddingHorizontal: 16,
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexDirection: 'row',
                          gap: 8,
                          marginTop: 4
                        }}
                      >
                        {isSubmitting ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="receipt-outline" size={18} color="#fff" />
                            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
                              ⚡ Timbrar Factura CFDI 4.0
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {/* Bloque Estado de Pago y Historial de Parcialidades */}
                <View style={[styles.modalCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <Text style={[styles.modalSectionTitle, { color: themeColors.accent, marginBottom: 0 }]}>
                      Historial de Pagos / Abonos ({selectedVentaPagos.length})
                    </Text>
                    {(() => {
                      const totalPag = selectedVentaPagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
                      const est = selectedVenta.estado_pago || calcularEstadoPago(selectedVenta.precio_total_facturado, totalPag);
                      const st = getEstadoPagoStyle(est);
                      return (
                        <View style={{ backgroundColor: st.bg, borderColor: st.border, borderWidth: 1, paddingVertical: 3, paddingHorizontal: 10, borderRadius: 12 }}>
                          <Text style={{ color: st.text, fontSize: 11, fontWeight: '800' }}>{est}</Text>
                        </View>
                      );
                    })()}
                  </View>

                  {/* Resumen de Montos de Pago */}
                  {(() => {
                    const totalPag = selectedVentaPagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
                    const saldoPen = Math.max(0, (Number(selectedVenta.precio_total_facturado) || 0) - totalPag);

                    return (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', padding: 12, borderRadius: 10, marginBottom: 12, borderWidth: 1, borderColor: themeColors.border }}>
                        <View style={{ alignItems: 'center', flex: 1 }}>
                          <Text style={{ color: themeColors.textSecondary, fontSize: 10, fontWeight: '700' }}>TOTAL FACTURADO</Text>
                          <Text style={{ color: themeColors.text, fontSize: 13, fontWeight: '800', marginTop: 2 }}>
                            {formatCurrency(selectedVenta.precio_total_facturado)}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'center', flex: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: themeColors.border }}>
                          <Text style={{ color: themeColors.textSecondary, fontSize: 10, fontWeight: '700' }}>TOTAL PAGADO</Text>
                          <Text style={{ color: themeColors.success, fontSize: 13, fontWeight: '800', marginTop: 2 }}>
                            {formatCurrency(totalPag)}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'center', flex: 1 }}>
                          <Text style={{ color: themeColors.textSecondary, fontSize: 10, fontWeight: '700' }}>SALDO PENDIENTE</Text>
                          <Text style={{ color: saldoPen > 0 ? themeColors.danger : themeColors.success, fontSize: 13, fontWeight: '800', marginTop: 2 }}>
                            {formatCurrency(saldoPen)}
                          </Text>
                        </View>
                      </View>
                    );
                  })()}

                  {/* Lista de Abonos Parciales */}
                  {isLoadingPagos ? (
                    <ActivityIndicator size="small" color={themeColors.accent} style={{ marginVertical: Spacing.two }} />
                  ) : selectedVentaPagos.length === 0 ? (
                    <Text style={{ color: themeColors.textSecondary, fontStyle: 'italic', fontSize: 12, marginVertical: 6 }}>
                      No hay abonos registrados aún para esta venta. Usa el siguiente formulario para registrar una parcialidad.
                    </Text>
                  ) : (
                    <View style={{ gap: 8, marginBottom: 12 }}>
                      {selectedVentaPagos.map((pago, idx) => (
                        <View key={pago.id || idx} style={[styles.modalPartidaItem, { borderColor: themeColors.border, backgroundColor: themeColors.background }]}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Ionicons name="cash-outline" size={14} color={themeColors.success} />
                                <Text style={{ color: themeColors.success, fontWeight: '800', fontSize: 14 }}>
                                  {formatCurrency(Number(pago.monto) || 0)}
                                </Text>
                                <View style={{ backgroundColor: themeColors.accent + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                                  <Text style={{ color: themeColors.accent, fontSize: 10, fontWeight: '700' }}>
                                    {pago.metodo_pago || 'Transferencia'}
                                  </Text>
                                </View>
                              </View>
                              <Text style={{ color: themeColors.textSecondary, fontSize: 11, marginTop: 3 }}>
                                Fecha de Pago: <Text style={{ color: themeColors.text, fontWeight: '600' }}>{pago.fecha_pago}</Text>
                                {pago.referencia ? ` • Ref: ${pago.referencia}` : ''}
                              </Text>
                            </View>

                            <TouchableOpacity
                              onPress={() => handleDeletePago(pago.id)}
                              style={{ padding: 6 }}
                            >
                              <Ionicons name="trash-outline" size={16} color={themeColors.danger} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Formulario para registrar nueva parcialidad */}
                  <View style={{ marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: themeColors.border }}>
                    <Text style={{ color: themeColors.text, fontWeight: '700', fontSize: 13, marginBottom: 8 }}>
                      + Registrar Nueva Parcialidad / Pago
                    </Text>

                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: themeColors.textSecondary, fontSize: 11, marginBottom: 4 }}>Monto ($)</Text>
                        <TextInput
                          style={{ height: 40, borderWidth: 1, borderColor: themeColors.border, borderRadius: 8, paddingHorizontal: 10, color: themeColors.text, backgroundColor: themeColors.background, fontSize: 13 }}
                          value={pagoMonto}
                          onChangeText={setPagoMonto}
                          placeholder="0.00"
                          placeholderTextColor={themeColors.textSecondary}
                          keyboardType="numeric"
                        />
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={{ color: themeColors.textSecondary, fontSize: 11, marginBottom: 4 }}>Fecha de Pago (AAAA-MM-DD)</Text>
                        <TextInput
                          style={{ height: 40, borderWidth: 1, borderColor: themeColors.border, borderRadius: 8, paddingHorizontal: 10, color: themeColors.text, backgroundColor: themeColors.background, fontSize: 13 }}
                          value={pagoFecha}
                          onChangeText={setPagoFecha}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor={themeColors.textSecondary}
                        />
                      </View>
                    </View>

                    {/* Método de Pago */}
                    <Text style={{ color: themeColors.textSecondary, fontSize: 11, marginBottom: 4 }}>Método de Pago</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {['Transferencia', 'Efectivo', 'Cheque', 'Tarjeta', 'Otro'].map(met => (
                          <TouchableOpacity
                            key={met}
                            onPress={() => setPagoMetodo(met)}
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              borderRadius: 10,
                              borderWidth: 1,
                              borderColor: pagoMetodo === met ? themeColors.accent : themeColors.border,
                              backgroundColor: pagoMetodo === met ? themeColors.accent + '20' : themeColors.background
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: pagoMetodo === met ? '700' : '500', color: pagoMetodo === met ? themeColors.accent : themeColors.textSecondary }}>
                              {met}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>

                    <Text style={{ color: themeColors.textSecondary, fontSize: 11, marginBottom: 4 }}>Referencia / Folio (Opcional)</Text>
                    <TextInput
                      style={{ height: 40, borderWidth: 1, borderColor: themeColors.border, borderRadius: 8, paddingHorizontal: 10, color: themeColors.text, backgroundColor: themeColors.background, fontSize: 13, marginBottom: 12 }}
                      value={pagoReferencia}
                      onChangeText={setPagoReferencia}
                      placeholder="Ej. Transferencia #987654"
                      placeholderTextColor={themeColors.textSecondary}
                    />

                    <TouchableOpacity
                      onPress={handleRegistrarPago}
                      disabled={isSubmittingPago}
                      style={{
                        backgroundColor: themeColors.success,
                        borderRadius: 8,
                        paddingVertical: 10,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                        gap: 6
                      }}
                    >
                      {isSubmittingPago ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Registrar Pago</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Lista de Partidas */}
                <View style={[styles.modalCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                  <Text style={[styles.modalSectionTitle, { color: themeColors.accent }]}>Partidas / Productos</Text>
                  
                  {isLoadingPartidas ? (
                    <ActivityIndicator size="small" color={themeColors.accent} style={{ marginVertical: Spacing.two }} />
                  ) : selectedVentaPartidas.length === 0 ? (
                    <Text style={{ color: themeColors.textSecondary, fontStyle: 'italic', fontSize: 13 }}>No hay partidas registradas.</Text>
                  ) : (
                    <View style={{ gap: Spacing.two }}>
                      {selectedVentaPartidas.map((partida, idx) => {
                        const subVenta = partida.cantidad * partida.precio_unitario_venta;
                        const subCosto = partida.cantidad * partida.costo_unitario_proveedor;
                        const subUtilidad = subVenta - subCosto;

                        return (
                          <View key={partida.id || idx} style={[styles.modalPartidaItem, { borderColor: themeColors.border }]}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                              <Text style={{ color: themeColors.text, fontWeight: '700', fontSize: 13, flex: 1 }}>
                                {idx + 1}. {partida.descripcion}
                              </Text>
                              <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>
                                {partida.cantidad} {partida.unidad}
                              </Text>
                            </View>

                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                              <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>
                                Venta U: {formatCurrency(partida.precio_unitario_venta)}
                              </Text>
                            </View>

                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                              <Text style={{ color: themeColors.accent, fontSize: 12, fontWeight: '700' }}>
                                Total: {formatCurrency(subVenta)}
                              </Text>
                              <Text style={{ color: subUtilidad >= 0 ? themeColors.success : themeColors.danger, fontSize: 12, fontWeight: '700' }}>
                                Utilidad: {formatCurrency(subUtilidad)}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>

                {/* Lista de Gastos Vinculados */}
                {selectedVentaGastos.length > 0 && (
                  <View style={[styles.modalCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                    <Text style={[styles.modalSectionTitle, { color: themeColors.danger }]}>Gastos Operativos Vinculados ({selectedVentaGastos.length})</Text>
                    <View style={{ gap: Spacing.two }}>
                      {selectedVentaGastos.map((gasto, idx) => (
                        <View key={gasto.id || idx} style={[styles.modalPartidaItem, { borderColor: themeColors.border }]}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ color: themeColors.text, fontWeight: '700', fontSize: 13, flex: 1 }}>
                              {idx + 1}. {gasto.justificacion || 'Gasto operativo'}
                            </Text>
                            <Text style={{ color: themeColors.danger, fontSize: 13, fontWeight: '700' }}>
                              {formatCurrency(Number(gasto.monto) || 0)}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                            <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>
                              Fecha: {gasto.fecha_comprobante || gasto.created_at?.split('T')[0] || 'N/A'}
                            </Text>
                            {gasto.empleado_nombre && (
                              <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>
                                Reg: {gasto.empleado_nombre}
                              </Text>
                            )}
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </ScrollView>
            ) : (
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color={themeColors.accent} />
              </View>
            )}

            {/* Acciones del Modal */}
            <View style={[styles.modalFooter, { borderTopColor: themeColors.border, flexDirection: 'column', gap: 12 }]}>
              {/* FILA 1: Documentos y Descargas */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={async () => {
                    if (selectedVenta) {
                      const { data: clientData } = await supabase
                        .from('clientes')
                        .select('*')
                        .eq('nombre', selectedVenta.cliente)
                        .single();

                      let cotizacionLineas: any[] = [];
                      if (selectedVenta.cotizacion_id) {
                        const { data: cotData } = await supabase
                          .from('cotizaciones')
                          .select('lineas')
                          .eq('id', selectedVenta.cotizacion_id)
                          .single();
                        if (cotData?.lineas) cotizacionLineas = cotData.lineas;
                      }

                      const cotData = {
                        numeroCotizacion: selectedVenta.folio || selectedVenta.id.toString().slice(-6),
                        cotizacionRelacionada: selectedVenta.cotizaciones?.folio,
                        clienteNombre: selectedVenta.cliente,
                        clienteRFC: clientData?.rfc || '',
                        clienteCP: clientData?.codigo_postal || '',
                        direccionFactura: clientData?.direccion || '',
                        clienteCorreo: clientData?.correo_electronico || '',
                        fechaCreacion: selectedVenta.fecha || selectedVenta.created_at || new Date().toISOString(),
                        vendedor: selectedVenta.usuarios?.nombre || 'Portal-Inttec',
                        moneda: 'MXN',
                        lineas: selectedVentaPartidas.map((p, idx) => {
                          const descParts = p.descripcion.split(' - ');
                          const prodName = descParts[0] || '';
                          const prodDesc = descParts.slice(1).join(' - ') || '';
                          
                          let tEntrega = 'Inmediato';
                          const matchedLine = cotizacionLineas.find(cl => cl.productoNombre === prodName) || cotizacionLineas[idx];
                          if (matchedLine && matchedLine.tiempoEntrega) {
                            tEntrega = matchedLine.tiempoEntrega;
                          }

                          return {
                            id: p.id.toString(),
                            productoNombre: prodName,
                            productoDescripcion: prodDesc,
                            tiempoEntrega: tEntrega,
                            cantidad: Number(p.cantidad) || 1,
                            unidad: p.unidad || 'PZA',
                            precioUnitario: Number(p.precio_unitario_venta) || 0,
                            impuestoPorcentaje: 16,
                            importe: (Number(p.cantidad) || 1) * (Number(p.precio_unitario_venta) || 0)
                          };
                        }),
                        subtotal: Number(selectedVenta.precio_total_facturado) || 0,
                        iva: (Number(selectedVenta.precio_total_facturado) || 0) * 0.16,
                        total: (Number(selectedVenta.precio_total_facturado) || 0) * 1.16,
                        terminosCondiciones: 'https://inttec.odoo.com/terms'
                      };
                      try {
                        await exportarCotizacionOdooPDF(cotData, 'download', 'venta');
                      } catch (err: any) {
                        showAlert('Error', 'No se pudo generar el PDF de Venta: ' + err.message);
                      }
                    }
                  }}
                  style={[styles.modalActionBtn, { backgroundColor: themeColors.primary + '15', borderColor: themeColors.primary }]}
                >
                  <Ionicons name="document-outline" size={18} color={themeColors.primary} />
                  <Text style={[styles.modalActionText, { color: themeColors.primary, fontSize: 12 }]}>PDF Venta</Text>
                </TouchableOpacity>

                {selectedVenta?.cfdi_estado === 'TIMBRADA' ? (
                  <>
                    <TouchableOpacity
                      onPress={handleViewFacturaPDF}
                      disabled={isSubmitting}
                      style={[styles.modalActionBtn, { backgroundColor: themeColors.primary + '15', borderColor: themeColors.primary }]}
                    >
                      <Ionicons name="document-text-outline" size={18} color={themeColors.primary} />
                      <Text style={[styles.modalActionText, { color: themeColors.primary, fontSize: 12 }]}>PDF CFDI</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleDownloadFacturaXML}
                      disabled={isSubmitting}
                      style={[styles.modalActionBtn, { backgroundColor: themeColors.primary + '15', borderColor: themeColors.primary }]}
                    >
                      <Ionicons name="code-outline" size={18} color={themeColors.primary} />
                      <Text style={[styles.modalActionText, { color: themeColors.primary, fontSize: 12 }]}>XML CFDI</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    onPress={() => handleTimbrarFactura()}
                    disabled={isSubmitting}
                    style={[styles.modalActionBtn, { backgroundColor: themeColors.success + '15', borderColor: themeColors.success }]}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color={themeColors.success} />
                    ) : (
                      <Ionicons name="receipt-outline" size={18} color={themeColors.success} />
                    )}
                    <Text style={[styles.modalActionText, { color: themeColors.success, fontSize: 12 }]}>Timbrar CFDI</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* FILA 2: Edición y Cancelación */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={handleEditVenta}
                  disabled={isSubmitting}
                  style={[styles.modalActionBtn, { backgroundColor: themeColors.accent + '15', borderColor: themeColors.accent }]}
                >
                  <Ionicons name="create-outline" size={18} color={themeColors.accent} />
                  <Text style={[styles.modalActionText, { color: themeColors.accent, fontSize: 12 }]}>Editar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleDuplicateVenta()}
                  disabled={isSubmitting}
                  style={[styles.modalActionBtn, { backgroundColor: themeColors.primary + '15', borderColor: themeColors.primary }]}
                >
                  <Ionicons name="copy-outline" size={18} color={themeColors.primary} />
                  <Text style={[styles.modalActionText, { color: themeColors.primary, fontSize: 12 }]}>Duplicar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleDeleteVenta}
                  disabled={isSubmitting}
                  style={[styles.modalActionBtn, { backgroundColor: themeColors.danger + '15', borderColor: themeColors.danger }]}
                >
                  <Ionicons name="trash-outline" size={18} color={themeColors.danger} />
                  <Text style={[styles.modalActionText, { color: themeColors.danger, fontSize: 12 }]}>Eliminar</Text>
                </TouchableOpacity>

                {selectedVenta?.cfdi_estado === 'TIMBRADA' && (
                  <TouchableOpacity
                    onPress={handleCancelarFactura}
                    disabled={isSubmitting}
                    style={[styles.modalActionBtn, { backgroundColor: themeColors.danger + '15', borderColor: themeColors.danger }]}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color={themeColors.danger} />
                    ) : (
                      <Ionicons name="close-circle-outline" size={18} color={themeColors.danger} />
                    )}
                    <Text style={[styles.modalActionText, { color: themeColors.danger, fontSize: 12 }]}>Cancelar CFDI</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Dedicado Exclusivamente para Registrar Pago */}
      <Modal statusBarTranslucent={true}
        visible={isPagoModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsPagoModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, borderColor: themeColors.border, maxWidth: 550, maxHeight: '85%' }]}>
            {/* Header del Modal */}
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="cash" size={22} color={themeColors.success} />
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Registrar Pago / Abono</Text>
              </View>
              <TouchableOpacity onPress={() => setIsPagoModalVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            {selectedVenta ? (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.three }} showsVerticalScrollIndicator={false}>
                {/* Resumen del Cliente y Venta */}
                <View style={[styles.modalCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, marginBottom: Spacing.two }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: themeColors.textSecondary, fontSize: 11, fontWeight: '700' }}>CLIENTE</Text>
                      <Text style={{ color: themeColors.text, fontSize: 15, fontWeight: '800', marginTop: 2 }}>{selectedVenta.cliente}</Text>
                      {selectedVenta.factura_referencia ? (
                        <Text style={{ color: themeColors.textSecondary, fontSize: 12, marginTop: 2 }}>PO/Ref: {selectedVenta.factura_referencia}</Text>
                      ) : null}
                    </View>
                    {(() => {
                      const totalPag = selectedVentaPagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
                      const est = selectedVenta.estado_pago || calcularEstadoPago(selectedVenta.precio_total_facturado, totalPag);
                      const st = getEstadoPagoStyle(est);
                      return (
                        <View style={{ backgroundColor: st.bg, borderColor: st.border, borderWidth: 1, paddingVertical: 3, paddingHorizontal: 10, borderRadius: 12 }}>
                          <Text style={{ color: st.text, fontSize: 11, fontWeight: '800' }}>{est}</Text>
                        </View>
                      );
                    })()}
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', padding: 12, borderRadius: 10, marginTop: 12, borderWidth: 1, borderColor: themeColors.border }}>
                    <View style={{ alignItems: 'center', flex: 1 }}>
                      <Text style={{ color: themeColors.textSecondary, fontSize: 10, fontWeight: '700' }}>FACTURADO</Text>
                      <Text style={{ color: themeColors.text, fontSize: 13, fontWeight: '800', marginTop: 2 }}>
                        {formatCurrency(selectedVenta.precio_total_facturado)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'center', flex: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: themeColors.border }}>
                      <Text style={{ color: themeColors.textSecondary, fontSize: 10, fontWeight: '700' }}>PAGADO</Text>
                      <Text style={{ color: themeColors.success, fontSize: 13, fontWeight: '800', marginTop: 2 }}>
                        {formatCurrency(selectedVentaPagos.reduce((s, p) => s + (Number(p.monto) || 0), 0))}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'center', flex: 1 }}>
                      <Text style={{ color: themeColors.textSecondary, fontSize: 10, fontWeight: '700' }}>SALDO PENDIENTE</Text>
                      <Text style={{ color: (selectedVenta.saldo_pendiente || 0) > 0 ? themeColors.danger : themeColors.success, fontSize: 13, fontWeight: '800', marginTop: 2 }}>
                        {formatCurrency(selectedVenta.saldo_pendiente !== undefined ? selectedVenta.saldo_pendiente : Math.max(0, selectedVenta.precio_total_facturado - selectedVentaPagos.reduce((s, p) => s + (Number(p.monto) || 0), 0)))}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Formulario de Pago */}
                <View style={[styles.modalCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, marginBottom: Spacing.two }]}>
                  <Text style={{ color: themeColors.text, fontWeight: '800', fontSize: 14, marginBottom: 12 }}>
                    Datos del Nuevo Pago
                  </Text>

                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: themeColors.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 4 }}>Monto del Pago ($)</Text>
                      <TextInput
                        style={{ height: 42, borderWidth: 1, borderColor: themeColors.border, borderRadius: 8, paddingHorizontal: 12, color: themeColors.text, backgroundColor: themeColors.background, fontSize: 14, fontWeight: '700' }}
                        value={pagoMonto}
                        onChangeText={setPagoMonto}
                        placeholder="0.00"
                        placeholderTextColor={themeColors.textSecondary}
                        keyboardType="numeric"
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={{ color: themeColors.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 4 }}>Fecha de Pago (AAAA-MM-DD)</Text>
                      <TextInput
                        style={{ height: 42, borderWidth: 1, borderColor: themeColors.border, borderRadius: 8, paddingHorizontal: 12, color: themeColors.text, backgroundColor: themeColors.background, fontSize: 13 }}
                        value={pagoFecha}
                        onChangeText={setPagoFecha}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={themeColors.textSecondary}
                      />
                    </View>
                  </View>

                  {/* Método de Pago */}
                  <Text style={{ color: themeColors.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>Método de Pago</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {['Transferencia', 'Efectivo', 'Cheque', 'Tarjeta', 'Otro'].map(met => (
                        <TouchableOpacity
                          key={met}
                          onPress={() => setPagoMetodo(met)}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 7,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: pagoMetodo === met ? themeColors.accent : themeColors.border,
                            backgroundColor: pagoMetodo === met ? themeColors.accent + '20' : themeColors.background
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: pagoMetodo === met ? '800' : '500', color: pagoMetodo === met ? themeColors.accent : themeColors.textSecondary }}>
                            {met}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>

                  <Text style={{ color: themeColors.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 4 }}>Referencia / Folio (Opcional)</Text>
                  <TextInput
                    style={{ height: 42, borderWidth: 1, borderColor: themeColors.border, borderRadius: 8, paddingHorizontal: 12, color: themeColors.text, backgroundColor: themeColors.background, fontSize: 13, marginBottom: 16 }}
                    value={pagoReferencia}
                    onChangeText={setPagoReferencia}
                    placeholder="Ej. Transferencia #987654"
                    placeholderTextColor={themeColors.textSecondary}
                  />

                  <TouchableOpacity
                    onPress={handleRegistrarPago}
                    disabled={isSubmittingPago}
                    style={{
                      backgroundColor: themeColors.success,
                      borderRadius: 10,
                      paddingVertical: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                      gap: 6
                    }}
                  >
                    {isSubmittingPago ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={18} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Guardar Pago</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Historial de Pagos Anteriores */}
                {selectedVentaPagos.length > 0 && (
                  <View style={[styles.modalCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                    <Text style={{ color: themeColors.text, fontWeight: '700', fontSize: 13, marginBottom: 8 }}>
                      Abonos Anteriores Registrados ({selectedVentaPagos.length})
                    </Text>
                    <View style={{ gap: 8 }}>
                      {selectedVentaPagos.map((pago, idx) => (
                        <View key={pago.id || idx} style={[styles.modalPartidaItem, { borderColor: themeColors.border, backgroundColor: themeColors.background }]}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Ionicons name="cash-outline" size={14} color={themeColors.success} />
                                <Text style={{ color: themeColors.success, fontWeight: '800', fontSize: 14 }}>
                                  {formatCurrency(Number(pago.monto) || 0)}
                                </Text>
                                <View style={{ backgroundColor: themeColors.accent + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                                  <Text style={{ color: themeColors.accent, fontSize: 10, fontWeight: '700' }}>
                                    {pago.metodo_pago || 'Transferencia'}
                                  </Text>
                                </View>
                              </View>
                              <Text style={{ color: themeColors.textSecondary, fontSize: 11, marginTop: 3 }}>
                                Fecha: <Text style={{ color: themeColors.text, fontWeight: '600' }}>{pago.fecha_pago}</Text>
                                {pago.referencia ? ` • Ref: ${pago.referencia}` : ''}
                              </Text>
                            </View>

                            <TouchableOpacity
                              onPress={() => handleDeletePago(pago.id)}
                              style={{ padding: 6 }}
                            >
                              <Ionicons name="trash-outline" size={16} color={themeColors.danger} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </ScrollView>
            ) : null}

            <View style={[styles.modalFooter, { borderTopColor: themeColors.border, justifyContent: 'flex-end' }]}>
              <TouchableOpacity
                onPress={() => setIsPagoModalVisible(false)}
                style={[styles.modalActionBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
              >
                <Text style={[styles.modalActionText, { color: themeColors.text }]}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de Pre-Timbrado / Edición de Factura CFDI 4.0 */}
      <Modal statusBarTranslucent={true}
        visible={isTimbradoModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsTimbradoModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, borderColor: themeColors.border, maxWidth: 700, maxHeight: '90%' }]}>
            {/* Header del Modal */}
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="receipt" size={22} color={themeColors.success} />
                <View>
                  <Text style={[styles.modalTitle, { color: themeColors.text, fontSize: 17 }]}>Configurar y Timbrar Factura (CFDI 4.0)</Text>
                  <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>Revisa o edita los datos antes de emitir ante el SAT con Finkok</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setIsTimbradoModalVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            {timbrandoVenta ? (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.three, gap: Spacing.two }} showsVerticalScrollIndicator={false}>
                {/* 1. SECCIÓN: DATOS DEL RECEPTOR (CLIENTE) */}
                <View style={[styles.modalCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                  <Text style={[styles.modalSectionTitle, { color: themeColors.accent }]}>1. Datos Fiscales del Receptor (Cliente)</Text>
                  
                  <CustomInput
                    label="Razón Social / Nombre Oficial *"
                    value={cfdiClienteNombre}
                    onChangeText={setCfdiClienteNombre}
                    placeholder="Ej. EMPRESA EJEMPLO"
                  />

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1.2 }}>
                      <CustomInput
                        label="RFC Receptor *"
                        value={cfdiClienteRfc}
                        onChangeText={setCfdiClienteRfc}
                        placeholder="XAXX010101000"
                        autoCapitalize="characters"
                      />
                    </View>
                    <View style={{ flex: 0.8 }}>
                      <CustomInput
                        label="Código Postal (Domicilio) *"
                        value={cfdiClienteCp}
                        onChangeText={setCfdiClienteCp}
                        placeholder="31110"
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  {/* Régimen Fiscal Selector */}
                  <View style={{ marginBottom: 8 }}>
                    <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Régimen Fiscal Receptor *</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {REGIMENES_FISCALES.map(reg => (
                          <TouchableOpacity
                            key={reg.code}
                            onPress={() => setCfdiClienteRegimen(reg.code)}
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: cfdiClienteRegimen === reg.code ? themeColors.accent : themeColors.border,
                              backgroundColor: cfdiClienteRegimen === reg.code ? themeColors.accent + '20' : themeColors.background
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: cfdiClienteRegimen === reg.code ? '800' : '500', color: cfdiClienteRegimen === reg.code ? themeColors.accent : themeColors.textSecondary }}>
                              {reg.code} ({reg.label.split('-')[1]?.trim().substring(0, 18)}...)
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </View>

                  {/* Uso CFDI Selector */}
                  <View>
                    <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Uso de CFDI *</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {USOS_CFDI.map(uso => (
                          <TouchableOpacity
                            key={uso.code}
                            onPress={() => setCfdiClienteUso(uso.code)}
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: cfdiClienteUso === uso.code ? themeColors.accent : themeColors.border,
                              backgroundColor: cfdiClienteUso === uso.code ? themeColors.accent + '20' : themeColors.background
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: cfdiClienteUso === uso.code ? '800' : '500', color: cfdiClienteUso === uso.code ? themeColors.accent : themeColors.textSecondary }}>
                              {uso.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                </View>

                {/* 2. SECCIÓN: CONDICIONES COMERCIALES */}
                <View style={[styles.modalCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                  <Text style={[styles.modalSectionTitle, { color: themeColors.accent }]}>2. Forma y Método de Pago</Text>
                  
                  {/* Forma de Pago */}
                  <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Forma de Pago SAT</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4, marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {FORMAS_PAGO_CFDI.map(fp => (
                        <TouchableOpacity
                          key={fp.code}
                          onPress={() => setCfdiFormaPago(fp.code)}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: cfdiFormaPago === fp.code ? themeColors.accent : themeColors.border,
                            backgroundColor: cfdiFormaPago === fp.code ? themeColors.accent + '20' : themeColors.background
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: cfdiFormaPago === fp.code ? '800' : '500', color: cfdiFormaPago === fp.code ? themeColors.accent : themeColors.textSecondary }}>
                            {fp.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>

                  {/* Método de Pago */}
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Método de Pago</Text>
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                        {[
                          { code: 'PUE', label: 'PUE (Contado)' },
                          { code: 'PPD', label: 'PPD (Crédito)' }
                        ].map(mp => (
                          <TouchableOpacity
                            key={mp.code}
                            onPress={() => setCfdiMetodoPago(mp.code)}
                            style={{
                              flex: 1,
                              paddingVertical: 8,
                              borderRadius: 8,
                              borderWidth: 1,
                              alignItems: 'center',
                              borderColor: cfdiMetodoPago === mp.code ? themeColors.accent : themeColors.border,
                              backgroundColor: cfdiMetodoPago === mp.code ? themeColors.accent + '20' : themeColors.background
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: cfdiMetodoPago === mp.code ? '800' : '500', color: cfdiMetodoPago === mp.code ? themeColors.accent : themeColors.textSecondary }}>
                              {mp.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    <View style={{ width: 80 }}>
                      <CustomInput
                        label="Serie"
                        value={cfdiSerie}
                        onChangeText={setCfdiSerie}
                        placeholder="A"
                      />
                    </View>
                    <View style={{ flex: 0.8 }}>
                      <CustomInput
                        label="Folio"
                        value={cfdiFolio}
                        onChangeText={setCfdiFolio}
                        placeholder="123"
                      />
                    </View>
                  </View>
                </View>

                {/* 3. SECCIÓN: PARTIDAS Y PRODUCTOS (EDITABLES) */}
                <View style={[styles.modalCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={[styles.modalSectionTitle, { color: themeColors.accent, marginBottom: 0 }]}>
                      3. Partidas / Conceptos a Facturar ({cfdiPartidas.length})
                    </Text>
                    <TouchableOpacity
                      onPress={handleAddCfdiPartida}
                      style={{ backgroundColor: themeColors.accent, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    >
                      <Ionicons name="add" size={14} color="#fff" />
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Agregar</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={{ gap: 10 }}>
                    {cfdiPartidas.map((partida, index) => {
                      const cant = parseFloat(partida.cantidad) || 0;
                      const pu = parseFloat(partida.precio_unitario_venta) || 0;
                      const sub = cant * pu;

                      return (
                        <View key={partida.id || index} style={{ backgroundColor: themeColors.background, borderRadius: 8, borderWidth: 1, borderColor: themeColors.border, padding: 10 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <Text style={{ color: themeColors.accent, fontWeight: '800', fontSize: 12 }}>Partida #{index + 1}</Text>
                            {cfdiPartidas.length > 1 && (
                              <TouchableOpacity onPress={() => handleRemoveCfdiPartida(partida.id)} style={{ padding: 2 }}>
                                <Ionicons name="trash-outline" size={16} color={themeColors.danger} />
                              </TouchableOpacity>
                            )}
                          </View>

                          <TextInput
                            style={{ height: 38, borderWidth: 1, borderColor: themeColors.border, borderRadius: 6, paddingHorizontal: 8, color: themeColors.text, backgroundColor: themeColors.backgroundElement, fontSize: 12, marginBottom: 6 }}
                            value={partida.descripcion}
                            onChangeText={val => handleUpdateCfdiPartida(partida.id, 'descripcion', val)}
                            placeholder="Descripción del producto o servicio"
                            placeholderTextColor={themeColors.textSecondary}
                          />

                          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 10, color: themeColors.textSecondary, marginBottom: 2 }}>Cantidad</Text>
                              <TextInput
                                style={{ height: 36, borderWidth: 1, borderColor: themeColors.border, borderRadius: 6, paddingHorizontal: 8, color: themeColors.text, backgroundColor: themeColors.backgroundElement, fontSize: 12 }}
                                value={partida.cantidad}
                                onChangeText={val => handleUpdateCfdiPartida(partida.id, 'cantidad', val)}
                                placeholder="1"
                                keyboardType="numeric"
                              />
                            </View>

                            <View style={{ flex: 1.5 }}>
                              <Text style={{ fontSize: 10, color: themeColors.textSecondary, marginBottom: 2 }}>Precio Unitario ($)</Text>
                              <TextInput
                                style={{ height: 36, borderWidth: 1, borderColor: themeColors.border, borderRadius: 6, paddingHorizontal: 8, color: themeColors.text, backgroundColor: themeColors.backgroundElement, fontSize: 12 }}
                                value={partida.precio_unitario_venta}
                                onChangeText={val => handleUpdateCfdiPartida(partida.id, 'precio_unitario_venta', val)}
                                placeholder="0.00"
                                keyboardType="numeric"
                              />
                            </View>

                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 10, color: themeColors.textSecondary, marginBottom: 2 }}>Clave SAT</Text>
                              <TextInput
                                style={{ height: 36, borderWidth: 1, borderColor: themeColors.border, borderRadius: 6, paddingHorizontal: 8, color: themeColors.text, backgroundColor: themeColors.backgroundElement, fontSize: 12 }}
                                value={partida.clave_sat}
                                onChangeText={val => handleUpdateCfdiPartida(partida.id, 'clave_sat', val)}
                                placeholder="01010101"
                              />
                            </View>

                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 10, color: themeColors.textSecondary, marginBottom: 2 }}>Unidad SAT</Text>
                              <TextInput
                                style={{ height: 36, borderWidth: 1, borderColor: themeColors.border, borderRadius: 6, paddingHorizontal: 8, color: themeColors.text, backgroundColor: themeColors.backgroundElement, fontSize: 12 }}
                                value={partida.clave_unidad}
                                onChangeText={val => handleUpdateCfdiPartida(partida.id, 'clave_unidad', val)}
                                placeholder="H87"
                              />
                            </View>
                          </View>

                          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 2 }}>
                            <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                              Importe Partida: <Text style={{ color: themeColors.text, fontWeight: '700' }}>{formatCurrency(sub)}</Text>
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>

                {/* 4. SECCIÓN: RESUMEN DE TOTALES FISCALES */}
                {(() => {
                  const subTotalCalculado = cfdiPartidas.reduce((sum, p) => sum + ((parseFloat(p.cantidad) || 0) * (parseFloat(p.precio_unitario_venta) || 0)), 0);
                  const ivaCalculado = subTotalCalculado * 0.16;
                  const totalCalculado = subTotalCalculado + ivaCalculado;

                  return (
                    <View style={{ backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: themeColors.border }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>Subtotal:</Text>
                        <Text style={{ fontSize: 13, color: themeColors.text, fontWeight: '600' }}>{formatCurrency(subTotalCalculado)}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>IVA Trasladado (16%):</Text>
                        <Text style={{ fontSize: 13, color: themeColors.text, fontWeight: '600' }}>{formatCurrency(ivaCalculado)}</Text>
                      </View>
                      <View style={{ height: 1, backgroundColor: themeColors.border, marginVertical: 6 }} />
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 14, color: themeColors.text, fontWeight: '800' }}>TOTAL CFDI A TIMBRAR:</Text>
                        <Text style={{ fontSize: 16, color: themeColors.success, fontWeight: '800' }}>{formatCurrency(totalCalculado)}</Text>
                      </View>
                    </View>
                  );
                })()}
              </ScrollView>
            ) : null}

            {/* Footer de Acciones */}
            <View style={[styles.modalFooter, { borderTopColor: themeColors.border, gap: 10 }]}>
              <TouchableOpacity
                onPress={() => setIsTimbradoModalVisible(false)}
                disabled={isSubmittingTimbrado}
                style={[styles.modalActionBtn, { flex: 0.8, backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
              >
                <Text style={[styles.modalActionText, { color: themeColors.text }]}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleExecuteTimbrado}
                disabled={isSubmittingTimbrado}
                style={[styles.modalActionBtn, { flex: 1.2, backgroundColor: themeColors.success, borderColor: themeColors.success }]}
              >
                {isSubmittingTimbrado ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="flash" size={18} color="#fff" />
                    <Text style={[styles.modalActionText, { color: '#fff', fontSize: 13 }]}>Confirmar y Timbrar</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  customDropdownTrigger: { height: 50, borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, },
  customDropdownList: { position: 'relative', marginTop: 8, borderRadius: 16, borderWidth: 1, maxHeight: 250, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4, },
  customDropdownItem: { padding: 16, borderBottomWidth: 0.5, borderBottomColor: '#e0e0e0', },

  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  tabsContainer: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: BorderRadius.medium,
    marginHorizontal: Spacing.three,
    marginTop: Spacing.two,
    marginBottom: Spacing.one,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: BorderRadius.medium - 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  scrollContent: {
    padding: Spacing.three,
    paddingBottom: 120,
  },

  // Info Card
  infoCard: {
    flexDirection: 'row',
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },

  // Preview
  previewContainer: {
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    overflow: 'hidden',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: 220,
  },
  pdfPlaceholder: {
    width: '100%',
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.one,
  },
  pdfLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  scanBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.pill,
    alignItems: 'center',
    gap: 4,
  },
  scanBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },

  // Capture buttons
  captureRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  captureBtn: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    borderRadius: BorderRadius.medium,
    gap: Spacing.one,
  },
  captureBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  // Analyze button
  analyzeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    borderRadius: BorderRadius.medium,
    gap: Spacing.two,
  },
  analyzeBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },

  // Skip link
  skipLink: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  skipLinkText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Section title
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: Spacing.one,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },

  // Dropdown
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.two,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
  },
  dropdownList: {
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    marginTop: 4,
    maxHeight: 200,
  },
  dropdownItem: {
    padding: Spacing.two,
  },

  // Partidas
  partidasHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  addPartidaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.pill,
    gap: 4,
  },
  addPartidaBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyPartidas: {
    padding: Spacing.four,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  partidaCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  partidaCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  partidaIndex: {
    fontSize: 14,
    fontWeight: '800',
  },
  partidaInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    paddingHorizontal: Spacing.two,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 14,
  },
  partidaRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  partidaFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  partidaInputSmall: {
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    paddingHorizontal: Spacing.two,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 14,
  },
  historialTotals: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.02)',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.small,
  },
  partidaSubtotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
  },
  partidaSubtotalText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Step 3 - Summary
  summaryBlock: {
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '700',
  },

  // Financial cards
  financialGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  financialCard: {
    flex: 1,
    minWidth: 140,
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    padding: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: Spacing.half, // Separación vertical cuando salta de línea en móviles
  },
  financialLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  financialAmount: {
    fontSize: 18,
    fontWeight: '800',
  },

  // Summary partidas
  summaryPartida: {
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    padding: Spacing.two,
    gap: 4,
  },
  summaryPartidaDesc: {
    fontSize: 13,
    fontWeight: '700',
  },
  summaryPartidaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },

  // Save button
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    borderRadius: BorderRadius.medium,
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },

  // Footer navigation
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.three,
    borderTopWidth: 1,
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: Spacing.one,
  },
  footerBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },

  // Search bar
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.three,
    marginTop: Spacing.three,
    marginBottom: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    minHeight: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: 4,
  },

  // Historial
  historialCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.large,
    padding: Spacing.three,
    marginBottom: Spacing.two,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
      }
    }),
  },
  historialHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historialCliente: {
    fontSize: 15,
    fontWeight: '800',
  },
  historialFecha: {
    fontSize: 12,
    fontWeight: '600',
  },

  tipoBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.pill,
  },

  // Empty & loading states
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.six,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.six,
    gap: Spacing.two,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  customDropdownContainer: {
    marginBottom: Spacing.three,
    position: 'relative',
    zIndex: 10,
  },
  dropdownLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: Spacing.half,
  },
  dropdownTrigger: {
    height: 50,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  modalContent: {
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalCloseBtn: {
    padding: Spacing.half,
  },
  modalScrollContent: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: Spacing.one,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 4,
    gap: 8,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 0,
  },
  modalValue: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
  },
  modalDivider: {
    height: 1,
    marginVertical: Spacing.one,
  },
  modalPartidaItem: {
    borderBottomWidth: 1,
    paddingBottom: Spacing.one,
    marginBottom: Spacing.one,
    borderBottomColor: 'rgba(128,128,128,0.15)',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.three,
    borderTopWidth: 1,
    gap: Spacing.two,
  },
  modalActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    gap: Spacing.one,
  },
  modalActionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  editingBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderBottomWidth: 1,
  },
  editingBannerText: {
    fontSize: 14,
    fontWeight: '500',
  },
  cancelEditBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
  // Table Styles (Desktop)
  tableHeaderRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomWidth: 1,
  },
  tableHeaderCell: {
    fontSize: 13,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  tableCell: {
    fontSize: 13,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
});
