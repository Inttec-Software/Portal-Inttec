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
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { supabase, AuthService, Usuario, Venta, VentaPartida, recalculateVentaTotals } from '@/services/supabase';
import { GeminiService } from '@/services/gemini';
import { base64ToArrayBuffer } from '@/services/sync';
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

export default function VentasScreen() {
  const router = useRouter();
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
  const [facturaReferencia, setFacturaReferencia] = useState('');
  const [tipoProyecto, setTipoProyecto] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [showTipoDropdown, setShowTipoDropdown] = useState(false);
  const [notas, setNotas] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [agregarIva, setAgregarIva] = useState(false);
  const [partidas, setPartidas] = useState<PartidaEditable[]>([]);

  // === Historial ===
  const [activeTab, setActiveTab] = useState<'registrar' | 'historial'>('registrar');
  const [ventasHistorial, setVentasHistorial] = useState<Venta[]>([]);
  const [isLoadingHistorial, setIsLoadingHistorial] = useState(false);
  const [historialSearch, setHistorialSearch] = useState('');

  // === Edición y Detalle de Ventas ===
  const [selectedVenta, setSelectedVenta] = useState<Venta | null>(null);
  const [selectedVentaPartidas, setSelectedVentaPartidas] = useState<VentaPartida[]>([]);
  const [selectedVentaGastos, setSelectedVentaGastos] = useState<any[]>([]);
  const [isLoadingPartidas, setIsLoadingPartidas] = useState(false);
  const [isDetailModalVisible, setIsDetailModalVisible] = useState(false);
  const [editingVentaId, setEditingVentaId] = useState<string | null>(null);

  // === Clientes de Supabase ===
  const [clientes, setClientes] = useState<any[]>([]);
  const [clienteSearch, setClienteSearch] = useState('');
  const [showCliDropdown, setShowCliDropdown] = useState(false);

  // === Auth Check ===
  useEffect(() => {
    const init = async () => {
      const user = await AuthService.getCurrentUser();
      if (!user || user.rol !== 'ADMIN') {
        router.replace('/');
        return;
      }
      setCurrentUser(user);

      // Cargar catálogo de clientes
      try {
        const { data: cliData } = await supabase.from('clientes').select('*').order('nombre');
        if (cliData) setClientes(cliData);
      } catch (err) {
        console.error('Error loading clients:', err);
      }
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // === Cargar Historial ===
  const loadHistorial = async () => {
    setIsLoadingHistorial(true);
    try {
      const { data, error } = await supabase
        .from('ventas')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setVentasHistorial(data || []);
    } catch (err: any) {
      console.error('Error loading sales history:', err);
    } finally {
      setIsLoadingHistorial(false);
    }
  };

  const handleSelectVenta = async (venta: Venta) => {
    setSelectedVenta(venta);
    setIsDetailModalVisible(true);
    setIsLoadingPartidas(true);
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
        .select('*')
        .eq('venta_id', venta.id)
        .eq('status', 'APPROVED');
      if (gastosError) throw gastosError;
      setSelectedVentaGastos(gastosData || []);
    } catch (err: any) {
      console.error('Error fetching venta details:', err);
      showAlert('Error', 'No se pudieron cargar los detalles de la venta.');
    } finally {
      setIsLoadingPartidas(false);
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
  };

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
        setCliente(newCli.nombre);
      } else {
        const { data: allCli } = await supabase.from('clientes').select('*').order('nombre');
        if (allCli) {
          setClientes(allCli);
          setCliente(nombre.trim());
        }
      }
      setClienteSearch('');
      setShowCliDropdown(false);
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo agregar el cliente.');
    }
  };



  // === Filtrar Historial ===
  const ventasFiltradas = useMemo(() => {
    const q = historialSearch.trim().toLowerCase();
    if (!q) return ventasHistorial;
    return ventasHistorial.filter(v =>
      v.cliente?.toLowerCase().includes(q) ||
      v.factura_referencia?.toLowerCase().includes(q) ||
      v.descripcion?.toLowerCase().includes(q) ||
      v.fecha?.toLowerCase().includes(q) ||
      v.tipo_proyecto?.toLowerCase().includes(q) ||
      v.proveedor?.toLowerCase().includes(q)
    );
  }, [ventasHistorial, historialSearch]);

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
        copyToCacheDirectory: false, // Obtener la URI content:// original de Android para poder copiarla con permisos
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
            
            // Copiar el archivo desde content:// al directorio de caché privado de nuestro sandbox
            const tempFileName = `temp_${Date.now()}_${asset.name || 'documento.pdf'}`;
            const targetUri = `${FileSys.cacheDirectory}${tempFileName}`;
            
            await FileSys.copyAsync({
              from: uri,
              to: targetUri,
            });

            // Actualizar la URI al archivo copiado en nuestro sandbox seguro
            setFileUri(targetUri);

            // Leer desde la ubicación segura del sandbox
            const b64 = await FileSys.readAsStringAsync(targetUri, {
              encoding: FileSys.EncodingType.Base64,
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

      setPartidas(partidasUI);
      setScanSuccess(true);
      setCurrentStep(2);
      showAlert(
        'Costos Extraídos',
        `La IA extrajo ${partidasUI.length} partida(s) con sus costos de compra. Ahora ingresa los precios de venta para calcular márgenes.`
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
        fecha: fecha.trim(),
        cliente: cliente.trim(),
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
        // INSERTAR NUEVA VENTA
        const { data: ventaData, error: ventaError } = await supabase
          .from('ventas')
          .insert([ventaPayload])
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
                  onChange={(event: any, selectedDate?: Date) => {
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
      <View style={[styles.customDropdownContainer, { zIndex: 100 }]}>
        <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Cliente Relacionado</Text>
        <TouchableOpacity
          style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
          onPress={() => {
            setShowCliDropdown(!showCliDropdown);
            setShowTipoDropdown(false);
          }}
        >
          <Text style={{ color: cliente ? themeColors.text : themeColors.textSecondary }}>
            {cliente || 'Selecciona un cliente'}
          </Text>
          <Ionicons name={showCliDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
        </TouchableOpacity>
        {showCliDropdown && (
          <Pressable onPress={(e: any) => e.stopPropagation()} style={{ width: '100%', zIndex: 1000 }}>
            <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, position: 'relative', width: '100%', zIndex: 1000 }]}>
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
                      {`Agregar "${clienteSearch.trim()}"`}
                    </Text>
                  </TouchableOpacity>
                )}
                {clientes
                  .filter(cli => cli.nombre && cli.nombre.toLowerCase().includes(clienteSearch.toLowerCase()))
                  .map((cli, idx, arr) => (
                    <TouchableOpacity
                      key={cli.id}
                      style={[
                        styles.dropdownItem,
                        idx === arr.length - 1 && { borderBottomWidth: 0 },
                        { flexDirection: 'row', alignItems: 'center', gap: Spacing.one }
                      ]}
                      onPress={() => {
                        setCliente(cli.nombre);
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
        label="Sucursal"
        value={proveedor}
        onChangeText={setProveedor}
        placeholder="Ej. Centro, Norte o sucursal relacionada"
      />

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
          {proveedor ? (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]}>Sucursal:</Text>
              <Text style={[styles.summaryValue, { color: themeColors.text }]}>{proveedor}</Text>
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
          placeholder="Buscar por cliente, PO, descripción, fecha..."
          placeholderTextColor={themeColors.textSecondary}
          value={historialSearch}
          onChangeText={setHistorialSearch}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {historialSearch.length > 0 && (
          <TouchableOpacity onPress={() => setHistorialSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={themeColors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

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
      ) : isDesktop ? (
                <ScrollView style={{ flex: 1 }}>
                  <View style={{ paddingHorizontal: Spacing.three, paddingVertical: Spacing.two }}>
                    <View style={[styles.tableHeaderRow, { backgroundColor: themeColors.background, borderBottomColor: themeColors.border }]}>
                      <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '20%', fontWeight: 'bold' }]}>Cliente</Text>
                      <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '10%', fontWeight: 'bold' }]}>Fecha</Text>
                      <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '12%', fontWeight: 'bold' }]}>Referencia</Text>
                      <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '15%', fontWeight: 'bold' }]}>Proyecto</Text>
                      <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '13%', fontWeight: 'bold', textAlign: 'right' }]}>Facturado</Text>
                      <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '12%', fontWeight: 'bold', textAlign: 'right' }]}>Utilidad</Text>
                      <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '8%', fontWeight: 'bold', textAlign: 'right' }]}>Margen</Text>
                      <View style={{ width: '10%', alignItems: 'center' }}>
                        <Ionicons name="settings-outline" size={14} color={themeColors.text} />
                      </View>
                    </View>
                    <View style={{ backgroundColor: themeColors.backgroundElement, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, borderWidth: 1, borderColor: themeColors.border, borderTopWidth: 0 }}>
                      {ventasFiltradas.map((item) => {
                        const isProfit = item.utilidad_bruta >= 0;
                        const margenPct = (item.margen_porcentual * 100).toFixed(1);
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
                            <Text style={[styles.tableCell, { color: themeColors.text, width: '20%', fontWeight: '600' }]} numberOfLines={1}>{item.cliente}</Text>
                            <Text style={[styles.tableCell, { color: themeColors.text, width: '10%' }]}>{item.fecha}</Text>
                            <Text style={[styles.tableCell, { width: '12%', color: themeColors.textSecondary }]} numberOfLines={1}>{item.factura_referencia || '--'}</Text>
                            <View style={{ width: '15%' }}>
                              {item.tipo_proyecto ? (
                                <View style={[styles.tipoBadge, { backgroundColor: themeColors.accent + '15', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 12, alignSelf: 'flex-start' }]}>
                                  <Text style={{ color: themeColors.accent, fontSize: 10, fontWeight: '700' }}>{item.tipo_proyecto}</Text>
                                </View>
                              ) : <Text style={{ color: themeColors.textSecondary }}>--</Text>}
                            </View>
                            <Text style={[styles.tableCell, { width: '13%', fontWeight: '700', color: themeColors.accent, textAlign: 'right' }]}>{formatCurrency(item.precio_total_facturado)}</Text>
                            <Text style={[styles.tableCell, { width: '12%', fontWeight: '700', color: isProfit ? themeColors.success : themeColors.danger, textAlign: 'right' }]}>{formatCurrency(item.utilidad_bruta)}</Text>
                            <Text style={[styles.tableCell, { width: '8%', fontWeight: '700', color: isProfit ? themeColors.success : themeColors.danger, textAlign: 'right' }]}>{margenPct}%</Text>
                            <View style={{ width: '10%', flexDirection: 'row', justifyContent: 'center', gap: 12 }}>
                              <Ionicons name="eye-outline" size={16} color={themeColors.accent} />
                              <Ionicons name="pencil-outline" size={16} color={themeColors.accent} />
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </ScrollView>
      ) : (
        <FlatList
          data={ventasFiltradas}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: Spacing.three, gap: Spacing.two }}
          renderItem={({ item }) => {
            const isProfit = item.utilidad_bruta >= 0;
            const margenPct = (item.margen_porcentual * 100).toFixed(1);
            return (
              <TouchableOpacity
                onPress={() => handleSelectVenta(item)}
                style={[styles.historialCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="bar-chart-sharp" size={16} color={themeColors.primary} />
                    <Text style={[styles.historialCliente, { color: themeColors.text }]} numberOfLines={1}>
                      {item.cliente}
                    </Text>
                  </View>
                  <View style={[styles.tipoBadge, { backgroundColor: themeColors.accent + '15', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 12 }]}>
                    <Text style={{ color: themeColors.accent, fontSize: 10, fontWeight: '700' }}>{item.tipo_proyecto || 'Venta'}</Text>
                  </View>
                </View>
                
                <View style={{ gap: 2, marginBottom: 8 }}>
                  {item.factura_referencia ? (
                    <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>
                      <Text style={{ fontWeight: '600', color: themeColors.text }}>Factura/PO: </Text>
                      {item.factura_referencia}
                    </Text>
                  ) : null}
                  {item.descripcion ? (
                    <Text style={{ color: themeColors.textSecondary, fontSize: 12 }} numberOfLines={1}>
                      <Text style={{ fontWeight: '600', color: themeColors.text }}>Detalle: </Text>
                      {item.descripcion}
                    </Text>
                  ) : null}

                </View>

                <View style={styles.historialTotals}>
                  <View style={{ alignItems: 'flex-start', flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                      <Ionicons name="calendar-outline" size={12} color={themeColors.textSecondary} />
                      <Text style={[styles.historialFecha, { color: themeColors.textSecondary, fontSize: 11 }]}>{item.fecha}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'center', flex: 1 }}>
                    <Text style={{ color: themeColors.textSecondary, fontSize: 9, fontWeight: '700' }}>FACTURADO</Text>
                    <Text style={{ color: themeColors.accent, fontSize: 13, fontWeight: '800' }}>
                      {formatCurrency(item.precio_total_facturado)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', flex: 1 }}>
                    <Text style={{ color: themeColors.textSecondary, fontSize: 9, fontWeight: '700' }}>UTILIDAD ({margenPct}%)</Text>
                    <Text style={{ color: isProfit ? themeColors.success : themeColors.danger, fontSize: 13, fontWeight: '800' }}>
                      {formatCurrency(item.utilidad_bruta)}
                    </Text>
                  </View>
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
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => (editingVentaId ? cancelEditing() : router.replace('/(admin)/dashboard' as any))} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={themeColors.text} />
        </TouchableOpacity>
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

      {activeTab === 'historial' ? (
        renderHistorial()
      ) : (
        <>
          {/* Step Indicator */}
          <StepIndicator
            steps={['Factura Compra', 'Costos y Precios', 'Resumen']}
            currentStep={currentStep}
          />

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
              {currentStep === 1 && renderStep1()}
              {currentStep === 2 && renderStep2()}
              {currentStep === 3 && renderStep3()}
            </ScrollView>
          </KeyboardAvoidingView>

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
      <Modal
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

                  {selectedVenta.proveedor ? (
                    <View style={styles.modalRow}>
                      <Text style={[styles.modalLabel, { color: themeColors.textSecondary }]}>Sucursal:</Text>
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
            <View style={[styles.modalFooter, { borderTopColor: themeColors.border }]}>
              <TouchableOpacity
                onPress={handleDeleteVenta}
                disabled={isSubmitting}
                style={[styles.modalActionBtn, { backgroundColor: themeColors.danger + '15', borderColor: themeColors.danger }]}
              >
                <Ionicons name="trash-outline" size={20} color={themeColors.danger} />
                <Text style={[styles.modalActionText, { color: themeColors.danger }]}>Eliminar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleEditVenta}
                disabled={isSubmitting}
                style={[styles.modalActionBtn, { backgroundColor: themeColors.accent + '15', borderColor: themeColors.accent }]}
              >
                <Ionicons name="create-outline" size={20} color={themeColors.accent} />
                <Text style={[styles.modalActionText, { color: themeColors.accent }]}>Editar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    alignItems: 'center',
    paddingVertical: 4,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalValue: {
    fontSize: 13,
    fontWeight: '700',
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
});
