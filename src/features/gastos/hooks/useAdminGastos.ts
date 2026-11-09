import { logger } from '@/utils/logger';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Alert,
  Platform,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Colors } from '@/constants/theme';
import {
  Gasto,
  GastoHelper,
  AuthService,
  Usuario,
  Asistencia,
  AsistenciaService,
  Venta,
  recalculateVentaTotals,
  Vehiculo,
  RegistroGasolina,
  VehiculoService,
  ProveedorItem,
  sortUsuariosByRoleAndName,
  supabase,
  inttecClient,
  daravisaClient,
} from '@/services/supabase';
import { CatalogService } from '@/services/catalogService';
import { ReportGenerator } from '@/utils/reportGenerator';
import { getWeekRange, getPreviousWeekMonday, getNextWeekMonday } from '@/utils/asistenciaUtils';
import { useAuth } from '@/context/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { PushNotificationService } from '@/services/pushNotifications';
import { getApiHeaders, getApiUrl } from '@/services/apiHelper';
import { exportFacturaCfdiToPdf } from '@/utils/cfdiPdfGenerator';
import { PartidaEditable } from '../types';

export const TIPOS_PROYECTO = ['Servicio', 'Proyecto', 'Venta', 'Operativo'];

export function useAdminGastos() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { width: windowWidth } = useWindowDimensions();
  const isMobile = windowWidth < 600;
  const isDesktop = Platform.OS === 'web' && windowWidth >= 1024;
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { setUser, company, changeCompany, env, changeEnv } = useAuth();

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
  const [pendingFilter, setPendingFilter] = useState<'TODOS' | 'NUEVOS' | 'FACTURA_DETECTADA'>('TODOS');

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [backendTotals, setBackendTotals] = useState<{
    totalPendientes: number;
    totalAprobados: number;
    countPendientes: number;
    countAprobados: number;
    countDevueltosFactura?: number;
    countConFacturaDetectada?: number;
  } | null>(null);
  const catalogsLoadedRef = React.useRef(false);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  // Buscador y Filtro por Calendario (Día Único o Rango de Fechas)
  const [searchQuery, setSearchQuery] = useState('');
  const [startDateFilter, setStartDateFilter] = useState<string | null>(null);
  const [endDateFilter, setEndDateFilter] = useState<string | null>(null);
  const [dateFilterModalVisible, setDateFilterModalVisible] = useState(false);

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
  const [feedbackActionType, setFeedbackActionType] = useState<'REJECTED' | 'ACTION_REQUIRED'>('ACTION_REQUIRED');
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);
  const [isUploadingInvoice, setIsUploadingInvoice] = useState(false);
  const [prevSelectedGastoId, setPrevSelectedGastoId] = useState<string | undefined>(undefined);
  const [localMotivo, setLocalMotivo] = useState('');
  const [isUpdatingEstadoReembolso, setIsUpdatingEstadoReembolso] = useState(false);
  const [isExportingSatPdf, setIsExportingSatPdf] = useState(false);
  const [isAttachingSatFactura, setIsAttachingSatFactura] = useState(false);
  const [isDismissingSatFactura, setIsDismissingSatFactura] = useState(false);
  const [satFacturaPreviewModalVisible, setSatFacturaPreviewModalVisible] = useState(false);
  const [satFacturaToPreview, setSatFacturaToPreview] = useState<any | null>(null);

  if (selectedGasto?.id !== prevSelectedGastoId) {
    setPrevSelectedGastoId(selectedGasto?.id);
    setLocalMotivo(selectedGasto?.motivo_sin_factura || '');
  }

  // Selector Rápido de Proveedor en Menú de Gasto
  const [proveedoresCatalog, setProveedoresCatalog] = useState<ProveedorItem[]>([]);
  const [quickEditProvModalVisible, setQuickEditProvModalVisible] = useState(false);
  const [quickEditProvSearch, setQuickEditProvSearch] = useState('');
  const [isSavingQuickProv, setIsSavingQuickProv] = useState(false);
  const [showNewProvInQuickModal, setShowNewProvInQuickModal] = useState(false);
  const [newQuickProvName, setNewQuickProvName] = useState('');
  const [newQuickProvRfc, setNewQuickProvRfc] = useState('');

  // Edición Rápida de Otros Campos del Gasto (Monto, Fecha, Categoría, Cliente, Servicio, Pago/Comentarios)
  const [quickEditFieldType, setQuickEditFieldType] = useState<'monto' | 'fecha' | 'categoria' | 'cliente' | 'servicio' | 'pago' | 'comentarios' | null>(null);
  const [quickEditFieldModalVisible, setQuickEditFieldModalVisible] = useState(false);
  const [isSavingQuickField, setIsSavingQuickField] = useState(false);

  // Valores temporales para edición rápida
  const [tempMonto, setTempMonto] = useState('');
  const [tempFecha, setTempFecha] = useState('');
  const [calViewYear, setCalViewYear] = useState(new Date().getFullYear());
  const [calViewMonth, setCalViewMonth] = useState(new Date().getMonth());
  const [tempCatId, setTempCatId] = useState('');
  const [tempSubcatId, setTempSubcatId] = useState('');
  const [tempCliId, setTempCliId] = useState('');
  const [tempSucId, setTempSucId] = useState('');
  const [quickCliSearch, setQuickCliSearch] = useState('');
  const [tempTipoProyecto, setTempTipoProyecto] = useState('');
  const [tempDetalleProyecto, setTempDetalleProyecto] = useState('');
  const [tempMetodoPago, setTempMetodoPago] = useState<'efectivo' | 'tarjeta' | 'tarjeta_credito' | 'tarjeta_debito' | 'transferencia' | 'monedero_electronico'>('efectivo');
  const [tempTipoTarjeta, setTempTipoTarjeta] = useState<'BBVA' | 'AMEX' | 'MARRIOT' | 'BANORTE' | 'INVEX' | 'MERCADO PAGO' | 'HILTON' | null>(null);
  const [tempComentarios, setTempComentarios] = useState('');

  // Catálogos adicionales para edición rápida
  const [categoriasCatalog, setCategoriasCatalog] = useState<any[]>([]);
  const [subcategoriasCatalog, setSubcategoriasCatalog] = useState<any[]>([]);
  const [sucursalesCatalog, setSucursalesCatalog] = useState<any[]>([]);

  // Registro y Edición de Usuario (Personal)
  const [addUserModalVisible, setAddUserModalVisible] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserRole, setNewUserRole] = useState<'EMPLEADO' | 'ADMIN' | 'DEV'>('EMPLEADO');
  const [isAddingUser, setIsAddingUser] = useState(false);

  const [editingUser, setEditingUser] = useState<Usuario | null>(null);
  const [editUserModalVisible, setEditUserModalVisible] = useState(false);
  const [editUserName, setEditUserName] = useState('');
  const [editUserEmail, setEditUserEmail] = useState('');
  const [editUserPassword, setEditUserPassword] = useState('');
  const [editUserPhone, setEditUserPhone] = useState('');
  const [editUserRole, setEditUserRole] = useState<'EMPLEADO' | 'ADMIN' | 'DEV'>('EMPLEADO');
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
  const [asistenciaSelectedMonday, setAsistenciaSelectedMonday] = useState<Date>(() => getWeekRange().mondayDate);
  const [isExportingAsistencia, setIsExportingAsistencia] = useState(false);
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
  const [isRelinkingSaleMode, setIsRelinkingSaleMode] = useState(false);
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

  const [quickSaleSucursal, setQuickSaleSucursal] = useState('');
  const [showQuickSaleSucursalDropdown, setShowQuickSaleSucursalDropdown] = useState(false);
  const [quickSaleSucursalSearch, setQuickSaleSucursalSearch] = useState('');

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
    const normalize = (str?: any) => {
      if (!str) return '';
      return String(str).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    };
    const tokens = normalize(linkSaleSearch).split(/\s+/).filter(Boolean);
    return salesForLinking.filter((s) => {
      const combined = normalize(
        `${s.cliente || ''} ${s.sucursal || ''} ${s.factura_referencia || ''} ${s.tipo_proyecto || ''} ${s.descripcion || ''} ${s.folio || ''} ${s.fecha || ''} ${s.proveedor || ''}`
      );
      return tokens.every((t) => combined.includes(t));
    });
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
      await AsyncStorage.setItem(`logged_user_${company}`, JSON.stringify(updatedUser));

      showAlert('Éxito', 'Perfil actualizado correctamente.');
      setProfileModalVisible(false);
      setProfilePassword('');
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo actualizar el perfil.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const refreshData = useCallback(async (silent = false) => {
    // Solo mostrar spinner central si no hay datos previos cargados
    if (!silent && gastos.length === 0) {
      setIsLoading(true);
    }
    try {
      const headers = await getApiHeaders();
      const apiUrl = getApiUrl();
      const skipCat = catalogsLoadedRef.current;
      const queryParams = new URLSearchParams({
        page: String(currentPage),
        limit: String(pageSize),
        tab: activeTab,
        facturaFilter,
        pendingFilter,
        search: debouncedSearchQuery,
        startDate: startDateFilter || '',
        endDate: endDateFilter || '',
        skipCatalogs: skipCat ? 'true' : 'false',
      });
      const fetchUrl = `${apiUrl}/api/reportes/admin/all?${queryParams.toString()}`;

      // Ejecutar la petición principal y catálogos en paralelo
      const [res, catRes] = await Promise.all([
        fetch(fetchUrl, { headers }),
        !skipCat ? fetch(`${apiUrl}/api/reportes/form-catalogs`, { headers }).catch(() => null) : Promise.resolve(null),
      ]);

      if (res.status === 401) {
         // Token expirado o nulo, forzar logout
         await require('@/services/supabase').AuthService.logout();
         require('expo-router').router.replace('/');
         return;
      }

      if (!res.ok) {
         const errText = await res.text();
         throw new Error(`HTTP ${res.status} en ${fetchUrl} - Detalle: ${errText}`);
      }
      const data = await res.json();

      setGastos(data.gastos || []);
      if (data.pagination) {
        setTotalPages(data.pagination.totalPages || 1);
        setTotalCount(data.pagination.total || 0);
      } else {
        setTotalPages(1);
        setTotalCount((data.gastos || []).length);
      }
      if (data.totals) {
        setBackendTotals(data.totals);
      }
      if (!skipCat) {
        if (data.proveedores) setProveedoresCatalog(data.proveedores);
        if (data.usuarios) setPersonal(sortUsuariosByRoleAndName(data.usuarios));
        if (data.vehiculos) setVehiculos(data.vehiculos);
        if (data.registrosGasolina || data.gasLogs) setRegistrosGasolina(data.registrosGasolina || data.gasLogs || []);
        catalogsLoadedRef.current = true;
      }

      // Procesar catálogos que se ejecutaron en paralelo
      if (catRes && catRes.ok) {
        try {
          const catData = await catRes.json();
          if (catData.categorias) setCategoriasCatalog(catData.categorias);
          if (catData.subcategorias) setSubcategoriasCatalog(catData.subcategorias);
          if (catData.clientes) setClientesCatalog(catData.clientes);
          if (catData.sucursales) setSucursalesCatalog(catData.sucursales);
          if (catData.proveedores && catData.proveedores.length > 0) setProveedoresCatalog(catData.proveedores);
        } catch (_) {}
      }
    } catch (err: any) {
      logger.error('Error loading admin data:', err);
      if (!silent) {
        Alert.alert('Error', err.message || 'No se pudieron recuperar los datos.');
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [currentPage, pageSize, activeTab, facturaFilter, pendingFilter, debouncedSearchQuery, startDateFilter, endDateFilter, gastos.length]);

  // Debounce de búsqueda para consulta al servidor
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Recargar al cambiar de página, tamaño, pestaña o filtros
  useEffect(() => {
    if (adminUser) {
      refreshData();
    }
  }, [adminUser, refreshData]);

  useFocusEffect(
    useCallback(() => {
      if (adminUser) {
        refreshData(true);
      }
    }, [adminUser, refreshData])
  );

  useEffect(() => {
    const checkAdmin = async () => {
      const user = await AuthService.getCurrentUser();
      if (!user || (user.rol !== 'ADMIN' && user.rol !== 'DEV')) {
        router.replace('/');
        return;
      }
      setAdminUser(user);
    };

    checkAdmin();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, env]);

  // Manejar navegación directa a un gasto específico o búsqueda desde Ventas u otros módulos
  useEffect(() => {
    if (params.search && typeof params.search === 'string') {
      setSearchQuery(params.search);
      setActiveTab('historial');
    }
    if (params.gastoId && typeof params.gastoId === 'string') {
      setActiveTab('historial');
      const gId = params.gastoId;
      const found = gastos.find(g => String(g.id) === String(gId));
      if (found) {
        setSelectedGasto(found);
        setReviewModalVisible(true);
      } else {
        (async () => {
          try {
            const { data } = await supabase.from('gastos').select('*').eq('id', gId).single();
            if (data) {
              setSelectedGasto(data);
              setReviewModalVisible(true);
            }
          } catch (err) {
            console.warn('Error loading single gasto for detail:', err);
          }
        })();
      }
    }
  }, [params.search, params.gastoId, gastos]);

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
    if (!just) return { alerta: null, proveedorSugerido: null, justificacion: '' };
    let remaining = just;
    let alerta: string | null = null;
    let proveedorSugerido: string | null = null;

    const alertaMatch = remaining.match(/^\[ALERTA IA:\s*([\s\S]*?)\]\s*\n\s*/);
    if (alertaMatch) {
      alerta = alertaMatch[1];
      remaining = remaining.replace(alertaMatch[0], '');
    }

    const provMatch = remaining.match(/\[Proveedor a agregar:\s*([^\]]+)\]\s*\n?/);
    if (provMatch) {
      proveedorSugerido = provMatch[1].trim();
      remaining = remaining.replace(provMatch[0], '');
    }

    return { alerta, proveedorSugerido, justificacion: remaining.trim() };
  };

  // Acciones de Revisión de Gastos
  const handleUpdateStatus = async (status: 'APPROVED' | 'REJECTED' | 'ACTION_REQUIRED' | 'PENDING') => {
    if (!selectedGasto || !adminUser) return;

    const provName = GastoHelper.getProveedor(selectedGasto);
    if (status === 'APPROVED' && (!provName || !provName.trim())) {
      showAlert(
        'Indicar Proveedor',
        'No se puede aprobar este gasto porque el proveedor se encuentra en blanco.\n\nPor favor, edita el gasto y asigna un proveedor antes de aprobarlo.'
      );
      return;
    }

    if ((status === 'ACTION_REQUIRED' || status === 'REJECTED') && !rejectionFeedback.trim()) {
      showAlert('Observación requerida', 'Por favor escribe una duda o motivo para esta acción.');
      return;
    }

    const targetGastoId = selectedGasto.id;
    setIsProcessingAction(true);
    try {
      const oldVentaId = selectedGasto.venta_id;
      const updatePayload: Partial<Gasto> = { status };

      if (status === 'APPROVED') {
        updatePayload.approved_at = new Date().toISOString();
        updatePayload.rejection_feedback = `[Aprobado por ${adminUser.nombre}]`;
        updatePayload.devuelto_por_factura = false;
        updatePayload.factura_sugerida_id = null;
      } else {
        // Regla de negocio: NUNCA desvincular venta_id al devolver a PENDING o ACTION_REQUIRED; solo si es REJECTED
        if (status === 'REJECTED') {
          updatePayload.venta_id = null;
          updatePayload.rejection_feedback = `[Rechazado por ${adminUser.nombre}] ${rejectionFeedback.trim()}`;
        } else if (status === 'ACTION_REQUIRED') {
          updatePayload.rejection_feedback = `[Devuelto por ${adminUser.nombre}] ${rejectionFeedback.trim()}`;
        } else if (status === 'PENDING') {
          updatePayload.approved_at = null;
          updatePayload.rejection_feedback = null;
          updatePayload.devuelto_por_factura = false;
        }
      }

      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/reportes/gastos/${selectedGasto.id}/status`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          status,
          payload: updatePayload,
          actor_id: adminUser.id,
          monto: selectedGasto.monto
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || 'Error al actualizar el estado del gasto');
      }

      if (oldVentaId) {
        await recalculateVentaTotals(oldVentaId);
      }

      let friendlyStatus = 'Acción Requerida';
      if (status === 'APPROVED') friendlyStatus = 'Aprobado';
      else if (status === 'REJECTED') friendlyStatus = 'Rechazado';
      else if (status === 'PENDING') friendlyStatus = 'Reversado (Pendiente)';

      PushNotificationService.sendPushNotification(
        selectedGasto.empleado_id,
        `Gasto ${friendlyStatus}`,
        `Tu gasto por ${formatCurrency(selectedGasto.monto)} ha sido marcado como ${friendlyStatus}.`
      );

      showAlert('Éxito', `El gasto ha sido marcado como ${friendlyStatus}.`);
      setReviewModalVisible(false);
      setSelectedGasto(null);
      setRejectionFeedback('');
      setShowFeedbackInput(false);

      if (activeTab === 'pendientes' && status !== 'PENDING') {
        setGastos(prev => prev.filter(g => g.id !== targetGastoId));
      } else if (activeTab === 'historial' && status === 'PENDING') {
        setGastos(prev => prev.filter(g => g.id !== targetGastoId));
      } else {
        setGastos(prev => prev.map(g => g.id === targetGastoId ? {
          ...g,
          status,
          approved_at: updatePayload.approved_at !== undefined ? updatePayload.approved_at : g.approved_at,
          rejection_feedback: updatePayload.rejection_feedback !== undefined ? updatePayload.rejection_feedback : g.rejection_feedback,
          venta_id: updatePayload.venta_id !== undefined ? updatePayload.venta_id : g.venta_id,
        } : g));
      }
      await refreshData(true);

    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo procesar la acción de revisión.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const loadSalesForLinking = async () => {
    setIsLoadingSalesForLinking(true);
    try {
      let loadedVentas: any[] = [];
      try {
        const headers = await getApiHeaders();
        const res = await fetch(`${getApiUrl()}/api/reportes/admin/ventas?limit=5000`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.ventas) && data.ventas.length > 0) {
            loadedVentas = data.ventas;
            if (data.clientes) setClientesCatalog(data.clientes);
            if (data.sucursales) setSucursalesCatalog(data.sucursales);
          }
        }
      } catch (apiErr) {
        console.warn('Backend ventas load failed, using Supabase fallback:', apiErr);
      }

      // Fallback a Supabase para cargar TODO el registro histórico de ventas
      if (loadedVentas.length === 0) {
        const { data: dbVentas } = await supabase
          .from('ventas')
          .select('*')
          .order('created_at', { ascending: false });
        if (dbVentas) loadedVentas = dbVentas;
      }

      setSalesForLinking(loadedVentas);
    } catch (err) {
      logger.error('Error loading sales for linking:', err);
    } finally {
      setIsLoadingSalesForLinking(false);
    }
  };

  const handleApproveClick = () => {
    if (!selectedGasto) return;
    const provName = GastoHelper.getProveedor(selectedGasto);
    if (!provName || !provName.trim()) {
      showAlert(
        'Indicar Proveedor',
        'No se puede aprobar este gasto porque el proveedor se encuentra en blanco.\n\nPor favor, edita el gasto y asigna un proveedor antes de aprobarlo.'
      );
      return;
    }
    // Si el gasto fue devuelto de Historial por detección de factura recibida, enviarlo aprobado directamente conservando su venta_id
    if (selectedGasto.devuelto_por_factura) {
      executeApproveGasto(selectedGasto.venta_id || null);
      return;
    }
    setIsRelinkingSaleMode(false);
    setLinkSaleSearch('');
    setIsQuickSaleFormVisible(false);
    setIsLinkSaleModalVisible(true);
    loadSalesForLinking();
  };

  const handlePreviewSatFactura = (factura: any) => {
    if (!factura) return;
    setSatFacturaToPreview(factura);
    setSatFacturaPreviewModalVisible(true);
  };

  const handleDownloadSatFacturaPdf = async (factura: any) => {
    if (!factura) return;
    setIsExportingSatPdf(true);
    try {
      await exportFacturaCfdiToPdf({ factura });
    } catch (err: any) {
      showAlert('Error PDF', err.message || 'No se pudo generar el PDF de la factura recibida.');
    } finally {
      setIsExportingSatPdf(false);
    }
  };

  const handleAttachSatFacturaAndSend = async (factura: any, approveDirectly: boolean) => {
    if (!selectedGasto || !adminUser || !factura) return;

    if (approveDirectly) {
      const provName = GastoHelper.getProveedor(selectedGasto);
      if (!provName || !provName.trim()) {
        showAlert(
          'Indicar Proveedor',
          'Antes de aprobar directamente, por favor asigna el proveedor de este gasto con el botón de arriba.'
        );
        return;
      }
    }

    const targetGastoId = selectedGasto.id;
    setIsAttachingSatFactura(true);
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/reportes/gastos/${selectedGasto.id}/attach-sat-factura`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          factura_id: factura.id,
          approve_directly: approveDirectly,
          actor_id: adminUser.id,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al vincular la factura recibida al gasto');
      }

      const data = await res.json();
      const updatedGasto: Gasto = data.gasto || {
        ...selectedGasto,
        facturado: true,
        motivo_sin_factura: null,
        factura_recibida_id: factura.id,
        factura_sugerida_id: null,
        factura_recibida_rel: factura,
        factura_sugerida_rel: null,
        devuelto_por_factura: approveDirectly ? false : selectedGasto.devuelto_por_factura,
        status: approveDirectly ? 'APPROVED' : selectedGasto.status,
      };

      if (approveDirectly) {
        showAlert(
          'Éxito',
          'La factura recibida se ha agregado al gasto y se ha enviado directamente a Historial (Aprobado).'
        );
        setReviewModalVisible(false);
        setSelectedGasto(null);
        setRejectionFeedback('');
        setShowFeedbackInput(false);
        if (activeTab === 'pendientes') {
          setGastos(prev => prev.filter(g => g.id !== targetGastoId));
        } else {
          setGastos(prev => prev.map(g => g.id === targetGastoId ? updatedGasto : g));
        }
      } else {
        setSelectedGasto(updatedGasto);
        setGastos(prev => prev.map(g => g.id === targetGastoId ? updatedGasto : g));
        showAlert('Factura Agregada', 'La factura recibida ha quedado vinculada a este gasto como Facturado.');
      }

      await refreshData(true);
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo vincular la factura recibida.');
    } finally {
      setIsAttachingSatFactura(false);
    }
  };

  const handleDismissSatFactura = async (factura: any) => {
    if (!selectedGasto || !adminUser || !factura) return;

    const confirmMsg = selectedGasto.devuelto_por_factura
      ? '¿Confirmas que esta factura recibida NO corresponde a este gasto? La sugerencia se descartará y el gasto regresará a Historial con factura pendiente.'
      : '¿Confirmas que esta factura recibida NO coincide con este gasto? El aviso de coincidencia se ocultará para esta factura.';

    const doDismiss = async () => {
      const targetGastoId = selectedGasto.id;
      setIsDismissingSatFactura(true);
      try {
        const headers = await getApiHeaders();
        const res = await fetch(`${getApiUrl()}/api/reportes/gastos/${selectedGasto.id}/dismiss-sat-factura`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            factura_id: factura.id,
            actor_id: adminUser.id,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Error al descartar la factura sugerida');
        }

        const data = await res.json();
        if (data.returnedToHistory) {
          showAlert('Factura Descartada', 'El gasto ha sido devuelto a Historial manteniendo su estado de factura pendiente.');
          setReviewModalVisible(false);
          setSelectedGasto(null);
          if (activeTab === 'pendientes') {
            setGastos(prev => prev.filter(g => g.id !== targetGastoId));
          }
        } else if (data.gasto) {
          setSelectedGasto(data.gasto);
          setGastos(prev => prev.map(g => g.id === targetGastoId ? data.gasto : g));
          showAlert('Aviso Descartado', 'Se ha descartado la coincidencia con esa factura.');
        }
        await refreshData(true);
      } catch (err: any) {
        showAlert('Error', err.message || 'No se pudo descartar la factura.');
      } finally {
        setIsDismissingSatFactura(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) {
        await doDismiss();
      }
    } else {
      Alert.alert('Descartar Coincidencia', confirmMsg, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'No coincide (Descartar)', style: 'destructive', onPress: doDismiss },
      ]);
    }
  };

  // Abrir modal para Vincular o Cambiar Venta de un gasto
  const handleOpenRelinkSaleModal = (gasto: Gasto | null) => {
    if (!gasto) return;
    setSelectedGasto(gasto);
    setIsRelinkingSaleMode(true);
    setLinkSaleSearch('');
    setIsQuickSaleFormVisible(false);
    setIsLinkSaleModalVisible(true);
    loadSalesForLinking();
  };

  // Ejecutar cambio de vinculación con venta (o desvinculación si newVentaId es null)
  const executeRelinkGastoVenta = async (newVentaId: string | null) => {
    if (!selectedGasto || !adminUser) return;
    setIsProcessingAction(true);
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/reportes/gastos/${selectedGasto.id}/relink-venta`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          venta_id: newVentaId,
          actor_id: adminUser.id,
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al reasignar venta');
      }

      const resData = await res.json();
      const foundVenta = newVentaId ? salesForLinking.find(v => v.id === newVentaId) : null;
      const updatedGasto: Gasto = {
        ...selectedGasto,
        venta_id: newVentaId,
        venta_rel: foundVenta ? {
          id: foundVenta.id,
          cliente: foundVenta.cliente,
          fecha: foundVenta.fecha,
          sucursal: foundVenta.sucursal,
          tipo_proyecto: foundVenta.tipo_proyecto,
          factura_referencia: foundVenta.factura_referencia,
          precio_total_facturado: foundVenta.precio_total_facturado,
        } : (resData.venta_rel || null)
      };

      setSelectedGasto(updatedGasto);
      setGastos(prev => prev.map(g => g.id === selectedGasto.id ? updatedGasto : g));

      showAlert(
        'Éxito',
        newVentaId
          ? `Gasto vinculado exitosamente a la venta de ${foundVenta?.cliente || 'la venta seleccionada'}.`
          : 'Gasto desvinculado de la venta exitosamente. Los costos se han recalculado.'
      );
      setIsLinkSaleModalVisible(false);
      setIsRelinkingSaleMode(false);
      await refreshData(true);
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo vincular/desvincular el gasto.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Desvincular de venta directamente con confirmación
  const handleDirectUnlinkSale = (gasto: Gasto | null) => {
    if (!gasto) return;
    const doUnlink = () => {
      executeRelinkGastoVenta(null);
    };

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        '¿Estás seguro de que deseas desvincular este gasto de la venta actual? El costo y utilidad de la venta se recalcularán automáticamente.'
      );
      if (confirmed) doUnlink();
    } else {
      Alert.alert(
        'Desvincular Venta',
        '¿Estás seguro de que deseas desvincular este gasto de la venta actual? El costo y utilidad de la venta se recalcularán automáticamente.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Desvincular', style: 'destructive', onPress: doUnlink }
        ]
      );
    }
  };

  const executeApproveGasto = async (ventaId: string | null) => {
    if (!selectedGasto || !adminUser) return;
    const provName = GastoHelper.getProveedor(selectedGasto);
    if (!provName || !provName.trim()) {
      showAlert(
        'Indicar Proveedor',
        'No se puede aprobar este gasto porque el proveedor se encuentra en blanco. Por favor edita el gasto para indicar el proveedor.'
      );
      return;
    }

    const targetGastoId = selectedGasto.id;
    setIsProcessingAction(true);
    try {
      const updatePayload: Partial<Gasto> = {
        status: 'APPROVED',
        approved_at: selectedGasto.approved_at || new Date().toISOString(),
        venta_id: ventaId,
        rejection_feedback: `[Aprobado por ${adminUser.nombre}]`,
        devuelto_por_factura: false,
        factura_sugerida_id: null,
      };

      const headers = await getApiHeaders();
      const dbRes = await fetch(`${getApiUrl()}/api/reportes/gastos/${selectedGasto.id}/status`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          status: 'APPROVED',
          payload: updatePayload,
          actor_id: adminUser.id,
          monto: selectedGasto.monto,
          audit_details: `Gasto por ${selectedGasto.monto} aprobado por Admin.${ventaId ? ` Vinculado a venta ID: ${ventaId}.` : ''}`
        })
      });

      if (!dbRes.ok) throw new Error('Error al aprobar gasto en la BD');

      if (ventaId) {
        await recalculateVentaTotals(ventaId);
      }

      PushNotificationService.sendPushNotification(
        selectedGasto.empleado_id,
        `Gasto Aprobado`,
        `Tu gasto por ${formatCurrency(selectedGasto.monto)} ha sido aprobado.`
      );

      showAlert('Éxito', `El gasto ha sido enviado a Historial (Aprobado).${ventaId ? ' Venta vinculada conservada.' : ''}`);
      setReviewModalVisible(false);
      setSelectedGasto(null);
      setRejectionFeedback('');
      setShowFeedbackInput(false);

      if (activeTab === 'pendientes') {
        setGastos(prev => prev.filter(g => g.id !== targetGastoId));
      } else {
        setGastos(prev => prev.map(g => g.id === targetGastoId ? {
          ...g,
          status: 'APPROVED',
          approved_at: updatePayload.approved_at || new Date().toISOString(),
          venta_id: ventaId,
          devuelto_por_factura: false,
          factura_sugerida_id: null,
          factura_sugerida_rel: null,
        } : g));
      }
      await refreshData(true);

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
      const arrayBuffer = base64Data;

      const { error: uploadError } = await supabase.storage
        .from('tickets')
        .upload(fileName, arrayBuffer, { contentType, upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('tickets').getPublicUrl(fileName);
      const newInvoiceUrl = urlData.publicUrl;
      const existingUrls = GastoHelper.getFacturaUrls(selectedGasto);
      const combinedUrls = [...existingUrls, newInvoiceUrl].join(',');

      // Actualizar en base de datos a través de la API
      const headers = await getApiHeaders();
      const dbRes = await fetch(`${getApiUrl()}/api/reportes/gastos/${selectedGasto.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          facturado: true,
          factura_url: combinedUrls,
          motivo_sin_factura: null
        })
      });

      if (!dbRes.ok) throw new Error('Error actualizando gasto en la BD');

      // Actualizar estado local (si tenía factura sugerida, pasarla a factura_recibida_rel)
      const updatedGasto: Gasto = {
        ...selectedGasto,
        facturado: true,
        factura_url: combinedUrls,
        motivo_sin_factura: null,
        factura_recibida_id: selectedGasto.factura_sugerida_id || selectedGasto.factura_recibida_id,
        factura_recibida_rel: selectedGasto.factura_sugerida_rel || selectedGasto.factura_recibida_rel,
        factura_sugerida_id: null,
        factura_sugerida_rel: null,
      };
      setSelectedGasto(updatedGasto);
      setGastos(prev => prev.map(g => g.id === selectedGasto.id ? updatedGasto : g));

      showAlert(
        'Éxito',
        selectedGasto.devuelto_por_factura
          ? 'Factura cargada correctamente. Ahora puedes darle a "Volver a Enviar a Historial (Aprobar Directo)".'
          : 'Factura cargada y registrada correctamente.'
      );
    } catch (err: any) {
      logger.error('Error al subir factura:', err);
      showAlert('Error', err.message || 'No se pudo subir la factura.');
    } finally {
      setIsUploadingInvoice(false);
    }
  };

  // Manejo de Edición Rápida de Proveedor desde el Menú de Gasto
  const handleOpenQuickEditProveedor = (gasto: Gasto | null) => {
    if (!gasto) return;
    setSelectedGasto(gasto);
    setQuickEditProvSearch('');
    setShowNewProvInQuickModal(false);
    setNewQuickProvName('');
    setNewQuickProvRfc('');
    setQuickEditProvModalVisible(true);
  };

  const handleSelectQuickProveedor = async (prov: ProveedorItem | null) => {
    if (!selectedGasto) return;
    setIsSavingQuickProv(true);
    try {
      let cleanJust = selectedGasto.justificacion || '';
      if (prov && cleanJust) {
        cleanJust = cleanJust.replace(/\[Proveedor a agregar:\s*[^\]]+\]\s*\n?/, '').trim();
      }

      const updatePayload: any = {
        proveedor_id: prov ? prov.id : null,
        justificacion: cleanJust || null,
      };

      const { error: dbError } = await supabase
        .from('gastos')
        .update(updatePayload)
        .eq('id', selectedGasto.id);

      if (dbError) throw dbError;

      const updatedGasto: Gasto = {
        ...selectedGasto,
        proveedor_id: prov ? prov.id : null,
        proveedor: prov ? prov.nombre : null,
        proveedor_rel: prov ? { id: prov.id, nombre: prov.nombre } : null,
        justificacion: cleanJust || null,
      };

      setSelectedGasto(updatedGasto);
      setGastos(prev => prev.map(g => g.id === selectedGasto.id ? updatedGasto : g));

      setQuickEditProvModalVisible(false);
      showAlert('Éxito', prov ? `Proveedor asignado: "${prov.nombre}"` : 'Proveedor removido.');
    } catch (err: any) {
      logger.error('Error al actualizar proveedor:', err);
      showAlert('Error', err.message || 'No se pudo actualizar el proveedor.');
    } finally {
      setIsSavingQuickProv(false);
    }
  };

  const handleQuickCreateProveedorAndAssign = async (nombreToCreate?: string, rfcToCreate?: string) => {
    if (!selectedGasto) return;
    const name = (nombreToCreate || newQuickProvName || quickEditProvSearch).trim();
    if (!name) {
      showAlert('Validación', 'Por favor ingresa el nombre del proveedor.');
      return;
    }

    setIsSavingQuickProv(true);
    try {
      const existing = proveedoresCatalog.find(
        p => p.nombre && p.nombre.trim().toLowerCase() === name.toLowerCase()
      );
      if (existing) {
        await handleSelectQuickProveedor(existing);
        return;
      }

      const created = await CatalogService.crearProveedor({
        nombre: name,
        rfc: (rfcToCreate || newQuickProvRfc).trim() || null,
      });

      setProveedoresCatalog(prev => [...prev, created].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      await handleSelectQuickProveedor(created);
    } catch (err: any) {
      logger.error('Error al crear proveedor rápido:', err);
      showAlert('Error', err.message || 'No se pudo crear el proveedor.');
      setIsSavingQuickProv(false);
    }
  };

  // --- Handlers de Edición Rápida para los Demás Campos del Gasto ---
  const handleOpenQuickEditField = (fieldType: 'monto' | 'fecha' | 'categoria' | 'cliente' | 'servicio' | 'pago' | 'comentarios') => {
    if (!selectedGasto) return;
    setQuickEditFieldType(fieldType);

    if (fieldType === 'monto') {
      setTempMonto(String(selectedGasto.monto || ''));
    } else if (fieldType === 'fecha') {
      const rawFecha = (selectedGasto.fecha_comprobante || selectedGasto.created_at || new Date().toISOString()).split('T')[0].split(' ')[0].trim();
      setTempFecha(rawFecha);
      const parts = rawFecha.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        setCalViewYear(parseInt(parts[0], 10) || new Date().getFullYear());
        setCalViewMonth((parseInt(parts[1], 10) - 1) || new Date().getMonth());
      }
    } else if (fieldType === 'categoria') {
      const subcatId = selectedGasto.subcategoria_id || '';
      const subcatItem = subcategoriasCatalog.find((s: any) => s.id === subcatId);
      const catId = subcatItem?.categoria_id || (selectedGasto.subcategoria_rel as any)?.categoria_id || categoriasCatalog[0]?.id || '';
      setTempCatId(catId);
      setTempSubcatId(subcatId);
    } else if (fieldType === 'cliente') {
      setTempCliId(selectedGasto.cliente_id || '');
      setTempSucId(selectedGasto.sucursal_id || '');
      setQuickCliSearch('');
    } else if (fieldType === 'servicio') {
      setTempTipoProyecto(selectedGasto.tipo_servicio_proyecto || 'Servicio');
      setTempDetalleProyecto(selectedGasto.detalle_servicio_proyecto || '');
    } else if (fieldType === 'pago') {
      const rawMetodo = selectedGasto.metodo_pago || 'efectivo';
      const isCard = rawMetodo !== 'efectivo' && rawMetodo !== 'transferencia' && rawMetodo !== 'monedero_electronico';
      setTempMetodoPago(rawMetodo === 'tarjeta' ? 'tarjeta_debito' : rawMetodo);
      setTempTipoTarjeta((selectedGasto.tipo_tarjeta as any) || (isCard ? 'BBVA' : null));
      const parsed = parseJustificacion(selectedGasto.justificacion);
      setTempComentarios(parsed.justificacion || selectedGasto.justificacion || '');
    } else if (fieldType === 'comentarios') {
      const parsed = parseJustificacion(selectedGasto.justificacion);
      setTempComentarios(parsed.justificacion || selectedGasto.justificacion || '');
    }

    setQuickEditFieldModalVisible(true);
  };

  const handleSaveQuickField = async () => {
    if (!selectedGasto) return;
    setIsSavingQuickField(true);
    try {
      let updatePayload: any = {};
      let localUpdates: Partial<Gasto> = {};
      let successMsg = 'Campo actualizado correctamente.';

      if (quickEditFieldType === 'monto') {
        const montoNum = parseFloat(tempMonto);
        if (isNaN(montoNum) || montoNum <= 0) {
          showAlert('Validación', 'Ingresa un monto numérico válido mayor a 0.');
          setIsSavingQuickField(false);
          return;
        }
        updatePayload = { monto: montoNum };
        localUpdates = { monto: montoNum };
        successMsg = `Monto actualizado a ${formatCurrency(montoNum)}`;
      } else if (quickEditFieldType === 'fecha') {
        if (!tempFecha || !/^\d{4}-\d{2}-\d{2}$/.test(tempFecha.trim())) {
          showAlert('Validación', 'Ingresa una fecha válida en formato AAAA-MM-DD (ej. 2024-05-18).');
          setIsSavingQuickField(false);
          return;
        }
        updatePayload = { fecha_comprobante: tempFecha.trim() };
        localUpdates = { fecha_comprobante: tempFecha.trim() };
        successMsg = `Fecha actualizada a ${formatFriendlyDate(tempFecha.trim())}`;
      } else if (quickEditFieldType === 'categoria') {
        if (!tempSubcatId) {
          showAlert('Validación', 'Por favor selecciona una subcategoría.');
          setIsSavingQuickField(false);
          return;
        }
        const catObj = categoriasCatalog.find((c: any) => c.id === tempCatId);
        const subcatObj = subcategoriasCatalog.find((s: any) => s.id === tempSubcatId);
        updatePayload = { subcategoria_id: tempSubcatId };
        localUpdates = {
          subcategoria_id: tempSubcatId,
          subcategoria: subcatObj?.nombre,
          categoria: catObj?.nombre,
          subcategoria_rel: subcatObj ? {
            id: subcatObj.id,
            nombre: subcatObj.nombre,
            categoria_id: tempCatId,
            categorias: catObj ? { id: catObj.id, nombre: catObj.nombre } : undefined
          } as any : undefined
        };
        successMsg = `Categoría actualizada a ${catObj?.nombre || ''} > ${subcatObj?.nombre || ''}`;
      } else if (quickEditFieldType === 'cliente') {
        const cliObj = clientesCatalog.find((c: any) => c.id === tempCliId);
        const sucObj = sucursalesCatalog.find((s: any) => s.id === tempSucId);
        updatePayload = {
          cliente_id: tempCliId || null,
          sucursal_id: tempSucId || null,
        };
        localUpdates = {
          cliente_id: tempCliId || null,
          cliente: cliObj?.nombre || null,
          sucursal_id: tempSucId || null,
          sucursal: sucObj?.nombre || null,
          cliente_rel: cliObj ? { id: cliObj.id, nombre: cliObj.nombre } : null,
          sucursal_rel: sucObj ? { id: sucObj.id, nombre: sucObj.nombre } : null,
        };
        successMsg = cliObj ? `Cliente asignado: ${cliObj.nombre}${sucObj ? ` (${sucObj.nombre})` : ''}` : 'Cliente removido.';
      } else if (quickEditFieldType === 'servicio') {
        updatePayload = {
          tipo_servicio_proyecto: tempTipoProyecto || null,
          detalle_servicio_proyecto: tempDetalleProyecto.trim() || null,
        };
        localUpdates = {
          tipo_servicio_proyecto: tempTipoProyecto || null,
          detalle_servicio_proyecto: tempDetalleProyecto.trim() || null,
        };
        successMsg = 'Servicio / Proyecto actualizado.';
      } else if (quickEditFieldType === 'pago') {
        const isTarjeta = tempMetodoPago !== 'efectivo' && tempMetodoPago !== 'transferencia' && tempMetodoPago !== 'monedero_electronico';
        if (isTarjeta && !tempTipoTarjeta) {
          showAlert('Validación', 'Por favor selecciona la tarjeta utilizada (BBVA, AMEX, MARRIOT, BANORTE, INVEX, MERCADO PAGO, HILTON).');
          setIsSavingQuickField(false);
          return;
        }
        const tarjetaVal = isTarjeta ? tempTipoTarjeta : null;

        // Reconstruir la justificación preservando [ALERTA IA] y [Proveedor a agregar] si existían
        const parsedOld = parseJustificacion(selectedGasto.justificacion);
        let reconstructedJust = '';
        if (parsedOld.alerta) {
          reconstructedJust += `[ALERTA IA: ${parsedOld.alerta}]\n\n`;
        }
        if (parsedOld.proveedorSugerido) {
          reconstructedJust += `[Proveedor a agregar: ${parsedOld.proveedorSugerido}]\n\n`;
        }
        reconstructedJust += tempComentarios.trim();
        const finalJustificacion = reconstructedJust.trim() || null;

        updatePayload = {
          metodo_pago: tempMetodoPago,
          tipo_tarjeta: tarjetaVal,
          justificacion: finalJustificacion,
        };
        localUpdates = {
          metodo_pago: tempMetodoPago,
          tipo_tarjeta: tarjetaVal,
          justificacion: finalJustificacion,
        };
        successMsg = 'Método de pago y comentarios actualizados.';
      } else if (quickEditFieldType === 'comentarios') {
        const parsedOld = parseJustificacion(selectedGasto.justificacion);
        let reconstructedJust = '';
        if (parsedOld.alerta) {
          reconstructedJust += `[ALERTA IA: ${parsedOld.alerta}]\n\n`;
        }
        if (parsedOld.proveedorSugerido) {
          reconstructedJust += `[Proveedor a agregar: ${parsedOld.proveedorSugerido}]\n\n`;
        }
        reconstructedJust += tempComentarios.trim();
        const finalJustificacion = reconstructedJust.trim() || null;

        updatePayload = {
          justificacion: finalJustificacion,
        };
        localUpdates = {
          justificacion: finalJustificacion,
        };
        successMsg = 'Comentarios actualizados.';
      }

      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/reportes/gastos/${selectedGasto.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updatePayload)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al actualizar el gasto en la BD');
      }

      const updatedGasto: Gasto = {
        ...selectedGasto,
        ...localUpdates,
      };

      setSelectedGasto(updatedGasto);
      setGastos(prev => prev.map(g => g.id === selectedGasto.id ? updatedGasto : g));
      setQuickEditFieldModalVisible(false);
      showAlert('Éxito', successMsg);
    } catch (err: any) {
      logger.error('Error al actualizar campo:', err);
      showAlert('Error', err.message || 'No se pudo guardar la modificación.');
    } finally {
      setIsSavingQuickField(false);
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
        copyToCacheDirectory: true,
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
          const b64 = await new Promise<string>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.onload = () => {
              try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const base64Str = require('buffer').Buffer.from(xhr.response).toString('base64');
                resolve(base64Str);
              } catch (e) {
                reject(e);
              }
            };
            xhr.onerror = reject;
            xhr.responseType = 'arraybuffer';
            xhr.open('GET', uri, true);
            xhr.send(null);
          });

          await uploadInvoiceToSupabase(uri, b64, ext);
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

  const handleDeleteAdminInvoice = async (targetIndex?: number) => {
    if (!selectedGasto) return;

    if (Platform.OS === 'web') {
      if (!window.confirm('¿Estás seguro de eliminar esta factura?')) return;
    } else {
      const confirmed = await new Promise((resolve) => {
        Alert.alert(
          'Eliminar Factura',
          '¿Estás seguro de que deseas eliminar esta factura adjunta?',
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
      const currentUrls = GastoHelper.getFacturaUrls(selectedGasto);
      let newFacturaUrl: string | null = null;
      if (typeof targetIndex === 'number' && currentUrls.length > 1) {
        const remaining = currentUrls.filter((_, i) => i !== targetIndex);
        newFacturaUrl = remaining.join(',');
      } else {
        newFacturaUrl = null;
      }

      const { error: dbError } = await supabase
        .from('gastos')
        .update({
          factura_url: newFacturaUrl
        })
        .eq('id', selectedGasto.id);

      if (dbError) throw dbError;

      const updatedGasto = {
        ...selectedGasto,
        factura_url: newFacturaUrl
      };
      setSelectedGasto(updatedGasto);
      setGastos(prev => prev.map(g => g.id === selectedGasto.id ? updatedGasto : g));

      showAlert('Éxito', 'Factura eliminada correctamente.');
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo eliminar la factura.');
    } finally {
      setIsUploadingInvoice(false);
    }
  };

  const handleToggleAdminFacturado = async (val: boolean) => {
    if (!selectedGasto) return;
    try {
      const isPendiente = !!selectedGasto.motivo_sin_factura && selectedGasto.motivo_sin_factura.toUpperCase().includes('PENDIENTE');
      let newMotivo = val ? null : (isPendiente ? null : selectedGasto.motivo_sin_factura);

      const updateObj: Partial<Gasto> = {
        facturado: val,
        motivo_sin_factura: newMotivo
      };

      if (!val) {
        updateObj.factura_url = null;
      }

      if (val || newMotivo === null) {
        setLocalMotivo('');
      }

      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/reportes/gastos/${selectedGasto.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updateObj)
      });
      if (!res.ok) throw new Error('Error al actualizar facturación');

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

  const handleSetPendienteEntrega = async () => {
    if (!selectedGasto) return;
    try {
      const updateObj = { facturado: false, motivo_sin_factura: 'PENDIENTE_ENTREGA', factura_url: null };
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/reportes/gastos/${selectedGasto.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updateObj)
      });
      if (!res.ok) throw new Error('Error al actualizar');
      const updated = { ...selectedGasto, ...updateObj };
      setSelectedGasto(updated);
      setGastos(prev => prev.map(g => g.id === selectedGasto.id ? updated : g));
      setLocalMotivo('PENDIENTE_ENTREGA');
    } catch (err: any) {
      showAlert('Error', err.message);
    }
  };

  const handleUpdateEstadoReembolso = async (nuevoEstado: 'NORMAL' | 'PENDIENTE_REEMBOLSO' | 'REEMBOLSADO') => {
    if (!selectedGasto) return;
    setIsUpdatingEstadoReembolso(true);
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/reportes/gastos/${selectedGasto.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ estado_reembolso: nuevoEstado })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'Error al actualizar estado de reembolso');
      }

      const updatedGasto = {
        ...selectedGasto,
        estado_reembolso: nuevoEstado
      };
      setSelectedGasto(updatedGasto);
      setGastos(prev => prev.map(g => g.id === selectedGasto.id ? updatedGasto : g));
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo actualizar el estado de reembolso.');
    } finally {
      setIsUpdatingEstadoReembolso(false);
    }
  };

  const handleUpdateAdminMotivoSinFactura = async (motivo: string) => {
    if (!selectedGasto) return;
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/reportes/gastos/${selectedGasto.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ motivo_sin_factura: motivo.trim() || null })
      });
      if (!res.ok) throw new Error('Error al actualizar motivo');

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
    setQuickSaleCliente(GastoHelper.getCliente(selectedGasto));
    setQuickSaleSucursal(GastoHelper.getSucursal(selectedGasto));
    setQuickSaleFactura(selectedGasto.facturado ? 'Factura' : '');
    setQuickSaleTipoProyecto(selectedGasto.tipo_servicio_proyecto || 'Otro');
    setQuickSaleProveedor(GastoHelper.getProveedor(selectedGasto));
    setQuickSaleNotas(`Vinculado automáticamente al aprobar gasto de justificación: ${selectedGasto.justificacion || 'Sin justificación'}`);

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
    if (!quickSaleSucursal || !quickSaleSucursal.trim()) {
      showAlert('Validación', 'Por favor selecciona la sucursal del cliente.');
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
      const ventaPayload = {
        registrado_por: adminUser.id,
        fecha: quickSaleFecha.trim(),
        cliente: quickSaleCliente.trim(),
        sucursal: quickSaleSucursal || null,
        factura_referencia: quickSaleFactura.trim() || null,
        tipo_proyecto: quickSaleTipoProyecto || null,
        proveedor: quickSaleProveedor.trim() || null,
        precio_total_facturado: quickSaleTotals.precioTotal,
        costo_total: quickSaleTotals.costoTotal,
        utilidad_bruta: quickSaleTotals.utilidad,
        margen_porcentual: quickSaleTotals.margen,
        factura_url: selectedGasto.factura_url || null,
        notas: quickSaleNotas.trim() || null,
      };

      const partidasPayload = quickSalePartidas.map(p => {
        const cant = Number(p.cantidad) || 0;
        const precioUV = Number(p.precio_unitario_venta) || 0;
        const costoUP = Number(p.costo_unitario_proveedor) || 0;

        return {
          descripcion: p.descripcion.trim(),
          cantidad: cant,
          unidad: p.unidad || 'PZA',
          precio_unitario_venta: precioUV,
          costo_unitario_proveedor: costoUP,
          precio_total_venta: Math.round(cant * precioUV * 100) / 100,
          costo_total_proveedor: Math.round(cant * costoUP * 100) / 100,
        };
      });

      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/reportes/ventas/quick`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ventaPayload, partidasPayload })
      });
      if (!res.ok) throw new Error('Error al guardar la venta rápida');
      const data = await res.json();
      const ventaId = data.ventaId;

      setIsQuickSaleFormVisible(false);
      setIsLinkSaleModalVisible(false);
      if (isRelinkingSaleMode) {
        await executeRelinkGastoVenta(ventaId);
      } else {
        await executeApproveGasto(ventaId);
      }
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
        rol: newUserRole as 'ADMIN' | 'EMPLEADO' | 'DEV',
        telefono: newUserPhone.trim() || null,
      };

      await CatalogService.crearUsuario(newUserObj);

      showAlert('Éxito', 'Personal registrado correctamente.');
      setAddUserModalVisible(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserPhone('');
      setNewUserRole('EMPLEADO');

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
    setEditUserPassword('');
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

      if (editUserPassword) {
        updatePayload.password = editUserPassword;
      }

      await CatalogService.actualizarUsuario(editingUser.id, updatePayload);

      showAlert('Éxito', 'Información de personal actualizada correctamente.');
      setEditUserModalVisible(false);
      setEditingUser(null);

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
        await CatalogService.eliminarUsuario(id);
        showAlert('Éxito', 'Personal eliminado.');
      } catch (err: any) {
        if (err?.code === '23503' || err?.message?.includes('23503')) {
          showAlert('Error al eliminar', 'No se puede eliminar a este empleado porque tiene gastos o evidencias de trabajo registradas. Para no alterar el historial contable e informes pasados de la empresa, te sugerimos editar su perfil y cambiar sus accesos (correo/contraseña) si deseas inhabilitar su cuenta.');
        } else {
          showAlert('Error al eliminar', err.message || 'No se pudo eliminar el usuario.');
        }
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
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo cambiar el estado del vehículo.');
    }
  };

  // Ver Historial de Asistencia de un Empleado
  const handleOpenAsistencia = async (empleado: Usuario, targetMonday?: Date) => {
    const monday = targetMonday || getWeekRange().mondayDate;
    setAsistenciaSelectedMonday(monday);
    setAsistenciaEmpleado(empleado);
    setAsistenciaModalVisible(true);
    setIsLoadingAsistencias(true);
    try {
      const range = getWeekRange(monday);
      const historial = await AsistenciaService.getHistorialEmpleado(empleado.id, range.mondayStr, range.sundayStr);
      setAsistencias(historial);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo cargar el historial de asistencia.');
    } finally {
      setIsLoadingAsistencias(false);
    }
  };

  const handleAsistenciaPrevWeek = () => {
    if (!asistenciaEmpleado) return;
    const prev = getPreviousWeekMonday(asistenciaSelectedMonday);
    handleOpenAsistencia(asistenciaEmpleado, prev);
  };

  const handleAsistenciaNextWeek = () => {
    if (!asistenciaEmpleado) return;
    const next = getNextWeekMonday(asistenciaSelectedMonday);
    handleOpenAsistencia(asistenciaEmpleado, next);
  };

  const handleExportIndividualPDF = async () => {
    if (!asistenciaEmpleado) return;
    try {
      setIsExportingAsistencia(true);
      await ReportGenerator.exportReporteAsistenciaEmpleadoPDF(asistencias, asistenciaEmpleado, asistenciaSelectedMonday);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo generar el reporte en PDF');
    } finally {
      setIsExportingAsistencia(false);
    }
  };

  const handleExportIndividualXLSX = async () => {
    if (!asistenciaEmpleado) return;
    try {
      setIsExportingAsistencia(true);
      await ReportGenerator.exportReporteAsistenciaEmpleadoXLSX(asistencias, asistenciaEmpleado, asistenciaSelectedMonday);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo generar el reporte en Excel');
    } finally {
      setIsExportingAsistencia(false);
    }
  };

  const handleDeleteGasto = async (id: string) => {
    const performDelete = async () => {
      setIsProcessingAction(true);
      try {
        const headers = await getApiHeaders();
        const res = await fetch(`${getApiUrl()}/api/reportes/gastos/${id}`, {
          method: 'DELETE',
          headers
        });
        if (!res.ok) throw new Error('Error al eliminar el gasto');
        setGastos(prev => prev.filter(g => g.id !== id));
        setReviewModalVisible(false);
        setSelectedGasto(null);
        showAlert('Éxito', 'Gasto eliminado correctamente de la base de datos.');
        await refreshData(true);
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
      setIsLoading(true);
      const headers = await getApiHeaders();
      const exportUrl = `${getApiUrl()}/api/reportes/admin/export/gastos?startDate=${startDateFilter || ''}&endDate=${endDateFilter || ''}`;
      const res = await fetch(exportUrl, { headers });
      const exportGastos = res.ok ? await res.json() : gastos;
      await ReportGenerator.exportToPDF(exportGastos, `Historial General de Gastos`);
    } catch (err: any) {
      Alert.alert('Error PDF', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      setIsLoading(true);
      const headers = await getApiHeaders();
      const exportUrl = `${getApiUrl()}/api/reportes/admin/export/gastos?startDate=${startDateFilter || ''}&endDate=${endDateFilter || ''}`;
      const res = await fetch(exportUrl, { headers });
      const exportGastos = res.ok ? await res.json() : gastos;
      await ReportGenerator.exportToXLSX(exportGastos, `historial_gastos_${company === 'daravisa' ? 'daravisa' : 'inttec'}.xlsx`);
    } catch (err: any) {
      Alert.alert('Error Excel', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportAsistenciasPDF = async () => {
    setIsFetchingAsistencias(true);
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/reportes/admin/export/asistencias`, { headers });
      if (!res.ok) throw new Error('Error al cargar datos');
      const data = await res.json();
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
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/reportes/admin/export/asistencias`, { headers });
      if (!res.ok) throw new Error('Error al cargar datos');
      const data = await res.json();
      await ReportGenerator.exportAsistenciasToXLSX(data || [], personal, 'reporte_asistencia_general.xlsx');
    } catch (err: any) {
      showAlert('Error Excel Asistencia', err.message || 'No se pudo generar el reporte.');
    } finally {
      setIsFetchingAsistencias(false);
    }
  };

  const handleExportInventarioPDF = async () => {
    setIsFetchingInventario(true);
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/reportes/admin/export/inventario`, { headers });
      if (!res.ok) throw new Error('Error al cargar datos');
      const data = await res.json();
      await ReportGenerator.exportInventarioToPDF(data.productos || [], data.categorias || [], 'Reporte de Inventario de Materiales');
    } catch (err: any) {
      showAlert('Error PDF Inventario', err.message || 'No se pudo generar el reporte.');
    } finally {
      setIsFetchingInventario(false);
    }
  };

  const handleExportInventarioCSV = async () => {
    setIsFetchingInventario(true);
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/reportes/admin/export/inventario`, { headers });
      if (!res.ok) throw new Error('Error al cargar datos');
      const data = await res.json();
      await ReportGenerator.exportInventarioToXLSX(data.productos || [], data.categorias || [], 'reporte_inventario_general.xlsx');
    } catch (err: any) {
      showAlert('Error Excel Inventario', err.message || 'No se pudo generar el reporte.');
    } finally {
      setIsFetchingInventario(false);
    }
  };

  const handleExportConsumosPDF = async () => {
    setIsFetchingConsumos(true);
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/reportes/admin/export/consumos`, { headers });
      if (!res.ok) throw new Error('Error al cargar datos');
      const data = await res.json();
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
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/reportes/admin/export/consumos`, { headers });
      if (!res.ok) throw new Error('Error al cargar datos');
      const data = await res.json();
      await ReportGenerator.exportConsumosToXLSX(data || [], 'reporte_consumos_general.xlsx');
    } catch (err: any) {
      showAlert('Error Excel Consumos', err.message || 'No se pudo generar el reporte.');
    } finally {
      setIsFetchingConsumos(false);
    }
  };

  const handleExportVentasPDF = async () => {
    setIsFetchingVentas(true);
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/reportes/admin/export/ventas`, { headers });
      if (!res.ok) throw new Error('Error al cargar datos');
      const data = await res.json();
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
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/reportes/admin/export/ventas`, { headers });
      if (!res.ok) throw new Error('Error al cargar datos');
      const data = await res.json();
      await ReportGenerator.exportVentasToXLSX(data || [], 'reporte_ventas_general.xlsx');
    } catch (err: any) {
      showAlert('Error Excel Ventas', err.message || 'No se pudo generar el reporte de ventas.');
    } finally {
      setIsFetchingVentas(false);
    }
  };

  // Master Filter: Búsqueda y Fechas
  const filteredGastos = useMemo(() => {
    const normalizeAmountQuery = (value: string) => {
      const cleaned = value.trim().replace(/\s/g, '').replace(/[$]/g, '');
      if (!cleaned) return null;

      let normalized = cleaned;
      if (cleaned.includes(',') && cleaned.includes('.')) {
        const lastComma = cleaned.lastIndexOf(',');
        const lastDot = cleaned.lastIndexOf('.');
        const decimalSeparator = lastComma > lastDot ? ',' : '.';
        normalized = decimalSeparator === ','
          ? cleaned.replace(/\./g, '').replace(/,/g, '.')
          : cleaned.replace(/,/g, '');
      } else if (cleaned.includes(',')) {
        const parts = cleaned.split(',');
        normalized = parts.length > 1 && parts[1].length <= 2
          ? cleaned.replace(/,/g, '.')
          : cleaned.replace(/,/g, '');
      } else if (cleaned.includes('.')) {
        normalized = cleaned.replace(/,/g, '');
      }

      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    };

    return gastos.filter((g) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const empName = (g.empleado_nombre || '').toLowerCase();
        const clientName = (GastoHelper.getCliente(g) || '').toLowerCase();
        const branchName = (GastoHelper.getSucursal(g) || '').toLowerCase();
        const catName = (GastoHelper.getCategoria(g) || '').toLowerCase();
        const subCatName = (GastoHelper.getSubcategoria(g) || '').toLowerCase();
        const provName = (GastoHelper.getProveedor(g) || '').toLowerCase();
        const detailStr = (g.detalle_servicio_proyecto || '').toLowerCase();
        const amountQuery = normalizeAmountQuery(searchQuery);
        const amountValue = Number(g.monto) || 0;

        const matchesText = empName.includes(query) ||
          clientName.includes(query) ||
          branchName.includes(query) ||
          catName.includes(query) ||
          subCatName.includes(query) ||
          provName.includes(query) ||
          detailStr.includes(query);

        const digitsQuery = query.replace(/[$,.\s]/g, '');
        const isQueryNumeric = digitsQuery.length > 0 && /^\d+$/.test(digitsQuery);
        let matchesAmount = false;

        if (amountQuery !== null && amountValue === amountQuery) {
          matchesAmount = true;
        } else if (isQueryNumeric) {
          const amountStr = amountValue.toString();
          const amountFixed = amountValue.toFixed(2);
          const amountDigits = amountFixed.replace(/\./g, '');
          matchesAmount = amountStr.includes(digitsQuery) ||
                          amountDigits.includes(digitsQuery) ||
                          amountFixed.includes(query);
        }

        if (!matchesText && !matchesAmount) return false;
      }

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

  const pendingGastos = (activeTab === 'pendientes' ? gastos : filteredGastos.filter((g) => g.status === 'PENDING')).filter((g) => {
    if (pendingFilter === 'FACTURA_DETECTADA') {
      return Boolean(g.devuelto_por_factura || g.factura_sugerida_id || g.factura_sugerida_rel);
    }
    if (pendingFilter === 'NUEVOS') {
      return !g.devuelto_por_factura && !g.factura_sugerida_id && !g.factura_sugerida_rel;
    }
    return true;
  });
  const historyGastos = activeTab === 'historial' ? gastos : filteredGastos.filter((g) => {
    const isHistoryStatus = g.status === 'APPROVED' || g.status === 'REJECTED' || g.status === 'ACTION_REQUIRED';
    if (!isHistoryStatus) return false;

    if (facturaFilter === 'FACTURADOS') return g.facturado === true;
    if (facturaFilter === 'PENDIENTE_ENTREGA') {
      return !g.facturado && !!g.motivo_sin_factura && g.motivo_sin_factura.toUpperCase().includes('PENDIENTE');
    }
    if (facturaFilter === 'NO_FACTURADOS') {
      return !g.facturado && (!g.motivo_sin_factura || !g.motivo_sin_factura.toUpperCase().includes('PENDIENTE'));
    }
    return true;
  });

  const totalPendientes = backendTotals ? backendTotals.totalPendientes : pendingGastos.reduce((sum, g) => sum + Number(g.monto), 0);
  const totalAprobados = backendTotals ? backendTotals.totalAprobados : filteredGastos.filter((g) => g.status === 'APPROVED').reduce((sum, g) => sum + Number(g.monto), 0);

  return {
    router,
    isMobile,
    isDesktop,
    scheme,
    themeColors,
    company,
    env,
    changeEnv,
    showAlert,
    adminUser,
    gastos,
    personal,
    isLoading,
    activeTab,
    setActiveTab,
    facturaFilter,
    setFacturaFilter,
    pendingFilter,
    setPendingFilter,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    totalCount,
    backendTotals,
    searchQuery,
    setSearchQuery,
    startDateFilter,
    setStartDateFilter,
    endDateFilter,
    setEndDateFilter,
    dateFilterModalVisible,
    setDateFilterModalVisible,
    tempStartDate,
    setTempStartDate,
    tempEndDate,
    setTempEndDate,
    vehiculos,
    registrosGasolina,
    newVehiculoMarca,
    setNewVehiculoMarca,
    newVehiculoModelo,
    setNewVehiculoModelo,
    newVehiculoAnio,
    setNewVehiculoAnio,
    newVehiculoPlacas,
    setNewVehiculoPlacas,
    newVehiculoNumEcon,
    setNewVehiculoNumEcon,
    vehiculoModalVisible,
    setVehiculoModalVisible,
    editingVehiculo,
    setEditingVehiculo,
    isSavingVehiculo,
    vehiculosManagerModalVisible,
    setVehiculosManagerModalVisible,
    personalModalVisible,
    setPersonalModalVisible,
    reportsModalVisible,
    setReportsModalVisible,
    selectedGasto,
    setSelectedGasto,
    reviewModalVisible,
    setReviewModalVisible,
    rejectionFeedback,
    setRejectionFeedback,
    showFeedbackInput,
    setShowFeedbackInput,
    feedbackActionType,
    setFeedbackActionType,
    isProcessingAction,
    viewerVisible,
    setViewerVisible,
    viewerInitialIndex,
    setViewerInitialIndex,
    activePreviewUrl,
    setActivePreviewUrl,
    isUploadingInvoice,
    localMotivo,
    setLocalMotivo,
    isUpdatingEstadoReembolso,
    isExportingSatPdf,
    isAttachingSatFactura,
    isDismissingSatFactura,
    satFacturaPreviewModalVisible,
    setSatFacturaPreviewModalVisible,
    satFacturaToPreview,
    setSatFacturaToPreview,
    proveedoresCatalog,
    quickEditProvModalVisible,
    setQuickEditProvModalVisible,
    quickEditProvSearch,
    setQuickEditProvSearch,
    isSavingQuickProv,
    showNewProvInQuickModal,
    setShowNewProvInQuickModal,
    newQuickProvName,
    setNewQuickProvName,
    newQuickProvRfc,
    setNewQuickProvRfc,
    quickEditFieldType,
    quickEditFieldModalVisible,
    setQuickEditFieldModalVisible,
    isSavingQuickField,
    tempMonto,
    setTempMonto,
    tempFecha,
    setTempFecha,
    calViewYear,
    setCalViewYear,
    calViewMonth,
    setCalViewMonth,
    tempCatId,
    setTempCatId,
    tempSubcatId,
    setTempSubcatId,
    tempCliId,
    setTempCliId,
    tempSucId,
    setTempSucId,
    quickCliSearch,
    setQuickCliSearch,
    tempTipoProyecto,
    setTempTipoProyecto,
    tempDetalleProyecto,
    setTempDetalleProyecto,
    tempMetodoPago,
    setTempMetodoPago,
    tempTipoTarjeta,
    setTempTipoTarjeta,
    tempComentarios,
    setTempComentarios,
    categoriasCatalog,
    subcategoriasCatalog,
    sucursalesCatalog,
    clientesCatalog,
    addUserModalVisible,
    setAddUserModalVisible,
    newUserName,
    setNewUserName,
    newUserEmail,
    setNewUserEmail,
    newUserPassword,
    setNewUserPassword,
    newUserPhone,
    setNewUserPhone,
    newUserRole,
    setNewUserRole,
    isAddingUser,
    editingUser,
    setEditingUser,
    editUserModalVisible,
    setEditUserModalVisible,
    editUserName,
    setEditUserName,
    editUserEmail,
    setEditUserEmail,
    editUserPassword,
    setEditUserPassword,
    editUserPhone,
    setEditUserPhone,
    editUserRole,
    setEditUserRole,
    isUpdatingUser,
    profileModalVisible,
    setProfileModalVisible,
    profilePhone,
    setProfilePhone,
    profilePassword,
    setProfilePassword,
    isSavingProfile,
    asistenciaModalVisible,
    setAsistenciaModalVisible,
    asistenciaEmpleado,
    setAsistenciaEmpleado,
    asistencias,
    setAsistencias,
    isLoadingAsistencias,
    asistenciaSelectedMonday,
    setAsistenciaSelectedMonday,
    isExportingAsistencia,
    asistenciaPreviewUrl,
    setAsistenciaPreviewUrl,
    asistenciaViewerVisible,
    setAsistenciaViewerVisible,
    selectedAsistenciaInfo,
    setSelectedAsistenciaInfo,
    isFetchingAsistencias,
    isFetchingInventario,
    isFetchingConsumos,
    isFetchingVentas,
    isLinkSaleModalVisible,
    setIsLinkSaleModalVisible,
    isRelinkingSaleMode,
    setIsRelinkingSaleMode,
    salesForLinking,
    isLoadingSalesForLinking,
    linkSaleSearch,
    setLinkSaleSearch,
    isQuickSaleFormVisible,
    setIsQuickSaleFormVisible,
    quickSaleFecha,
    setQuickSaleFecha,
    quickSaleCliente,
    setQuickSaleCliente,
    quickSaleFactura,
    setQuickSaleFactura,
    quickSaleTipoProyecto,
    setQuickSaleTipoProyecto,
    quickSaleProveedor,
    setQuickSaleProveedor,
    quickSaleNotas,
    setQuickSaleNotas,
    quickSalePartidas,
    showQuickSaleTipoDropdown,
    setShowQuickSaleTipoDropdown,
    showQuickSaleCliDropdown,
    setShowQuickSaleCliDropdown,
    quickSaleCliSearch,
    setQuickSaleCliSearch,
    isSavingQuickSale,
    quickSaleSucursal,
    setQuickSaleSucursal,
    showQuickSaleSucursalDropdown,
    setShowQuickSaleSucursalDropdown,
    quickSaleSucursalSearch,
    setQuickSaleSucursalSearch,
    quickSaleTotals,
    filteredSalesForLinking,
    filteredClientsForQuickSale,
    pendingGastos,
    historyGastos,
    totalPendientes,
    totalAprobados,
    handleOpenProfile,
    handleSaveProfile,
    refreshData,
    handleLogout,
    handleToggleCompany,
    handleUpdateStatus,
    handleApproveClick,
    handlePreviewSatFactura,
    handleDownloadSatFacturaPdf,
    handleAttachSatFacturaAndSend,
    handleDismissSatFactura,
    handleOpenRelinkSaleModal,
    executeRelinkGastoVenta,
    handleDirectUnlinkSale,
    executeApproveGasto,
    handleOpenQuickEditProveedor,
    handleSelectQuickProveedor,
    handleQuickCreateProveedorAndAssign,
    handleOpenQuickEditField,
    handleSaveQuickField,
    handleCaptureAdminInvoice,
    handleSelectAdminInvoiceGallery,
    handleSelectAdminInvoiceDocument,
    handleDeleteAdminInvoice,
    handleToggleAdminFacturado,
    handleSetPendienteEntrega,
    handleUpdateEstadoReembolso,
    handleUpdateAdminMotivoSinFactura,
    handleOpenQuickSaleForm,
    addQuickSalePartida,
    removeQuickSalePartida,
    updateQuickSalePartida,
    handleSaveQuickSale,
    handleAddUser,
    handleOpenEditUser,
    handleUpdateUser,
    handleDeleteUser,
    handleSaveVehiculo,
    handleEditVehiculo,
    handleDeleteVehiculo,
    handleToggleVehiculoActivo,
    handleOpenAsistencia,
    handleAsistenciaPrevWeek,
    handleAsistenciaNextWeek,
    handleExportIndividualPDF,
    handleExportIndividualXLSX,
    handleDeleteGasto,
    formatAsistenciaFecha,
    handleOpenMap,
    handleExportPDF,
    handleExportCSV,
    handleExportAsistenciasPDF,
    handleExportAsistenciasCSV,
    handleExportInventarioPDF,
    handleExportInventarioCSV,
    handleExportConsumosPDF,
    handleExportConsumosCSV,
    handleExportVentasPDF,
    handleExportVentasCSV,
    formatCurrency,
    formatFriendlyDate,
    parseJustificacion,
  };
}
