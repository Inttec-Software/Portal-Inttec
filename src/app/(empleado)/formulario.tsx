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
  Pressable,
  Switch,
  Modal,
  Keyboard,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import NetInfo from '@react-native-community/netinfo';
import { getApiHeaders, getApiUrl } from '@/services/apiHelper';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import {
  supabase,
  CatalogoItem,
  SubcategoriaItem,
  ProveedorItem,
  Usuario,
  Vehiculo,
  VehiculoService,
  ClienteItem,
  SucursalCliente,
  AuthService,
} from '@/services/supabase';
import { CatalogService } from '@/services/catalogService';
import { SyncService, base64ToArrayBuffer } from '@/services/sync';
import { PushNotificationService } from '@/services/pushNotifications';
import { getComentariosPlaceholder, isCombustibleExpense } from '@/utils/helpers';
import { optimizeImage } from '@/utils/imageOptimizer';
import StepIndicator from '@/components/StepIndicator';
import CustomInput from '@/components/CustomInput';
import CustomButton from '@/components/CustomButton';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import ImageViewerModal from '@/components/ImageViewerModal';

const showAlert = (title: string, message: string) => { if (Platform.OS === 'web') { window.alert(title + '\n\n' + message); } else { Alert.alert(title, message); } };

export default function GastoForm() {
  const router = useRouter();
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
  const [facturaStatus, setFacturaStatus] = useState<'SI' | 'PENDIENTE' | 'NO' | null>(null);
  const [comentarioPendiente, setComentarioPendiente] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [facturaUri, setFacturaUri] = useState<string | null>(null);
  const [facturaBase64, setFacturaBase64] = useState<string | null>(null);
  const [facturaExt, setFacturaExt] = useState<string | null>(null);
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
  const [comentarioSucursal, setComentarioSucursal] = useState('');
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'tarjeta' | 'tarjeta_credito' | 'tarjeta_debito'>('efectivo');
  const [tipoTarjeta, setTipoTarjeta] = useState<'BBVA' | 'AMEX' | 'MARRIOT' | 'BANORTE' | 'INVEX' | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateValue, setDateValue] = useState(new Date());
  const [alertaPolitica, setAlertaPolitica] = useState<string | null>(null);
  
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
  const [sucursalesCliente, setSucursalesCliente] = useState<SucursalCliente[]>([]);
  const [showSucursalDropdown, setShowSucursalDropdown] = useState(false);
  const [sucursalSearch, setSucursalSearch] = useState('');

  // Vehículos y Gasolina
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [selectedVehiculoId, setSelectedVehiculoId] = useState<string>('');
  const [kilometrajeActual, setKilometrajeActual] = useState<string>('');
  const [litrosGasolina, setLitrosGasolina] = useState<string>('');
  const [showVehiculoDropdown, setShowVehiculoDropdown] = useState(false);

  // División de Gasto
  const [isSplit, setIsSplit] = useState(false);
  const [splits, setSplits] = useState<{ id: string; clienteId: string; sucursalNombre: string; comentarioSucursal?: string; monto: string }[]>([]);

  // Dropdown list visibility toggles (Mock pickers since RN Picker is external)
  const [showCatDropdown, setShowCatDropdown] = useState(false);
  const [showSubDropdown, setShowSubDropdown] = useState(false);
  const [showCliDropdown, setShowCliDropdown] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [activeSplitDropdownId, setActiveSplitDropdownId] = useState<string | null>(null);

  // Modal para agregar división de gasto
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [newSplitClienteId, setNewSplitClienteId] = useState('');
  const [newSplitSucursalNombre, setNewSplitSucursalNombre] = useState('');
  const [newSplitComentarioSucursal, setNewSplitComentarioSucursal] = useState('');
  const [newSplitMonto, setNewSplitMonto] = useState('');
  const [showNewSplitCliDropdown, setShowNewSplitCliDropdown] = useState(false);
  const [showNewSplitSucDropdown, setShowNewSplitSucDropdown] = useState(false);
  const [splitClienteSearch, setSplitClienteSearch] = useState('');
  const [splitSucursalSearch, setSplitSucursalSearch] = useState('');
  const alertaLocal = useMemo(() => {
    const alerts: string[] = [];

    // ÚNICAMENTE aplicar alerta de monto en gastos de COMIDAS / ALIMENTOS
    if (esComida) {
      let totalGasto = Number(monto) || 0;
      if (isSplit && splits.length > 0) {
        totalGasto = splits.reduce((sum, s) => sum + (Number(s.monto) || 0), 0);
      }

      if (incluyePropina === false) {
        totalGasto += Number(montoPropina || 0);
      }

      const cantidadPersonas = 1 + selectedEmpleados.length;
      const limiteCalculado = 280 * cantidadPersonas;

      if (totalGasto > limiteCalculado) {
        alerts.push(`Límite de alimentos excedido: el límite general por comida es de $${limiteCalculado} MXN para ${cantidadPersonas} persona(s) (Total con Propina/División: $${totalGasto.toFixed(2)} MXN)`);
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
  }, [monto, isSplit, splits, justificacion, proveedor, selectedEmpleados, esComida, incluyePropina, montoPropina]);

  const loadCatalogos = async () => {
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/reportes/form-catalogs`, { headers });
      if (!res.ok) throw new Error('Error al cargar catálogos del formulario');
      const data = await res.json();
      const vehList = await VehiculoService.getVehiculos(true);

      if (data.categorias) setCategorias(data.categorias);
      if (data.subcategorias) setSubcategorias(data.subcategorias);
      if (data.clientes) setClientes(data.clientes);
      if (data.usuarios) setAllUsers(data.usuarios);
      if (vehList) setVehiculos(vehList);
      if (data.sucursales) setSucursalesCliente(data.sucursales);
      if (data.proveedores) setProveedores(data.proveedores);
    } catch (err) {
      console.error('Error loading catalogos:', err);
    }
  };

  useEffect(() => {
    const init = async () => {
      const user = await AuthService.getCurrentUser();
      if (!user) {
        router.replace('/');
        return;
      }
      setCurrentUser(user);
      await loadCatalogos();
    };
    init();
  }, [router]);

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

  const _handleSelectDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*'],
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
           base64Str = await new Promise<string>((resolve, reject) => {
             const xhr = new XMLHttpRequest();
             xhr.onload = () => {
               try {
                 const b64 = require('buffer').Buffer.from(xhr.response).toString('base64');
                 resolve(b64);
               } catch (e) {
                 reject(e);
               }
             };
             xhr.onerror = reject;
             xhr.responseType = 'arraybuffer';
             xhr.open('GET', file.uri, true);
             xhr.send(null);
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
        const optimized = await optimizeImage(result.assets[0].uri);
        setFacturaUri(optimized.uri);
        setFacturaBase64(optimized.base64 || null);
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
        const optimized = await optimizeImage(result.assets[0].uri);
        setFacturaUri(optimized.uri);
        setFacturaBase64(optimized.base64 || null);
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleAddNewCliente = async (nombre: string) => {
    try {
      const newCli = await CatalogService.crearCliente({ nombre: nombre.trim() });
      setClientes(prev => [...prev, newCli].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setSelectedCliente(newCli.nombre);
      setSucursal('');
      setClienteSearch('');
      setShowCliDropdown(false);
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo agregar el cliente.');
    }
  };

  const handleAddNewSucursal = async (nombre: string) => {
    if (!nombre.trim()) return;
    const currentCliente = clientes.find(c => c.nombre?.trim().toLowerCase() === selectedCliente?.trim().toLowerCase());
    if (!currentCliente) {
      showAlert('Validación', 'Primero debes seleccionar un cliente para vincular la sucursal.');
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
      showAlert('Éxito', `Sucursal "${newSuc.nombre}" agregada y vinculada a ${currentCliente.nombre}.`);
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo agregar la sucursal.');
    }
  };

  const handleAddNewClienteForSplit = async (nombre: string) => {
    try {
      const newCli = await CatalogService.crearCliente({ nombre: nombre.trim() });
      setClientes(prev => [...prev, newCli].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setNewSplitClienteId(newCli.nombre);
      setNewSplitSucursalNombre('');
      setSplitClienteSearch('');
      setShowNewSplitCliDropdown(false);
      showAlert('Éxito', `Cliente "${nombre.trim()}" agregado correctamente.`);
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo agregar el cliente.');
    }
  };

  const handleAddNewSucursalForSplit = async (nombre: string) => {
    if (!nombre.trim()) return;
    const currentCliente = clientes.find(c => c.nombre?.trim().toLowerCase() === newSplitClienteId?.trim().toLowerCase());
    if (!currentCliente) {
      showAlert('Validación', 'Primero debes seleccionar un cliente para vincular la sucursal.');
      return;
    }

    try {
      const newSuc = await CatalogService.crearSucursal({
        cliente_id: currentCliente.id,
        nombre: nombre.trim().toUpperCase(),
      });
      setSucursalesCliente(prev => [...prev, newSuc].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setNewSplitSucursalNombre(newSuc.nombre);
      setSplitSucursalSearch('');
      setShowNewSplitSucDropdown(false);
      showAlert('Éxito', `Sucursal "${newSuc.nombre}" agregada y vinculada a ${currentCliente.nombre}.`);
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo agregar la sucursal.');
    }
  };

  // Guardar Gasto (Finalizar)
  const handleSaveGasto = async () => {
    if (!currentUser) return;
    
    // 1. Validar Foto de comprobante
    if (!imageUri) {
      showAlert('Validación', 'Por favor toma o selecciona una foto del comprobante/ticket.');
      setCurrentStep(1);
      return;
    }

    // 2. Validar Monto
    if (!monto || isNaN(Number(monto)) || Number(monto) <= 0) {
      showAlert('Validación', 'Por favor ingresa un monto válido mayor a 0.');
      setCurrentStep(2);
      return;
    }

    // 3. Validar Fecha
    const fechaRegex = /^\d{2}\/\d{2}\/\d{4}$/;
    if (!fechaRegex.test(fechaComprobante)) {
      showAlert('Validación', 'Por favor ingresa la fecha en formato DD/MM/AAAA (ej. 09/06/2026).');
      setCurrentStep(2);
      return;
    }

    // 4. Validar Proveedor a agregar si no se seleccionó proveedor
    if (!proveedor.trim() && !comentarioProveedor.trim()) {
      showAlert('Validación', 'Por favor indica en el campo "Proveedor a agregar" el nombre del proveedor para que el administrador pueda registrarlo.');
      setCurrentStep(2);
      return;
    }

    // 5. Validar Método de Pago y Tarjeta
    if (!metodoPago) {
      showAlert('Validación', 'Por favor selecciona el método de pago.');
      setCurrentStep(2);
      return;
    }

    if (metodoPago !== 'efectivo' && (!tipoTarjeta || !tipoTarjeta.trim())) {
      showAlert('Validación', 'Por favor especifica la tarjeta o tipo de pago.');
      setCurrentStep(2);
      return;
    }

    // 7. Validar Factura / Motivo Sin Factura
    if (facturado === null) {
      showAlert('Validación', 'Por favor especifica si el gasto está facturado.');
      setCurrentStep(2);
      return;
    }

    if (facturado === false && facturaStatus === 'PENDIENTE' && !comentarioPendiente.trim()) {
      showAlert('Validación', 'Por favor explica por qué la factura está pendiente.');
      setCurrentStep(2);
      return;
    }

    if (facturado === false && facturaStatus === 'NO' && !motivoSinFactura.trim()) {
      showAlert('Validación', 'Por favor especifica el motivo por el cual no se cuenta con factura.');
      setCurrentStep(2);
      return;
    }

    // 8. Validar Categoría y Subcategoría
    if (!selectedCategoria) {
      showAlert('Validación', 'Por favor selecciona una categoría.');
      setCurrentStep(3);
      return;
    }

    if (!selectedSubcategoria) {
      showAlert('Validación', 'Por favor selecciona una subcategoría.');
      setCurrentStep(3);
      return;
    }

    // 9. Validar Cliente / Proyecto (si no está dividido)
    if (!isSplit && !selectedCliente.trim()) {
      showAlert('Validación', 'Por favor selecciona o ingresa el cliente o proyecto asignado.');
      setCurrentStep(3);
      return;
    }

    // 10. Validar Vehículos / Gasolina / Combustible
    const esGasolina = isCombustibleExpense(selectedCategoria, selectedSubcategoria);
    if (esGasolina) {
      if (!selectedVehiculoId) {
        showAlert('Validación', 'Por favor selecciona el vehículo.');
        setCurrentStep(3);
        return;
      }
      if (!kilometrajeActual || isNaN(Number(kilometrajeActual)) || Number(kilometrajeActual) <= 0) {
        showAlert('Validación', 'Por favor ingresa un kilometraje (odómetro) válido.');
        setCurrentStep(3);
        return;
      }
      if (!litrosGasolina || isNaN(Number(litrosGasolina)) || Number(litrosGasolina) <= 0) {
        showAlert('Validación', 'Por favor ingresa los litros cargados de forma válida.');
        setCurrentStep(3);
        return;
      }
    }

    // 11. Validar Tipo y Detalle de Servicio/Proyecto
    if (!tipoServicioProyecto) {
      showAlert('Validación', 'Por favor selecciona si es Servicio, Proyecto, Venta u Operativo.');
      setCurrentStep(3);
      return;
    }

    if (!detalleServicioProyecto.trim()) {
      showAlert('Validación', 'Por favor ingresa el detalle del Servicio, Proyecto, Venta u Operativo.');
      setCurrentStep(3);
      return;
    }

    // 12. Validar Comentarios / Justificación
    if (!justificacion.trim()) {
      showAlert('Validación', 'Por favor escribe tus comentarios del gasto.');
      setCurrentStep(3);
      return;
    }

    if (!isSplit) {
      if (!selectedCliente || !selectedCliente.trim()) {
        showAlert('Validación', 'Por favor selecciona el cliente relacionado al gasto.');
        setCurrentStep(3);
        return;
      }
      if (!sucursal.trim() && !comentarioSucursal.trim()) {
        showAlert('Validación', 'Por favor selecciona la sucursal del cliente o indica una en "Sucursal a agregar".');
        setCurrentStep(3);
        return;
      }
    }

    const totalGasto = Number(monto) + (esComida && incluyePropina === false ? Number(montoPropina || 0) : 0);

    if (isSplit) {
      if (splits.length === 0) {
        showAlert('Validación', 'Por favor agrega al menos una división o desactiva la opción de dividir gasto.');
        setCurrentStep(3);
        return;
      }
      let sum = 0;
      for (const s of splits) {
        if (!s.clienteId || !s.clienteId.trim()) {
          showAlert('Validación', 'Por favor selecciona un cliente para todas las divisiones del gasto.');
          setCurrentStep(3);
          return;
        }
        if (!s.sucursalNombre?.trim() && !s.comentarioSucursal?.trim()) {
          showAlert('Validación', `Por favor selecciona la sucursal para la división del cliente "${s.clienteId}" o indica una en "Sucursal a agregar".`);
          setCurrentStep(3);
          return;
        }
        if (!s.monto || isNaN(Number(s.monto)) || Number(s.monto) <= 0) {
          showAlert('Validación', 'Por favor ingresa un monto válido mayor a 0 para todas las divisiones.');
          setCurrentStep(3);
          return;
        }
        sum += Number(s.monto);
      }
      if (Math.abs(sum - totalGasto) > 0.05) {
        showAlert(
          'Validación de Monto',
          `La suma de las divisiones ($${sum.toFixed(2)}) debe coincidir con el total del ticket ($${totalGasto.toFixed(2)}).\n\n${
            sum < totalGasto
              ? `Falta por asignar: $${(totalGasto - sum).toFixed(2)}`
              : `Exceso de asignación: $${(sum - totalGasto).toFixed(2)}`
          }`
        );
        setCurrentStep(3);
        return;
      }
    }

    setIsSubmitting(true);
    
    const dbFecha = formatFriendlyToDb(fechaComprobante);
    
    let finalJustificacion = justificacion.trim();
    if (currentUser?.rol === 'DEV') {
      finalJustificacion = `[PRUEBA] ${finalJustificacion}`;
    }
    if (!proveedor.trim() && comentarioProveedor.trim()) {
      finalJustificacion = `[Proveedor a agregar: ${comentarioProveedor.trim()}]\n\n${finalJustificacion}`;
    }

    if (!isSplit && !sucursal.trim() && comentarioSucursal.trim()) {
      finalJustificacion = `[Sucursal a agregar: ${comentarioSucursal.trim()}]\n\n${finalJustificacion}`;
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
    
    const activeCatObj = categorias.find(c => c.nombre && c.nombre.trim().toLowerCase() === selectedCategoria.trim().toLowerCase());
    const activeSubObj = subcategorias.find(s => s.nombre && s.nombre.trim().toLowerCase() === selectedSubcategoria.trim().toLowerCase() && (!activeCatObj || s.categoria_id === activeCatObj.id));
    const activeProvObj = proveedores.find(p => p.nombre && p.nombre.trim().toLowerCase() === proveedor.trim().toLowerCase());
    const activeCliObj = clientes.find(c => c.nombre && c.nombre.trim().toLowerCase() === selectedCliente.trim().toLowerCase());
    const activeSucObj = sucursalesCliente.find(s => s.nombre && s.nombre.trim().toLowerCase() === sucursal.trim().toLowerCase() && (!activeCliObj || s.cliente_id === activeCliObj.id));

    const gastoPayload = {
      empleado_id: currentUser.id,
      empleado_nombre: currentUser.nombre,
      monto: totalGasto,
      subcategoria_id: activeSubObj?.id || null,
      metodo_pago: metodoPago,
      justificacion: finalJustificacion,
      fecha_comprobante: dbFecha,
      proveedor_id: activeProvObj?.id || null,
      cliente_id: activeCliObj?.id || null,
      sucursal_id: activeSucObj?.id || null,
      tipo_tarjeta: tipoTarjeta,
      ubicacion_registro: 'Móvil',
      facturado,
      motivo_sin_factura: facturado === true
        ? null
        : (facturaStatus === 'PENDIENTE')
            ? (comentarioPendiente.trim() ? `PENDIENTE_ENTREGA: ${comentarioPendiente.trim()}` : 'PENDIENTE_ENTREGA')
            : (motivoSinFactura.trim() || null),
      tipo_servicio_proyecto: tipoServicioProyecto,
      detalle_servicio_proyecto: detalleServicioProyecto.trim(),
    };

    setIsSubmitting(true);

    try {
      const netState = await NetInfo.fetch();
      
      if (netState.isConnected) {
        // En línea: Subir foto y guardar en Supabase
        let publicUrl = imageUri;
        if (imageBase64) {
          try {
            const contentType = imageExt === 'pdf' ? 'application/pdf' : 'image/jpeg';
            const fileName = `${currentUser.id}/${Date.now()}.${imageExt}`;
            const arrayBuffer = base64ToArrayBuffer(imageBase64);

            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('tickets')
              .upload(fileName, arrayBuffer, { contentType, upsert: true });

            if (!uploadError) {
              const { data: urlData } = supabase.storage.from('tickets').getPublicUrl(fileName);
              publicUrl = urlData.publicUrl;
            } else {
              console.warn('Supabase storage upload skipped or failed:', uploadError);
            }
          } catch (stErr) {
            console.warn('Storage upload exception (continuing):', stErr);
          }
        }

        // Subir factura si se seleccionó una
        let publicInvoiceUrl = '';
        if (facturado && facturaBase64) {
          try {
            const ext = facturaExt || 'jpg';
            const contentType = ext === 'pdf' ? 'application/pdf' : 'image/jpeg';
            const fileName = `${currentUser.id}/factura_${Date.now()}.${ext}`;
            const arrayBuffer = base64ToArrayBuffer(facturaBase64);

            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('tickets')
              .upload(fileName, arrayBuffer, { contentType: contentType, upsert: true });

            if (!uploadError) {
              const { data: urlData } = supabase.storage.from('tickets').getPublicUrl(fileName);
              publicInvoiceUrl = urlData.publicUrl;
            } else {
              console.warn('Invoice storage upload skipped or failed:', uploadError);
            }
          } catch (invErr) {
            console.warn('Invoice storage upload exception (continuing):', invErr);
          }
        }

        let payloadsToInsert = isSplit ? splits.map((s, index) => {
          const splitCliObj = clientes.find(c => c.nombre && c.nombre.trim().toLowerCase() === (s.clienteId || '').trim().toLowerCase());
          const splitSucObj = sucursalesCliente.find(suc => suc.nombre && suc.nombre.trim().toLowerCase() === (s.sucursalNombre || '').trim().toLowerCase() && (!splitCliObj || suc.cliente_id === splitCliObj.id));
          return {
            ...gastoPayload,
            monto: Number(s.monto),
            cliente_id: splitCliObj?.id || null,
            sucursal_id: splitSucObj?.id || null,
            justificacion: `[Gasto dividido del ticket total de $${totalGasto.toFixed(2)}] - División ${index + 1}/${splits.length} (Cliente: ${s.clienteId} | Sucursal: ${s.sucursalNombre || s.comentarioSucursal})${s.comentarioSucursal ? `\n[Sucursal a agregar: ${s.comentarioSucursal}]` : ''}\n\n${gastoPayload.justificacion}`,
            foto_url: publicUrl || null,
            factura_url: publicInvoiceUrl || null,
            status: 'PENDING',
          };
        }) : [
          {
            ...gastoPayload,
            foto_url: publicUrl || null,
            factura_url: publicInvoiceUrl || null,
            status: 'PENDING',
          }
        ];

        const esGasolina = isCombustibleExpense(selectedCategoria, selectedSubcategoria);
        let gasolinaPayload = null;

        if (esGasolina) {
          gasolinaPayload = {
            vehiculo_id: selectedVehiculoId,
            empleado_id: currentUser.id,
            fecha: dbFecha,
            kilometraje_actual: Number(kilometrajeActual),
            litros: Number(litrosGasolina),
            costo_total: Number(totalGasto),
            ticket_foto_url: publicUrl || null,
            observaciones: `Registro automático desde formulario de gastos. Proveedor: ${proveedor || 'N/A'}`,
          };
        }

        const headers = await getApiHeaders();
        const res = await fetch(`${getApiUrl()}/api/reportes/gastos`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ 
            payloadsToInsert, 
            gasolinaPayload,
            createNotifications: true,
            employeeName: currentUser.nombre,
            totalGasto: totalGasto,
            categoriaNombre: selectedCategoria
          })
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Error al guardar el gasto');
        }

        showAlert('Éxito', 'Gasto registrado correctamente en el servidor.');
      } else {
        // Fuera de línea: Guardar localmente
        const esGasolina = isCombustibleExpense(selectedCategoria, selectedSubcategoria);
        if (isSplit) {
          for (let i = 0; i < splits.length; i++) {
            const s = splits[i];
            const splitCliObj = clientes.find(c => c.nombre && c.nombre.trim().toLowerCase() === (s.clienteId || '').trim().toLowerCase());
            const splitSucObj = sucursalesCliente.find(suc => suc.nombre && suc.nombre.trim().toLowerCase() === (s.sucursalNombre || '').trim().toLowerCase() && (!splitCliObj || suc.cliente_id === splitCliObj.id));
            await SyncService.enqueueGasto({
              ...gastoPayload,
              monto: Number(s.monto),
              cliente: s.clienteId || null,
              cliente_id: splitCliObj?.id || null,
              sucursal: s.sucursalNombre || null,
              sucursal_id: splitSucObj?.id || null,
              justificacion: `[Gasto dividido del ticket total de $${totalGasto.toFixed(2)}] - División ${i + 1}/${splits.length} (Cliente: ${s.clienteId} | Sucursal: ${s.sucursalNombre || s.comentarioSucursal})${s.comentarioSucursal ? `\n[Sucursal a agregar: ${s.comentarioSucursal}]` : ''}\n\n${gastoPayload.justificacion}`,
              base64Foto: imageBase64 || undefined,
              fotoExt: imageExt,
              base64Factura: facturaBase64 || undefined,
              facturaExt: facturaExt,
              vehiculo_id: esGasolina ? selectedVehiculoId : undefined,
              kilometraje_actual: esGasolina ? Number(kilometrajeActual) : undefined,
              litros: esGasolina ? Number(litrosGasolina) : undefined,
            });
          }
        } else {
          await SyncService.enqueueGasto({
            ...gastoPayload,
            base64Foto: imageBase64 || undefined,
            fotoExt: imageExt,
            base64Factura: facturaBase64 || undefined,
            facturaExt: facturaExt,
            vehiculo_id: esGasolina ? selectedVehiculoId : undefined,
            kilometraje_actual: esGasolina ? Number(kilometrajeActual) : undefined,
            litros: esGasolina ? Number(litrosGasolina) : undefined,
          });
        }
        showAlert(
          'Guardado sin conexión',
          'No tienes red. El gasto ha sido encolado en tu dispositivo y se sincronizará automáticamente al recuperar conexión.'
        );
      }

      router.replace('/(empleado)/gastos' as any);
    } catch (err: any) {
      const errorDetails = err?.message || err?.details || err?.hint || (typeof err === 'object' ? JSON.stringify(err) : String(err));
      console.error('Error al guardar gasto:', errorDetails);
      showAlert('Error al guardar', errorDetails || 'No se pudo guardar el gasto.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextStep = () => {
    if (currentStep === 1) {
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
        showAlert('Validación', 'Por favor selecciona la tarjeta utilizada (BBVA, AMEX, MARRIOT, BANORTE, INVEX).');
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
      if (facturado === false && facturaStatus === 'NO' && !motivoSinFactura.trim()) {
        showAlert('Validación', 'Por favor especifica el motivo por el cual no se cuenta con factura.');
        return;
      }
      if (!proveedor.trim() && !comentarioProveedor.trim()) {
        showAlert('Validación', 'Por favor indica en el campo "Proveedor a agregar" el nombre del proveedor para que el administrador pueda registrarlo.');
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
        <View style={styles.backBtn} />
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Registrar Gasto</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
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
            steps={['Datos', 'Clasificación', 'Comprobante']} 
            onStepPress={(step) => {
              if (step < currentStep || true) {
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
                        setAlertaPolitica(null);
                        setIncluyePropina(null);
                        setMontoPropina('');
                      }}
                    >
                      <Ionicons name="trash" size={20} color="#ffffff" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.uploadPlaceholder}>
                    <Ionicons name="receipt-outline" size={64} color={themeColors.textSecondary} />
                    <Text style={[styles.placeholderText, { color: themeColors.textSecondary }]}>
                      Captura el comprobante
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
                <View style={[styles.customDropdownContainer, { marginTop: Spacing.two, zIndex: 50 }]}>
                  <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>
                    ¿Con cuántos empleados compartiste este consumo?
                  </Text>
                  <TouchableOpacity
                    style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                    onPress={() => {
                      Keyboard.dismiss();
                      setShowEmpList(!showEmpList);
                    }}
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
                      <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                        <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                          {allUsers
                            .filter(u => u.id !== currentUser?.id)
                            .map((user, index, array) => {
                              const isSelected = selectedEmpleados.some(e => e.id === user.id);
                              return (
                                <TouchableOpacity
                                  key={user.id}
                                  style={[
                                    styles.dropdownItem,
                                    index === array.length - 1 && { borderBottomWidth: 0 },
                                    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.one }
                                  ]}
                                  onPress={() => {
                                    if (isSelected) {
                                      setSelectedEmpleados(prev => prev.filter(e => e.id !== user.id));
                                    } else {
                                      setSelectedEmpleados(prev => [...prev, user]);
                                    }
                                  }}
                                >
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.one }}>
                                    <Ionicons name="person-add-outline" size={24} color={themeColors.primary} />
                                    <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 14 }}>{user.nombre}</Text>
                                  </View>
                                  <Ionicons
                                    name={isSelected ? 'checkbox-outline' : 'square-outline'}
                                    size={24}
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
              )}

              {imageUri && (
                <>
                  {esComida && (
                    <View style={[styles.innerCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, marginBottom: Spacing.two }]}>
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
                            placeholder="0.00"
                            keyboardType="decimal-pad"
                            value={montoPropina}
                            onChangeText={(val) => setMontoPropina(val.replace(',', '.').replace(/[^0-9.]/g, ''))}
                            iconName="logo-usd"
                          />
                        </View>
                      )}
                    </View>
                  )}

                </>
              )}

              <View style={[styles.footerNav, { marginTop: Spacing.three }]}>
                <CustomButton title="Siguiente" onPress={nextStep} style={{ width: '100%' }} />
              </View>
            </View>
          )}

          {/* PASO 2: Detalles Físicos */}
          {currentStep === 2 && (
            <View style={styles.stepContainer}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                2. Detalles de la Compra
              </Text>

              {!!(alertaPolitica || alertaLocal) && (
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
                onChangeText={(val) => setMonto(val.replace(',', '.').replace(/[^0-9.]/g, ''))}
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
              </View>

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
                <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Proveedor / Comercio</Text>
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

                        {proveedores
                          .filter(p => 
                            !!p.nombre && (
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
                          !!p.nombre && (
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
                    Indica el nombre del proveedor para que el administrador lo registre y pueda aprobar el gasto.
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

              {/* Opción Dividir Gasto */}
              <View style={[styles.customDropdownContainer, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.two }]}>
                <Text style={[styles.dropdownLabel, { color: themeColors.text, marginBottom: 0 }]}>¿Dividir ticket en varios clientes?</Text>
                <Switch
                  value={isSplit}
                  onValueChange={setIsSplit}
                  trackColor={{ false: themeColors.border, true: themeColors.primary + '80' }}
                  thumbColor={isSplit ? themeColors.primary : themeColors.textSecondary}
                />
              </View>

              {!isSplit ? (
                <>
                  <View style={styles.customDropdownContainer}>
                    <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Cliente Relacionado *</Text>
                    <TouchableOpacity
                      style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                      onPress={() => {
                        Keyboard.dismiss();
                        setShowCliDropdown(!showCliDropdown);
                        setShowCatDropdown(false);
                        setShowSubDropdown(false);
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
                            placeholder="Buscar cliente..."
                            value={clienteSearch}
                            onChangeText={setClienteSearch}
                            iconName="search-outline"
                            style={{ margin: Spacing.one, height: 40 }}
                          />
                          <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 250, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
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
                                    const cliSucs = sucursalesCliente.filter(s => s.cliente_id === cli.id);
                                    if (cliSucs.length === 1) {
                                      setSucursal(cliSucs[0].nombre);
                                    } else {
                                      setSucursal('');
                                    }
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
                    <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Sucursal del cliente *</Text>
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
                            placeholder="Buscar o agregar sucursal..."
                            value={sucursalSearch}
                            onChangeText={setSucursalSearch}
                            iconName="search-outline"
                            style={{ margin: Spacing.one, height: 40 }}
                          />
                          <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 220, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                            {(() => {
                               const currentCliente = clientes.find(c => c.nombre?.trim().toLowerCase() === selectedCliente?.trim().toLowerCase());
                               const filteredSucursales = currentCliente ? sucursalesCliente.filter(s => s.cliente_id === currentCliente.id && s.nombre.toLowerCase().includes(sucursalSearch.toLowerCase())) : [];
                               const existsExact = currentCliente && sucursalesCliente.some(s => s.cliente_id === currentCliente.id && s.nombre.trim().toLowerCase() === sucursalSearch.trim().toLowerCase());

                               return (
                                 <>
                                   <TouchableOpacity
                                     style={[styles.dropdownItem, { backgroundColor: themeColors.accent + '10', flexDirection: 'row', alignItems: 'center', gap: Spacing.one }]}
                                     onPress={() => {
                                        setSucursal('');
                                        setSucursalSearch('');
                                        setShowSucursalDropdown(false);
                                     }}
                                   >
                                     <Ionicons name="close-circle-outline" size={24} color={themeColors.danger} />
                                     <Text style={{ color: themeColors.danger, fontWeight: '600', fontSize: 13 }}>
                                       Dejar en blanco (Sin sucursal)
                                     </Text>
                                   </TouchableOpacity>

                                   {filteredSucursales.map((suc, index, array) => (
                                      <TouchableOpacity
                                        key={suc.id}
                                        style={[
                                          styles.dropdownItem,
                                          index === array.length - 1 && { borderBottomWidth: 0 },
                                          { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, justifyContent: 'space-between' }
                                        ]}
                                        onPress={() => {
                                          setSucursal(suc.nombre);
                                          setSucursalSearch('');
                                          setShowSucursalDropdown(false);
                                        }}
                                      >
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.one, flex: 1 }}>
                                          <Ionicons name="business-outline" size={20} color={themeColors.primary} />
                                          <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 14 }}>{suc.nombre}</Text>
                                        </View>
                                        {sucursal === suc.nombre && (
                                          <Ionicons name="checkmark" size={18} color={themeColors.primary} />
                                        )}
                                      </TouchableOpacity>
                                   ))}

                                   {filteredSucursales.length === 0 && !sucursalSearch.trim() && (
                                     <View style={{ padding: Spacing.two, alignItems: 'center' }}>
                                       <Text style={{ color: themeColors.textSecondary, fontSize: 13, textAlign: 'center', marginBottom: 4 }}>
                                         No hay sucursales registradas para este cliente.
                                       </Text>
                                     </View>
                                   )}
                                 </>
                               );
                            })()}
                          </ScrollView>
                        </View>
                      </Pressable>
                    )}
                  </View>

                  {/* Campo obligatorio de Sucursal a agregar si no se seleccionó sucursal */}
                  {!sucursal && selectedCliente ? (
                    <View style={{ marginBottom: Spacing.three }}>
                      <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Sucursal a agregar *</Text>
                      <CustomInput
                        placeholder="Escribe el nombre de la sucursal..."
                        value={comentarioSucursal}
                        onChangeText={setComentarioSucursal}
                        iconName="business-outline"
                      />
                      <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 4, marginLeft: 4 }}>
                        El administrador se encargará de registrar esta sucursal.
                      </Text>
                    </View>
                  ) : null}

                </>
              ) : (
                <View style={{ marginBottom: Spacing.three }}>
                  {/* Resumen de Asignación */}
                  {(() => {
                    const currentTotalGasto = Number(monto || 0) + (esComida && incluyePropina === false ? Number(montoPropina || 0) : 0);
                    const sumDividido = splits.reduce((acc, curr) => acc + (Number(curr.monto) || 0), 0);
                    const diff = currentTotalGasto - sumDividido;
                    const isCompleto = Math.abs(diff) < 0.05 && currentTotalGasto > 0;
                    const isExcedido = diff < -0.05;

                    return (
                      <View style={{
                        backgroundColor: themeColors.backgroundElement,
                        borderRadius: BorderRadius.medium,
                        padding: Spacing.two,
                        borderWidth: 1,
                        borderColor: isCompleto ? (themeColors.success || '#10b981') : isExcedido ? themeColors.danger : (themeColors.warning || '#f59e0b'),
                        marginBottom: Spacing.two
                      }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>Total del Ticket:</Text>
                          <Text style={{ color: themeColors.text, fontWeight: '700', fontSize: 13 }}>${currentTotalGasto.toFixed(2)}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>Total Dividido:</Text>
                          <Text style={{ color: themeColors.primary, fontWeight: '700', fontSize: 13 }}>${sumDividido.toFixed(2)}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: themeColors.border, paddingTop: 4 }}>
                          <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>
                            {isCompleto ? '✅ Estado:' : isExcedido ? '❌ Exceso:' : '⏳ Restante por asignar:'}
                          </Text>
                          <Text style={{
                            fontWeight: '700',
                            fontSize: 13,
                            color: isCompleto ? (themeColors.success || '#10b981') : isExcedido ? themeColors.danger : (themeColors.warning || '#f59e0b')
                          }}>
                            {isCompleto ? '100% Asignado' : `$${Math.abs(diff).toFixed(2)}`}
                          </Text>
                        </View>
                      </View>
                    );
                  })()}

                  <Text style={[styles.dropdownLabel, { color: themeColors.text, marginBottom: Spacing.one }]}>
                    Divisiones registradas ({splits.length})
                  </Text>

                  {splits.map((split) => (
                    <View key={split.id} style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: themeColors.backgroundElement,
                      padding: Spacing.two,
                      borderRadius: BorderRadius.small,
                      borderWidth: 1,
                      borderColor: themeColors.border,
                      marginBottom: Spacing.one
                    }}>
                      <View style={{ flex: 1, marginRight: Spacing.one }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name="person-circle-outline" size={16} color={themeColors.primary} />
                          <Text style={{ color: themeColors.text, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                            {split.clienteId}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <Ionicons name="business-outline" size={14} color={themeColors.textSecondary} />
                          <Text style={{ color: themeColors.textSecondary, fontSize: 12 }} numberOfLines={1}>
                            {split.sucursalNombre || 'Sin sucursal'}
                          </Text>
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Text style={{ color: themeColors.primary, fontWeight: '700', fontSize: 14 }}>
                          ${Number(split.monto).toFixed(2)}
                        </Text>
                        <TouchableOpacity
                          onPress={() => {
                            const newSplits = splits.filter(s => s.id !== split.id);
                            setSplits(newSplits);
                          }}
                          style={{ padding: 4 }}
                        >
                          <Ionicons name="trash-outline" size={18} color={themeColors.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}

                  <TouchableOpacity
                    onPress={() => {
                      const currentTotalGasto = Number(monto || 0) + (esComida && incluyePropina === false ? Number(montoPropina || 0) : 0);
                      const sumDividido = splits.reduce((acc, curr) => acc + (Number(curr.monto) || 0), 0);
                      const remainder = Math.max(0, currentTotalGasto - sumDividido);

                      setNewSplitClienteId('');
                      setNewSplitSucursalNombre('');
                      setNewSplitComentarioSucursal('');
                      setNewSplitMonto(remainder > 0 ? remainder.toFixed(2) : '');
                      setSplitClienteSearch('');
                      setSplitSucursalSearch('');
                      setShowNewSplitCliDropdown(false);
                      setShowNewSplitSucDropdown(false);
                      setShowSplitModal(true);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: themeColors.primary + '15',
                      padding: Spacing.two,
                      borderRadius: BorderRadius.small,
                      marginTop: Spacing.one,
                      borderWidth: 1,
                      borderColor: themeColors.primary + '40',
                      borderStyle: 'dashed'
                    }}
                  >
                    <Ionicons name="add-circle-outline" size={20} color={themeColors.primary} style={{ marginRight: Spacing.half }} />
                    <Text style={{ color: themeColors.primary, fontWeight: '700' }}>➕ Agregar División de Gasto</Text>
                  </TouchableOpacity>
                </View>
              )}


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
                      {(['BBVA', 'AMEX', 'MARRIOT', 'BANORTE', 'INVEX'] as const).map((card) => (
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
                      setComentarioPendiente('');
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
                      setMotivoSinFactura('PENDIENTE_ENTREGA');
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
                <View style={{ marginBottom: Spacing.two }}>
                  <View style={[styles.alertBanner, { backgroundColor: themeColors.warning + '15', borderColor: themeColors.warning, marginBottom: Spacing.two, padding: Spacing.two, borderRadius: BorderRadius.medium }]}>
                    <Text style={{ color: themeColors.warning, fontWeight: '700', fontSize: 12 }}>
                      ⚠️ Factura Pendiente de Entregar: Se podrá adjuntar el archivo posteriormente.
                    </Text>
                  </View>
                  <CustomInput
                    label="Explicación de Factura Pendiente (Obligatorio) *"
                    placeholder="Ej. El proveedor enviará el archivo el próximo lunes..."
                    value={comentarioPendiente}
                    onChangeText={setComentarioPendiente}
                    iconName="chatbox-outline"
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

              {!!(alertaPolitica || alertaLocal) && (
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
                    Keyboard.dismiss();
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
                      <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                        {categorias.map((cat, index, array) => (
                          <TouchableOpacity
                            key={cat.id}
                            style={[
                              styles.dropdownItem,
                              index === array.length - 1 && { borderBottomWidth: 0 },
                              { flexDirection: 'row', alignItems: 'center', gap: Spacing.one }
                            ]}
                            onPress={() => {
                              setSelectedCategoria(cat.nombre);
                              setSelectedSubcategoria(''); // Limpiar subcategoría al cambiar de categoría
                              setShowCatDropdown(false);
                            }}
                          >
                            <Ionicons name="folder-open-outline" size={24} color={themeColors.primary} />
                            <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 14 }}>{cat.nombre}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  </Pressable>
                )}
              </View>

              {/* Selector de Subcategorías (Filtrado dependiente) */}
              {!!selectedCategoria && (
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
                        <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                          {filteredSubcategorias.length > 0 ? (
                            filteredSubcategorias.map((sub, index, array) => (
                              <TouchableOpacity
                                key={sub.id}
                                style={[
                                  styles.dropdownItem,
                                  index === array.length - 1 && { borderBottomWidth: 0 },
                                  { flexDirection: 'row', alignItems: 'center', gap: Spacing.one }
                                ]}
                                onPress={() => {
                                  setSelectedSubcategoria(sub.nombre);
                                  setShowSubDropdown(false);
                                }}
                              >
                                <Ionicons name="pricetag-outline" size={24} color={themeColors.primary} />
                                <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 14 }}>{sub.nombre}</Text>
                              </TouchableOpacity>
                            ))
                          ) : (
                            <Text style={{ padding: Spacing.two, color: themeColors.textSecondary, textAlign: 'center' }}>
                              No hay subcategorías
                            </Text>
                          )}
                        </ScrollView>
                      </View>
                    </Pressable>
                  )}
                </View>
              )}

              {/* Información de Gasolina / Combustible (Solo si es gasto de combustible) */}
              {isCombustibleExpense(selectedCategoria, selectedSubcategoria) && (
                <View style={{
                  padding: Spacing.three,
                  borderRadius: BorderRadius.medium,
                  backgroundColor: themeColors.primary + '08',
                  borderColor: themeColors.primary + '20',
                  borderWidth: 1,
                  marginBottom: Spacing.three,
                }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.primary, marginBottom: Spacing.two }}>
                    Detalles de Combustible / Bitácora
                  </Text>

                  {/* Selector de Vehículo */}
                  <View style={styles.customDropdownContainer}>
                    <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Vehículo *</Text>
                    <TouchableOpacity
                      style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                      onPress={() => {
                        Keyboard.dismiss();
                        setShowVehiculoDropdown(!showVehiculoDropdown);
                        setShowCatDropdown(false);
                        setShowSubDropdown(false);
                        setShowCliDropdown(false);
                      }}
                    >
                      <Text style={{ color: selectedVehiculoId ? themeColors.text : themeColors.textSecondary }}>
                        {vehiculos.find(v => v.id === selectedVehiculoId) 
                          ? `${vehiculos.find(v => v.id === selectedVehiculoId)?.marca} ${vehiculos.find(v => v.id === selectedVehiculoId)?.modelo} (${vehiculos.find(v => v.id === selectedVehiculoId)?.placas})` 
                          : 'Selecciona un vehículo'}
                      </Text>
                      <Ionicons name={showVehiculoDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                    </TouchableOpacity>
                    {showVehiculoDropdown && (
                      <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', zIndex: 1001 }}>
                        <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                          <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 150 }} keyboardShouldPersistTaps="handled">
                            {vehiculos.map((veh, index, array) => (
                              <TouchableOpacity
                                key={veh.id}
                                style={[
                                  styles.dropdownItem,
                                  index === array.length - 1 && { borderBottomWidth: 0 },
                                  { flexDirection: 'row', alignItems: 'center', gap: Spacing.one }
                                ]}
                                onPress={() => {
                                  setSelectedVehiculoId(veh.id);
                                  setShowVehiculoDropdown(false);
                                }}
                              >
                                <Ionicons name="car-outline" size={24} color={themeColors.primary} />
                                <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 13 }}>
                                  {veh.marca} {veh.modelo} - {veh.placas}
                                </Text>
                              </TouchableOpacity>
                            ))}
                            {vehiculos.length === 0 && (
                              <Text style={{ padding: Spacing.two, color: themeColors.textSecondary, textAlign: 'center' }}>
                                No hay vehículos registrados
                              </Text>
                            )}
                          </ScrollView>
                        </View>
                      </Pressable>
                    )}
                  </View>

                  {/* Kilometraje Actual */}
                  <CustomInput
                    label="Kilometraje Actual (Odómetro) *"
                    placeholder="Ej. 142500"
                    value={kilometrajeActual}
                    onChangeText={setKilometrajeActual}
                    keyboardType="numeric"
                  />

                  {/* Litros de Gasolina */}
                  <CustomInput
                    label="Litros Cargados *"
                    placeholder="Ej. 45.5"
                    value={litrosGasolina}
                    onChangeText={(val) => setLitrosGasolina(val.replace(',', '.'))}
                    keyboardType="decimal-pad"
                  />
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
      <Modal
        visible={showSplitModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowSplitModal(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', alignItems: 'center', padding: Spacing.four }}
            onPress={() => setShowSplitModal(false)}
          >
            <Pressable
              style={{ width: '100%', maxWidth: 480, maxHeight: '90%' }}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={{ backgroundColor: themeColors.background, borderRadius: BorderRadius.large, padding: Spacing.four, width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 }}>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ gap: Spacing.three }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: themeColors.text }}>Agregar División de Gasto</Text>
                    <TouchableOpacity onPress={() => setShowSplitModal(false)}>
                      <Ionicons name="close-circle-outline" size={24} color={themeColors.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  {/* Banner de Total y Restante */}
                  {(() => {
                    const totalGasto = Number(monto || 0) + (esComida && incluyePropina === false ? Number(montoPropina || 0) : 0);
                    const currentSum = splits.reduce((acc, curr) => acc + Number(curr.monto || 0), 0);
                    const remainder = Math.max(0, totalGasto - currentSum);

                    return (
                      <View style={{ backgroundColor: themeColors.primary + '15', padding: Spacing.two, borderRadius: BorderRadius.small, flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>Total Ticket: <Text style={{ color: themeColors.text, fontWeight: '700' }}>${totalGasto.toFixed(2)}</Text></Text>
                        <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>Restante: <Text style={{ color: themeColors.primary, fontWeight: '700' }}>${remainder.toFixed(2)}</Text></Text>
                      </View>
                    );
                  })()}

                  {/* Selector de Cliente */}
                  <View style={[styles.customDropdownContainer, { zIndex: 120 }]}>
                    <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Cliente Relacionado *</Text>
                    <TouchableOpacity
                      style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                      onPress={() => {
                        Keyboard.dismiss();
                        setShowNewSplitSucDropdown(false);
                        setShowNewSplitCliDropdown(!showNewSplitCliDropdown);
                      }}
                    >
                      <Text style={{ color: newSplitClienteId ? themeColors.text : themeColors.textSecondary }}>
                        {newSplitClienteId || 'Selecciona un cliente'}
                      </Text>
                      <Ionicons name={showNewSplitCliDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                    </TouchableOpacity>
                    {showNewSplitCliDropdown && (
                      <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', zIndex: 120 }}>
                        <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                          <CustomInput
                            placeholder="Buscar o agregar cliente..."
                            value={splitClienteSearch}
                            onChangeText={setSplitClienteSearch}
                            iconName="search-outline"
                            style={{ margin: Spacing.one, height: 40 }}
                          />
                          <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                            {splitClienteSearch.trim().length > 0 && !clientes.some(c => c.nombre && c.nombre.toLowerCase() === splitClienteSearch.trim().toLowerCase()) && (
                              <TouchableOpacity
                                style={[styles.dropdownItem, { backgroundColor: themeColors.accent + '15', flexDirection: 'row', alignItems: 'center', gap: Spacing.one }]}
                                onPress={() => {
                                  handleAddNewClienteForSplit(splitClienteSearch);
                                }}
                              >
                                <Ionicons name="add-circle-outline" size={24} color={themeColors.accent} />
                                <Text style={{ color: themeColors.accent, fontWeight: '600', fontSize: 14 }}>
                                  {`Agregar "${splitClienteSearch.trim()}"`}
                                </Text>
                              </TouchableOpacity>
                            )}
                            {clientes
                              .filter(cli => cli.nombre && cli.nombre.toLowerCase().includes(splitClienteSearch.toLowerCase()))
                              .map((cli, index, array) => (
                                <TouchableOpacity
                                  key={cli.id}
                                  style={[
                                    styles.dropdownItem,
                                    index === array.length - 1 && { borderBottomWidth: 0 },
                                    { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, justifyContent: 'space-between' }
                                  ]}
                                  onPress={() => {
                                    setNewSplitClienteId(cli.nombre);
                                    const cliSucs = sucursalesCliente.filter(s => s.cliente_id === cli.id);
                                    if (cliSucs.length === 1) {
                                      setNewSplitSucursalNombre(cliSucs[0].nombre);
                                    } else {
                                      setNewSplitSucursalNombre('');
                                    }
                                    setSplitClienteSearch('');
                                    setShowNewSplitCliDropdown(false);
                                  }}
                                >
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.one, flex: 1 }}>
                                    <Ionicons name="person-circle-outline" size={20} color={themeColors.primary} />
                                    <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 14 }}>{cli.nombre}</Text>
                                  </View>
                                  {newSplitClienteId === cli.nombre && (
                                    <Ionicons name="checkmark" size={18} color={themeColors.primary} />
                                  )}
                                </TouchableOpacity>
                              ))}
                          </ScrollView>
                        </View>
                      </Pressable>
                    )}
                  </View>

                  {/* Selector de Sucursal del Cliente */}
                  <View style={[styles.customDropdownContainer, { marginTop: Spacing.two, zIndex: 110 }]}>
                    <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Sucursal del Cliente *</Text>
                    <TouchableOpacity
                      disabled={!newSplitClienteId}
                      style={[
                        styles.dropdownTrigger,
                        {
                          backgroundColor: !newSplitClienteId ? themeColors.backgroundElement + '80' : themeColors.backgroundElement,
                          borderColor: themeColors.border,
                          opacity: !newSplitClienteId ? 0.6 : 1
                        }
                      ]}
                      onPress={() => {
                        Keyboard.dismiss();
                        setShowNewSplitCliDropdown(false);
                        setShowNewSplitSucDropdown(!showNewSplitSucDropdown);
                      }}
                    >
                      <Text style={{ color: newSplitSucursalNombre ? themeColors.text : themeColors.textSecondary }}>
                        {newSplitSucursalNombre || (newSplitClienteId ? 'Selecciona una sucursal' : 'Selecciona un cliente primero')}
                      </Text>
                      <Ionicons name={showNewSplitSucDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                    </TouchableOpacity>
                    {showNewSplitSucDropdown && newSplitClienteId && (
                      <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', zIndex: 110 }}>
                        <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                          <CustomInput
                            placeholder="Buscar o agregar sucursal..."
                            value={splitSucursalSearch}
                            onChangeText={setSplitSucursalSearch}
                            iconName="search-outline"
                            style={{ margin: Spacing.one, height: 40 }}
                          />
                          <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                            {(() => {
                              const currentCli = clientes.find(c => c.nombre?.trim().toLowerCase() === newSplitClienteId?.trim().toLowerCase());
                              const filteredSuc = currentCli ? sucursalesCliente.filter(s => s.cliente_id === currentCli.id && s.nombre.toLowerCase().includes(splitSucursalSearch.toLowerCase())) : [];
                              const existsExact = currentCli && sucursalesCliente.some(s => s.cliente_id === currentCli.id && s.nombre.trim().toLowerCase() === splitSucursalSearch.trim().toLowerCase());

                              return (
                                <>
                                  <TouchableOpacity
                                    style={[styles.dropdownItem, { backgroundColor: themeColors.accent + '10', flexDirection: 'row', alignItems: 'center', gap: Spacing.one }]}
                                    onPress={() => {
                                      setNewSplitSucursalNombre('');
                                      setSplitSucursalSearch('');
                                      setShowNewSplitSucDropdown(false);
                                    }}
                                  >
                                    <Ionicons name="close-circle-outline" size={24} color={themeColors.danger} />
                                    <Text style={{ color: themeColors.danger, fontWeight: '600', fontSize: 13 }}>
                                      Dejar en blanco (Sin sucursal)
                                    </Text>
                                  </TouchableOpacity>

                                  {splitSucursalSearch.trim().length > 0 && !existsExact && currentCli && (
                                    <TouchableOpacity
                                      style={[styles.dropdownItem, { backgroundColor: themeColors.accent + '15', flexDirection: 'row', alignItems: 'center', gap: Spacing.one }]}
                                      onPress={() => handleAddNewSucursalForSplit(splitSucursalSearch)}
                                    >
                                      <Ionicons name="add-circle-outline" size={24} color={themeColors.accent} />
                                      <View style={{ flex: 1 }}>
                                        <Text style={{ color: themeColors.accent, fontWeight: '700', fontSize: 13 }}>
                                          {`➕ Agregar "${splitSucursalSearch.trim().toUpperCase()}"`}
                                        </Text>
                                        <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>
                                          {`Vincular a: ${currentCli.nombre}`}
                                        </Text>
                                      </View>
                                    </TouchableOpacity>
                                  )}

                                  {filteredSuc.map((suc, index, array) => (
                                    <TouchableOpacity
                                      key={suc.id}
                                      style={[
                                        styles.dropdownItem,
                                        index === array.length - 1 && { borderBottomWidth: 0 },
                                        { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, justifyContent: 'space-between' }
                                      ]}
                                      onPress={() => {
                                        setNewSplitSucursalNombre(suc.nombre);
                                        setSplitSucursalSearch('');
                                        setShowNewSplitSucDropdown(false);
                                      }}
                                    >
                                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.one, flex: 1 }}>
                                        <Ionicons name="business-outline" size={18} color={themeColors.primary} />
                                        <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 14 }}>{suc.nombre}</Text>
                                      </View>
                                      {newSplitSucursalNombre === suc.nombre && (
                                        <Ionicons name="checkmark" size={18} color={themeColors.primary} />
                                      )}
                                    </TouchableOpacity>
                                  ))}

                                  {filteredSuc.length === 0 && !splitSucursalSearch.trim() && (
                                    <View style={{ padding: Spacing.two, alignItems: 'center' }}>
                                      <Text style={{ color: themeColors.textSecondary, fontSize: 12, textAlign: 'center', marginBottom: 4 }}>
                                        No hay sucursales registradas para este cliente.
                                      </Text>
                                      <Text style={{ color: themeColors.accent, fontSize: 11, fontWeight: '600', textAlign: 'center' }}>
                                        Escribe arriba para agregar una nueva.
                                      </Text>
                                    </View>
                                  )}
                                </>
                              );
                            })()}
                          </ScrollView>
                        </View>
                      </Pressable>
                    )}
                  </View>

                  {!newSplitSucursalNombre && newSplitClienteId ? (
                    <View style={{ marginTop: Spacing.two, zIndex: 105 }}>
                      <CustomInput
                        label="Sucursal a agregar *"
                        placeholder="Escribe el nombre de la sucursal..."
                        value={newSplitComentarioSucursal}
                        onChangeText={setNewSplitComentarioSucursal}
                        iconName="business-outline"
                      />
                      <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 4, marginLeft: 4 }}>
                        El administrador se encargará de registrar esta sucursal.
                      </Text>
                    </View>
                  ) : null}

                  {/* Monto Asignado */}
                  <View style={{ marginTop: Spacing.two, zIndex: 1 }}>
                    <CustomInput
                      label="Monto Asignado *"
                      placeholder="Ej. 150.00"
                      keyboardType="decimal-pad"
                      value={newSplitMonto}
                      onChangeText={(val) => setNewSplitMonto(val.replace(',', '.'))}
                      iconName="cash-outline"
                      onFocus={() => {
                        setShowNewSplitCliDropdown(false);
                        setShowNewSplitSucDropdown(false);
                      }}
                    />
                    {(() => {
                      const totalGasto = Number(monto || 0) + (esComida && incluyePropina === false ? Number(montoPropina || 0) : 0);
                      const currentSum = splits.reduce((acc, curr) => acc + Number(curr.monto || 0), 0);
                      const remainder = Math.max(0, totalGasto - currentSum);

                      if (remainder > 0) {
                        return (
                          <TouchableOpacity
                            onPress={() => setNewSplitMonto(remainder.toFixed(2))}
                            style={{ alignSelf: 'flex-start', marginTop: 4, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: themeColors.primary + '15', borderRadius: BorderRadius.small }}
                          >
                            <Text style={{ color: themeColors.primary, fontSize: 12, fontWeight: '600' }}>
                              ⚡ Usar restante ($ {remainder.toFixed(2)})
                            </Text>
                          </TouchableOpacity>
                        );
                      }
                      return null;
                    })()}
                  </View>

                  <View style={{ flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.four, zIndex: 1 }}>
                    <CustomButton
                      title="Cancelar"
                      variant="secondary"
                      onPress={() => setShowSplitModal(false)}
                      style={{ flex: 1 }}
                    />
                    <CustomButton
                      title="Guardar"
                      onPress={() => {
                        if (!newSplitClienteId.trim()) {
                          showAlert('Atención', 'Por favor selecciona un cliente.');
                          return;
                        }
                        if (!newSplitSucursalNombre.trim() && !newSplitComentarioSucursal.trim()) {
                          showAlert('Atención', 'Por favor selecciona la sucursal para el cliente o indica una nueva.');
                          return;
                        }
                        if (!newSplitMonto || isNaN(Number(newSplitMonto)) || Number(newSplitMonto) <= 0) {
                          showAlert('Atención', 'Por favor ingresa un monto válido mayor a 0.');
                          return;
                        }
                        const totalGasto = Number(monto || 0) + (esComida && incluyePropina === false ? Number(montoPropina || 0) : 0);
                        const currentSum = splits.reduce((acc, curr) => acc + Number(curr.monto || 0), 0);
                        if (currentSum + Number(newSplitMonto) > totalGasto + 0.01) {
                          showAlert('Atención', `El monto ingresado excede el total del ticket ($${totalGasto.toFixed(2)}). Restante: $${(totalGasto - currentSum).toFixed(2)}`);
                          return;
                        }
                        setSplits([...splits, { id: Date.now().toString(), clienteId: newSplitClienteId, sucursalNombre: newSplitSucursalNombre, comentarioSucursal: newSplitComentarioSucursal, monto: newSplitMonto }]);
                        setShowSplitModal(false);
                      }}
                      style={{ flex: 1 }}
                    />
                  </View>
                </ScrollView>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
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
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    maxHeight: 250,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  dropdownItem: {
    padding: Spacing.two,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e0e0e0',
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
