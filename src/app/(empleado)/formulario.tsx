import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useColorScheme,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import NetInfo from '@react-native-community/netinfo';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { supabase, AuthService, Usuario, CatalogoItem, SubcategoriaItem } from '@/services/supabase';
import { SyncService, base64ToArrayBuffer } from '@/services/sync';
import { GeminiService } from '@/services/gemini';
import StepIndicator from '@/components/StepIndicator';
import CustomInput from '@/components/CustomInput';
import CustomButton from '@/components/CustomButton';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';

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
  const [isScanning, setIsScanning] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(false);

  // Paso 2: Detalles
  const [monto, setMonto] = useState('');
  const [proveedor, setProveedor] = useState('');

  const getTodayFriendly = () => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const [fechaComprobante, setFechaComprobante] = useState(getTodayFriendly());
  const [sucursal, setSucursal] = useState('');
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'tarjeta' | 'tarjeta_credito' | 'tarjeta_debito'>('efectivo');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateValue, setDateValue] = useState(new Date());
  const [alertaPolitica, setAlertaPolitica] = useState<string | null>(null);
  
  // Estado de la República
  const [selectedEstado, setSelectedEstado] = useState<string>('');
  const [showEstDropdown, setShowEstDropdown] = useState(false);

  // Alerta local por límites de alimentos según el Estado
  const [alertaLocal, setAlertaLocal] = useState<string | null>(null);




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
  const [justificacion, setJustificacion] = useState('');

  // Dropdown list visibility toggles (Mock pickers since RN Picker is external)
  const [showCatDropdown, setShowCatDropdown] = useState(false);
  const [showSubDropdown, setShowSubDropdown] = useState(false);
  const [showCliDropdown, setShowCliDropdown] = useState(false);

  useEffect(() => {
    const alerts: string[] = [];

    // 1. Validar límite de alimentos general de $280 MXN
    const valMonto = Number(monto);
    if (valMonto && !isNaN(valMonto) && selectedCategoria) {
      const isAlimentos = selectedCategoria.toLowerCase().includes('alimento') ||
                          selectedCategoria.toLowerCase().includes('comida') ||
                          selectedCategoria.toLowerCase().includes('consumo');

      if (isAlimentos && valMonto > 280) {
        alerts.push(`Límite de alimentos excedido: el límite general por comida es de $280 MXN (Consumo: $${valMonto} MXN)`);
      }
    }

    // 2. Validar artículos no permitidos localmente
    const keywordsInfraccion = [
      'cigarro', 'tabaco', 'papita', 'galleta', 'chucheria', 'dulce', 'fritura', 'chocolate', 'refresco',
      'soda', 'gansito', 'sabritas', 'barcel', 'marinela', 'coca-cola', 'coca cola', 'pepsi', 'alcohol', 'cerveza'
    ];
    const textToCheck = `${justificacion} ${proveedor}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const infraccionesDetectadas = keywordsInfraccion.filter(keyword => textToCheck.includes(keyword));
    
    if (infraccionesDetectadas.length > 0) {
      alerts.push(`Artículos no permitidos detectados (${infraccionesDetectadas.join(', ')})`);
    }

    if (alerts.length > 0) {
      setAlertaLocal(alerts.join(' | '));
    } else {
      setAlertaLocal(null);
    }
  }, [monto, selectedCategoria, justificacion, proveedor]);

  const loadCatalogos = async () => {
    try {
      const [catRes, subRes, cliRes] = await Promise.all([
        supabase.from('categorias').select('*').order('nombre'),
        supabase.from('subcategorias').select('*').order('nombre'),
        supabase.from('clientes').select('*').order('nombre'),
      ]);

      if (catRes.data) setCategorias(catRes.data);
      if (subRes.data) setSubcategorias(subRes.data);
      if (cliRes.data) setClientes(cliRes.data);
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

  // Solicitar permisos de cámara/galería
  const requestPermissions = async (): Promise<boolean> => {
    if (Platform.OS === 'web') return true;
    const cameraStatus = await ImagePicker.requestCameraPermissionsAsync();
    const libraryStatus = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (cameraStatus.status !== 'granted' || libraryStatus.status !== 'granted') {
      Alert.alert(
        'Permisos requeridos',
        'Necesitamos permisos de cámara y galería para capturar la evidencia del ticket.'
      );
      return false;
    }
    return true;
  };

  const handleCapturePhoto = async () => {
    if (Platform.OS === 'web') {
      await handleSelectGallery();
      return;
    }
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
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
      Alert.alert('Error', 'No se pudo abrir la cámara.');
    }
  };

  const handleSelectGallery = async () => {
    const hasPermission = await requestPermissions();
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
        setScanSuccess(false);
        setAlertaPolitica(null);
      }
    } catch (err) {
      console.error('Gallery select error:', err);
      Alert.alert('Error', 'No se pudo abrir la galería.');
    }
  };

  // Escanear con IA (Gemini OCR)
  const handleScanWithIA = async () => {
    if (!imageBase64) return;
    setIsScanning(true);
    try {
      const result = await GeminiService.scanTicket(imageBase64);
      
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
      Alert.alert(
        'Escaneo Completado',
        'La Inteligencia Artificial extrajo el monto, proveedor, fecha, método de pago, el Estado y sugirió una justificación.'
      );
      // Ir automáticamente al paso 2
      setCurrentStep(2);
    } catch (err: any) {
      Alert.alert('Escáner IA', err.message || 'No se pudo procesar el ticket automáticamente.');
    } finally {
      setIsScanning(false);
    }
  };

  // Filtrar subcategorías según la categoría seleccionada
  const activeCategoriaId = categorias.find((c) => c.nombre === selectedCategoria)?.id;
  const filteredSubcategorias = subcategorias.filter(
    (s) => s.categoria_id === activeCategoriaId
  );

  // Guardar Gasto (Finalizar)
  const handleSaveGasto = async () => {
    if (!currentUser) return;
    
    // Validar campos requeridos
    if (!monto || isNaN(Number(monto))) {
      Alert.alert('Validación', 'Por favor ingresa un monto válido.');
      setCurrentStep(2);
      return;
    }

    const fechaRegex = /^\d{2}\/\d{2}\/\d{4}$/;
    if (!fechaRegex.test(fechaComprobante)) {
      Alert.alert('Validación', 'Por favor ingresa la fecha en formato DD/MM/AAAA (ej. 09/06/2026).');
      setCurrentStep(2);
      return;
    }

    if (!selectedCategoria) {
      Alert.alert('Validación', 'Por favor selecciona una categoría.');
      return;
    }

    if (!justificacion.trim()) {
      Alert.alert('Validación', 'Por favor escribe una justificación del gasto.');
      return;
    }

    setIsSubmitting(false);
    
    const dbFecha = formatFriendlyToDb(fechaComprobante);
    
    let finalJustificacion = justificacion.trim();
    const combinedAlert = [alertaPolitica, alertaLocal].filter(Boolean).join(' | ');
    if (combinedAlert) {
      finalJustificacion = `[ALERTA IA: ${combinedAlert}]\n\n${finalJustificacion}`;
    }
    
    const gastoPayload = {
      empleado_id: currentUser.id,
      empleado_nombre: currentUser.nombre,
      monto: Number(monto),
      categoria: selectedCategoria,
      subcategoria: selectedSubcategoria || null,
      metodo_pago: metodoPago,
      justificacion: finalJustificacion,
      fecha_comprobante: dbFecha,
      proveedor: proveedor.trim() || null,
      cliente: selectedCliente || null,
      sucursal: sucursal.trim() || null,
      tipo_tarjeta: null,
      ubicacion_registro: 'Móvil',
      estado: selectedEstado || null,
    };

    setIsSubmitting(true);

    try {
      const netState = await NetInfo.fetch();
      
      if (netState.isConnected) {
        // En línea: Subir foto y guardar en Supabase
        let publicUrl = '';
        if (imageBase64) {
          const fileName = `${currentUser.id}/${Date.now()}.jpg`;
          const arrayBuffer = base64ToArrayBuffer(imageBase64);

          const { error: uploadError } = await supabase.storage
            .from('tickets')
            .upload(fileName, arrayBuffer, { contentType: 'image/jpeg', upsert: true });

          if (uploadError) throw uploadError;

          const { data: urlData } = supabase.storage.from('tickets').getPublicUrl(fileName);
          publicUrl = urlData.publicUrl;
        }

        const { error: dbError } = await supabase.from('gastos').insert([
          {
            ...gastoPayload,
            foto_url: publicUrl || null,
            status: 'PENDING',
          },
        ]);

        if (dbError) throw dbError;
        Alert.alert('Éxito', 'Gasto registrado correctamente en el servidor.');
      } else {
        // Fuera de línea: Guardar localmente
        await SyncService.enqueueGasto({
          ...gastoPayload,
          base64Foto: imageBase64 || undefined,
        });
        Alert.alert(
          'Guardado sin conexión',
          'No tienes red. El gasto ha sido encolado en tu dispositivo y se sincronizará automáticamente al recuperar conexión.'
        );
      }

      router.replace('/(empleado)/dashboard');
    } catch (err: any) {
      Alert.alert('Error al guardar', err.message || 'No se pudo guardar el gasto.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextStep = () => {
    if (currentStep === 1 && !imageUri) {
      Alert.alert('Evidencia requerida', 'Por favor toma una fotografía o selecciona un ticket.');
      return;
    }
    if (currentStep === 2) {
      if (!monto || isNaN(Number(monto))) {
        Alert.alert('Validación', 'Por favor ingresa un monto válido.');
        return;
      }
      const fechaRegex = /^\d{2}\/\d{2}\/\d{4}$/;
      if (!fechaRegex.test(fechaComprobante)) {
        Alert.alert('Validación', 'Por favor ingresa la fecha en formato DD/MM/AAAA (ej. 09/06/2026).');
        return;
      }
      if (!selectedEstado) {
        Alert.alert('Validación', 'Por favor selecciona el Estado de la República.');
        return;
      }
    }
    setCurrentStep((prev) => prev + 1);
  };

  const prevStep = () => {
    setCurrentStep((prev) => prev - 1);
  };


  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(empleado)/dashboard')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Registrar Gasto</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
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
                    <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
                    <TouchableOpacity
                      style={styles.removeImageBtn}
                      onPress={() => {
                        setImageUri(null);
                        setImageBase64(null);
                        setScanSuccess(false);
                        setAlertaPolitica(null);
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

              <View style={styles.actionGrid}>
                <TouchableOpacity
                  onPress={handleCapturePhoto}
                  style={[styles.actionBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                >
                  <Ionicons name="camera-sharp" size={24} color={themeColors.accent} />
                  <Text style={[styles.actionBtnText, { color: themeColors.text }]}>Cámara</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSelectGallery}
                  style={[styles.actionBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                >
                  <Ionicons name="images-sharp" size={24} color={themeColors.accent} />
                  <Text style={[styles.actionBtnText, { color: themeColors.text }]}>Galería</Text>
                </TouchableOpacity>
              </View>

              {imageUri && (
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
              )}

              <View style={styles.footerNav}>
                <View style={{ flex: 1 }} />
                <CustomButton title="Siguiente" onPress={nextStep} style={styles.navBtn} />
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
                  <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                    <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 150 }} keyboardShouldPersistTaps="handled">
                      {ESTADOS_MEXICO.map((est) => (
                        <TouchableOpacity
                          key={est}
                          style={styles.dropdownItem}
                          onPress={() => {
                            setSelectedEstado(est);
                            setShowEstDropdown(false);
                          }}
                        >
                          <Text style={{ color: themeColors.text }}>{est}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* Selector de Método de Pago */}
              <View style={styles.selectorGroup}>
                <Text style={[styles.selectorLabel, { color: themeColors.text }]}>Método de Pago *</Text>
                <View style={styles.paymentSelector}>
                  <TouchableOpacity
                    onPress={() => setMetodoPago('efectivo')}
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
                <View style={[styles.selectorGroup, { marginTop: -Spacing.one, paddingLeft: Spacing.two, borderLeftWidth: 2, borderLeftColor: themeColors.accent }]}>
                  <Text style={[styles.selectorLabel, { color: themeColors.text, fontSize: 13 }]}>Tipo de Tarjeta *</Text>
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
                  setShowEstDropdown(false);
                  }}
                >
                  <Text style={{ color: selectedCategoria ? themeColors.text : themeColors.textSecondary }}>
                    {selectedCategoria || 'Selecciona una categoría'}
                  </Text>
                  <Ionicons name={showCatDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                </TouchableOpacity>
                {showCatDropdown && (
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
                )}
              </View>

              {/* Selector de Subcategorías (Filtrado dependiente) */}
              {selectedCategoria && (
                <View style={styles.customDropdownContainer}>
                  <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Subcategoría</Text>
                  <TouchableOpacity
                    style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                    onPress={() => {
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
                  )}
                </View>
              )}

              {/* Selector de Cliente */}
              <View style={styles.customDropdownContainer}>
                <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Cliente Relacionado</Text>
                <TouchableOpacity
                  style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                  onPress={() => {
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
                  <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                    <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 150 }} keyboardShouldPersistTaps="handled">
                      {clientes.map((cli) => (
                        <TouchableOpacity
                          key={cli.id}
                          style={styles.dropdownItem}
                          onPress={() => {
                            setSelectedCliente(cli.nombre);
                            setShowCliDropdown(false);
                          }}
                        >
                          <Text style={{ color: themeColors.text }}>{cli.nombre}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              <CustomInput
                label="Justificación del Gasto *"
                placeholder="Escribe el propósito de este gasto..."
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
});
