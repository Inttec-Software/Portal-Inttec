import { logger } from '@/utils/logger';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Linking,
  useWindowDimensions,
  Pressable,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { supabase, Gasto, AuthService, Usuario, Asistencia, AsistenciaService, Venta, recalculateVentaTotals, inttecClient, daravisaClient, Vehiculo, RegistroGasolina, VehiculoService } from '@/services/supabase';
import { ReportGenerator } from '@/utils/reportGenerator';
import ExpenseCard from '@/components/ExpenseCard';
import CustomButton from '@/components/CustomButton';
import CustomInput from '@/components/CustomInput';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import ImageViewerModal from '@/components/ImageViewerModal';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { base64ToArrayBuffer } from '@/services/sync';

interface PartidaEditable {
  id: string;
  descripcion: string;
  cantidad: string;
  unidad: string;
  precio_unitario_venta: string;
  costo_unitario_proveedor: string;
}

const TIPOS_PROYECTO = ['Venta', 'Servicio', 'Paneles', 'Instalación', 'Mantenimiento', 'Otro'];

export default function AdminDashboard() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const isMobile = windowWidth < 600;
  const isDesktop = Platform.OS === 'web' && windowWidth >= 1024;
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { setUser, company, changeCompany } = useAuth();

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const [adminUser, setAdminUser] = useState<Usuario | null>(null);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [personal, setPersonal] = useState<Usuario[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pendientes' | 'historial'>('pendientes');
  const [facturaFilter, setFacturaFilter] = useState<'TODOS' | 'FACTURADOS' | 'PENDIENTE_ENTREGA' | 'NO_FACTURADOS'>('TODOS');

  // Buscador y Filtro por Calendario (Día Único o Rango de Fechas)
  const [searchQuery, setSearchQuery] = useState('');
  const [startDateFilter, setStartDateFilter] = useState<string | null>(null);
  const [endDateFilter, setEndDateFilter] = useState<string | null>(null);
  const [dateFilterModalVisible, setDateFilterModalVisible] = useState(false);
  const [tempSingleDate, setTempSingleDate] = useState('');
  const [tempStartDate, setTempStartDate] = useState('');
  const [tempEndDate, setTempEndDate] = useState('');

  // Vehículos y Gasolina
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [registrosGasolina, setRegistrosGasolina] = useState<RegistroGasolina[]>([]);
  const [newVehiculoMarca, setNewVehiculoMarca] = useState('');
  const [newVehiculoModelo, setNewVehiculoModelo] = useState('');
  const [newVehiculoAnio, setNewVehiculoAnio] = useState('');
  const [newVehiculoPlacas, setNewVehiculoPlacas] = useState('');
  const [newVehiculoNumEcon, setNewVehiculoNumEcon] = useState('');
  const [vehiculoModalVisible, setVehiculoModalVisible] = useState(false);
  const [editingVehiculo, setEditingVehiculo] = useState<Vehiculo | null>(null);
  const [isSavingVehiculo, setIsSavingVehiculo] = useState(false);
  const [vehiculosManagerModalVisible, setVehiculosManagerModalVisible] = useState(false);

  // Modales de Acceso Rápido (Botones Extra)
  const [personalModalVisible, setPersonalModalVisible] = useState(false);
  const [reportsModalVisible, setReportsModalVisible] = useState(false);

  // Modal de Detalle/Revisión de Gasto
  const [selectedGasto, setSelectedGasto] = useState<Gasto | null>(null);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [rejectionFeedback, setRejectionFeedback] = useState('');
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);
  const [isUploadingInvoice, setIsUploadingInvoice] = useState(false);
  const [prevSelectedGastoId, setPrevSelectedGastoId] = useState<string | undefined>(undefined);
  const [localMotivo, setLocalMotivo] = useState('');

  if (selectedGasto?.id !== prevSelectedGastoId) {
    setPrevSelectedGastoId(selectedGasto?.id);
    setLocalMotivo(selectedGasto?.motivo_sin_factura || '');
  }

  // Registro y Edición de Usuario (Personal)
  const [addUserModalVisible, setAddUserModalVisible] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserRole, setNewUserRole] = useState<'EMPLEADO' | 'ADMIN'>('EMPLEADO');
  const [isAddingUser, setIsAddingUser] = useState(false);

  const [editingUser, setEditingUser] = useState<Usuario | null>(null);
  const [editUserModalVisible, setEditUserModalVisible] = useState(false);
  const [editUserName, setEditUserName] = useState('');
  const [editUserEmail, setEditUserEmail] = useState('');
  const [editUserPassword, setEditUserPassword] = useState('');
  const [editUserPhone, setEditUserPhone] = useState('');
  const [editUserRole, setEditUserRole] = useState<'EMPLEADO' | 'ADMIN'>('EMPLEADO');
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);

  // Modal de Perfil (Admin)
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [profilePhone, setProfilePhone] = useState('');
  const [profilePassword, setProfilePassword] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Historial de Asistencia
  const [asistenciaModalVisible, setAsistenciaModalVisible] = useState(false);
  const [asistenciaEmpleado, setAsistenciaEmpleado] = useState<Usuario | null>(null);
  const [asistencias, setAsistencias] = useState<Asistencia[]>([]);
  const [isLoadingAsistencias, setIsLoadingAsistencias] = useState(false);
  const [asistenciaPreviewUrl, setAsistenciaPreviewUrl] = useState<string | null>(null);
  const [asistenciaViewerVisible, setAsistenciaViewerVisible] = useState(false);
  const [selectedAsistenciaInfo, setSelectedAsistenciaInfo] = useState<{
    fecha: string;
    hora: string;
    direccion: string;
    lat: number;
    lng: number;
    empleadoNombre: string;
    tipo: 'Entrada' | 'Salida';
  } | null>(null);

  const [isFetchingAsistencias, setIsFetchingAsistencias] = useState(false);
  const [isFetchingInventario, setIsFetchingInventario] = useState(false);
  const [isFetchingConsumos, setIsFetchingConsumos] = useState(false);
  const [isFetchingVentas, setIsFetchingVentas] = useState(false);

  // === Vinculación con Ventas al Aprobar ===
  const [isLinkSaleModalVisible, setIsLinkSaleModalVisible] = useState(false);
  const [salesForLinking, setSalesForLinking] = useState<Venta[]>([]);
  const [isLoadingSalesForLinking, setIsLoadingSalesForLinking] = useState(false);
  const [linkSaleSearch, setLinkSaleSearch] = useState('');

  // === Formulario de Nueva Venta Rápida ===
  const [isQuickSaleFormVisible, setIsQuickSaleFormVisible] = useState(false);
  const [quickSaleFecha, setQuickSaleFecha] = useState('');
  const [quickSaleCliente, setQuickSaleCliente] = useState('');
  const [quickSaleFactura, setQuickSaleFactura] = useState('');
  const [quickSaleTipoProyecto, setQuickSaleTipoProyecto] = useState('');
  const [quickSaleProveedor, setQuickSaleProveedor] = useState('');
  const [quickSaleNotas, setQuickSaleNotas] = useState('');
  const [quickSalePartidas, setQuickSalePartidas] = useState<PartidaEditable[]>([]);
  const [showQuickSaleTipoDropdown, setShowQuickSaleTipoDropdown] = useState(false);
  const [showQuickSaleCliDropdown, setShowQuickSaleCliDropdown] = useState(false);
  const [quickSaleCliSearch, setQuickSaleCliSearch] = useState('');
  const [isSavingQuickSale, setIsSavingQuickSale] = useState(false);
  const [clientesCatalog, setClientesCatalog] = useState<any[]>([]);

  const quickSaleTotals = useMemo(() => {
    let precioTotal = 0;
    let costoTotal = 0;

    quickSalePartidas.forEach(p => {
      const cant = Number(p.cantidad) || 0;
      const precioUV = Number(p.precio_unitario_venta) || 0;
      const costoUP = Number(p.costo_unitario_proveedor) || 0;
      precioTotal += Math.round(cant * precioUV * 100) / 100;
      costoTotal += Math.round(cant * costoUP * 100) / 100;
    });

    // Sumar el gasto operativo vinculado que originó esta venta rápida
    const costoGasto = selectedGasto ? (Number(selectedGasto.monto) || 0) : 0;
    const costoTotalConGasto = costoTotal + costoGasto;

    const utilidad = Math.round((precioTotal - costoTotalConGasto) * 100) / 100;
    const margen = precioTotal > 0
      ? Math.round((utilidad / precioTotal) * 10000) / 10000
      : 0;

    return {
      precioTotal,
      costoTotal: costoTotalConGasto,
      utilidad,
      margen,
    };
  }, [quickSalePartidas, selectedGasto]);

  const filteredSalesForLinking = useMemo(() => {
    if (!linkSaleSearch.trim()) return salesForLinking;
    const query = linkSaleSearch.toLowerCase();
    return salesForLinking.filter(
      (s) =>
        s.cliente.toLowerCase().includes(query) ||
        (s.factura_referencia && s.factura_referencia.toLowerCase().includes(query)) ||
        (s.tipo_proyecto && s.tipo_proyecto.toLowerCase().includes(query))
    );
  }, [salesForLinking, linkSaleSearch]);

  const filteredClientsForQuickSale = useMemo(() => {
    if (!quickSaleCliSearch.trim()) return clientesCatalog;
    const q = quickSaleCliSearch.toLowerCase();
    return clientesCatalog.filter(c => c.nombre && c.nombre.toLowerCase().includes(q));
  }, [clientesCatalog, quickSaleCliSearch]);

  const handleOpenProfile = () => {
    if (adminUser) {
      setProfilePhone(adminUser.telefono || '');
      setProfilePassword('');
      setProfileModalVisible(true);
    }
  };

  const handleSaveProfile = async () => {
    if (!adminUser) return;
    setIsSavingProfile(true);

    try {
      const updates: any = {
        telefono: profilePhone.trim(),
      };

      if (profilePassword.trim()) {
        updates.password = profilePassword.trim();
      }

      const { error: errorInttec } = await inttecClient
        .from('usuarios')
        .update(updates)
        .eq('id', adminUser.id);
      if (errorInttec) throw errorInttec;

      const { error: errorDaravisa } = await daravisaClient
        .from('usuarios')
        .update(updates)
        .eq('id', adminUser.id);
      if (errorDaravisa) {
        logger.error('Error actualizando perfil en Daravisa:', errorDaravisa);
      }

      // Actualizar el estado local y AsyncStorage
      const updatedUser: Usuario = {
        ...adminUser,
        telefono: updates.telefono,
      };

      setAdminUser(updatedUser);
      await AsyncStorage.setItem('logged_user', JSON.stringify(updatedUser));

      showAlert('Éxito', 'Perfil actualizado correctamente.');
      setProfileModalVisible(false);
      setProfilePassword('');
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo actualizar el perfil.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  useEffect(() => {
    const checkAdmin = async () => {
      const user = await AuthService.getCurrentUser();
      if (!user || user.rol !== 'ADMIN') {
        router.replace('/');
        return;
      }
      setAdminUser(user);
      await refreshData();
    };

    checkAdmin();

    const interval = setInterval(() => {
      refreshData(true);
    }, 30000);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company]);

  const refreshData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const [gastosRes, usersRes, vehList, gasLogs] = await Promise.all([
        supabase.from('gastos').select('*').order('created_at', { ascending: false }),
        supabase.from('usuarios').select('*').order('nombre'),
        VehiculoService.getVehiculos(false),
        VehiculoService.getRegistrosGasolina(),
      ]);

      if (gastosRes.error) throw gastosRes.error;
      if (usersRes.error) throw usersRes.error;

      setGastos(gastosRes.data || []);
      setPersonal(usersRes.data || []);
      setVehiculos(vehList);
      setRegistrosGasolina(gasLogs);
    } catch (err: any) {
      logger.error('Error loading admin data:', err);
      if (!silent) {
        Alert.alert('Error', err.message || 'No se pudieron recuperar los datos.');
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  const handleLogout = async () => {
    const performLogout = async () => {
      await AuthService.logout();
      setUser(null);
    };

    if (Platform.OS === 'web') {
      const confirm = window.confirm('¿Estás seguro de que deseas cerrar sesión?');
      if (confirm) {
        await performLogout();
      }
      return;
    }

    Alert.alert('Cerrar Sesión', '¿Estás seguro de que deseas salir?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar Sesión',
        style: 'destructive',
        onPress: performLogout,
      },
    ]);
  };

  const handleToggleCompany = useCallback(async (nextCompany: 'inttec' | 'daravisa') => {
    await changeCompany(nextCompany);
  }, [changeCompany]);

  // Acciones de Revisión de Gastos
  const handleUpdateStatus = async (status: 'APPROVED' | 'REJECTED' | 'ACTION_REQUIRED' | 'PENDING') => {
    if (!selectedGasto || !adminUser) return;
    
    if (status === 'ACTION_REQUIRED' && !rejectionFeedback.trim()) {
      showAlert('Observación requerida', 'Por favor escribe una duda o comentario para devolver el gasto.');
      return;
    }

    setIsProcessingAction(true);
    try {
      const oldVentaId = selectedGasto.venta_id;
      const updatePayload: Partial<Gasto> = { status };
      
      if (status === 'APPROVED') {
        updatePayload.approved_at = new Date().toISOString();
      } else {
        updatePayload.venta_id = null;
        if (status === 'ACTION_REQUIRED') {
          updatePayload.rejection_feedback = rejectionFeedback.trim();
        } else if (status === 'PENDING') {
          updatePayload.approved_at = null;
          updatePayload.rejection_feedback = null;
        }
      }

      const { error } = await supabase
        .from('gastos')
        .update(updatePayload)
        .eq('id', selectedGasto.id);

      if (error) throw error;

      if (oldVentaId) {
        await recalculateVentaTotals(oldVentaId);
      }

      // Generar registro de auditoría
      await supabase.from('audit_logs').insert([
        {
          action: status === 'APPROVED' ? 'APPROVE' : status === 'REJECTED' ? 'REJECT' : status === 'PENDING' ? 'REVERT' : 'UPDATE',
          actor_id: adminUser.id,
          target_id: selectedGasto.id,
          details: status === 'PENDING' 
            ? `Gasto por ${selectedGasto.monto} devuelto a revisión por Admin.` 
            : `Gasto por ${selectedGasto.monto} revisado por Admin. Estado final: ${status}`,
        },
      ]);

      let friendlyStatus = 'Acción Requerida';
      if (status === 'APPROVED') friendlyStatus = 'Aprobado';
      else if (status === 'REJECTED') friendlyStatus = 'Rechazado';
      else if (status === 'PENDING') friendlyStatus = 'Reversado (Pendiente)';

      showAlert('Éxito', `El gasto ha sido marcado como ${friendlyStatus}.`);
      setReviewModalVisible(false);
      setSelectedGasto(null);
      setRejectionFeedback('');
      setShowFeedbackInput(false);
      await refreshData();
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo procesar la acción de revisión.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const loadSalesForLinking = async () => {
    setIsLoadingSalesForLinking(true);
    try {
      const [ventasRes, cliRes] = await Promise.all([
        supabase.from('ventas').select('*').order('fecha', { ascending: false }).limit(50),
        supabase.from('clientes').select('*').order('nombre'),
      ]);
      if (ventasRes.error) throw ventasRes.error;
      setSalesForLinking(ventasRes.data || []);
      setClientesCatalog(cliRes.data || []);
    } catch (err) {
      logger.error('Error loading sales for linking:', err);
    } finally {
      setIsLoadingSalesForLinking(false);
    }
  };

  const handleApproveClick = () => {
    if (!selectedGasto) return;
    setLinkSaleSearch('');
    setIsQuickSaleFormVisible(false);
    setIsLinkSaleModalVisible(true);
    loadSalesForLinking();
  };

  const executeApproveGasto = async (ventaId: string | null) => {
    if (!selectedGasto || !adminUser) return;

    setIsProcessingAction(true);
    try {
      const updatePayload: Partial<Gasto> = {
        status: 'APPROVED',
        approved_at: new Date().toISOString(),
        venta_id: ventaId,
      };

      const { error } = await supabase
        .from('gastos')
        .update(updatePayload)
        .eq('id', selectedGasto.id);

      if (error) throw error;

      if (ventaId) {
        await recalculateVentaTotals(ventaId);
      }

      // Generar registro de auditoría
      await supabase.from('audit_logs').insert([
        {
          action: 'APPROVE',
          actor_id: adminUser.id,
          target_id: selectedGasto.id,
          details: `Gasto por ${selectedGasto.monto} aprobado por Admin.${ventaId ? ` Vinculado a venta ID: ${ventaId}.` : ''}`,
        },
      ]);

      showAlert('Éxito', `El gasto ha sido marcado como Aprobado.${ventaId ? ' Vinculado a la venta seleccionada.' : ''}`);
      setReviewModalVisible(false);
      setSelectedGasto(null);
      setRejectionFeedback('');
      setShowFeedbackInput(false);
      await refreshData();
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo aprobar el gasto.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const uploadInvoiceToSupabase = async (uri: string, base64Data: string, ext: string) => {
    if (!selectedGasto || !adminUser) return;
    setIsUploadingInvoice(true);
    try {
      const contentType = ext === 'pdf' ? 'application/pdf' : 'image/jpeg';
      const fileName = `admin_uploads/factura_${selectedGasto.id}_${Date.now()}.${ext}`;
      const arrayBuffer = base64ToArrayBuffer(base64Data);

      const { error: uploadError } = await supabase.storage
        .from('tickets')
        .upload(fileName, arrayBuffer, { contentType, upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('tickets').getPublicUrl(fileName);
      const publicInvoiceUrl = urlData.publicUrl;

      // Actualizar en base de datos
      const { error: dbError } = await supabase
        .from('gastos')
        .update({
          facturado: true,
          factura_url: publicInvoiceUrl,
          motivo_sin_factura: null
        })
        .eq('id', selectedGasto.id);

      if (dbError) throw dbError;

      // Actualizar estado local
      const updatedGasto = {
        ...selectedGasto,
        facturado: true,
        factura_url: publicInvoiceUrl,
        motivo_sin_factura: null
      };
      setSelectedGasto(updatedGasto);
      setGastos(prev => prev.map(g => g.id === selectedGasto.id ? updatedGasto : g));

      showAlert('Éxito', 'Factura cargada y registrada correctamente.');
    } catch (err: any) {
      logger.error('Error al subir factura:', err);
      showAlert('Error', err.message || 'No se pudo subir la factura.');
    } finally {
      setIsUploadingInvoice(false);
    }
  };

  const handleCaptureAdminInvoice = async () => {
    if (Platform.OS !== 'web') {
      const cameraStatus = await ImagePicker.requestCameraPermissionsAsync();
      if (cameraStatus.status !== 'granted') {
        showAlert('Permiso', 'Se requiere permiso de cámara.');
        return;
      }
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: Platform.OS !== 'web',
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        let b64 = result.assets[0].base64;
        if (!b64) {
          const response = await fetch(result.assets[0].uri);
          const blob = await response.blob();
          b64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              resolve((reader.result as string).split(',')[1]);
            };
            reader.readAsDataURL(blob);
          });
        }
        await uploadInvoiceToSupabase(result.assets[0].uri, b64, 'jpg');
      }
    } catch (err) {
      logger.error('Camera invoice capture error:', err);
      if (Platform.OS === 'web') {
        await handleSelectAdminInvoiceGallery();
      } else {
        showAlert('Error', 'No se pudo abrir la cámara.');
      }
    }
  };

  const handleSelectAdminInvoiceGallery = async () => {
    const libraryStatus = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (libraryStatus.status !== 'granted') {
      showAlert('Permiso', 'Se requiere permiso de galería.');
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0] && result.assets[0].base64) {
        await uploadInvoiceToSupabase(result.assets[0].uri, result.assets[0].base64, 'jpg');
      }
    } catch (err) {
      logger.error('Gallery invoice select error:', err);
      showAlert('Error', 'No se pudo abrir la galería.');
    }
  };

  const handleSelectAdminInvoiceDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: false,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const uri = asset.uri;
        const mimeType = asset.mimeType || '';

        const isPdf = mimeType.includes('pdf') || uri.endsWith('.pdf') || asset.name?.endsWith('.pdf');
        const isImage = mimeType.startsWith('image/') || uri.endsWith('.jpg') || uri.endsWith('.jpeg') || uri.endsWith('.png');

        if (!isPdf && !isImage) {
          showAlert('Validación', 'Selecciona únicamente archivos PDF o imágenes (JPG, PNG).');
          return;
        }

        const ext = isPdf ? 'pdf' : 'jpg';

        if (Platform.OS !== 'web') {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const FileSys = require('expo-file-system');
          const tempFileName = `temp_${Date.now()}_${asset.name || 'factura.pdf'}`;
          const targetUri = `${FileSys.cacheDirectory}${tempFileName}`;

          await FileSys.copyAsync({
            from: uri,
            to: targetUri,
          });

          const b64 = await FileSys.readAsStringAsync(targetUri, {
            encoding: FileSys.EncodingType.Base64,
          });

          await uploadInvoiceToSupabase(targetUri, b64, ext);
        } else {
          const response = await fetch(uri);
          const blob = await response.blob();
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64data = (reader.result as string).split(',')[1];
            await uploadInvoiceToSupabase(uri, base64data, ext);
          };
          reader.readAsDataURL(blob);
        }
      }
    } catch (err) {
      logger.error('Document invoice select error:', err);
      showAlert('Error', 'No se pudo seleccionar el archivo.');
    }
  };

  const handleDeleteAdminInvoice = async () => {
    if (!selectedGasto) return;

    if (Platform.OS === 'web') {
      if (!window.confirm('¿Estás seguro de eliminar el archivo de factura?')) return;
    } else {
      const confirmed = await new Promise((resolve) => {
        Alert.alert(
          'Eliminar Factura',
          '¿Estás seguro de que deseas eliminar la factura adjunta?',
          [
            { text: 'Cancelar', onPress: () => resolve(false), style: 'cancel' },
            { text: 'Eliminar', onPress: () => resolve(true), style: 'destructive' },
          ]
        );
      });
      if (!confirmed) return;
    }

    setIsUploadingInvoice(true);
    try {
      const { error: dbError } = await supabase
        .from('gastos')
        .update({
          factura_url: null
        })
        .eq('id', selectedGasto.id);

      if (dbError) throw dbError;

      const updatedGasto = {
        ...selectedGasto,
        factura_url: null
      };
      setSelectedGasto(updatedGasto);
      setGastos(prev => prev.map(g => g.id === selectedGasto.id ? updatedGasto : g));

      showAlert('Éxito', 'Se ha eliminado la factura del gasto.');
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo eliminar la factura.');
    } finally {
      setIsUploadingInvoice(false);
    }
  };

  const handleToggleAdminFacturado = async (val: boolean) => {
    if (!selectedGasto) return;
    try {
      const updateObj: Partial<Gasto> = {
        facturado: val,
        motivo_sin_factura: val ? null : selectedGasto.motivo_sin_factura
      };
      if (!val) {
        updateObj.factura_url = null;
      }

      if (val) {
        setLocalMotivo('');
      }

      const { error: dbError } = await supabase
        .from('gastos')
        .update(updateObj)
        .eq('id', selectedGasto.id);

      if (dbError) throw dbError;

      const updatedGasto = {
        ...selectedGasto,
        ...updateObj
      };
      setSelectedGasto(updatedGasto);
      setGastos(prev => prev.map(g => g.id === selectedGasto.id ? updatedGasto : g));
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo cambiar el estado de facturación.');
    }
  };

  const handleUpdateAdminMotivoSinFactura = async (motivo: string) => {
    if (!selectedGasto) return;
    try {
      const { error: dbError } = await supabase
        .from('gastos')
        .update({
          motivo_sin_factura: motivo.trim() || null
        })
        .eq('id', selectedGasto.id);

      if (dbError) throw dbError;

      const updatedGasto = {
        ...selectedGasto,
        motivo_sin_factura: motivo.trim() || null
      };
      setSelectedGasto(updatedGasto);
      setGastos(prev => prev.map(g => g.id === selectedGasto.id ? updatedGasto : g));
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo actualizar el motivo.');
    }
  };

  const handleOpenQuickSaleForm = () => {
    if (!selectedGasto) return;

    setQuickSaleFecha(selectedGasto.fecha_comprobante || selectedGasto.created_at?.split('T')[0] || new Date().toISOString().split('T')[0]);
    setQuickSaleCliente(selectedGasto.cliente || '');
    setQuickSaleFactura(selectedGasto.facturado ? 'Factura' : '');
    setQuickSaleTipoProyecto(selectedGasto.tipo_servicio_proyecto || 'Otro');
    setQuickSaleProveedor(selectedGasto.sucursal || '');
    setQuickSaleNotas(`Vinculado automáticamente al aprobar gasto de justificación: ${selectedGasto.justificacion || 'Sin justificación'}`);

    // No pre-cargar partidas, dejarlas en blanco
    setQuickSalePartidas([]);

    setIsQuickSaleFormVisible(true);
  };

  const addQuickSalePartida = () => {
    setQuickSalePartidas(prev => [
      ...prev,
      {
        id: `manual_${Date.now()}`,
        descripcion: '',
        cantidad: '1',
        unidad: 'PZA',
        precio_unitario_venta: '0',
        costo_unitario_proveedor: '0',
      }
    ]);
  };

  const removeQuickSalePartida = (id: string) => {
    setQuickSalePartidas(prev => prev.filter(p => p.id !== id));
  };

  const updateQuickSalePartida = (id: string, field: keyof PartidaEditable, value: string) => {
    setQuickSalePartidas(prev =>
      prev.map(p => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const handleSaveQuickSale = async () => {
    if (!adminUser || !selectedGasto) return;

    if (!quickSaleFecha.trim()) {
      showAlert('Validación', 'Por favor ingresa la fecha.');
      return;
    }
    if (!quickSaleCliente.trim()) {
      showAlert('Validación', 'Por favor ingresa el nombre del cliente.');
      return;
    }
    if (quickSalePartidas.length === 0) {
      showAlert('Validación', 'Agrega al menos una partida.');
      return;
    }

    const hasEmptyDescriptions = quickSalePartidas.some(p => !p.descripcion.trim());
    if (hasEmptyDescriptions) {
      showAlert('Validación', 'Todas las partidas deben tener una descripción.');
      return;
    }

    setIsSavingQuickSale(true);
    try {
      // 1. Insertar venta principal
      const ventaPayload = {
        registrado_por: adminUser.id,
        fecha: quickSaleFecha.trim(),
        cliente: quickSaleCliente.trim(),
        factura_referencia: quickSaleFactura.trim() || null,
        tipo_proyecto: quickSaleTipoProyecto || null,
        proveedor: quickSaleProveedor.trim() || null,
        precio_total_facturado: quickSaleTotals.precioTotal,
        costo_total: quickSaleTotals.costoTotal,
        utilidad_bruta: quickSaleTotals.utilidad,
        margen_porcentual: quickSaleTotals.margen,
        factura_url: selectedGasto.factura_url || null, // reusar factura del gasto
        notas: quickSaleNotas.trim() || null,
      };

      const { data: ventaData, error: ventaError } = await supabase
        .from('ventas')
        .insert([ventaPayload])
        .select()
        .single();

      if (ventaError) throw ventaError;

      // 2. Insertar partidas
      const partidasPayload = quickSalePartidas.map(p => {
        const cant = Number(p.cantidad) || 0;
        const precioUV = Number(p.precio_unitario_venta) || 0;
        const costoUP = Number(p.costo_unitario_proveedor) || 0;

        return {
          venta_id: ventaData.id,
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

      // 3. Aprobar y vincular gasto
      setIsQuickSaleFormVisible(false);
      setIsLinkSaleModalVisible(false);
      await executeApproveGasto(ventaData.id);
    } catch (err: any) {
      showAlert('Error al guardar venta rápida', err.message || 'No se pudo crear la venta.');
    } finally {
      setIsSavingQuickSale(false);
    }
  };

  // Registrar Nuevo Usuario
  const handleAddUser = async () => {
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword || !newUserRole) {
      showAlert('Validación', 'Por favor completa los campos obligatorios (*).');
      return;
    }

    setIsAddingUser(true);
    try {
      const newUserObj = {
        nombre: newUserName.trim(),
        email: newUserEmail.trim().toLowerCase(),
        password: newUserPassword,
        rol: newUserRole,
        telefono: newUserPhone.trim() || null,
      };

      const { error: errorInttec } = await inttecClient.from('usuarios').insert([newUserObj]);
      if (errorInttec) throw errorInttec;

      const { error: errorDaravisa } = await daravisaClient.from('usuarios').insert([newUserObj]);
      if (errorDaravisa) {
        logger.error('Error insertando usuario en Daravisa:', errorDaravisa);
      }

      showAlert('Éxito', 'Personal registrado correctamente.');
      setAddUserModalVisible(false);
      // Limpiar campos
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserPhone('');
      setNewUserRole('EMPLEADO');
      await refreshData();
    } catch (err: any) {
      showAlert('Error al registrar', err.message || 'No se pudo registrar el nuevo usuario.');
    } finally {
      setIsAddingUser(false);
    }
  };

  // Abrir Modal de Edición de Usuario
  const handleOpenEditUser = (user: Usuario) => {
    setEditingUser(user);
    setEditUserName(user.nombre);
    setEditUserEmail(user.email);
    setEditUserPhone(user.telefono || '');
    setEditUserRole(user.rol);
    setEditUserPassword(''); // Mantener contraseña vacía a menos que se quiera cambiar
    setEditUserModalVisible(true);
  };

  // Actualizar Usuario en Supabase
  const handleUpdateUser = async () => {
    if (!editingUser || !editUserName.trim() || !editUserEmail.trim()) {
      showAlert('Validación', 'Nombre y Correo son campos requeridos.');
      return;
    }

    setIsUpdatingUser(true);
    try {
      const updatePayload: any = {
        nombre: editUserName.trim(),
        email: editUserEmail.trim().toLowerCase(),
        rol: editUserRole,
        telefono: editUserPhone.trim() || null,
      };

      // Si se ingresó una nueva contraseña, la actualizamos
      if (editUserPassword) {
        updatePayload.password = editUserPassword;
      }

      const { error: errorInttec } = await inttecClient
        .from('usuarios')
        .update(updatePayload)
        .eq('id', editingUser.id);

      if (errorInttec) throw errorInttec;

      const { error: errorDaravisa } = await daravisaClient
        .from('usuarios')
        .update(updatePayload)
        .eq('id', editingUser.id);

      if (errorDaravisa) {
        logger.error('Error actualizando usuario en Daravisa:', errorDaravisa);
      }

      showAlert('Éxito', 'Información de personal actualizada correctamente.');
      setEditUserModalVisible(false);
      setEditingUser(null);
      await refreshData();
    } catch (err: any) {
      showAlert('Error al actualizar', err.message || 'No se pudo guardar la información.');
    } finally {
      setIsUpdatingUser(false);
    }
  };

  // Eliminar Usuario
  const handleDeleteUser = async (id: string, name: string) => {
    const performDelete = async () => {
      try {
        const { error: errorInttec } = await inttecClient.from('usuarios').delete().eq('id', id);
        if (errorInttec) {
          if (errorInttec.code === '23503') {
            throw new Error('No se puede eliminar a este empleado porque tiene gastos o evidencias de trabajo registradas. Para no alterar el historial contable e informes pasados de la empresa, te sugerimos editar su perfil y cambiar sus accesos (correo/contraseña) si deseas inhabilitar su cuenta.');
          }
          throw errorInttec;
        }

        const { error: errorDaravisa } = await daravisaClient.from('usuarios').delete().eq('id', id);
        if (errorDaravisa) {
          if (errorDaravisa.code === '23503') {
            throw new Error('No se puede eliminar a este empleado porque tiene gastos o evidencias de trabajo registradas en Daravisa. Para no alterar el historial contable e informes pasados de la empresa, te sugerimos editar su perfil y cambiar sus accesos (correo/contraseña) si deseas inhabilitar su cuenta.');
          }
          throw errorDaravisa;
        }
        showAlert('Éxito', 'Personal eliminado.');
        await refreshData();
      } catch (err: any) {
        showAlert('Error al eliminar', err.message || 'No se pudo eliminar el usuario.');
      }
    };

    if (Platform.OS === 'web') {
      const confirm = window.confirm(`¿Estás seguro de que deseas eliminar a ${name}? Esta acción podría causar inconsistencias en gastos anteriores.`);
      if (confirm) {
        await performDelete();
      }
      return;
    }

    Alert.alert(
      'Confirmar Eliminación',
      `¿Estás seguro de que deseas eliminar a ${name}? Esta acción podría causar inconsistencias en gastos anteriores.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: performDelete,
        },
      ]
    );
  };

  // ==========================================
  // GESTIÓN DE VEHÍCULOS Y GASOLINA
  // ==========================================
  const handleSaveVehiculo = async () => {
    if (!newVehiculoMarca.trim() || !newVehiculoModelo.trim() || !newVehiculoAnio.trim() || !newVehiculoPlacas.trim()) {
      showAlert('Validación', 'Por favor completa todos los campos marcados (*).');
      return;
    }
    const anioNum = Number(newVehiculoAnio);
    if (isNaN(anioNum) || anioNum < 1900 || anioNum > new Date().getFullYear() + 2) {
      showAlert('Validación', 'Por favor ingresa un año válido (ej. 2024).');
      return;
    }

    setIsSavingVehiculo(true);
    try {
      const payload = {
        marca: newVehiculoMarca.trim(),
        modelo: newVehiculoModelo.trim(),
        anio: anioNum,
        placas: newVehiculoPlacas.trim().toUpperCase(),
        numero_economico: newVehiculoNumEcon.trim() || null,
        activo: editingVehiculo ? editingVehiculo.activo : true,
      };

      if (editingVehiculo) {
        await VehiculoService.actualizarVehiculo(editingVehiculo.id, payload);
        showAlert('Éxito', 'Vehículo actualizado correctamente.');
      } else {
        await VehiculoService.crearVehiculo(payload);
        showAlert('Éxito', 'Vehículo registrado correctamente.');
      }

      setNewVehiculoMarca('');
      setNewVehiculoModelo('');
      setNewVehiculoAnio('');
      setNewVehiculoPlacas('');
      setNewVehiculoNumEcon('');
      setEditingVehiculo(null);
      setVehiculoModalVisible(false);
      await refreshData();
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo guardar el vehículo.');
    } finally {
      setIsSavingVehiculo(false);
    }
  };

  const handleEditVehiculo = (veh: Vehiculo) => {
    setEditingVehiculo(veh);
    setNewVehiculoMarca(veh.marca);
    setNewVehiculoModelo(veh.modelo);
    setNewVehiculoAnio(String(veh.anio));
    setNewVehiculoPlacas(veh.placas);
    setNewVehiculoNumEcon(veh.numero_economico || '');
    setVehiculoModalVisible(true);
  };

  const handleDeleteVehiculo = async (id: string, plates: string) => {
    const performDelete = async () => {
      try {
        await VehiculoService.eliminarVehiculo(id);
        showAlert('Éxito', 'Vehículo eliminado.');
        await refreshData();
      } catch (err: any) {
        showAlert('Error', err.message || 'No se pudo eliminar el vehículo. Es posible que tenga registros de gasolina vinculados.');
      }
    };

    if (Platform.OS === 'web') {
      const confirm = window.confirm(`¿Estás seguro de que deseas eliminar el vehículo con placas ${plates}?`);
      if (confirm) await performDelete();
      return;
    }

    Alert.alert(
      'Confirmar Eliminación',
      `¿Estás seguro de que deseas eliminar el vehículo con placas ${plates}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: performDelete }
      ]
    );
  };

  const handleToggleVehiculoActivo = async (veh: Vehiculo) => {
    try {
      await VehiculoService.actualizarVehiculo(veh.id, { activo: !veh.activo });
      showAlert('Éxito', `Vehículo ${!veh.activo ? 'activado' : 'desactivado'} correctamente.`);
      await refreshData();
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo cambiar el estado del vehículo.');
    }
  };

  // Ver Historial de Asistencia de un Empleado
  const handleOpenAsistencia = async (empleado: Usuario) => {
    setAsistenciaEmpleado(empleado);
    setAsistenciaModalVisible(true);
    setIsLoadingAsistencias(true);
    try {
      const historial = await AsistenciaService.getHistorialEmpleado(empleado.id);
      setAsistencias(historial);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo cargar el historial de asistencia.');
    } finally {
      setIsLoadingAsistencias(false);
    }
  };

  const handleDeleteGasto = async (id: string) => {
    const performDelete = async () => {
      setIsProcessingAction(true);
      try {
        const { error } = await supabase.from('gastos').delete().eq('id', id);
        if (error) throw error;
        setGastos(prev => prev.filter(g => g.id !== id));
        setReviewModalVisible(false);
        setSelectedGasto(null);
        showAlert('Éxito', 'Gasto eliminado correctamente de la base de datos.');
      } catch (err: any) {
        showAlert('Error al eliminar', err.message || 'No se pudo eliminar el gasto.');
      } finally {
        setIsProcessingAction(false);
      }
    };

    if (Platform.OS === 'web') {
      const confirm = window.confirm('¿Estás seguro de que deseas eliminar este gasto de la base de datos? Esta acción es irreversible.');
      if (confirm) {
        await performDelete();
      }
      return;
    }

    Alert.alert(
      'Eliminar Gasto Permanente',
      '¿Estás seguro de que deseas eliminar este gasto de la base de datos? Esta acción es irreversible.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: performDelete,
        },
      ]
    );
  };

  const formatAsistenciaFecha = (fecha: string) => {
    const parts = fecha.split('-');
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    }
    return fecha;
  };

  const handleOpenMap = (lat: number, lng: number) => {
    const url = Platform.select({
      ios: `maps:0,0?q=${lat},${lng}`,
      android: `geo:0,0?q=${lat},${lng}`,
      default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    });
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'No se pudo abrir el mapa.');
    });
  };

  // Exportar reportes
  const handleExportPDF = async () => {
    try {
      await ReportGenerator.exportToPDF(gastos, `Historial General de Gastos ${company === 'daravisa' ? 'DARAVISA' : 'INTTEC'}`);
    } catch (err: any) {
      Alert.alert('Error PDF', err.message);
    }
  };

  const handleExportCSV = async () => {
    try {
      await ReportGenerator.exportToCSV(gastos, `historial_gastos_${company === 'daravisa' ? 'daravisa' : 'inttec'}.csv`);
    } catch (err: any) {
      Alert.alert('Error CSV', err.message);
    }
  };

  const handleExportAsistenciasPDF = async () => {
    setIsFetchingAsistencias(true);
    try {
      const { data, error } = await supabase
        .from('asistencias')
        .select('*')
        .order('fecha', { ascending: false });
      if (error) throw error;
      await ReportGenerator.exportAsistenciasToPDF(data || [], personal, 'Reporte de Asistencia General');
    } catch (err: any) {
      showAlert('Error PDF Asistencia', err.message || 'No se pudo generar el reporte.');
    } finally {
      setIsFetchingAsistencias(false);
    }
  };

  const handleExportAsistenciasCSV = async () => {
    setIsFetchingAsistencias(true);
    try {
      const { data, error } = await supabase
        .from('asistencias')
        .select('*')
        .order('fecha', { ascending: false });
      if (error) throw error;
      await ReportGenerator.exportAsistenciasToCSV(data || [], personal, 'reporte_asistencia_general.csv');
    } catch (err: any) {
      showAlert('Error CSV Asistencia', err.message || 'No se pudo generar el reporte.');
    } finally {
      setIsFetchingAsistencias(false);
    }
  };

  const handleExportInventarioPDF = async () => {
    setIsFetchingInventario(true);
    try {
      const [prodRes, catRes] = await Promise.all([
        supabase.from('productos').select('*').order('nombre_oficial'),
        supabase.from('categorias_productos').select('*').order('nombre'),
      ]);
      if (prodRes.error) throw prodRes.error;
      if (catRes.error) throw catRes.error;
      await ReportGenerator.exportInventarioToPDF(prodRes.data || [], catRes.data || [], 'Reporte de Inventario de Materiales');
    } catch (err: any) {
      showAlert('Error PDF Inventario', err.message || 'No se pudo generar el reporte.');
    } finally {
      setIsFetchingInventario(false);
    }
  };

  const handleExportInventarioCSV = async () => {
    setIsFetchingInventario(true);
    try {
      const [prodRes, catRes] = await Promise.all([
        supabase.from('productos').select('*').order('nombre_oficial'),
        supabase.from('categorias_productos').select('*').order('nombre'),
      ]);
      if (prodRes.error) throw prodRes.error;
      if (catRes.error) throw catRes.error;
      await ReportGenerator.exportInventarioToCSV(prodRes.data || [], catRes.data || [], 'reporte_inventario_general.csv');
    } catch (err: any) {
      showAlert('Error CSV Inventario', err.message || 'No se pudo generar el reporte.');
    } finally {
      setIsFetchingInventario(false);
    }
  };

  const handleExportConsumosPDF = async () => {
    setIsFetchingConsumos(true);
    try {
      const { data, error } = await supabase
        .from('movimientos_inventario')
        .select('*, producto:productos(nombre_oficial)')
        .eq('tipo', 'SALIDA')
        .order('fecha', { ascending: false });
      if (error) throw error;
      await ReportGenerator.exportConsumosToPDF(data || [], 'Reporte de Consumos de Materiales');
    } catch (err: any) {
      showAlert('Error PDF Consumos', err.message || 'No se pudo generar el reporte.');
    } finally {
      setIsFetchingConsumos(false);
    }
  };

  const handleExportConsumosCSV = async () => {
    setIsFetchingConsumos(true);
    try {
      const { data, error } = await supabase
        .from('movimientos_inventario')
        .select('*, producto:productos(nombre_oficial)')
        .eq('tipo', 'SALIDA')
        .order('fecha', { ascending: false });
      if (error) throw error;
      await ReportGenerator.exportConsumosToCSV(data || [], 'reporte_consumos_general.csv');
    } catch (err: any) {
      showAlert('Error CSV Consumos', err.message || 'No se pudo generar el reporte.');
    } finally {
      setIsFetchingConsumos(false);
    }
  };

  const handleExportVentasPDF = async () => {
    setIsFetchingVentas(true);
    try {
      const { data, error } = await supabase
        .from('ventas')
        .select('*')
        .order('fecha', { ascending: false });
      if (error) throw error;
      await ReportGenerator.exportVentasToPDF(data || [], 'Reporte de Control de Ventas');
    } catch (err: any) {
      showAlert('Error PDF Ventas', err.message || 'No se pudo generar el reporte de ventas.');
    } finally {
      setIsFetchingVentas(false);
    }
  };

  const handleExportVentasCSV = async () => {
    setIsFetchingVentas(true);
    try {
      const { data, error } = await supabase
        .from('ventas')
        .select('*')
        .order('fecha', { ascending: false });
      if (error) throw error;
      await ReportGenerator.exportVentasToCSV(data || [], 'reporte_ventas_general.csv');
    } catch (err: any) {
      showAlert('Error CSV Ventas', err.message || 'No se pudo generar el reporte de ventas.');
    } finally {
      setIsFetchingVentas(false);
    }
  };

  // Master Filter: Búsqueda (Empleado, Cliente, Categoría, Proveedor, Detalle) y Fechas (Día Único o Rango)
  const filteredGastos = useMemo(() => {
    return gastos.filter((g) => {
      // 1. Buscador de Texto (Empleado, Cliente, Categoría, Proveedor, Detalle)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const empName = (g.empleado_nombre || '').toLowerCase();
        const clientName = (g.cliente || '').toLowerCase();
        const catName = (g.categoria || '').toLowerCase();
        const subCatName = (g.subcategoria || '').toLowerCase();
        const provName = (g.proveedor || '').toLowerCase();
        const detailStr = (g.detalle_servicio_proyecto || '').toLowerCase();

        const matches = empName.includes(query) ||
                        clientName.includes(query) ||
                        catName.includes(query) ||
                        subCatName.includes(query) ||
                        provName.includes(query) ||
                        detailStr.includes(query);

        if (!matches) return false;
      }

      // 2. Filtro por Fecha de Comprobante / Creación (Día Único o Rango)
      const gastoFecha = g.fecha_comprobante || g.created_at?.split('T')[0];
      if (startDateFilter && gastoFecha) {
        if (gastoFecha < startDateFilter) return false;
      }
      if (endDateFilter && gastoFecha) {
        if (gastoFecha > endDateFilter) return false;
      }

      return true;
    });
  }, [gastos, searchQuery, startDateFilter, endDateFilter]);

  // Filtrados por Pestañas y Facturación
  const pendingGastos = filteredGastos.filter((g) => g.status === 'PENDING');
  const historyGastos = filteredGastos.filter((g) => {
    const isHistoryStatus = g.status === 'APPROVED' || g.status === 'REJECTED' || g.status === 'ACTION_REQUIRED';
    if (!isHistoryStatus) return false;
    
    if (facturaFilter === 'FACTURADOS') return g.facturado === true;
    if (facturaFilter === 'PENDIENTE_ENTREGA') {
      return !g.facturado && (g.motivo_sin_factura === 'PENDIENTE_ENTREGA' || g.motivo_sin_factura?.toLowerCase().includes('pendiente'));
    }
    if (facturaFilter === 'NO_FACTURADOS') {
      return !g.facturado && g.motivo_sin_factura !== 'PENDIENTE_ENTREGA' && !g.motivo_sin_factura?.toLowerCase().includes('pendiente');
    }
    return true; // TODOS
  });

  // Totales
  const totalPendientes = pendingGastos.reduce((sum, g) => sum + Number(g.monto), 0);
  const totalAprobados = filteredGastos.filter((g) => g.status === 'APPROVED').reduce((sum, g) => sum + Number(g.monto), 0);

  const formatCurrency = (monto: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(monto);
  };

  const formatFriendlyDate = (dateStr?: string | null) => {
    if (!dateStr) return 'N/A';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const parseJustificacion = (just: string | null | undefined) => {
    if (!just) return { alerta: null, justificacion: '' };
    const match = just.match(/^\[ALERTA IA:\s*([\s\S]*?)\]\s*\n\s*([\s\S]*)$/);
    if (match) {
      return {
        alerta: match[1],
        justificacion: match[2],
      };
    }
    return { alerta: null, justificacion: just };
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>Panel de Administración</Text>
          <Text style={[styles.headerTitle, { color: themeColors.text }]} numberOfLines={1}>
            {adminUser?.nombre || 'Administrador'}
          </Text>
        </View>
        
        {/* BOTONES EXTRA */}
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => setVehiculosManagerModalVisible(true)}
            style={[styles.headerIconBtn, { backgroundColor: themeColors.primary + '15' }]}
          >
            <Ionicons name="car-outline" size={20} color={themeColors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/(admin)/formulario')}
            style={[styles.headerIconBtn, { backgroundColor: themeColors.primary + '15' }]}
          >
            <Ionicons name="receipt-outline" size={20} color={themeColors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleOpenProfile}
            style={[styles.headerIconBtn, { backgroundColor: themeColors.backgroundElement }]}
          >
            <Ionicons name="person-circle-outline" size={20} color={themeColors.accent} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleLogout}
            style={[styles.headerIconBtn, { backgroundColor: themeColors.backgroundElement }]}
          >
            <Ionicons name="log-out-outline" size={20} color={themeColors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Switch de Empresa - Fila Dedicada */}
      <View style={{
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: Spacing.four,
        marginBottom: Spacing.two,
      }}>
        <View style={{
          flexDirection: 'row',
          backgroundColor: scheme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
          borderRadius: 20,
          padding: 2,
          alignItems: 'center',
          width: 220,
        }}>
          <TouchableOpacity
            onPress={() => company !== 'inttec' && handleToggleCompany('inttec')}
            style={{
              flex: 1,
              paddingVertical: 6,
              borderRadius: 18,
              backgroundColor: company === 'inttec' ? themeColors.accent : 'transparent',
              alignItems: 'center'
            }}
          >
            <Text style={{
              fontSize: 11,
              fontWeight: '700',
              color: company === 'inttec' ? '#ffffff' : themeColors.textSecondary,
            }}>
              INTTEC
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => company !== 'daravisa' && handleToggleCompany('daravisa')}
            style={{
              flex: 1,
              paddingVertical: 6,
              borderRadius: 18,
              backgroundColor: company === 'daravisa' ? themeColors.accent : 'transparent',
              alignItems: 'center'
            }}
          >
            <Text style={{
              fontSize: 11,
              fontWeight: '700',
              color: company === 'daravisa' ? '#ffffff' : themeColors.textSecondary,
            }}>
              DARAVISA
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Resumen Cards */}
      <View style={styles.summaryContainer}>
        <View style={[styles.summaryCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: themeColors.warning + '15', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="time" size={20} color={themeColors.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]} numberOfLines={1}>PENDIENTES</Text>
              <Text style={[styles.summaryValue, { color: themeColors.warning }]} numberOfLines={1}>{formatCurrency(totalPendientes)}</Text>
            </View>
          </View>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: themeColors.success + '15', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="checkmark-circle" size={20} color={themeColors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]} numberOfLines={1}>APROBADO</Text>
              <Text style={[styles.summaryValue, { color: themeColors.success }]} numberOfLines={1}>{formatCurrency(totalAprobados)}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Botones de Administración Extra */}
      <View style={[
        styles.quickActionsContainer,
        {
          paddingHorizontal: isMobile ? Spacing.two : Spacing.four,
          gap: isMobile ? Spacing.one : Spacing.two,
        }
      ]}>
        <TouchableOpacity
          onPress={() => setPersonalModalVisible(true)}
          style={[
            styles.quickActionBtn,
            {
              backgroundColor: themeColors.backgroundElement,
              borderColor: themeColors.border,
              paddingHorizontal: isMobile ? 4 : Spacing.one,
            }
          ]}
        >
          <View style={[styles.quickActionIconBg, { backgroundColor: themeColors.accent + '15' }]}>
            <Ionicons name="people-sharp" size={18} color={themeColors.accent} />
          </View>
          <Text
            style={[
              styles.quickActionLabel,
              {
                color: themeColors.text,
                fontSize: isMobile ? 10 : 11,
              }
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            Personal
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/(admin)/inventario' as any)}
          style={[
            styles.quickActionBtn,
            {
              backgroundColor: themeColors.backgroundElement,
              borderColor: themeColors.border,
              paddingHorizontal: isMobile ? 4 : Spacing.one,
            }
          ]}
        >
          <View style={[styles.quickActionIconBg, { backgroundColor: themeColors.warning + '15' }]}>
            <Ionicons name="cube-sharp" size={18} color={themeColors.warning} />
          </View>
          <Text
            style={[
              styles.quickActionLabel,
              {
                color: themeColors.text,
                fontSize: isMobile ? 10 : 11,
              }
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            Inventario
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setReportsModalVisible(true)}
          style={[
            styles.quickActionBtn,
            {
              backgroundColor: themeColors.backgroundElement,
              borderColor: themeColors.border,
              paddingHorizontal: isMobile ? 4 : Spacing.one,
            }
          ]}
        >
          <View style={[styles.quickActionIconBg, { backgroundColor: themeColors.success + '15' }]}>
            <Ionicons name="document-text-sharp" size={18} color={themeColors.success} />
          </View>
          <Text
            style={[
              styles.quickActionLabel,
              {
                color: themeColors.text,
                fontSize: isMobile ? 10 : 11,
              }
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            Reportes
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/(admin)/evidencias')}
          style={[
            styles.quickActionBtn,
            {
              backgroundColor: themeColors.backgroundElement,
              borderColor: themeColors.border,
              paddingHorizontal: isMobile ? 4 : Spacing.one,
            }
          ]}
        >
          <View style={[styles.quickActionIconBg, { backgroundColor: themeColors.actionRequired + '15' }]}>
            <Ionicons name="briefcase-sharp" size={18} color={themeColors.actionRequired} />
          </View>
          <Text
            style={[
              styles.quickActionLabel,
              {
                color: themeColors.text,
                fontSize: isMobile ? 10 : 11,
              }
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            Evidencias
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/(admin)/catalogos')}
          style={[
            styles.quickActionBtn,
            {
              backgroundColor: themeColors.backgroundElement,
              borderColor: themeColors.border,
              paddingHorizontal: isMobile ? 4 : Spacing.one,
            }
          ]}
        >
          <View style={[styles.quickActionIconBg, { backgroundColor: themeColors.warning + '15' }]}>
            <Ionicons name="options-sharp" size={18} color={themeColors.warning} />
          </View>
          <Text
            style={[
              styles.quickActionLabel,
              {
                color: themeColors.text,
                fontSize: isMobile ? 10 : 11,
              }
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            Catálogos
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/(admin)/cotizaciones')}
          style={[
            styles.quickActionBtn,
            {
              backgroundColor: themeColors.backgroundElement,
              borderColor: themeColors.border,
              paddingHorizontal: isMobile ? 4 : Spacing.one,
            }
          ]}
        >
          <View style={[styles.quickActionIconBg, { backgroundColor: themeColors.accent + '15' }]}>
            <Ionicons name="document-text" size={18} color={themeColors.accent} />
          </View>
          <Text
            style={[
              styles.quickActionLabel,
              {
                color: themeColors.text,
                fontSize: isMobile ? 10 : 11,
              }
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            Cotizaciones
          </Text>
        </TouchableOpacity>

      </View>

      {/* BARRA DE BÚSQUEDA Y FILTRO DE CALENDARIO DE FECHAS */}
      <View style={{ paddingHorizontal: Spacing.three, marginBottom: Spacing.two, gap: Spacing.one }}>
        <View style={{ flexDirection: 'row', gap: Spacing.one, alignItems: 'center' }}>
          {/* Campo de Búsqueda (Empleado, Cliente, Categoría, Proveedor, Detalle) */}
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: themeColors.backgroundElement, borderRadius: BorderRadius.medium, borderWidth: 1, borderColor: themeColors.border, paddingHorizontal: Spacing.two, height: 42 }}>
            <Ionicons name="search-outline" size={18} color={themeColors.textSecondary} style={{ marginRight: 8 }} />
            <TextInput
              placeholder="Buscar empleado, cliente, categoría, proveedor..."
              placeholderTextColor={themeColors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={{ flex: 1, color: themeColors.text, fontSize: 13 }}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={themeColors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Botón de Calendario / Filtro de Fechas */}
          <TouchableOpacity
            onPress={() => setDateFilterModalVisible(true)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: (startDateFilter || endDateFilter) ? themeColors.accent + '20' : themeColors.backgroundElement,
              borderColor: (startDateFilter || endDateFilter) ? themeColors.accent : themeColors.border,
              borderWidth: 1,
              borderRadius: BorderRadius.medium,
              paddingHorizontal: Spacing.two,
              height: 42,
              gap: 6
            }}
          >
            <Ionicons name="calendar-outline" size={18} color={(startDateFilter || endDateFilter) ? themeColors.accent : themeColors.text} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: (startDateFilter || endDateFilter) ? themeColors.accent : themeColors.text }}>
              {startDateFilter && endDateFilter
                ? (startDateFilter === endDateFilter ? formatFriendlyDate(startDateFilter) : `${formatFriendlyDate(startDateFilter)} - ${formatFriendlyDate(endDateFilter)}`)
                : 'Fechas'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Indicador de Fechas Activas */}
        {(startDateFilter || endDateFilter) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
            <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
              Filtrado: {startDateFilter === endDateFilter ? formatFriendlyDate(startDateFilter) : `${formatFriendlyDate(startDateFilter)} a ${formatFriendlyDate(endDateFilter)}`}
            </Text>
            <TouchableOpacity onPress={() => { setStartDateFilter(null); setEndDateFilter(null); }}>
              <Text style={{ fontSize: 11, color: themeColors.danger, fontWeight: 'bold' }}>Limpiar fechas</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Segmented Control Tabs */}
      <View style={[styles.tabsSegmentedContainer, { backgroundColor: themeColors.border }]}>
        <TouchableOpacity
          onPress={() => setActiveTab('pendientes')}
          style={[
            styles.tabSegment,
            activeTab === 'pendientes' && { backgroundColor: themeColors.backgroundElement }
          ]}
        >
          <Text style={[styles.tabSegmentText, { color: activeTab === 'pendientes' ? themeColors.text : themeColors.textSecondary, fontWeight: activeTab === 'pendientes' ? 'bold' : '600' }]}>
            Revisar ({pendingGastos.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('historial')}
          style={[
            styles.tabSegment,
            activeTab === 'historial' && { backgroundColor: themeColors.backgroundElement }
          ]}
        >
          <Text style={[styles.tabSegmentText, { color: activeTab === 'historial' ? themeColors.text : themeColors.textSecondary, fontWeight: activeTab === 'historial' ? 'bold' : '600' }]}>
            Historial ({historyGastos.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Contents based on tab */}
      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={themeColors.accent} />
          <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.one }}>Cargando datos...</Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* REVISAR PENDIENTES */}
          {activeTab === 'pendientes' && (
            isDesktop ? (
              <ScrollView style={{ flex: 1 }}>
                <View style={{ paddingHorizontal: Spacing.three, paddingVertical: Spacing.two }}>
                  <View style={[styles.tableHeaderRow, { backgroundColor: themeColors.background, borderBottomColor: themeColors.border }]}>
                    <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '15%', fontWeight: 'bold' }]}>Categoría</Text>
                    <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '15%', fontWeight: 'bold' }]}>Empleado</Text>
                    <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '20%', fontWeight: 'bold' }]}>Proveedor / Cliente</Text>
                    <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '15%', fontWeight: 'bold' }]}>Fecha</Text>
                    <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '10%', fontWeight: 'bold' }]}>Estado</Text>
                    <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '15%', fontWeight: 'bold', textAlign: 'right' }]}>Monto</Text>
                    <View style={{ width: '10%', alignItems: 'center' }}>
                      <Ionicons name="settings-outline" size={14} color={themeColors.text} />
                    </View>
                  </View>
                  <View style={{ backgroundColor: themeColors.backgroundElement, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, borderWidth: 1, borderColor: themeColors.border, borderTopWidth: 0 }}>
                    {pendingGastos.length === 0 ? (
                      <View style={styles.emptyContainer}>
                        <Ionicons name="shield-checkmark-outline" size={48} color={themeColors.success} />
                        <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                          ¡Al corriente! No hay gastos pendientes de revisión.
                        </Text>
                      </View>
                    ) : (
                      pendingGastos.map((item) => {
                        const rawFecha = item.fecha_comprobante || item.created_at?.split('T')[0] || '';
                        let fecha = rawFecha;
                        if (rawFecha) {
                          const parts = rawFecha.split('-');
                          if (parts.length === 3) fecha = `${parts[2]}/${parts[1]}/${parts[0]}`;
                        }
                        
                        let statusText = 'PENDIENTE';
                        let statusColor: string = themeColors.warning;
                        if (item.status === 'APPROVED') { statusText = 'APROBADO'; statusColor = themeColors.success; }
                        else if (item.status === 'REJECTED') { statusText = 'RECHAZADO'; statusColor = themeColors.danger; }
                        else if (item.status === 'ACTION_REQUIRED') { statusText = 'ACCIÓN REQ.'; statusColor = themeColors.actionRequired; }
                        
                        return (
                          <Pressable
                            key={item.id}
                            onPress={() => {
                              setSelectedGasto(item);
                              setReviewModalVisible(true);
                            }}
                            style={({ hovered }: any) => [
                              styles.tableRow,
                              { borderBottomColor: themeColors.border },
                              hovered && { backgroundColor: themeColors.backgroundSelected }
                            ] as any}
                          >
                            <Text style={[styles.tableCell, { color: themeColors.text, width: '15%', fontWeight: '600' }]} numberOfLines={1}>{item.categoria}</Text>
                            <Text style={[styles.tableCell, { color: themeColors.text, width: '15%' }]} numberOfLines={1}>{item.empleado_nombre}</Text>
                            <Text style={[styles.tableCell, { width: '20%', color: themeColors.textSecondary }]} numberOfLines={1}>
                              {item.proveedor} {item.proveedor && item.cliente ? ' | ' : ''} {item.cliente}
                            </Text>
                            <Text style={[styles.tableCell, { color: themeColors.text, width: '15%' }]}>{fecha}</Text>
                            <View style={{ width: '10%' }}>
                               <View style={{ backgroundColor: statusColor + '18', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 12, alignSelf: 'flex-start' }}>
                                 <Text style={{ fontSize: 9, fontWeight: 'bold', color: statusColor }}>{statusText}</Text>
                               </View>
                            </View>
                            <Text style={[styles.tableCell, { color: themeColors.text, width: '15%', fontWeight: '700', textAlign: 'right' }]}>{formatCurrency(item.monto)}</Text>
                            <View style={{ width: '10%', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
                              <TouchableOpacity
                                onPress={(e) => {
                                  e.stopPropagation();
                                  setSelectedGasto(item);
                                  setReviewModalVisible(true);
                                }}
                                style={{ padding: 4 }}
                              >
                                <Ionicons name="eye-outline" size={16} color={themeColors.accent} />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={(e) => {
                                  e.stopPropagation();
                                  handleDeleteGasto(item.id);
                                }}
                                style={{ padding: 4 }}
                              >
                                <Ionicons name="trash-outline" size={16} color={themeColors.danger} />
                              </TouchableOpacity>
                            </View>
                          </Pressable>
                        );
                      })
                    )}
                  </View>
                </View>
              </ScrollView>
            ) : (
              <FlatList
                data={pendingGastos}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <ExpenseCard
                    gasto={item}
                    showEmployeeName
                    onPress={() => {
                      setSelectedGasto(item);
                      setReviewModalVisible(true);
                    }}
                  />
                )}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Ionicons name="shield-checkmark-outline" size={48} color={themeColors.success} />
                    <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                      ¡Al corriente! No hay gastos pendientes de revisión.
                    </Text>
                  </View>
                }
                refreshing={isLoading}
                onRefresh={refreshData}
              />
            )
          )}

          {/* HISTORIAL */}
          {activeTab === 'historial' && (
            <>
              <View style={{ flexDirection: 'row', marginHorizontal: Spacing.three, marginBottom: Spacing.two, marginTop: Spacing.one, backgroundColor: themeColors.backgroundElement, borderRadius: BorderRadius.medium, overflow: 'hidden', borderWidth: 1, borderColor: themeColors.border }}>
                <TouchableOpacity
                  onPress={() => setFacturaFilter('TODOS')}
                  style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: facturaFilter === 'TODOS' ? themeColors.accent + '20' : 'transparent' }}
                >
                  <Text style={{ fontSize: 10, fontWeight: facturaFilter === 'TODOS' ? 'bold' : '600', color: facturaFilter === 'TODOS' ? themeColors.accent : themeColors.textSecondary }}>TODOS</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setFacturaFilter('FACTURADOS')}
                  style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: facturaFilter === 'FACTURADOS' ? themeColors.accent + '20' : 'transparent', borderLeftWidth: 1, borderRightWidth: 1, borderColor: themeColors.border }}
                >
                  <Text style={{ fontSize: 10, fontWeight: facturaFilter === 'FACTURADOS' ? 'bold' : '600', color: facturaFilter === 'FACTURADOS' ? themeColors.accent : themeColors.textSecondary }}>FACTURADOS</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setFacturaFilter('PENDIENTE_ENTREGA')}
                  style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: facturaFilter === 'PENDIENTE_ENTREGA' ? themeColors.warning + '20' : 'transparent', borderRightWidth: 1, borderColor: themeColors.border }}
                >
                  <Text style={{ fontSize: 10, fontWeight: facturaFilter === 'PENDIENTE_ENTREGA' ? 'bold' : '600', color: facturaFilter === 'PENDIENTE_ENTREGA' ? themeColors.warning : themeColors.textSecondary }}>PEND. ENTREGAR</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setFacturaFilter('NO_FACTURADOS')}
                  style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: facturaFilter === 'NO_FACTURADOS' ? themeColors.danger + '20' : 'transparent' }}
                >
                  <Text style={{ fontSize: 10, fontWeight: facturaFilter === 'NO_FACTURADOS' ? 'bold' : '600', color: facturaFilter === 'NO_FACTURADOS' ? themeColors.danger : themeColors.textSecondary }}>NO FACTURADOS</Text>
                </TouchableOpacity>
              </View>
              {isDesktop ? (
                <ScrollView style={{ flex: 1 }}>
                  <View style={{ paddingHorizontal: Spacing.three, paddingVertical: Spacing.two }}>
                    <View style={[styles.tableHeaderRow, { backgroundColor: themeColors.background, borderBottomColor: themeColors.border }]}>
                      <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '15%', fontWeight: 'bold' }]}>Categoría</Text>
                      <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '15%', fontWeight: 'bold' }]}>Empleado</Text>
                      <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '20%', fontWeight: 'bold' }]}>Proveedor / Cliente</Text>
                      <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '15%', fontWeight: 'bold' }]}>Fecha</Text>
                      <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '10%', fontWeight: 'bold' }]}>Estado</Text>
                      <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '15%', fontWeight: 'bold', textAlign: 'right' }]}>Monto</Text>
                      <View style={{ width: '10%', alignItems: 'center' }}>
                        <Ionicons name="settings-outline" size={14} color={themeColors.text} />
                      </View>
                    </View>
                    <View style={{ backgroundColor: themeColors.backgroundElement, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, borderWidth: 1, borderColor: themeColors.border, borderTopWidth: 0 }}>
                    {historyGastos.length === 0 ? (
                      <View style={styles.emptyContainer}>
                        <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>No hay registros históricos.</Text>
                      </View>
                    ) : (
                      historyGastos.map((item) => {
                        const rawFecha = item.fecha_comprobante || item.created_at?.split('T')[0] || '';
                        let fecha = rawFecha;
                        if (rawFecha) {
                          const parts = rawFecha.split('-');
                          if (parts.length === 3) fecha = `${parts[2]}/${parts[1]}/${parts[0]}`;
                        }
                        
                        let statusText = 'PENDIENTE';
                        let statusColor: string = themeColors.warning;
                        if (item.status === 'APPROVED') { statusText = 'APROBADO'; statusColor = themeColors.success; }
                        else if (item.status === 'REJECTED') { statusText = 'RECHAZADO'; statusColor = themeColors.danger; }
                        else if (item.status === 'ACTION_REQUIRED') { statusText = 'ACCIÓN REQ.'; statusColor = themeColors.actionRequired; }
                        
                        return (
                          <Pressable
                            key={item.id}
                            onPress={() => {
                              setSelectedGasto(item);
                              setReviewModalVisible(true);
                            }}
                            style={({ hovered }: any) => [
                              styles.tableRow,
                              { borderBottomColor: themeColors.border },
                              hovered && { backgroundColor: themeColors.backgroundSelected }
                            ] as any}
                          >
                            <Text style={[styles.tableCell, { color: themeColors.text, width: '15%', fontWeight: '600' }]} numberOfLines={1}>{item.categoria}</Text>
                            <Text style={[styles.tableCell, { color: themeColors.text, width: '15%' }]} numberOfLines={1}>{item.empleado_nombre}</Text>
                            <Text style={[styles.tableCell, { width: '20%', color: themeColors.textSecondary }]} numberOfLines={1}>
                              {item.proveedor} {item.proveedor && item.cliente ? ' | ' : ''} {item.cliente}
                            </Text>
                            <Text style={[styles.tableCell, { color: themeColors.text, width: '15%' }]}>{fecha}</Text>
                            <View style={{ width: '10%' }}>
                               <View style={{ backgroundColor: statusColor + '18', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 12, alignSelf: 'flex-start' }}>
                                 <Text style={{ fontSize: 9, fontWeight: 'bold', color: statusColor }}>{statusText}</Text>
                               </View>
                            </View>
                            <Text style={[styles.tableCell, { width: '15%', fontWeight: '700', color: themeColors.text, textAlign: 'right' }]}>{formatCurrency(item.monto)}</Text>
                            <View style={{ width: '10%', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
                              <TouchableOpacity
                                onPress={(e) => {
                                  e.stopPropagation();
                                  setSelectedGasto(item);
                                  setReviewModalVisible(true);
                                }}
                                style={{ padding: 4 }}
                              >
                                <Ionicons name="eye-outline" size={16} color={themeColors.accent} />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={(e) => {
                                  e.stopPropagation();
                                  handleDeleteGasto(item.id);
                                }}
                                style={{ padding: 4 }}
                              >
                                <Ionicons name="trash-outline" size={16} color={themeColors.danger} />
                              </TouchableOpacity>
                            </View>
                          </Pressable>
                        );
                      })
                    )}
                    </View>
                  </View>
                </ScrollView>
              ) : (
                <FlatList
                  data={historyGastos}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={styles.listContent}
                  renderItem={({ item }) => (
                    <ExpenseCard
                      gasto={item}
                      showEmployeeName
                      onPress={() => {
                        setSelectedGasto(item);
                        setReviewModalVisible(true);
                      }}
                      onDelete={() => handleDeleteGasto(item.id)}
                    />
                  )}
                  ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                      <Ionicons name="folder-open-outline" size={48} color={themeColors.textSecondary} />
                      <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                        No hay registros históricos.
                      </Text>
                    </View>
                  }
                  refreshing={isLoading}
                  onRefresh={refreshData}
                />
              )}
            </>
          )}

        </View>
      )}



      {/* MODAL 1.5 EXTRA: GESTIÓN DE VEHÍCULOS Y BITÁCORA */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={vehiculosManagerModalVisible}
        onRequestClose={() => setVehiculosManagerModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, height: '90%', paddingBottom: Spacing.four }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Módulo de Vehículos y Gasolina</Text>
              <TouchableOpacity onPress={() => setVehiculosManagerModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: Spacing.four }} style={{ flex: 1 }}>
              {vehiculoModalVisible ? (
                /* FORMULARIO CRUD INLINE */
                <View style={{
                  marginHorizontal: Spacing.two,
                  marginTop: Spacing.two,
                  padding: Spacing.three,
                  backgroundColor: themeColors.backgroundElement,
                  borderRadius: BorderRadius.medium,
                  borderWidth: 1,
                  borderColor: themeColors.border,
                }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: themeColors.text, marginBottom: Spacing.two }}>
                    {editingVehiculo ? 'Editar Vehículo' : 'Registrar Vehículo'}
                  </Text>
                  
                  <CustomInput
                    label="Marca *"
                    placeholder="Ej. Nissan"
                    value={newVehiculoMarca}
                    onChangeText={setNewVehiculoMarca}
                  />
                  <CustomInput
                    label="Modelo *"
                    placeholder="Ej. NP300"
                    value={newVehiculoModelo}
                    onChangeText={setNewVehiculoModelo}
                  />
                  <CustomInput
                    label="Año *"
                    placeholder="Ej. 2021"
                    value={newVehiculoAnio}
                    onChangeText={setNewVehiculoAnio}
                    keyboardType="numeric"
                  />
                  <CustomInput
                    label="Placas *"
                    placeholder="Ej. AB-123-CD"
                    value={newVehiculoPlacas}
                    onChangeText={setNewVehiculoPlacas}
                    autoCapitalize="characters"
                  />
                  <CustomInput
                    label="Número Económico (Opcional)"
                    placeholder="Ej. Eco-04"
                    value={newVehiculoNumEcon}
                    onChangeText={setNewVehiculoNumEcon}
                  />

                  <View style={{ marginTop: Spacing.two, flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <CustomButton
                        title="Cancelar"
                        onPress={() => {
                          setEditingVehiculo(null);
                          setVehiculoModalVisible(false);
                        }}
                        variant="secondary"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <CustomButton
                        title={editingVehiculo ? 'Guardar Cambios' : 'Registrar Vehículo'}
                        onPress={handleSaveVehiculo}
                        loading={isSavingVehiculo}
                        variant="primary"
                      />
                    </View>
                  </View>
                </View>
              ) : (
                /* VISTAS DE LISTADO Y BITÁCORA */
                <>
                  {/* Sección: Parque Vehicular */}
                  <View style={{
                    marginHorizontal: Spacing.two,
                    marginTop: Spacing.two,
                    padding: Spacing.three,
                    backgroundColor: themeColors.backgroundElement,
                    borderRadius: BorderRadius.medium,
                    borderWidth: 1,
                    borderColor: themeColors.border,
                  }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.two }}>
                      <View>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: themeColors.text }}>Parque Vehicular</Text>
                        <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>Gestión de vehículos de la empresa</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          setEditingVehiculo(null);
                          setNewVehiculoMarca('');
                          setNewVehiculoModelo('');
                          setNewVehiculoAnio('');
                          setNewVehiculoPlacas('');
                          setNewVehiculoNumEcon('');
                          setVehiculoModalVisible(true);
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          backgroundColor: themeColors.accent,
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 15,
                          gap: 4,
                        }}
                      >
                        <Ionicons name="add" size={16} color="#ffffff" />
                        <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: 'bold' }}>Agregar Auto</Text>
                      </TouchableOpacity>
                    </View>

                    {vehiculos.length === 0 ? (
                      <Text style={{ color: themeColors.textSecondary, textAlign: 'center', marginVertical: Spacing.two }}>
                        No hay vehículos registrados.
                      </Text>
                    ) : (
                      <View style={{ gap: Spacing.one }}>
                        {vehiculos.map((veh) => (
                          <View
                            key={veh.id}
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: Spacing.two,
                              backgroundColor: themeColors.background,
                              borderRadius: BorderRadius.small,
                              borderWidth: 1,
                              borderColor: themeColors.border,
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Ionicons name="car" size={18} color={veh.activo ? themeColors.primary : themeColors.textSecondary} />
                                <Text style={{ fontWeight: 'bold', color: themeColors.text, fontSize: 14 }}>
                                  {veh.marca} {veh.modelo} ({veh.anio})
                                </Text>
                                {!veh.activo && (
                                  <View style={{ backgroundColor: themeColors.danger + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 }}>
                                    <Text style={{ fontSize: 9, color: themeColors.danger, fontWeight: 'bold' }}>INACTIVO</Text>
                                  </View>
                                )}
                              </View>
                              <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>
                                Placas: <Text style={{ fontWeight: 'bold' }}>{veh.placas}</Text> 
                                {veh.numero_economico ? ` • Eco: ${veh.numero_economico}` : ''}
                              </Text>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 10 }}>
                              <TouchableOpacity onPress={() => handleToggleVehiculoActivo(veh)} style={{ padding: 4 }}>
                                <Ionicons name={veh.activo ? "eye-outline" : "eye-off-outline"} size={18} color={veh.activo ? themeColors.success : themeColors.textSecondary} />
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => handleEditVehiculo(veh)} style={{ padding: 4 }}>
                                <Ionicons name="create-outline" size={18} color={themeColors.accent} />
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => handleDeleteVehiculo(veh.id, veh.placas)} style={{ padding: 4 }}>
                                <Ionicons name="trash-outline" size={18} color={themeColors.danger} />
                              </TouchableOpacity>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Sección: Bitácora de Combustible */}
                  <View style={{
                    marginHorizontal: Spacing.two,
                    marginTop: Spacing.three,
                    padding: Spacing.three,
                    backgroundColor: themeColors.backgroundElement,
                    borderRadius: BorderRadius.medium,
                    borderWidth: 1,
                    borderColor: themeColors.border,
                  }}>
                    <View style={{ marginBottom: Spacing.two }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                        <View>
                          <Text style={{ fontSize: 16, fontWeight: '700', color: themeColors.text }}>Bitácora de Gasolina</Text>
                          <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>Consumo e historial detallado de cargas</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TouchableOpacity
                            onPress={async () => {
                              try {
                                const companyLabel = company === 'daravisa' ? 'daravisa' : 'inttec';
                                await ReportGenerator.exportGasolinaToCSV(
                                  registrosGasolina,
                                  `reporte_gasolina_${companyLabel}_${new Date().toISOString().split('T')[0]}.csv`
                                );
                              } catch (err: any) {
                                showAlert('Error CSV', err.message);
                              }
                            }}
                            style={{
                              flexDirection: 'row', alignItems: 'center', gap: 4,
                              paddingHorizontal: 10, paddingVertical: 6,
                              backgroundColor: '#d1fae5',
                              borderRadius: 8, borderWidth: 1, borderColor: '#6ee7b7',
                            }}
                          >
                            <Ionicons name="document-text-outline" size={14} color="#059669" />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#059669' }}>CSV</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={async () => {
                              try {
                                const companyLabel = company === 'daravisa' ? 'Daravisa' : 'Inttec';
                                await ReportGenerator.exportGasolinaToPDF(
                                  registrosGasolina,
                                  `Reporte de Gasolina ${companyLabel}`
                                );
                              } catch (err: any) {
                                showAlert('Error PDF', err.message);
                              }
                            }}
                            style={{
                              flexDirection: 'row', alignItems: 'center', gap: 4,
                              paddingHorizontal: 10, paddingVertical: 6,
                              backgroundColor: '#fee2e2',
                              borderRadius: 8, borderWidth: 1, borderColor: '#fca5a5',
                            }}
                          >
                            <Ionicons name="print-outline" size={14} color="#dc2626" />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#dc2626' }}>PDF</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>

                    {registrosGasolina.length === 0 ? (
                      <Text style={{ color: themeColors.textSecondary, textAlign: 'center', marginVertical: Spacing.two }}>
                        No se han registrado consumos de gasolina.
                      </Text>
                    ) : (
                      <View style={{ gap: Spacing.two }}>
                        {registrosGasolina.map((reg) => {
                          const dateParts = reg.fecha.split('-');
                          const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : reg.fecha;
                          return (
                            <View
                              key={reg.id}
                              style={{
                                padding: Spacing.two,
                                backgroundColor: themeColors.background,
                                borderRadius: BorderRadius.small,
                                borderWidth: 1,
                                borderColor: themeColors.border,
                              }}
                            >
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: themeColors.border, paddingBottom: 6, marginBottom: 6 }}>
                                <Text style={{ fontSize: 11, fontWeight: 'bold', color: themeColors.textSecondary }}>
                                  {formattedDate}
                                </Text>
                                <Text style={{ fontSize: 13, fontWeight: 'bold', color: themeColors.success }}>
                                  ${Number(reg.costo_total).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                                </Text>
                              </View>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                                    Conductor: <Text style={{ color: themeColors.text, fontWeight: 'bold' }}>{reg.empleado_nombre || 'N/A'}</Text>
                                  </Text>
                                  <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>
                                    Vehículo: <Text style={{ color: themeColors.text, fontWeight: 'bold' }}>{reg.vehiculo_marca} {reg.vehiculo_modelo} ({reg.vehiculo_placas})</Text>
                                  </Text>
                                  <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>
                                    Carga: <Text style={{ color: themeColors.text }}>{reg.litros} Lts</Text> • Odómetro: <Text style={{ color: themeColors.text }}>{reg.kilometraje_actual} km</Text>
                                  </Text>
                                  {reg.observaciones ? (
                                    <Text style={{ fontSize: 11, color: themeColors.textSecondary, fontStyle: 'italic', marginTop: 4 }}>
                                      Obs: {reg.observaciones}
                                    </Text>
                                  ) : null}
                                </View>
                                {reg.ticket_foto_url ? (
                                  <TouchableOpacity
                                    onPress={() => {
                                      setActivePreviewUrl(reg.ticket_foto_url || null);
                                      setViewerVisible(true);
                                    }}
                                    style={{
                                      paddingHorizontal: 8,
                                      paddingVertical: 4,
                                      backgroundColor: themeColors.primary + '15',
                                      borderRadius: 8,
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      flexDirection: 'row',
                                      gap: 2,
                                    }}
                                  >
                                    <Ionicons name="image-outline" size={14} color={themeColors.primary} />
                                    <Text style={{ fontSize: 10, fontWeight: 'bold', color: themeColors.primary }}>Ver Ticket</Text>
                                  </TouchableOpacity>
                                ) : null}
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL 1 EXTRA: PERSONAL MANAGER */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={personalModalVisible}
        onRequestClose={() => setPersonalModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, height: '85%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Administración de Personal</Text>
              <TouchableOpacity onPress={() => setPersonalModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={personal}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: Spacing.seven }}
              renderItem={({ item }) => (
                <View style={[styles.userCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                  <View style={styles.userIconContainer}>
                    <Ionicons name="person" size={20} color={themeColors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.userName, { color: themeColors.text }]}>{item.nombre}</Text>
                    <Text style={[styles.userEmail, { color: themeColors.textSecondary }]}>{item.email}</Text>
                    {!!item.telefono && <Text style={[styles.userEmail, { color: themeColors.textSecondary }]}>{item.telefono}</Text>}
                  </View>
                  <View style={styles.userMetaActions}>
                    <View style={[styles.roleBadge, { backgroundColor: item.rol === 'ADMIN' ? themeColors.danger + '15' : themeColors.accent + '15' }]}>
                      <Text style={[styles.roleText, { color: item.rol === 'ADMIN' ? themeColors.danger : themeColors.accent }]}>
                        {item.rol}
                      </Text>
                    </View>
                    <View style={styles.userCardButtons}>
                      <TouchableOpacity onPress={() => handleOpenAsistencia(item)} style={styles.userRowBtn}>
                        <Ionicons name="time-outline" size={18} color={themeColors.success} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleOpenEditUser(item)} style={styles.userRowBtn}>
                        <Ionicons name="create-outline" size={18} color={themeColors.accent} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteUser(item.id, item.nombre)} style={styles.userRowBtn}>
                        <Ionicons name="trash-outline" size={18} color={themeColors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <Text style={{ color: themeColors.textSecondary, textAlign: 'center', margin: Spacing.four }}>
                  Cargando personal...
                </Text>
              }
            />

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setAddUserModalVisible(true)}
              style={[styles.fab, { backgroundColor: themeColors.accent }]}
            >
              <Ionicons name="person-add" size={24} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL 2 EXTRA: REPORTES */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={reportsModalVisible}
        onRequestClose={() => setReportsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, maxHeight: '85%', paddingBottom: Spacing.four }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Exportar Reportes</Text>
              <TouchableOpacity onPress={() => setReportsModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.reportContent}>
              {/* Tarjeta 1: Reporte de Gastos */}
              <View style={[styles.configCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, flexDirection: 'column', alignItems: 'stretch', gap: Spacing.one }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                  <Ionicons name="cash-outline" size={28} color={themeColors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.configCardTitle, { color: themeColors.text }]}>Reporte de Gastos</Text>
                    <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>
                      Consolidado de gastos registrados, estados y montos.
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: Spacing.two, marginTop: 4 }}>
                  <CustomButton title="PDF" onPress={handleExportPDF} style={{ flex: 1, height: 36 }} />
                  <CustomButton title="Excel (CSV)" onPress={handleExportCSV} variant="success" style={{ flex: 1, height: 36 }} />
                </View>
              </View>

              {/* Tarjeta 2: Reporte de Asistencia */}
              <View style={[styles.configCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, flexDirection: 'column', alignItems: 'stretch', gap: Spacing.one }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                  <Ionicons name="time-outline" size={28} color={themeColors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.configCardTitle, { color: themeColors.text }]}>Reporte de Asistencia</Text>
                    <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>
                      Entradas, salidas y ubicaciones de checado del personal.
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: Spacing.two, marginTop: 4 }}>
                  <CustomButton title="PDF" onPress={handleExportAsistenciasPDF} style={{ flex: 1, height: 36 }} loading={isFetchingAsistencias} />
                  <CustomButton title="Excel (CSV)" onPress={handleExportAsistenciasCSV} variant="success" style={{ flex: 1, height: 36 }} loading={isFetchingAsistencias} />
                </View>
              </View>

              {/* Tarjeta 3: Reporte de Inventario */}
              <View style={[styles.configCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, flexDirection: 'column', alignItems: 'stretch', gap: Spacing.one }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                  <Ionicons name="cube-outline" size={28} color={themeColors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.configCardTitle, { color: themeColors.text }]}>Reporte de Inventario</Text>
                    <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>
                      Catálogo de productos, categorías y existencias en stock.
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: Spacing.two, marginTop: 4 }}>
                  <CustomButton title="PDF" onPress={handleExportInventarioPDF} style={{ flex: 1, height: 36 }} loading={isFetchingInventario} />
                  <CustomButton title="Excel (CSV)" onPress={handleExportInventarioCSV} variant="success" style={{ flex: 1, height: 36 }} loading={isFetchingInventario} />
                </View>
              </View>

              {/* Tarjeta 4: Reporte de Consumos */}
              <View style={[styles.configCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, flexDirection: 'column', alignItems: 'stretch', gap: Spacing.one, marginTop: Spacing.two }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                  <Ionicons name="receipt-outline" size={28} color={themeColors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.configCardTitle, { color: themeColors.text }]}>Reporte de Consumos</Text>
                    <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>
                      Historial detallado de salidas y consumos de materiales.
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: Spacing.two, marginTop: 4 }}>
                  <CustomButton title="PDF" onPress={handleExportConsumosPDF} style={{ flex: 1, height: 36 }} loading={isFetchingConsumos} />
                  <CustomButton title="Excel (CSV)" onPress={handleExportConsumosCSV} variant="success" style={{ flex: 1, height: 36 }} loading={isFetchingConsumos} />
                </View>
              </View>

              {/* Tarjeta 5: Reporte de Ventas */}
              <View style={[styles.configCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, flexDirection: 'column', alignItems: 'stretch', gap: Spacing.one, marginTop: Spacing.two }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                  <Ionicons name="bar-chart-outline" size={28} color={themeColors.success} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.configCardTitle, { color: themeColors.text }]}>Reporte de Ventas</Text>
                    <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>
                      Resumen financiero de facturación, costos, utilidades y márgenes.
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: Spacing.two, marginTop: 4 }}>
                  <CustomButton title="PDF" onPress={handleExportVentasPDF} style={{ flex: 1, height: 36 }} loading={isFetchingVentas} />
                  <CustomButton title="Excel (CSV)" onPress={handleExportVentasCSV} variant="success" style={{ flex: 1, height: 36 }} loading={isFetchingVentas} />
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal de Detalle/Revisión de Gasto */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={reviewModalVisible}
        onRequestClose={() => {
          setReviewModalVisible(false);
          setSelectedGasto(null);
          setRejectionFeedback('');
          setShowFeedbackInput(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Revisión de Gasto</Text>
              <TouchableOpacity
                onPress={() => {
                  setReviewModalVisible(false);
                  setSelectedGasto(null);
                  setRejectionFeedback('');
                  setShowFeedbackInput(false);
                }}
              >
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            {selectedGasto && (
              <ScrollView contentContainerStyle={styles.modalScroll}>
                {selectedGasto.foto_url ? (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => {
                      setActivePreviewUrl(selectedGasto.foto_url!);
                      setViewerVisible(true);
                    }}
                    style={styles.modalImageContainer}
                  >
                    <Image source={{ uri: selectedGasto.foto_url }} style={styles.modalImage} resizeMode="contain" />
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.modalNoImage, { backgroundColor: themeColors.backgroundElement }]}>
                    <Ionicons name="image-outline" size={48} color={themeColors.textSecondary} />
                    <Text style={{ color: themeColors.textSecondary }}>Sin fotografía de ticket</Text>
                  </View>
                )}

                <View style={styles.modalDetails}>
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Monto</Text>
                    <Text style={[styles.detailValue, { color: themeColors.text, fontSize: 22, fontWeight: '800' }]}>
                      {formatCurrency(selectedGasto.monto)}
                    </Text>
                  </View>

                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Empleado</Text>
                    <Text style={[styles.detailValue, { color: themeColors.text, fontWeight: '700' }]}>
                      {selectedGasto.empleado_nombre || 'N/D'}
                    </Text>
                  </View>

                  {(selectedGasto.tipo_servicio_proyecto || selectedGasto.detalle_servicio_proyecto) && (
                    <View style={styles.detailItem}>
                      <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Servicio / Proyecto</Text>
                      <Text style={[styles.detailValue, { color: themeColors.text }]}>
                        {selectedGasto.tipo_servicio_proyecto ? `Tipo: ${selectedGasto.tipo_servicio_proyecto}` : ''}
                        {selectedGasto.detalle_servicio_proyecto ? `\nDetalle: ${selectedGasto.detalle_servicio_proyecto}` : ''}
                      </Text>
                    </View>
                  )}

                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Proveedor / Sucursal</Text>
                    <Text style={[styles.detailValue, { color: themeColors.text }]}>
                      {selectedGasto.proveedor || 'N/A'} {selectedGasto.sucursal ? `(Sucursal: ${selectedGasto.sucursal})` : ''}
                    </Text>
                  </View>

                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Cliente Relacionado</Text>
                    <Text style={[styles.detailValue, { color: themeColors.text }]}>
                      {selectedGasto.cliente || 'No especificado'}
                    </Text>
                  </View>

                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Fecha de Gasto</Text>
                    <Text style={[styles.detailValue, { color: themeColors.text }]}>
                      {formatFriendlyDate(selectedGasto.fecha_comprobante || selectedGasto.created_at?.split('T')[0])}
                    </Text>
                  </View>

                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Categoría / Subcategoría</Text>
                    <Text style={[styles.detailValue, { color: themeColors.text }]}>
                      {selectedGasto.categoria || 'Sin Categoría'} {selectedGasto.subcategoria ? `> ${selectedGasto.subcategoria}` : ''}
                    </Text>
                  </View>

                  {/* Parsear justificación para ver si hay alerta de IA */}
                  {(() => {
                    const parsed = parseJustificacion(selectedGasto.justificacion);
                    return (
                      <>
                        {parsed.alerta && (
                          <View style={[styles.alertBanner, { backgroundColor: themeColors.danger + '15', borderColor: themeColors.danger, marginBottom: Spacing.two }]}>
                            <Ionicons name="warning-outline" size={22} color={themeColors.danger} style={{ marginTop: 2 }} />
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.alertTitle, { color: themeColors.danger }]}>Alerta de Políticas de Gasto</Text>
                              <Text style={[styles.alertText, { color: themeColors.text }]}>{parsed.alerta}</Text>
                            </View>
                          </View>
                        )}
                        <View style={styles.detailItem}>
                          <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Pago / Comentarios</Text>
                          <Text style={[styles.detailValue, { color: themeColors.text }]}>
                            Método: {selectedGasto.metodo_pago} {selectedGasto.tipo_tarjeta ? `(${selectedGasto.tipo_tarjeta})` : ''}
                            {'\n'}Comentarios: {parsed.justificacion || 'No especificados'}
                          </Text>
                        </View>

                        {(!selectedGasto.facturado || selectedGasto.motivo_sin_factura) && (
                          <View style={[styles.detailItem, { backgroundColor: themeColors.warning + '15', padding: Spacing.two, borderRadius: BorderRadius.medium, borderLeftWidth: 4, borderLeftColor: themeColors.warning, marginVertical: Spacing.one }]}>
                            <Text style={[styles.detailLabel, { color: themeColors.warning, fontWeight: '700' }]}>⚠️ Motivo de Falta de Factura</Text>
                            <Text style={[styles.detailValue, { color: themeColors.text, fontWeight: '600', marginTop: 2 }]}>
                              {selectedGasto.motivo_sin_factura || localMotivo || 'No especificado por el empleado'}
                            </Text>
                          </View>
                        )}

                        <View style={[styles.detailItem, { marginTop: Spacing.one, borderTopWidth: 1, borderTopColor: themeColors.border, paddingTop: Spacing.two }]}>
                          <Text style={[styles.detailLabel, { color: themeColors.textSecondary, fontWeight: '700', marginBottom: Spacing.one }]}>GESTIÓN DE FACTURACIÓN (ADMIN)</Text>
                          
                          {/* Selector de Sí / No */}
                          <View style={{ flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.two }}>
                            <TouchableOpacity
                              onPress={() => handleToggleAdminFacturado(true)}
                              style={{
                                flex: 1,
                                height: 36,
                                borderRadius: BorderRadius.small,
                                borderWidth: 1,
                                borderColor: selectedGasto.facturado ? 'transparent' : themeColors.border,
                                backgroundColor: selectedGasto.facturado ? themeColors.accent : themeColors.backgroundElement,
                                justifyContent: 'center',
                                alignItems: 'center'
                              }}
                            >
                              <Text style={{ color: selectedGasto.facturado ? '#ffffff' : themeColors.text, fontWeight: '700', fontSize: 13 }}>Sí, Facturado</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleToggleAdminFacturado(false)}
                              style={{
                                flex: 1,
                                height: 36,
                                borderRadius: BorderRadius.small,
                                borderWidth: 1,
                                borderColor: !selectedGasto.facturado ? 'transparent' : themeColors.border,
                                backgroundColor: !selectedGasto.facturado ? themeColors.accent : themeColors.backgroundElement,
                                justifyContent: 'center',
                                alignItems: 'center'
                              }}
                            >
                              <Text style={{ color: !selectedGasto.facturado ? '#ffffff' : themeColors.text, fontWeight: '700', fontSize: 13 }}>No Facturado</Text>
                            </TouchableOpacity>
                          </View>

                          {/* Secciones según el toggle */}
                          {selectedGasto.facturado ? (
                            <View style={{ gap: Spacing.one }}>
                              <Text style={{ color: themeColors.textSecondary, fontSize: 12, marginBottom: 2 }}>Archivo de Factura:</Text>
                              {selectedGasto.factura_url ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                                  <TouchableOpacity
                                    style={[styles.invoiceLinkBtn, { backgroundColor: themeColors.accent + '15', flex: 1, height: 40, justifyContent: 'center', borderRadius: BorderRadius.small }]}
                                    onPress={() => {
                                      const url = selectedGasto.factura_url!;
                                      if (url.toLowerCase().includes('.pdf')) {
                                        Linking.openURL(url).catch(() => {
                                          Alert.alert('Error', 'No se pudo abrir el archivo PDF.');
                                        });
                                      } else {
                                        setActivePreviewUrl(url);
                                        setViewerVisible(true);
                                      }
                                    }}
                                  >
                                    <Ionicons name="image-outline" size={18} color={themeColors.accent} />
                                    <Text style={[styles.invoiceLinkText, { color: themeColors.accent }]}>
                                      Ver Factura Adjunta
                                    </Text>
                                  </TouchableOpacity>
                                  
                                  <TouchableOpacity
                                    style={{
                                      backgroundColor: themeColors.danger + '15',
                                      padding: Spacing.one,
                                      borderRadius: BorderRadius.small,
                                      borderWidth: 1,
                                      borderColor: themeColors.danger + '40',
                                      height: 40,
                                      justifyContent: 'center',
                                      alignItems: 'center',
                                      aspectRatio: 1
                                    }}
                                    onPress={handleDeleteAdminInvoice}
                                    disabled={isUploadingInvoice}
                                  >
                                    <Ionicons name="trash-outline" size={18} color={themeColors.danger} />
                                  </TouchableOpacity>
                                </View>
                              ) : (
                                <View style={{ gap: Spacing.one }}>
                                  <Text style={{ color: themeColors.danger, fontSize: 12, fontStyle: 'italic', marginBottom: 4 }}>⚠️ Falta factura correspondiente</Text>
                                  {isUploadingInvoice ? (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.one, padding: Spacing.one }}>
                                      <ActivityIndicator size="small" color={themeColors.accent} />
                                      <Text style={{ color: themeColors.text, fontSize: 12 }}>Subiendo archivo a Supabase...</Text>
                                    </View>
                                  ) : (
                                    <View style={{ flexDirection: 'row', gap: Spacing.one }}>
                                      <TouchableOpacity
                                        onPress={handleCaptureAdminInvoice}
                                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 38, borderRadius: BorderRadius.small, borderWidth: 1, borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement }}
                                      >
                                        <Ionicons name="camera-sharp" size={16} color={themeColors.text} />
                                        <Text style={{ color: themeColors.text, fontSize: 12, fontWeight: '600' }}>Cámara</Text>
                                      </TouchableOpacity>
                                      <TouchableOpacity
                                        onPress={handleSelectAdminInvoiceGallery}
                                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 38, borderRadius: BorderRadius.small, borderWidth: 1, borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement }}
                                      >
                                        <Ionicons name="images-sharp" size={16} color={themeColors.text} />
                                        <Text style={{ color: themeColors.text, fontSize: 12, fontWeight: '600' }}>Galería</Text>
                                      </TouchableOpacity>
                                      <TouchableOpacity
                                        onPress={handleSelectAdminInvoiceDocument}
                                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 38, borderRadius: BorderRadius.small, borderWidth: 1, borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement }}
                                      >
                                        <Ionicons name="document-text-sharp" size={16} color={themeColors.text} />
                                        <Text style={{ color: themeColors.text, fontSize: 12, fontWeight: '600' }}>PDF</Text>
                                      </TouchableOpacity>
                                    </View>
                                  )}
                                </View>
                              )}
                            </View>
                          ) : (
                            <View style={{ gap: Spacing.one }}>
                              <CustomInput
                                label="Motivo de falta de factura:"
                                placeholder="Escribe el motivo (ej. Proveedor informal)..."
                                value={localMotivo}
                                onChangeText={setLocalMotivo}
                                onBlur={() => handleUpdateAdminMotivoSinFactura(localMotivo)}
                                onEndEditing={() => handleUpdateAdminMotivoSinFactura(localMotivo)}
                                style={{ height: 40 }}
                                iconName="warning-outline"
                              />
                            </View>
                          )}
                        </View>
                      </>
                    );
                  })()}

                  {/* Acciones para gastos PENDIENTES */}
                  {selectedGasto.status === 'PENDING' && (
                    <View style={styles.reviewActions}>
                      {selectedGasto.empleado_id === adminUser?.id ? (
                        <View style={[styles.alertBanner, { backgroundColor: themeColors.warning + '15', borderColor: themeColors.warning, marginBottom: 0, padding: Spacing.two, borderRadius: BorderRadius.medium, borderWidth: 1, flexDirection: 'row', gap: Spacing.one }]}>
                          <Ionicons name="warning-outline" size={22} color={themeColors.warning} style={{ marginTop: 2 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.alertTitle, { color: themeColors.warning, fontSize: 14, fontWeight: '700', marginBottom: 2 }]}>Revisión Cruzada</Text>
                            <Text style={[styles.alertText, { color: themeColors.text, fontSize: 13 }]}>
                              No puedes revisar tus propios gastos. Este registro debe ser aprobado o rechazado por otro administrador.
                            </Text>
                          </View>
                        </View>
                      ) : !showFeedbackInput ? (
                        <>
                          <View style={styles.rowActions}>
                            <CustomButton
                              title="Aprobar"
                              onPress={handleApproveClick}
                              variant="success"
                              style={{ flex: 1 }}
                              loading={isProcessingAction}
                            />
                            <CustomButton
                              title="Rechazar"
                              onPress={() => handleUpdateStatus('REJECTED')}
                              variant="danger"
                              style={{ flex: 1 }}
                              loading={isProcessingAction}
                            />
                          </View>
                          <CustomButton
                            title="Devolver (Acción Requerida)"
                            onPress={() => setShowFeedbackInput(true)}
                            variant="secondary"
                            style={{ width: '100%', marginTop: Spacing.one }}
                            disabled={isProcessingAction}
                          />
                          <CustomButton
                            title="Editar Gasto"
                            onPress={() => {
                              setReviewModalVisible(false);
                              router.push(`/(admin)/editar-gasto?id=${selectedGasto.id}` as any);
                            }}
                            variant="primary"
                            style={{ width: '100%', marginTop: Spacing.one }}
                            disabled={isProcessingAction}
                          />
                          <CustomButton
                            title="Eliminar Gasto Permanente"
                            onPress={() => handleDeleteGasto(selectedGasto.id)}
                            variant="danger"
                            style={{ width: '100%', marginTop: Spacing.one }}
                            loading={isProcessingAction}
                            icon={<Ionicons name="trash-outline" size={20} color="#fff" style={{ marginRight: 8 }} />}
                          />
                        </>
                      ) : (
                        <View style={styles.feedbackForm}>
                          <CustomInput
                            label="Duda / Comentario para el Empleado"
                            placeholder="Escribe la información faltante requerida..."
                            value={rejectionFeedback}
                            onChangeText={setRejectionFeedback}
                            multiline
                            numberOfLines={3}
                            style={{ height: 75 }}
                          />
                          <View style={styles.rowActions}>
                            <CustomButton
                              title="Cancelar"
                              onPress={() => setShowFeedbackInput(false)}
                              variant="secondary"
                              style={{ flex: 1 }}
                            />
                            <CustomButton
                              title="Enviar Observación"
                              onPress={() => handleUpdateStatus('ACTION_REQUIRED')}
                              variant="warning"
                              style={{ flex: 1.5 }}
                              loading={isProcessingAction}
                            />
                          </View>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Detalle informativo de estado si ya fue resuelto */}
                  {selectedGasto.status !== 'PENDING' && (
                    <View style={{ gap: Spacing.two, marginTop: Spacing.two }}>
                      <View style={[styles.resolvedBadge, { backgroundColor: themeColors.backgroundSelected, marginBottom: 0 }]}>
                        <Text style={[styles.resolvedText, { color: themeColors.text, fontWeight: '700' }]}>
                          Estado de Revisión: {selectedGasto.status === 'APPROVED' ? 'Aprobado' : selectedGasto.status === 'REJECTED' ? 'Rechazado' : 'Acción Requerida'}
                        </Text>
                        {selectedGasto.rejection_feedback && (
                          <Text style={{ color: themeColors.textSecondary, fontSize: 13, marginTop: 4 }}>
                            {`Feedback enviado: "${selectedGasto.rejection_feedback}"`}
                          </Text>
                        )}
                      </View>
                      <CustomButton
                        title="Revertir a Pendiente (Revisión)"
                        onPress={() => {
                          if (Platform.OS === 'web') {
                            const confirmed = window.confirm('¿Estás seguro de que deseas regresar este gasto a la bandeja de pendientes para revisarlo nuevamente?');
                            if (confirmed) {
                              handleUpdateStatus('PENDING');
                            }
                          } else {
                            Alert.alert(
                              'Revertir Gasto',
                              '¿Estás seguro de que deseas regresar este gasto a la bandeja de pendientes para revisarlo nuevamente?',
                              [
                                { text: 'Cancelar', style: 'cancel' },
                                {
                                  text: 'Confirmar Reversión',
                                  style: 'destructive',
                                  onPress: () => handleUpdateStatus('PENDING'),
                                },
                              ]
                            );
                          }
                        }}
                        variant="secondary"
                        style={{ width: '100%', marginTop: Spacing.one }}
                        loading={isProcessingAction}
                        icon={<Ionicons name="arrow-undo-outline" size={20} color={themeColors.text} style={{ marginRight: 8 }} />}
                      />
                      {selectedGasto.status === 'ACTION_REQUIRED' && (
                        <CustomButton
                          title="Editar Gasto"
                          onPress={() => {
                            setReviewModalVisible(false);
                            router.push(`/(admin)/editar-gasto?id=${selectedGasto.id}` as any);
                          }}
                          variant="primary"
                          style={{ width: '100%', marginTop: Spacing.one }}
                          loading={isProcessingAction}
                        />
                      )}
                      <CustomButton
                        title="Eliminar Gasto Permanente"
                        onPress={() => handleDeleteGasto(selectedGasto.id)}
                        variant="danger"
                        style={{ width: '100%', marginTop: Spacing.one }}
                        loading={isProcessingAction}
                        icon={<Ionicons name="trash-outline" size={20} color="#fff" style={{ marginRight: 8 }} />}
                      />
                    </View>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* MODAL DE FILTRO DE FECHAS Y CALENDARIO */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={dateFilterModalVisible}
        onRequestClose={() => setDateFilterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, maxWidth: 450, padding: Spacing.three }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>📅 Filtrar por Fecha / Calendario</Text>
              <TouchableOpacity onPress={() => setDateFilterModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: Spacing.two, paddingVertical: Spacing.two }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.textSecondary }}>Filtros Rápidos:</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one }}>
                <TouchableOpacity
                  onPress={() => {
                    setStartDateFilter(null);
                    setEndDateFilter(null);
                    setDateFilterModalVisible(false);
                  }}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: (!startDateFilter && !endDateFilter) ? themeColors.accent : themeColors.backgroundElement, borderWidth: 1, borderColor: themeColors.border }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: (!startDateFilter && !endDateFilter) ? '#fff' : themeColors.text }}>Todas las Fechas</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    const todayStr = new Date().toISOString().split('T')[0];
                    setStartDateFilter(todayStr);
                    setEndDateFilter(todayStr);
                    setDateFilterModalVisible(false);
                  }}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: (startDateFilter === new Date().toISOString().split('T')[0] && endDateFilter === new Date().toISOString().split('T')[0]) ? themeColors.accent : themeColors.backgroundElement, borderWidth: 1, borderColor: themeColors.border }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: (startDateFilter === new Date().toISOString().split('T')[0] && endDateFilter === new Date().toISOString().split('T')[0]) ? '#fff' : themeColors.text }}>Hoy</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    const now = new Date();
                    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
                    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
                    setStartDateFilter(firstDay);
                    setEndDateFilter(lastDay);
                    setDateFilterModalVisible(false);
                  }}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: themeColors.backgroundElement, borderWidth: 1, borderColor: themeColors.border }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.text }}>Este Mes</Text>
                </TouchableOpacity>
              </View>

              <View style={{ borderTopWidth: 1, borderTopColor: themeColors.border, paddingTop: Spacing.two, marginTop: Spacing.one }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text, marginBottom: 8 }}>Día Único o Rango Personalizado:</Text>
                <CustomInput
                  label="Fecha Inicio (DD/MM/AAAA) ó Día Único *"
                  placeholder="Ej. 20/07/2026"
                  value={tempStartDate}
                  onChangeText={setTempStartDate}
                  iconName="calendar-outline"
                />
                <CustomInput
                  label="Fecha Fin (Opcional - DD/MM/AAAA)"
                  placeholder="Ej. 25/07/2026"
                  value={tempEndDate}
                  onChangeText={setTempEndDate}
                  iconName="calendar-outline"
                />
              </View>

              <View style={{ flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two }}>
                <View style={{ flex: 1 }}>
                  <CustomButton
                    title="Limpiar"
                    onPress={() => {
                      setTempStartDate('');
                      setTempEndDate('');
                      setStartDateFilter(null);
                      setEndDateFilter(null);
                      setDateFilterModalVisible(false);
                    }}
                    variant="secondary"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <CustomButton
                    title="Aplicar Fechas"
                    onPress={() => {
                      const convertToDb = (str: string) => {
                        if (!str.trim()) return null;
                        const parts = str.trim().split('/');
                        if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
                        return str.trim();
                      };
                      const s = convertToDb(tempStartDate);
                      const e = convertToDb(tempEndDate) || s;
                      setStartDateFilter(s);
                      setEndDateFilter(e);
                      setDateFilterModalVisible(false);
                    }}
                    variant="primary"
                  />
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal de Vinculación a Ventas al Aprobar */}
      <Modal
        visible={isLinkSaleModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsLinkSaleModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, height: '80%', paddingBottom: Spacing.four }]}>
            {/* Header del Modal */}
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border, borderBottomWidth: 1, paddingBottom: Spacing.two }]}>
               <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.one }}>
                 {isQuickSaleFormVisible && (
                   <TouchableOpacity onPress={() => setIsQuickSaleFormVisible(false)} style={{ marginRight: 4 }}>
                     <Ionicons name="arrow-back" size={24} color={themeColors.text} />
                   </TouchableOpacity>
                 )}
                 <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                   {isQuickSaleFormVisible ? 'Crear Venta Rápida' : '¿Vincular Gasto a Venta?'}
                 </Text>
               </View>
               <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                 {!isQuickSaleFormVisible && (
                   <TouchableOpacity onPress={handleOpenQuickSaleForm} style={{ padding: 4 }}>
                     <Ionicons name="add-circle" size={28} color={themeColors.success} />
                   </TouchableOpacity>
                 )}
                 <TouchableOpacity onPress={() => setIsLinkSaleModalVisible(false)} style={{ padding: 4 }}>
                   <Ionicons name="close" size={24} color={themeColors.text} />
                 </TouchableOpacity>
               </View>
            </View>

            {!isQuickSaleFormVisible ? (
              <>
                {/* Buscador de Ventas */}
                <View style={{ paddingTop: Spacing.two, marginBottom: Spacing.two }}>
                  <CustomInput
                    placeholder="Buscar por cliente, factura o tipo..."
                    value={linkSaleSearch}
                    onChangeText={setLinkSaleSearch}
                    iconName="search-outline"
                  />
                </View>

                {/* Lista de Ventas */}
                <View style={{ flex: 1, marginBottom: Spacing.two }}>
                  {isLoadingSalesForLinking ? (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                      <ActivityIndicator size="large" color={themeColors.accent} />
                      <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.one }}>Cargando ventas...</Text>
                    </View>
                  ) : filteredSalesForLinking.length === 0 ? (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.one }}>
                      <Ionicons name="alert-circle-outline" size={40} color={themeColors.textSecondary} />
                      <Text style={{ color: themeColors.textSecondary, textAlign: 'center', fontSize: 13 }}>
                        No se encontraron ventas para asociar.
                      </Text>
                    </View>
                  ) : (
                    <FlatList
                      data={filteredSalesForLinking}
                      keyExtractor={(item) => item.id}
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={{ gap: Spacing.two }}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          onPress={() => {
                            setIsLinkSaleModalVisible(false);
                            executeApproveGasto(item.id);
                          }}
                          style={[
                            styles.linkSaleItem,
                            {
                              backgroundColor: themeColors.backgroundElement,
                              borderColor: themeColors.border,
                            },
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: themeColors.text, fontWeight: '700', fontSize: 14 }}>
                              {item.cliente}
                            </Text>
                            <Text style={{ color: themeColors.textSecondary, fontSize: 12, marginTop: 2 }}>
                              {item.fecha} {item.tipo_proyecto ? `| ${item.tipo_proyecto}` : ''}
                            </Text>
                            {item.factura_referencia ? (
                              <Text style={{ color: themeColors.textSecondary, fontSize: 11, marginTop: 1 }}>
                                Factura: {item.factura_referencia}
                              </Text>
                            ) : null}
                          </View>
                          <Text style={{ color: themeColors.accent, fontWeight: '800', fontSize: 14, alignSelf: 'center' }}>
                            {formatCurrency(item.precio_total_facturado)}
                          </Text>
                        </TouchableOpacity>
                      )}
                    />
                  )}
                </View>

                {/* Footer con opciones */}
                <View style={{ gap: Spacing.two, paddingTop: Spacing.two, borderTopWidth: 1, borderTopColor: themeColors.border }}>
                  <CustomButton
                    title="Aprobar sin vincular"
                    onPress={() => {
                      setIsLinkSaleModalVisible(false);
                      executeApproveGasto(null);
                    }}
                    variant="primary"
                    style={{ width: '100%' }}
                  />
                  <CustomButton
                    title="Cancelar"
                    onPress={() => setIsLinkSaleModalVisible(false)}
                    variant="secondary"
                    style={{ width: '100%' }}
                  />
                </View>
              </>
            ) : (
              // Formulario de Venta Rápida
              <View style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={{ paddingBottom: Spacing.four }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  {/* Fecha */}
                  <CustomInput
                    label="Fecha (AAAA-MM-DD) *"
                    placeholder="2026-07-06"
                    value={quickSaleFecha}
                    onChangeText={setQuickSaleFecha}
                    iconName="calendar-outline"
                  />

                  {/* Input Cliente con Autocompletado */}
                  <View style={{ zIndex: 10, position: 'relative', marginBottom: Spacing.two }}>
                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary, marginBottom: 4 }]}>Cliente *</Text>
                    <CustomInput
                      placeholder="Nombre del cliente..."
                      value={quickSaleCliente}
                      onChangeText={(val) => {
                        setQuickSaleCliente(val);
                        setQuickSaleCliSearch(val);
                        setShowQuickSaleCliDropdown(true);
                      }}
                      onFocus={() => setShowQuickSaleCliDropdown(true)}
                    />
                    {showQuickSaleCliDropdown && filteredClientsForQuickSale.length > 0 && (
                      <View style={[styles.quickDropdown, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                        <ScrollView style={{ maxHeight: 150 }} keyboardShouldPersistTaps="handled">
                          {filteredClientsForQuickSale.map((c) => (
                            <TouchableOpacity
                              key={c.id}
                              onPress={() => {
                                setQuickSaleCliente(c.nombre);
                                setShowQuickSaleCliDropdown(false);
                              }}
                              style={[styles.quickDropdownItem, { borderBottomColor: themeColors.border }]}
                            >
                              <Text style={{ color: themeColors.text }}>{c.nombre}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>

                  {/* Factura Referencia */}
                  <CustomInput
                    label="Factura / Referencia (Opcional)"
                    placeholder="F-12345"
                    value={quickSaleFactura}
                    onChangeText={setQuickSaleFactura}
                    iconName="document-text-outline"
                  />

                  {/* Tipo de Proyecto Selector */}
                  <View style={{ zIndex: 9, position: 'relative' }}>
                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary, marginBottom: 4 }]}>Tipo de Proyecto</Text>
                    <TouchableOpacity
                      onPress={() => setShowQuickSaleTipoDropdown(!showQuickSaleTipoDropdown)}
                      style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                    >
                      <Text style={{ color: quickSaleTipoProyecto ? themeColors.text : themeColors.textSecondary }}>
                        {quickSaleTipoProyecto || 'Selecciona un tipo...'}
                      </Text>
                      <Ionicons name="chevron-down" size={18} color={themeColors.textSecondary} />
                    </TouchableOpacity>
                    {showQuickSaleTipoDropdown && (
                      <View style={[styles.quickDropdown, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                        {TIPOS_PROYECTO.map((tipo) => (
                          <TouchableOpacity
                            key={tipo}
                            onPress={() => {
                              setQuickSaleTipoProyecto(tipo);
                              setShowQuickSaleTipoDropdown(false);
                            }}
                            style={[styles.quickDropdownItem, { borderBottomColor: themeColors.border }]}
                          >
                            <Text style={{ color: themeColors.text }}>{tipo}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Sucursal */}
                  <CustomInput
                    label="Sucursal (Opcional)"
                    placeholder="Ej. Centro, Norte o sucursal relacionada..."
                    value={quickSaleProveedor}
                    onChangeText={setQuickSaleProveedor}
                    iconName="location-outline"
                    style={{ marginTop: Spacing.two }}
                  />

                  {/* Notas */}
                  <CustomInput
                    label="Notas / Observaciones"
                    placeholder="Detalles de la venta..."
                    value={quickSaleNotas}
                    onChangeText={setQuickSaleNotas}
                    multiline
                    numberOfLines={2}
                    iconName="create-outline"
                  />

                  {/* Partidas de Venta */}
                  <View style={{ marginTop: Spacing.three }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.one }}>
                      <Text style={{ color: themeColors.text, fontWeight: '700', fontSize: 16 }}>Partidas desglosadas</Text>
                      <TouchableOpacity onPress={addQuickSalePartida} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="add-circle-outline" size={18} color={themeColors.accent} />
                        <Text style={{ color: themeColors.accent, fontWeight: '600', fontSize: 13 }}>Agregar Partida</Text>
                      </TouchableOpacity>
                    </View>

                    {quickSalePartidas.map((partida, index) => (
                      <View
                        key={partida.id}
                        style={[
                          styles.partidaCard,
                          {
                            backgroundColor: themeColors.backgroundElement + '50',
                            borderColor: themeColors.border,
                            padding: Spacing.two,
                            borderRadius: BorderRadius.medium,
                            borderWidth: 1,
                            marginBottom: Spacing.two,
                          },
                        ]}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.one }}>
                          <Text style={{ color: themeColors.textSecondary, fontWeight: '600', fontSize: 12 }}>Partida #{index + 1}</Text>
                          {quickSalePartidas.length > 1 && (
                            <TouchableOpacity onPress={() => removeQuickSalePartida(partida.id)}>
                              <Ionicons name="trash-outline" size={16} color={themeColors.danger} />
                            </TouchableOpacity>
                          )}
                        </View>

                        <CustomInput
                          placeholder="Descripción del producto o servicio..."
                          value={partida.descripcion}
                          onChangeText={(val) => updateQuickSalePartida(partida.id, 'descripcion', val)}
                        />

                        <View style={{ flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one }}>
                          <View style={{ flex: 1 }}>
                            <CustomInput
                              label="Cant."
                              placeholder="1"
                              keyboardType="numeric"
                              value={partida.cantidad}
                              onChangeText={(val) => updateQuickSalePartida(partida.id, 'cantidad', val)}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <CustomInput
                              label="Unidad"
                              placeholder="PZA"
                              value={partida.unidad}
                              onChangeText={(val) => updateQuickSalePartida(partida.id, 'unidad', val)}
                            />
                          </View>
                          <View style={{ flex: 1.5 }}>
                            <CustomInput
                              label="Costo Prov ($)"
                              placeholder="0.00"
                              keyboardType="numeric"
                              value={partida.costo_unitario_proveedor}
                              onChangeText={(val) => updateQuickSalePartida(partida.id, 'costo_unitario_proveedor', val)}
                            />
                          </View>
                          <View style={{ flex: 1.5 }}>
                            <CustomInput
                              label="Precio Venta ($)"
                              placeholder="0.00"
                              keyboardType="numeric"
                              value={partida.precio_unitario_venta}
                              onChangeText={(val) => updateQuickSalePartida(partida.id, 'precio_unitario_venta', val)}
                            />
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>

                  {/* Resumen Financiero Rápido */}
                  <View
                    style={[
                      styles.financialSummary,
                      {
                        backgroundColor: themeColors.backgroundSelected,
                        borderRadius: BorderRadius.medium,
                        padding: Spacing.two,
                        marginTop: Spacing.two,
                      },
                    ]}
                  >
                    <Text style={{ color: themeColors.text, fontWeight: '700', fontSize: 14, marginBottom: Spacing.one }}>
                      Resumen Financiero de la Venta
                    </Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>Costo Proveedor Total:</Text>
                      <Text style={{ color: themeColors.text, fontWeight: '600', fontSize: 13 }}>{formatCurrency(quickSaleTotals.costoTotal)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>Precio de Venta Total:</Text>
                      <Text style={{ color: themeColors.accent, fontWeight: '700', fontSize: 13 }}>{formatCurrency(quickSaleTotals.precioTotal)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>Utilidad Bruta:</Text>
                      <Text style={{ color: quickSaleTotals.utilidad >= 0 ? themeColors.success : themeColors.danger, fontWeight: '700', fontSize: 13 }}>
                        {formatCurrency(quickSaleTotals.utilidad)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>Margen de Utilidad:</Text>
                      <Text style={{ color: quickSaleTotals.utilidad >= 0 ? themeColors.success : themeColors.danger, fontWeight: '700', fontSize: 13 }}>
                        {Math.round(quickSaleTotals.margen * 10000) / 100}%
                      </Text>
                    </View>
                  </View>
                </ScrollView>

                {/* Footer de Venta Rápida */}
                <View style={{ gap: Spacing.one, paddingTop: Spacing.two, borderTopWidth: 1, borderTopColor: themeColors.border }}>
                  <CustomButton
                    title="Crear y Vincular Venta"
                    onPress={handleSaveQuickSale}
                    variant="success"
                    loading={isSavingQuickSale}
                    style={{ width: '100%' }}
                  />
                  <CustomButton
                    title="Volver al buscador"
                    onPress={() => setIsQuickSaleFormVisible(false)}
                    variant="secondary"
                    style={{ width: '100%' }}
                    disabled={isSavingQuickSale}
                  />
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal 1.1: Registro de Nuevo Usuario */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={addUserModalVisible}
        onRequestClose={() => setAddUserModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, height: '75%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Registrar Personal</Text>
              <TouchableOpacity onPress={() => setAddUserModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: Spacing.four }} keyboardShouldPersistTaps="handled">
              <CustomInput
                label="Nombre Completo *"
                placeholder="Nombre y Apellidos"
                value={newUserName}
                onChangeText={setNewUserName}
                iconName="person-outline"
              />

              <CustomInput
                label="Correo Electrónico *"
                placeholder={`correo@${company === 'daravisa' ? 'daravisa' : 'inttec'}.com`}
                keyboardType="email-address"
                autoCapitalize="none"
                value={newUserEmail}
                onChangeText={setNewUserEmail}
                iconName="mail-outline"
              />

              <CustomInput
                label="Contraseña *"
                placeholder="Ingresar contraseña inicial"
                secureTextEntry
                isPassword
                value={newUserPassword}
                onChangeText={setNewUserPassword}
                iconName="lock-closed-outline"
              />

              <CustomInput
                label="Teléfono"
                placeholder="10 dígitos"
                keyboardType="phone-pad"
                value={newUserPhone}
                onChangeText={setNewUserPhone}
                iconName="call-outline"
              />

              <View style={styles.selectorGroup}>
                <Text style={[styles.selectorLabel, { color: themeColors.text }]}>Rol Organizacional *</Text>
                <View style={styles.paymentSelector}>
                  {(['EMPLEADO', 'ADMIN'] as const).map((role) => {
                    const isActive = newUserRole === role;
                    return (
                      <TouchableOpacity
                        key={role}
                        onPress={() => setNewUserRole(role)}
                        style={[
                          styles.paymentOption,
                          {
                            backgroundColor: isActive ? themeColors.accent : themeColors.backgroundElement,
                            borderColor: isActive ? 'transparent' : themeColors.border,
                            width: '48%',
                            alignItems: 'center',
                          },
                        ]}
                      >
                        <Text style={[styles.paymentOptionText, { color: isActive ? '#ffffff' : themeColors.text }]}>
                          {role}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <CustomButton
                title="Registrar"
                onPress={handleAddUser}
                loading={isAddingUser}
                style={{ marginTop: Spacing.three }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal 1.2: Edición de Usuario Existente */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={editUserModalVisible}
        onRequestClose={() => {
          setEditUserModalVisible(false);
          setEditingUser(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, height: '75%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Editar Personal</Text>
              <TouchableOpacity
                onPress={() => {
                  setEditUserModalVisible(false);
                  setEditingUser(null);
                }}
              >
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: Spacing.four }} keyboardShouldPersistTaps="handled">
              <CustomInput
                label="Nombre Completo *"
                placeholder="Nombre y Apellidos"
                value={editUserName}
                onChangeText={setEditUserName}
                iconName="person-outline"
              />

              <CustomInput
                label="Correo Electrónico *"
                placeholder={`correo@${company === 'daravisa' ? 'daravisa' : 'inttec'}.com`}
                keyboardType="email-address"
                autoCapitalize="none"
                value={editUserEmail}
                onChangeText={setEditUserEmail}
                iconName="mail-outline"
              />

              <CustomInput
                label="Nueva Contraseña (Opcional)"
                placeholder="Dejar en blanco para conservar actual"
                secureTextEntry
                isPassword
                value={editUserPassword}
                onChangeText={setEditUserPassword}
                iconName="lock-closed-outline"
              />

              <CustomInput
                label="Teléfono"
                placeholder="10 dígitos"
                keyboardType="phone-pad"
                value={editUserPhone}
                onChangeText={setEditUserPhone}
                iconName="call-outline"
              />

              <View style={styles.selectorGroup}>
                <Text style={[styles.selectorLabel, { color: themeColors.text }]}>Rol Organizacional *</Text>
                <View style={styles.paymentSelector}>
                  {(['EMPLEADO', 'ADMIN'] as const).map((role) => {
                    const isActive = editUserRole === role;
                    return (
                      <TouchableOpacity
                        key={role}
                        onPress={() => setEditUserRole(role)}
                        style={[
                          styles.paymentOption,
                          {
                            backgroundColor: isActive ? themeColors.accent : themeColors.backgroundElement,
                            borderColor: isActive ? 'transparent' : themeColors.border,
                            width: '48%',
                            alignItems: 'center',
                          },
                        ]}
                      >
                        <Text style={[styles.paymentOptionText, { color: isActive ? '#ffffff' : themeColors.text }]}>
                          {role}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <CustomButton
                title="Guardar Cambios"
                onPress={handleUpdateUser}
                loading={isUpdatingUser}
                style={{ marginTop: Spacing.three }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal de Mi Perfil (Admin) */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={profileModalVisible}
        onRequestClose={() => setProfileModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Mi Perfil</Text>
              <TouchableOpacity
                onPress={() => {
                  setProfileModalVisible(false);
                  setProfilePassword('');
                }}
              >
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <View style={styles.modalDetails}>
                <CustomInput
                  label="Nombre Completo"
                  value={adminUser?.nombre || ''}
                  editable={false}
                  style={{ opacity: 0.7 }}
                />
                
                <CustomInput
                  label="Correo Electrónico"
                  value={adminUser?.email || ''}
                  editable={false}
                  autoCapitalize="none"
                  style={{ opacity: 0.7 }}
                />

                <CustomInput
                  label="Rol"
                  value={adminUser?.rol || ''}
                  editable={false}
                  style={{ opacity: 0.7 }}
                />

                <CustomInput
                  label="Teléfono"
                  placeholder="Ej. 5512345678"
                  value={profilePhone}
                  onChangeText={setProfilePhone}
                  keyboardType="phone-pad"
                />

                <CustomInput
                  label="Nueva Contraseña (Opcional)"
                  placeholder="Dejar en blanco para no cambiar"
                  value={profilePassword}
                  onChangeText={setProfilePassword}
                  isPassword
                  autoCapitalize="none"
                />

                <View style={{ marginTop: Spacing.two }}>
                  <CustomButton
                    title="Guardar Cambios"
                    onPress={handleSaveProfile}
                    loading={isSavingProfile}
                    variant="primary"
                  />
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ImageViewerModal
        visible={viewerVisible}
        imageUrl={activePreviewUrl}
        onClose={() => {
          setViewerVisible(false);
          setActivePreviewUrl(null);
        }}
      />

      {/* ========== MODAL: Historial de Asistencia ========== */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={asistenciaModalVisible}
        onRequestClose={() => {
          setAsistenciaModalVisible(false);
          setAsistenciaEmpleado(null);
          setAsistencias([]);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, height: '85%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Historial de Asistencia</Text>
                {asistenciaEmpleado && (
                  <Text style={{ color: themeColors.textSecondary, fontSize: 13, marginTop: 2 }}>
                    {asistenciaEmpleado.nombre}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => {
                setAsistenciaModalVisible(false);
                setAsistenciaEmpleado(null);
                setAsistencias([]);
              }}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            {isLoadingAsistencias ? (
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color={themeColors.accent} />
                <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.one }}>Cargando historial...</Text>
              </View>
            ) : (
              <FlatList
                data={asistencias}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingBottom: Spacing.seven }}
                renderItem={({ item }) => (
                  <View style={[styles.asistenciaCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                    <Text style={[styles.asistenciaFecha, { color: themeColors.text }]}>
                      📅 {formatAsistenciaFecha(item.fecha)}
                    </Text>
                    <View style={styles.asistenciaRow}>
                      {/* Entrada */}
                      <View style={styles.asistenciaBlock}>
                        <Text style={[styles.asistenciaBlockLabel, { color: themeColors.success }]}>📥 Entrada</Text>
                        {item.foto_entrada_url ? (
                          <TouchableOpacity
                            style={styles.asistenciaThumb}
                            activeOpacity={0.8}
                            onPress={() => {
                              setAsistenciaPreviewUrl(item.foto_entrada_url!);
                              setSelectedAsistenciaInfo({
                                fecha: item.fecha,
                                hora: item.hora_entrada!,
                                direccion: item.direccion_entrada || 'Dirección no registrada',
                                lat: Number(item.latitud_entrada),
                                lng: Number(item.longitud_entrada),
                                empleadoNombre: asistenciaEmpleado?.nombre || 'Empleado',
                                tipo: 'Entrada',
                              });
                              setAsistenciaViewerVisible(true);
                            }}
                          >
                            <Image source={{ uri: item.foto_entrada_url }} style={styles.asistenciaThumbImg} resizeMode="cover" />
                          </TouchableOpacity>
                        ) : (
                          <View style={[styles.asistenciaNoImg, { backgroundColor: themeColors.backgroundSelected }]}>
                            <Ionicons name="image-outline" size={24} color={themeColors.textSecondary} />
                          </View>
                        )}
                        <Text style={[styles.asistenciaHora, { color: themeColors.text }]}>
                          {item.hora_entrada?.substring(0, 5) || '--:--'}
                        </Text>
                        {item.direccion_entrada ? (
                          <TouchableOpacity
                            onPress={() => handleOpenMap(Number(item.latitud_entrada), Number(item.longitud_entrada))}
                            activeOpacity={0.7}
                            style={{ width: '100%' }}
                          >
                            <Text style={[styles.asistenciaAddress, { color: themeColors.textSecondary }]} numberOfLines={3}>
                              🏠 {item.direccion_entrada}
                            </Text>
                          </TouchableOpacity>
                        ) : item.latitud_entrada != null && (
                          <TouchableOpacity
                            onPress={() => handleOpenMap(Number(item.latitud_entrada), Number(item.longitud_entrada))}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.asistenciaCoords, { color: themeColors.textSecondary }]}>
                              📍 {Number(item.latitud_entrada).toFixed(4)}, {Number(item.longitud_entrada).toFixed(4)}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* Salida */}
                      <View style={styles.asistenciaBlock}>
                        <Text style={[styles.asistenciaBlockLabel, { color: item.hora_salida ? themeColors.accent : themeColors.warning }]}>
                          📤 Salida
                        </Text>
                        {item.foto_salida_url ? (
                          <TouchableOpacity
                            style={styles.asistenciaThumb}
                            activeOpacity={0.8}
                            onPress={() => {
                              setAsistenciaPreviewUrl(item.foto_salida_url!);
                              setSelectedAsistenciaInfo({
                                fecha: item.fecha,
                                hora: item.hora_salida!,
                                direccion: item.direccion_salida || 'Dirección no registrada',
                                lat: Number(item.latitud_salida),
                                lng: Number(item.longitud_salida),
                                empleadoNombre: asistenciaEmpleado?.nombre || 'Empleado',
                                tipo: 'Salida',
                              });
                              setAsistenciaViewerVisible(true);
                            }}
                          >
                            <Image source={{ uri: item.foto_salida_url }} style={styles.asistenciaThumbImg} resizeMode="cover" />
                          </TouchableOpacity>
                        ) : (
                          <View style={[styles.asistenciaNoImg, { backgroundColor: themeColors.backgroundSelected }]}>
                            <Ionicons name={item.hora_salida ? 'image-outline' : 'hourglass-outline'} size={24} color={themeColors.textSecondary} />
                            {!item.hora_salida && (
                              <Text style={{ fontSize: 9, color: themeColors.warning, fontWeight: '700', marginTop: 2 }}>Pendiente</Text>
                            )}
                          </View>
                        )}
                        <Text style={[styles.asistenciaHora, { color: item.hora_salida ? themeColors.text : themeColors.warning }]}>
                          {item.hora_salida?.substring(0, 5) || 'Pendiente'}
                        </Text>
                        {item.direccion_salida ? (
                          <TouchableOpacity
                            onPress={() => handleOpenMap(Number(item.latitud_salida), Number(item.longitud_salida))}
                            activeOpacity={0.7}
                            style={{ width: '100%' }}
                          >
                            <Text style={[styles.asistenciaAddress, { color: themeColors.textSecondary }]} numberOfLines={3}>
                              🏠 {item.direccion_salida}
                            </Text>
                          </TouchableOpacity>
                        ) : item.latitud_salida != null && (
                          <TouchableOpacity
                            onPress={() => handleOpenMap(Number(item.latitud_salida), Number(item.longitud_salida))}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.asistenciaCoords, { color: themeColors.textSecondary }]}>
                              📍 {Number(item.latitud_salida).toFixed(4)}, {Number(item.longitud_salida).toFixed(4)}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Ionicons name="calendar-outline" size={48} color={themeColors.textSecondary} />
                    <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                      No hay registros de asistencia para este empleado.
                    </Text>
                  </View>
                }
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Image Viewer for Attendance Photos */}
      <ImageViewerModal
        visible={asistenciaViewerVisible}
        imageUrl={asistenciaPreviewUrl}
        asistenciaInfo={selectedAsistenciaInfo}
        onClose={() => {
          setAsistenciaViewerVisible(false);
          setAsistenciaPreviewUrl(null);
          setSelectedAsistenciaInfo(null);
        }}
      />
      {/* Floating Action Button for Ventas */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => router.push('/(admin)/ventas' as any)}
        style={[styles.fab, { backgroundColor: themeColors.success, bottom: Spacing.four }]}
      >
        <Ionicons name="receipt" size={24} color="#ffffff" />
      </TouchableOpacity>
      {/* Floating Action Button for Auditoría de Tarjeta */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => router.push('/(admin)/auditoria-tarjeta' as any)}
        style={[styles.fab, { backgroundColor: '#7b1fa2', bottom: Spacing.four + 72 }]}
      >
        <Ionicons name="card" size={24} color="#ffffff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scanFeedbackSuccess: {
    color: '#059669',
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
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.medium,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  summaryCard: {
    flex: 1,
    padding: Spacing.three,
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },
  tabsSegmentedContainer: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: BorderRadius.large,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.three,
  },
  tabSegment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: BorderRadius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabSegmentText: {
    fontSize: 13,
  },
  listContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.seven,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.seven,
    gap: Spacing.two,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    marginBottom: Spacing.two,
    gap: Spacing.two,
  },
  userIconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.medium,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#00000010',
  },
  userName: {
    fontSize: 15,
    fontWeight: '700',
  },
  userEmail: {
    fontSize: 12,
  },
  userMetaActions: {
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
  userCardButtons: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  userRowBtn: {
    padding: 6,
    borderRadius: BorderRadius.small,
    backgroundColor: '#00000008',
  },
  roleBadge: {
    paddingHorizontal: Spacing.one,
    paddingVertical: 3,
    borderRadius: BorderRadius.small,
  },
  roleText: {
    fontSize: 9,
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    bottom: Spacing.four,
    right: Spacing.four,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  reportContent: {
    gap: Spacing.three,
  },
  configCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    gap: Spacing.two,
  },
  configCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  exportBtn: {
    width: 85,
    height: 40,
    paddingHorizontal: Spacing.one,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: BorderRadius.large,
    borderTopRightRadius: BorderRadius.large,
    height: '85%',
    padding: Spacing.four,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  modalScroll: {
    paddingBottom: Spacing.five,
  },
  modalImageContainer: {
    width: '100%',
    height: 250,
    borderRadius: BorderRadius.medium,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginBottom: Spacing.three,
  },
  modalImage: {
    width: '100%',
    height: '100%',
  },
  modalNoImage: {
    width: '100%',
    height: 150,
    borderRadius: BorderRadius.medium,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.three,
    gap: Spacing.one,
  },
  modalDetails: {
    gap: Spacing.three,
  },
  detailItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: Spacing.one,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 2,
  },
  reviewActions: {
    marginTop: Spacing.two,
  },
  rowActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  feedbackForm: {
    gap: Spacing.two,
  },
  resolvedBadge: {
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    marginTop: Spacing.one,
  },
  resolvedText: {
    fontSize: 14,
    fontWeight: '700',
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
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  paymentOption: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
  },
  paymentOptionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  quickActionsContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    gap: Spacing.one,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  quickActionIconBg: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.small,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  quickActionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
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
  invoiceLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.two,
    borderRadius: BorderRadius.small,
    gap: Spacing.one,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  invoiceLinkText: {
    fontSize: 14,
    fontWeight: '700',
  },
  // --- Asistencia Styles ---
  asistenciaCard: {
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    padding: Spacing.three,
    marginBottom: Spacing.two,
  },
  asistenciaFecha: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: Spacing.two,
  },
  asistenciaRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  asistenciaBlock: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
  },
  asistenciaBlockLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  asistenciaThumb: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: BorderRadius.medium,
    overflow: 'hidden',
  },
  asistenciaThumbImg: {
    width: '100%',
    height: '100%',
  },
  asistenciaNoImg: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: BorderRadius.medium,
    justifyContent: 'center',
    alignItems: 'center',
  },
  asistenciaHora: {
    fontSize: 16,
    fontWeight: '700',
  },
  asistenciaCoords: {
    fontSize: 10,
    fontWeight: '500',
  },
  asistenciaAddress: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 13,
    paddingHorizontal: 2,
  },
  linkSaleItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.two,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
  quickDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 999,
  },
  quickDropdownItem: {
    padding: Spacing.two,
    borderBottomWidth: 1,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 48,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    paddingHorizontal: Spacing.two,
    marginBottom: Spacing.two,
  },
  partidaCard: {
    marginBottom: Spacing.two,
  },
  financialSummary: {
    marginTop: Spacing.two,
  },
});
