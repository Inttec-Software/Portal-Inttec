import React, { useEffect, useState, useMemo } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import CustomButton from '@/components/CustomButton';
import { getWeekRange } from '@/utils/asistenciaUtils';
import { ReportGenerator } from '@/utils/reportGenerator';
import EmpleadoAsistencia from '../(empleado)/asistencia';

export default function AdminAsistencia() {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { user: authUser, company } = useAuth();

  const [personal, setPersonal] = useState<Usuario[]>([]);
  const [isLoadingPersonal, setIsLoadingPersonal] = useState(true);

  // 'mi_asistencia' o el ID de un empleado seleccionado
  const [selectedEmpleadoId, setSelectedEmpleadoId] = useState<string>('mi_asistencia');
  const [empleadoSelectorVisible, setEmpleadoSelectorVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Semana seleccionada
  const [selectedMonday, setSelectedMonday] = useState<Date>(() => getWeekRange().mondayDate);
  const [asistenciasEmpleado, setAsistenciasEmpleado] = useState<Asistencia[]>([]);
  const [isLoadingAsistencias, setIsLoadingAsistencias] = useState(false);

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

  // Cargar lista de empleados
  useEffect(() => {
    cargarPersonal();
  }, [company]);

  const cargarPersonal = async () => {
    setIsLoadingPersonal(true);
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/reportes/admin/all`, { headers });
      if (res.ok) {
        const data = await res.json();
        const users = sortUsuariosByRoleAndName(data.usuarios || []);
        setPersonal(users);
      } else {
        const client = company === 'daravisa' ? daravisaClient : inttecClient;
        const { data: uData } = await client.from('usuarios').select('*').order('nombre');
        setPersonal(sortUsuariosByRoleAndName(uData || []));
      }
    } catch (err) {
      console.error('[Admin Asistencia] Error cargando personal:', err);
    } finally {
      setIsLoadingPersonal(false);
    }
  };

  // Empleado seleccionado objeto
  const selectedEmpleado = useMemo(() => {
    if (selectedEmpleadoId === 'mi_asistencia') return authUser;
    return personal.find((p) => p.id === selectedEmpleadoId) || null;
  }, [selectedEmpleadoId, personal, authUser]);

  // Cargar asistencias cuando cambia el empleado seleccionado o la semana
  useEffect(() => {
    if (selectedEmpleadoId !== 'mi_asistencia' && selectedEmpleado) {
      cargarAsistenciasEmpleado(selectedEmpleado.id, selectedMonday);
    }
  }, [selectedEmpleadoId, selectedMonday, selectedEmpleado]);

  const cargarAsistenciasEmpleado = async (empleadoId: string, monday: Date) => {
    setIsLoadingAsistencias(true);
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
    } finally {
      setIsLoadingAsistencias(false);
    }
  };

  // Filtro de empleados en el selector
  const filteredPersonal = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return personal;
    return personal.filter(
      (p) =>
        (p.nombre || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        (p.rol || '').toLowerCase().includes(q) ||
        (p.sucursal || '').toLowerCase().includes(q)
    );
  }, [personal, searchQuery]);

  // Exportar individual
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

  // Exportar general
  const handleExportGeneralPDF = async () => {
    setIsExporting(true);
    try {
      const range = getWeekRange(selectedMonday);
      const headers = await getApiHeaders();
      const res = await fetch(
        `${getApiUrl()}/api/reportes/admin/export/asistencias?startDate=${range.mondayStr}&endDate=${range.sundayStr}`,
        { headers }
      );
      const allAsistencias = res.ok ? await res.json() : [];
      await ReportGenerator.exportReporteAsistenciaSemanalGeneralPDF(
        allAsistencias || [],
        personal,
        selectedMonday
      );
    } catch (err: any) {
      Alert.alert('Error Reporte General PDF', err.message || 'No se pudo generar el reporte.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportGeneralXLSX = async () => {
    setIsExporting(true);
    try {
      const range = getWeekRange(selectedMonday);
      const headers = await getApiHeaders();
      const res = await fetch(
        `${getApiUrl()}/api/reportes/admin/export/asistencias?startDate=${range.mondayStr}&endDate=${range.sundayStr}`,
        { headers }
      );
      const allAsistencias = res.ok ? await res.json() : [];
      await ReportGenerator.exportReporteAsistenciaSemanalGeneralXLSX(
        allAsistencias || [],
        personal,
        selectedMonday
      );
    } catch (err: any) {
      Alert.alert('Error Reporte General Excel', err.message || 'No se pudo generar el archivo.');
    } finally {
      setIsExporting(false);
    }
  };

  // Si está viendo "Mi Asistencia", renderizar la vista de checador propio
  if (selectedEmpleadoId === 'mi_asistencia') {
    return (
      <View style={{ flex: 1 }}>
        {/* Barra superior de selector de empleado para administradores */}
        <View style={[styles.adminTopBar, { backgroundColor: themeColors.background, borderBottomColor: themeColors.border }]}>
          <TouchableOpacity
            style={[styles.selectorBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
            onPress={() => setEmpleadoSelectorVisible(true)}
            activeOpacity={0.7}
          >
            <View style={styles.selectorBtnLeft}>
              <View style={[styles.roleDot, { backgroundColor: themeColors.accent }]} />
              <Text style={[styles.selectorBtnText, { color: themeColors.text }]} numberOfLines={1}>
                Consultando: <Text style={{ fontWeight: '800' }}>Mi Asistencia (Personal)</Text>
              </Text>
            </View>
            <Ionicons name="people-outline" size={18} color={themeColors.accent} />
          </TouchableOpacity>

          <View style={styles.topActionsRow}>
            <TouchableOpacity
              style={[styles.reportQuickBtn, { borderColor: themeColors.accent }]}
              onPress={handleExportGeneralPDF}
              disabled={isExporting}
            >
              <Ionicons name="document-text-outline" size={14} color={themeColors.accent} style={{ marginRight: 4 }} />
              <Text style={[styles.reportQuickText, { color: themeColors.accent }]}>General PDF</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.reportQuickBtn, { borderColor: themeColors.success }]}
              onPress={handleExportGeneralXLSX}
              disabled={isExporting}
            >
              <Ionicons name="grid-outline" size={14} color={themeColors.success} style={{ marginRight: 4 }} />
              <Text style={[styles.reportQuickText, { color: themeColors.success }]}>General Excel</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Componente del checador del empleado (que ahora tiene la vista semanal y turnos continuos) */}
        <EmpleadoAsistencia />

        {/* Modal Selector de Empleados */}
        {renderEmpleadoSelectorModal()}
      </View>
    );
  }

  // Vista de consulta de un empleado seleccionado
  const gradientColors = scheme === 'dark'
    ? [themeColors.background, '#13283c'] as const
    : ['#f4f6f9', '#dce3ec'] as const;

  function renderEmpleadoSelectorModal() {
    return (
      <Modal statusBarTranslucent={true}
        animationType="slide"
        transparent={true}
        visible={empleadoSelectorVisible}
        onRequestClose={() => setEmpleadoSelectorVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, height: '75%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Seleccionar Personal</Text>
              <TouchableOpacity onPress={() => setEmpleadoSelectorVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            {/* Buscador */}
            <View style={[styles.searchBox, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
              <Ionicons name="search-outline" size={18} color={themeColors.textSecondary} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.searchInput, { color: themeColors.text }]}
                placeholder="Buscar por nombre, rol o sucursal..."
                placeholderTextColor={themeColors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                clearButtonMode="while-editing"
              />
            </View>

            <ScrollView contentContainerStyle={styles.selectorList}>
              {/* Opción: Mi Asistencia */}
              <TouchableOpacity
                style={[
                  styles.selectorItem,
                  {
                    backgroundColor:
                      selectedEmpleadoId === 'mi_asistencia'
                        ? themeColors.accent + '20'
                        : themeColors.backgroundElement,
                    borderColor:
                      selectedEmpleadoId === 'mi_asistencia'
                        ? themeColors.accent
                        : themeColors.border,
                  },
                ]}
                onPress={() => {
                  setSelectedEmpleadoId('mi_asistencia');
                  setEmpleadoSelectorVisible(false);
                }}
              >
                <View style={[styles.avatarCircle, { backgroundColor: themeColors.accent }]}>
                  <Ionicons name="person" size={18} color="#fff" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.selectorItemTitle, { color: themeColors.text }]}>
                    Mi Asistencia (Personal)
                  </Text>
                  <Text style={[styles.selectorItemSub, { color: themeColors.textSecondary }]}>
                    Registrar selfie y ver mis horas
                  </Text>
                </View>
                {selectedEmpleadoId === 'mi_asistencia' && (
                  <Ionicons name="checkmark-circle" size={20} color={themeColors.accent} />
                )}
              </TouchableOpacity>

              <View style={[styles.selectorDivider, { backgroundColor: themeColors.border }]} />

              {/* Lista de empleados */}
              {isLoadingPersonal ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={themeColors.accent} />
                </View>
              ) : (
                filteredPersonal.map((emp) => {
                  const isSelected = selectedEmpleadoId === emp.id;
                  return (
                    <TouchableOpacity
                      key={emp.id}
                      style={[
                        styles.selectorItem,
                        {
                          backgroundColor: isSelected
                            ? themeColors.accent + '20'
                            : themeColors.backgroundElement,
                          borderColor: isSelected ? themeColors.accent : themeColors.border,
                        },
                      ]}
                      onPress={() => {
                        setSelectedEmpleadoId(emp.id);
                        setEmpleadoSelectorVisible(false);
                      }}
                    >
                      <View style={[styles.avatarCircle, { backgroundColor: '#64748b' }]}>
                        <Text style={styles.avatarInitial}>
                          {(emp.nombre || 'E').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[styles.selectorItemTitle, { color: themeColors.text }]}>
                          {emp.nombre}
                        </Text>
                        <Text style={[styles.selectorItemSub, { color: themeColors.textSecondary }]}>
                          {emp.rol || 'EMPLEADO'} {emp.sucursal ? `• ${emp.sucursal}` : ''}
                        </Text>
                      </View>
                      {isSelected && (
                        <Ionicons name="checkmark-circle" size={20} color={themeColors.accent} />
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <LinearGradient colors={gradientColors} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        {/* Barra superior de selector */}
        <View style={[styles.adminTopBar, { backgroundColor: themeColors.background, borderBottomColor: themeColors.border }]}>
          <TouchableOpacity
            style={[styles.selectorBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
            onPress={() => setEmpleadoSelectorVisible(true)}
            activeOpacity={0.7}
          >
            <View style={styles.selectorBtnLeft}>
              <View style={[styles.roleDot, { backgroundColor: themeColors.success }]} />
              <Text style={[styles.selectorBtnText, { color: themeColors.text }]} numberOfLines={1}>
                Empleado: <Text style={{ fontWeight: '800' }}>{selectedEmpleado?.nombre || 'Seleccionar'}</Text>
              </Text>
            </View>
            <Ionicons name="chevron-down" size={18} color={themeColors.text} />
          </TouchableOpacity>

          <View style={styles.topActionsRow}>
            <TouchableOpacity
              style={[styles.reportQuickBtn, { borderColor: themeColors.accent }]}
              onPress={handleExportGeneralPDF}
              disabled={isExporting}
            >
              <Ionicons name="document-text-outline" size={14} color={themeColors.accent} style={{ marginRight: 4 }} />
              <Text style={[styles.reportQuickText, { color: themeColors.accent }]}>General PDF</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.reportQuickBtn, { borderColor: themeColors.success }]}
              onPress={handleExportGeneralXLSX}
              disabled={isExporting}
            >
              <Ionicons name="grid-outline" size={14} color={themeColors.success} style={{ marginRight: 4 }} />
              <Text style={[styles.reportQuickText, { color: themeColors.success }]}>General Excel</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.mainScroll}>
          {/* Tarjeta de Información del Empleado Seleccionado */}
          <View style={[styles.employeeHeaderCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <View style={styles.employeeHeaderInfo}>
              <View style={[styles.employeeAvatarLarge, { backgroundColor: themeColors.accent }]}>
                <Text style={styles.employeeAvatarLargeText}>
                  {(selectedEmpleado?.nombre || 'E').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.employeeHeaderName, { color: themeColors.text }]}>
                  {selectedEmpleado?.nombre}
                </Text>
                <View style={styles.employeeBadgesRow}>
                  <View style={[styles.badgePill, { backgroundColor: themeColors.accent + '20' }]}>
                    <Text style={[styles.badgePillText, { color: themeColors.accent }]}>
                      {selectedEmpleado?.rol || 'EMPLEADO'}
                    </Text>
                  </View>
                  {selectedEmpleado?.sucursal && (
                    <View style={[styles.badgePill, { backgroundColor: themeColors.border }]}>
                      <Text style={[styles.badgePillText, { color: themeColors.textSecondary }]}>
                        {selectedEmpleado.sucursal}
                      </Text>
                    </View>
                  )}
                </View>
                {selectedEmpleado?.email && (
                  <Text style={[styles.employeeEmailText, { color: themeColors.textSecondary }]}>
                    ✉️ {selectedEmpleado.email}
                  </Text>
                )}
              </View>
            </View>

            {/* Botones de Exportar Individual */}
            <View style={styles.employeeExportBtnsRow}>
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

          {/* Tarjeta de Resumen Semanal y Desglose de Horas del Empleado */}
          <AsistenciaSemanalCard
            asistencias={asistenciasEmpleado}
            empleadoNombre={selectedEmpleado?.nombre || 'Empleado'}
            isLoading={isLoadingAsistencias}
            onRefresh={() => {
              if (selectedEmpleado) {
                cargarAsistenciasEmpleado(selectedEmpleado.id, selectedMonday);
              }
            }}
            selectedMonday={selectedMonday}
            onChangeWeek={(newMonday) => {
              setSelectedMonday(newMonday);
            }}
            onViewFoto={(info) => {
              setActivePreviewUrl(info.url);
              setSelectedAsistenciaInfo({
                fecha: info.fecha,
                hora: info.hora,
                direccion: info.direccion,
                lat: info.lat,
                lng: info.lng,
                empleadoNombre: info.empleadoNombre,
                tipo: info.tipo,
              });
              setViewerVisible(true);
            }}
          />
        </ScrollView>

        {/* Modal Selector de Empleados */}
        {renderEmpleadoSelectorModal()}

        {/* Visor de Foto y Mapa con Zoom */}
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
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  adminTopBar: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    gap: Spacing.one,
  },
  selectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.two,
    paddingVertical: 10,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
  selectorBtnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  roleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  selectorBtnText: {
    fontSize: 13,
  },
  topActionsRow: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  reportQuickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
  },
  reportQuickText: {
    fontSize: 11,
    fontWeight: '700',
  },
  mainScroll: {
    padding: Spacing.two,
    paddingBottom: Spacing.five,
    width: '100%',
  },
  employeeHeaderCard: {
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    padding: Spacing.three,
    marginBottom: Spacing.two,
  },
  employeeHeaderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  employeeAvatarLarge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  employeeAvatarLargeText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  employeeHeaderName: {
    fontSize: 16,
    fontWeight: '800',
  },
  employeeBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  badgePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  employeeEmailText: {
    fontSize: 11,
    marginTop: 4,
  },
  employeeExportBtnsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.three,
    paddingTop: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
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
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    height: 42,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    marginBottom: Spacing.two,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
  },
  selectorList: {
    gap: Spacing.one,
    paddingBottom: Spacing.four,
  },
  selectorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.two,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  selectorItemTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  selectorItemSub: {
    fontSize: 11,
    marginTop: 2,
  },
  selectorDivider: {
    height: 1,
    marginVertical: Spacing.one,
  },
});
