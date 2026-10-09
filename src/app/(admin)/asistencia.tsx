import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
  Alert,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';

import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import {
  Usuario,
  Asistencia,
  AsistenciaService,
  sortUsuariosByRoleAndName,
  inttecClient,
  daravisaClient,
} from '@/services/supabase';
import { getApiUrl, getApiHeaders } from '@/services/apiHelper';
import AsistenciaSemanalCard from '@/components/AsistenciaSemanalCard';
import ImageViewerModal from '@/components/ImageViewerModal';
import PeriodoPickerModal from '@/components/PeriodoPickerModal';
import CustomButton from '@/components/CustomButton';
import {
  getWeekRange,
  getPreviousWeekMonday,
  getNextWeekMonday,
  formatHoraDisplay,
  formatMinutesToHours,
  processAsistenciasSemana,
} from '@/utils/asistenciaUtils';
import { ReportGenerator } from '@/utils/reportGenerator';

export default function AdminAsistencia() {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { user: authUser, company } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 900;

  // Estado del personal y asistencias generales
  const [personal, setPersonal] = useState<Usuario[]>([]);
  const [isLoadingPersonal, setIsLoadingPersonal] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Semana y Día seleccionado
  const [selectedMonday, setSelectedMonday] = useState<Date>(() => getWeekRange().mondayDate);
  const [selectedDayStr, setSelectedDayStr] = useState<string | null>(null);
  const [periodoModalVisible, setPeriodoModalVisible] = useState(false);
  const [allAsistenciasSemana, setAllAsistenciasSemana] = useState<Asistencia[]>([]);
  const [isLoadingAsistencias, setIsLoadingAsistencias] = useState(false);

  // Empleado seleccionado para vista detallada (null = lista general de empleados)
  const [selectedEmpleado, setSelectedEmpleado] = useState<Usuario | null>(null);
  const [asistenciasEmpleado, setAsistenciasEmpleado] = useState<Asistencia[]>([]);
  const [isLoadingEmpleadoDetalle, setIsLoadingEmpleadoDetalle] = useState(false);

  // Filtros y búsqueda
  const [searchQuery, setSearchQuery] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'TODOS' | 'EN_TURNO' | 'COMPLETADO' | 'SIN_REGISTRO'>('TODOS');

  // Exportación
  const [isExporting, setIsExporting] = useState(false);

  // Visor de foto y mapa
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

  // ==========================================
  // AUTO-CHECADOR PARA EL ADMINISTRADOR
  // ==========================================
  const [adminRegistroHoy, setAdminRegistroHoy] = useState<Asistencia | null>(null);
  const [isLoadingAdminChecador, setIsLoadingAdminChecador] = useState(false);
  const [checadorInstructionVisible, setChecadorInstructionVisible] = useState(false);
  const [checadorCameraVisible, setChecadorCameraVisible] = useState(false);
  const [checadorResultVisible, setChecadorResultVisible] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [currentAddress, setCurrentAddress] = useState<string>('Obteniendo ubicación...');
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [checadorResultMsg, setChecadorResultMsg] = useState('');
  const [checadorResultType, setChecadorResultType] = useState<'entrada' | 'salida'>('entrada');
  const [capturedPhotoUri, setCapturedPhotoUri] = useState<string | null>(null);

  const cameraRef = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const dateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cargar datos iniciales
  useEffect(() => {
    cargarDatosGenerales();
    if (authUser?.id) {
      cargarEstadoChecadorAdmin();
    }
  }, [company, selectedMonday]);

  // Cargar estado de asistencia del admin logueado
  const cargarEstadoChecadorAdmin = async () => {
    if (!authUser?.id) return;
    try {
      setIsLoadingAdminChecador(true);
      const reg = await AsistenciaService.getRegistroHoy(authUser.id);
      setAdminRegistroHoy(reg);
    } catch (err) {
      console.warn('[Admin Asistencia] Error cargando estado checador admin:', err);
    } finally {
      setIsLoadingAdminChecador(false);
    }
  };

  // Cargar lista de empleados y asistencias de la semana
  const cargarDatosGenerales = async () => {
    setIsLoadingPersonal(true);
    setIsLoadingAsistencias(true);

    try {
      const headers = await getApiHeaders();
      const range = getWeekRange(selectedMonday);

      // 1. Cargar personal
      let usersList: Usuario[] = [];
      try {
        const resUsers = await fetch(`${getApiUrl()}/api/reportes/admin/all`, { headers });
        if (resUsers.ok) {
          const data = await resUsers.json();
          usersList = sortUsuariosByRoleAndName(data.usuarios || []);
        } else {
          const client = company === 'daravisa' ? daravisaClient : inttecClient;
          const { data: uData } = await client.from('usuarios').select('*').order('nombre');
          usersList = sortUsuariosByRoleAndName(uData || []);
        }
      } catch (_) {
        const client = company === 'daravisa' ? daravisaClient : inttecClient;
        const { data: uData } = await client.from('usuarios').select('*').order('nombre');
        usersList = sortUsuariosByRoleAndName(uData || []);
      }
      setPersonal(usersList);

      // 2. Cargar asistencias de toda la semana
      try {
        const resAsist = await fetch(
          `${getApiUrl()}/api/reportes/admin/export/asistencias?startDate=${range.mondayStr}&endDate=${range.sundayStr}`,
          { headers }
        );
        if (resAsist.ok) {
          const asistData = await resAsist.json();
          setAllAsistenciasSemana(asistData || []);
        } else {
          const client = company === 'daravisa' ? daravisaClient : inttecClient;
          const { data: aData } = await client
            .from('asistencias')
            .select('*')
            .gte('fecha', range.mondayStr)
            .lte('fecha', range.sundayStr)
            .order('fecha', { ascending: false });
          setAllAsistenciasSemana(aData || []);
        }
      } catch (err) {
        console.error('[Admin Asistencia] Error cargando asistencias generales:', err);
      }
    } catch (err) {
      console.error('[Admin Asistencia] Error general cargando datos:', err);
    } finally {
      setIsLoadingPersonal(false);
      setIsLoadingAsistencias(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    cargarDatosGenerales();
    cargarEstadoChecadorAdmin();
    if (selectedEmpleado) {
      cargarAsistenciasEmpleado(selectedEmpleado.id, selectedMonday);
    }
  };

  // Cargar asistencias detalladas de un empleado específico
  const cargarAsistenciasEmpleado = async (empleadoId: string, monday: Date) => {
    setIsLoadingEmpleadoDetalle(true);
    try {
      const range = getWeekRange(monday);
      const hist = await AsistenciaService.getHistorialEmpleado(
        empleadoId,
        range.mondayStr,
        range.sundayStr
      );
      setAsistenciasEmpleado(hist || []);
    } catch (err: any) {
      console.error('[Admin Asistencia] Error cargando asistencias del empleado:', err);
      // Fallback a filtrar del conjunto general
      const localFiltered = allAsistenciasSemana.filter((a) => a.empleado_id === empleadoId);
      setAsistenciasEmpleado(localFiltered);
    } finally {
      setIsLoadingEmpleadoDetalle(false);
    }
  };

  const handleSelectEmpleado = (emp: Usuario) => {
    setSelectedEmpleado(emp);
    cargarAsistenciasEmpleado(emp.id, selectedMonday);
  };

  const handleBackToList = () => {
    setSelectedEmpleado(null);
    setAsistenciasEmpleado([]);
  };

  // ==========================================
  // PROCESAMIENTO DE ESTADOS POR EMPLEADO Y DÍAS
  // ==========================================
  const fechaHoyJornada = useMemo(() => AsistenciaService.getFechaJornada(), []);

  const rangeSemana = useMemo(() => getWeekRange(selectedMonday), [selectedMonday]);

  const isCurrentWeek = useMemo(() => {
    const currentMon = getWeekRange().mondayDate;
    return (
      selectedMonday.getFullYear() === currentMon.getFullYear() &&
      selectedMonday.getMonth() === currentMon.getMonth() &&
      selectedMonday.getDate() === currentMon.getDate()
    );
  }, [selectedMonday]);

  const formatWeekTitle = useCallback((range: typeof rangeSemana) => {
    const m = range.mondayDate;
    const s = range.sundayDate;
    const mesM = m.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '');
    const mesS = s.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '');
    const anio = s.getFullYear();

    if (m.getMonth() === s.getMonth()) {
      return `${String(m.getDate()).padStart(2, '0')} - ${String(s.getDate()).padStart(2, '0')} ${mesM.toUpperCase()} ${anio}`;
    }
    return `${String(m.getDate()).padStart(2, '0')} ${mesM.toUpperCase()} - ${String(s.getDate()).padStart(2, '0')} ${mesS.toUpperCase()} ${anio}`;
  }, []);

  // Mapear asistencias por empleado
  const asistenciasPorEmpleado = useMemo(() => {
    const map = new Map<string, Asistencia[]>();
    for (const a of allAsistenciasSemana) {
      const empId = a.empleado_id;
      if (!empId) continue;
      const list = map.get(empId) || [];
      list.push(a);
      map.set(empId, list);
    }
    return map;
  }, [allAsistenciasSemana]);

  // Información calculada para cada día de la semana (para la barra interactiva)
  const diasSemanaInfo = useMemo(() => {
    return rangeSemana.days.map((day) => {
      const asistenciasDelDia = allAsistenciasSemana.filter((a) => a.fecha === day.dateStr);
      const uniqueEmpleadosCount = new Set(asistenciasDelDia.map((a) => a.empleado_id)).size;
      const enTurnoCount = asistenciasDelDia.filter((a) => a.hora_entrada && !a.hora_salida).length;
      const cerradosCount = asistenciasDelDia.filter((a) => a.hora_entrada && a.hora_salida).length;

      return {
        ...day,
        totalAsistencias: asistenciasDelDia.length,
        empleadosCount: uniqueEmpleadosCount,
        enTurnoCount,
        cerradosCount,
        hasActivity: asistenciasDelDia.length > 0,
      };
    });
  }, [rangeSemana, allAsistenciasSemana]);

  const selectedDayInfo = useMemo(() => {
    if (!selectedDayStr) return null;
    return diasSemanaInfo.find((d) => d.dateStr === selectedDayStr) || null;
  }, [selectedDayStr, diasSemanaInfo]);

  // Información calculada para cada empleado (según día seleccionado o hoy)
  const empleadosData = useMemo(() => {
    const targetFecha = selectedDayStr || fechaHoyJornada;
    const isViewingToday = targetFecha === fechaHoyJornada;

    return personal.map((emp) => {
      const asistenciasEmp = asistenciasPorEmpleado.get(emp.id) || [];
      const semanaProcesada = processAsistenciasSemana(asistenciasEmp, selectedMonday);

      // Buscar asistencias del día objetivo (hoy o el seleccionado)
      const asistenciasTargetDia = asistenciasEmp.filter((a) => a.fecha === targetFecha);

      let estadoDia: 'EN_TURNO' | 'COMPLETADO' | 'SIN_REGISTRO' = 'SIN_REGISTRO';
      let ultimaEntrada: string | null = null;
      let ultimaSalida: string | null = null;
      let direccionDia: string | null = null;
      let fotoEntradaDia: string | null = null;

      if (asistenciasTargetDia.length > 0) {
        const sorted = [...asistenciasTargetDia].sort((a, b) =>
          (b.hora_entrada || '').localeCompare(a.hora_entrada || '')
        );
        const lastReg = sorted[0];

        if (lastReg.hora_entrada && !lastReg.hora_salida) {
          estadoDia = 'EN_TURNO';
          ultimaEntrada = lastReg.hora_entrada;
          direccionDia = lastReg.direccion_entrada || null;
          fotoEntradaDia = lastReg.foto_entrada_url || null;
        } else if (lastReg.hora_entrada && lastReg.hora_salida) {
          estadoDia = 'COMPLETADO';
          ultimaEntrada = lastReg.hora_entrada;
          ultimaSalida = lastReg.hora_salida;
          direccionDia = lastReg.direccion_salida || lastReg.direccion_entrada || null;
          fotoEntradaDia = lastReg.foto_salida_url || lastReg.foto_entrada_url || null;
        }
      }

      return {
        ...emp,
        estadoHoy: estadoDia,
        estadoDia,
        ultimaEntrada,
        ultimaSalida,
        direccionHoy: direccionDia,
        fotoEntradaHoy: fotoEntradaDia,
        isViewingToday,
        targetFecha,
        totalMinutosSemana: semanaProcesada.totalMinutosSemana,
        totalHorasFormateadas: semanaProcesada.totalHorasSemanaStr,
        totalMinutosRegulares: semanaProcesada.totalMinutosRegulares,
        totalHorasRegularesFormateadas: semanaProcesada.totalHorasRegularesStr,
        totalMinutosExtra: semanaProcesada.totalMinutosExtra,
        totalHorasExtraFormateadas: semanaProcesada.totalHorasExtraStr,
        diasTrabajados: semanaProcesada.diasLaborados,
        asistenciasCount: asistenciasEmp.length,
      };
    });
  }, [personal, asistenciasPorEmpleado, selectedMonday, fechaHoyJornada, selectedDayStr]);

  // Estadísticas del día o de la semana
  const statsHoy = useMemo(() => {
    let enTurno = 0;
    let completados = 0;
    let sinRegistro = 0;
    let totalMinutosTodos = 0;

    empleadosData.forEach((emp) => {
      if (emp.estadoHoy === 'EN_TURNO') enTurno++;
      else if (emp.estadoHoy === 'COMPLETADO') completados++;
      else sinRegistro++;

      totalMinutosTodos += emp.totalMinutosSemana || 0;
    });

    return {
      totalPersonal: empleadosData.length,
      enTurno,
      completados,
      sinRegistro,
      totalHorasSemana: formatMinutesToHours(totalMinutosTodos),
    };
  }, [empleadosData]);

  // Filtrado de lista por buscador y estado
  const filteredEmpleados = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return empleadosData.filter((emp) => {
      // Filtro de texto
      const matchesText =
        !q ||
        (emp.nombre || '').toLowerCase().includes(q) ||
        (emp.email || '').toLowerCase().includes(q) ||
        (emp.rol || '').toLowerCase().includes(q) ||
        (emp.sucursal || '').toLowerCase().includes(q);

      if (!matchesText) return false;

      // Filtro por estado
      if (filtroEstado === 'TODOS') return true;
      if (filtroEstado === 'EN_TURNO') return emp.estadoHoy === 'EN_TURNO';
      if (filtroEstado === 'COMPLETADO') return emp.estadoHoy === 'COMPLETADO';
      if (filtroEstado === 'SIN_REGISTRO') return emp.estadoHoy === 'SIN_REGISTRO';

      return true;
    });
  }, [empleadosData, searchQuery, filtroEstado]);

  // ==========================================
  // EXPORTACIONES DE REPORTES
  // ==========================================
  const handleExportGeneralPDF = async () => {
    setIsExporting(true);
    try {
      await ReportGenerator.exportReporteAsistenciaSemanalGeneralPDF(
        allAsistenciasSemana,
        personal,
        selectedMonday
      );
    } catch (err: any) {
      Alert.alert('Error al generar PDF', err.message || 'No se pudo generar el reporte.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportGeneralXLSX = async () => {
    setIsExporting(true);
    try {
      await ReportGenerator.exportReporteAsistenciaSemanalGeneralXLSX(
        allAsistenciasSemana,
        personal,
        selectedMonday
      );
    } catch (err: any) {
      Alert.alert('Error al exportar Excel', err.message || 'No se pudo generar el archivo.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportIndividualPDF = async () => {
    if (!selectedEmpleado) return;
    setIsExporting(true);
    try {
      await ReportGenerator.exportReporteAsistenciaEmpleadoPDF(
        asistenciasEmpleado,
        selectedEmpleado,
        selectedMonday
      );
    } catch (err: any) {
      Alert.alert('Error al exportar PDF', err.message || 'No se pudo generar el reporte.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportIndividualXLSX = async () => {
    if (!selectedEmpleado) return;
    setIsExporting(true);
    try {
      await ReportGenerator.exportReporteAsistenciaEmpleadoXLSX(
        asistenciasEmpleado,
        selectedEmpleado,
        selectedMonday
      );
    } catch (err: any) {
      Alert.alert('Error al exportar Excel', err.message || 'No se pudo generar el archivo.');
    } finally {
      setIsExporting(false);
    }
  };

  // ==========================================
  // LÓGICA DEL CHECADOR DEL ADMINISTRADOR
  // ==========================================
  const handleOpenChecadorAdmin = () => {
    setChecadorInstructionVisible(true);
  };

  const fetchLocationAndAddress = async () => {
    try {
      const loc = await Location.getLastKnownPositionAsync();
      let lat = loc?.coords?.latitude || 0;
      let lng = loc?.coords?.longitude || 0;

      if (lat && lng) {
        setCurrentLocation({ lat, lng });
      }

      const highLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (highLoc?.coords) {
        lat = highLoc.coords.latitude;
        lng = highLoc.coords.longitude;
        setCurrentLocation({ lat, lng });
      }

      if (!lat && !lng) {
        setCurrentAddress('Ubicación no disponible');
        return;
      }

      try {
        const reverse = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (reverse && reverse.length > 0) {
          const addr = reverse[0];
          const parts = [];
          if (addr.street || addr.streetNumber) parts.push(`${addr.street || ''} ${addr.streetNumber || ''}`.trim());
          if (addr.district) parts.push(addr.district);
          if (addr.city || addr.region) parts.push(`${addr.city || ''}, ${addr.region || ''}`.trim());
          setCurrentAddress(parts.join(', ') || 'Dirección registrada');
        } else {
          setCurrentAddress(`Coordenadas: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        }
      } catch {
        setCurrentAddress(`Coordenadas: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      }
    } catch (err: any) {
      console.warn('[Checador Admin] Error al obtener ubicación:', err.message || err);
      setCurrentAddress('Ubicación registrada');
    }
  };

  const handleStartCamera = async () => {
    setChecadorInstructionVisible(false);

    if (!cameraPermission?.granted) {
      const { granted } = await requestCameraPermission();
      if (!granted) {
        Alert.alert('Permiso requerido', 'Se necesita acceso a la cámara frontal para registrar la asistencia.');
        return;
      }
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Se necesita acceso a la ubicación para registrar la asistencia.');
      return;
    }

    setCurrentDateTime(new Date());
    if (dateIntervalRef.current) clearInterval(dateIntervalRef.current);
    dateIntervalRef.current = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);

    setChecadorCameraVisible(true);
    fetchLocationAndAddress();
  };

  const handleCaptureSelfie = async () => {
    if (!cameraRef.current || isCapturing || !authUser) return;
    setIsCapturing(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.3,
        base64: true,
        shutterSound: false,
      });

      let base64Data = photo?.base64;
      if (!base64Data && photo?.uri && photo.uri.startsWith('data:image')) {
        base64Data = photo.uri;
      }

      if (!base64Data) {
        throw new Error('No se pudo capturar la selfie.');
      }

      if (dateIntervalRef.current) clearInterval(dateIntervalRef.current);
      setChecadorCameraVisible(false);

      const isTurnoAbierto = !!(adminRegistroHoy?.hora_entrada && !adminRegistroHoy?.hora_salida);
      const tipoRegistro: 'entrada' | 'salida' = isTurnoAbierto ? 'salida' : 'entrada';

      const fotoUrl = await AsistenciaService.subirFotoAsistencia(authUser.id, base64Data, tipoRegistro);
      const lat = currentLocation?.lat || 0;
      const lng = currentLocation?.lng || 0;
      const addressToSave = currentAddress || 'Ubicación registrada';
      const fechaStr = AsistenciaService.getFechaJornada(new Date());

      if (tipoRegistro === 'entrada') {
        await AsistenciaService.registrarEntrada(
          authUser.id,
          fotoUrl,
          lat,
          lng,
          addressToSave
        );
        setChecadorResultMsg('Entrada registrada exitosamente en Inttec y Daravisa');
      } else {
        await AsistenciaService.registrarSalida(
          adminRegistroHoy?.id,
          fotoUrl,
          lat,
          lng,
          addressToSave,
          authUser.id,
          fechaStr
        );
        setChecadorResultMsg('Salida registrada exitosamente en Inttec y Daravisa');
      }

      setCapturedPhotoUri(photo.uri);
      setChecadorResultType(tipoRegistro);
      setChecadorResultVisible(true);

      // Recargar datos
      cargarEstadoChecadorAdmin();
      cargarDatosGenerales();
    } catch (err: any) {
      Alert.alert('Error al registrar checada', err.message || 'No se pudo procesar la asistencia.');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleCloseCamera = () => {
    if (dateIntervalRef.current) clearInterval(dateIntervalRef.current);
    setChecadorCameraVisible(false);
  };

  const formatChecadorTime = (date: Date) => {
    return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };

  const isAdminInActiveShift = !!(adminRegistroHoy?.hora_entrada && !adminRegistroHoy?.hora_salida);

  // ==========================================
  // RENDER: VISTA DETALLADA DE UN EMPLEADO
  // ==========================================
  if (selectedEmpleado) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        {/* Barra superior con botón volver */}
        <View style={[styles.headerToolbar, { backgroundColor: themeColors.backgroundElement, borderBottomColor: themeColors.border }]}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity
              style={[styles.backBtn, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}
              onPress={handleBackToList}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={18} color={themeColors.text} />
              <Text style={[styles.backBtnText, { color: themeColors.text }]}>Volver a la lista</Text>
            </TouchableOpacity>

            <View style={styles.topRightActions}>
              <TouchableOpacity
                style={[styles.quickCheckinBtn, { backgroundColor: isAdminInActiveShift ? '#ea580c' : '#16a34a' }]}
                onPress={handleOpenChecadorAdmin}
                activeOpacity={0.8}
              >
                <Ionicons name="camera-outline" size={16} color="#fff" />
                <Text style={styles.quickCheckinBtnText}>
                  {isAdminInActiveShift ? 'Checar Salida Admin' : 'Checar Asistencia Admin'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Tarjeta de Encabezado del Empleado */}
          <View style={[styles.employeeProfileCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <View style={styles.employeeProfileRow}>
              <View style={[styles.avatarLarge, { backgroundColor: themeColors.accent }]}>
                <Text style={styles.avatarLargeText}>
                  {(selectedEmpleado.nombre || 'E').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={[styles.employeeProfileName, { color: themeColors.text }]}>
                  {selectedEmpleado.nombre}
                </Text>
                <View style={styles.badgeRow}>
                  <View style={[styles.badgeItem, { backgroundColor: themeColors.accent + '20' }]}>
                    <Text style={[styles.badgeText, { color: themeColors.accent }]}>
                      {selectedEmpleado.rol || 'EMPLEADO'}
                    </Text>
                  </View>
                  {selectedEmpleado.sucursal && (
                    <View style={[styles.badgeItem, { backgroundColor: themeColors.border }]}>
                      <Text style={[styles.badgeText, { color: themeColors.textSecondary }]}>
                        📍 {selectedEmpleado.sucursal}
                      </Text>
                    </View>
                  )}
                </View>
                {selectedEmpleado.email && (
                  <Text style={[styles.employeeProfileEmail, { color: themeColors.textSecondary }]}>
                    ✉️ {selectedEmpleado.email}
                  </Text>
                )}
              </View>
            </View>

            {/* Acciones de exportación individual */}
            <View style={[styles.exportActionsRow, { borderTopColor: themeColors.border }]}>
              <CustomButton
                title={isExporting ? 'Generando...' : 'Descargar PDF'}
                onPress={handleExportIndividualPDF}
                variant="primary"
                disabled={isExporting}
                style={{ flex: 1, height: 38 }}
                icon={<Ionicons name="document-text-outline" size={16} color="#fff" style={{ marginRight: 6 }} />}
              />
              <CustomButton
                title={isExporting ? 'Generando...' : 'Descargar Excel'}
                onPress={handleExportIndividualXLSX}
                variant="success"
                disabled={isExporting}
                style={{ flex: 1, height: 38 }}
                icon={<Ionicons name="download-outline" size={16} color="#fff" style={{ marginRight: 6 }} />}
              />
            </View>
          </View>

          {/* Tarjeta con desglose semanal día a día del empleado */}
          <AsistenciaSemanalCard
            asistencias={asistenciasEmpleado}
            empleadoNombre={selectedEmpleado.nombre || 'Empleado'}
            isLoading={isLoadingEmpleadoDetalle}
            onRefresh={() => cargarAsistenciasEmpleado(selectedEmpleado.id, selectedMonday)}
            selectedMonday={selectedMonday}
            onChangeWeek={(newMonday) => {
              setSelectedMonday(newMonday);
              cargarAsistenciasEmpleado(selectedEmpleado.id, newMonday);
            }}
            onViewFoto={(info) => {
              setActivePreviewUrl(info.url);
              setSelectedAsistenciaInfo(info);
              setViewerVisible(true);
            }}
          />
        </ScrollView>

        {/* Visor de foto y mapa */}
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

        {/* Modal Selector de Período y Calendario */}
        <PeriodoPickerModal
          visible={periodoModalVisible}
          onClose={() => setPeriodoModalVisible(false)}
          selectedMonday={selectedMonday}
          onSelectMonday={(newMonday) => {
            setSelectedMonday(newMonday);
            setSelectedDayStr(null);
            if (selectedEmpleado) {
              cargarAsistenciasEmpleado(selectedEmpleado.id, newMonday);
            }
          }}
        />

        {/* Modales de checador del admin */}
        {renderModalesChecadorAdmin()}
      </View>
    );
  }

  // ==========================================
  // RENDER: VISTA PRINCIPAL (LISTA DE EMPLEADOS)
  // ==========================================
  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* 1. Header Toolbar Compacto y Unificado */}
      <View style={[styles.headerToolbar, { backgroundColor: themeColors.backgroundElement, borderBottomColor: themeColors.border }]}>
        {/* Fila superior: Navegador de Semanas + Acciones Principales */}
        <View style={styles.headerTopRow}>
          {/* Navegador de Semanas Moderno */}
          <View style={styles.weekNavCompact}>
            <TouchableOpacity
              style={[styles.weekNavBtnMini, { borderColor: themeColors.border, backgroundColor: themeColors.background }]}
              onPress={() => {
                const prevMonday = getPreviousWeekMonday(selectedMonday);
                setSelectedMonday(prevMonday);
                setSelectedDayStr(null);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={16} color={themeColors.text} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.weekNavCenterBadge, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}
              onPress={() => setPeriodoModalVisible(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="calendar" size={15} color={themeColors.accent} style={{ marginRight: 6 }} />
              <Text style={[styles.weekNavCurrentText, { color: themeColors.text }]}>
                {formatWeekTitle(rangeSemana)}
              </Text>
              {isCurrentWeek && (
                <View style={[styles.currentWeekTag, { backgroundColor: themeColors.accent + '20' }]}>
                  <Text style={[styles.currentWeekTagText, { color: themeColors.accent }]}>Actual</Text>
                </View>
              )}
              <Ionicons name="chevron-down" size={13} color={themeColors.textSecondary} style={{ marginLeft: 4 }} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.weekNavBtnMini, { borderColor: themeColors.border, backgroundColor: themeColors.background }]}
              onPress={() => {
                const nextMonday = getNextWeekMonday(selectedMonday);
                setSelectedMonday(nextMonday);
                setSelectedDayStr(null);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-forward" size={16} color={themeColors.text} />
            </TouchableOpacity>

            {!isCurrentWeek && (
              <TouchableOpacity
                onPress={() => {
                  setSelectedMonday(getWeekRange().mondayDate);
                  setSelectedDayStr(null);
                }}
                style={[styles.todayChipBtn, { backgroundColor: themeColors.accent + '20', borderColor: themeColors.accent + '40' }]}
                activeOpacity={0.7}
              >
                <Ionicons name="today-outline" size={13} color={themeColors.accent} style={{ marginRight: 4 }} />
                <Text style={[styles.todayChipBtnText, { color: themeColors.accent }]}>Hoy</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Botones de Acción: Checar Asistencia + Exportar PDF / Excel */}
          <View style={styles.topRightActions}>
            <TouchableOpacity
              style={[
                styles.quickCheckinBtn,
                { backgroundColor: isAdminInActiveShift ? '#ea580c' : '#16a34a' },
              ]}
              onPress={handleOpenChecadorAdmin}
              activeOpacity={0.8}
            >
              <View style={styles.pulseDot} />
              <Ionicons name="camera-outline" size={16} color="#fff" />
              <Text style={styles.quickCheckinBtnText}>
                {isAdminInActiveShift ? 'Checar Salida Admin' : 'Checar Asistencia'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.iconBtnHeader, { borderColor: themeColors.border, backgroundColor: themeColors.background }]}
              onPress={handleExportGeneralPDF}
              disabled={isExporting}
            >
              <Ionicons name="document-text-outline" size={18} color={themeColors.accent} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.iconBtnHeader, { borderColor: themeColors.border, backgroundColor: themeColors.background }]}
              onPress={handleExportGeneralXLSX}
              disabled={isExporting}
            >
              <Ionicons name="grid-outline" size={18} color="#16a34a" />
            </TouchableOpacity>
          </View>
        </View>

        {/* 2. Barra Interactiva de Días de la Semana (Weekly Day Strip) */}
        <View style={styles.weeklyStripWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.weeklyStripContainer}
          >
            {/* Opción para Ver Semana Completa */}
            <TouchableOpacity
              style={[
                styles.dayStripPill,
                selectedDayStr === null
                  ? { backgroundColor: themeColors.primary, borderColor: themeColors.primary }
                  : { backgroundColor: themeColors.background, borderColor: themeColors.border },
              ]}
              onPress={() => setSelectedDayStr(null)}
              activeOpacity={0.7}
            >
              <Ionicons
                name="calendar"
                size={13}
                color={selectedDayStr === null ? '#fff' : themeColors.textSecondary}
              />
              <Text
                style={[
                  styles.dayStripPillText,
                  { color: selectedDayStr === null ? '#fff' : themeColors.text },
                ]}
              >
                Toda la semana
              </Text>
              <View
                style={[
                  styles.dayStripPillHoursBadge,
                  { backgroundColor: selectedDayStr === null ? 'rgba(255,255,255,0.25)' : themeColors.border },
                ]}
              >
                <Text
                  style={[
                    styles.dayStripPillHoursText,
                    { color: selectedDayStr === null ? '#fff' : themeColors.textSecondary },
                  ]}
                >
                  {statsHoy.totalHorasSemana}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Los 7 Días de la Semana */}
            {diasSemanaInfo.map((day) => {
              const isSelected = selectedDayStr === day.dateStr;
              const isToday = day.isToday;

              return (
                <TouchableOpacity
                  key={day.dateStr}
                  style={[
                    styles.dayStripCard,
                    isSelected
                      ? { backgroundColor: themeColors.accent, borderColor: themeColors.accent }
                      : {
                          backgroundColor: themeColors.background,
                          borderColor: isToday ? themeColors.accent : themeColors.border,
                          borderWidth: isToday ? 2 : 1,
                        },
                  ]}
                  onPress={() => setSelectedDayStr(isSelected ? null : day.dateStr)}
                  activeOpacity={0.7}
                >
                  <View style={styles.dayStripCardHeader}>
                    <Text
                      style={[
                        styles.dayStripCardName,
                        {
                          color: isSelected
                            ? '#fff'
                            : isToday
                            ? themeColors.accent
                            : themeColors.textSecondary,
                        },
                      ]}
                    >
                      {day.dayName.slice(0, 3).toUpperCase()}
                    </Text>
                    {isToday && (
                      <View
                        style={[
                          styles.dayStripTodayBadge,
                          { backgroundColor: isSelected ? 'rgba(255,255,255,0.3)' : themeColors.accent + '25' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayStripTodayText,
                            { color: isSelected ? '#fff' : themeColors.accent },
                          ]}
                        >
                          HOY
                        </Text>
                      </View>
                    )}
                  </View>

                  <Text
                    style={[
                      styles.dayStripCardNum,
                      { color: isSelected ? '#fff' : themeColors.text },
                    ]}
                  >
                    {String(day.date.getDate()).padStart(2, '0')}
                  </Text>

                  <View style={styles.dayStripFooter}>
                    <View
                      style={[
                        styles.dayStripStatusDot,
                        {
                          backgroundColor: isSelected
                            ? '#fff'
                            : day.enTurnoCount > 0
                            ? '#eab308'
                            : day.empleadosCount > 0
                            ? '#16a34a'
                            : themeColors.border,
                        },
                      ]}
                    />
                    <Text
                      style={[
                        styles.dayStripCountText,
                        {
                          color: isSelected
                            ? 'rgba(255,255,255,0.95)'
                            : day.empleadosCount > 0
                            ? themeColors.text
                            : themeColors.textSecondary + '70',
                          fontWeight: day.empleadosCount > 0 ? '700' : '500',
                        },
                      ]}
                    >
                      {day.empleadosCount > 0 ? `${day.empleadosCount} asis.` : '0'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Banner informativo de día seleccionado */}
        {selectedDayInfo && (
          <View style={[styles.dayFilterBanner, { backgroundColor: themeColors.accent + '15', borderColor: themeColors.accent + '40' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <Ionicons name="filter" size={14} color={themeColors.accent} />
              <Text style={[styles.dayFilterBannerText, { color: themeColors.text }]}>
                Mostrando asistencia del <Text style={{ fontWeight: '800', color: themeColors.accent }}>{selectedDayInfo.dayName} {selectedDayInfo.shortDate}</Text> ({selectedDayInfo.empleadosCount} empleados checaron)
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setSelectedDayStr(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.dayFilterBannerClose}
            >
              <Ionicons name="close-circle" size={18} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Fila Inferior: Buscador y Filtros de Estado */}
        <View style={styles.headerFilterRow}>
          <View style={[styles.searchContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
            <Ionicons name="search" size={16} color={themeColors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: themeColors.text }]}
              placeholder="Buscar empleado..."
              placeholderTextColor={themeColors.textSecondary + '80'}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color={themeColors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
            <TouchableOpacity
              style={[
                styles.filterChip,
                filtroEstado === 'TODOS'
                  ? { backgroundColor: themeColors.primary, borderColor: themeColors.primary }
                  : { backgroundColor: themeColors.background, borderColor: themeColors.border },
              ]}
              onPress={() => setFiltroEstado('TODOS')}
            >
              <Text style={[styles.filterChipText, { color: filtroEstado === 'TODOS' ? '#fff' : themeColors.text }]}>
                Todos ({empleadosData.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterChip,
                filtroEstado === 'EN_TURNO'
                  ? { backgroundColor: '#16a34a', borderColor: '#16a34a' }
                  : { backgroundColor: themeColors.background, borderColor: themeColors.border },
              ]}
              onPress={() => setFiltroEstado('EN_TURNO')}
            >
              <View style={[styles.statusDot, { backgroundColor: filtroEstado === 'EN_TURNO' ? '#fff' : '#16a34a' }]} />
              <Text style={[styles.filterChipText, { color: filtroEstado === 'EN_TURNO' ? '#fff' : themeColors.text }]}>
                En Turno ({statsHoy.enTurno})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterChip,
                filtroEstado === 'COMPLETADO'
                  ? { backgroundColor: '#0284c7', borderColor: '#0284c7' }
                  : { backgroundColor: themeColors.background, borderColor: themeColors.border },
              ]}
              onPress={() => setFiltroEstado('COMPLETADO')}
            >
              <View style={[styles.statusDot, { backgroundColor: filtroEstado === 'COMPLETADO' ? '#fff' : '#0284c7' }]} />
              <Text style={[styles.filterChipText, { color: filtroEstado === 'COMPLETADO' ? '#fff' : themeColors.text }]}>
                Turno Cerrado ({statsHoy.completados})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterChip,
                filtroEstado === 'SIN_REGISTRO'
                  ? { backgroundColor: '#64748b', borderColor: '#64748b' }
                  : { backgroundColor: themeColors.background, borderColor: themeColors.border },
              ]}
              onPress={() => setFiltroEstado('SIN_REGISTRO')}
            >
              <View style={[styles.statusDot, { backgroundColor: filtroEstado === 'SIN_REGISTRO' ? '#fff' : '#64748b' }]} />
              <Text style={[styles.filterChipText, { color: filtroEstado === 'SIN_REGISTRO' ? '#fff' : themeColors.text }]}>
                Sin Checada ({statsHoy.sinRegistro})
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >

        {/* 5. Lista de Empleados con sus Horarios y Estado */}
        {isLoadingPersonal || isLoadingAsistencias ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={themeColors.primary} />
            <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>
              Cargando registros de asistencia del personal...
            </Text>
          </View>
        ) : filteredEmpleados.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <Ionicons name="person-outline" size={48} color={themeColors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: themeColors.text }]}>No se encontraron empleados</Text>
            <Text style={[styles.emptySubtitle, { color: themeColors.textSecondary }]}>
              {searchQuery ? 'Prueba con otros términos de búsqueda.' : 'No hay personal registrado en este criterio.'}
            </Text>
          </View>
        ) : (
          <View style={styles.employeeGrid}>
            {filteredEmpleados.map((emp) => {
              const isEnTurno = emp.estadoHoy === 'EN_TURNO';
              const isCompletado = emp.estadoHoy === 'COMPLETADO';

              return (
                <TouchableOpacity
                  key={emp.id}
                  style={[
                    styles.employeeCard,
                    {
                      backgroundColor: themeColors.backgroundElement,
                      borderColor: isEnTurno
                        ? '#16a34a80'
                        : isCompletado
                        ? '#0284c780'
                        : themeColors.border,
                    },
                  ]}
                  onPress={() => handleSelectEmpleado(emp)}
                  activeOpacity={0.7}
                >
                  {/* Top info */}
                  <View style={styles.employeeCardTop}>
                    <View style={[styles.avatarMedium, { backgroundColor: isEnTurno ? '#16a34a' : themeColors.accent }]}>
                      <Text style={styles.avatarMediumText}>
                        {(emp.nombre || 'E').charAt(0).toUpperCase()}
                      </Text>
                    </View>

                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.employeeCardName, { color: themeColors.text }]} numberOfLines={1}>
                        {emp.nombre}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <Text style={[styles.employeeCardRole, { color: themeColors.textSecondary }]}>
                          {emp.rol || 'EMPLEADO'}
                        </Text>
                        {emp.sucursal && (
                          <Text style={[styles.employeeCardSucursal, { color: themeColors.textSecondary }]}>
                            • {emp.sucursal}
                          </Text>
                        )}
                      </View>
                    </View>

                    {/* Badge de estado del día o de hoy */}
                    <View
                      style={[
                        styles.todayStatusBadge,
                        {
                          backgroundColor: isEnTurno
                            ? '#16a34a20'
                            : isCompletado
                            ? '#0284c720'
                            : '#64748b20',
                          borderColor: isEnTurno
                            ? '#16a34a'
                            : isCompletado
                            ? '#0284c7'
                            : '#64748b',
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.todayStatusDot,
                          {
                            backgroundColor: isEnTurno
                              ? '#16a34a'
                              : isCompletado
                              ? '#0284c7'
                              : '#64748b',
                          },
                        ]}
                      />
                      <Text
                        style={[
                          styles.todayStatusText,
                          {
                            color: isEnTurno
                              ? '#16a34a'
                              : isCompletado
                              ? '#0284c7'
                              : '#64748b',
                          },
                        ]}
                      >
                        {isEnTurno
                          ? 'EN TURNO'
                          : isCompletado
                          ? (selectedDayInfo ? 'ASISTENCIA' : 'SALIDA REGISTRADA')
                          : 'SIN CHECADA'}
                      </Text>
                    </View>
                  </View>

                  {/* Horarios del Día / Hoy */}
                  <View style={[styles.horariosHoyBox, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                    <View style={styles.horarioRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="log-in-outline" size={16} color="#16a34a" />
                        <Text style={[styles.horarioLabel, { color: themeColors.textSecondary }]}>
                          {selectedDayInfo ? `Entrada (${selectedDayInfo.dayName.slice(0, 3)}):` : 'Entrada Hoy:'}
                        </Text>
                      </View>
                      <Text style={[styles.horarioVal, { color: emp.ultimaEntrada ? '#16a34a' : themeColors.textSecondary }]}>
                        {emp.ultimaEntrada ? formatHoraDisplay(emp.ultimaEntrada) : 'Pendiente'}
                      </Text>
                    </View>

                    <View style={styles.horarioRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="log-out-outline" size={16} color="#ef4444" />
                        <Text style={[styles.horarioLabel, { color: themeColors.textSecondary }]}>
                          {selectedDayInfo ? `Salida (${selectedDayInfo.dayName.slice(0, 3)}):` : 'Salida Hoy:'}
                        </Text>
                      </View>
                      <Text style={[styles.horarioVal, { color: emp.ultimaSalida ? '#ef4444' : themeColors.textSecondary }]}>
                        {emp.ultimaSalida ? formatHoraDisplay(emp.ultimaSalida) : isEnTurno ? 'En curso...' : 'Sin registro'}
                      </Text>
                    </View>

                    {emp.direccionHoy && (
                      <View style={styles.direccionRow}>
                        <Ionicons name="location-outline" size={13} color={themeColors.textSecondary} />
                        <Text style={[styles.direccionText, { color: themeColors.textSecondary }]} numberOfLines={1}>
                          {emp.direccionHoy}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Footer con resumen semanal y botón de detalle */}
                  <View style={styles.employeeCardFooter}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                      <Ionicons name="time-outline" size={15} color={themeColors.textSecondary} />
                      <Text style={[styles.semanaHorasText, { color: themeColors.textSecondary }]}>
                        Semana: <Text style={{ fontWeight: '800', color: themeColors.text }}>{emp.totalHorasFormateadas || '0h 0m'}</Text>
                        {emp.diasTrabajados ? ` (${emp.diasTrabajados} d)` : ''}
                      </Text>
                      {emp.totalMinutosExtra > 0 && (
                        <View style={styles.cardExtraHoursBadge}>
                          <Ionicons name="flame" size={12} color="#ea580c" />
                          <Text style={styles.cardExtraHoursText}>+{emp.totalHorasExtraFormateadas} extra</Text>
                        </View>
                      )}
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={[styles.verDetalleText, { color: themeColors.accent }]}>Ver historial</Text>
                      <Ionicons name="chevron-forward" size={14} color={themeColors.accent} />
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Visor de foto y mapa */}
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

      {/* Modal Selector de Período y Calendario */}
      <PeriodoPickerModal
        visible={periodoModalVisible}
        onClose={() => setPeriodoModalVisible(false)}
        selectedMonday={selectedMonday}
        onSelectMonday={(newMonday) => {
          setSelectedMonday(newMonday);
          setSelectedDayStr(null);
        }}
      />

      {/* Modales de checador del admin */}
      {renderModalesChecadorAdmin()}
    </View>
  );

  // ==========================================
  // MODALES DEL AUTO-CHECADOR DEL ADMINISTRADOR
  // ==========================================
  function renderModalesChecadorAdmin() {
    return (
      <>
        {/* 1. Modal Instrucciones / Confirmación de Inicio */}
        <Modal
          statusBarTranslucent={true}
          animationType="slide"
          transparent={true}
          visible={checadorInstructionVisible}
          onRequestClose={() => setChecadorInstructionVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: themeColors.background, height: '60%' }]}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="finger-print" size={22} color={themeColors.primary} />
                  <Text style={[styles.modalTitle, { color: themeColors.text }]}>Checador Administrador</Text>
                </View>
                <TouchableOpacity onPress={() => setChecadorInstructionVisible(false)}>
                  <Ionicons name="close" size={24} color={themeColors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={[styles.modalScroll, { alignItems: 'center', paddingTop: Spacing.two }]}>
                <View
                  style={[
                    styles.checadorIconCircle,
                    { backgroundColor: isAdminInActiveShift ? '#ea580c15' : '#16a34a15' },
                  ]}
                >
                  <Ionicons
                    name={isAdminInActiveShift ? 'log-out' : 'camera'}
                    size={48}
                    color={isAdminInActiveShift ? '#ea580c' : '#16a34a'}
                  />
                </View>

                <Text style={[styles.checadorTitle, { color: themeColors.text }]}>
                  {isAdminInActiveShift ? 'Registrar Mi Salida' : 'Registrar Mi Entrada'}
                </Text>

                <Text style={[styles.checadorDesc, { color: themeColors.textSecondary }]}>
                  Se tomará una selfie con la cámara frontal para registrar tu asistencia como Administrador. También se verificará tu ubicación GPS.
                </Text>

                {isAdminInActiveShift && (
                  <View style={[styles.checadorStatusCard, { backgroundColor: '#ea580c15', borderColor: '#ea580c' }]}>
                    <Ionicons name="time" size={20} color="#ea580c" />
                    <Text style={[styles.checadorStatusText, { color: '#ea580c', marginLeft: 8 }]}>
                      Tu entrada fue registrada a las {formatHoraDisplay(adminRegistroHoy?.hora_entrada || '')}
                    </Text>
                  </View>
                )}

                <CustomButton
                  title={isAdminInActiveShift ? 'Abrir Cámara para Salida' : 'Abrir Cámara para Entrada'}
                  onPress={handleStartCamera}
                  variant={isAdminInActiveShift ? 'primary' : 'success'}
                  style={{ width: '100%', marginTop: Spacing.three }}
                  icon={<Ionicons name="camera-outline" size={20} color="#fff" style={{ marginRight: 8 }} />}
                />
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* 2. Modal Cámara Frontal en Vivo con Marca de Agua */}
        <Modal
          statusBarTranslucent={true}
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

            <SafeAreaView style={styles.cameraOverlay}>
              {/* Top bar de la cámara */}
              <View style={styles.watermarkTop}>
                <TouchableOpacity onPress={handleCloseCamera} style={styles.cameraCloseBtn}>
                  <Ionicons name="close" size={28} color="#fff" />
                </TouchableOpacity>
                <View
                  style={[
                    styles.watermarkBadge,
                    { backgroundColor: isAdminInActiveShift ? '#ea580c' : '#16a34a' },
                  ]}
                >
                  <Text style={styles.watermarkBadgeText}>
                    {isAdminInActiveShift ? '📤 REGISTRANDO SALIDA' : '📥 REGISTRANDO ENTRADA'}
                  </Text>
                </View>
              </View>

              {/* Bottom watermark & capture button */}
              <View style={styles.watermarkBottom}>
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

                {/* Tarjeta de marca de agua */}
                <View style={styles.watermarkOverlayCard}>
                  <View style={styles.watermarkLeftCol}>
                    <View style={styles.watermarkTimeDateRow}>
                      <Text style={styles.watermarkTimeText}>
                        {formatChecadorTime(currentDateTime).substring(0, 5)}
                      </Text>
                      <View style={styles.watermarkVerticalLine} />
                      <View style={styles.watermarkDateCol}>
                        <Text style={styles.watermarkDateText}>
                          {currentDateTime.toLocaleDateString('es-MX', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </Text>
                        <Text style={styles.watermarkDayText}>
                          {currentDateTime.toLocaleDateString('es-MX', { weekday: 'long' }).toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.watermarkAddressText} numberOfLines={2}>
                      📍 {currentAddress}
                    </Text>

                    <Text style={styles.watermarkEmployeeText}>
                      👤 {authUser?.nombre || 'Administrador'} (ADMIN)
                    </Text>
                  </View>
                </View>
              </View>
            </SafeAreaView>
          </View>
        </Modal>

        {/* 3. Modal Resultado Exitoso */}
        <Modal
          statusBarTranslucent={true}
          animationType="slide"
          transparent={true}
          visible={checadorResultVisible}
          onRequestClose={() => setChecadorResultVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: themeColors.background, height: '65%' }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Asistencia Registrada</Text>
                <TouchableOpacity onPress={() => setChecadorResultVisible(false)}>
                  <Ionicons name="close" size={24} color={themeColors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={[styles.modalScroll, { alignItems: 'center', paddingTop: Spacing.two }]}>
                <View
                  style={[
                    styles.checadorIconCircle,
                    { backgroundColor: checadorResultType === 'entrada' ? '#16a34a20' : '#ea580c20' },
                  ]}
                >
                  <Ionicons
                    name="checkmark-circle"
                    size={48}
                    color={checadorResultType === 'entrada' ? '#16a34a' : '#ea580c'}
                  />
                </View>

                <Text style={[styles.checadorTitle, { color: themeColors.text }]}>
                  {checadorResultType === 'entrada' ? '¡Entrada Exitosa!' : '¡Salida Exitosa!'}
                </Text>

                <Text style={[styles.checadorDesc, { color: themeColors.textSecondary }]}>
                  {checadorResultMsg}
                </Text>

                <View style={[styles.resultSummaryBox, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                  <View style={styles.resultRow}>
                    <Text style={[styles.resultLabel, { color: themeColors.textSecondary }]}>Usuario:</Text>
                    <Text style={[styles.resultVal, { color: themeColors.text }]}>{authUser?.nombre || 'Admin'}</Text>
                  </View>
                  <View style={styles.resultRow}>
                    <Text style={[styles.resultLabel, { color: themeColors.textSecondary }]}>Hora:</Text>
                    <Text style={[styles.resultVal, { color: '#00C3F3', fontWeight: 'bold' }]}>
                      {formatHoraDisplay(AsistenciaService.getHoraLocal())}
                    </Text>
                  </View>
                  <View style={styles.resultRow}>
                    <Text style={[styles.resultLabel, { color: themeColors.textSecondary }]}>Ubicación:</Text>
                    <Text style={[styles.resultVal, { color: themeColors.text }]} numberOfLines={2}>
                      {currentAddress}
                    </Text>
                  </View>
                </View>

                <CustomButton
                  title="Aceptar"
                  onPress={() => setChecadorResultVisible(false)}
                  variant="primary"
                  style={{ width: '100%', marginTop: Spacing.three }}
                />
              </ScrollView>
            </View>
          </View>
        </Modal>
      </>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerToolbar: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  weekNavCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  weekNavBtnMini: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  weekNavCenterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  weekNavCurrentText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  currentWeekTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 4,
  },
  currentWeekTagText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  todayChipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  todayChipBtnText: {
    fontSize: 11,
    fontWeight: '800',
  },
  weeklyStripWrapper: {
    marginVertical: 4,
  },
  weeklyStripContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  dayStripPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 52,
  },
  dayStripPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  dayStripPillHoursBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dayStripPillHoursText: {
    fontSize: 11,
    fontWeight: '700',
  },
  dayStripCard: {
    width: 62,
    minHeight: 56,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  dayStripCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    width: '100%',
  },
  dayStripCardName: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  dayStripTodayBadge: {
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 3,
  },
  dayStripTodayText: {
    fontSize: 7.5,
    fontWeight: '900',
  },
  dayStripCardNum: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 18,
  },
  dayStripFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    justifyContent: 'center',
    width: '100%',
  },
  dayStripStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dayStripCountText: {
    fontSize: 9.5,
  },
  dayFilterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 2,
  },
  dayFilterBannerText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dayFilterBannerClose: {
    padding: 2,
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickCheckinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#fff',
  },
  quickCheckinBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  iconBtnHeader: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  scrollContent: {
    padding: Spacing.three,
    paddingBottom: Spacing.five,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    minWidth: 180,
    flex: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  filterChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 13,
    marginTop: 12,
  },
  emptyCard: {
    padding: 36,
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  employeeGrid: {
    gap: Spacing.two,
  },
  employeeCard: {
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  employeeCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarMedium: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarMediumText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  employeeCardName: {
    fontSize: 15,
    fontWeight: '700',
  },
  employeeCardRole: {
    fontSize: 11,
    fontWeight: '600',
  },
  employeeCardSucursal: {
    fontSize: 11,
  },
  todayStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  todayStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  todayStatusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  horariosHoyBox: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginVertical: 10,
    gap: 4,
  },
  horarioRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  horarioLabel: {
    fontSize: 12,
  },
  horarioVal: {
    fontSize: 12,
    fontWeight: '700',
  },
  direccionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f030',
  },
  direccionText: {
    fontSize: 10,
    flex: 1,
  },
  employeeCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  semanaHorasText: {
    fontSize: 12,
  },
  cardExtraHoursBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ea580c18',
    borderColor: '#ea580c40',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  cardExtraHoursText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ea580c',
  },
  verDetalleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  employeeProfileCard: {
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    padding: 16,
    marginBottom: Spacing.two,
  },
  employeeProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarLarge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLargeText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  employeeProfileName: {
    fontSize: 17,
    fontWeight: '800',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  badgeItem: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  employeeProfileEmail: {
    fontSize: 11,
    marginTop: 4,
  },
  exportActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: BorderRadius.large,
    borderTopRightRadius: BorderRadius.large,
    padding: Spacing.three,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.two,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  modalScroll: {
    paddingBottom: Spacing.four,
  },
  checadorIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  checadorTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  checadorDesc: {
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  checadorStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    width: '100%',
    marginBottom: 10,
  },
  checadorStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  resultSummaryBox: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    width: '100%',
    gap: 6,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  resultLabel: {
    fontSize: 12,
  },
  resultVal: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraPreview: {
    flex: 1,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    padding: 16,
  },
  watermarkTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cameraCloseBtn: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  watermarkBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  watermarkBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  watermarkBottom: {
    alignItems: 'center',
    gap: 16,
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  captureBtnInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
  },
  watermarkOverlayCard: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 12,
    padding: 12,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  watermarkLeftCol: {
    gap: 4,
  },
  watermarkTimeDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  watermarkTimeText: {
    color: '#00C3F3',
    fontSize: 28,
    fontWeight: '900',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  watermarkVerticalLine: {
    width: 2,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  watermarkDateCol: {
    justifyContent: 'center',
  },
  watermarkDateText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  watermarkDayText: {
    color: '#00C3F3',
    fontSize: 10,
    fontWeight: '800',
  },
  watermarkAddressText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
  },
  watermarkEmployeeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});
