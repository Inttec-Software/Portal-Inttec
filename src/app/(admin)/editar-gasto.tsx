import React, { useEffect, useState, useMemo, createElement } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Keyboard,
  Modal,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import NetInfo from '@react-native-community/netinfo';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import {
  supabase,
  CatalogoItem,
  SubcategoriaItem,
  ClienteItem,
  ProveedorItem,
  Usuario,
  AuthService,
  SucursalCliente,
  recalculateVentaTotals,
} from '@/services/supabase';
import { SyncService, base64ToArrayBuffer } from '@/services/sync';
import { PushNotificationService } from '@/services/pushNotifications';
import { getComentariosPlaceholder } from '@/utils/helpers';
import { optimizeImage } from '@/utils/imageOptimizer';
import StepIndicator from '@/components/StepIndicator';
import CustomInput from '@/components/CustomInput';
import CustomButton from '@/components/CustomButton';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import ImageViewerModal from '@/components/ImageViewerModal';

const showAlert = (title: string, message: string) => { if (Platform.OS === 'web') { window.alert(title + '\n\n' + message); } else { Alert.alert(title, message); } };

const cleanJustificacion = (text: string | null | undefined): string => {
  if (!text) return '';
  let cleaned = text;
  // Strip ALERTA IA prefix
  cleaned = cleaned.replace(/^\[ALERTA IA:[^\]]*\]\n\n/, '');
  // Strip Consumo compartido
  cleaned = cleaned.replace(/\n\n\[Consumo compartido con:[^\]]*\]/g, '');
  // Strip Propina incluida
  cleaned = cleaned.replace(/\n\n\[Propina incluida en ticket:[^\]]*\]/g, '');
  // Strip Monto de propina dejado aparte
  cleaned = cleaned.replace(/\n\n\[Monto de propina dejado aparte:[^\]]*\]/g, '');
  // Strip Proveedor a agregar
  cleaned = cleaned.replace(/\[Proveedor a agregar:[^\]]*\]\n\n?/g, '');
  return cleaned.trim();
};

export default function EditarGastoForm() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Catálogos desde Supabase
  const [categorias, setCategorias] = useState<CatalogoItem[]>([]);
  const [subcategorias, setSubcategorias] = useState<SubcategoriaItem[]>([]);
  const [clientes, setClientes] = useState<CatalogoItem[]>([]);
  const [proveedores, setProveedores] = useState<ProveedorItem[]>([]);
  const [proveedorSearch, setProveedorSearch] = useState('');
  const [showProvDropdown, setShowProvDropdown] = useState(false);
  const [modalNuevoProveedorVisible, setModalNuevoProveedorVisible] = useState(false);
  const [nuevoProvNombre, setNuevoProvNombre] = useState('');
  const [nuevoProvRfc, setNuevoProvRfc] = useState('');
  const [isSavingProv, setIsSavingProv] = useState(false);

  // Paso 1: Evidencia
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageExt, setImageExt] = useState<string>('jpg');
  const [viewerVisible, setViewerVisible] = useState(false);

  // Estados para compartir consumo con otros empleados
  const [allUsers, setAllUsers] = useState<Usuario[]>([]);
  const [selectedEmpleados, setSelectedEmpleados] = useState<Usuario[]>([]);
  const [showEmpList, setShowEmpList] = useState(false);

  // Paso 2: Detalles
  const [monto, setMonto] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [comentarioProveedor, setComentarioProveedor] = useState('');
  const [facturado, setFacturado] = useState<boolean | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [facturaUri, setFacturaUri] = useState<string | null>(null);
  const [_facturaBase64, setFacturaBase64] = useState<string | null>(null);
  const [_facturaExt, setFacturaExt] = useState<string | null>(null);
  const [motivoSinFactura, setMotivoSinFactura] = useState('');
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);

  const getTodayFriendly = () => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const [fechaComprobante, setFechaComprobante] = useState(getTodayFriendly());
  const [tipoServicioProyecto, setTipoServicioProyecto] = useState<'Servicio' | 'Proyecto' | 'Venta' | 'Operativo' | null>(null);
  const [detalleServicioProyecto, setDetalleServicioProyecto] = useState('');
  const [sucursal, setSucursal] = useState('');
  const [sucursalesCliente, setSucursalesCliente] = useState<SucursalCliente[]>([]);
  const [showSucursalDropdown, setShowSucursalDropdown] = useState(false);
  const [sucursalSearch, setSucursalSearch] = useState('');
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'tarjeta' | 'tarjeta_credito' | 'tarjeta_debito'>('efectivo');
  const [tipoTarjeta, setTipoTarjeta] = useState<'BBVA' | 'AMEX' | 'MARRIOT' | 'BANORTE' | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateValue, setDateValue] = useState(new Date());
  const [alertaPolitica, setAlertaPolitica] = useState<string | null>(null);
  const [facturaStatus, setFacturaStatus] = useState<'SI' | 'PENDIENTE' | 'NO' | null>(null);
  const [comentarioPendiente, setComentarioPendiente] = useState('');
  
  const [incluyePropina, setIncluyePropina] = useState<boolean | null>(null);
  const [montoPropina, setMontoPropina] = useState<string>('');
  const [esComida, setEsComida] = useState<boolean>(false);




  const formatFriendlyToDb = (friendlyStr: string) => {
    if (!friendlyStr) return '';
    const parts = friendlyStr.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD
    }
    return friendlyStr;
  };

  const onChangeDate = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (selectedDate) {
      setDateValue(selectedDate);
      const dd = String(selectedDate.getDate()).padStart(2, '0');
      const mm = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const yyyy = selectedDate.getFullYear();
      setFechaComprobante(`${dd}/${mm}/${yyyy}`);
    }
  };

  // Paso 3: Categorización
  const [selectedCategoria, setSelectedCategoria] = useState<string>('');
  const [selectedSubcategoria, setSelectedSubcategoria] = useState<string>('');
  const [selectedCliente, setSelectedCliente] = useState<string>('');
  const [clienteSearch, setClienteSearch] = useState('');
  const [justificacion, setJustificacion] = useState('');

  // Dropdown list visibility toggles (Mock pickers since RN Picker is external)
  const [showCatDropdown, setShowCatDropdown] = useState(false);
  const [showSubDropdown, setShowSubDropdown] = useState(false);
  const [showCliDropdown, setShowCliDropdown] = useState(false);

  const alertaLocal = useMemo(() => {
    const alerts: string[] = [];

    // 1. Validar límite de alimentos general de $280 MXN por persona (comida + propina)
    const valMonto = Number(monto);
    if (valMonto && !isNaN(valMonto) && selectedCategoria) {
      const isAlimentos = esComida;

      const cantidadPersonas = 1 + selectedEmpleados.length;
      const limiteCalculado = 280 * cantidadPersonas;
      const totalGasto = valMonto + (esComida && incluyePropina === false ? Number(montoPropina || 0) : 0);

      if (isAlimentos && totalGasto > limiteCalculado) {
        alerts.push(`Límite de alimentos excedido: el límite general por comida es de $${limiteCalculado} MXN para ${cantidadPersonas} personas (Total con Propina: $${totalGasto} MXN)`);
      }
    }

    const keywordsInfraccion = [
      'cigarro', 'tabaco', 'papita', 'galleta', 'chucheria', 'dulce', 'fritura', 'chocolate',
      'gansito', 'sabritas', 'barcel', 'marinela', 'alcohol', 'cerveza'
    ];
    const textToCheck = `${justificacion} ${proveedor}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const infraccionesDetectadas = keywordsInfraccion.filter(keyword => textToCheck.includes(keyword));
    
    if (infraccionesDetectadas.length > 0) {
      alerts.push(`Artículos no permitidos detectados (${infraccionesDetectadas.join(', ')})`);
    }

    return alerts.length > 0 ? alerts.join(' | ') : null;
  }, [monto, selectedCategoria, justificacion, proveedor, selectedEmpleados, esComida, incluyePropina, montoPropina]);

  const loadCatalogos = async () => {
    try {
      const [catRes, subRes, cliRes, usrRes, sucRes, provRes] = await Promise.all([
        supabase.from('categorias').select('*').order('nombre'),
        supabase.from('subcategorias').select('*').order('nombre'),
        supabase.from('clientes').select('*').order('nombre'),
        supabase.from('usuarios').select('*').order('nombre'),
        supabase.from('sucursales_cliente').select('*').order('nombre'),
        supabase.from('proveedores').select('*').order('nombre'),
      ]);

      if (catRes.data) setCategorias(catRes.data);
      if (subRes.data) setSubcategorias(subRes.data);
      if (cliRes.data) setClientes(cliRes.data);
      if (usrRes.data) setAllUsers(usrRes.data);
      if (sucRes.data) setSucursalesCliente(sucRes.data);
      if (provRes.data) setProveedores(provRes.data);
    } catch (err) {
      console.error('Error loading catalogs:', err);
    }
  };

  const [_isLoadingGasto, setIsLoadingGasto] = useState(true);

  useEffect(() => {
    const init = async () => {
      const user = await AuthService.getCurrentUser();
      if (!user) {
        router.replace('/');
        return;
      }
      setCurrentUser(user);
      await loadCatalogos();

      if (id) {
        try {
          const { data, error } = await supabase
            .from('gastos')
            .select('*')
            .eq('id', id)
            .single();

          if (error) throw error;
          if (data) {
            // Pre-fill state
            if (data.foto_url) setImageUri(data.foto_url);
            setMonto(data.monto.toString());
            
            if (data.fecha_comprobante) {
              const parts = data.fecha_comprobante.split('-'); // YYYY-MM-DD
              if (parts.length === 3) {
                const dd = parts[2];
                const mm = parts[1];
                const yyyy = parts[0];
                setFechaComprobante(`${dd}/${mm}/${yyyy}`);
                const parsedDate = new Date(parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10));
                setDateValue(parsedDate);
              }
            }

            setProveedor(data.proveedor || '');
            if (!data.proveedor && data.justificacion) {
              const provMatch = data.justificacion.match(/\[Proveedor a agregar:\s*([^\]]+)\]/);
              if (provMatch) {
                setComentarioProveedor(provMatch[1].trim());
              }
            }
            setTipoServicioProyecto(data.tipo_servicio_proyecto as any || null);
            setDetalleServicioProyecto(data.detalle_servicio_proyecto || '');
            setSucursal(data.sucursal || '');
            setMetodoPago(data.metodo_pago as any || 'efectivo');
            setTipoTarjeta(data.tipo_tarjeta as any || null);
            setJustificacion(cleanJustificacion(data.justificacion));
            setSelectedCategoria(data.categoria || '');
            setSelectedSubcategoria(data.subcategoria || '');
            setSelectedCliente(data.cliente || '');
            if (data.motivo_sin_factura?.startsWith('PENDIENTE_ENTREGA')) {
              setFacturado(false);
              setFacturaStatus('PENDIENTE');
              const partes = data.motivo_sin_factura.split('PENDIENTE_ENTREGA:');
              if (partes.length > 1 && partes[1].trim() !== '') {
                setComentarioPendiente(partes[1].trim());
              }
            } else if (data.facturado === false) {
              setFacturado(false);
              setFacturaStatus('NO');
            } else {
              setFacturado(true);
              setFacturaStatus('SI');
            }
            
            setMotivoSinFactura(data.motivo_sin_factura || '');
            if (data.factura_url) setFacturaUri(data.factura_url);
            
            const hasShared = data.justificacion && (
              data.justificacion.includes('[Consumo compartido con:') ||
              data.justificacion.includes('[Propina incluida')
            );
            const isMeal = (data.categoria && (
              data.categoria.toLowerCase().includes('alimento') ||
              data.categoria.toLowerCase().includes('comida') ||
              data.categoria.toLowerCase().includes('consumo')
            )) || hasShared;
            setEsComida(!!isMeal);

            // Si el gasto ya fue guardado antes y tenía propina, es difícil inferir de la justificación, 
            // pero podemos asumir que incluyePropina = true para que no requiera el montoPropina forzado.
            setIncluyePropina(true); 
          }
        } catch {
          showAlert('Error', 'No se pudo cargar el gasto a editar.');
          router.replace('/(admin)/dashboard');
        } finally {
          setIsLoadingGasto(false);
        }
      } else {
        setIsLoadingGasto(false);
      }
    };
    init();
  }, [router, id]);

  // Solicitar permiso de cámara
  const requestCameraPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'web') return true;
    const cameraStatus = await ImagePicker.requestCameraPermissionsAsync();
    if (cameraStatus.status !== 'granted') {
      showAlert(
        'Permiso de cámara requerido',
        'Necesitamos permiso de la cámara para capturar la evidencia del ticket.'
      );
      return false;
    }
    return true;
  };

  // Solicitar permiso de galería
  const requestLibraryPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'web') return true;
    const libraryStatus = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (libraryStatus.status !== 'granted') {
      showAlert(
        'Permiso de galería requerido',
        'Necesitamos permiso de la galería para seleccionar la imagen del ticket.'
      );
      return false;
    }
    return true;
  };

  const handleCapturePhoto = async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: Platform.OS !== 'web',
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        const optimized = await optimizeImage(result.assets[0].uri);
        setImageUri(optimized.uri);
        setImageBase64(optimized.base64 || null);
        setAlertaPolitica(null);
      }
    } catch (err) {
      console.error('Camera capture error:', err);
      if (Platform.OS === 'web') {
        // En la web si falla launchCameraAsync (por ejemplo, sin webcam), redirigimos a la galería
        await handleSelectGallery();
      } else {
        showAlert('Error', 'No se pudo abrir la cámara.');
      }
    }
  };

  const handleSelectGallery = async () => {
    const hasPermission = await requestLibraryPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        const optimized = await optimizeImage(result.assets[0].uri);
        setImageUri(optimized.uri);
        setImageBase64(optimized.base64 || null);
        setImageExt('jpg');
        setAlertaPolitica(null);
      }
    } catch (err) {
      console.error('Gallery select error:', err);
      showAlert('Error', 'No se pudo abrir la galería.');
    }
  };

  const handleSelectDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        setImageUri(file.uri);
        const ext = file.name ? file.name.split('.').pop()?.toLowerCase() || 'jpg' : 'jpg';
        setImageExt(ext === 'pdf' ? 'pdf' : 'jpg');
        
        let base64Str = '';
        if (Platform.OS === 'web') {
           const res = await fetch(file.uri);
           const blob = await res.blob();
           base64Str = await new Promise<string>((resolve, reject) => {
             const reader = new FileReader();
             reader.onloadend = () => {
               const b64 = reader.result as string;
               resolve(b64.split(',')[1]);
             };
             reader.onerror = reject;
             reader.readAsDataURL(blob);
           });
        } else {
           base64Str = await FileSystem.readAsStringAsync(file.uri, {
             encoding: FileSystem.EncodingType.Base64,
           });
        }
        setImageBase64(base64Str);
        setAlertaPolitica(null);
      }
    } catch (err) {
      console.error('Document select error:', err);
      showAlert('Error', 'No se pudo seleccionar el archivo.');
    }
  };

  // Métodos para seleccionar y capturar factura
  const _handleCaptureFactura = async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: Platform.OS !== 'web',
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        setFacturaUri(result.assets[0].uri);
        setFacturaBase64(result.assets[0].base64 || null);
        setFacturaExt('jpg');
      }
    } catch (err) {
      console.error('Invoice camera capture error:', err);
      if (Platform.OS === 'web') {
        await handleSelectFacturaGallery();
      } else {
        showAlert('Error', 'No se pudo abrir la cámara.');
      }
    }
  };

  const handleSelectFacturaGallery = async () => {
    const hasPermission = await requestLibraryPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        setFacturaUri(result.assets[0].uri);
        setFacturaBase64(result.assets[0].base64 || null);
        setFacturaExt('jpg');
      }
    } catch (err) {
      console.error('Invoice gallery select error:', err);
      showAlert('Error', 'No se pudo abrir la galería.');
    }
  };


  // Filtrar subcategorías según la categoría seleccionada
  const activeCategoriaId = categorias.find((c) => c.nombre === selectedCategoria)?.id;
  const filteredSubcategorias = subcategorias.filter(
    (s) => s.categoria_id === activeCategoriaId
  );

  const handleAddNewCliente = async (nombre: string) => {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .insert([{ nombre: nombre.trim() }])
        .select();
      if (error) throw error;
      if (data && data.length > 0) {
        const newCli = data[0];
        setClientes(prev => [...prev, newCli].sort((a, b) => a.nombre.localeCompare(b.nombre)));
        setSelectedCliente(newCli.nombre);
      } else {
        const { data: allCli } = await supabase.from('clientes').select('*').order('nombre');
        if (allCli) {
          setClientes(allCli);
          setSelectedCliente(nombre.trim());
        }
      }
      setClienteSearch('');
      setShowCliDropdown(false);
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo agregar el cliente.');
    }
  };

  const handleCrearNuevoProveedor = async () => {
    if (!nuevoProvNombre.trim()) {
      showAlert('Validación', 'El nombre o razón social del proveedor es obligatorio.');
      return;
    }

    const cleanRfc = nuevoProvRfc.trim().toUpperCase();
    if (cleanRfc && cleanRfc.length !== 12 && cleanRfc.length !== 13) {
      showAlert('Validación', 'El RFC debe tener exactamente 12 o 13 caracteres.');
      return;
    }

    setIsSavingProv(true);
    try {
      const { data, error } = await supabase
        .from('proveedores')
        .insert([
          {
            nombre: nuevoProvNombre.trim(),
            rfc: cleanRfc || null,
          },
        ])
        .select();

      if (error) throw error;

      const created = data && data[0] ? data[0] : { id: Date.now().toString(), nombre: nuevoProvNombre.trim(), rfc: cleanRfc || null };

      setProveedores(prev => [...prev, created].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setProveedor(created.nombre);
      setComentarioProveedor('');
      setProveedorSearch('');
      setNuevoProvNombre('');
      setNuevoProvRfc('');
      setModalNuevoProveedorVisible(false);
      showAlert('Éxito', `Proveedor "${created.nombre}" agregado y seleccionado.`);
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo registrar el proveedor.');
    } finally {
      setIsSavingProv(false);
    }
  };

  // Guardar Gasto (Finalizar)
  const handleSaveGasto = async () => {
    if (!currentUser) return;
    
    // Validar campos requeridos
    if (!monto || isNaN(Number(monto))) {
      showAlert('Validación', 'Por favor ingresa un monto válido.');
      setCurrentStep(2);
      return;
    }

    const fechaRegex = /^\d{2}\/\d{2}\/\d{4}$/;
    if (!fechaRegex.test(fechaComprobante)) {
      showAlert('Validación', 'Por favor ingresa la fecha en formato DD/MM/AAAA (ej. 09/06/2026).');
      setCurrentStep(2);
      return;
    }

    if (!proveedor.trim() && !comentarioProveedor.trim()) {
      showAlert('Validación', 'Por favor indica en el campo "Proveedor a agregar" el nombre del proveedor para registrarlo.');
      setCurrentStep(2);
      return;
    }

    if (!selectedCategoria) {
      showAlert('Validación', 'Por favor selecciona una categoría.');
      return;
    }

    if (!selectedSubcategoria) {
      showAlert('Validación', 'Por favor selecciona una subcategoría.');
      return;
    }

    if (!selectedCliente.trim()) {
      showAlert('Validación', 'Por favor selecciona o ingresa el cliente o proyecto asignado.');
      return;
    }
    
    if (!sucursal || !sucursal.trim()) {
      showAlert('Validación', 'Por favor selecciona la sucursal del cliente.');
      return;
    }

    if (!tipoServicioProyecto) {
      showAlert('Validación', 'Por favor selecciona si es Servicio, Proyecto, Venta u Operativo.');
      return;
    }

    if (!detalleServicioProyecto.trim()) {
      showAlert('Validación', 'Por favor ingresa el detalle del Servicio, Proyecto, Venta u Operativo.');
      return;
    }

    if (!justificacion.trim()) {
      showAlert('Validación', 'Por favor escribe una justificación del gasto.');
      return;
    }

    if (facturado === null) {
      showAlert('Validación', 'Por favor especifica si el gasto está facturado.');
      setCurrentStep(2);
      return;
    }

    if (facturado === false) {
      if (!motivoSinFactura.trim()) {
        showAlert('Validación', 'Por favor especifica el motivo por el cual no se cuenta con factura.');
        setCurrentStep(2);
        return;
      }
      if (motivoSinFactura.trim() === 'PENDIENTE_ENTREGA') {
        showAlert('Validación', 'Por favor explica por qué la factura está pendiente.');
        setCurrentStep(2);
        return;
      }
    }

    setIsSubmitting(false);
    
    const dbFecha = formatFriendlyToDb(fechaComprobante);
    
    const totalGasto = Number(monto) + (esComida && incluyePropina === false ? Number(montoPropina || 0) : 0);
    
    let finalJustificacion = justificacion.trim();
    if (!proveedor.trim() && comentarioProveedor.trim()) {
      finalJustificacion = `[Proveedor a agregar: ${comentarioProveedor.trim()}]\n\n${finalJustificacion}`;
    }
    if (esComida && selectedEmpleados.length > 0) {
      const nombresShared = selectedEmpleados.map(e => e.nombre).join(', ');
      finalJustificacion = `${finalJustificacion}\n\n[Consumo compartido con: ${nombresShared} (Total: ${1 + selectedEmpleados.length} personas)]`;
    }
    if (esComida && incluyePropina !== null) {
      finalJustificacion = `${finalJustificacion}\n\n[Propina incluida en ticket: ${incluyePropina ? 'Sí' : 'No'}]`;
      if (incluyePropina === false && montoPropina) {
        finalJustificacion = `${finalJustificacion}\n\n[Monto de propina dejado aparte: $${montoPropina} MXN]`;
      }
    }
    const combinedAlert = [alertaPolitica, alertaLocal].filter(Boolean).join(' | ');
    if (combinedAlert) {
      finalJustificacion = `[ALERTA IA: ${combinedAlert}]\n\n${finalJustificacion}`;
    }
    
    const gastoPayload = {
      monto: totalGasto,
      categoria: selectedCategoria,
      subcategoria: selectedSubcategoria || null,
      metodo_pago: metodoPago,
      justificacion: finalJustificacion,
      fecha_comprobante: dbFecha,
      proveedor: proveedor.trim() || null,
      cliente: selectedCliente || null,
      sucursal: sucursal.trim() || null,
      tipo_tarjeta: tipoTarjeta,
      ubicacion_registro: 'Móvil',
      estado: null,
      facturado: facturado,
      motivo_sin_factura: facturado ? null : (facturaStatus === 'PENDIENTE' ? `PENDIENTE_ENTREGA: ${comentarioPendiente}` : motivoSinFactura.trim() || null),
      tipo_servicio_proyecto: tipoServicioProyecto,
      detalle_servicio_proyecto: detalleServicioProyecto.trim(),
    };

    setIsSubmitting(true);

    try {
      const netState = await NetInfo.fetch();
      
      if (!netState.isConnected) {
        showAlert('Sin conexión', 'Necesitas conexión a internet para editar un gasto devuelto.');
        setIsSubmitting(false);
        return;
      }

      // En línea: Subir foto y guardar en Supabase
      let publicUrl = imageUri; // Mantener la actual si no hay nueva base64
      if (imageBase64) {
        const contentType = imageExt === 'pdf' ? 'application/pdf' : 'image/jpeg';
        const fileName = `${currentUser.id}/${Date.now()}.${imageExt}`;
        const arrayBuffer = base64ToArrayBuffer(imageBase64);

        const { error: uploadError } = await supabase.storage
          .from('tickets')
          .upload(fileName, arrayBuffer, { contentType, upsert: true });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('tickets').getPublicUrl(fileName);
        publicUrl = urlData.publicUrl;
      }



      const updateData: any = {
        ...gastoPayload,
        status: 'PENDING',
        rejection_feedback: null,
      };

      if (imageBase64) {
        updateData.foto_url = publicUrl;
      }
      


      // Obtener el venta_id actual antes de actualizar para saber si estaba vinculado
      const { data: oldGasto } = await supabase
        .from('gastos')
        .select('venta_id')
        .eq('id', id)
        .single();

      const { error: dbError } = await supabase
        .from('gastos')
        .update(updateData)
        .eq('id', id);

      if (dbError) throw dbError;

      // Si el gasto estaba vinculado a una venta, recalculamos sus totales
      if (oldGasto && oldGasto.venta_id) {
        await recalculateVentaTotals(oldGasto.venta_id);
      }

      showAlert('Éxito', 'Gasto modificado correctamente y enviado a revisión.');

      router.replace('/(admin)/dashboard');
    } catch (err: any) {
      showAlert('Error al guardar', err.message || 'No se pudo guardar el gasto.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextStep = () => {
    if (currentStep === 1) {
      if (!imageUri) {
        showAlert('Evidencia requerida', 'Por favor toma una fotografía o selecciona un ticket.');
        return;
      }
      if (esComida) {
        if (incluyePropina === null) {
          showAlert('Validación', 'Por favor especifica si el ticket incluye propina.');
          return;
        }
        if (incluyePropina === false && (!montoPropina || isNaN(Number(montoPropina)) || Number(montoPropina) < 0)) {
          showAlert('Validación', 'Por favor ingresa un monto de propina válido.');
          return;
        }
      }
    }
    if (currentStep === 2) {
      if (!monto || isNaN(Number(monto))) {
        showAlert('Validación', 'Por favor ingresa un monto válido.');
        return;
      }
      const fechaRegex = /^\d{2}\/\d{2}\/\d{4}$/;
      if (!fechaRegex.test(fechaComprobante)) {
        showAlert('Validación', 'Por favor ingresa la fecha en formato DD/MM/AAAA (ej. 09/06/2026).');
        return;
      }

      if (metodoPago !== 'efectivo' && !tipoTarjeta) {
        showAlert('Validación', 'Por favor selecciona la tarjeta utilizada (BBVA, AMEX, MARRIOT, BANORTE).');
        return;
      }
      if (facturado === null) {
        showAlert('Validación', 'Por favor especifica si el gasto está facturado.');
        return;
      }
      if (facturado === false && facturaStatus === 'PENDIENTE' && !comentarioPendiente.trim()) {
        showAlert('Validación', 'Por favor explica por qué la factura está pendiente.');
        return;
      }
      if (facturado === false && facturaStatus === 'NO' && (!motivoSinFactura || !motivoSinFactura.trim())) {
        showAlert('Validación', 'Por favor explica el motivo por el cual no se cuenta con factura.');
        return;
      }
      if (!proveedor.trim() && !comentarioProveedor.trim()) {
        showAlert('Validación', 'Por favor indica en el campo "Proveedor a agregar" el nombre del proveedor.');
        return;
      }
    }
    setCurrentStep((prev) => prev + 1);
  };

  const prevStep = () => {
    setCurrentStep((prev) => prev - 1);
  };


  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const isAnyDropdownOpen = !!(showEmpList || showCatDropdown || showSubDropdown || showCliDropdown);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/dashboard')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Registrar Gasto</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            onPress={() => {
              setShowEmpList(false);
              setShowCatDropdown(false);
              setShowSubDropdown(false);
              setShowCliDropdown(false);
              setShowProvDropdown(false);
            }}
            style={{ flex: 1 }}
          >
            <StepIndicator
                currentStep={currentStep}
                steps={['Evidencia', 'Detalles', 'Categoría']}
                onStepPress={(step) => {
                  if (step < currentStep) {
                    setCurrentStep(step);
                  }
                }}
              />

          {/* PASO 1: Evidencia e IA */}
          {currentStep === 1 && (
            <View style={styles.stepContainer}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                1. Sube tu Ticket de Gasto
              </Text>
              
              <View style={[styles.imageCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                {imageUri ? (
                  <View style={styles.previewContainer}>
                    <TouchableOpacity 
                      onPress={() => {
                        if (imageExt !== 'pdf') {
                          setActivePreviewUrl(imageUri);
                          setViewerVisible(true);
                        }
                      }}
                      activeOpacity={imageExt === 'pdf' ? 1 : 0.7}
                    >
                      {imageExt === 'pdf' ? (
                        <View style={[styles.previewImage, { justifyContent: 'center', alignItems: 'center', backgroundColor: themeColors.backgroundElement }]}>
                          <Ionicons name="document-text" size={64} color={themeColors.danger} />
                          <Text style={{ color: themeColors.text, marginTop: Spacing.one, fontWeight: '500' }}>Documento PDF</Text>
                        </View>
                      ) : (
                        <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.removeImageBtn}
                      onPress={() => {
                        setImageUri(null);
                        setImageBase64(null);
                        setImageExt('jpg');
                      }}
                    >
                      <Ionicons name="close" size={20} color="#ffffff" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.uploadPlaceholder}>
                    <Ionicons name="receipt-outline" size={64} color={themeColors.textSecondary} />
                    <Text style={[styles.placeholderText, { color: themeColors.textSecondary }]}>
                      Sin comprobante adjunto
                    </Text>
                  </View>
                )}
              </View>

              <View style={{ flexDirection: 'column', gap: Spacing.one, marginTop: Spacing.two }}>
                <View style={{ flexDirection: 'row', gap: Spacing.one }}>
                  <TouchableOpacity
                    style={[{ flex: 1, backgroundColor: themeColors.primary, borderRadius: 16, height: 90, justifyContent: 'center', alignItems: 'center', shadowColor: themeColors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 }]}
                    onPress={handleCapturePhoto}
                  >
                    <Ionicons name="camera" size={32} color="#ffffff" />
                    <Text style={{ color: '#ffffff', marginTop: 8, fontWeight: '700', fontSize: 14 }}>Cámara</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[{ flex: 1, backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, borderWidth: 1, borderRadius: 16, height: 90, justifyContent: 'center', alignItems: 'center' }]}
                    onPress={handleSelectGallery}
                  >
                    <Ionicons name="images" size={32} color={themeColors.text} />
                    <Text style={{ color: themeColors.text, marginTop: 8, fontWeight: '700', fontSize: 14 }}>Galería</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[{ width: '100%', backgroundColor: themeColors.backgroundElement, borderColor: themeColors.primary, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 16, height: 70, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 12 }]}
                  onPress={handleSelectDocument}
                >
                  <Ionicons name="document-text" size={28} color={themeColors.primary} />
                  <Text style={{ color: themeColors.primary, fontWeight: '700', fontSize: 15 }}>Subir Documento (PDF o Imagen)</Text>
                </TouchableOpacity>
              </View>

              {/* Pregunta si es Comida */}
              <View style={[styles.innerCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, marginTop: Spacing.two, marginBottom: Spacing.one }]}>
                <Text style={[styles.selectorLabel, { color: themeColors.text, fontSize: 13, marginBottom: Spacing.one }]}>
                  ¿Este gasto es de una comida (Alimentos)? *
                </Text>
                <View style={styles.paymentSelector}>
                  <TouchableOpacity
                    onPress={() => {
                      setEsComida(true);
                    }}
                    style={[
                      styles.paymentOption,
                      {
                        backgroundColor: esComida ? themeColors.accent : themeColors.backgroundElement,
                        borderColor: esComida ? 'transparent' : themeColors.border,
                        flex: 1,
                        alignItems: 'center',
                        paddingVertical: Spacing.one,
                      },
                    ]}
                  >
                    <Text style={[styles.paymentOptionText, { color: esComida ? '#ffffff' : themeColors.text, fontSize: 12 }]}>
                      Sí
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      setEsComida(false);
                      setIncluyePropina(null);
                      setMontoPropina('');
                      setSelectedEmpleados([]);
                    }}
                    style={[
                      styles.paymentOption,
                      {
                        backgroundColor: !esComida ? themeColors.accent : themeColors.backgroundElement,
                        borderColor: !esComida ? 'transparent' : themeColors.border,
                        flex: 1,
                        alignItems: 'center',
                        paddingVertical: Spacing.one,
                      },
                    ]}
                  >
                    <Text style={[styles.paymentOptionText, { color: !esComida ? '#ffffff' : themeColors.text, fontSize: 12 }]}>
                      No
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {esComida && (
                <>
                  {/* Selector de Empleados Compartidos */}
                  <View style={[styles.customDropdownContainer, { marginTop: Spacing.two, zIndex: 50 }]}>
                    <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>
                      ¿Con cuántos empleados compartiste este consumo?
                    </Text>
                    <TouchableOpacity
                      style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                      onPress={() => setShowEmpList(!showEmpList)}
                    >
                      <Text style={{ color: selectedEmpleados.length > 0 ? themeColors.text : themeColors.textSecondary }}>
                        {selectedEmpleados.length === 0
                          ? 'Solo yo (1 persona)'
                          : `Yo + ${selectedEmpleados.length} empleado(s) (${1 + selectedEmpleados.length} personas)`
                        }
                      </Text>
                      <Ionicons name={showEmpList ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                    </TouchableOpacity>

                    {showEmpList && (
                      <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', zIndex: 1000 }}>
                        <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, maxHeight: 200 }]}>
                          <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 180 }} keyboardShouldPersistTaps="handled">
                            {allUsers
                              .filter(u => u.id !== currentUser?.id)
                              .map((user) => {
                                const isSelected = selectedEmpleados.some(e => e.id === user.id);
                                return (
                                  <TouchableOpacity
                                    key={user.id}
                                    style={[
                                      styles.dropdownItem,
                                      {
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                      }
                                    ]}
                                    onPress={() => {
                                      if (isSelected) {
                                        setSelectedEmpleados(prev => prev.filter(e => e.id !== user.id));
                                      } else {
                                        setSelectedEmpleados(prev => [...prev, user]);
                                      }
                                    }}
                                  >
                                    <Text style={{ color: themeColors.text }}>{user.nombre}</Text>
                                    <Ionicons
                                      name={isSelected ? 'checkbox-outline' : 'square-outline'}
                                      size={20}
                                      color={isSelected ? themeColors.accent : themeColors.textSecondary}
                                    />
                                  </TouchableOpacity>
                                );
                              })}
                          </ScrollView>
                        </View>
                      </Pressable>
                    )}
                  </View>

                  {imageUri && (
                    <View style={[styles.innerCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, marginTop: Spacing.two, marginBottom: Spacing.two }]}>
                      <Text style={[styles.selectorLabel, { color: themeColors.text, fontSize: 13, marginBottom: Spacing.one }]}>
                        ¿El ticket incluye propina? *
                      </Text>
                      <View style={styles.paymentSelector}>
                        <TouchableOpacity
                          onPress={() => {
                            setIncluyePropina(true);
                            setMontoPropina('');
                          }}
                          style={[
                            styles.paymentOption,
                            {
                              backgroundColor: incluyePropina === true ? themeColors.accent : themeColors.backgroundElement,
                              borderColor: incluyePropina === true ? 'transparent' : themeColors.border,
                              flex: 1,
                              alignItems: 'center',
                              paddingVertical: Spacing.one,
                            },
                          ]}
                        >
                          <Text style={[styles.paymentOptionText, { color: incluyePropina === true ? '#ffffff' : themeColors.text, fontSize: 12 }]}>
                            Sí
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => {
                            setIncluyePropina(false);
                          }}
                          style={[
                            styles.paymentOption,
                            {
                              backgroundColor: incluyePropina === false ? themeColors.accent : themeColors.backgroundElement,
                              borderColor: incluyePropina === false ? 'transparent' : themeColors.border,
                              flex: 1,
                              alignItems: 'center',
                              paddingVertical: Spacing.one,
                            },
                          ]}
                        >
                          <Text style={[styles.paymentOptionText, { color: incluyePropina === false ? '#ffffff' : themeColors.text, fontSize: 12 }]}>
                            No
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {incluyePropina === false && (
                        <View style={{ marginTop: Spacing.two }}>
                          <CustomInput
                            label="¿Cuánto se dejó de propina? ($ MXN) *"
                            placeholder="Monto de la propina"
                            keyboardType="decimal-pad"
                            value={montoPropina}
                            onChangeText={(val) => setMontoPropina(val.replace(',', '.'))}
                            iconName="cash-outline"
                          />
                        </View>
                      )}
                    </View>
                  )}
                </>
              )}

              <View style={styles.scanWrapper}>
                <View style={styles.footerNav}>
                  <View style={{ flex: 1 }} />
                  <CustomButton title="Siguiente" onPress={nextStep} style={styles.navBtn} />
                </View>
              </View>


            </View>
          )}

          {/* PASO 2: Detalles Físicos */}
          {currentStep === 2 && (
            <View style={styles.stepContainer}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                2. Detalles de la Compra
              </Text>

              {(alertaPolitica || alertaLocal) && (
                <View style={[styles.alertBanner, { backgroundColor: themeColors.danger + '15', borderColor: themeColors.danger }]}>
                  <Ionicons name="warning-outline" size={22} color={themeColors.danger} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.alertTitle, { color: themeColors.danger }]}>Alerta de Políticas de Gasto</Text>
                    <Text style={[styles.alertText, { color: themeColors.text }]}>
                      {[alertaPolitica, alertaLocal].filter(Boolean).join('\n')}
                    </Text>
                  </View>
                </View>
              )}

              <CustomInput
                label="Monto ($ MXN) *"
                placeholder="0.00"
                keyboardType="decimal-pad"
                value={monto}
                onChangeText={(val) => setMonto(val.replace(',', '.'))}
                iconName="logo-usd"
              />

              {incluyePropina === false && montoPropina ? (
                <Text style={{ fontSize: 13, color: themeColors.textSecondary, marginTop: -Spacing.one, marginBottom: Spacing.two, fontStyle: 'italic', paddingLeft: Spacing.one }}>
                  Total del Gasto (Ticket + Propina): ${(Number(monto || 0) + Number(montoPropina)).toFixed(2)} MXN
                </Text>
              ) : null}

              <View style={{ position: 'relative' }}>
                <CustomInput
                  label="Fecha de Gasto *"
                  placeholder="Selecciona la fecha"
                  value={fechaComprobante}
                  editable={false}
                  iconName="calendar-outline"
                />
                {Platform.OS === 'web' ? (
                  createElement('input', {
                    type: 'date',
                    style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 100 },
                    onClick: (e: any) => {
                      try { e.target.showPicker(); } catch (err) {}
                    },
                    onChange: (e: any) => {
                      if (e.target.value) {
                        const parts = e.target.value.split('-');
                        if (parts.length === 3) {
                          const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                          setDateValue(d);
                          const dd = String(d.getDate()).padStart(2, '0');
                          const mm = String(d.getMonth() + 1).padStart(2, '0');
                          const yyyy = d.getFullYear();
                          setFechaComprobante(`${dd}/${mm}/${yyyy}`);
                        }
                      }
                    }
                  })
                ) : (
                  <TouchableOpacity 
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}
                    onPress={() => { Keyboard.dismiss(); setShowDatePicker(true); }}
                  />
                )}
              </View>

                  {showDatePicker && (
                    <View style={{
                      backgroundColor: themeColors.backgroundElement,
                      borderRadius: BorderRadius.medium,
                      padding: Spacing.two,
                      borderWidth: 1,
                      borderColor: themeColors.border,
                      marginTop: -Spacing.two,
                      marginBottom: Spacing.two
                    }}>
                      <DateTimePicker
                        value={dateValue}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={onChangeDate}
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

              {/* Mensaje Informativo de Proveedor */}
              <View style={{ marginBottom: Spacing.half, marginTop: Spacing.one }}>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: themeColors.primary + '15',
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: BorderRadius.medium,
                  borderWidth: 1,
                  borderColor: themeColors.primary + '30',
                }}>
                  <Ionicons name="information-circle-outline" size={20} color={themeColors.primary} />
                  <Text style={{ fontSize: 13, color: themeColors.text, fontWeight: '500', flex: 1 }}>
                    Si no se encuentra tu proveedor déjalo en blanco
                  </Text>
                </View>
              </View>

              {/* Selector de Proveedores con Buscador */}
              <View style={[styles.customDropdownContainer, { zIndex: 1000 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.half }}>
                  <Text style={[styles.dropdownLabel, { color: themeColors.text, marginBottom: 0 }]}>Proveedor / Comercio</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setNuevoProvNombre(proveedorSearch.trim());
                      setNuevoProvRfc('');
                      setModalNuevoProveedorVisible(true);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      backgroundColor: themeColors.primary + '15',
                      paddingHorizontal: Spacing.one,
                      paddingVertical: 4,
                      borderRadius: BorderRadius.medium,
                    }}
                  >
                    <Ionicons name="add-circle" size={16} color={themeColors.primary} />
                    <Text style={{ color: themeColors.primary, fontWeight: '700', fontSize: 12 }}>+ Nuevo Proveedor</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[
                    styles.dropdownTrigger,
                    {
                      backgroundColor: themeColors.backgroundElement,
                      borderColor: themeColors.border,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }
                  ]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowProvDropdown(!showProvDropdown);
                    setShowEmpList(false);
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                    <Ionicons name="business-outline" size={18} color={themeColors.textSecondary} />
                    <Text
                      style={{
                        color: proveedor ? themeColors.text : themeColors.textSecondary,
                        fontSize: 14,
                        flex: 1,
                      }}
                      numberOfLines={1}
                    >
                      {proveedor || 'Seleccionar proveedor'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {!!proveedor && (
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          setProveedor('');
                        }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="close-circle" size={18} color={themeColors.textSecondary} />
                      </TouchableOpacity>
                    )}
                    <Ionicons name={showProvDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                  </View>
                </TouchableOpacity>

                {showProvDropdown && (
                  <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', zIndex: 1000, marginTop: 4 }}>
                    <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                      <CustomInput
                        placeholder="Buscar proveedor por nombre o RFC..."
                        value={proveedorSearch}
                        onChangeText={setProveedorSearch}
                        iconName="search-outline"
                        style={{ margin: Spacing.one, height: 40 }}
                      />
                      <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 220, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                        {/* Opción Dejar en Blanco */}
                        <TouchableOpacity
                          style={[
                            styles.dropdownItem,
                            {
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: Spacing.one,
                              borderBottomWidth: 1,
                              borderBottomColor: themeColors.border,
                              backgroundColor: themeColors.backgroundElement,
                            }
                          ]}
                          onPress={() => {
                            setProveedor('');
                            setProveedorSearch('');
                            setShowProvDropdown(false);
                          }}
                        >
                          <Ionicons name="remove-circle-outline" size={20} color={themeColors.textSecondary} />
                          <Text style={{ color: themeColors.textSecondary, fontStyle: 'italic', fontSize: 13 }}>
                            Dejar en blanco (Sin proveedor)
                          </Text>
                        </TouchableOpacity>

                        {/* Opción rápida para agregar el proveedor si se buscó algo no existente */}
                        {proveedorSearch.trim().length > 0 && !proveedores.some(p => p.nombre && p.nombre.toLowerCase() === proveedorSearch.trim().toLowerCase()) && (
                          <TouchableOpacity
                            style={[
                              styles.dropdownItem,
                              {
                                backgroundColor: themeColors.primary + '15',
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: Spacing.one,
                                borderBottomWidth: 1,
                                borderBottomColor: themeColors.border,
                              }
                            ]}
                            onPress={() => {
                              setNuevoProvNombre(proveedorSearch.trim());
                              setNuevoProvRfc('');
                              setModalNuevoProveedorVisible(true);
                              setShowProvDropdown(false);
                            }}
                          >
                            <Ionicons name="add-circle-outline" size={20} color={themeColors.primary} />
                            <Text style={{ color: themeColors.primary, fontWeight: '600', fontSize: 13 }}>
                              {`➕ Agregar "${proveedorSearch.trim()}"`}
                            </Text>
                          </TouchableOpacity>
                        )}

                        {proveedores
                          .filter(p => 
                            p.nombre && (
                              p.nombre.toLowerCase().includes(proveedorSearch.toLowerCase()) ||
                              (p.rfc && p.rfc.toLowerCase().includes(proveedorSearch.toLowerCase()))
                            )
                          )
                          .map((prov, index, array) => (
                            <TouchableOpacity
                              key={prov.id}
                              style={[
                                styles.dropdownItem,
                                index === array.length - 1 && { borderBottomWidth: 0 },
                                { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, justifyContent: 'space-between' }
                              ]}
                              onPress={() => {
                                setProveedor(prov.nombre);
                                setProveedorSearch('');
                                setShowProvDropdown(false);
                              }}
                            >
                              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.one }}>
                                <Ionicons name="business-outline" size={20} color={themeColors.primary} />
                                <View style={{ flex: 1 }}>
                                  <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 14 }}>{prov.nombre}</Text>
                                  {prov.rfc ? (
                                    <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>RFC: {prov.rfc}</Text>
                                  ) : null}
                                </View>
                              </View>
                              {proveedor === prov.nombre && (
                                <Ionicons name="checkmark" size={18} color={themeColors.primary} />
                              )}
                            </TouchableOpacity>
                          ))}

                        {proveedores.filter(p => 
                          p.nombre && (
                            p.nombre.toLowerCase().includes(proveedorSearch.toLowerCase()) ||
                            (p.rfc && p.rfc.toLowerCase().includes(proveedorSearch.toLowerCase()))
                          )
                        ).length === 0 && (
                          <View style={{ padding: Spacing.two, alignItems: 'center' }}>
                            <Text style={{ color: themeColors.textSecondary, fontSize: 13, textAlign: 'center' }}>
                              No se encontraron proveedores. Puedes dejarlo en blanco.
                            </Text>
                          </View>
                        )}
                      </ScrollView>
                    </View>
                  </Pressable>
                )}
              </View>

              {/* Campo obligatorio de Proveedor a agregar si no se seleccionó proveedor */}
              {!proveedor && (
                <View style={{ marginBottom: Spacing.two }}>
                  <CustomInput
                    label="Proveedor a agregar *"
                    placeholder="Escribe el nombre del proveedor que no encontraste..."
                    value={comentarioProveedor}
                    onChangeText={setComentarioProveedor}
                    iconName="create-outline"
                    multiline
                    numberOfLines={2}
                    style={{ height: 60 }}
                  />
                  <Text style={{ color: themeColors.textSecondary, fontSize: 11, fontStyle: 'italic', marginTop: 2, paddingLeft: 4 }}>
                    Indica el nombre del proveedor para registrarlo en el catálogo y poder aprobar el gasto.
                  </Text>
                </View>
              )}

              {/* Selector de Tipo: Servicio / Proyecto / Venta / Operativo */}
              <View style={{ marginBottom: Spacing.two }}>
                <Text style={{ color: themeColors.text, marginBottom: Spacing.half, fontWeight: '500', fontSize: 14, paddingLeft: Spacing.half }}>Tipo de Gasto *</Text>
                <View style={{ flexDirection: 'row', gap: Spacing.one }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      padding: Spacing.one,
                      borderRadius: BorderRadius.medium,
                      borderWidth: 1,
                      borderColor: tipoServicioProyecto === 'Servicio' ? themeColors.primary : themeColors.border,
                      backgroundColor: tipoServicioProyecto === 'Servicio' ? themeColors.primary + '20' : themeColors.backgroundElement,
                      alignItems: 'center'
                    }}
                    onPress={() => setTipoServicioProyecto('Servicio')}
                  >
                    <Text style={{ color: tipoServicioProyecto === 'Servicio' ? themeColors.primary : themeColors.textSecondary, fontWeight: '600', fontSize: 13 }}>Servicio</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      padding: Spacing.one,
                      borderRadius: BorderRadius.medium,
                      borderWidth: 1,
                      borderColor: tipoServicioProyecto === 'Proyecto' ? themeColors.primary : themeColors.border,
                      backgroundColor: tipoServicioProyecto === 'Proyecto' ? themeColors.primary + '20' : themeColors.backgroundElement,
                      alignItems: 'center'
                    }}
                    onPress={() => setTipoServicioProyecto('Proyecto')}
                  >
                    <Text style={{ color: tipoServicioProyecto === 'Proyecto' ? themeColors.primary : themeColors.textSecondary, fontWeight: '600', fontSize: 13 }}>Proyecto</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      padding: Spacing.one,
                      borderRadius: BorderRadius.medium,
                      borderWidth: 1,
                      borderColor: tipoServicioProyecto === 'Venta' ? themeColors.primary : themeColors.border,
                      backgroundColor: tipoServicioProyecto === 'Venta' ? themeColors.primary + '20' : themeColors.backgroundElement,
                      alignItems: 'center'
                    }}
                    onPress={() => setTipoServicioProyecto('Venta')}
                  >
                    <Text style={{ color: tipoServicioProyecto === 'Venta' ? themeColors.primary : themeColors.textSecondary, fontWeight: '600', fontSize: 13 }}>Venta</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      padding: Spacing.one,
                      borderRadius: BorderRadius.medium,
                      borderWidth: 1,
                      borderColor: tipoServicioProyecto === 'Operativo' ? themeColors.primary : themeColors.border,
                      backgroundColor: tipoServicioProyecto === 'Operativo' ? themeColors.primary + '20' : themeColors.backgroundElement,
                      alignItems: 'center'
                    }}
                    onPress={() => setTipoServicioProyecto('Operativo')}
                  >
                    <Text style={{ color: tipoServicioProyecto === 'Operativo' ? themeColors.primary : themeColors.textSecondary, fontWeight: '600', fontSize: 13 }}>Operativo</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              <CustomInput
                label="Detalle de Servicio o Proyecto *"
                placeholder="Escribe el nombre o texto libre..."
                value={detalleServicioProyecto}
                onChangeText={setDetalleServicioProyecto}
                iconName="briefcase-outline"
              />

              {/* Selector de Cliente */}
              <View style={styles.customDropdownContainer}>
                <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Cliente Relacionado *</Text>
                <TouchableOpacity
                  style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowCliDropdown(!showCliDropdown);
                    setShowCatDropdown(false);
                    setShowSubDropdown(false);
                    setShowSucursalDropdown(false);
                  }}
                >
                  <Text style={{ color: selectedCliente ? themeColors.text : themeColors.textSecondary }}>
                    {selectedCliente || 'Selecciona un cliente'}
                  </Text>
                  <Ionicons name={showCliDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                </TouchableOpacity>
                {showCliDropdown && (
                  <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', zIndex: 1000 }}>
                    <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                      <CustomInput
                        placeholder="Buscar o agregar cliente..."
                        value={clienteSearch}
                        onChangeText={setClienteSearch}
                        iconName="search-outline"
                        style={{ margin: Spacing.one, height: 40 }}
                      />
                      <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                        {clienteSearch.trim().length > 0 && !clientes.some(c => c.nombre && c.nombre.toLowerCase() === clienteSearch.trim().toLowerCase()) && (
                          <TouchableOpacity
                            style={[styles.dropdownItem, { backgroundColor: themeColors.accent + '15', flexDirection: 'row', alignItems: 'center', gap: Spacing.one }]}
                            onPress={() => handleAddNewCliente(clienteSearch)}
                          >
                            <Ionicons name="add-circle-outline" size={24} color={themeColors.accent} />
                            <Text style={{ color: themeColors.accent, fontWeight: '600', fontSize: 14 }}>
                              {`➕ Agregar "${clienteSearch.trim()}"`}
                            </Text>
                          </TouchableOpacity>
                        )}
                        {clientes
                          .filter(cli => cli.nombre && cli.nombre.toLowerCase().includes(clienteSearch.toLowerCase()))
                          .map((cli, index, array) => (
                            <TouchableOpacity
                              key={cli.id}
                              style={[
                                styles.dropdownItem,
                                index === array.length - 1 && { borderBottomWidth: 0 },
                                { flexDirection: 'row', alignItems: 'center', gap: Spacing.one }
                              ]}
                              onPress={() => {
                                setSelectedCliente(cli.nombre);
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

              {/* Selector de Sucursal */}
              <View style={styles.customDropdownContainer}>
                <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Sucursal del cliente</Text>
                <TouchableOpacity
                  style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, opacity: !selectedCliente ? 0.5 : 1 }]}
                  disabled={!selectedCliente}
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowSucursalDropdown(!showSucursalDropdown);
                    setShowCatDropdown(false);
                    setShowSubDropdown(false);
                    setShowCliDropdown(false);
                  }}
                >
                  <Text style={{ color: sucursal ? themeColors.text : themeColors.textSecondary }}>
                    {sucursal || (selectedCliente ? 'Selecciona una sucursal' : 'Selecciona un cliente primero')}
                  </Text>
                  <Ionicons name={showSucursalDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                </TouchableOpacity>
                {showSucursalDropdown && (
                  <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', zIndex: 1000 }}>
                    <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                      <CustomInput
                        placeholder="Buscar sucursal..."
                        value={sucursalSearch}
                        onChangeText={setSucursalSearch}
                        iconName="search-outline"
                        style={{ margin: Spacing.one, height: 40 }}
                      />
                      <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                        {(() => {
                           const currentCliente = clientes.find(c => c.nombre?.trim().toLowerCase() === selectedCliente?.trim().toLowerCase() || c.id === selectedCliente);
                           const filteredSucursales = currentCliente ? sucursalesCliente.filter(s => s.cliente_id === currentCliente.id && s.nombre.toLowerCase().includes(sucursalSearch.toLowerCase())) : [];
                           if (filteredSucursales.length === 0) {
                             return <Text style={{ padding: Spacing.two, color: themeColors.textSecondary }}>No hay sucursales registradas para este cliente.</Text>;
                           }
                           return filteredSucursales.map((suc, index, array) => (
                              <TouchableOpacity
                                key={suc.id}
                                style={[
                                  styles.dropdownItem,
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
                           ));
                        })()}
                      </ScrollView>
                    </View>
                  </Pressable>
                )}
              </View>


              {/* Selector de Método de Pago */}
              <View style={styles.selectorGroup}>
                <Text style={[styles.selectorLabel, { color: themeColors.text }]}>Método de Pago *</Text>
                <View style={styles.paymentSelector}>
                  <TouchableOpacity
                    onPress={() => {
                      setMetodoPago('efectivo');
                      setTipoTarjeta(null);
                    }}
                    style={[
                      styles.paymentOption,
                      {
                        backgroundColor: metodoPago === 'efectivo' ? themeColors.accent : themeColors.backgroundElement,
                        borderColor: metodoPago === 'efectivo' ? 'transparent' : themeColors.border,
                        flex: 1,
                        alignItems: 'center',
                      },
                    ]}
                  >
                    <Text style={[styles.paymentOptionText, { color: metodoPago === 'efectivo' ? '#ffffff' : themeColors.text }]}>
                      Efectivo
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      if (metodoPago !== 'tarjeta_credito' && metodoPago !== 'tarjeta_debito') {
                        setMetodoPago('tarjeta_debito');
                      }
                    }}
                    style={[
                      styles.paymentOption,
                      {
                        backgroundColor: metodoPago !== 'efectivo' ? themeColors.accent : themeColors.backgroundElement,
                        borderColor: metodoPago !== 'efectivo' ? 'transparent' : themeColors.border,
                        flex: 1,
                        alignItems: 'center',
                      },
                    ]}
                  >
                    <Text style={[styles.paymentOptionText, { color: metodoPago !== 'efectivo' ? '#ffffff' : themeColors.text }]}>
                      Tarjeta
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Sub-selector si se elige Tarjeta */}
              {metodoPago !== 'efectivo' && (
                <View style={[styles.selectorGroup, { marginTop: -Spacing.one, paddingLeft: Spacing.two, borderLeftWidth: 2, borderLeftColor: themeColors.accent, gap: Spacing.two }]}>
                  <View>
                    <Text style={[styles.selectorLabel, { color: themeColors.text, fontSize: 13, marginBottom: Spacing.one }]}>Tipo de Tarjeta *</Text>
                    <View style={styles.paymentSelector}>
                      <TouchableOpacity
                        onPress={() => setMetodoPago('tarjeta_debito')}
                        style={[
                          styles.paymentOption,
                          {
                            backgroundColor: metodoPago === 'tarjeta_debito' ? themeColors.accent : themeColors.backgroundElement,
                            borderColor: metodoPago === 'tarjeta_debito' ? 'transparent' : themeColors.border,
                            flex: 1,
                            alignItems: 'center',
                            paddingVertical: Spacing.one,
                          },
                        ]}
                      >
                        <Text style={[styles.paymentOptionText, { color: metodoPago === 'tarjeta_debito' ? '#ffffff' : themeColors.text, fontSize: 11 }]}>
                          Débito
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => setMetodoPago('tarjeta_credito')}
                        style={[
                          styles.paymentOption,
                          {
                            backgroundColor: metodoPago === 'tarjeta_credito' ? themeColors.accent : themeColors.backgroundElement,
                            borderColor: metodoPago === 'tarjeta_credito' ? 'transparent' : themeColors.border,
                            flex: 1,
                            alignItems: 'center',
                            paddingVertical: Spacing.one,
                          },
                        ]}
                      >
                        <Text style={[styles.paymentOptionText, { color: metodoPago === 'tarjeta_credito' ? '#ffffff' : themeColors.text, fontSize: 11 }]}>
                          Crédito
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View>
                    <Text style={[styles.selectorLabel, { color: themeColors.text, fontSize: 13, marginBottom: Spacing.one }]}>Selecciona la Tarjeta *</Text>
                    <View style={styles.paymentSelector}>
                      {(['BBVA', 'AMEX', 'MARRIOT', 'BANORTE'] as const).map((card) => (
                        <TouchableOpacity
                          key={card}
                          onPress={() => setTipoTarjeta(card)}
                          style={[
                            styles.paymentOption,
                            {
                              backgroundColor: tipoTarjeta === card ? themeColors.accent : themeColors.backgroundElement,
                              borderColor: tipoTarjeta === card ? 'transparent' : themeColors.border,
                              flex: 1,
                              minWidth: '45%',
                              alignItems: 'center',
                              paddingVertical: Spacing.one,
                            },
                          ]}
                        >
                          <Text style={[styles.paymentOptionText, { color: tipoTarjeta === card ? '#ffffff' : themeColors.text, fontSize: 11 }]}>
                            {card}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
              )}

              {/* Selector de ¿Está facturado? */}
              <View style={styles.selectorGroup}>
                <Text style={[styles.selectorLabel, { color: themeColors.text }]}>¿Estado de Facturación? *</Text>
                <View style={[styles.paymentSelector, { flexDirection: 'row', gap: 6 }]}>
                  <TouchableOpacity
                    onPress={() => {
                      setFacturado(true);
                      setFacturaStatus('SI');
                      setMotivoSinFactura('');
                    }}
                    style={[
                      styles.paymentOption,
                      {
                        backgroundColor: facturado === true ? themeColors.accent : themeColors.backgroundElement,
                        borderColor: facturado === true ? 'transparent' : themeColors.border,
                        flex: 1,
                        paddingVertical: 8,
                        alignItems: 'center',
                      },
                    ]}
                  >
                    <Text style={[styles.paymentOptionText, { color: facturado === true ? '#ffffff' : themeColors.text, fontSize: 11, fontWeight: '700' }]}>
                      Sí, Facturado
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      setFacturado(false);
                      setFacturaStatus('PENDIENTE');
                      setFacturaUri(null);
                      setFacturaBase64(null);
                      setFacturaExt(null);
                    }}
                    style={[
                      styles.paymentOption,
                      {
                        backgroundColor: (facturado === false && facturaStatus === 'PENDIENTE') ? themeColors.warning : themeColors.backgroundElement,
                        borderColor: (facturado === false && facturaStatus === 'PENDIENTE') ? 'transparent' : themeColors.border,
                        flex: 1,
                        paddingVertical: 8,
                        alignItems: 'center',
                      },
                    ]}
                  >
                    <Text style={[styles.paymentOptionText, { color: (facturado === false && facturaStatus === 'PENDIENTE') ? '#ffffff' : themeColors.text, fontSize: 11, fontWeight: '700' }]}>
                      Pendiente
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      setFacturado(false);
                      setFacturaStatus('NO');
                      setFacturaUri(null);
                      setFacturaBase64(null);
                      setFacturaExt(null);
                    }}
                    style={[
                      styles.paymentOption,
                      {
                        backgroundColor: (facturado === false && facturaStatus === 'NO') ? themeColors.accent : themeColors.backgroundElement,
                        borderColor: (facturado === false && facturaStatus === 'NO') ? 'transparent' : themeColors.border,
                        flex: 1,
                        paddingVertical: 8,
                        alignItems: 'center',
                      },
                    ]}
                  >
                    <Text style={[styles.paymentOptionText, { color: (facturado === false && facturaStatus === 'NO') ? '#ffffff' : themeColors.text, fontSize: 11, fontWeight: '700' }]}>
                      No Facturado
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {facturado === false && facturaStatus === 'PENDIENTE' && (
                <View style={[styles.alertBanner, { backgroundColor: themeColors.warning + '15', borderColor: themeColors.warning, marginBottom: Spacing.two, padding: Spacing.two, borderRadius: BorderRadius.medium }]}>
                  <Text style={{ color: themeColors.warning, fontWeight: '700', fontSize: 12 }}>
                    ⚠️ Factura Pendiente de Entregar: Por favor explica por qué está pendiente a continuación.
                  </Text>
                </View>
              )}

              {facturado === false && facturaStatus === 'PENDIENTE' && (
                <View style={{ marginBottom: Spacing.two }}>
                  <CustomInput
                    label="Explicación (Obligatorio) *"
                    placeholder="Escribe la razón (ej: Me la mandan mañana)"
                    value={comentarioPendiente}
                    onChangeText={setComentarioPendiente}
                    iconName="time-outline"
                    multiline
                    numberOfLines={2}
                    style={{ height: 60 }}
                  />
                </View>
              )}

              {facturado === false && facturaStatus === 'NO' && (
                <View style={{ marginBottom: Spacing.two }}>
                  <CustomInput
                    label="Motivo por el cual no se cuenta con factura *"
                    placeholder="Ej. El establecimiento no emite facturas, régimen simplificado, etc."
                    value={motivoSinFactura}
                    onChangeText={setMotivoSinFactura}
                    iconName="alert-circle-outline"
                    multiline
                    numberOfLines={2}
                    style={{ height: 60 }}
                  />
                </View>
              )}

              <View style={styles.footerNav}>
                <CustomButton title="Atrás" onPress={prevStep} variant="secondary" style={styles.navBtn} />
                <CustomButton title="Siguiente" onPress={nextStep} style={styles.navBtn} />
              </View>
            </View>
          )}

          {/* PASO 3: Categorización */}
          {currentStep === 3 && (
            <View style={styles.stepContainer}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                3. Categorización e Información de Negocio
              </Text>

              {(alertaPolitica || alertaLocal) && (
                <View style={[styles.alertBanner, { backgroundColor: themeColors.danger + '15', borderColor: themeColors.danger }]}>
                  <Ionicons name="warning-outline" size={22} color={themeColors.danger} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.alertTitle, { color: themeColors.danger }]}>Alerta de Políticas de Gasto</Text>
                    <Text style={[styles.alertText, { color: themeColors.text }]}>
                      {[alertaPolitica, alertaLocal].filter(Boolean).join('\n')}
                    </Text>
                  </View>
                </View>
              )}

              {/* Selector de Categorías */}
              <View style={styles.customDropdownContainer}>
                <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Categoría *</Text>
                <TouchableOpacity
                  style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                  onPress={() => {
                    setShowCatDropdown(!showCatDropdown);
                  setShowSubDropdown(false);
                  setShowCliDropdown(false);
                  }}
                >
                  <Text style={{ color: selectedCategoria ? themeColors.text : themeColors.textSecondary }}>
                    {selectedCategoria || 'Selecciona una categoría'}
                  </Text>
                  <Ionicons name={showCatDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                </TouchableOpacity>
                {showCatDropdown && (
                  <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', zIndex: 1000 }}>
                    <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                      <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 150 }} keyboardShouldPersistTaps="handled">
                        {categorias.map((cat) => (
                          <TouchableOpacity
                            key={cat.id}
                            style={styles.dropdownItem}
                            onPress={() => {
                              setSelectedCategoria(cat.nombre);
                              setSelectedSubcategoria(''); // Limpiar subcategoría al cambiar de categoría
                              setShowCatDropdown(false);
                            }}
                          >
                            <Text style={{ color: themeColors.text }}>{cat.nombre}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  </Pressable>
                )}
              </View>

              {/* Selector de Subcategorías (Filtrado dependiente) */}
              {selectedCategoria && (
                <View style={styles.customDropdownContainer}>
                  <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Subcategoría *</Text>
                  <TouchableOpacity
                    style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                    onPress={() => {
                      setShowSubDropdown(!showSubDropdown);
                      setShowCatDropdown(false);
                      setShowCliDropdown(false);
                    }}
                  >
                    <Text style={{ color: selectedSubcategoria ? themeColors.text : themeColors.textSecondary }}>
                      {selectedSubcategoria || 'Selecciona una subcategoría'}
                    </Text>
                    <Ionicons name={showSubDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                  </TouchableOpacity>
                  {showSubDropdown && (
                    <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', zIndex: 1000 }}>
                      <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                        <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 150 }} keyboardShouldPersistTaps="handled">
                          {filteredSubcategorias.length > 0 ? (
                            filteredSubcategorias.map((sub) => (
                              <TouchableOpacity
                                key={sub.id}
                                style={styles.dropdownItem}
                                onPress={() => {
                                  setSelectedSubcategoria(sub.nombre);
                                  setShowSubDropdown(false);
                                }}
                              >
                                <Text style={{ color: themeColors.text }}>{sub.nombre}</Text>
                              </TouchableOpacity>
                            ))
                          ) : (
                            <View style={styles.dropdownItem}>
                              <Text style={{ color: themeColors.textSecondary }}>Sin subcategorías para esta sección</Text>
                            </View>
                          )}
                        </ScrollView>
                      </View>
                    </Pressable>
                  )}
                </View>
              )}



              <CustomInput
                label="Comentarios *"
                placeholder={getComentariosPlaceholder(selectedCategoria, selectedSubcategoria)}
                value={justificacion}
                onChangeText={setJustificacion}
                multiline
                numberOfLines={4}
                style={{ height: 90 }}
                iconName="document-text-outline"
              />

              <View style={styles.footerNav}>
                <CustomButton
                  title="Atrás"
                  onPress={prevStep}
                  variant="secondary"
                  style={styles.navBtn}
                  disabled={isSubmitting}
                />
                <CustomButton
                  title="Guardar Gasto"
                  onPress={handleSaveGasto}
                  loading={isSubmitting}
                  style={styles.navBtn}
                />
              </View>
            </View>
          )}
        </Pressable>
      </ScrollView>
      </KeyboardAvoidingView>

      <ImageViewerModal
        visible={viewerVisible}
        imageUrl={activePreviewUrl}
        onClose={() => {
          setViewerVisible(false);
          setActivePreviewUrl(null);
        }}
      />

      {/* Modal Crear Proveedor (Admin Directo) */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalNuevoProveedorVisible}
        onRequestClose={() => setModalNuevoProveedorVisible(false)}
      >
        <Pressable 
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: Spacing.four }}
          onPress={() => setModalNuevoProveedorVisible(false)}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%', maxWidth: 480 }}>
            <Pressable style={{ backgroundColor: themeColors.background, borderRadius: BorderRadius.large, padding: Spacing.four, width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 }} onPress={(e) => e.stopPropagation()}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.three }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.one }}>
                  <Ionicons name="business" size={22} color={themeColors.primary} />
                  <Text style={{ fontSize: 18, fontWeight: '700', color: themeColors.text }}>Nuevo Proveedor</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setModalNuevoProveedorVisible(false);
                    setNuevoProvNombre('');
                    setNuevoProvRfc('');
                  }}
                >
                  <Ionicons name="close" size={24} color={themeColors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ gap: Spacing.two }} keyboardShouldPersistTaps="handled">
                <CustomInput
                  label="Nombre o Razón Social *"
                  placeholder="Ej. Papelería Lumen, OXXO, etc."
                  value={nuevoProvNombre}
                  onChangeText={setNuevoProvNombre}
                  iconName="business-outline"
                />

                <CustomInput
                  label="RFC (Opcional)"
                  placeholder="Ej. LUM951010AB1"
                  value={nuevoProvRfc}
                  onChangeText={setNuevoProvRfc}
                  autoCapitalize="characters"
                  iconName="card-outline"
                />

                <View style={{ flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two }}>
                  <CustomButton
                    title="Cancelar"
                    variant="secondary"
                    onPress={() => {
                      setModalNuevoProveedorVisible(false);
                      setNuevoProvNombre('');
                      setNuevoProvRfc('');
                    }}
                    style={{ flex: 1 }}
                  />
                  <CustomButton
                    title={isSavingProv ? "Guardando..." : "Guardar"}
                    onPress={handleCrearNuevoProveedor}
                    loading={isSavingProv}
                    style={{ flex: 1 }}
                  />
                </View>
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  innerCard: {
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  backBtn: {
    padding: Spacing.one,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
  stepContainer: {
    marginTop: Spacing.two,
    gap: Spacing.three,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: Spacing.one,
  },
  imageCard: {
    height: 200,
    borderRadius: BorderRadius.medium,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  uploadPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.one,
  },
  placeholderText: {
    fontSize: 14,
    fontWeight: '600',
  },
  previewContainer: {
    width: '100%',
    height: '100%',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  removeImageBtn: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    backgroundColor: 'rgba(211, 47, 47, 0.9)',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionGrid: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    height: 50,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.one,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  scanWrapper: {
    marginTop: Spacing.two,
    alignItems: 'center',
    width: '100%',
  },
  scanBtn: {
    width: '100%',
  },
  scanLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
  },
  scanText: {
    fontSize: 14,
    fontWeight: '600',
  },
  scanSuccessText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: Spacing.one,
  },
  footerNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
  navBtn: {
    flex: 1,
  },
  selectorGroup: {
    marginBottom: Spacing.two,
  },
  selectorLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: Spacing.one,
  },
  paymentSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  paymentOption: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
  },
  paymentOptionText: {
    fontSize: 12,
    fontWeight: '600',
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
  dropdownList: {
    position: 'relative',
    marginTop: Spacing.one,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    maxHeight: 150,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  dropdownItem: {
    padding: Spacing.two,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
  alertBanner: {
    flexDirection: 'row',
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    gap: Spacing.two,
    alignItems: 'flex-start',
    marginBottom: Spacing.one,
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  alertText: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  invoicePreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.two,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  pdfPreviewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
  },
  pdfFileName: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  removeInvoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: BorderRadius.small,
    gap: Spacing.half,
  },
});
