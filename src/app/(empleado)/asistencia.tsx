import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { supabase, AuthService, Usuario, Asistencia, AsistenciaService, inttecClient, daravisaClient } from '@/services/supabase';
import CustomButton from '@/components/CustomButton';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import ImageViewerModal from '@/components/ImageViewerModal';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuth } from '@/context/AuthContext';

export default function EmpleadoAsistencia() {
  const router = useRouter();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { company } = useAuth();

  const [user, setUser] = useState<Usuario | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // --- Auto-Checador ---
  const [checadorInstructionVisible, setChecadorInstructionVisible] = useState(false);
  const [checadorCameraVisible, setChecadorCameraVisible] = useState(false);
  const [checadorResultVisible, setChecadorResultVisible] = useState(false);
  const [registroHoy, setRegistroHoy] = useState<Asistencia | null>(null);
  const [isLoadingChecador, setIsLoadingChecador] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [prevCurrentLocation, setPrevCurrentLocation] = useState(currentLocation);
  const [checadorMapUrl, setChecadorMapUrl] = useState<string | null>(() => {
    if (!currentLocation) return null;
    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyDgvQcdXQYx8uSGNJJ4wENAGkIVbDIaUXc";
    return `https://maps.googleapis.com/maps/api/staticmap?center=${currentLocation.lat},${currentLocation.lng}&zoom=16&size=200x200&markers=color:red%7C${currentLocation.lat},${currentLocation.lng}&key=${apiKey}`;
  });

  if (currentLocation !== prevCurrentLocation) {
    setPrevCurrentLocation(currentLocation);
    if (currentLocation) {
      const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyDgvQcdXQYx8uSGNJJ4wENAGkIVbDIaUXc";
      setChecadorMapUrl(`https://maps.googleapis.com/maps/api/staticmap?center=${currentLocation.lat},${currentLocation.lng}&zoom=16&size=200x200&markers=color:red%7C${currentLocation.lat},${currentLocation.lng}&key=${apiKey}`);
    } else {
      setChecadorMapUrl(null);
    }
  }

  const [currentAddress, setCurrentAddress] = useState<string>('Obteniendo dirección...');
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [checadorResultMsg, setChecadorResultMsg] = useState('');
  const [checadorResultType, setChecadorResultType] = useState<'entrada' | 'salida'>('entrada');
  const [capturedPhotoUri, setCapturedPhotoUri] = useState<string | null>(null);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);
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

  // --- Cargar usuario ---
  useEffect(() => {
    const loadUser = async () => {
      try {
        const stored = await AsyncStorage.getItem(`logged_user_${company}`);
        if (stored) {
          setUser(JSON.parse(stored));
        }
      } catch (err) {
        console.error('Error loading user:', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadUser();
  }, [company]);

  // --- Abrir checador automáticamente al cargar ---
  useEffect(() => {
    if (user && !isLoadingChecador) {
      handleOpenChecador();
    }
  }, [user]);

  // --- Checador: Lógica ---
  const handleOpenChecador = async () => {
    if (!user) {
      console.error('[Checador] Error: user es nulo o indefinido en handleOpenChecador');
      if (Platform.OS === 'web') {
        window.alert('Error: No se ha iniciado sesión correctamente o el usuario no está cargado.');
      }
      return;
    }
    setIsLoadingChecador(true);
    try {
      const registro = await AsistenciaService.getRegistroHoy(user.id);
      setRegistroHoy(registro);
      if (registro && registro.hora_entrada && registro.hora_salida) {
        if (Platform.OS === 'web') {
          window.alert(`Turno Completo ✅\n\nYa registraste tu entrada (${registro.hora_entrada?.substring(0,5)}) y salida (${registro.hora_salida?.substring(0,5)}) el día de hoy.`);
        } else {
          Alert.alert(
            'Turno Completo ✅',
            `Ya registraste tu entrada (${registro.hora_entrada?.substring(0,5)}) y salida (${registro.hora_salida?.substring(0,5)}) el día de hoy.`,
          );
        }
        return;
      }
      setChecadorInstructionVisible(true);
    } catch (err: any) {
      console.error('[Checador] Error en handleOpenChecador:', err.message || err);
      if (Platform.OS === 'web') {
        window.alert(`Error: ${err.message || 'No se pudo verificar tu asistencia.'}`);
      } else {
        Alert.alert('Error', err.message || 'No se pudo verificar tu asistencia.');
      }
    } finally {
      setIsLoadingChecador(false);
    }
  };

  const handleStartCamera = async () => {
    setChecadorInstructionVisible(false);

    if (!cameraPermission?.granted) {
      const { granted } = await requestCameraPermission();
      if (!granted) {
        Alert.alert('Permisos', 'Se necesita acceso a la cámara para el checador.');
        return;
      }
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permisos', 'Se necesita acceso a la ubicación para registrar la asistencia.');
      return;
    }

    try {
      setCurrentAddress('Obteniendo dirección...');
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      setCurrentLocation({ lat, lng });

      try {
        const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "";
        const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`);
        const data = await response.json();

        if (data.status === 'OK' && data.results && data.results.length > 0) {
          const formatted = data.results[0].formatted_address;
          setCurrentAddress(formatted || 'Dirección no identificada');
        } else {
          throw new Error(data.error_message || `Google Geocoding API status: ${data.status}`);
        }
      } catch {
        try {
          const reverse = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
          if (reverse && reverse.length > 0) {
            const addr = reverse[0];
            const parts = [];
            if (addr.street || addr.streetNumber) parts.push(`${addr.street || ''} ${addr.streetNumber || ''}`.trim());
            if (addr.district) parts.push(addr.district);
            if (addr.postalCode || addr.city || addr.region) {
              let line = '';
              if (addr.postalCode) line += `${addr.postalCode} `;
              if (addr.city) line += addr.city;
              if (addr.region) line += (addr.city ? ', ' : '') + addr.region;
              parts.push(line.trim());
            }
            setCurrentAddress(parts.join(', ') || 'Dirección no identificada');
          } else {
            setCurrentAddress('Dirección no disponible');
          }
        } catch {
          setCurrentAddress(`Coordenadas: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        }
      }
    } catch (err: any) {
      console.error('[Checador] Error crítico al obtener ubicación:', err.message || err);
      setCurrentLocation(null);
      setCurrentAddress('Ubicación no disponible');
    }

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

      let base64Data = photo?.base64;
      if (!base64Data && photo?.uri && photo.uri.startsWith('data:image')) {
        base64Data = photo.uri;
      }

      if (!base64Data) {
        throw new Error('No se pudo capturar la foto.');
      }

      if (dateIntervalRef.current) clearInterval(dateIntervalRef.current);
      setChecadorCameraVisible(false);

      const tipoRegistro = registroHoy?.hora_entrada ? 'salida' : 'entrada';
      // MODO DOBLE REGISTRO (INTTEC + DARAVISA)
      const fotoUrl = await AsistenciaService.subirFotoAsistencia(user.id, base64Data, tipoRegistro);
      const lat = currentLocation?.lat || 0;
      const lng = currentLocation?.lng || 0;
      const addressToSave = currentAddress || 'Ubicación registrada';

      const horaStr = AsistenciaService.getHoraLocal(new Date());
      const fechaStr = AsistenciaService.getFechaJornada(new Date());

      if (tipoRegistro === 'entrada') {
        const insertData = {
          empleado_id: user.id,
          fecha: fechaStr,
          hora_entrada: horaStr,
          foto_entrada_url: fotoUrl,
          latitud_entrada: lat,
          longitud_entrada: lng,
          direccion_entrada: addressToSave,
        };
        // Inttec
        await inttecClient.from('asistencias').insert([insertData]);
        // Daravisa
        await daravisaClient.from('asistencias').insert([insertData]);
        setChecadorResultMsg('Entrada registrada en Inttec y Daravisa');
      } else {
        const updateData = {
          hora_salida: horaStr,
          foto_salida_url: fotoUrl,
          latitud_salida: lat,
          longitud_salida: lng,
          direccion_salida: addressToSave,
        };
        // Inttec
        const { data: asisInttec } = await inttecClient.from('asistencias').select('id').eq('empleado_id', user.id).eq('fecha', fechaStr).order('creado_en', { ascending: false }).limit(1).single();
        if (asisInttec) {
          await inttecClient.from('asistencias').update(updateData).eq('id', asisInttec.id);
        }
        // Daravisa
        const { data: asisDaravisa } = await daravisaClient.from('asistencias').select('id').eq('empleado_id', user.id).eq('fecha', fechaStr).order('creado_en', { ascending: false }).limit(1).single();
        if (asisDaravisa) {
          await daravisaClient.from('asistencias').update(updateData).eq('id', asisDaravisa.id);
        }
        setChecadorResultMsg('Salida registrada en Inttec y Daravisa');
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

  const gradientColors = scheme === 'dark'
    ? [themeColors.background, '#13283c'] as const
    : ['#f4f6f9', '#dce3ec'] as const;

  if (isLoading) {
    return (
      <View style={[styles.loaderContainer, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color={themeColors.accent} />
        <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.one }}>Cargando...</Text>
      </View>
    );
  }

  return (
    <LinearGradient colors={gradientColors} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['left', 'right']}>
        {/* Checador Main Screen */}
        <ScrollView contentContainerStyle={styles.mainContent}>
          <View style={[styles.checadorIconCircle, { backgroundColor: themeColors.success + '15', alignSelf: 'center' }]}>
            <Ionicons name="finger-print" size={56} color={themeColors.success} />
          </View>

          <Text style={[styles.checadorTitle, { color: themeColors.text }]}>
            Auto-Checador
          </Text>

          <Text style={[styles.checadorDesc, { color: themeColors.textSecondary }]}>
            Registra tu asistencia con una selfie. Se registrará simultáneamente en Inttec y Daravisa.
          </Text>

          {/* Estado del día */}
          {registroHoy?.hora_entrada && !registroHoy?.hora_salida && (
            <View style={[styles.checadorStatusCard, { backgroundColor: themeColors.success + '10', borderColor: themeColors.success }]}>
              <Ionicons name="checkmark-circle" size={20} color={themeColors.success} />
              <Text style={[styles.checadorStatusText, { color: themeColors.success }]}>
                Entrada registrada a las {registroHoy.hora_entrada?.substring(0, 5)}
              </Text>
            </View>
          )}

          {registroHoy?.hora_entrada && registroHoy?.hora_salida && (
            <View style={[styles.checadorStatusCard, { backgroundColor: themeColors.accent + '10', borderColor: themeColors.accent }]}>
              <Ionicons name="checkmark-done-circle" size={20} color={themeColors.accent} />
              <Text style={[styles.checadorStatusText, { color: themeColors.accent }]}>
                Turno completo: {registroHoy.hora_entrada?.substring(0, 5)} - {registroHoy.hora_salida?.substring(0, 5)}
              </Text>
            </View>
          )}

          <CustomButton
            title={
              isLoadingChecador
                ? 'Verificando...'
                : registroHoy?.hora_entrada && registroHoy?.hora_salida
                  ? 'Turno Completo ✅'
                  : registroHoy?.hora_entrada
                    ? 'Registrar Salida'
                    : 'Registrar Entrada'
            }
            onPress={handleOpenChecador}
            variant="success"
            loading={isLoadingChecador}
            disabled={isLoadingChecador || (registroHoy?.hora_entrada && registroHoy?.hora_salida ? true : false)}
            style={{ width: '100%', marginTop: Spacing.three }}
            icon={<Ionicons name="camera-outline" size={20} color="#fff" style={{ marginRight: 8 }} />}
          />
        </ScrollView>

        {/* ========== MODAL: Instrucciones del Checador ========== */}
        <Modal statusBarTranslucent={true}
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
        <Modal statusBarTranslucent={true}
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
                  {currentLocation && checadorMapUrl ? (
                    <View style={styles.watermarkMapContainer}>
                      <Image
                        source={{ uri: checadorMapUrl }}
                        onError={() => {
                          if (currentLocation && (!checadorMapUrl || !checadorMapUrl.includes('openstreetmap.de'))) {
                            setChecadorMapUrl(`https://staticmap.openstreetmap.de/staticmap.php?center=${currentLocation.lat},${currentLocation.lng}&zoom=16&size=200x200&maptype=mapnik&markers=${currentLocation.lat},${currentLocation.lng},red-pushpin`);
                          }
                        }}
                        style={styles.watermarkMapView}
                        resizeMode="cover"
                      />
                    </View>
                  ) : currentLocation ? (
                    <View style={[styles.watermarkMapContainer, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#333' }]}>
                      <ActivityIndicator size="small" color="#fff" />
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
        <Modal statusBarTranslucent={true}
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

        {/* Image Viewer */}
        <ImageViewerModal
          visible={viewerVisible}
          imageUrl={activePreviewUrl || ''}
          onClose={() => {
            setViewerVisible(false);
            setActivePreviewUrl(null);
            setSelectedAsistenciaInfo(null);
          }}
          asistenciaInfo={selectedAsistenciaInfo || undefined}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
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
    paddingHorizontal: Spacing.two,
    marginBottom: Spacing.two,
  },
  checadorStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.two,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    gap: Spacing.one,
    width: '100%',
    marginBottom: Spacing.one,
  },
  checadorStatusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: BorderRadius.large,
    borderTopRightRadius: BorderRadius.large,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    height: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  modalScroll: {
    paddingBottom: Spacing.four,
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
    ...StyleSheet.absoluteFill as object,
    justifyContent: 'space-between',
  },
  cameraCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  watermarkTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  watermarkBadge: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: BorderRadius.large,
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
