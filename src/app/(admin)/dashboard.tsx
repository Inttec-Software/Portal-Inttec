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
  Alert,
  Image,
  Platform,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { supabase, Gasto, AuthService, Usuario } from '@/services/supabase';
import { ReportGenerator } from '@/utils/reportGenerator';
import ExpenseCard from '@/components/ExpenseCard';
import CustomButton from '@/components/CustomButton';
import CustomInput from '@/components/CustomInput';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AdminDashboard() {
  const router = useRouter();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

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

  // Modales de Acceso Rápido (Botones Extra)
  const [personalModalVisible, setPersonalModalVisible] = useState(false);
  const [reportsModalVisible, setReportsModalVisible] = useState(false);

  // Modal de Detalle/Revisión de Gasto
  const [selectedGasto, setSelectedGasto] = useState<Gasto | null>(null);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [rejectionFeedback, setRejectionFeedback] = useState('');
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

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

      const { data, error } = await supabase
        .from('usuarios')
        .update(updates)
        .eq('id', adminUser.id)
        .select()
        .single();

      if (error) throw error;

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
  }, []);

  const refreshData = async () => {
    setIsLoading(true);
    try {
      // 1. Obtener TODOS los gastos
      const { data: gastosData, error: gastosErr } = await supabase
        .from('gastos')
        .select('*')
        .order('created_at', { ascending: false });

      if (gastosErr) throw gastosErr;
      setGastos(gastosData || []);

      // 2. Obtener lista de personal (usuarios)
      const { data: usersData, error: usersErr } = await supabase
        .from('usuarios')
        .select('id, nombre, email, rol, telefono, created_at')
        .order('nombre');

      if (usersErr) throw usersErr;
      setPersonal(usersData || []);
    } catch (err: any) {
      console.error('Error loading admin data:', err);
      Alert.alert('Error', err.message || 'No se pudieron recuperar los datos.');
    } finally {
      setIsLoading(false);
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

  // Acciones de Revisión de Gastos
  const handleUpdateStatus = async (status: 'APPROVED' | 'REJECTED' | 'ACTION_REQUIRED') => {
    if (!selectedGasto || !adminUser) return;
    
    if (status === 'ACTION_REQUIRED' && !rejectionFeedback.trim()) {
      Alert.alert('Observación requerida', 'Por favor escribe una duda o comentario para devolver el gasto.');
      return;
    }

    setIsProcessingAction(true);
    try {
      const updatePayload: Partial<Gasto> = { status };
      
      if (status === 'APPROVED') {
        updatePayload.approved_at = new Date().toISOString();
      } else if (status === 'ACTION_REQUIRED') {
        updatePayload.rejection_feedback = rejectionFeedback.trim();
      }

      const { error } = await supabase
        .from('gastos')
        .update(updatePayload)
        .eq('id', selectedGasto.id);

      if (error) throw error;

      // Generar registro de auditoría
      await supabase.from('audit_logs').insert([
        {
          action: status === 'APPROVED' ? 'APPROVE' : status === 'REJECTED' ? 'REJECT' : 'UPDATE',
          actor_id: adminUser.id,
          target_id: selectedGasto.id,
          details: `Gasto por ${selectedGasto.monto} revisado por Admin. Estado final: ${status}`,
        },
      ]);

      Alert.alert('Éxito', `El gasto ha sido marcado como ${status === 'APPROVED' ? 'Aprobado' : status === 'REJECTED' ? 'Rechazado' : 'Acción Requerida'}.`);
      setReviewModalVisible(false);
      setSelectedGasto(null);
      setRejectionFeedback('');
      setShowFeedbackInput(false);
      await refreshData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo procesar la acción de revisión.');
    } finally {
      setIsProcessingAction(false);
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
      const { error } = await supabase.from('usuarios').insert([
        {
          nombre: newUserName.trim(),
          email: newUserEmail.trim().toLowerCase(),
          password: newUserPassword,
          rol: newUserRole,
          telefono: newUserPhone.trim() || null,
        },
      ]);

      if (error) throw error;

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

      const { error } = await supabase
        .from('usuarios')
        .update(updatePayload)
        .eq('id', editingUser.id);

      if (error) throw error;

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
        const { error } = await supabase.from('usuarios').delete().eq('id', id);
        if (error) {
          if (error.code === '23503') {
            throw new Error('No se puede eliminar a este empleado porque tiene gastos o evidencias de trabajo registradas. Para no alterar el historial contable e informes pasados de la empresa, te sugerimos editar su perfil y cambiar sus accesos (correo/contraseña) si deseas inhabilitar su cuenta.');
          }
          throw error;
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

  // Exportar reportes
  const handleExportPDF = async () => {
    try {
      await ReportGenerator.exportToPDF(gastos, 'Historial General de Gastos INTTEC');
    } catch (err: any) {
      Alert.alert('Error PDF', err.message);
    }
  };

  const handleExportCSV = async () => {
    try {
      await ReportGenerator.exportToCSV(gastos, 'historial_gastos_inttec.csv');
    } catch (err: any) {
      Alert.alert('Error CSV', err.message);
    }
  };

  // Filtrados por pestañas
  const pendingGastos = gastos.filter((g) => g.status === 'PENDING');
  const historyGastos = gastos.filter((g) => g.status === 'APPROVED' || g.status === 'REJECTED' || g.status === 'ACTION_REQUIRED');

  // Totales
  const totalPendientes = pendingGastos.reduce((sum, g) => sum + Number(g.monto), 0);
  const totalAprobados = gastos.filter((g) => g.status === 'APPROVED').reduce((sum, g) => sum + Number(g.monto), 0);

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
          <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]}>TOTAL PENDIENTES</Text>
          <Text style={[styles.summaryValue, { color: themeColors.warning }]}>{formatCurrency(totalPendientes)}</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
          <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]}>TOTAL APROBADO</Text>
          <Text style={[styles.summaryValue, { color: themeColors.success }]}>{formatCurrency(totalAprobados)}</Text>
        </View>
      </View>

      {/* Botones de Administración Extra */}
      <View style={styles.quickActionsContainer}>
        <TouchableOpacity
          onPress={() => setPersonalModalVisible(true)}
          style={[styles.quickActionBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
        >
          <View style={[styles.quickActionIconBg, { backgroundColor: themeColors.accent + '15' }]}>
            <Ionicons name="people-sharp" size={18} color={themeColors.accent} />
          </View>
          <Text style={[styles.quickActionLabel, { color: themeColors.text }]}>Personal</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setReportsModalVisible(true)}
          style={[styles.quickActionBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
        >
          <View style={[styles.quickActionIconBg, { backgroundColor: themeColors.success + '15' }]}>
            <Ionicons name="document-text-sharp" size={18} color={themeColors.success} />
          </View>
          <Text style={[styles.quickActionLabel, { color: themeColors.text }]}>Reportes</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/(admin)/evidencias')}
          style={[styles.quickActionBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
        >
          <View style={[styles.quickActionIconBg, { backgroundColor: themeColors.actionRequired + '15' }]}>
            <Ionicons name="briefcase-sharp" size={18} color={themeColors.actionRequired} />
          </View>
          <Text style={[styles.quickActionLabel, { color: themeColors.text }]}>Evidencias</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/(admin)/catalogos')}
          style={[styles.quickActionBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
        >
          <View style={[styles.quickActionIconBg, { backgroundColor: themeColors.warning + '15' }]}>
            <Ionicons name="options-sharp" size={18} color={themeColors.warning} />
          </View>
          <Text style={[styles.quickActionLabel, { color: themeColors.text }]}>Catálogos</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs Simplificadas a 2 */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          onPress={() => setActiveTab('pendientes')}
          style={[
            styles.tab,
            activeTab === 'pendientes'
              ? { backgroundColor: themeColors.accent, borderColor: themeColors.accent }
              : { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
          ]}
        >
          <Text style={[styles.tabText, { color: activeTab === 'pendientes' ? '#ffffff' : themeColors.textSecondary }]}>
            Revisar ({pendingGastos.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('historial')}
          style={[
            styles.tab,
            activeTab === 'historial'
              ? { backgroundColor: themeColors.accent, borderColor: themeColors.accent }
              : { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
          ]}
        >
          <Text style={[styles.tabText, { color: activeTab === 'historial' ? '#ffffff' : themeColors.textSecondary }]}>
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
          )}

          {/* HISTORIAL */}
          {activeTab === 'historial' && (
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
        </View>
      )}

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
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, height: '45%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Exportar Reportes</Text>
              <TouchableOpacity onPress={() => setReportsModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.reportContent}>
              <View style={[styles.configCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                <Ionicons name="document-text" size={32} color={themeColors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.configCardTitle, { color: themeColors.text }]}>Exportar en PDF</Text>
                  <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>
                    Informe estructurado con gráficos de balance organizacional.
                  </Text>
                </View>
                <CustomButton title="PDF" onPress={handleExportPDF} style={styles.exportBtn} />
              </View>

              <View style={[styles.configCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                <Ionicons name="grid" size={32} color={themeColors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.configCardTitle, { color: themeColors.text }]}>Exportar en CSV</Text>
                  <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>
                    Descarga en formato tabular óptimo para Microsoft Excel.
                  </Text>
                </View>
                <CustomButton title="CSV" onPress={handleExportCSV} variant="success" style={styles.exportBtn} />
              </View>
            </View>
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
                  <View style={styles.modalImageContainer}>
                    <Image source={{ uri: selectedGasto.foto_url }} style={styles.modalImage} resizeMode="contain" />
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

                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Proveedor / Sucursal</Text>
                    <Text style={[styles.detailValue, { color: themeColors.text }]}>
                      {selectedGasto.proveedor || 'N/A'} {selectedGasto.sucursal ? `(Sucursal: ${selectedGasto.sucursal})` : ''}
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
                          <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Pago / Justificación</Text>
                          <Text style={[styles.detailValue, { color: themeColors.text }]}>
                            Método: {selectedGasto.metodo_pago} {selectedGasto.tipo_tarjeta ? `(${selectedGasto.tipo_tarjeta})` : ''}
                            {'\n'}Justificación: {parsed.justificacion || 'No especificada'}
                          </Text>
                        </View>
                      </>
                    );
                  })()}

                  {/* Acciones para gastos PENDIENTES */}
                  {selectedGasto.status === 'PENDING' && (
                    <View style={styles.reviewActions}>
                      {!showFeedbackInput ? (
                        <>
                          <View style={styles.rowActions}>
                            <CustomButton
                              title="Aprobar"
                              onPress={() => handleUpdateStatus('APPROVED')}
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
                        </>
                      ) : (
                        <View style={styles.feedbackForm}>
                          <CustomInput
                            label="Duda / Comentario para el Empleado"
                            placeholder="Escribe la justificación o información faltante requerida..."
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
                    <View style={[styles.resolvedBadge, { backgroundColor: themeColors.backgroundSelected }]}>
                      <Text style={[styles.resolvedText, { color: themeColors.text }]}>
                        Estado de Revisión: {selectedGasto.status}
                      </Text>
                      {selectedGasto.rejection_feedback && (
                        <Text style={{ color: themeColors.textSecondary, fontSize: 13, marginTop: 4 }}>
                          Feedback enviado: "{selectedGasto.rejection_feedback}"
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              </ScrollView>
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
                placeholder="correo@inttec.com"
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
                placeholder="correo@inttec.com"
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
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 4,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  tab: {
    flex: 1,
    height: 40,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
    borderColor: '#eee',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  tabActive: {
    backgroundColor: '#0d1b2a',
    borderColor: '#0d1b2a',
  },
  tabText: {
    fontSize: 13,
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
});
