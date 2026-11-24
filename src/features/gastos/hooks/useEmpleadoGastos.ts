import { useEffect, useState, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  Gasto,
  AuthService,
  Usuario,
  Vehiculo,
  RegistroGasolina,
  VehiculoService,
  inttecClient,
  daravisaClient,
} from '@/services/supabase';
import { SyncService, OfflineGastoItem } from '@/services/sync';
import { getApiHeaders, getApiUrl } from '@/services/apiHelper';
import { TareasService } from '@/services/tareasService';
import { useAuth } from '@/context/AuthContext';
import { GastoDisplay } from '../types';

export function useEmpleadoGastos() {
  const router = useRouter();
  const { user, setUser, company, changeCompany, env, changeEnv } = useAuth();

  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [offlineGastos, setOfflineGastos] = useState<OfflineGastoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pendientes' | 'historial'>('pendientes');
  const [isSyncing, setIsSyncing] = useState(false);
  const [showTasksPopover, setShowTasksPopover] = useState(false);
  const [pendingTasksCount, setPendingTasksCount] = useState(0);
  const [hasNewTasks, setHasNewTasks] = useState(false);
  const [currentPendingIds, setCurrentPendingIds] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      const fetchPendingTasks = async () => {
        if (!user) return;
        try {
          const data = await TareasService.getTareas();
          const pending = (data || []).filter((t: any) =>
            t.status !== 'Completada' &&
            t.status !== 'Cancelada' &&
            (t.responsable_id === user.id || (t.corresponsables && t.corresponsables.some((c: any) => c.usuario_id === user.id)))
          );
          setPendingTasksCount(pending.length);

          const pendingIds = pending.map((t: any) => t.id);
          setCurrentPendingIds(pendingIds);

          if (pending.length > 0) {
            const seenTasksJson = await AsyncStorage.getItem(`seen_tasks_${user.id}`);
            const seenTasks = seenTasksJson ? JSON.parse(seenTasksJson) : [];
            const hasNew = pendingIds.some((id: string) => !seenTasks.includes(id));
            setHasNewTasks(hasNew);
          } else {
            setHasNewTasks(false);
          }
        } catch (error) {
          console.error('Error fetching tasks for badge', error);
        }
      };
      fetchPendingTasks();
    }, [user])
  );

  const handleOpenTasksPopover = async () => {
    setShowTasksPopover(true);
    if (hasNewTasks && user && currentPendingIds.length > 0) {
      try {
        await AsyncStorage.setItem(`seen_tasks_${user.id}`, JSON.stringify(currentPendingIds));
        setHasNewTasks(false);
      } catch (error) {
        console.error('Error saving seen tasks', error);
      }
    }
  };

  // Modal de Detalles
  const [selectedGasto, setSelectedGasto] = useState<GastoDisplay | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);

  // Feedback para Action Required
  const [repondFeedback, setRespondFeedback] = useState('');

  // Modal de Perfil
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [profilePhone, setProfilePhone] = useState('');
  const [profilePassword, setProfilePassword] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Vehículos y Gasolina
  const [employeeVehiculosModalVisible, setEmployeeVehiculosModalVisible] = useState(false);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [misRegistrosGasolina, setMisRegistrosGasolina] = useState<RegistroGasolina[]>([]);

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

      const { error: errorInttec } = await inttecClient
        .from('usuarios')
        .update(updates)
        .eq('id', user.id);
      if (errorInttec) throw errorInttec;

      const { error: errorDaravisa } = await daravisaClient
        .from('usuarios')
        .update(updates)
        .eq('id', user.id);
      if (errorDaravisa) {
        console.error('Error actualizando perfil en Daravisa:', errorDaravisa);
      }

      const updatedUser: Usuario = {
        ...user,
        telefono: updates.telefono,
      };

      setUser(updatedUser);
      await AsyncStorage.setItem(`logged_user_${company}`, JSON.stringify(updatedUser));

      Alert.alert('Éxito', 'Perfil actualizado correctamente.');
      setProfileModalVisible(false);
      setProfilePassword('');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo actualizar el perfil.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  async function refreshData(userId: string, silent = false) {
    if (!silent && gastos.length === 0) {
      setIsLoading(true);
    }
    try {
      const headers = await getApiHeaders();
      const [reportesRes, localQueue, activeVehicles, allGasLogs] = await Promise.all([
        fetch(`${getApiUrl()}/api/reportes/empleado`, { headers })
          .then(async (res) => {
            if (!res.ok) throw new Error('Error al obtener gastos');
            return res.json();
          })
          .catch((err) => {
            console.error('Error al obtener reportes de empleado:', err);
            return null;
          }),
        SyncService.getOfflineQueue().catch(() => []),
        VehiculoService.getVehiculos(true).catch(() => []),
        VehiculoService.getRegistrosGasolina().catch(() => []),
      ]);

      if (reportesRes?.gastos) {
        setGastos(reportesRes.gastos);
      }
      setOfflineGastos((localQueue || []).filter((item) => item.empleado_id === userId));
      setVehiculos(activeVehicles || []);
      const myGasLogs = (allGasLogs || []).filter((reg: any) => reg.empleado_id === userId);
      setMisRegistrosGasolina(myGasLogs);
    } catch (err: any) {
      console.error('Error al cargar datos:', err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }

  useEffect(() => {
    if (user?.id) {
      refreshData(user.id);
    }

    const unsubscribe = SyncService.initNetworkSyncListener((count) => {
      Alert.alert('Sincronizacion Exitosa', `Se han sincronizado ${count} gastos guardados offline.`);
      if (user?.id) refreshData(user.id);
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, env, user?.id]);

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

  const handleToggleCompany = async (nextCompany: 'inttec' | 'daravisa') => {
    await changeCompany(nextCompany);
  };

  // Filtrar Gastos por Pestaña
  const pendingList: GastoDisplay[] = [
    ...offlineGastos
      .filter((off) => !gastos.some((g) =>
        Number(g.monto) === Number(off.monto) &&
        (g.fecha_comprobante || '').split('T')[0] === (off.fecha_comprobante || '').split('T')[0] &&
        (g.justificacion || '').trim().toLowerCase() === (off.justificacion || '').trim().toLowerCase()
      ))
      .map((g) => ({ ...g, isOffline: true, status: 'PENDING' as const })),
    ...gastos.filter((g) => g.status === 'PENDING' || g.status === 'ACTION_REQUIRED'),
  ];

  const historyList = gastos.filter((g) => g.status === 'APPROVED' || g.status === 'REJECTED');

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
    const cleanStr = String(dateStr).trim();
    if (!cleanStr) return 'N/A';

    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleanStr)) {
      return cleanStr;
    }

    const dateOnly = cleanStr.split('T')[0].split(' ')[0].trim();
    const parts = dateOnly.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      const yyyy = parts[0];
      const mm = parts[1].padStart(2, '0');
      const dd = parts[2].padStart(2, '0');
      return `${dd}/${mm}/${yyyy}`;
    }
    return cleanStr;
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

  const getDestinoInfo = (gasto: any) => {
    if (!gasto) {
      return { tipo: 'HISTORICO' as const, label: 'Sin proyecto', sublabel: '' };
    }
    if (gasto.proyecto_rel?.nombre) {
      const sub = [gasto.proyecto_rel.cliente_nombre, gasto.proyecto_rel.sucursal_nombre]
        .filter(Boolean)
        .join(' • ');
      return {
        tipo: 'PROYECTO' as const,
        label: gasto.proyecto_rel.nombre,
        sublabel: sub,
      };
    }
    if (gasto.proyecto_id) {
      return {
        tipo: 'PROYECTO' as const,
        label: gasto.detalle_servicio_proyecto || 'Proyecto Asignado',
        sublabel: '',
      };
    }
    const matchSugerido = gasto.justificacion?.match(/\[Proyecto a agregar:\s*([^\]]+)\]/i);
    if (matchSugerido) {
      return {
        tipo: 'PROYECTO_SUGERIDO' as const,
        label: matchSugerido[1].trim(),
        sublabel: 'Pendiente de alta por Administración',
      };
    }
    if (gasto.tipo_gasto === 'PROYECTO') {
      return {
        tipo: 'PROYECTO_SUGERIDO' as const,
        label: gasto.detalle_servicio_proyecto || 'Proyecto sugerido',
        sublabel: 'Pendiente de alta por Administración',
      };
    }
    if (gasto.tipo_gasto === 'OPERATIVO' || gasto.tipo_servicio_proyecto === 'Operativo') {
      return {
        tipo: 'OPERATIVO' as const,
        label: 'Gasto Operativo / General',
        sublabel: gasto.detalle_servicio_proyecto || '',
      };
    }
    return {
      tipo: 'HISTORICO' as const,
      label: gasto.detalle_servicio_proyecto
        ? `Sin proyecto (${gasto.detalle_servicio_proyecto})`
        : 'Sin proyecto',
      sublabel: '',
    };
  };

  const getHospedajeInfo = (gasto: any) => {
    if (!gasto) {
      return {
        isHospedaje: false,
        fechaInicio: null,
        fechaFin: null,
        diasCount: 0,
        costoPorDia: 0,
        dias: [] as { id?: string; fecha: string; monto_diario: number }[],
      };
    }

    const rawDias: any[] = Array.isArray(gasto.hospedaje_dias) ? gasto.hospedaje_dias : [];
    const fInicio = gasto.fecha_hospedaje_inicio
      ? String(gasto.fecha_hospedaje_inicio).split('T')[0]
      : rawDias.length > 0
      ? String(rawDias[0].fecha).split('T')[0]
      : null;
    const fFin = gasto.fecha_hospedaje_fin
      ? String(gasto.fecha_hospedaje_fin).split('T')[0]
      : rawDias.length > 0
      ? String(rawDias[rawDias.length - 1].fecha).split('T')[0]
      : null;

    if (rawDias.length > 0) {
      const total = Number(gasto.monto) || 0;
      const count = rawDias.length;
      return {
        isHospedaje: true,
        fechaInicio: fInicio,
        fechaFin: fFin,
        diasCount: count,
        costoPorDia: count > 0 ? Math.round((total / count) * 100) / 100 : 0,
        dias: rawDias.map((d) => ({
          id: d.id,
          fecha: String(d.fecha).split('T')[0],
          monto_diario: Number(d.monto_diario) || 0,
        })),
      };
    }

    if (fInicio && fFin && /^\d{4}-\d{2}-\d{2}$/.test(fInicio) && /^\d{4}-\d{2}-\d{2}$/.test(fFin)) {
      const [sy, sm, sd] = fInicio.split('-').map(Number);
      const [ey, em, ed] = fFin.split('-').map(Number);
      const startD = new Date(sy, sm - 1, sd);
      const endD = new Date(ey, em - 1, ed);
      const diff = Math.max(1, Math.round((endD.getTime() - startD.getTime()) / 86400000));
      const total = Number(gasto.monto) || 0;
      const perDay = Math.round((total / diff) * 100) / 100;
      const calcDias: { fecha: string; monto_diario: number }[] = [];
      for (let i = 0; i < diff; i++) {
        const d = new Date(sy, sm - 1, sd + i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const isLast = i === diff - 1;
        calcDias.push({
          fecha: `${yyyy}-${mm}-${dd}`,
          monto_diario: isLast && total > 0 ? Math.max(0, Math.round((total - perDay * (diff - 1)) * 100) / 100) : perDay,
        });
      }
      return {
        isHospedaje: true,
        fechaInicio: fInicio,
        fechaFin: fFin,
        diasCount: diff,
        costoPorDia: perDay,
        dias: calcDias,
      };
    }

    return {
      isHospedaje: false,
      fechaInicio: null,
      fechaFin: null,
      diasCount: 0,
      costoPorDia: 0,
      dias: [] as { id?: string; fecha: string; monto_diario: number }[],
    };
  };

  return {
    router,
    user,
    company,
    env,
    changeEnv,
    gastos,
    offlineGastos,
    isLoading,
    activeTab,
    setActiveTab,
    isSyncing,
    showTasksPopover,
    setShowTasksPopover,
    pendingTasksCount,
    hasNewTasks,
    handleOpenTasksPopover,
    selectedGasto,
    setSelectedGasto,
    modalVisible,
    setModalVisible,
    viewerVisible,
    setViewerVisible,
    viewerInitialIndex,
    setViewerInitialIndex,
    activePreviewUrl,
    setActivePreviewUrl,
    repondFeedback,
    setRespondFeedback,
    profileModalVisible,
    setProfileModalVisible,
    profilePhone,
    setProfilePhone,
    profilePassword,
    setProfilePassword,
    isSavingProfile,
    handleOpenProfile,
    handleSaveProfile,
    employeeVehiculosModalVisible,
    setEmployeeVehiculosModalVisible,
    vehiculos,
    misRegistrosGasolina,
    refreshData,
    handleSyncManual,
    handleLogout,
    handleToggleCompany,
    pendingList,
    historyList,
    saldoPendiente,
    totalAprobado,
    formatCurrency,
    formatFriendlyDate,
    parseJustificacion,
    getDestinoInfo,
    getHospedajeInfo,
  };
}
