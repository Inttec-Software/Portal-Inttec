import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Dimensions,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { supabase, Gasto, AuthService, Usuario, Asistencia, AsistenciaService } from '@/services/supabase';
import { SyncService, OfflineGastoItem } from '@/services/sync';
import ExpenseCard from '@/components/ExpenseCard';
import CustomButton from '@/components/CustomButton';
import CustomInput from '@/components/CustomInput';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import ImageViewerModal from '@/components/ImageViewerModal';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function EmpleadoDashboard() {
  const router = useRouter();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [user, setUser] = useState<Usuario | null>(null);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [offlineGastos, setOfflineGastos] = useState<OfflineGastoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pendientes' | 'historial'>('pendientes');
  const [isSyncing, setIsSyncing] = useState(false);

  // Modal de Detalles
  const [selectedGasto, setSelectedGasto] = useState<(Gasto & { isOffline?: boolean }) | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);
  
  // Feedback para Action Required
  const [repondFeedback, setRespondFeedback] = useState('');
  const [isSubmittingResponse, setIsSubmittingResponse] = useState(false);

  // Modal de Perfil
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [profilePhone, setProfilePhone] = useState('');
  const [profilePassword, setProfilePassword] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // --- Auto-Checador ---
  const [checadorInstructionVisible, setChecadorInstructionVisible] = useState(false);
  const [checadorCameraVisible, setChecadorCameraVisible] = useState(false);
  const [checadorResultVisible, setChecadorResultVisible] = useState(false);
  const [registroHoy, setRegistroHoy] = useState<Asistencia | null>(null);
  const [isLoadingChecador, setIsLoadingChecador] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [currentAddress, setCurrentAddress] = useState<string>('Obteniendo dirección...');
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [checadorResultMsg, setChecadorResultMsg] = useState('');
  const [checadorResultType, setChecadorResultType] = useState<'entrada' | 'salida'>('entrada');
  const [capturedPhotoUri, setCapturedPhotoUri] = useState<string | null>(null);
  const [selectedAsistenciaInfo, setSelectedAsistenciaInfo] = useState<{
    fecha: string;
    hora: string;
    direccion: string;
    lat: number;
    lng: number;
    empleadoNombre: string;
    tipo: 'Entrada' | 'Salida';
  } | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const dateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Checador: Lógica ---
  const handleOpenChecador = async () => {
    if (!user) return;
    setIsLoadingChecador(true);
    try {
      const registro = await AsistenciaService.getRegistroHoy(user.id);
      setRegistroHoy(registro);
      if (registro && registro.hora_entrada && registro.hora_salida) {
        Alert.alert(
          'Turno Completo ✅',
          `Ya registraste tu entrada (${registro.hora_entrada?.substring(0,5)}) y salida (${registro.hora_salida?.substring(0,5)}) el día de hoy.`,
        );
        return;
      }
      setChecadorInstructionVisible(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo verificar tu asistencia.');
    } finally {
      setIsLoadingChecador(false);
    }
  };

  const handleStartCamera = async () => {
    setChecadorInstructionVisible(false);

    // Pedir permiso de cámara
    if (!cameraPermission?.granted) {
      const { granted } = await requestCameraPermission();
      if (!granted) {
        Alert.alert('Permisos', 'Se necesita acceso a la cámara para el checador.');
        return;
      }
    }

    // Pedir permiso de ubicación
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permisos', 'Se necesita acceso a la ubicación para registrar la asistencia.');
      return;
    }

    // Obtener ubicación y geocodificación
    try {
      setCurrentAddress('Obteniendo dirección...');
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      setCurrentLocation({ lat, lng });

      try {
        const reverse = await Location.reverseGeocodeAsync({
          latitude: lat,
          longitude: lng,
        });

        if (reverse && reverse.length > 0) {
          const addr = reverse[0];
          const street = addr.street || '';
          const number = addr.streetNumber || '';
          const district = addr.district || ''; // Colonia
          const postalCode = addr.postalCode || ''; // CP
          const city = addr.city || ''; // Ciudad
          const region = addr.region || ''; // Estado

          const parts = [];
          if (street || number) {
            parts.push(`${street} ${number}`.trim());
          }
          if (district) {
            parts.push(district);
          }
          if (postalCode || city || region) {
            let line = '';
            if (postalCode) line += `${postalCode} `;
            if (city) line += city;
            if (region) line += (city ? ', ' : '') + region;
            parts.push(line.trim());
          }

          const formatted = parts.join(', ');
          setCurrentAddress(formatted || 'Dirección no identificada');
        } else {
          setCurrentAddress('Dirección no disponible');
        }
      } catch (geoErr) {
        console.error('Error reverse geocoding:', geoErr);
        setCurrentAddress(`Coordenadas: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      }
    } catch (err) {
      console.error('Error al obtener ubicación:', err);
      setCurrentLocation(null);
      setCurrentAddress('Ubicación no disponible');
    }

    // Iniciar reloj en tiempo real
    setCurrentDateTime(new Date());
    dateIntervalRef.current = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);

    setChecadorCameraVisible(true);
  };

  const handleCaptureSelfie = async () => {
    if (!cameraRef.current || isCapturing || !user) return;
    setIsCapturing(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
        shutterSound: true,
      });

      if (!photo?.base64) throw new Error('No se pudo capturar la foto.');

      // Detener reloj
      if (dateIntervalRef.current) clearInterval(dateIntervalRef.current);
      setChecadorCameraVisible(false);

      // Subir foto
      const tipoRegistro = registroHoy?.hora_entrada ? 'salida' : 'entrada';
      const fotoUrl = await AsistenciaService.subirFotoAsistencia(user.id, photo.base64, tipoRegistro);

      const lat = currentLocation?.lat || 0;
      const lng = currentLocation?.lng || 0;
      const addressToSave = currentAddress || 'Ubicación registrada';

      if (tipoRegistro === 'entrada') {
        await AsistenciaService.registrarEntrada(user.id, fotoUrl, lat, lng, addressToSave);
        setChecadorResultMsg('Entrada registrada correctamente');
      } else {
        await AsistenciaService.registrarSalida(registroHoy!.id, fotoUrl, lat, lng, addressToSave);
        setChecadorResultMsg('Salida registrada correctamente');
      }

      setCapturedPhotoUri(photo.uri);
      setChecadorResultType(tipoRegistro);
      setChecadorResultVisible(true);
    } catch (err: any) {
      Alert.alert('Error al registrar', err.message || 'No se pudo procesar la asistencia.');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleCloseCamera = () => {
    if (dateIntervalRef.current) clearInterval(dateIntervalRef.current);
    setChecadorCameraVisible(false);
  };

  const handleCloseResult = () => {
    setChecadorResultVisible(false);
    setCapturedPhotoUri(null);
    setChecadorResultMsg('');
  };

  const formatChecadorTime = (date: Date) => {
    return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };

  const formatChecadorDate = (date: Date) => {
    return date.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  const handleOpenProfile = () => {
    if (user) {
      setProfilePhone(user.telefono || '');
      setProfilePassword('');
      setProfileModalVisible(true);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setIsSavingProfile(true);

    try {
      const updates: any = {
        telefono: profilePhone.trim(),
      };

      if (profilePassword.trim()) {
        updates.password = profilePassword.trim();
      }

      const { data, error } = await supabase
        .from('usuarios')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single();

      if (error) throw error;

      // Actualizar el estado local y AsyncStorage
      const updatedUser: Usuario = {
        ...user,
        telefono: updates.telefono,
      };

      setUser(updatedUser);
      await AsyncStorage.setItem('logged_user', JSON.stringify(updatedUser));

      Alert.alert('Éxito', 'Perfil actualizado correctamente.');
      setProfileModalVisible(false);
      setProfilePassword('');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo actualizar el perfil.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  useEffect(() => {
    // Cargar usuario
    const loadUserAndData = async () => {
      const currentUser = await AuthService.getCurrentUser();
      if (!currentUser) {
        router.replace('/');
        return;
      }
      setUser(currentUser);
      await refreshData(currentUser.id);
    };

    loadUserAndData();

    // Registrar Listener de Sincronización Automática Offline
    const unsubscribe = SyncService.initNetworkSyncListener((count) => {
      Alert.alert('Sincronización Exitosa', `Se han sincronizado ${count} gastos guardados offline.`);
      if (user) refreshData(user.id);
    });

    return () => unsubscribe();
  }, []);

  const refreshData = async (userId: string) => {
    setIsLoading(true);
    try {
      // 1. Obtener de Supabase
      const { data, error } = await supabase
        .from('gastos')
        .select('*')
        .eq('empleado_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setGastos(data || []);

      // 2. Obtener cola local offline
      const localQueue = await SyncService.getOfflineQueue();
      setOfflineGastos(localQueue.filter((item) => item.empleado_id === userId));
    } catch (err: any) {
      console.error('Error al cargar datos:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncManual = async () => {
    if (!user) return;
    setIsSyncing(true);
    try {
      const syncedCount = await SyncService.syncPendingGastos();
      if (syncedCount > 0) {
        Alert.alert('Sincronización', `${syncedCount} gastos subidos con éxito.`);
        await refreshData(user.id);
      } else {
        Alert.alert('Sincronización', 'No hay gastos pendientes o no hay conexión a internet.');
      }
    } catch (err: any) {
      Alert.alert('Error de Sincronización', err.message || 'Error desconocido.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogout = async () => {
    const performLogout = async () => {
      await AuthService.logout();
      router.replace('/');
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

  // Reenviar gasto observado (ACTION_REQUIRED)
  const handleResubmitGasto = async () => {
    if (!selectedGasto || !repondFeedback.trim()) return;
    setIsSubmittingResponse(true);

    const nuevaJustificacion = `${selectedGasto.justificacion || ''} | Resp Empleado: ${repondFeedback.trim()}`;

    try {
      const { error } = await supabase
        .from('gastos')
        .update({
          status: 'PENDING',
          rejection_feedback: null,
          justificacion: nuevaJustificacion,
        })
        .eq('id', selectedGasto.id);

      if (error) throw error;

      Alert.alert('Éxito', 'Gasto reenviado correctamente para revisión.');
      setModalVisible(false);
      setSelectedGasto(null);
      setRespondFeedback('');
      if (user) refreshData(user.id);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo reenviar la justificación');
    } finally {
      setIsSubmittingResponse(false);
    }
  };

  // Filtrar Gastos por Pestaña
  // Pendientes: PENDING, ACTION_REQUIRED y Offline SYNC_PENDING
  const pendingList: (Gasto & { isOffline?: boolean })[] = [
    ...offlineGastos.map((g) => ({ ...g, isOffline: true, status: 'PENDING' as const })),
    ...gastos.filter((g) => g.status === 'PENDING' || g.status === 'ACTION_REQUIRED'),
  ];

  // Historial: APPROVED, REJECTED
  const historyList = gastos.filter((g) => g.status === 'APPROVED' || g.status === 'REJECTED');

  // Cálculos de Resumen
  const saldoPendiente = pendingList.reduce((sum, g) => sum + Number(g.monto), 0);
  const totalAprobado = historyList.filter((g) => g.status === 'APPROVED').reduce((sum, g) => sum + Number(g.monto), 0);

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
        <View>
          <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>Bienvenido de nuevo,</Text>
          <Text style={[styles.headerTitle, { color: themeColors.text }]} numberOfLines={1}>
            {user?.nombre || 'Empleado'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          {offlineGastos.length > 0 && (
            <TouchableOpacity
              onPress={handleSyncManual}
              disabled={isSyncing}
              style={[styles.headerIconBtn, { backgroundColor: themeColors.warning + '20' }]}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color={themeColors.warning} />
              ) : (
                <Ionicons name="cloud-upload" size={20} color={themeColors.warning} />
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => router.push('/(empleado)/trabajo')}
            style={[styles.headerIconBtn, { backgroundColor: themeColors.backgroundElement }]}
          >
            <Ionicons name="briefcase-outline" size={20} color={themeColors.accent} />
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

      {/* Resumen Cards */}
      <View style={styles.summaryContainer}>
        <View style={[styles.summaryCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
          <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]}>PENDIENTE / OFFLINE</Text>
          <Text style={[styles.summaryValue, { color: themeColors.text }]}>{formatCurrency(saldoPendiente)}</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
          <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]}>TOTAL APROBADO</Text>
          <Text style={[styles.summaryValue, { color: themeColors.success }]}>{formatCurrency(totalAprobado)}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          onPress={() => setActiveTab('pendientes')}
          style={[
            styles.tab,
            activeTab === 'pendientes' && { borderBottomColor: themeColors.accent, borderBottomWidth: 3 },
          ]}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'pendientes' ? themeColors.text : themeColors.textSecondary },
              activeTab === 'pendientes' && styles.tabTextActive,
            ]}
          >
            Pendientes ({pendingList.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('historial')}
          style={[
            styles.tab,
            activeTab === 'historial' && { borderBottomColor: themeColors.accent, borderBottomWidth: 3 },
          ]}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'historial' ? themeColors.text : themeColors.textSecondary },
              activeTab === 'historial' && styles.tabTextActive,
            ]}
          >
            Historial ({historyList.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={themeColors.accent} />
          <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.one }}>Cargando gastos...</Text>
        </View>
      ) : (
        <FlatList
          data={activeTab === 'pendientes' ? pendingList : historyList}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <ExpenseCard
              gasto={item}
              onPress={() => {
                setSelectedGasto(item);
                setModalVisible(true);
              }}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="file-tray-outline" size={48} color={themeColors.textSecondary} />
              <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                No hay gastos registrados en esta categoría.
              </Text>
            </View>
          }
          refreshing={isLoading}
          onRefresh={() => user && refreshData(user.id)}
        />
      )}

      {/* Floating Action Buttons */}
      <View style={styles.fabContainer}>
        {/* Auto-Checador */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleOpenChecador}
          disabled={isLoadingChecador}
          style={[styles.fabSecondary, { backgroundColor: themeColors.success }]}
        >
          {isLoadingChecador ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Ionicons name="finger-print" size={22} color="#ffffff" />
          )}
        </TouchableOpacity>
        {/* Registrar Gasto */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push('/(empleado)/formulario')}
          style={[styles.fab, { backgroundColor: themeColors.accent }]}
        >
          <Ionicons name="receipt" size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {/* ========== MODAL: Instrucciones del Checador ========== */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={checadorInstructionVisible}
        onRequestClose={() => setChecadorInstructionVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, height: '55%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Auto-Checador</Text>
              <TouchableOpacity onPress={() => setChecadorInstructionVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={[styles.modalScroll, { alignItems: 'center', paddingTop: Spacing.three }]}>
              <View style={[styles.checadorIconCircle, { backgroundColor: themeColors.success + '15' }]}>
                <Ionicons name="camera" size={48} color={themeColors.success} />
              </View>

              <Text style={[styles.checadorTitle, { color: themeColors.text }]}>
                {registroHoy?.hora_entrada ? 'Registrar Salida' : 'Registrar Entrada'}
              </Text>

              <Text style={[styles.checadorDesc, { color: themeColors.textSecondary }]}>
                Se tomará una selfie con la cámara frontal para registrar tu asistencia. También se capturará tu ubicación como verificación.
              </Text>

              {registroHoy?.hora_entrada && (
                <View style={[styles.checadorStatusCard, { backgroundColor: themeColors.success + '10', borderColor: themeColors.success }]}>
                  <Ionicons name="checkmark-circle" size={20} color={themeColors.success} />
                  <Text style={[styles.checadorStatusText, { color: themeColors.success }]}>
                    Entrada registrada a las {registroHoy.hora_entrada?.substring(0, 5)}
                  </Text>
                </View>
              )}

              <CustomButton
                title={registroHoy?.hora_entrada ? 'Registrar Salida' : 'Registrar Entrada'}
                onPress={handleStartCamera}
                variant="success"
                style={{ width: '100%', marginTop: Spacing.three }}
                icon={<Ionicons name="camera-outline" size={20} color="#fff" style={{ marginRight: 8 }} />}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ========== MODAL: Cámara con Marca de Agua ========== */}
      <Modal
        animationType="fade"
        transparent={false}
        visible={checadorCameraVisible}
        onRequestClose={handleCloseCamera}
      >
        <View style={styles.cameraContainer}>
          <CameraView
            ref={cameraRef}
            style={styles.cameraPreview}
            facing="front"
            mode="picture"
          />
          {/* Overlay: Marca de Agua */}
          <SafeAreaView style={styles.cameraOverlay}>
            {/* Top bar */}
            <View style={styles.watermarkTop}>
              <TouchableOpacity onPress={handleCloseCamera} style={styles.cameraCloseBtn}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
              <View style={styles.watermarkBadge}>
                <Text style={styles.watermarkBadgeText}>
                  {registroHoy?.hora_entrada ? '📤 SALIDA' : '📥 ENTRADA'}
                </Text>
              </View>
            </View>

            {/* Bottom watermark info */}
            <View style={styles.watermarkBottom}>
              {/* Botón de captura */}
              <TouchableOpacity
                style={styles.captureBtn}
                onPress={handleCaptureSelfie}
                disabled={isCapturing}
                activeOpacity={0.7}
              >
                {isCapturing ? (
                  <ActivityIndicator size="large" color="#fff" />
                ) : (
                  <View style={styles.captureBtnInner} />
                )}
              </TouchableOpacity>

              {/* Contenedor de la marca de agua estilo foto Timemark */}
              <View style={styles.watermarkOverlayCard}>
                {/* Lado Izquierdo: Hora, Fecha y Dirección */}
                <View style={styles.watermarkLeftCol}>
                  {/* Fila superior: Hora | Fecha */}
                  <View style={styles.watermarkTimeDateRow}>
                    <Text style={styles.watermarkTimeText}>
                      {formatChecadorTime(currentDateTime).substring(0, 5)}
                    </Text>
                    <View style={styles.watermarkVerticalLine} />
                    <View style={styles.watermarkDateCol}>
                      <Text style={styles.watermarkDateText}>
                        {currentDateTime.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Text>
                      <Text style={styles.watermarkDayText}>
                        {currentDateTime.toLocaleDateString('es-MX', { weekday: 'long' }).toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  {/* Dirección */}
                  <Text style={styles.watermarkAddressText} numberOfLines={3}>
                    {currentAddress}
                  </Text>
                  {/* Nombre del Empleado */}
                  <Text style={styles.watermarkEmployeeText}>
                    👤 {user?.nombre || 'Empleado'}
                  </Text>
                </View>

                {/* Lado Derecho: Mapa */}
                {currentLocation ? (
                  <View style={styles.watermarkMapContainer}>
                    <Image
                      source={{
                        uri: `https://staticmap.openstreetmap.de/staticmap.php?center=${currentLocation.lat},${currentLocation.lng}&zoom=16&size=200x200&maptype=mapnik&markers=${currentLocation.lat},${currentLocation.lng},red-pushpin`,
                        headers: {
                          'User-Agent': 'PortalInttec/1.0 (soporte@inttec.net)',
                        },
                      }}
                      style={styles.watermarkMapView}
                      resizeMode="cover"
                    />
                  </View>
                ) : (
                  <View style={styles.watermarkMapPlaceholder}>
                    <Ionicons name="map" size={20} color="#888" />
                    <Text style={{ fontSize: 7, color: '#888', marginTop: 2, fontWeight: '700' }}>Sin Mapa</Text>
                  </View>
                )}
              </View>
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      {/* ========== MODAL: Resultado del Checador ========== */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={checadorResultVisible}
        onRequestClose={handleCloseResult}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, height: '60%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Asistencia Registrada</Text>
              <TouchableOpacity onPress={handleCloseResult}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={[styles.modalScroll, { alignItems: 'center' }]}>
              <View style={[styles.checadorIconCircle, { backgroundColor: themeColors.success + '15' }]}>
                <Ionicons name="checkmark-circle" size={56} color={themeColors.success} />
              </View>

              <Text style={[styles.checadorTitle, { color: themeColors.success }]}>
                {checadorResultType === 'entrada' ? '📥 Entrada Registrada' : '📤 Salida Registrada'}
              </Text>
              <Text style={[styles.checadorDesc, { color: themeColors.textSecondary }]}>
                {checadorResultMsg}
              </Text>

              {capturedPhotoUri && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    setActivePreviewUrl(capturedPhotoUri);
                    setSelectedAsistenciaInfo({
                      fecha: new Date().toISOString().split('T')[0],
                      hora: formatChecadorTime(new Date()),
                      direccion: currentAddress,
                      lat: currentLocation?.lat || 0,
                      lng: currentLocation?.lng || 0,
                      empleadoNombre: user?.nombre || 'Empleado',
                      tipo: checadorResultType === 'entrada' ? 'Entrada' : 'Salida',
                    });
                    setViewerVisible(true);
                  }}
                  style={styles.resultPhotoContainer}
                >
                  <Image source={{ uri: capturedPhotoUri }} style={styles.resultPhoto} resizeMode="cover" />
                </TouchableOpacity>
              )}

              <View style={styles.resultInfoRow}>
                <Ionicons name="time-outline" size={18} color={themeColors.textSecondary} />
                <Text style={[styles.resultInfoText, { color: themeColors.text }]}>
                  {formatChecadorTime(new Date())}
                </Text>
              </View>
              {currentAddress && (
                <View style={[styles.resultInfoRow, { paddingHorizontal: Spacing.three }]}>
                  <Ionicons name="location-outline" size={18} color={themeColors.textSecondary} style={{ alignSelf: 'flex-start', marginTop: 2 }} />
                  <Text style={[styles.resultInfoText, { color: themeColors.text, flex: 1, flexWrap: 'wrap' }]}>
                    {currentAddress}
                  </Text>
                </View>
              )}

              <CustomButton
                title="Cerrar"
                onPress={handleCloseResult}
                variant="primary"
                style={{ width: '100%', marginTop: Spacing.four }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal de Detalle */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Detalle del Gasto</Text>
              <TouchableOpacity
                onPress={() => {
                  setModalVisible(false);
                  setSelectedGasto(null);
                  setRespondFeedback('');
                }}
              >
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            {selectedGasto && (
              <ScrollView contentContainerStyle={styles.modalScroll}>
                {/* Evidencia Imagen */}
                {selectedGasto.foto_url || (selectedGasto.isOffline && (selectedGasto as any).base64Foto) ? (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => {
                      setActivePreviewUrl(selectedGasto.foto_url || `data:image/jpeg;base64,${(selectedGasto as any).base64Foto}`);
                      setViewerVisible(true);
                    }}
                    style={styles.modalImageContainer}
                  >
                    <Image
                      source={{
                        uri: selectedGasto.foto_url || `data:image/jpeg;base64,${(selectedGasto as any).base64Foto}`,
                      }}
                      style={styles.modalImage}
                      resizeMode="contain"
                    />
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
                    <Text style={[styles.detailValue, { color: themeColors.text, fontSize: 20, fontWeight: '800' }]}>
                      {formatCurrency(selectedGasto.monto)}
                    </Text>
                  </View>

                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Proveedor</Text>
                    <Text style={[styles.detailValue, { color: themeColors.text }]}>
                      {selectedGasto.proveedor || 'N/A'}
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
                      {selectedGasto.categoria || 'Sin Categoría'} {selectedGasto.subcategoria ? ` > ${selectedGasto.subcategoria}` : ''}
                    </Text>
                  </View>

                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Método de Pago</Text>
                    <Text style={[styles.detailValue, { color: themeColors.text, textTransform: 'capitalize' }]}>
                      {selectedGasto.metodo_pago} {selectedGasto.tipo_tarjeta ? `(${selectedGasto.tipo_tarjeta})` : ''}
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
                          <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Justificación</Text>
                          <Text style={[styles.detailValue, { color: themeColors.text }]}>
                            {parsed.justificacion || 'No especificada'}
                          </Text>
                        </View>
                      </>
                    );
                  })()}

                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Sucursal / Cliente</Text>
                    <Text style={[styles.detailValue, { color: themeColors.text }]}>
                      {selectedGasto.sucursal ? `Sucursal: ${selectedGasto.sucursal}` : ''}
                      {selectedGasto.cliente ? `${selectedGasto.sucursal ? ' | ' : ''}Cliente: ${selectedGasto.cliente}` : ''}
                      {!selectedGasto.sucursal && !selectedGasto.cliente ? 'N/A' : ''}
                    </Text>
                  </View>

                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Facturación</Text>
                    <Text style={[styles.detailValue, { color: themeColors.text }]}>
                      {selectedGasto.facturado ? 'Sí, Facturado' : 'No Facturado'}
                    </Text>
                  </View>

                  {selectedGasto.facturado ? (
                    <View style={styles.detailItem}>
                      <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Archivo de Factura</Text>
                      {selectedGasto.factura_url || (selectedGasto.isOffline && (selectedGasto as any).base64Factura) ? (
                        <TouchableOpacity
                          style={[styles.invoiceLinkBtn, { backgroundColor: themeColors.accent + '15' }]}
                          onPress={() => {
                            const imgUrl = selectedGasto.factura_url || `data:image/jpeg;base64,${(selectedGasto as any).base64Factura}`;
                            setActivePreviewUrl(imgUrl);
                            setViewerVisible(true);
                          }}
                        >
                          <Ionicons name="image" size={18} color={themeColors.accent} />
                          <Text style={[styles.invoiceLinkText, { color: themeColors.accent }]}>
                            Ver Factura
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={[styles.detailValue, { color: themeColors.textSecondary }]}>Sin archivo adjunto</Text>
                      )}
                    </View>
                  ) : (
                    <View style={styles.detailItem}>
                      <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Motivo de No Factura</Text>
                      <Text style={[styles.detailValue, { color: themeColors.text, fontStyle: 'italic' }]}>
                        {selectedGasto.motivo_sin_factura || 'No especificado'}
                      </Text>
                    </View>
                  )}

                  {/* Sección Action Required */}
                  {selectedGasto.status === 'ACTION_REQUIRED' && (
                    <View style={[styles.actionRequiredBox, { borderColor: themeColors.actionRequired }]}>
                      <View style={styles.actionRequiredHeader}>
                        <Ionicons name="alert-circle" size={20} color={themeColors.actionRequired} />
                        <Text style={[styles.actionRequiredTitle, { color: themeColors.actionRequired }]}>
                          ACCIÓN REQUERIDA (Observación del Admin)
                        </Text>
                      </View>
                      <Text style={[styles.observationText, { color: themeColors.text }]}>
                        "{selectedGasto.rejection_feedback}"
                      </Text>

                      <View style={styles.responseForm}>
                        <CustomInput
                          label="Responder / Aclarar observación"
                          placeholder="Escribe tu respuesta aquí..."
                          value={repondFeedback}
                          onChangeText={setRespondFeedback}
                          multiline
                          numberOfLines={3}
                          style={{ height: 70 }}
                        />
                        <CustomButton
                          title="Reenviar Gasto"
                          onPress={handleResubmitGasto}
                          loading={isSubmittingResponse}
                          disabled={!repondFeedback.trim()}
                          variant="primary"
                        />
                      </View>
                    </View>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal de Mi Perfil */}
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
                  value={user?.nombre || ''}
                  editable={false}
                  style={{ opacity: 0.7 }}
                />
                
                <CustomInput
                  label="Correo Electrónico"
                  value={user?.email || ''}
                  editable={false}
                  autoCapitalize="none"
                  style={{ opacity: 0.7 }}
                />

                <CustomInput
                  label="Rol"
                  value={user?.rol || ''}
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
        asistenciaInfo={selectedAsistenciaInfo}
        onClose={() => {
          setViewerVisible(false);
          setActivePreviewUrl(null);
          setSelectedAsistenciaInfo(null);
        }}
      />
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
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 14,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
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
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.two,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
  },
  tabTextActive: {
    fontWeight: '700',
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
  fabContainer: {
    position: 'absolute',
    bottom: Spacing.four,
    right: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
  },
  fab: {
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
  fabSecondary: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
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
  actionRequiredBox: {
    borderWidth: 1.5,
    borderRadius: BorderRadius.medium,
    padding: Spacing.three,
    marginTop: Spacing.two,
    gap: Spacing.two,
  },
  actionRequiredHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  actionRequiredTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  observationText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  responseForm: {
    marginTop: Spacing.one,
    gap: Spacing.one,
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
  // --- Auto-Checador Styles ---
  checadorIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  checadorTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: Spacing.one,
  },
  checadorDesc: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.two,
  },
  checadorStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    padding: Spacing.two,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    width: '100%',
    marginTop: Spacing.one,
  },
  checadorStatusText: {
    fontSize: 14,
    fontWeight: '700',
  },
  // Camera
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraPreview: {
    flex: 1,
  },
  cameraOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
  },
  watermarkTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  cameraCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  watermarkBadge: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: BorderRadius.pill,
  },
  watermarkBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  watermarkBottom: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
    width: '100%',
  },
  watermarkOverlayCard: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: BorderRadius.medium,
    padding: Spacing.three,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    width: '100%',
    gap: Spacing.two,
  },
  watermarkLeftCol: {
    flex: 1,
    gap: 4,
  },
  watermarkTimeDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  watermarkTimeText: {
    color: '#fff',
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: -1,
  },
  watermarkVerticalLine: {
    width: 2.5,
    height: 38,
    backgroundColor: '#ffc107',
    marginHorizontal: Spacing.two,
  },
  watermarkDateCol: {
    justifyContent: 'center',
  },
  watermarkDateText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  watermarkDayText: {
    color: '#ffc107',
    fontSize: 11,
    fontWeight: '900',
  },
  watermarkAddressText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  watermarkEmployeeText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  watermarkMapContainer: {
    width: 95,
    height: 95,
    borderRadius: BorderRadius.medium,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: '#eee',
  },
  watermarkMapView: {
    width: '100%',
    height: '100%',
  },
  watermarkMapPlaceholder: {
    width: 95,
    height: 95,
    borderRadius: BorderRadius.medium,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  captureBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 5,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  captureBtnInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#fff',
  },
  // Result
  resultPhotoContainer: {
    width: 180,
    height: 180,
    borderRadius: BorderRadius.large,
    overflow: 'hidden',
    marginVertical: Spacing.three,
    borderWidth: 3,
    borderColor: '#4caf50',
  },
  resultPhoto: {
    width: '100%',
    height: '100%',
  },
  resultInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    marginBottom: Spacing.one,
  },
  resultInfoText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
