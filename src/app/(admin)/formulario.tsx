import React, { useEffect, useState, useMemo } from 'react';
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
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { supabase, AuthService, Usuario, CatalogoItem, SubcategoriaItem, Vehiculo, VehiculoService } from '@/services/supabase';
import { SyncService, base64ToArrayBuffer } from '@/services/sync';
import { GeminiService } from '@/services/gemini';
import { getComentariosPlaceholder } from '@/utils/helpers';
import StepIndicator from '@/components/StepIndicator';
import CustomInput from '@/components/CustomInput';
import CustomButton from '@/components/CustomButton';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import ImageViewerModal from '@/components/ImageViewerModal';

const ESTADOS_MEXICO = [
  'Aguascalientes',
  'Baja California',
  'Baja California Sur',
  'Campeche',
  'Chiapas',
  'Chihuahua',
  'Coahuila',
  'Colima',
  'Ciudad de México',
  'Durango',
  'Guanajuato',
  'Guerrero',
  'Hidalgo',
  'Jalisco',
  'Estado de México',
  'Michoacán',
  'Morelos',
  'Nayarit',
  'Nuevo León',
  'Oaxaca',
  'Puebla',
  'Querétaro',
  'Quintana Roo',
  'San Luis Potosí',
  'Sinaloa',
  'Sonora',
  'Tabasco',
  'Tamaulipas',
  'Tlaxcala',
  'Veracruz',
  'Yucatán',
  'Zacatecas'
];


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

  // Paso 1: Evidencia
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageExt, setImageExt] = useState<string>('jpg');
  const [isScanning, setIsScanning] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);

  // Estados para compartir consumo con otros empleados
  const [allUsers, setAllUsers] = useState<Usuario[]>([]);
  const [selectedEmpleados, setSelectedEmpleados] = useState<Usuario[]>([]);
  const [showEmpList, setShowEmpList] = useState(false);

  // Paso 2: Detalles
  const [monto, setMonto] = useState('');
  const [proveedor, setProveedor] = useState('');
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
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'tarjeta' | 'tarjeta_credito' | 'tarjeta_debito'>('efectivo');
  const [tipoTarjeta, setTipoTarjeta] = useState<'BBVA' | 'AMEX' | 'MARRIOT' | 'BANORTE' | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateValue, setDateValue] = useState(new Date());
  const [alertaPolitica, setAlertaPolitica] = useState<string | null>(null);
  
  // Estado de la República
  const [selectedEstado, setSelectedEstado] = useState<string>('');
  const [showEstDropdown, setShowEstDropdown] = useState(false);



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

  // Vehículos y Gasolina
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [selectedVehiculoId, setSelectedVehiculoId] = useState<string>('');
  const [kilometrajeActual, setKilometrajeActual] = useState<string>('');
  const [litrosGasolina, setLitrosGasolina] = useState<string>('');
  const [showVehiculoDropdown, setShowVehiculoDropdown] = useState(false);

  // División de Gasto
  const [isSplit, setIsSplit] = useState(false);
  const [splits, setSplits] = useState<{ id: string; clienteId: string; monto: string }[]>([]);

  // Dropdown list visibility toggles (Mock pickers since RN Picker is external)
  const [showCatDropdown, setShowCatDropdown] = useState(false);
  const [showSubDropdown, setShowSubDropdown] = useState(false);
  const [showCliDropdown, setShowCliDropdown] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [activeSplitDropdownId, setActiveSplitDropdownId] = useState<string | null>(null);

  // Modal para agregar división de gasto
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [newSplitClienteId, setNewSplitClienteId] = useState('');
  const [newSplitMonto, setNewSplitMonto] = useState('');
  const [showNewSplitCliDropdown, setShowNewSplitCliDropdown] = useState(false);
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
      const [catRes, subRes, cliRes, usrRes, vehList] = await Promise.all([
        supabase.from('categorias').select('*').order('nombre'),
        supabase.from('subcategorias').select('*').order('nombre'),
        supabase.from('clientes').select('*').order('nombre'),
        supabase.from('usuarios').select('*').order('nombre'),
        VehiculoService.getVehiculos(true),
      ]);

      if (catRes.data) setCategorias(catRes.data);
      if (subRes.data) setSubcategorias(subRes.data);
      if (cliRes.data) setClientes(cliRes.data);
      if (usrRes.data) setAllUsers(usrRes.data);
      if (vehList) setVehiculos(vehList);
    } catch (err) {
      console.error('Error loading catalogs:', err);
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
        setImageUri(result.assets[0].uri);
        setImageBase64(result.assets[0].base64 || null);
        setScanSuccess(false); // Resetear bandera de escaneo anterior
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
        setImageUri(result.assets[0].uri);
        setImageBase64(result.assets[0].base64 || null);
        setImageExt('jpg');
        setScanSuccess(false);
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
           base64Str = await FileSystem.readAsStringAsync(file.uri, {
             encoding: FileSystem.EncodingType.Base64,
           });
        }
        setImageBase64(base64Str);
        
        setScanSuccess(false);
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


  // Escanear con IA (Gemini OCR)
  const handleScanWithIA = async () => {
    if (!imageBase64) return;
    setIsScanning(true);
    try {
      const result = await GeminiService.scanTicket(imageBase64, 1 + selectedEmpleados.length, imageExt === 'pdf' ? 'application/pdf' : 'image/jpeg');
      
      if (result.monto) setMonto(result.monto.toString());
      if (result.proveedor) setProveedor(result.proveedor);
      if (result.sucursal) setSucursal(result.sucursal);
      
      // Actualizar fecha si la extrae
      if (result.fecha) {
        setFechaComprobante(result.fecha);
        // Intentar parsear a objeto Date para el picker
        const parts = result.fecha.split('/');
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const year = parseInt(parts[2], 10);
          const parsedDate = new Date(year, month, day);
          if (!isNaN(parsedDate.getTime())) {
            setDateValue(parsedDate);
          }
        }
      }

      // Actualizar método de pago si lo detecta
      if (result.metodo_pago) {
        setMetodoPago(result.metodo_pago);
      }

      // Sugerir justificación
      if (result.justificacion_sugerida) {
        setJustificacion(result.justificacion_sugerida);
      }
      
      // Intentar pre-seleccionar categoría si coincide con una existente
      if (result.categoria) {
        const catSugerida = result.categoria.toLowerCase().trim();
        
        // Mapa de sinónimos para categorías conocidas
        const categorySynonyms: { [key: string]: string[] } = {
          'Alimentos': ['alimentos', 'comida', 'restaurante', 'desayuno', 'almuerzo', 'cena', 'bebida', 'consumo', 'alimentacion', 'cafeteria', 'oxxo', 'supermercado', 'comidas', 'restaurant', 'alimento'],
          'Hospedaje': ['hospedaje', 'hotel', 'motel', 'airbnb', 'alojamiento', 'estancia', 'hospedajes', 'hotels'],
          'Traslado': ['traslado', 'transporte', 'taxi', 'uber', 'didi', 'gasolina', 'combustible', 'peaje', 'caseta', 'estacionamiento', 'renta de auto', 'autobus', 'metro', 'casetas', 'peajes', 'traslados', 'viaticos'],
          'Vuelos': ['vuelos', 'avion', 'aerolinea', 'boleto de avion', 'pasaje aereo', 'aeropuerto', 'vuelo', 'pasajes'],
          'Equipo': ['equipo', 'computadora', 'laptop', 'celular', 'herramientas', 'oficina', 'papeleria', 'ferreteria', 'hardware', 'software', 'licencia', 'equipos', 'papelería', 'materiales']
        };

        // 1. Buscar coincidencia exacta o por subcadena
        let matchedCat = categorias.find(
          (c) => c.nombre.toLowerCase().includes(catSugerida) ||
                 catSugerida.includes(c.nombre.toLowerCase())
        );

        // 2. Si no coincide, buscar por sinónimos
        if (!matchedCat) {
          for (const [key, synonyms] of Object.entries(categorySynonyms)) {
            // Si el texto sugerido coincide con algún sinónimo
            const hasSynonym = synonyms.some(syn => catSugerida.includes(syn) || syn.includes(catSugerida));
            if (hasSynonym) {
              // Buscar si la categoría de la DB existe para esa llave
              const found = categorias.find(c => c.nombre.toLowerCase() === key.toLowerCase());
              if (found) {
                matchedCat = found;
                break;
              }
            }
          }
        }

        if (matchedCat) {
          setSelectedCategoria(matchedCat.nombre);
          
          // Intentar pre-seleccionar subcategoría también si coincide
          if (result.subcategoria) {
            const subcatSugerida = result.subcategoria.toLowerCase().trim();
            const subcatsOfCat = subcategorias.filter((s) => s.categoria_id === matchedCat!.id);
            const matchedSub = subcatsOfCat.find(
              (s) => s.nombre.toLowerCase().includes(subcatSugerida) ||
                     subcatSugerida.includes(s.nombre.toLowerCase())
            );
            if (matchedSub) {
              setSelectedSubcategoria(matchedSub.nombre);
            }
          }
        }
      }

      // Actualizar Estado si se detecta
      if (result.estado) {
        // Encontrar coincidencia insensible a mayúsculas/minúsculas y acentos
        const estadoNormalizado = result.estado.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const matchedEst = ESTADOS_MEXICO.find(est => {
          const estNorm = est.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          return estNorm === estadoNormalizado;
        });
        if (matchedEst) {
          setSelectedEstado(matchedEst);
        }
      }

      // Alerta de política
      if (result.alerta_politica) {
        setAlertaPolitica(result.alerta_politica);
      } else {
        setAlertaPolitica(null);
      }

      setScanSuccess(true);
      showAlert(
        'Datos Extraídos',
        'La Inteligencia Artificial extrajo el monto, proveedor, fecha, método de pago, el Estado y sugirió comentarios.'
      );
      // Ir automáticamente al paso 2
      setCurrentStep(2);
    } catch (err: any) {
      showAlert('Escáner IA', err.message || 'No se pudo procesar el ticket automáticamente.');
    } finally {
      setIsScanning(false);
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

    // 4. Validar Proveedor
    if (!proveedor.trim()) {
      showAlert('Validación', 'Por favor ingresa el nombre del proveedor o comercio.');
      setCurrentStep(2);
      return;
    }

    // 5. Validar Sucursal
    if (!sucursal.trim()) {
      showAlert('Validación', 'Por favor ingresa la sucursal o ubicación del comercio.');
      setCurrentStep(2);
      return;
    }

    // 6. Validar Método de Pago y Tarjeta
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

    // 10. Validar Vehículos / Gasolina
    const esVehiculos = selectedCategoria.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 'vehiculos';
    const esSubGasolina = selectedSubcategoria.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 'gasolina';
    const esGasolina = esVehiculos && esSubGasolina;
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

    const totalGasto = Number(monto) + (esComida && incluyePropina === false ? Number(montoPropina || 0) : 0);

    if (isSplit) {
      if (splits.length === 0) {
        showAlert('Validación', 'Por favor agrega al menos una división o desactiva la opción de dividir gasto.');
        return;
      }
      let sum = 0;
      for (const s of splits) {
        if (!s.clienteId) {
          showAlert('Validación', 'Por favor selecciona un cliente para todas las divisiones del gasto.');
          return;
        }
        if (!s.monto || isNaN(Number(s.monto)) || Number(s.monto) <= 0) {
          showAlert('Validación', 'Por favor ingresa un monto válido mayor a 0 para todas las divisiones.');
          return;
        }
        sum += Number(s.monto);
      }
      if (sum > totalGasto + 0.01) {
        showAlert('Validación', `La suma de las divisiones ($${sum.toFixed(2)}) no puede exceder el total del ticket ($${totalGasto.toFixed(2)}).`);
        return;
      }
    }

    setIsSubmitting(true);
    
    const dbFecha = formatFriendlyToDb(fechaComprobante);
    
    let finalJustificacion = justificacion.trim();
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
      empleado_id: currentUser.id,
      empleado_nombre: currentUser.nombre,
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
      estado: selectedEstado || null,
      facturado: facturado,
      motivo_sin_factura: facturado === true
        ? null
        : (facturaStatus === 'PENDIENTE' || (facturado === false && (motivoSinFactura === 'PENDIENTE_ENTREGA' || motivoSinFactura.startsWith('PENDIENTE'))))
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

        // Subir factura si se seleccionó una
        let publicInvoiceUrl = '';
        if (facturado && facturaBase64) {
          const ext = facturaExt || 'jpg';
          const contentType = ext === 'pdf' ? 'application/pdf' : 'image/jpeg';
          const fileName = `${currentUser.id}/factura_${Date.now()}.${ext}`;
          const arrayBuffer = base64ToArrayBuffer(facturaBase64);

          const { error: uploadError } = await supabase.storage
            .from('tickets')
            .upload(fileName, arrayBuffer, { contentType: contentType, upsert: true });

          if (uploadError) throw uploadError;

          const { data: urlData } = supabase.storage.from('tickets').getPublicUrl(fileName);
          publicInvoiceUrl = urlData.publicUrl;
        }

        let payloadsToInsert = isSplit ? splits.map((s, index) => ({
          ...gastoPayload,
          monto: Number(s.monto),
          cliente: s.clienteId || null,
          justificacion: `[Gasto dividido del ticket total de $${totalGasto}] - División ${index + 1}/${splits.length}\n\n${gastoPayload.justificacion}`,
          foto_url: publicUrl || null,
          factura_url: publicInvoiceUrl || null,
          status: 'PENDING',
        })) : [
          {
            ...gastoPayload,
            foto_url: publicUrl || null,
            factura_url: publicInvoiceUrl || null,
            status: 'PENDING',
          }
        ];

        if (isSplit) {
          const sum = splits.reduce((acc, curr) => acc + Number(curr.monto), 0);
          const remainder = totalGasto - sum;
          if (remainder > 0.01) {
            payloadsToInsert.push({
              ...gastoPayload,
              monto: remainder,
              cliente: selectedCliente || null,
              justificacion: `[Gasto principal / Restante del ticket total de $${totalGasto}]\n\n${gastoPayload.justificacion}`,
              foto_url: publicUrl || null,
              factura_url: publicInvoiceUrl || null,
              status: 'PENDING',
            });
          }
        }

        const { data: insertedGastos, error: dbError } = await supabase
          .from('gastos')
          .insert(payloadsToInsert)
          .select();

        if (dbError) throw dbError;

        // Si es combustible, guardar bitácora de gasolina vinculada y sincronizar kilometraje en ambas empresas
        const esVehiculos = selectedCategoria.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 'vehiculos';
        const esSubGasolina = selectedSubcategoria.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 'gasolina';
        const esGasolina = esVehiculos && esSubGasolina;
        if (esGasolina && insertedGastos && insertedGastos.length > 0) {
          const mainGastoId = insertedGastos[0].id;
          const { error: gasError } = await supabase
            .from('registro_gasolina')
            .insert([
              {
                gasto_id: mainGastoId,
                vehiculo_id: selectedVehiculoId,
                empleado_id: currentUser.id,
                fecha: dbFecha,
                kilometraje_actual: Number(kilometrajeActual),
                litros: Number(litrosGasolina),
                costo_total: totalGasto,
                ticket_foto_url: publicUrl || null,
              },
            ]);

          if (gasError) {
            console.error('Error insertando en registro_gasolina:', gasError.message);
          } else {
            const vehiculoObj = vehiculos.find((v) => v.id === selectedVehiculoId);
            if (vehiculoObj?.placas) {
              await VehiculoService.syncVehiculoKilometraje(vehiculoObj.placas, Number(kilometrajeActual));
            }
          }
        }

        showAlert('Éxito', 'Gasto registrado correctamente en el servidor.');
      } else {
        // Fuera de línea: Guardar localmente
        const esVehiculos = selectedCategoria.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 'vehiculos';
        const esSubGasolina = selectedSubcategoria.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 'gasolina';
        const esGasolina = esVehiculos && esSubGasolina;
        if (isSplit) {
          for (let i = 0; i < splits.length; i++) {
            const s = splits[i];
            await SyncService.enqueueGasto({
              ...gastoPayload,
              monto: Number(s.monto),
              cliente: s.clienteId || null,
              justificacion: `[Gasto dividido del ticket total de $${totalGasto}] - División ${i + 1}/${splits.length}\n\n${gastoPayload.justificacion}`,
              base64Foto: imageBase64 || undefined,
              fotoExt: imageExt,
              vehiculo_id: esGasolina ? selectedVehiculoId : undefined,
              kilometraje_actual: esGasolina ? Number(kilometrajeActual) : undefined,
              litros: esGasolina ? Number(litrosGasolina) : undefined,
            });
          }
          const sum = splits.reduce((acc, curr) => acc + Number(curr.monto), 0);
          const remainder = totalGasto - sum;
          if (remainder > 0.01) {
            await SyncService.enqueueGasto({
              ...gastoPayload,
              monto: remainder,
              cliente: selectedCliente || null,
              justificacion: `[Gasto principal / Restante del ticket total de $${totalGasto}]\n\n${gastoPayload.justificacion}`,
              base64Foto: imageBase64 || undefined,
              fotoExt: imageExt,
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

      router.replace('/(admin)/dashboard');
    } catch (err: any) {
      showAlert('Error al guardar', err.message || 'No se pudo guardar el gasto.');
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
      if (!selectedEstado) {
        showAlert('Validación', 'Por favor selecciona el Estado de la República.');
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
      if (facturado === false && !motivoSinFactura.trim()) {
        showAlert('Validación', 'Por favor especifica el motivo por el cual no se cuenta con factura.');
        return;
      }
    }
    setCurrentStep((prev) => prev + 1);
  };

  const prevStep = () => {
    setCurrentStep((prev) => prev - 1);
  };


  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const isAnyDropdownOpen = !!(showEmpList || showEstDropdown || showCatDropdown || showSubDropdown || showCliDropdown);

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
              setShowEstDropdown(false);
              setShowCatDropdown(false);
              setShowSubDropdown(false);
              setShowCliDropdown(false);
            }}
            style={{ flex: 1 }}
          >
            <StepIndicator
            currentStep={currentStep}
            steps={['Evidencia', 'Detalles', 'Categoría']}
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
                        setScanSuccess(false);
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
                    <View style={{ width: '100%', zIndex: 1000 }}>
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
                    </View>
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
                            keyboardType="numeric"
                            value={montoPropina}
                            onChangeText={setMontoPropina}
                            iconName="logo-usd"
                          />
                        </View>
                      )}
                    </View>
                  )}

                  <View style={styles.scanWrapper}>
                    {isScanning ? (
                      <View style={styles.scanLoader}>
                        <ActivityIndicator size="small" color={themeColors.accent} />
                        <Text style={[styles.scanText, { color: themeColors.text }]}>
                          Gemini AI leyendo ticket...
                        </Text>
                      </View>
                    ) : (
                      <CustomButton
                        title="ESCANEAR CON IA"
                        onPress={handleScanWithIA}
                        variant="success"
                        style={styles.scanBtn}
                      />
                    )}
                    {scanSuccess && (
                      <Text style={[styles.scanSuccessText, { color: themeColors.success }]}>
                        ✓ Ticket escaneado con Gemini
                      </Text>
                    )}
                  </View>
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
                keyboardType="numeric"
                value={monto}
                onChangeText={setMonto}
                iconName="logo-usd"
              />

              {incluyePropina === false && montoPropina ? (
                <Text style={{ fontSize: 13, color: themeColors.textSecondary, marginTop: -Spacing.one, marginBottom: Spacing.two, fontStyle: 'italic', paddingLeft: Spacing.one }}>
                  Total del Gasto (Ticket + Propina): ${(Number(monto || 0) + Number(montoPropina)).toFixed(2)} MXN
                </Text>
              ) : null}

              {Platform.OS === 'web' ? (
                <CustomInput
                  label="Fecha de Gasto (DD/MM/AAAA) *"
                  placeholder="DD/MM/AAAA"
                  value={fechaComprobante}
                  onChangeText={setFechaComprobante}
                  iconName="calendar-outline"
                />
              ) : (
                <>
                  <TouchableOpacity onPress={() => setShowDatePicker(true)} activeOpacity={0.7}>
                    <View pointerEvents="none">
                      <CustomInput
                        label="Fecha de Gasto *"
                        placeholder="Selecciona la fecha"
                        value={fechaComprobante}
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
                </>
              )}

              <CustomInput
                label="Proveedor / Comercio"
                placeholder="Nombre del comercio"
                value={proveedor}
                onChangeText={setProveedor}
                iconName="business-outline"
              />
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

              <CustomInput
                label="Sucursal"
                placeholder="Ej. Centro, Norte"
                value={sucursal}
                onChangeText={setSucursal}
                iconName="location-outline"
              />

              {/* Selector de Estado de la República */}
              <View style={styles.customDropdownContainer}>
                <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Estado de la República *</Text>
                <TouchableOpacity
                  style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowEstDropdown(!showEstDropdown);
                    setShowDatePicker(false);
                  }}
                >
                  <Text style={{ color: selectedEstado ? themeColors.text : themeColors.textSecondary }}>
                    {selectedEstado || 'Selecciona un Estado'}
                  </Text>
                  <Ionicons name={showEstDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                </TouchableOpacity>
                {showEstDropdown && (
                  <View style={{ width: '100%', zIndex: 1000 }}>
                    <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                      <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                        {ESTADOS_MEXICO.map((est, index, array) => (
                          <TouchableOpacity
                            key={est}
                            style={[
                              styles.dropdownItem,
                              index === array.length - 1 && { borderBottomWidth: 0 },
                              { flexDirection: 'row', alignItems: 'center', gap: Spacing.one }
                            ]}
                            onPress={() => {
                              setSelectedEstado(est);
                              setShowEstDropdown(false);
                            }}
                          >
                            <Ionicons name="location-outline" size={24} color={themeColors.primary} />
                            <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 14 }}>{est}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  </View>
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
                        backgroundColor: (facturado === false && (facturaStatus === 'PENDIENTE' || motivoSinFactura.startsWith('PENDIENTE'))) ? themeColors.warning : themeColors.backgroundElement,
                        borderColor: (facturado === false && (facturaStatus === 'PENDIENTE' || motivoSinFactura.startsWith('PENDIENTE'))) ? 'transparent' : themeColors.border,
                        flex: 1,
                        paddingVertical: 8,
                        alignItems: 'center',
                      },
                    ]}
                  >
                    <Text style={[styles.paymentOptionText, { color: (facturado === false && (facturaStatus === 'PENDIENTE' || motivoSinFactura.startsWith('PENDIENTE'))) ? '#ffffff' : themeColors.text, fontSize: 11, fontWeight: '700' }]}>
                      Pendiente
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      setFacturado(false);
                      setFacturaStatus('NO');
                      if (motivoSinFactura.startsWith('PENDIENTE')) {
                        setMotivoSinFactura('');
                      }
                      setComentarioPendiente('');
                      setFacturaUri(null);
                      setFacturaBase64(null);
                      setFacturaExt(null);
                    }}
                    style={[
                      styles.paymentOption,
                      {
                        backgroundColor: (facturado === false && (facturaStatus === 'NO' || (motivoSinFactura !== '' && !motivoSinFactura.startsWith('PENDIENTE')))) ? themeColors.accent : themeColors.backgroundElement,
                        borderColor: (facturado === false && (facturaStatus === 'NO' || (motivoSinFactura !== '' && !motivoSinFactura.startsWith('PENDIENTE')))) ? 'transparent' : themeColors.border,
                        flex: 1,
                        paddingVertical: 8,
                        alignItems: 'center',
                      },
                    ]}
                  >
                    <Text style={[styles.paymentOptionText, { color: (facturado === false && (facturaStatus === 'NO' || (motivoSinFactura !== '' && !motivoSinFactura.startsWith('PENDIENTE')))) ? '#ffffff' : themeColors.text, fontSize: 11, fontWeight: '700' }]}>
                      No Facturado
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {facturado === false && (facturaStatus === 'PENDIENTE' || motivoSinFactura.startsWith('PENDIENTE')) && (
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

              {facturado === false && (facturaStatus === 'NO' || (!motivoSinFactura.startsWith('PENDIENTE') && facturaStatus !== 'PENDIENTE')) && (
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
                  <View style={{ width: '100%', zIndex: 1000 }}>
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
                  </View>
                )}
              </View>

              {/* Selector de Subcategorías (Filtrado dependiente) */}
              {selectedCategoria && (
                <View style={styles.customDropdownContainer}>
                  <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Subcategoría</Text>
                  <TouchableOpacity
                    style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                    onPress={() => {
                      Keyboard.dismiss();
                      setShowSubDropdown(!showSubDropdown);
                      setShowCatDropdown(false);
                      setShowCliDropdown(false);
                      setShowEstDropdown(false);
                    }}
                  >
                    <Text style={{ color: selectedSubcategoria ? themeColors.text : themeColors.textSecondary }}>
                      {selectedSubcategoria || 'Selecciona una subcategoría'}
                    </Text>
                    <Ionicons name={showSubDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                  </TouchableOpacity>
                  {showSubDropdown && (
                    <View style={{ width: '100%', zIndex: 1000 }}>
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
                    </View>
                  )}
                </View>
              )}

              {/* Información de Gasolina (Solo si la categoría es Vehículos y subcategoría es Gasolina) */}
              {(selectedCategoria.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 'vehiculos' &&
                selectedSubcategoria.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 'gasolina') && (
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
                      <View style={{ width: '100%', zIndex: 1001 }}>
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
                                No hay vehículos registrados.
                              </Text>
                            )}
                          </ScrollView>
                        </View>
                      </View>
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
                    onChangeText={setLitrosGasolina}
                    keyboardType="numeric"
                  />
                </View>
              )}

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
                <View style={styles.customDropdownContainer}>
                  <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Cliente Relacionado</Text>
                  <TouchableOpacity
                    style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                    onPress={() => {
                      Keyboard.dismiss();
                      setShowCliDropdown(!showCliDropdown);
                      setShowCatDropdown(false);
                      setShowSubDropdown(false);
                      setShowEstDropdown(false);
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
                        <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 250, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                          {clienteSearch.trim().length > 0 && !clientes.some(c => c.nombre && c.nombre.toLowerCase() === clienteSearch.trim().toLowerCase()) && (
                            <TouchableOpacity
                              style={[styles.dropdownItem, { backgroundColor: themeColors.accent + '15', flexDirection: 'row', alignItems: 'center', gap: Spacing.one }]}
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
                                  styles.dropdownItem,
                                  index === array.length - 1 && { borderBottomWidth: 0 },
                                  { flexDirection: 'row', alignItems: 'center', gap: Spacing.one }
                                ]}
                                onPress={() => {
                                  setSelectedCliente(cli.nombre);
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
              ) : (
                <View style={{ marginBottom: Spacing.three }}>
                  <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Divisiones del Gasto</Text>
                  {splits.filter(s => s.clienteId).map((split) => (
                    <View key={split.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: themeColors.backgroundElement, padding: Spacing.two, borderRadius: BorderRadius.small, borderWidth: 1, borderColor: themeColors.border, marginBottom: Spacing.one }}>
                      <Text style={{ color: themeColors.text, flex: 1, fontSize: 13 }} numberOfLines={1}>
                        {split.clienteId} <Text style={{ fontWeight: '700' }}>(${Number(split.monto).toFixed(2)})</Text>
                      </Text>
                      <TouchableOpacity
                        onPress={() => {
                          const newSplits = splits.filter(s => s.id !== split.id);
                          setSplits(newSplits);
                        }}
                        style={{ padding: Spacing.half }}
                      >
                        <Ionicons name="trash-outline" size={18} color={themeColors.danger} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity
                    onPress={() => {
                      setNewSplitClienteId('');
                      setNewSplitMonto('');
                      setClienteSearch('');
                      setShowSplitModal(true);
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: themeColors.primary + '15', padding: Spacing.two, borderRadius: BorderRadius.small, marginTop: Spacing.one }}
                  >
                    <Ionicons name="add-circle-outline" size={20} color={themeColors.primary} style={{ marginRight: Spacing.half }} />
                    <Text style={{ color: themeColors.primary, fontWeight: '600' }}>Agregar División de Gasto</Text>
                  </TouchableOpacity>
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
        <Pressable 
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: Spacing.four }}
          onPress={() => setShowSplitModal(false)}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
            <Pressable style={{ backgroundColor: themeColors.background, borderRadius: BorderRadius.large, padding: Spacing.four, width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 }} onPress={(e) => e.stopPropagation()}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: themeColors.text, marginBottom: Spacing.three }}>Agregar División</Text>

              {/* Selector de Cliente */}
              <View style={[styles.customDropdownContainer, { zIndex: 100 }]}>
                <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Cliente Relacionado</Text>
                <TouchableOpacity
                  style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowNewSplitCliDropdown(!showNewSplitCliDropdown);
                  }}
                >
                  <Text style={{ color: newSplitClienteId ? themeColors.text : themeColors.textSecondary }}>
                    {newSplitClienteId || 'Selecciona un cliente'}
                  </Text>
                  <Ionicons name={showNewSplitCliDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                </TouchableOpacity>
                {showNewSplitCliDropdown && (
                  <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', zIndex: 100 }}>
                    <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
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
                            style={[styles.dropdownItem, { backgroundColor: themeColors.accent + '15', flexDirection: 'row', alignItems: 'center', gap: Spacing.one }]}
                            onPress={() => {
                              setNewSplitClienteId(clienteSearch.trim());
                              handleAddNewCliente(clienteSearch);
                              setShowNewSplitCliDropdown(false);
                            }}
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
                                styles.dropdownItem,
                                index === array.length - 1 && { borderBottomWidth: 0 },
                                { flexDirection: 'row', alignItems: 'center', gap: Spacing.one }
                              ]}
                              onPress={() => {
                                setNewSplitClienteId(cli.nombre);
                                setClienteSearch('');
                                setShowNewSplitCliDropdown(false);
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

              <View style={{ marginTop: Spacing.two, zIndex: 1 }}>
                <CustomInput
                  label="Monto Asignado"
                  placeholder="Ej. 150.00"
                  keyboardType="numeric"
                  value={newSplitMonto}
                  onChangeText={setNewSplitMonto}
                  iconName="cash-outline"
                  onFocus={() => setShowNewSplitCliDropdown(false)}
                />
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
                    if (!newSplitClienteId || !newSplitMonto || isNaN(Number(newSplitMonto)) || Number(newSplitMonto) <= 0) {
                      showAlert('Atención', 'Seleccione un cliente y proporcione un monto válido.');
                      return;
                    }
                    const totalGasto = Number(monto) + (esComida && incluyePropina === false ? Number(montoPropina || 0) : 0);
                    const currentSum = splits.reduce((acc, curr) => acc + Number(curr.monto), 0);
                    if (currentSum + Number(newSplitMonto) > totalGasto + 0.01) {
                      showAlert('Atención', `El monto ingresado excede el total del ticket ($${totalGasto.toFixed(2)}). Restante: $${(totalGasto - currentSum).toFixed(2)}`);
                      return;
                    }
                    setSplits([...splits, { id: Date.now().toString(), clienteId: newSplitClienteId, monto: newSplitMonto }]);
                    setShowSplitModal(false);
                  }}
                  style={{ flex: 1 }}
                />
              </View>
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
