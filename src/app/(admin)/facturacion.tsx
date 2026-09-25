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
import { supabase, CompanyService, inttecClient, daravisaClient } from '@/services/supabase';
import { getApiHeaders, getApiUrl } from '@/services/apiHelper';
import SatCatalogAutocomplete from '@/components/SatCatalogAutocomplete';
import CustomInput from '@/components/CustomInput';
import CustomButton from '@/components/CustomButton';
import { parseCFDIXML } from '@/utils/cfdiParser';
import { exportarFacturaOdooPDF, exportarReciboPagoPDF, generarReciboPagoHTML, cleanFolio } from '@/utils/reportGenerator';
import FacturaPreviewModal from '@/components/FacturaPreviewModal';
import { normalizeText } from '@/utils/helpers';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Sharing from 'expo-sharing';
import { cacheDirectory, writeAsStringAsync } from 'expo-file-system/legacy';

interface ClienteCatalogo {
  id: string;
  nombre: string;
  razon_social?: string;
  rfc?: string;
  codigo_postal?: string;
  regimen_fiscal?: string;
  uso_cfdi?: string;
}

interface ProductoCatalogo {
  id: string;
  sku_interno?: string;
  nombre_oficial: string;
  stock_actual?: number;
  precio_unitario?: number;
  precio?: number;
  sat_code?: string;
  clave_sat?: string;
  clave_facturacion?: string;
  clave_unidad?: string;
  unidad?: string;
  categoria_id?: string;
  activo?: boolean;
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
  orden_compra?: string;
  tipo_proyecto?: string;
  descripcion?: string;
  origen?: string;
  origenLabel?: string;
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

  const [activeTab, setActiveTab] = useState<'emitir' | 'historial' | 'pagos'>('emitir');

  // Catálogo de Clientes
  const [clientes, setClientes] = useState<ClienteCatalogo[]>([]);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isLoadingClientes, setIsLoadingClientes] = useState(false);
  const [clientSearch, setClientSearch] = useState('');

  // Catálogo de Productos / Inventario
  const [productos, setProductos] = useState<ProductoCatalogo[]>([]);
  const [categorias, setCategorias] = useState<Array<{ id: string; nombre: string }>>([]);
  const [isLoadingProductos, setIsLoadingProductos] = useState(false);
  const [activeDropdownIndex, setActiveDropdownIndex] = useState<number | null>(null);

  // 1. Datos del Receptor
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteRfc, setClienteRfc] = useState('XAXX010101000');
  const [clienteCp, setClienteCp] = useState('31110');
  const [clienteRegimen, setClienteRegimen] = useState('601');
  const [clienteUso, setClienteUso] = useState('G03');

  // 2. Configuración del Comprobante
  const [formaPago, setFormaPago] = useState('03');
  const [metodoPago, setMetodoPago] = useState('PUE');
  const [serie, setSerie] = useState('A');
  const [folio, setFolio] = useState('0001');
  const [moneda, setMoneda] = useState('MXN');
  const [ordenCompra, setOrdenCompra] = useState('');

  // 3. Partidas
  const [partidas, setPartidas] = useState<FacturaPartida[]>([
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

  // Historial de Facturas Emitidas
  const [historialFacturas, setHistorialFacturas] = useState<FacturaEmitida[]>([]);
  const [isLoadingHistorial, setIsLoadingHistorial] = useState(false);
  const [historialSearch, setHistorialSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'TODAS' | 'TIMBRADA' | 'CANCELADA'>('TODAS');

  // Complementos de Pago (REP)
  const [complementosList, setComplementosList] = useState<any[]>([]);
  const [isLoadingComplementos, setIsLoadingComplementos] = useState(false);
  const [complementosSearch, setComplementosSearch] = useState('');
  const [filtroEstadoPago, setFiltroEstadoPago] = useState<'TODAS' | 'TIMBRADA' | 'CANCELADA'>('TODAS');

  // Modal Nuevo Complemento de Pago
  const [isPagoModalOpen, setIsPagoModalOpen] = useState(false);
  const [pagoCliente, setPagoCliente] = useState<ClienteCatalogo | null>(null);
  const [isSelectClientePagoOpen, setIsSelectClientePagoOpen] = useState(false);
  const [searchClientePago, setSearchClientePago] = useState('');
  const [facturasPendientesCliente, setFacturasPendientesCliente] = useState<any[]>([]);
  const [isLoadingFacturasPendientes, setIsLoadingFacturasPendientes] = useState(false);
  const [selectedFacturasMap, setSelectedFacturasMap] = useState<Record<number, boolean>>({});
  const [abonosMap, setAbonosMap] = useState<Record<number, string>>({});
  const [formaPagoPago, setFormaPagoPago] = useState('03');
  const [fechaPagoVal, setFechaPagoVal] = useState(new Date().toISOString().slice(0, 10));
  const [referenciaPago, setReferenciaPago] = useState('');
  const [seriePago, setSeriePago] = useState('P');
  const [folioPago, setFolioPago] = useState('0001');
  const [isSubmittingPago, setIsSubmittingPago] = useState(false);

  // Estados de proceso
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estados de Vista Previa Modal
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewVenta, setPreviewVenta] = useState<any>(null);
  const [previewFacturaData, setPreviewFacturaData] = useState<any>(null);
  const [previewXmlText, setPreviewXmlText] = useState<string>('');
  const [previewCustomHtml, setPreviewCustomHtml] = useState<string>('');
  const [previewIsDraft, setPreviewIsDraft] = useState<boolean>(false);
  const [previewTitle, setPreviewTitle] = useState<string>('');
  const [returnToPagoModal, setReturnToPagoModal] = useState<boolean>(false);

  useEffect(() => {
    fetchClientes();
    fetchProductos();
    fetchHistorialFacturas();
    fetchSiguienteFolio('A');
    fetchComplementosList();
    fetchSiguienteFolioPago('P');
  }, []);

  const fetchSiguienteFolio = async (serieTarget = 'A') => {
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/sat/siguiente-folio?serie=${encodeURIComponent(serieTarget)}`, { headers });
      if (res.ok) {
        const json = await res.json();
        if (json.folio) {
          setFolio(json.folio);
          return;
        }
      }
    } catch (_) {}
    setFolio('0001');
  };

  const fetchSiguienteFolioPago = async (serieTarget = 'P') => {
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/sat/siguiente-folio-pago?serie=${encodeURIComponent(serieTarget)}`, { headers });
      if (res.ok) {
        const json = await res.json();
        if (json.folio) {
          setFolioPago(json.folio);
          return;
        }
      }
    } catch (_) {}
    setFolioPago('0001');
  };

  const fetchComplementosList = async () => {
    try {
      setIsLoadingComplementos(true);
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/sat/complementos-pago`, { headers });
      if (res.ok) {
        const json = await res.json();
        setComplementosList(json.complementos || []);
      }
    } catch (err) {
      console.warn('Error al cargar complementos de pago:', err);
    } finally {
      setIsLoadingComplementos(false);
    }
  };

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const fetchProductos = async () => {
    try {
      setIsLoadingProductos(true);
      // 1. Fetch categorias
      try {
        const { data: catData } = await supabase
          .from('categorias_productos')
          .select('id, nombre')
          .order('nombre');
        if (catData) setCategorias(catData);
      } catch (_) {}

      // 2. Intentar API backend
      try {
        const headers = await getApiHeaders();
        const res = await fetch(`${getApiUrl()}/api/inventario/dashboard`, { headers });
        if (res.ok) {
          const json = await res.json();
          const items = json.productos || [];
          if (Array.isArray(items) && items.length > 0) {
            setProductos(items);
            if (json.categorias && Array.isArray(json.categorias)) {
              setCategorias(json.categorias);
            }
            return;
          }
        }
      } catch (_) {}

      // 3. Fallback directo a Supabase
      const { data } = await supabase
        .from('productos')
        .select('*')
        .order('nombre_oficial');

      if (data) {
        setProductos(data);
      }
    } catch (err) {
      console.warn('Error fetching productos:', err);
    } finally {
      setIsLoadingProductos(false);
    }
  };

  const fetchClientes = async () => {
    try {
      setIsLoadingClientes(true);
      // 1. Intentar API backend (/api/catalogos/clientes)
      try {
        const headers = await getApiHeaders();
        const res = await fetch(`${getApiUrl()}/api/catalogos/clientes`, { headers });
        if (res.ok) {
          const json = await res.json();
          const items = Array.isArray(json) ? json : (json.data || json.clientes || []);
          if (Array.isArray(items) && items.length > 0) {
            setClientes(items);
            return;
          }
        }
      } catch (err) {
        console.warn('Error fetching /api/catalogos/clientes:', err);
      }

      // 2. Intentar API backend (/api/catalogos/all)
      try {
        const headers = await getApiHeaders();
        const res = await fetch(`${getApiUrl()}/api/catalogos/all`, { headers });
        if (res.ok) {
          const json = await res.json();
          const items = json.clientes || json.data || [];
          if (Array.isArray(items) && items.length > 0) {
            setClientes(items);
            return;
          }
        }
      } catch (err) {
        console.warn('Error fetching /api/catalogos/all:', err);
      }

      // 3. Fallback directo a Supabase con el cliente de la compañía activa
      const activeComp = CompanyService.getActiveCompany();
      const client = activeComp === 'daravisa' ? daravisaClient : inttecClient;
      const { data, error } = await client
        .from('clientes')
        .select('id, nombre, razon_social, rfc, codigo_postal, regimen_fiscal, uso_cfdi')
        .order('nombre');

      if (!error && data && data.length > 0) {
        setClientes(data);
      } else if (error) {
        console.warn('Supabase fallback error fetching clientes:', error);
      }
    } catch (err) {
      console.warn('Error fetching clientes:', err);
    } finally {
      setIsLoadingClientes(false);
    }
  };

  const fetchHistorialFacturas = async () => {
    try {
      setIsLoadingHistorial(true);
      // 1. Intentar API backend dedicada (/api/sat/facturas-emitidas)
      try {
        const headers = await getApiHeaders();
        const res = await fetch(`${getApiUrl()}/api/sat/facturas-emitidas`, { headers });
        if (res.ok) {
          const json = await res.json();
          const items: FacturaEmitida[] = json.facturas || [];
          if (Array.isArray(items)) {
            setHistorialFacturas(items);
            return;
          }
        }
      } catch (_) {}

      // 2. Fallback: /api/ventas/historial
      try {
        const headers = await getApiHeaders();
        const res = await fetch(`${getApiUrl()}/api/ventas/historial`, { headers });
        if (res.ok) {
          const json = await res.json();
          const ventasList: any[] = json.ventas || json.data || [];
          if (Array.isArray(ventasList) && ventasList.length > 0) {
            const facturadas = ventasList
              .filter(v => v.cfdi_uuid || v.cfdi_estado === 'TIMBRADA' || v.cfdi_estado === 'CANCELADA')
              .map(f => {
                const isDirecta = f.tipo_proyecto === 'Factura Directa';
                const cleanFolioVal = cleanFolio(f.folio);
                const numRef = cleanFolioVal || f.factura_referencia || (f.id ? `#${f.id}` : '');
                return {
                  ...f,
                  folio: cleanFolioVal || f.folio,
                  origen: isDirecta ? 'FACTURA_DIRECTA' : 'VENTA',
                  origenLabel: isDirecta ? 'Factura Directa' : `Venta ${numRef}`
                };
              });
            setHistorialFacturas(facturadas);
            return;
          }
        }
      } catch (_) {}

      // 3. Fallback directo a Supabase
      const { data } = await supabase
        .from('ventas')
        .select('id, cliente, fecha, factura_referencia, folio, cfdi_uuid, cfdi_estado, cfdi_xml_url, precio_total_facturado, created_at, orden_compra, tipo_proyecto')
        .or('cfdi_uuid.neq.null,cfdi_estado.eq.TIMBRADA,cfdi_estado.eq.CANCELADA')
        .order('created_at', { ascending: false });

      if (data) {
        const facturadas = (data as any[]).map(f => {
          const isDirecta = f.tipo_proyecto === 'Factura Directa';
          const cleanFolioVal = cleanFolio(f.folio);
          const numRef = cleanFolioVal || f.factura_referencia || (f.id ? `#${f.id}` : '');
          return {
            ...f,
            folio: cleanFolioVal || f.folio,
            origen: isDirecta ? 'FACTURA_DIRECTA' : 'VENTA',
            origenLabel: isDirecta ? 'Factura Directa' : `Venta ${numRef}`
          };
        });
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

  const getFilteredProductsForPartida = (searchText: string) => {
    if (!searchText || !searchText.trim()) {
      return productos.slice(0, 30);
    }
    const q = normalizeText(searchText);
    return productos.filter(p => {
      const nombre = normalizeText(p.nombre_oficial || (p as any).nombre || '');
      const sku = normalizeText(p.sku_interno || '');
      const catNombre = normalizeText(p.categoria_id ? categoriasMap.get(p.categoria_id) || '' : '');
      return nombre.includes(q) || sku.includes(q) || catNombre.includes(q);
    }).slice(0, 30);
  };

  const handleSelectProductForPartida = (index: number, prod: ProductoCatalogo) => {
    const desc = prod.nombre_oficial || (prod as any).nombre || '';
    const precio = String(prod.precio_unitario || prod.precio || '0');
    const claveSat = prod.sat_code || prod.clave_sat || prod.clave_facturacion || '01010101';
    
    const unidadNorm = (prod.unidad || '').toLowerCase().trim();
    let claveUnidad = prod.clave_unidad;
    let unidad = prod.unidad || 'Pieza';

    if (!claveUnidad) {
      if (unidadNorm === 'mts' || unidadNorm === 'metros' || unidadNorm === 'metro' || unidadNorm === 'm') {
        claveUnidad = 'LM'; // Metro Lineal SAT standard
        unidad = 'Metro';
      } else if (unidadNorm === 'servicio' || unidadNorm === 'servicios') {
        claveUnidad = 'E48';
        unidad = 'Unidad de servicio';
      } else if (unidadNorm === 'rollo' || unidadNorm === 'bobina') {
        claveUnidad = 'XRO';
        unidad = 'Rollo';
      } else if (unidadNorm === 'kit') {
        claveUnidad = 'KT';
        unidad = 'Kit';
      } else {
        claveUnidad = 'H87';
        unidad = 'Pieza';
      }
    }

    setPartidas(prev => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        descripcion: desc,
        precio_unitario: precio !== '0' ? precio : next[index].precio_unitario,
        clave_sat: claveSat,
        clave_unidad: claveUnidad,
        unidad: unidad,
      };
      return next;
    });

    setActiveDropdownIndex(null);
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
    setSerie('A');
    setFolio('0001');
    fetchSiguienteFolio('A');
    setOrdenCompra('');
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
    if (!ordenCompra.trim()) {
      showAlert('Validación', 'Ingresa la Orden de compra.');
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
          orden_compra: ordenCompra.trim(),
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

      // Timbrar a través del backend (con zona horaria correcta sincronizada con SAT/Finkok)
      let data: any = null;
      let timbradoSuccess = false;

      try {
        const headers = await getApiHeaders();
        const apiUrl = getApiUrl();
        const resp = await fetch(`${apiUrl}/api/sat/timbrar-factura`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        const resJson = await resp.json().catch(() => ({}));
        if (resp.ok && resJson.success) {
          data = resJson;
          timbradoSuccess = true;
        } else if (resJson.error) {
          throw new Error(resJson.error);
        } else {
          throw new Error(`Error del servidor (${resp.status})`);
        }
      } catch (backendErr: any) {
        console.warn('Backend timbrado fallo o no disponible:', backendErr);
        const isNetworkOrOffline = !backendErr.message || 
          backendErr.message.includes('Network') || 
          backendErr.message.includes('Failed to fetch') || 
          backendErr.message.includes('Error del servidor (5');

        if (!isNetworkOrOffline) {
          throw backendErr;
        }

        const { data: edgeData, error: edgeError } = await supabase.functions.invoke('facturar-venta', {
          body: payload,
        });

        if (edgeError) throw edgeError;
        if (edgeData?.error) throw new Error(edgeData.error);
        data = edgeData;
        timbradoSuccess = true;
      }

      if (!timbradoSuccess || !data?.cfdi_uuid) {
        throw new Error('No se pudo obtener el UUID de timbrado.');
      }

      showAlert('Éxito', `Factura timbrada exitosamente (CFDI 4.0).\n\nFolio Fiscal (UUID):\n${data.cfdi_uuid}`);
      fetchHistorialFacturas();
      setActiveTab('historial');
      handleResetForm();
    } catch (err: any) {
      let errorMsg = err.message || 'Error desconocido al timbrar la factura.';
      if (err?.context) {
        try {
          if (typeof err.context.json === 'function') {
            const body = await err.context.json();
            if (body?.error) errorMsg = body.error;
            else if (body?.message) errorMsg = body.message;
          } else if (typeof err.context.text === 'function') {
            const txt = await err.context.text();
            if (txt) {
              try {
                const parsed = JSON.parse(txt);
                if (parsed?.error) errorMsg = parsed.error;
                else if (parsed?.message) errorMsg = parsed.message;
              } catch (_) {
                errorMsg = txt;
              }
            }
          }
        } catch (_) {}
      }
      console.error('Error al timbrar factura:', errorMsg);
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
        subtotal_venta: financialTotals.subtotal,
        orden_compra: ordenCompra.trim(),
      };

      const fakeFacturaData = {
        uuid: uuidSimulado,
        folio_number: folio || '1',
        series: serie,
        created_at: new Date().toISOString(),
        payment_form: formaPago,
        payment_method: metodoPago,
        use: clienteUso,
        subtotal: financialTotals.subtotal,
        total: financialTotals.total,
        total_impuestos_trasladados: financialTotals.totalIva,
        iva: financialTotals.totalIva,
        taxes: [
          {
            amount: financialTotals.totalIva,
            type: 'IVA',
            rate: 0.16,
          }
        ],
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
        items: partidas.map(p => {
          const cant = parseFloat(p.cantidad) || 1;
          const pu = parseFloat(p.precio_unitario) || 0;
          const imp = cant * pu;
          const isObj02 = p.objeto_imp === '02';
          const itemIva = isObj02 ? imp * 0.16 : 0;
          return {
            quantity: cant,
            product: {
              product_key: p.clave_sat,
              unit_key: p.clave_unidad,
              description: p.descripcion || 'Concepto a facturar',
              price: pu,
            },
            taxes: itemIva > 0 ? [{
              amount: itemIva,
              base: imp,
              rate: 0.16,
              type: 'IVA'
            }] : []
          };
        }),
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

      setPreviewVenta(fakeVenta);
      setPreviewFacturaData(fakeFacturaData);
      setPreviewXmlText('');
      setPreviewIsDraft(true);
      setPreviewTitle(`Borrador: Factura ${serie}${folio || '1'}`);
      setPreviewModalVisible(true);
    } catch (err: any) {
      console.error('Error generando vista previa PDF:', err);
      showAlert('Error en Vista Previa', err.message || 'No se pudo generar la vista previa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper para leer XML de facturas emitidas con múltiples estrategias de resolución
  const retrieveXml = async (factura: FacturaEmitida): Promise<string> => {
    // 1. Backend endpoint dedicado (resuelve mayúsculas/minúsculas y URL en storage del tenant)
    try {
      const headers = await getApiHeaders();
      const resp = await fetch(`${getApiUrl()}/api/sat/factura-xml/${factura.cfdi_uuid || factura.id}`, { headers });
      if (resp.ok) {
        const j = await resp.json();
        if (j.xml && j.xml.includes('<')) return j.xml;
      }
    } catch (_) {}

    // 2. Si viene embebido en Base64
    if (factura.cfdi_xml_url && factura.cfdi_xml_url.startsWith('data:application/xml;base64,')) {
      try {
        const b64 = factura.cfdi_xml_url.replace('data:application/xml;base64,', '');
        return decodeURIComponent(escape(atob(b64)));
      } catch (_) {}
    }

    // 3. URL pública directa
    if (factura.cfdi_xml_url && factura.cfdi_xml_url.startsWith('http')) {
      try {
        const resp = await fetch(factura.cfdi_xml_url);
        if (resp.ok) {
          const text = await resp.text();
          if (text && text.includes('<')) return text;
        }
      } catch (_) {}
    }

    // 4. Descarga directa desde Supabase Storage (probando mayúsculas y minúsculas)
    if (factura.cfdi_uuid) {
      try {
        const { data: dUpper } = await supabase.storage.from('facturas').download(`${factura.cfdi_uuid.toUpperCase()}.xml`);
        if (dUpper) return await dUpper.text();
      } catch (_) {}

      try {
        const { data: dLower } = await supabase.storage.from('facturas').download(`${factura.cfdi_uuid.toLowerCase()}.xml`);
        if (dLower) return await dLower.text();
      } catch (_) {}
    }

    return '';
  };

  const handleDescargarXML = async (factura: FacturaEmitida) => {
    try {
      const xmlText = await retrieveXml(factura);
      if (!xmlText) {
        showAlert('Aviso', 'Esta factura histórica no cuenta con archivo XML almacenado en el servidor.');
        return;
      }

      const clienteSanitized = (factura.cliente || 'Cliente').replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
      const folioSanitized = cleanFolio(factura.folio || factura.factura_referencia || factura.cfdi_uuid?.slice(0, 8) || factura.id).replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `${clienteSanitized}_${folioSanitized}.xml`;

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
      setIsSubmitting(true);
      const xmlText = await retrieveXml(factura);
      const isCanceled = factura.cfdi_estado === 'CANCELADA';
      let parsed: any = null;

      if (xmlText) {
        parsed = parseCFDIXML(xmlText, isCanceled ? 'canceled' : 'valid');
      } else {
        // Estructura representativa sintética para ventas históricas sin XML en storage
        const total = Number(factura.precio_total_facturado) || 0;
        const subtotal = Math.round((total / 1.16) * 100) / 100;
        const iva = Math.round((total - subtotal) * 100) / 100;
        parsed = {
          verification_url: '',
          status: isCanceled ? 'canceled' : 'valid',
          type: 'I',
          folio_number: cleanFolio(factura.folio || factura.factura_referencia) || String(factura.id).slice(0, 8),
          series: '',
          date: factura.fecha || factura.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
          expedition_place: '31000',
          payment_form: '03',
          payment_method: 'PUE',
          currency: 'MXN',
          subtotal,
          total,
          total_taxes: iva,
          issuer: {
            tax_id: 'INT110101XYZ',
            legal_name: 'INTTEC SOFTWARE Y SISTEMAS SA DE CV',
            fiscal_regime: '601',
          },
          receiver: {
            tax_id: 'XAXX010101000',
            legal_name: factura.cliente || 'CLIENTE GENERAL',
            fiscal_regime: '616',
            tax_zip_code: '31000',
            cfdi_use: 'G03',
          },
          items: [{
            quantity: 1,
            product: {
              product_key: '81111500',
              unit_key: 'E48',
              unit: 'Unidad de servicio',
              description: factura.descripcion || `Venta ${factura.folio || factura.factura_referencia || '#' + factura.id}`,
              price: subtotal,
            },
            taxes: [{
              amount: iva,
              base: subtotal,
              rate: 0.16,
              type: 'IVA',
            }],
          }],
          stamp: {
            uuid: factura.cfdi_uuid || 'UUID-NO-DISPONIBLE',
            date: factura.created_at || factura.fecha,
            sat_cert_number: '00001000000504465028',
            sat_signature: 'SELLO_DIGITAL_SAT_CFDI',
            cfd_signature: 'SELLO_CFD_EMISOR',
            rfc_prov_certif: 'FIN1203015JA',
          },
        };
      }

      setPreviewVenta(factura);
      setPreviewFacturaData(parsed);
      setPreviewXmlText(xmlText);
      setPreviewIsDraft(false);
      setPreviewTitle(`Factura: ${factura.folio || parsed.folio_number || factura.cfdi_uuid?.slice(0, 8)}`);
      setPreviewModalVisible(true);
    } catch (err: any) {
      showAlert('Error en PDF', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelarFacturaSAT = async (factura: FacturaEmitida) => {
    const doCancel = async () => {
      try {
        setIsSubmitting(true);
        let data: any = null;

        try {
          const headers = await getApiHeaders();
          const apiUrl = getApiUrl();
          const resp = await fetch(`${apiUrl}/api/sat/cancelar-factura`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ venta_id: factura.id, motivo: '02' }),
          });

          const resJson = await resp.json().catch(() => ({}));
          if (resp.ok && resJson.success) {
            data = resJson;
          } else if (resJson.error) {
            throw new Error(resJson.error);
          } else {
            throw new Error(`Error del servidor al cancelar (${resp.status})`);
          }
        } catch (backendErr: any) {
          console.warn('Backend cancelacion fallo, intentando Edge Function:', backendErr);
          if (backendErr.message && (backendErr.message.includes('SAT') || backendErr.message.includes('Finkok') || backendErr.message.includes('['))) {
            throw backendErr;
          }

          const { data: edgeData, error: edgeError } = await supabase.functions.invoke('cancelar-factura', {
            body: { venta_id: factura.id, motivo: '02' },
          });

          if (edgeError) throw edgeError;
          if (edgeData?.error) throw new Error(edgeData.error);
          data = edgeData;
        }

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

  // ============================================================================
  // HANDLERS COMPLEMENTOS DE PAGO (REP)
  // ============================================================================

  const handleSelectClienteParaPago = async (cli: ClienteCatalogo) => {
    setPagoCliente(cli);
    setIsSelectClientePagoOpen(false);
    setSelectedFacturasMap({});
    setAbonosMap({});
    fetchSiguienteFolioPago(seriePago);

    try {
      setIsLoadingFacturasPendientes(true);
      const headers = await getApiHeaders();
      const params = new URLSearchParams();
      if (cli.id) params.append('cliente_id', cli.id);
      if (cli.rfc) params.append('cliente_rfc', cli.rfc);
      if (cli.nombre) params.append('cliente_nombre', cli.nombre);

      const res = await fetch(`${getApiUrl()}/api/sat/facturas-pendientes-cliente?${params.toString()}`, { headers });
      if (res.ok) {
        const json = await res.json();
        const docs = json.facturas || [];
        setFacturasPendientesCliente(docs);

        // Si solo hay 1 factura pendiente, la seleccionamos automáticamente
        if (docs.length === 1) {
          const f = docs[0];
          setSelectedFacturasMap({ [f.id]: true });
          setAbonosMap({ [f.id]: String(f.saldo_pendiente) });
        }
      } else {
        setFacturasPendientesCliente([]);
      }
    } catch (err) {
      console.error('Error buscando facturas pendientes del cliente:', err);
      setFacturasPendientesCliente([]);
    } finally {
      setIsLoadingFacturasPendientes(false);
    }
  };

  const handleToggleFacturaSeleccionada = (factura: any) => {
    const isCurrentlySelected = !!selectedFacturasMap[factura.id];
    const newMap = { ...selectedFacturasMap, [factura.id]: !isCurrentlySelected };
    setSelectedFacturasMap(newMap);

    const newAbonos = { ...abonosMap };
    if (!isCurrentlySelected) {
      newAbonos[factura.id] = String(factura.saldo_pendiente);
    } else {
      delete newAbonos[factura.id];
    }
    setAbonosMap(newAbonos);
  };

  const handleCambiarAbono = (facturaId: number, montoStr: string, maxSaldo: number) => {
    let num = parseFloat(montoStr);
    if (isNaN(num) || num < 0) num = 0;
    if (num > maxSaldo) num = maxSaldo;
    setAbonosMap(prev => ({ ...prev, [facturaId]: String(num) }));
  };

  const handlePagarSaldoCompleto = (facturaId: number, saldoPendiente: number) => {
    setSelectedFacturasMap(prev => ({ ...prev, [facturaId]: true }));
    setAbonosMap(prev => ({ ...prev, [facturaId]: String(saldoPendiente) }));
  };

  const totalAbonosCalculado = useMemo(() => {
    return Object.keys(selectedFacturasMap)
      .filter(id => selectedFacturasMap[Number(id)])
      .reduce((sum, id) => sum + (parseFloat(abonosMap[Number(id)] || '0') || 0), 0);
  }, [selectedFacturasMap, abonosMap]);

  const handleTimbrarPagoModal = async () => {
    if (!pagoCliente) {
      showAlert('Validación', 'Por favor selecciona un cliente receptor.');
      return;
    }

    const selectedIds = Object.keys(selectedFacturasMap).filter(id => selectedFacturasMap[Number(id)]);
    if (selectedIds.length === 0) {
      showAlert('Validación', 'Debes seleccionar al menos una factura con saldo pendiente.');
      return;
    }

    const doctosPayload = selectedIds.map(idStr => {
      const vId = Number(idStr);
      const monto = parseFloat(abonosMap[vId] || '0');
      return {
        venta_id: vId,
        importe_a_pagar: monto
      };
    }).filter(d => d.importe_a_pagar > 0);

    if (doctosPayload.length === 0) {
      showAlert('Validación', 'Ingresa un monto a pagar mayor a cero para las facturas marcadas.');
      return;
    }

    const totalCalculado = doctosPayload.reduce((sum, d) => sum + d.importe_a_pagar, 0);

    const doTimbrar = async () => {
      try {
        setIsSubmittingPago(true);
        const headers = await getApiHeaders();
        const payload = {
          cliente: {
            id: pagoCliente.id,
            nombre: pagoCliente.razon_social || pagoCliente.nombre,
            rfc: pagoCliente.rfc || 'XAXX010101000',
            codigo_postal: pagoCliente.codigo_postal || '31110',
            regimen_fiscal: pagoCliente.regimen_fiscal || '601',
          },
          fecha_pago: fechaPagoVal,
          forma_pago: formaPagoPago,
          referencia: referenciaPago.trim() || undefined,
          serie: seriePago,
          folio: folioPago,
          doctos: doctosPayload,
        };

        const res = await fetch(`${getApiUrl()}/api/sat/timbrar-pago`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });

        const resJson = await res.json().catch(() => ({}));
        if (!res.ok || !resJson.success) {
          throw new Error(resJson.error || `Error al timbrar pago (${res.status})`);
        }

        showAlert('Complemento Timbrado', `Se emitió el CFDI de Pago con folio ${resJson.folio} (UUID: ${resJson.uuid?.slice(0, 8)}...).`);
        setIsPagoModalOpen(false);
        fetchComplementosList();
        fetchHistorialFacturas();

        if (resJson.complemento) {
          exportarReciboPagoPDF(resJson.complemento, resJson.doctos || [], 'view');
        }
      } catch (err: any) {
        console.error('Error al timbrar complemento de pago:', err);
        showAlert('Error al Timbrar Pago', err.message || 'No se pudo timbrar el complemento de pago.');
      } finally {
        setIsSubmittingPago(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`¿Confirmas timbrar el Complemento de Pago por un total de $${totalCalculado.toLocaleString('es-MX', { minimumFractionDigits: 2 })} amparando ${doctosPayload.length} factura(s)?`)) {
        await doTimbrar();
      }
    } else {
      Alert.alert(
        'Confirmar Timbrado REP',
        `¿Deseas emitir el comprobante de pago por $${totalCalculado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Timbrar', onPress: doTimbrar }
        ]
      );
    }
  };

  const handlePrevisualizarReciboPago = async () => {
    if (!pagoCliente) {
      showAlert('Validación', 'Por favor selecciona un cliente para la vista previa.');
      return;
    }
    const selectedIds = Object.keys(selectedFacturasMap).filter(id => selectedFacturasMap[Number(id)]);
    if (selectedIds.length === 0) {
      showAlert('Validación', 'Selecciona al menos una factura.');
      return;
    }

    const doctosMock = selectedIds.map((idStr, idx) => {
      const vId = Number(idStr);
      const f = facturasPendientesCliente.find(fact => fact.id === vId) || {};
      const monto = parseFloat(abonosMap[vId] || '0');
      const saldoAnt = Number(f.saldo_pendiente || 0);
      return {
        id: idx + 1,
        folio: f.folio || String(vId),
        serie: f.serie || 'A',
        uuid_documento: f.cfdi_uuid || 'UUID-FACTURA-PENDIENTE',
        num_parcialidad: f.num_parcialidad_siguiente || 1,
        saldo_anterior: saldoAnt,
        importe_pagado: monto,
        saldo_insoluto: Math.max(0, saldoAnt - monto)
      };
    });

    const complementoMock = {
      serie: seriePago,
      folio: folioPago,
      cliente_nombre: pagoCliente.razon_social || pagoCliente.nombre,
      cliente_rfc: pagoCliente.rfc || 'XAXX010101000',
      cliente_cp: pagoCliente.codigo_postal || '31110',
      cliente_regimen: pagoCliente.regimen_fiscal || '601',
      fecha_pago: fechaPagoVal,
      forma_pago_sat: formaPagoPago,
      num_operacion: referenciaPago || 'Vista previa',
      monto_total: totalAbonosCalculado,
      cfdi_uuid: 'UUID-VISTA-PREVIA-BORRADOR'
    };

    try {
      const html = await generarReciboPagoHTML(complementoMock, doctosMock, true);
      setPreviewCustomHtml(html);
      setPreviewTitle(`Borrador Recibo de Pago: ${seriePago}${folioPago}`);
      setPreviewIsDraft(true);
      setPreviewVenta(null);
      setPreviewFacturaData({ ...complementoMock, complementos_pago_doctos: doctosMock });
      setPreviewXmlText('');
      setIsPagoModalOpen(false);
      setReturnToPagoModal(true);
      setPreviewModalVisible(true);
    } catch (err: any) {
      showAlert('Error en Vista Previa', err.message);
    }
  };

  const handleVerReciboPagoPDF = async (comp: any) => {
    try {
      setIsSubmitting(true);
      const html = await generarReciboPagoHTML(comp, comp.complementos_pago_doctos || [], false);
      let xmlContent = '';
      try {
        xmlContent = await retrieveXml({
          cfdi_uuid: comp.cfdi_uuid,
          cfdi_xml_url: comp.cfdi_xml_url,
          cliente: comp.cliente_nombre,
          folio: comp.folio,
        } as any);
      } catch (_) {}

      setPreviewCustomHtml(html);
      setPreviewTitle(`Recibo de Pago: ${cleanFolio(comp.folio) || comp.cfdi_uuid?.slice(0, 8)}`);
      setPreviewIsDraft(false);
      setPreviewVenta(null);
      setPreviewFacturaData(comp);
      setPreviewXmlText(xmlContent);
      setPreviewModalVisible(true);
    } catch (err: any) {
      showAlert('Error en PDF', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDescargarReciboPagoPDF = async (comp: any) => {
    try {
      await exportarReciboPagoPDF(comp, comp.complementos_pago_doctos || [], 'download');
    } catch (err: any) {
      showAlert('Error al Descargar PDF', err.message);
    }
  };

  const handleDescargarReciboXML = async (comp: any) => {
    try {
      const xmlText = await retrieveXml({
        cfdi_uuid: comp.cfdi_uuid,
        cfdi_xml_url: comp.cfdi_xml_url,
        cliente: comp.cliente_nombre,
        folio: comp.folio,
      } as any);

      if (!xmlText) {
        if (comp.cfdi_xml_url && comp.cfdi_xml_url.startsWith('http')) {
          if (Platform.OS === 'web') {
            window.open(comp.cfdi_xml_url, '_blank');
            return;
          }
        }
        showAlert('Aviso', 'El archivo XML de este complemento no está disponible en el servidor.');
        return;
      }

      const clienteSanitized = (comp.cliente_nombre || 'Cliente').replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
      const folioSanitized = cleanFolio(comp.folio || comp.cfdi_uuid?.slice(0, 8) || 'Pago').replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `${clienteSanitized}_Pago_${folioSanitized}.xml`;

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
        const fileUri = `${cacheDirectory}${fileName}`;
        await writeAsStringAsync(fileUri, xmlText, { encoding: 'utf8' as any });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, { mimeType: 'application/xml' });
        }
      }
    } catch (err: any) {
      showAlert('Error al Descargar XML', err.message);
    }
  };

  const handleCancelarReciboPago = async (comp: any) => {
    const doCancel = async () => {
      try {
        setIsSubmitting(true);
        const headers = await getApiHeaders();
        const res = await fetch(`${getApiUrl()}/api/sat/cancelar-pago`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ complemento_id: comp.id, uuid: comp.cfdi_uuid, motivo: '02' })
        });
        const resJson = await res.json().catch(() => ({}));
        if (!res.ok || !resJson.success) {
          throw new Error(resJson.error || 'Error cancelando el pago ante el SAT');
        }
        showAlert('Éxito', 'El complemento de pago ha sido cancelado ante el SAT correctamente.');
        fetchComplementosList();
        fetchHistorialFacturas();
      } catch (err: any) {
        showAlert('Error al Cancelar', err.message);
      } finally {
        setIsSubmitting(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`¿Estás seguro de cancelar ante el SAT el Complemento de Pago ${cleanFolio(comp.folio)} por $${Number(comp.monto_total || 0).toLocaleString('es-MX')}?`)) {
        await doCancel();
      }
    } else {
      Alert.alert('Cancelar Pago SAT', `¿Cancelar el comprobante ${cleanFolio(comp.folio)}?`, [
        { text: 'No', style: 'cancel' },
        { text: 'Sí, Cancelar', style: 'destructive', onPress: doCancel }
      ]);
    }
  };

  const handleIniciarCobroREP = async (factura: FacturaEmitida) => {
    const matchedCli = clientes.find(c => 
      (c.nombre && factura.cliente && c.nombre.trim().toLowerCase() === factura.cliente.trim().toLowerCase()) ||
      (c.rfc && (factura as any).cliente_rfc && c.rfc.trim().toUpperCase() === (factura as any).cliente_rfc.trim().toUpperCase())
    ) || {
      id: (factura as any).cliente_id || '',
      nombre: factura.cliente || 'Cliente General',
      rfc: (factura as any).cliente_rfc || 'XAXX010101000',
      codigo_postal: '31110',
      regimen_fiscal: '601',
    };

    setPagoCliente(matchedCli);
    setReferenciaPago(`Pago factura ${cleanFolio(factura.folio || factura.factura_referencia) || '#' + factura.id}`);
    setFormaPagoPago('03');
    setSeriePago('P');
    setIsPagoModalOpen(true);
    fetchSiguienteFolioPago('P');

    try {
      setIsLoadingFacturasPendientes(true);
      const headers = await getApiHeaders();
      const params = new URLSearchParams();
      if (matchedCli.id) params.append('cliente_id', matchedCli.id);
      if (matchedCli.rfc) params.append('cliente_rfc', matchedCli.rfc);
      if (matchedCli.nombre) params.append('cliente_nombre', matchedCli.nombre);

      const res = await fetch(`${getApiUrl()}/api/sat/facturas-pendientes-cliente?${params.toString()}`, { headers });
      if (res.ok) {
        const json = await res.json();
        const docs: any[] = json.facturas || [];
        setFacturasPendientesCliente(docs);

        const targetFactura = docs.find((d: any) => String(d.id) === String(factura.id)) || docs[0];
        if (targetFactura) {
          setSelectedFacturasMap({ [targetFactura.id]: true });
          setAbonosMap({ [targetFactura.id]: String(targetFactura.saldo_pendiente) });
        }
      }
    } catch (err) {
      console.warn('Error al cargar facturas para cobro:', err);
    } finally {
      setIsLoadingFacturasPendientes(false);
    }
  };

  const complementosFiltrados = useMemo(() => {
    return complementosList.filter(c => {
      if (filtroEstadoPago !== 'TODAS' && c.cfdi_estado !== filtroEstadoPago) return false;
      if (complementosSearch.trim()) {
        const q = normalizeText(complementosSearch);
        const cl = normalizeText(c.cliente_nombre || '');
        const fo = normalizeText(c.folio || '');
        const uu = normalizeText(c.cfdi_uuid || '');
        return cl.includes(q) || fo.includes(q) || uu.includes(q);
      }
      return true;
    });
  }, [complementosList, filtroEstadoPago, complementosSearch]);

  const clientesPagoFiltrados = useMemo(() => {
    if (!searchClientePago.trim()) return clientes;
    const q = normalizeText(searchClientePago);
    return clientes.filter(c =>
      normalizeText(c.nombre || '').includes(q) ||
      normalizeText(c.razon_social || '').includes(q) ||
      normalizeText(c.rfc || '').includes(q)
    );
  }, [clientes, searchClientePago]);

  // Filtrado de historial
  const facturasFiltradas = useMemo(() => {
    return historialFacturas.filter(f => {
      if (filtroEstado !== 'TODAS' && f.cfdi_estado !== filtroEstado) return false;
      if (historialSearch.trim()) {
        const q = normalizeText(historialSearch);
        const cl = normalizeText(f.cliente || '');
        const fo = normalizeText(f.folio || '');
        const uu = normalizeText(f.cfdi_uuid || '');
        return cl.includes(q) || fo.includes(q) || uu.includes(q);
      }
      return true;
    });
  }, [historialFacturas, filtroEstado, historialSearch]);

  const clientesFiltrados = useMemo(() => {
    if (!clientSearch.trim()) return clientes;
    const q = normalizeText(clientSearch);
    return clientes.filter(c =>
      normalizeText(c.nombre || '').includes(q) ||
      normalizeText(c.razon_social || '').includes(q) ||
      normalizeText(c.rfc || '').includes(q)
    );
  }, [clientes, clientSearch]);

  const categoriasMap = useMemo(() => {
    return new Map(categorias.map(c => [c.id, c.nombre]));
  }, [categorias]);

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

          <TouchableOpacity
            onPress={() => setActiveTab('pagos')}
            style={[
              styles.tabBtn,
              activeTab === 'pagos' && {
                borderBottomColor: '#801c1d',
                borderBottomWidth: 2.5,
              },
            ]}
          >
            <Ionicons
              name="cash-outline"
              size={18}
              color={activeTab === 'pagos' ? '#801c1d' : themeColors.textSecondary}
            />
            <Text
              style={[
                styles.tabBtnText,
                { color: activeTab === 'pagos' ? '#801c1d' : themeColors.textSecondary, fontWeight: activeTab === 'pagos' ? 'bold' : '500' },
              ]}
            >
              Complementos de Pago ({complementosList.length})
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
                  if (clientes.length === 0) {
                    fetchClientes();
                  }
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
                <CustomInput
                  label="Serie"
                  value={serie}
                  onChangeText={(val) => {
                    const clean = val.toUpperCase().trim();
                    setSerie(clean);
                    fetchSiguienteFolio(clean || 'A');
                  }}
                  placeholder="A"
                  autoCapitalize="characters"
                />
              </View>
              <View style={{ flex: 0.8 }}>
                <CustomInput
                  label="Folio"
                  value={folio}
                  onChangeText={setFolio}
                  placeholder="0001"
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 0.8 }}>
                <CustomInput label="Moneda" value={moneda} onChangeText={setMoneda} placeholder="MXN" autoCapitalize="characters" />
              </View>
              <View style={{ flex: 1.5 }}>
                <CustomInput label="Orden de compra *" value={ordenCompra} onChangeText={setOrdenCompra} placeholder="Ej. OC-2023-001" />
              </View>
            </View>
          </View>

          {/* SECCIÓN 3: PARTIDAS / CONCEPTOS A FACTURAR */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: themeColors.backgroundElement,
                borderColor: themeColors.border,
                position: 'relative',
                zIndex: activeDropdownIndex !== null ? 9999 : 1,
              },
            ]}
          >
            <View style={styles.cardHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="cart" size={18} color="#0284c7" />
                <Text style={[styles.cardTitle, { color: themeColors.text }]}>
                  3. Partidas / Conceptos a Facturar ({partidas.length})
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <TouchableOpacity onPress={handleAddPartida} style={[styles.quickSelectBtn, { borderColor: '#10b981', backgroundColor: '#10b98115' }]}>
                  <Ionicons name="add-circle" size={15} color="#10b981" />
                  <Text style={{ color: '#10b981', fontSize: 12, fontWeight: '700' }}>Agregar Partida</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ gap: Spacing.two, position: 'relative', zIndex: activeDropdownIndex !== null ? 9999 : 1 }}>
              {partidas.map((item, index) => {
                const cant = parseFloat(item.cantidad) || 0;
                const pu = parseFloat(item.precio_unitario) || 0;
                const subtotalPartida = cant * pu;
                const ivaPartida = item.objeto_imp === '02' ? subtotalPartida * 0.16 : 0;
                const totalPartida = subtotalPartida + ivaPartida;

                return (
                  <View
                    key={item.id || index}
                    style={[
                      styles.partidaBox,
                      {
                        borderColor: themeColors.border,
                        backgroundColor: themeColors.background,
                        position: 'relative',
                        zIndex: activeDropdownIndex === index ? 99999 : partidas.length - index,
                      },
                    ]}
                  >
                    <View style={styles.partidaHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                        <View style={[styles.partidaNumBadge, { backgroundColor: '#0284c7' }]}>
                          <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>#{index + 1}</Text>
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: 'bold', color: themeColors.text, flex: 1 }} numberOfLines={1}>
                          {item.descripcion || 'Nuevo Concepto'}
                        </Text>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <TouchableOpacity onPress={() => handleDuplicatePartida(index)} style={styles.partidaIconBtn}>
                          <Ionicons name="copy-outline" size={16} color={themeColors.textSecondary} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleRemovePartida(index)} style={styles.partidaIconBtn}>
                          <Ionicons name="trash-outline" size={16} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Descripción con Menú en Cascada del Catálogo */}
                    <View style={{ position: 'relative', zIndex: activeDropdownIndex === index ? 99999 : 1, marginBottom: 8 }}>
                      <Text style={[styles.fieldLabel, { color: themeColors.textSecondary, marginBottom: 4 }]}>
                        Descripción del Producto o Servicio *
                      </Text>
                      <View style={[styles.cascadeInputContainer, { backgroundColor: themeColors.background, borderColor: activeDropdownIndex === index ? '#0284c7' : themeColors.border }]}>
                        <TextInput
                          style={[styles.cascadeTextInput, { color: themeColors.text }]}
                          value={item.descripcion}
                          onChangeText={val => {
                            handleUpdatePartida(index, 'descripcion', val);
                            setActiveDropdownIndex(index);
                          }}
                          onFocus={() => setActiveDropdownIndex(index)}
                          onSubmitEditing={() => setActiveDropdownIndex(null)}
                          returnKeyType="done"
                          blurOnSubmit={false}
                          placeholder="Escribe o selecciona del catálogo en cascada..."
                          placeholderTextColor={themeColors.textSecondary}
                        />
                        {!!item.descripcion && (
                          <TouchableOpacity
                            onPress={() => {
                              handleUpdatePartida(index, 'descripcion', '');
                              setActiveDropdownIndex(index);
                            }}
                            style={{ padding: 4 }}
                          >
                            <Ionicons name="close-circle" size={16} color={themeColors.textSecondary} />
                          </TouchableOpacity>
                        )}
                        {!!item.descripcion && activeDropdownIndex === index && (
                          <TouchableOpacity
                            onPress={() => setActiveDropdownIndex(null)}
                            style={{ padding: 4 }}
                          >
                            <Ionicons name="checkmark-circle" size={18} color="#10b981" />
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          onPress={() => {
                            if (activeDropdownIndex === index) {
                              setActiveDropdownIndex(null);
                            } else {
                              setActiveDropdownIndex(index);
                            }
                          }}
                          style={{ padding: 4 }}
                        >
                          <Ionicons
                            name={activeDropdownIndex === index ? 'chevron-up' : 'chevron-down'}
                            size={18}
                            color="#0284c7"
                          />
                        </TouchableOpacity>
                      </View>

                      {/* Menú de Cascada Flotante */}
                      {activeDropdownIndex === index && (
                        <View style={[styles.cascadeDropdownMenu, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                          <View style={[styles.cascadeDropdownHeader, { borderBottomColor: themeColors.border, backgroundColor: themeColors.background }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Ionicons name="cube" size={13} color="#0284c7" />
                              <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.textSecondary, letterSpacing: 0.3 }}>
                                CATÁLOGO DE INVENTARIO ({getFilteredProductsForPartida(item.descripcion).length})
                              </Text>
                            </View>
                            <TouchableOpacity
                              onPress={() => setActiveDropdownIndex(null)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              style={{ padding: 4 }}
                            >
                              <Ionicons name="close" size={16} color={themeColors.textSecondary} />
                            </TouchableOpacity>
                          </View>

                          {/* Opción rápida para usar el texto escrito como concepto personalizado */}
                          {!!item.descripcion && item.descripcion.trim().length > 0 && (
                            <TouchableOpacity
                              activeOpacity={0.7}
                              onPress={() => setActiveDropdownIndex(null)}
                              style={[
                                styles.customConceptOption,
                                {
                                  borderBottomColor: themeColors.border + '50',
                                  backgroundColor: '#0284c715',
                                },
                              ]}
                            >
                              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#0284c725', alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="create-outline" size={14} color="#0284c7" />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: '#0284c7' }}>
                                  Usar "{item.descripcion.trim()}"
                                </Text>
                                <Text style={{ fontSize: 10, color: themeColors.textSecondary }}>
                                  Concepto libre / personalizado (sin vincular a catálogo)
                                </Text>
                              </View>
                              <View style={{ backgroundColor: '#0284c7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                                <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>Usar este texto</Text>
                              </View>
                            </TouchableOpacity>
                          )}

                          {getFilteredProductsForPartida(item.descripcion).length === 0 ? (
                            <View style={{ padding: 16, alignItems: 'center', gap: 8 }}>
                              <Ionicons name="search-outline" size={22} color={themeColors.textSecondary} style={{ opacity: 0.6 }} />
                              <Text style={{ color: themeColors.textSecondary, fontSize: 12, fontWeight: '600' }}>
                                Sin coincidencias en inventario
                              </Text>
                              <Text style={{ color: themeColors.textSecondary, fontSize: 11, textAlign: 'center', opacity: 0.8 }}>
                                Puedes usar lo que escribiste directamente como concepto personalizado o de servicio.
                              </Text>
                              {!!item.descripcion && item.descripcion.trim().length > 0 && (
                                <TouchableOpacity
                                  activeOpacity={0.8}
                                  onPress={() => setActiveDropdownIndex(null)}
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 6,
                                    backgroundColor: '#0284c7',
                                    paddingHorizontal: 14,
                                    paddingVertical: 7,
                                    borderRadius: 8,
                                    marginTop: 4,
                                  }}
                                >
                                  <Ionicons name="checkmark-circle" size={15} color="#fff" />
                                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                                    Usar "{item.descripcion.trim()}"
                                  </Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          ) : (
                            <ScrollView
                              nestedScrollEnabled={true}
                              keyboardShouldPersistTaps="handled"
                              style={{ maxHeight: 240 }}
                            >
                              {getFilteredProductsForPartida(item.descripcion).map(prod => {
                                const stock = Number(prod.stock_actual || 0);
                                const stockColor = stock === 0 ? '#ef4444' : stock <= 5 ? '#f59e0b' : '#10b981';
                                const catName = prod.categoria_id ? categoriasMap.get(prod.categoria_id) : null;
                                const precioVal = Number(prod.precio_unitario || prod.precio || 0);
                                const precioFormatted = new Intl.NumberFormat('es-MX', {
                                  style: 'currency',
                                  currency: 'MXN',
                                }).format(precioVal);

                                return (
                                  <TouchableOpacity
                                    key={prod.id}
                                    activeOpacity={0.7}
                                    onPress={() => handleSelectProductForPartida(index, prod)}
                                    style={[styles.cascadeItem, { borderBottomColor: themeColors.border + '35' }]}
                                  >
                                    <View style={{ flex: 1, marginRight: 12 }}>
                                      <Text
                                        style={{ fontSize: 12, fontWeight: '600', color: themeColors.text, lineHeight: 17, marginBottom: 4 }}
                                        numberOfLines={2}
                                        ellipsizeMode="tail"
                                      >
                                        {prod.nombre_oficial || (prod as any).nombre}
                                      </Text>

                                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                        {prod.sku_interno ? (
                                          <View style={[styles.skuBadge, { backgroundColor: themeColors.border + '60' }]}>
                                            <Text style={{ fontSize: 9, color: themeColors.textSecondary, fontWeight: '700' }}>
                                              {prod.sku_interno}
                                            </Text>
                                          </View>
                                        ) : null}

                                        {catName && (
                                          <Text style={{ fontSize: 10, color: themeColors.textSecondary }}>
                                            📁 {catName}
                                          </Text>
                                        )}

                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: stockColor }} />
                                          <Text style={{ fontSize: 10, color: stockColor, fontWeight: '700' }}>
                                            Stock: {stock}
                                          </Text>
                                        </View>

                                        {(prod.sat_code || prod.clave_sat || prod.clave_facturacion) ? (
                                          <Text style={{ fontSize: 10, color: themeColors.textSecondary }}>
                                            SAT: {prod.sat_code || prod.clave_sat || prod.clave_facturacion}
                                          </Text>
                                        ) : null}
                                      </View>
                                    </View>

                                    <View style={{ alignItems: 'flex-end', justifyContent: 'center', flexShrink: 0, minWidth: 70 }}>
                                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#10b981' }}>
                                        {precioFormatted}
                                      </Text>
                                      <Text style={{ fontSize: 9, color: themeColors.textSecondary, marginTop: 1 }}>
                                        /{prod.unidad || 'pza'}
                                      </Text>
                                    </View>
                                  </TouchableOpacity>
                                );
                              })}
                            </ScrollView>
                          )}
                        </View>
                      )}
                    </View>

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
          <View
            style={[
              styles.card,
              {
                backgroundColor: themeColors.backgroundElement,
                borderColor: themeColors.border,
                position: 'relative',
                zIndex: 0,
              },
            ]}
          >
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
                    <Ionicons name="receipt-outline" size={18} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>
                      Emitir y Timbrar Factura Oficial ante SAT
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      ) : activeTab === 'historial' ? (
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
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
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
                          <View
                            style={[
                              styles.statusBadge,
                              {
                                backgroundColor: factura.origen === 'FACTURA_DIRECTA' ? '#6366f118' : '#0284c718',
                                borderColor: factura.origen === 'FACTURA_DIRECTA' ? '#6366f150' : '#0284c750',
                                borderWidth: 1,
                              },
                            ]}
                          >
                            <Text
                              style={{
                                fontSize: 9,
                                fontWeight: '800',
                                color: factura.origen === 'FACTURA_DIRECTA' ? '#6366f1' : '#0284c7',
                              }}
                            >
                              {factura.origen === 'FACTURA_DIRECTA' ? 'Directa' : (factura.origenLabel || 'Venta')}
                            </Text>
                          </View>
                        </View>

                        <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 2 }}>
                          Folio: <Text style={{ fontWeight: 'bold', color: themeColors.text }}>{cleanFolio(factura.folio || factura.factura_referencia) || '--'}</Text> | Fecha: {factura.fecha || factura.created_at?.slice(0, 10) || '--'}
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
                          style={[styles.smallActionBtn, { borderColor: '#0284c7', backgroundColor: '#0284c7' + '15', paddingHorizontal: 10 }]}
                        >
                          <Ionicons name="eye-outline" size={16} color="#0284c7" />
                          <Text style={{ color: '#0284c7', fontSize: 11, fontWeight: '700' }}>Ver Factura</Text>
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
                            onPress={() => handleIniciarCobroREP(factura)}
                            style={[styles.smallActionBtn, { borderColor: '#801c1d', backgroundColor: '#801c1d15', paddingHorizontal: 10 }]}
                          >
                            <Ionicons name="cash-outline" size={16} color="#801c1d" />
                            <Text style={{ color: '#801c1d', fontSize: 11, fontWeight: '700' }}>Cobrar / REP</Text>
                          </TouchableOpacity>
                        )}

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
      ) : (
        /* PESTAÑA 3: COMPLEMENTOS DE PAGO (REP) */
        <View style={{ flex: 1, padding: Spacing.three, maxWidth: 1200, alignSelf: 'center', width: '100%' }}>
          {/* Header de Complementos de Pago */}
          <View style={{ flexDirection: isDesktop ? 'row' : 'column', justifyContent: 'space-between', alignItems: isDesktop ? 'center' : 'stretch', gap: 10, marginBottom: 14 }}>
            <View style={[styles.searchBox, { borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement, flex: 1 }]}>
              <Ionicons name="search" size={18} color={themeColors.textSecondary} />
              <TextInput
                style={[styles.searchInput, { color: themeColors.text }]}
                placeholder="Buscar por folio P0001, cliente, RFC o UUID fiscal..."
                placeholderTextColor={themeColors.textSecondary}
                value={complementosSearch}
                onChangeText={setComplementosSearch}
              />
              {!!complementosSearch && (
                <TouchableOpacity onPress={() => setComplementosSearch('')}>
                  <Ionicons name="close-circle" size={18} color={themeColors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              {(['TODAS', 'TIMBRADA', 'CANCELADA'] as const).map(est => (
                <TouchableOpacity
                  key={est}
                  onPress={() => setFiltroEstadoPago(est)}
                  style={[
                    styles.chipBtn,
                    {
                      borderColor: filtroEstadoPago === est ? '#801c1d' : themeColors.border,
                      backgroundColor: filtroEstadoPago === est ? '#801c1d' + '20' : themeColors.backgroundElement,
                    },
                  ]}
                >
                  <Text style={{ fontSize: 11, fontWeight: filtroEstadoPago === est ? '800' : '500', color: filtroEstadoPago === est ? '#801c1d' : themeColors.textSecondary }}>
                    {est}
                  </Text>
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                onPress={() => {
                  setPagoCliente(null);
                  setFacturasPendientesCliente([]);
                  setSelectedFacturasMap({});
                  setAbonosMap({});
                  setReferenciaPago('');
                  setFormaPagoPago('03');
                  setSeriePago('P');
                  fetchSiguienteFolioPago('P');
                  setIsPagoModalOpen(true);
                }}
                style={[styles.quickSelectBtn, { backgroundColor: '#801c1d', borderColor: '#801c1d', paddingHorizontal: 14, paddingVertical: 9 }]}
              >
                <Ionicons name="add-circle" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>+ Nuevo Complemento</Text>
              </TouchableOpacity>
            </View>
          </View>

          {isLoadingComplementos ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#801c1d" />
              <Text style={{ color: themeColors.textSecondary, marginTop: 8 }}>Cargando complementos de pago...</Text>
            </View>
          ) : complementosFiltrados.length === 0 ? (
            <View style={[styles.emptyContainer, { borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement }]}>
              <Ionicons name="card-outline" size={48} color={themeColors.textSecondary} />
              <Text style={[styles.emptyTitle, { color: themeColors.text }]}>No hay complementos de pago registrados</Text>
              <Text style={{ color: themeColors.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                Los pagos timbrados ante el SAT (individuales o multi-factura) aparecerán en esta sección.
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setPagoCliente(null);
                  setFacturasPendientesCliente([]);
                  setSelectedFacturasMap({});
                  setAbonosMap({});
                  setReferenciaPago('');
                  setFormaPagoPago('03');
                  setSeriePago('P');
                  fetchSiguienteFolioPago('P');
                  setIsPagoModalOpen(true);
                }}
                style={[styles.quickSelectBtn, { borderColor: '#801c1d', backgroundColor: '#801c1d' + '15', marginTop: 14 }]}
              >
                <Ionicons name="add-circle" size={16} color="#801c1d" />
                <Text style={{ color: '#801c1d', fontWeight: 'bold' }}>Emitir Primer Complemento de Pago</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }}>
              <View style={{ gap: 10 }}>
                {complementosFiltrados.map((comp) => {
                  const isCanceled = comp.cfdi_estado === 'CANCELADA';
                  const doctos = comp.complementos_pago_doctos || [];
                  const cleanFolioVal = cleanFolio(comp.folio) || '--';

                  return (
                    <View
                      key={comp.id}
                      style={[
                        styles.facturaRowCard,
                        {
                          backgroundColor: themeColors.backgroundElement,
                          borderColor: isCanceled ? '#ef4444' + '60' : themeColors.border,
                          flexDirection: 'column',
                          alignItems: 'stretch',
                          gap: 10,
                          padding: 14
                        },
                      ]}
                    >
                      {/* Cabecera de la Card */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={{ fontSize: 15, fontWeight: 'bold', color: themeColors.text }}>
                              {comp.cliente_nombre || 'Cliente'}
                            </Text>
                            <View
                              style={[
                                styles.statusBadge,
                                { backgroundColor: isCanceled ? '#ef444420' : '#10b98120' },
                              ]}
                            >
                              <Text style={{ fontSize: 10, fontWeight: '800', color: isCanceled ? '#ef4444' : '#10b981' }}>
                                {comp.cfdi_estado || 'TIMBRADA'}
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.statusBadge,
                                { backgroundColor: '#801c1d18', borderColor: '#801c1d40', borderWidth: 1 },
                              ]}
                            >
                              <Text style={{ fontSize: 9, fontWeight: '800', color: '#801c1d' }}>
                                CFDI REP 2.0
                              </Text>
                            </View>
                          </View>

                          <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 4 }}>
                            Folio Pago: <Text style={{ fontWeight: 'bold', color: '#801c1d' }}>{cleanFolioVal}</Text> | Fecha Pago: {comp.fecha_pago ? String(comp.fecha_pago).slice(0, 10) : '--'} | RFC: <Text style={{ fontWeight: '600', color: themeColors.text }}>{comp.cliente_rfc || 'N/A'}</Text>
                          </Text>

                          {comp.cfdi_uuid && (
                            <Text style={{ fontSize: 10, color: '#0284c7', marginTop: 3, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>
                              UUID: {comp.cfdi_uuid}
                            </Text>
                          )}
                        </View>

                        <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 11, color: themeColors.textSecondary, fontWeight: '700' }}>TOTAL PAGADO</Text>
                          <Text style={{ fontSize: 18, fontWeight: 'bold', color: isCanceled ? themeColors.textSecondary : '#15803d' }}>
                            ${Number(comp.monto_total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Text>
                        </View>
                      </View>

                      {/* Documentos Relacionados */}
                      {doctos.length > 0 && (
                        <View style={{ backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: themeColors.border }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: themeColors.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>
                            Documentos Relacionados ({doctos.length} Factura{doctos.length === 1 ? '' : 's'}):
                          </Text>
                          <View style={{ gap: 4 }}>
                            {doctos.map((doc: any, dIdx: number) => (
                              <View key={doc.id || dIdx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text style={{ fontSize: 11, color: themeColors.text }}>
                                  • Factura <Text style={{ fontWeight: '700' }}>{(doc.serie || 'A') + cleanFolio(doc.folio)}</Text> (Parcialidad {doc.num_parcialidad})
                                </Text>
                                <Text style={{ fontSize: 11, fontWeight: '700', color: '#15803d' }}>
                                  Abono: ${Number(doc.importe_pagado || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                  {Number(doc.saldo_insoluto || 0) <= 0.01 ? (
                                    <Text style={{ color: '#16a34a', fontSize: 10 }}> (Saldada)</Text>
                                  ) : (
                                    <Text style={{ color: themeColors.textSecondary, fontSize: 10 }}> (Saldo Rest: ${Number(doc.saldo_insoluto).toFixed(2)})</Text>
                                  )}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      {/* Barra de Acciones */}
                      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, borderTopWidth: 1, borderTopColor: themeColors.border, paddingTop: 8 }}>
                        <TouchableOpacity
                          onPress={() => handleVerReciboPagoPDF(comp)}
                          style={[styles.smallActionBtn, { borderColor: '#801c1d', backgroundColor: '#801c1d15', paddingHorizontal: 10 }]}
                        >
                          <Ionicons name="eye-outline" size={16} color="#801c1d" />
                          <Text style={{ color: '#801c1d', fontSize: 11, fontWeight: '700' }}>Ver Recibo PDF</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => handleDescargarReciboPagoPDF(comp)}
                          style={[styles.smallActionBtn, { borderColor: '#0284c7', backgroundColor: '#0284c715' }]}
                        >
                          <Ionicons name="download-outline" size={16} color="#0284c7" />
                          <Text style={{ color: '#0284c7', fontSize: 11, fontWeight: '700' }}>Descargar PDF</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => handleDescargarReciboXML(comp)}
                          style={[styles.smallActionBtn, { borderColor: '#10b981', backgroundColor: '#10b98115' }]}
                        >
                          <Ionicons name="code-download" size={16} color="#10b981" />
                          <Text style={{ color: '#10b981', fontSize: 11, fontWeight: '700' }}>XML</Text>
                        </TouchableOpacity>

                        {!isCanceled && (
                          <TouchableOpacity
                            onPress={() => handleCancelarReciboPago(comp)}
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
        <Pressable style={styles.modalOverlay} onPress={() => setIsClientModalOpen(false)}>
          <Pressable onPress={e => e.stopPropagation()} style={[styles.modalContent, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="people" size={20} color="#0284c7" />
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Seleccionar Cliente del Catálogo</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TouchableOpacity onPress={fetchClientes} disabled={isLoadingClientes} style={[{ padding: 6 }, Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined]}>
                  <Ionicons name="refresh" size={20} color={isLoadingClientes ? themeColors.textSecondary : "#0284c7"} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setIsClientModalOpen(false)}
                  hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                  style={[{ padding: 6 }, Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined]}
                >
                  <Ionicons name="close" size={22} color={themeColors.text} />
                </TouchableOpacity>
              </View>
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
              {!!clientSearch && (
                <TouchableOpacity onPress={() => setClientSearch('')}>
                  <Ionicons name="close-circle" size={16} color={themeColors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {isLoadingClientes ? (
              <View style={{ padding: 32, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <ActivityIndicator size="small" color="#0284c7" />
                <Text style={{ fontSize: 13, color: themeColors.textSecondary }}>Cargando catálogo de clientes...</Text>
              </View>
            ) : clientesFiltrados.length === 0 ? (
              <View style={{ padding: 30, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <Ionicons name="alert-circle-outline" size={36} color={themeColors.textSecondary} style={{ opacity: 0.6 }} />
                <Text style={{ fontSize: 13, color: themeColors.textSecondary, textAlign: 'center' }}>
                  {clientSearch.trim()
                    ? `No se encontraron clientes que coincidan con "${clientSearch}".`
                    : 'No hay clientes disponibles en el catálogo.'}
                </Text>
                <TouchableOpacity
                  onPress={fetchClientes}
                  style={[styles.quickSelectBtn, { borderColor: '#0284c7', backgroundColor: '#0284c7' + '15', marginTop: 4 }]}
                >
                  <Ionicons name="refresh" size={14} color="#0284c7" />
                  <Text style={{ color: '#0284c7', fontSize: 12, fontWeight: '700' }}>Recargar Clientes</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 400 }}>
                <View style={{ gap: 6 }}>
                  {clientesFiltrados.map(c => {
                    const displayTitle = c.razon_social && c.razon_social !== c.nombre
                      ? `${c.razon_social} (${c.nombre})`
                      : (c.razon_social || c.nombre || 'Cliente');
                    return (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => handleSelectClient(c)}
                        style={[styles.clientOptionItem, { borderColor: themeColors.border, backgroundColor: themeColors.background }, Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined]}
                      >
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={{ fontSize: 14, fontWeight: 'bold', color: themeColors.text }}>
                            {displayTitle}
                          </Text>
                          <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 2 }}>
                            RFC: <Text style={{ fontWeight: '600', color: themeColors.text }}>{c.rfc || 'Sin RFC'}</Text> | CP: {c.codigo_postal || 'N/D'} | Régimen: {c.regimen_fiscal || '601'}
                          </Text>
                          {c.uso_cfdi && (
                            <Text style={{ fontSize: 10, color: '#0284c7', marginTop: 1 }}>
                              Uso CFDI: {c.uso_cfdi}
                            </Text>
                          )}
                        </View>
                        <Ionicons name="chevron-forward" size={18} color="#0284c7" />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* MODAL PRINCIPAL: NUEVO COMPLEMENTO DE PAGO MULTI-FACTURA */}
      <Modal visible={isPagoModalOpen} animationType="slide" transparent onRequestClose={() => setIsPagoModalOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setIsPagoModalOpen(false)}>
          <Pressable onPress={e => e.stopPropagation()} style={[styles.modalContent, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, maxWidth: 850, maxHeight: '90%' }]}>
            {/* Header del Modal */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="cash" size={22} color="#801c1d" />
                <View>
                  <Text style={[styles.modalTitle, { color: themeColors.text }]}>Nuevo Complemento de Recepción de Pagos (REP)</Text>
                  <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>CFDI 4.0 con Pagos 2.0 • Folio {seriePago}{folioPago}</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setIsPagoModalOpen(false)}
                hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                style={[{ padding: 6 }, Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined]}
              >
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
              {/* 1. SELECCIÓN DE CLIENTE RECEPTOR */}
              <View style={[styles.card, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: themeColors.text, fontSize: 13 }]}>1. Cliente Receptor (Quien Realiza el Depósito)</Text>
                  {pagoCliente && (
                    <TouchableOpacity
                      onPress={() => {
                        setPagoCliente(null);
                        setFacturasPendientesCliente([]);
                        setSelectedFacturasMap({});
                        setAbonosMap({});
                        setSearchClientePago('');
                      }}
                      style={[styles.quickSelectBtn, { borderColor: '#801c1d', backgroundColor: '#801c1d15' }, Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined]}
                    >
                      <Ionicons name="swap-horizontal" size={14} color="#801c1d" />
                      <Text style={{ color: '#801c1d', fontSize: 12, fontWeight: '700' }}>Cambiar Cliente</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {pagoCliente ? (
                  <View style={{ backgroundColor: themeColors.backgroundElement, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: themeColors.border }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: themeColors.text }}>
                      {pagoCliente.razon_social || pagoCliente.nombre}
                    </Text>
                    <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 3 }}>
                      RFC: <Text style={{ fontWeight: '700', color: '#0284c7' }}>{pagoCliente.rfc || 'XAXX010101000'}</Text> | CP: {pagoCliente.codigo_postal || '31110'} | Régimen: {pagoCliente.regimen_fiscal || '601'}
                    </Text>
                  </View>
                ) : (
                  <View style={{ gap: 8 }}>
                    <View style={[styles.searchBox, { borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement }]}>
                      <Ionicons name="search" size={18} color={themeColors.textSecondary} />
                      <TextInput
                        style={[styles.searchInput, { color: themeColors.text }]}
                        placeholder="Buscar cliente por nombre o RFC..."
                        placeholderTextColor={themeColors.textSecondary}
                        value={searchClientePago}
                        onChangeText={setSearchClientePago}
                        autoFocus
                      />
                      {!!searchClientePago && (
                        <TouchableOpacity onPress={() => setSearchClientePago('')}>
                          <Ionicons name="close-circle" size={16} color={themeColors.textSecondary} />
                        </TouchableOpacity>
                      )}
                    </View>

                    <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                      <View style={{ gap: 6 }}>
                        {clientesPagoFiltrados.slice(0, 15).map(c => {
                          const displayTitle = c.razon_social && c.razon_social !== c.nombre
                            ? `${c.razon_social} (${c.nombre})`
                            : (c.razon_social || c.nombre || 'Cliente');
                          return (
                            <TouchableOpacity
                              key={c.id}
                              onPress={() => handleSelectClienteParaPago(c)}
                              style={[
                                styles.clientOptionItem,
                                { borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement },
                                Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined
                              ]}
                            >
                              <View style={{ flex: 1, paddingRight: 8 }}>
                                <Text style={{ fontSize: 13, fontWeight: 'bold', color: themeColors.text }}>{displayTitle}</Text>
                                <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 1 }}>RFC: {c.rfc || 'Sin RFC'} | CP: {c.codigo_postal || 'N/D'}</Text>
                              </View>
                              <Ionicons name="checkmark-circle-outline" size={18} color="#801c1d" />
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* 2. FACTURAS CON SALDO PENDIENTE DEL CLIENTE */}
              {pagoCliente && (
                <View style={[styles.card, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                  <View style={styles.cardHeader}>
                    <Text style={[styles.cardTitle, { color: themeColors.text, fontSize: 13 }]}>
                      2. Facturas PPD con Saldo Pendiente ({facturasPendientesCliente.length})
                    </Text>
                    <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                      Selecciona una o más facturas para aplicar el pago
                    </Text>
                  </View>

                  {isLoadingFacturasPendientes ? (
                    <View style={{ padding: 24, alignItems: 'center', gap: 6 }}>
                      <ActivityIndicator size="small" color="#801c1d" />
                      <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>Consultando facturas del cliente...</Text>
                    </View>
                  ) : facturasPendientesCliente.length === 0 ? (
                    <View style={{ padding: 20, alignItems: 'center', backgroundColor: themeColors.backgroundElement, borderRadius: 8 }}>
                      <Ionicons name="checkmark-done-circle" size={32} color="#16a34a" />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text, marginTop: 4 }}>
                        ¡El cliente no tiene facturas con saldo pendiente!
                      </Text>
                      <Text style={{ fontSize: 11, color: themeColors.textSecondary, textAlign: 'center', marginTop: 2 }}>
                        Todas sus facturas están liquidadas o no se han emitido facturas PPD.
                      </Text>
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {facturasPendientesCliente.map((f: any) => {
                        const isSelected = !!selectedFacturasMap[f.id];
                        const saldoPend = Number(f.saldo_pendiente || 0);
                        const abonoVal = abonosMap[f.id] ?? '';

                        return (
                          <View
                            key={f.id}
                            style={{
                              padding: 12,
                              borderRadius: 8,
                              borderWidth: 1.5,
                              borderColor: isSelected ? '#801c1d' : themeColors.border,
                              backgroundColor: isSelected ? '#801c1d08' : themeColors.backgroundElement,
                              gap: 10
                            }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <TouchableOpacity
                                onPress={() => handleToggleFacturaSeleccionada(f)}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
                              >
                                <Ionicons
                                  name={isSelected ? "checkbox" : "square-outline"}
                                  size={22}
                                  color={isSelected ? "#801c1d" : themeColors.textSecondary}
                                />
                                <View>
                                  <Text style={{ fontSize: 14, fontWeight: '800', color: themeColors.text }}>
                                    Factura {f.fullFolio || f.folio}
                                  </Text>
                                  <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                                    Fecha: {f.fecha} • Total Factura: ${f.precio_total?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                  </Text>
                                </View>
                              </TouchableOpacity>

                              <View style={{ alignItems: 'flex-end' }}>
                                <Text style={{ fontSize: 10, color: themeColors.textSecondary, fontWeight: '700' }}>SALDO PENDIENTE</Text>
                                <Text style={{ fontSize: 14, fontWeight: '800', color: '#b91c1c' }}>
                                  ${saldoPend.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                </Text>
                              </View>
                            </View>

                            {/* Fila de Abono cuando está seleccionada */}
                            {isSelected && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: themeColors.border, paddingTop: 8 }}>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text }}>
                                  Monto a abonar ($):
                                </Text>
                                <TextInput
                                  style={{
                                    height: 38,
                                    borderWidth: 1,
                                    borderColor: '#801c1d',
                                    borderRadius: 6,
                                    paddingHorizontal: 10,
                                    fontSize: 14,
                                    fontWeight: '700',
                                    color: themeColors.text,
                                    backgroundColor: themeColors.background,
                                    width: 140
                                  }}
                                  value={abonoVal}
                                  onChangeText={(txt) => handleCambiarAbono(f.id, txt, saldoPend)}
                                  keyboardType="numeric"
                                  placeholder="0.00"
                                />
                                <TouchableOpacity
                                  onPress={() => handlePagarSaldoCompleto(f.id, saldoPend)}
                                  style={{
                                    backgroundColor: '#801c1d18',
                                    borderColor: '#801c1d',
                                    borderWidth: 1,
                                    paddingHorizontal: 10,
                                    paddingVertical: 6,
                                    borderRadius: 6
                                  }}
                                >
                                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#801c1d' }}>Pagar Todo (${saldoPend.toFixed(2)})</Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}

              {/* 3. DATOS DE LA TRANSFERENCIA O DEPÓSITO */}
              {pagoCliente && (
                <View style={[styles.card, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                  <Text style={[styles.cardTitle, { color: themeColors.text, fontSize: 13, marginBottom: 12 }]}>
                    3. Datos del Depósito / Pago Recibido
                  </Text>

                  {/* Banner Total del Pago */}
                  <View style={{ backgroundColor: '#f0fdf4', borderColor: '#22c55e', borderWidth: 1.5, borderRadius: 8, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <View>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#15803d', textTransform: 'uppercase' }}>
                        Monto Total del Depósito
                      </Text>
                      <Text style={{ fontSize: 11, color: '#166534' }}>
                        Suma total de abonos a las facturas seleccionadas
                      </Text>
                    </View>
                    <Text style={{ fontSize: 22, fontWeight: '900', color: '#15803d' }}>
                      ${totalAbonosCalculado.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>

                  <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 12, marginBottom: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Fecha del Depósito *</Text>
                      <TextInput
                        style={[styles.input, { color: themeColors.text, backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                        value={fechaPagoVal}
                        onChangeText={setFechaPagoVal}
                        placeholder="AAAA-MM-DD"
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Serie y Folio de Pago</Text>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TextInput
                          style={[styles.input, { width: 50, color: themeColors.text, backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, textAlign: 'center', fontWeight: '800' }]}
                          value={seriePago}
                          onChangeText={setSeriePago}
                        />
                        <TextInput
                          style={[styles.input, { flex: 1, color: themeColors.text, backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, fontWeight: '800' }]}
                          value={folioPago}
                          onChangeText={setFolioPago}
                        />
                      </View>
                    </View>
                  </View>

                  <Text style={[styles.fieldLabel, { color: themeColors.textSecondary, marginBottom: 6 }]}>Forma de Pago SAT *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {FORMAS_PAGO.map(fp => (
                        <TouchableOpacity
                          key={fp.code}
                          onPress={() => setFormaPagoPago(fp.code)}
                          style={[
                            styles.chipBtn,
                            {
                              borderColor: formaPagoPago === fp.code ? '#801c1d' : themeColors.border,
                              backgroundColor: formaPagoPago === fp.code ? '#801c1d20' : themeColors.backgroundElement
                            }
                          ]}
                        >
                          <Text style={{ fontSize: 11, fontWeight: formaPagoPago === fp.code ? '800' : '500', color: formaPagoPago === fp.code ? '#801c1d' : themeColors.textSecondary }}>
                            {fp.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>

                  <CustomInput
                    label="Referencia Bancaria / No. Operación (Opcional)"
                    value={referenciaPago}
                    onChangeText={setReferenciaPago}
                    placeholder="Ej. Transferencia SPEI #982341"
                  />
                </View>
              )}
            </ScrollView>

            {/* Footer de Acciones */}
            <View style={[styles.modalFooter, { borderTopColor: themeColors.border, gap: 10, padding: 14, flexDirection: 'row', justifyContent: 'flex-end' }]}>
              <TouchableOpacity
                onPress={() => setIsPagoModalOpen(false)}
                disabled={isSubmittingPago}
                style={[styles.modalActionBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, paddingHorizontal: 16 }]}
              >
                <Text style={[styles.modalActionText, { color: themeColors.text }]}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handlePrevisualizarReciboPago}
                disabled={isSubmittingPago || totalAbonosCalculado <= 0}
                style={[styles.modalActionBtn, { backgroundColor: '#801c1d15', borderColor: '#801c1d', paddingHorizontal: 16 }]}
              >
                <Ionicons name="eye-outline" size={17} color="#801c1d" />
                <Text style={[styles.modalActionText, { color: '#801c1d', fontSize: 13, fontWeight: '700' }]}>Vista Previa</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleTimbrarPagoModal}
                disabled={isSubmittingPago || totalAbonosCalculado <= 0}
                style={[styles.modalActionBtn, { backgroundColor: '#801c1d', borderColor: '#801c1d', paddingHorizontal: 18 }]}
              >
                {isSubmittingPago ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                    <Text style={[styles.modalActionText, { color: '#fff', fontSize: 13, fontWeight: '800' }]}>
                      Timbrar Complemento (${totalAbonosCalculado.toLocaleString('es-MX', { minimumFractionDigits: 2 })})
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* MODAL DE VISTA PREVIA INTERACTIVA DE FACTURA / RECIBO DE PAGO */}
      <FacturaPreviewModal
        visible={previewModalVisible}
        onClose={() => {
          setPreviewModalVisible(false);
          if (returnToPagoModal) {
            setReturnToPagoModal(false);
            setIsPagoModalOpen(true);
          }
        }}
        venta={previewVenta}
        facturaData={previewFacturaData}
        xmlText={previewXmlText}
        customHtml={previewCustomHtml}
        isDraft={previewIsDraft}
        title={previewTitle}
        onConfirmTimbrar={previewIsDraft && !previewCustomHtml ? () => {
          setPreviewModalVisible(false);
          handleTimbrarFactura();
        } : undefined}
      />
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
  skuBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  cascadeInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  cascadeTextInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  },
  cascadeDropdownMenu: {
    position: 'absolute',
    top: 68,
    left: 0,
    right: 0,
    borderWidth: 1,
    borderRadius: 12,
    zIndex: 99999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 12,
    ...Platform.select({
      web: {
        boxShadow: '0 12px 32px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)',
      },
    }),
    overflow: 'hidden',
  },
  cascadeDropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  cascadeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  customConceptOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },
  modalFooter: {
    borderTopWidth: 1,
    paddingTop: 12,
  },
  modalActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  modalActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
