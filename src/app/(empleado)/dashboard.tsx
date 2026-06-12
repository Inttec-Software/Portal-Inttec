import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useColorScheme,
  Alert,
  Image,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { supabase, Gasto, AuthService, Usuario } from '@/services/supabase';
import { SyncService, OfflineGastoItem } from '@/services/sync';
import ExpenseCard from '@/components/ExpenseCard';
import CustomButton from '@/components/CustomButton';
import CustomInput from '@/components/CustomInput';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  
  // Feedback para Action Required
  const [repondFeedback, setRespondFeedback] = useState('');
  const [isSubmittingResponse, setIsSubmittingResponse] = useState(false);

  // Modal de Perfil
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [profilePhone, setProfilePhone] = useState('');
  const [profilePassword, setProfilePassword] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

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
        {/* Registrar Gasto */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push('/(empleado)/formulario')}
          style={[styles.fab, { backgroundColor: themeColors.accent }]}
        >
          <Ionicons name="receipt" size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>

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
                  <View style={styles.modalImageContainer}>
                    <Image
                      source={{
                        uri: selectedGasto.foto_url || `data:image/jpeg;base64,${(selectedGasto as any).base64Foto}`,
                      }}
                      style={styles.modalImage}
                      resizeMode="contain"
                    />
                  </View>
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
});
