import { useEffect, useState, useMemo } from 'react';
import { Alert, Platform, useWindowDimensions } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { CatalogoItem, AuthService } from '@/services/supabase';
import { getApiUrl, getApiHeaders } from '@/services/apiHelper';
import { useAuth } from '@/context/AuthContext';
import * as DocumentPicker from 'expo-document-picker';
import { GeminiService } from '@/services/gemini';
import { normalizeText } from '@/utils/helpers';
import { ModuleCache } from '@/services/moduleCache';
import { ReportGenerator } from '@/utils/reportGenerator';
import {
  Categoria,
  Proveedor,
  Producto,
  FacturaItemStaging,
  ConsumoItem,
  AsignarItem,
  AdminTabType,
} from '../types';

export function useAdminInventario() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const isMobile = windowWidth < 600;
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const { user: authUser } = useAuth();
  const [currentUser, setCurrentUser] = useState<any>(authUser);

  // Tab activa: 'importacion' | 'categorias' | 'retribuciones' | 'movimientos' | 'empleados_stock' | 'inventario_personal'
  const [activeTab, setActiveTab] = useState<AdminTabType>('importacion');

  // Estado del Módulo Inventario Personal (Admin / Dev)
  const [miInventario, setMiInventario] = useState<any[]>([]);
  const [isLoadingMiInventario, setIsLoadingMiInventario] = useState(false);
  const [miInventarioSearch, setMiInventarioSearch] = useState('');

  // Modales de Operación para Inventario Personal
  const [gastoModalVisible, setGastoModalVisible] = useState(false);
  const [gastoTargetItem, setGastoTargetItem] = useState<any | null>(null);
  const [gastoCantidad, setGastoCantidad] = useState('');
  const [gastoCantidadNuevo, setGastoCantidadNuevo] = useState('');
  const [gastoCantidadUsado, setGastoCantidadUsado] = useState('');
  const [gastoCantidadPorRev, setGastoCantidadPorRev] = useState('');
  const [gastoTipo, setGastoTipo] = useState<'SERVICIO' | 'PROYECTO' | 'MANTENIMIENTO' | 'INTERNO'>('SERVICIO');
  const [gastoClienteId, setGastoClienteId] = useState('');
  const [gastoClienteNombre, setGastoClienteNombre] = useState('');
  const [gastoSucursal, setGastoSucursal] = useState('');
  const [gastoMotivo, setGastoMotivo] = useState('');
  const [isSubmittingGasto, setIsSubmittingGasto] = useState(false);
  const [showGastoCliDropdown, setShowGastoCliDropdown] = useState(false);
  const [gastoCliSearch, setGastoCliSearch] = useState('');

  const [devolverModalVisible, setDevolverModalVisible] = useState(false);
  const [devolverTargetItem, setDevolverTargetItem] = useState<any | null>(null);
  const [devolverCantidad, setDevolverCantidad] = useState('');
  const [devolverCantidadNuevo, setDevolverCantidadNuevo] = useState('');
  const [devolverCantidadUsado, setDevolverCantidadUsado] = useState('');
  const [devolverCantidadPorRev, setDevolverCantidadPorRev] = useState('');
  const [devolverMotivo, setDevolverMotivo] = useState('');
  const [isSubmittingDevolucion, setIsSubmittingDevolucion] = useState(false);

  // Estado del Módulo Material en Empleados (Custodia en Camionetas)
  const [empleadosStockData, setEmpleadosStockData] = useState<{
    resumen: { total_empleados: number; total_productos_distintos: number; total_articulos: number; total_valor_estimado: number };
    inventario: any[];
    por_empleado: any[];
    por_producto: any[];
  }>({
    resumen: { total_empleados: 0, total_productos_distintos: 0, total_articulos: 0, total_valor_estimado: 0 },
    inventario: [],
    por_empleado: [],
    por_producto: []
  });
  const [isLoadingEmpleadosStock, setIsLoadingEmpleadosStock] = useState(false);
  const [empleadosStockSearch, setEmpleadosStockSearch] = useState('');
  const [empleadosStockViewMode, setEmpleadosStockViewMode] = useState<'por_empleado' | 'por_producto'>('por_empleado');
  const [selectedEmpleadoStockFilter, setSelectedEmpleadoStockFilter] = useState('');
  const [expandedEmpleadoIds, setExpandedEmpleadoIds] = useState<string[]>([]);
  const [isExportingEmpleadosStockExcel, setIsExportingEmpleadosStockExcel] = useState(false);
  const [currentPageProd, setCurrentPageProd] = useState(1);
  const [pageSizeProd, setPageSizeProd] = useState(25);
  const [currentPageMov, setCurrentPageMov] = useState(1);
  const [pageSizeMov, setPageSizeMov] = useState(25);

  // Estado del Módulo Movimientos de Inventario
  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [isLoadingMovimientos, setIsLoadingMovimientos] = useState(false);
  const [movimientosSearch, setMovimientosSearch] = useState('');
  const [selectedUsuarioMovimiento, setSelectedUsuarioMovimiento] = useState('');
  const [selectedTipoMovimiento, setSelectedTipoMovimiento] = useState<string>('TODOS');
  const [selectedDateFilterMov, setSelectedDateFilterMov] = useState<'TODOS' | 'HOY' | 'SEMANA' | 'MES'>('TODOS');
  const [isExportingMovimientosPDF, setIsExportingMovimientosPDF] = useState(false);
  const [isExportingMovimientosExcel, setIsExportingMovimientosCSV] = useState(false);
  const [exportingSingleMovimientoId, setExportingSingleMovimientoId] = useState<string | null>(null);

  // Datos maestros con soporte de caché en memoria (0ms render)
  const cachedInv = ModuleCache.get<any>('inventario_dashboard');
  const [productos, setProductos] = useState<Producto[]>(() => cachedInv?.productos || []);
  const [categorias, setCategorias] = useState<Categoria[]>(() => cachedInv?.categorias || []);
  const [proveedores, setProveedores] = useState<Proveedor[]>(() => cachedInv?.proveedores || []);
  const [empleados, setEmpleados] = useState<any[]>(() => cachedInv?.usuarios || []);
  const [historialConsumo, setHistorialConsumo] = useState<any[]>(() => cachedInv?.historial_consumo || []);
  const [clientes, setClientes] = useState<CatalogoItem[]>(() => cachedInv?.clientes || []);
  const [isLoading, setIsLoading] = useState(() => !cachedInv);

  // Filtros de búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('');
  const [showOutOfStock, setShowOutOfStock] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  // Selección múltiple para acciones en lote
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkEditModalVisible, setBulkEditModalVisible] = useState(false);
  const [isSavingBulkEdit, setIsSavingBulkEdit] = useState(false);

  // Campos para Edición Masiva
  const [bulkUpdateCategory, setBulkUpdateCategory] = useState(false);
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [bulkUpdateProveedor, setBulkUpdateProveedor] = useState(false);
  const [bulkProveedorId, setBulkProveedorId] = useState('');
  const [bulkUpdateStock, setBulkUpdateStock] = useState(false);
  const [bulkStockValue, setBulkStockValue] = useState('');
  const [bulkUpdatePrice, setBulkUpdatePrice] = useState(false);
  const [bulkPriceValue, setBulkPriceValue] = useState('');

  // Selector Centralizado
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [selectorTitle, setSelectorTitle] = useState('');
  const [selectorOptions, setSelectorOptions] = useState<{ id: string; label: string }[]>([]);
  const [onSelectOption, setOnSelectOption] = useState<(id: string) => void>(() => {});
  const [selectorSearch, setSelectorSearch] = useState('');

  // Modales CRUD manual
  const [crudModalVisible, setCrudModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Producto | null>(null);
  const [formSku, setFormSku] = useState('');
  const [formNombre, setFormNombre] = useState('');
  const [formCategoriaId, setFormCategoriaId] = useState('');
  const [formProveedorId, setFormProveedorId] = useState('');
  const [formStock, setFormStock] = useState('0');
  const [showEstadoBreakdown, setShowEstadoBreakdown] = useState(false);
  const [formStockNuevo, setFormStockNuevo] = useState('0');
  const [formStockUsado, setFormStockUsado] = useState('0');
  const [formStockPorRevisar, setFormStockPorRevisar] = useState('0');
  const [formUnidad, setFormUnidad] = useState('pza');
  const [formPrecio, setFormPrecio] = useState('');
  const [isSavingProduct, setIsSavingProduct] = useState(false);

  // Creador de Categorías y Proveedores
  const [newCatNombre, setNewCatNombre] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [isSavingNewCat, setIsSavingNewCat] = useState(false);

  const [newProvNombre, setNewProvNombre] = useState('');
  const [newProvRfc, setNewProvRfc] = useState('');
  const [isSavingNewProv, setIsSavingNewProv] = useState(false);

  // Modales de Creador de Categorías y Proveedores
  const [newCatModalVisible, setNewCatModalVisible] = useState(false);
  const [newProvModalVisible, setNewProvModalVisible] = useState(false);

  // ID del ítem de staging seleccionado para asociar producto
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [activeStagingItemId, setActiveStagingItemId] = useState<string | null>(null);

  // Ajuste rápido de stock por producto
  const [quickStockAdjustments, setQuickStockAdjustments] = useState<Record<string, string>>({});

  // Flujo Consumo / Salidas de Materiales
  const [consumoCliente, setConsumoCliente] = useState('');
  const [showCliDropdown, setShowCliDropdown] = useState(false);
  const [clienteSearch, setClienteSearch] = useState('');
  const [consumoItems, setConsumoItems] = useState<ConsumoItem[]>([]);
  const [isSavingConsumo, setIsSavingConsumo] = useState(false);

  // Flujo IA (Staging)
  const [selectedProveedorId, setSelectedProveedorId] = useState('');
  const [folioFactura, setFolioFactura] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [stagingItems, setStagingItems] = useState<FacturaItemStaging[]>([]);
  const [folioDuplicado, setFolioDuplicado] = useState(false);
  const [isSavingAIImport, setIsSavingAIImport] = useState(false);
  const [selectedEmpleadoRetribucion, setSelectedEmpleadoRetribucion] = useState('');
  const [retribucionesData, setRetribucionesData] = useState<any[]>([]);
  const [verifyModalVisible, setVerifyModalVisible] = useState(false);
  const [verifyingEvidencia, setVerifyingEvidencia] = useState<any>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Inventario de empleado modal
  const [employeeInventoryModalVisible, setEmployeeInventoryModalVisible] = useState(false);
  const [employeeInventoryData, setEmployeeInventoryData] = useState<any[]>([]);
  const [isLoadingEmployeeInventory, setIsLoadingEmployeeInventory] = useState(false);

  // Devoluciones State
  const [devolucionesData, setDevolucionesData] = useState<any[]>([]);
  const [isLoadingDevoluciones, setIsLoadingDevoluciones] = useState(false);
  const [isApprovingDevolucion, setIsApprovingDevolucion] = useState(false);
  const [isLoadingRetribuciones, setIsLoadingRetribuciones] = useState(false);

  // Flujo Asignar Material a Empleado / Camioneta
  const [asignarModalVisible, setAsignarModalVisible] = useState(false);
  const [asignarEmpleadoId, setAsignarEmpleadoId] = useState('');
  const [asignarMotivo, setAsignarMotivo] = useState('');
  const [asignarItems, setAsignarItems] = useState<AsignarItem[]>([]);
  const [asignarProductSearch, setAsignarProductSearch] = useState('');
  const [isSubmittingAsignacion, setIsSubmittingAsignacion] = useState(false);
  const [showAsignarEmpDropdown, setShowAsignarEmpDropdown] = useState(false);
  const [asignarEmpSearch, setAsignarEmpSearch] = useState('');

  useEffect(() => {
    loadAllData();
    const initUser = async () => {
      let u = authUser;
      if (!u) {
        u = await AuthService.getCurrentUser();
      }
      if (u) {
        setCurrentUser(u);
        loadMiInventario(u.id, true);
      }
    };
    initUser();
  }, [authUser]);

  useEffect(() => {
    const verificarFolio = async () => {
      if (!folioFactura || !folioFactura.trim()) {
        setFolioDuplicado(false);
        return;
      }
      try {
        const headers = await getApiHeaders();
        const res = await fetch(`${getApiUrl()}/api/inventario/verificar-folio?folio=${encodeURIComponent(folioFactura.trim())}`, { headers });
        if (res.ok) {
          const data = await res.json();
          setFolioDuplicado(data.existe);
        }
      } catch (err) {
        console.error('Error al verificar folio:', err);
      }
    };

    const timeoutId = setTimeout(verificarFolio, 500);
    return () => clearTimeout(timeoutId);
  }, [folioFactura]);

  const handleOpenVerifyModal = (evidencia: any) => {
    setVerifyingEvidencia(evidencia);
    setVerifyModalVisible(true);
  };

  const handleConfirmVerification = async () => {
    if (!verifyingEvidencia) return;
    setIsVerifying(true);
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/inventario/evidencias/verificar`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          evidenciaId: verifyingEvidencia.id,
          action: 'VERIFICAR',
          reason: 'Validación administrativa',
          userActionName: 'ADMIN'
        })
      });
      if (!res.ok) { const errData = await res.json().catch(() => ({})); throw new Error(errData.error || 'Error al verificar evidencia'); }

      Alert.alert('Éxito', 'Evidencia marcada como revisada.');
      setVerifyModalVisible(false);
      loadRetribuciones(selectedEmpleadoRetribucion);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setIsVerifying(false);
    }
  };

  const loadDevolucionesPendientes = async (empleadoId: string) => {
    if (!empleadoId) return;
    setIsLoadingDevoluciones(true);
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/inventario/empleado/${empleadoId}/retribuciones`, { headers });
      if (!res.ok) { const errData = await res.json().catch(() => ({})); throw new Error(errData.error || 'Error al cargar devoluciones'); }
      const data = await res.json();
      setDevolucionesData(data.devoluciones || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoadingDevoluciones(false);
    }
  };

  const executeAprobarDevolucion = async (dev: any) => {
    setIsApprovingDevolucion(true);
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/inventario/devoluciones/aprobar`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ dev })
      });
      if (!res.ok) { const errData = await res.json().catch(() => ({})); throw new Error(errData.error || 'Error al aprobar devolución'); }

      Alert.alert('Éxito', 'Devolución aprobada e integrada al almacén.');
      ModuleCache.invalidate('inventario_dashboard');
      loadDevolucionesPendientes(selectedEmpleadoRetribucion);
      loadMovimientos();
      loadAllData(true);
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message);
    } finally {
      setIsApprovingDevolucion(false);
    }
  };

  const handleAprobarDevolucion = async (dev: any) => {
    if (Platform.OS === 'web') {
      const confirm = window.confirm('¿Estás seguro de que recibiste físicamente estos materiales? Se sumarán al almacén y se descontarán del empleado.');
      if (confirm) {
        await executeAprobarDevolucion(dev);
      }
    } else {
      Alert.alert(
        'Aprobar Devolución',
        '¿Estás seguro de que recibiste físicamente estos materiales? Se sumarán al almacén y se descontarán del empleado.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Aprobar', onPress: () => executeAprobarDevolucion(dev) }
        ]
      );
    }
  };

  const loadRetribuciones = async (empleadoId: string) => {
    if (!empleadoId) return;
    setIsLoadingRetribuciones(true);
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/inventario/empleado/${empleadoId}/retribuciones`, { headers });
      if (!res.ok) { const errData = await res.json().catch(() => ({})); throw new Error(errData.error || 'Error al cargar evidencias'); }
      const data = await res.json();
      const evidencias = data.evidencias;

      console.log(`[loadRetribuciones] Fetched ${evidencias?.length} for ${empleadoId}`);

      const parsedData: any[] = [];
      if (evidencias) {
        evidencias.forEach((ev: any) => {
          try {
            const trabajosArr = Array.isArray(ev.descripcion_trabajo)
              ? ev.descripcion_trabajo
              : typeof ev.descripcion_trabajo === 'string'
                ? JSON.parse(ev.descripcion_trabajo || '[]')
                : (ev.descripcion_trabajo && typeof ev.descripcion_trabajo === 'object' ? [ev.descripcion_trabajo] : []);
            const materialesUsadosList: any[] = [];
            if (Array.isArray(trabajosArr)) {
              trabajosArr.forEach((t: any) => {
                if (t.materiales_usados && Array.isArray(t.materiales_usados)) {
                  t.materiales_usados.forEach((m: any) => {
                    materialesUsadosList.push(m);
                  });
                }
              });
            }
            parsedData.push({
              id: ev.id,
              cliente: ev.cliente,
              fecha: new Date(ev.created_at).toLocaleDateString(),
              empleado_nombre: ev.empleado_nombre,
              sobrantes_verificados: ev.sobrantes_verificados,
              materiales: materialesUsadosList
            });
          } catch {
            parsedData.push({
              id: ev.id,
              cliente: ev.cliente,
              fecha: new Date(ev.created_at).toLocaleDateString(),
              empleado_nombre: ev.empleado_nombre,
              sobrantes_verificados: ev.sobrantes_verificados,
              materiales: []
            });
          }
        });
      }

      console.log(`[loadRetribuciones] Setting retribuciones data length: ${parsedData.length}`);
      setRetribucionesData(parsedData);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo cargar las retribuciones');
    } finally {
      setIsLoadingRetribuciones(false);
    }
  };

  const fetchEmployeeInventory = async (empleadoId: string) => {
    setIsLoadingEmployeeInventory(true);
    setEmployeeInventoryModalVisible(true);
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/inventario/empleado/${empleadoId}/retribuciones`, { headers });
      if (!res.ok) { const errData = await res.json().catch(() => ({})); throw new Error(errData.error || 'Error al cargar inventario del empleado'); }
      const data = await res.json();
      setEmployeeInventoryData(data.inventario || []);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo cargar el inventario del empleado');
    } finally {
      setIsLoadingEmployeeInventory(false);
    }
  };

  async function loadAllData(silent = false) {
    if (!silent && !ModuleCache.has('inventario_dashboard')) {
      setIsLoading(true);
    }
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/inventario/dashboard`, { headers });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al cargar datos del dashboard');
      }
      const data = await res.json();
      ModuleCache.set('inventario_dashboard', data);

      setCategorias(data.categorias || []);
      setProveedores(data.proveedores || []);
      setProductos(data.productos || []);
      setHistorialConsumo(data.historial_consumo || []);
      setClientes(data.clientes || []);
      setEmpleados(data.usuarios || []);
      await loadMovimientos();
      loadEmpleadosStock(true);
    } catch (err: any) {
      console.error('Error al cargar datos de inventario:', err);
      if (!silent) {
        Alert.alert('Error', err.message || 'No se pudieron recuperar los datos de inventario.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  const loadEmpleadosStock = async (silent = false) => {
    if (!silent) setIsLoadingEmpleadosStock(true);
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/inventario/inventarios-empleados`, { headers });
      if (res.ok) {
        const data = await res.json();
        setEmpleadosStockData(data);
      }
    } catch (err: any) {
      console.warn('Error al cargar inventario de empleados:', err);
    } finally {
      setIsLoadingEmpleadosStock(false);
    }
  };

  const loadMiInventario = async (targetUserId?: string, silent = false) => {
    const uId = targetUserId || currentUser?.id || authUser?.id;
    if (!uId) return;
    if (!silent) setIsLoadingMiInventario(true);
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/devoluciones/inventario?userId=${uId}`, { headers });
      if (res.ok) {
        const json = await res.json();
        setMiInventario(json.inventario || []);
      }
    } catch (err: any) {
      console.warn('Error al cargar inventario personal:', err);
    } finally {
      setIsLoadingMiInventario(false);
    }
  };

  const handleOpenGastoModal = (item: any) => {
    setGastoTargetItem(item);
    const totalDisp = Number(item.cantidad_disponible) || 0;
    const defaultQty = totalDisp >= 1 ? '1' : String(totalDisp);
    setGastoCantidad(defaultQty);
    const qNuevo = Number(item.cantidad_nuevo) || 0;
    setGastoCantidadNuevo(qNuevo > 0 ? defaultQty : '0');
    setGastoCantidadUsado('0');
    setGastoCantidadPorRev('0');
    setGastoTipo('SERVICIO');
    setGastoClienteId('');
    setGastoClienteNombre('');
    setGastoSucursal('');
    setGastoMotivo('');
    setGastoCliSearch('');
    setShowGastoCliDropdown(false);
    setGastoModalVisible(true);
  };

  const handleConfirmGastoPersonal = async () => {
    if (!gastoTargetItem || !currentUser?.id) return;
    const totalQty = parseFloat(gastoCantidad);
    if (!totalQty || totalQty <= 0) {
      showAlert('Atención', 'Ingresa una cantidad válida mayor a 0');
      return;
    }
    const max = Number(gastoTargetItem.cantidad_disponible) || 0;
    if (totalQty > max) {
      showAlert('Error', `No puedes reportar más de lo disponible (${max})`);
      return;
    }

    setIsSubmittingGasto(true);
    try {
      const headers = await getApiHeaders();
      const prodId = gastoTargetItem.producto_id || gastoTargetItem.producto?.id;
      const res = await fetch(`${getApiUrl()}/api/devoluciones/gasto-material`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          empleado_id: currentUser.id,
          empleado_nombre: currentUser.nombre || 'Administrador',
          tipo_gasto: gastoTipo,
          cliente_id: gastoClienteId || undefined,
          cliente_nombre: gastoClienteNombre || undefined,
          sucursal_nombre: gastoSucursal || undefined,
          detalle_motivo: gastoMotivo.trim() || `Consumo de material (${gastoTipo})`,
          materiales: [
            {
              productoId: prodId,
              cantidad: totalQty,
              cantidad_nuevo: parseFloat(gastoCantidadNuevo) || (gastoCantidadUsado || gastoCantidadPorRev ? 0 : totalQty),
              cantidad_usado: parseFloat(gastoCantidadUsado) || 0,
              cantidad_por_revisar: parseFloat(gastoCantidadPorRev) || 0
            }
          ]
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Error al reportar gasto de material');
      }

      setGastoModalVisible(false);
      showAlert('Éxito', 'Gasto de material registrado correctamente.');
      await Promise.all([
        loadMiInventario(currentUser.id, true),
        loadMovimientos(),
        loadEmpleadosStock(true)
      ]);
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo registrar el gasto.');
    } finally {
      setIsSubmittingGasto(false);
    }
  };

  const handleOpenDevolverModal = (item: any) => {
    setDevolverTargetItem(item);
    const totalDisp = Number(item.cantidad_disponible) || 0;
    setDevolverCantidad(String(totalDisp));
    const qNuevo = Number(item.cantidad_nuevo) || 0;
    const qUsado = Number(item.cantidad_usado) || 0;
    const qPorRev = Number(item.cantidad_por_revisar) || 0;
    setDevolverCantidadNuevo(String(qNuevo));
    setDevolverCantidadUsado(String(qUsado));
    setDevolverCantidadPorRev(String(qPorRev));
    setDevolverMotivo('');
    setDevolverModalVisible(true);
  };

  const handleConfirmDevolucionPersonal = async () => {
    if (!devolverTargetItem || !currentUser?.id) return;
    const totalQty = parseFloat(devolverCantidad);
    if (!totalQty || totalQty <= 0) {
      showAlert('Atención', 'Ingresa una cantidad válida mayor a 0');
      return;
    }
    const max = Number(devolverTargetItem.cantidad_disponible) || 0;
    if (totalQty > max) {
      showAlert('Error', `No puedes devolver más de lo disponible (${max})`);
      return;
    }

    setIsSubmittingDevolucion(true);
    try {
      const headers = await getApiHeaders();
      const prodId = devolverTargetItem.producto_id || devolverTargetItem.producto?.id;
      const res = await fetch(`${getApiUrl()}/api/inventario/devolver-personal`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          empleadoId: currentUser.id,
          motivo: devolverMotivo.trim() || 'Reintegración administrativa a almacén',
          materiales: [
            {
              productoId: prodId,
              cantidad: totalQty,
              cantidad_nuevo: parseFloat(devolverCantidadNuevo) || (devolverCantidadUsado || devolverCantidadPorRev ? 0 : totalQty),
              cantidad_usado: parseFloat(devolverCantidadUsado) || 0,
              cantidad_por_revisar: parseFloat(devolverCantidadPorRev) || 0
            }
          ]
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Error al devolver material al almacén');
      }

      setDevolverModalVisible(false);
      showAlert('Éxito', 'Material devuelto y reintegrado al almacén central exitosamente.');
      await Promise.all([
        loadMiInventario(currentUser.id, true),
        loadAllData(),
        loadMovimientos(),
        loadEmpleadosStock(true)
      ]);
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo realizar la devolución.');
    } finally {
      setIsSubmittingDevolucion(false);
    }
  };

  const loadMovimientos = async () => {
    setIsLoadingMovimientos(true);
    try {
      const headers = await getApiHeaders();
      const apiUrl = getApiUrl();
      console.log('[loadMovimientos] Consultando:', `${apiUrl}/api/inventario/movimientos`);
      let res = await fetch(`${apiUrl}/api/inventario/movimientos`, { headers });
      if (!res.ok) {
        console.warn(`[loadMovimientos] /api/inventario/movimientos devolvió ${res.status}, intentando fallback...`);
        res = await fetch(`${apiUrl}/api/inventario/retiros`, { headers });
      }
      if (res.ok) {
        const data = await res.json();
        const list = data.movimientos || data.retiros || [];
        console.log('[loadMovimientos] Movimientos cargados:', list.length);
        setMovimientos(list);
      } else {
        const errData = await res.json().catch(() => ({}));
        console.warn('[loadMovimientos] No se pudo cargar movimientos:', errData.error || res.statusText);
        setMovimientos([]);
      }
    } catch (err: any) {
      console.warn('[loadMovimientos] Error de conexión:', err?.message || err);
      setMovimientos([]);
    } finally {
      setIsLoadingMovimientos(false);
    }
  };

  const handleExportMovimientosPDF = async (dataToExport: any[]) => {
    if (dataToExport.length === 0) {
      showAlert('Sin Datos', 'No hay movimientos que coincidan con los filtros seleccionados para exportar.');
      return;
    }
    setIsExportingMovimientosPDF(true);
    try {
      await ReportGenerator.exportMovimientosToPDF(dataToExport, 'Reporte de Movimientos de Inventario');
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo generar el reporte PDF.');
    } finally {
      setIsExportingMovimientosPDF(false);
    }
  };

  const handleEliminarMovimiento = async (mov: any) => {
    const executeDelete = async () => {
      try {
        const headers = await getApiHeaders();
        const queryParams = new URLSearchParams({
          source_table: mov.source_table || '',
          folio_factura: mov.folio_factura || ''
        });
        const res = await fetch(`${getApiUrl()}/api/inventario/movimientos/${mov.id}?${queryParams.toString()}`, {
          method: 'DELETE',
          headers
        });
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(errorText || 'Error al eliminar movimiento');
        }
        showAlert('Éxito', 'Movimiento eliminado del historial');
        loadMovimientos();
      } catch (err: any) {
        showAlert('Error', err.message || 'No se pudo eliminar el movimiento');
      }
    };

    if (Platform.OS === 'web') {
      const isConfirmed = window.confirm('¿Estás seguro de que quieres eliminar este registro de movimiento? Esta acción NO afectará las cantidades actuales del inventario, sólo borrará el historial.');
      if (isConfirmed) {
        await executeDelete();
      }
    } else {
      Alert.alert(
        'Confirmar',
        '¿Estás seguro de que quieres eliminar este registro de movimiento? Esta acción NO afectará las cantidades actuales del inventario, sólo borrará el historial.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Eliminar', style: 'destructive', onPress: executeDelete }
        ]
      );
    }
  };

  const handleExportSingleMovimientoVale = async (mov: any) => {
    setExportingSingleMovimientoId(mov.id);
    try {
      let fullMov = { ...mov };
      if ((mov.tiene_firma || !mov.firma_base64) && mov.id) {
        try {
          const headers = await getApiHeaders();
          const res = await fetch(`${getApiUrl()}/api/inventario/firma/${mov.id}`, { headers });
          if (res.ok) {
            const data = await res.json();
            if (data.firma_base64) {
              fullMov.firma_base64 = data.firma_base64;
            }
          }
        } catch (e) {
          console.warn('No se pudo obtener firma bajo demanda:', e);
        }
      }
      await ReportGenerator.exportSingleMovimientoValePDF(fullMov);
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo generar el vale.');
    } finally {
      setExportingSingleMovimientoId(null);
    }
  };

  const handleExportMovimientosCSV = async (dataToExport: any[]) => {
    if (dataToExport.length === 0) {
      showAlert('Sin Datos', 'No hay movimientos que coincidan con los filtros seleccionados para exportar.');
      return;
    }
    setIsExportingMovimientosCSV(true);
    try {
      await ReportGenerator.exportMovimientosToXLSX(dataToExport);
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo generar el archivo CSV.');
    } finally {
      setIsExportingMovimientosCSV(false);
    }
  };

  // --- Centralized Selectors ---
  const openCategoryFilter = () => {
    setSelectorTitle('Filtrar por Categoría');
    setSelectorSearch('');
    setSelectorOptions([
      { id: '', label: 'Todas las Categorías' },
      ...categorias.map(c => ({ id: c.id, label: c.nombre })),
    ]);
    setOnSelectOption(() => (id: string) => {
      setSelectedCategoryFilter(id);
    });
    setSelectorVisible(true);
  };

  const openProveedorSelector = () => {
    setSelectorTitle('Seleccionar Proveedor');
    setSelectorSearch('');
    setSelectorOptions(
      proveedores.map(p => ({ id: p.id, label: `${p.nombre} (${p.rfc})` }))
    );
    setOnSelectOption(() => (id: string) => {
      setSelectedProveedorId(id);
    });
    setSelectorVisible(true);
  };

  const openProductSelectorForStaging = (itemId: string) => {
    setActiveStagingItemId(itemId);
    setSelectorTitle('Buscar Producto del Catálogo');
    setSelectorSearch('');
    setSelectorOptions(
      productos
        .filter(p => p.activo)
        .map(p => ({ id: p.id, label: `${p.nombre_oficial} (${p.sku_interno})` }))
    );
    setOnSelectOption(() => (id: string) => {
      handleUpdateStagingItem(itemId, { productoIdSugerido: id, esNuevoProducto: false });
    });
    setSelectorVisible(true);
  };

  const openFormCatSelector = () => {
    setSelectorTitle('Seleccionar Categoría');
    setSelectorSearch('');
    setSelectorOptions(
      categorias.map(c => ({ id: c.id, label: c.nombre }))
    );
    setOnSelectOption(() => (id: string) => {
      setFormCategoriaId(id);
    });
    setSelectorVisible(true);
  };

  const openFormProveedorSelector = () => {
    setSelectorTitle('Seleccionar Proveedor');
    setSelectorSearch('');
    setSelectorOptions(
      proveedores.map(p => ({ id: p.id, label: `${p.nombre} (${p.rfc})` }))
    );
    setOnSelectOption(() => (id: string) => {
      setFormProveedorId(id);
    });
    setSelectorVisible(true);
  };

  const filteredSelectorOptions = selectorOptions.filter(opt => {
    const norm = normalizeText(selectorSearch);
    return !norm || normalizeText(opt.label).includes(norm);
  });

  // --- Acciones en Lote (Bulk Actions) ---
  const toggleSelectProduct = (id: string) => {
    setSelectedProductIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const clearSelection = () => {
    setSelectedProductIds([]);
  };

  const executeBulkDelete = async () => {
    if (selectedProductIds.length === 0) return;
    setIsBulkDeleting(true);
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/inventario/productos/bulk-delete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ids: selectedProductIds })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al desactivar los productos seleccionados');
      }

      showAlert('Éxito', `Se desactivaron ${selectedProductIds.length} productos del catálogo.`);
      setSelectedProductIds([]);
      await loadAllData();
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudieron desactivar los productos.');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleBulkDelete = () => {
    if (selectedProductIds.length === 0) return;
    const msg = `¿Estás seguro de que deseas desactivar los ${selectedProductIds.length} productos seleccionados del catálogo activo?`;
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) {
        executeBulkDelete();
      }
    } else {
      Alert.alert(
        'Confirmar Eliminación Masiva',
        msg,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Desactivar', style: 'destructive', onPress: executeBulkDelete }
        ]
      );
    }
  };

  const handleOpenBulkEdit = () => {
    if (selectedProductIds.length === 0) return;
    if (selectedProductIds.length === 1) {
      const singleProduct = productos.find(p => p.id === selectedProductIds[0]);
      if (singleProduct) {
        handleOpenEditModal(singleProduct);
        return;
      }
    }
    setBulkUpdateCategory(false);
    setBulkCategoryId(categorias[0]?.id || '');
    setBulkUpdateProveedor(false);
    setBulkProveedorId(proveedores[0]?.id || '');
    setBulkUpdateStock(false);
    setBulkStockValue('');
    setBulkUpdatePrice(false);
    setBulkPriceValue('');
    setBulkEditModalVisible(true);
  };

  const openBulkCategorySelector = () => {
    setSelectorTitle('Seleccionar Categoría para Edición Masiva');
    setSelectorSearch('');
    setSelectorOptions(
      categorias.map(c => ({ id: c.id, label: c.nombre }))
    );
    setOnSelectOption(() => (id: string) => {
      setBulkCategoryId(id);
    });
    setSelectorVisible(true);
  };

  const openBulkProveedorSelector = () => {
    setSelectorTitle('Seleccionar Proveedor para Edición Masiva');
    setSelectorSearch('');
    setSelectorOptions(
      proveedores.map(p => ({ id: p.id, label: `${p.nombre} (${p.rfc})` }))
    );
    setOnSelectOption(() => (id: string) => {
      setBulkProveedorId(id);
    });
    setSelectorVisible(true);
  };

  const handleSaveBulkEdit = async () => {
    if (!bulkUpdateCategory && !bulkUpdateProveedor && !bulkUpdateStock && !bulkUpdatePrice) {
      showAlert('Validación', 'Por favor activa y especifica al menos un campo a modificar.');
      return;
    }

    const updates: any = {};
    if (bulkUpdateCategory) {
      if (!bulkCategoryId) {
        showAlert('Validación', 'Selecciona una categoría válida.');
        return;
      }
      updates.categoria_id = bulkCategoryId;
    }

    if (bulkUpdateProveedor) {
      if (!bulkProveedorId) {
        showAlert('Validación', 'Selecciona un proveedor válido.');
        return;
      }
      updates.proveedor_id = bulkProveedorId;
    }

    if (bulkUpdateStock) {
      const stockNum = parseInt(bulkStockValue, 10);
      if (isNaN(stockNum) || stockNum < 0) {
        showAlert('Validación', 'El stock debe ser un número entero mayor o igual a 0.');
        return;
      }
      updates.stock_actual = stockNum;
    }

    if (bulkUpdatePrice) {
      const priceNum = parseFloat(bulkPriceValue);
      if (isNaN(priceNum) || priceNum < 0) {
        showAlert('Validación', 'El precio debe ser un número mayor o igual a 0.');
        return;
      }
      updates.precio_unitario = priceNum;
    }

    setIsSavingBulkEdit(true);
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/inventario/productos/bulk-update`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ids: selectedProductIds,
          updates
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al actualizar los productos en lote');
      }

      showAlert('Éxito', `Se actualizaron ${selectedProductIds.length} productos correctamente.`);
      setBulkEditModalVisible(false);
      setSelectedProductIds([]);
      await loadAllData();
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudieron actualizar los productos.');
    } finally {
      setIsSavingBulkEdit(false);
    }
  };

  // --- CRUD Manual ---
  const handleOpenCreateModal = () => {
    setEditingProduct(null);
    setFormSku(`SKU-${Math.random().toString(36).substring(3, 8).toUpperCase()}`);
    setFormNombre('');
    setFormCategoriaId(categorias[0]?.id || '');
    setFormProveedorId('');
    setFormStock('0');
    setFormStockNuevo('0');
    setFormStockUsado('0');
    setFormStockPorRevisar('0');
    setShowEstadoBreakdown(false);
    setFormUnidad('pza');
    setFormPrecio('');
    setCrudModalVisible(true);
  };

  const handleOpenEditModal = (p: Producto) => {
    setEditingProduct(p);
    setFormSku(p.sku_interno);
    setFormNombre(p.nombre_oficial);
    setFormCategoriaId(p.categoria_id || '');
    setFormProveedorId(p.proveedor_id || '');
    setFormStock(p.stock_actual.toString());

    const nuevo = p.stock_nuevo !== undefined ? p.stock_nuevo : (p.stock_usado || p.stock_por_revisar ? 0 : p.stock_actual);
    const usado = p.stock_usado ?? 0;
    const porRevisar = p.stock_por_revisar ?? 0;

    setFormStockNuevo(nuevo.toString());
    setFormStockUsado(usado.toString());
    setFormStockPorRevisar(porRevisar.toString());
    setShowEstadoBreakdown(usado > 0 || porRevisar > 0);
    setFormUnidad(p.unidad || 'pza');
    setFormPrecio(p.precio_unitario?.toString() || '0');
    setCrudModalVisible(true);
  };

  const handleSaveProduct = async () => {
    if (!formSku.trim() || !formNombre.trim() || !formCategoriaId) {
      Alert.alert('Validación', 'Por favor llena el SKU, Nombre y Categoría del producto.');
      return;
    }

    const stockTotalNum = parseFloat(formStock);
    if (isNaN(stockTotalNum) || stockTotalNum < 0) {
      Alert.alert('Validación', 'El stock inicial debe ser un número mayor o igual a 0.');
      return;
    }

    const numNuevo = Math.max(0, parseFloat(formStockNuevo) || 0);
    const numUsado = Math.max(0, parseFloat(formStockUsado) || 0);
    const numPorRevisar = Math.max(0, parseFloat(formStockPorRevisar) || 0);
    const sumaCondiciones = Math.round((numNuevo + numUsado + numPorRevisar) * 100) / 100;

    if (showEstadoBreakdown && sumaCondiciones > stockTotalNum) {
      Alert.alert(
        'Validación de Stock',
        `La suma de las condiciones (${sumaCondiciones}) no puede superar el Stock Inicial total (${stockTotalNum}). Por favor ajusta las cantidades.`
      );
      return;
    }

    let finalNuevo = numNuevo;
    let finalUsado = numUsado;
    let finalPorRevisar = numPorRevisar;

    if (!showEstadoBreakdown || (finalUsado === 0 && finalPorRevisar === 0)) {
      finalNuevo = stockTotalNum;
      finalUsado = 0;
      finalPorRevisar = 0;
    } else if (sumaCondiciones < stockTotalNum) {
      finalNuevo = Math.round((stockTotalNum - finalUsado - finalPorRevisar) * 100) / 100;
    }

    setIsSavingProduct(true);
    try {
      const headers = await getApiHeaders();
      const payload = {
        sku_interno: formSku.trim().toUpperCase(),
        nombre_oficial: formNombre.trim(),
        categoria_id: formCategoriaId,
        proveedor_id: formProveedorId || null,
        stock_actual: stockTotalNum,
        stock_nuevo: finalNuevo,
        stock_usado: finalUsado,
        stock_por_revisar: finalPorRevisar,
        unidad: formUnidad.trim() || 'pza',
        precio_unitario: parseFloat(formPrecio) || 0,
        activo: true,
      };

      const url = editingProduct
        ? `${getApiUrl()}/api/inventario/productos/${editingProduct.id}`
        : `${getApiUrl()}/api/inventario/productos`;
      const method = editingProduct ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify({
          ...payload,
          proveedor_id: formProveedorId || null
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al guardar el producto en el servidor');
      }

      const resJson = await res.json().catch(() => ({}));
      showAlert('Éxito', editingProduct ? 'Producto actualizado correctamente.' : 'Producto agregado correctamente.');

      setCrudModalVisible(false);

      if (editingProduct) {
        setProductos(prev => prev.map(prod => prod.id === editingProduct.id ? { ...prod, ...payload } : prod));
      } else if (resJson.data) {
        setProductos(prev => [resJson.data, ...prev]);
      }

      await loadAllData();
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo guardar el producto.');
    } finally {
      setIsSavingProduct(false);
    }
  };

  const handleSoftDeleteProduct = (p: Producto) => {
    const performDelete = async () => {
      setProductos(prev => prev.map(prod => prod.id === p.id ? { ...prod, activo: false } : prod));
      try {
        const headers = await getApiHeaders();
        const res = await fetch(`${getApiUrl()}/api/inventario/productos/${p.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ activo: false })
        });

        if (!res.ok) {
          setProductos(prev => prev.map(prod => prod.id === p.id ? { ...prod, activo: true } : prod));
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Error al desactivar el producto');
        }
        showAlert('Éxito', 'Producto desactivado.');
      } catch (err: any) {
        showAlert('Error', err.message || 'No se pudo desactivar el producto.');
      }
    };

    if (Platform.OS === 'web') {
      const confirm = window.confirm(`¿Estás seguro de que deseas desactivar el producto "${p.nombre_oficial}" del catálogo activo?`);
      if (confirm) {
        performDelete();
      }
    } else {
      Alert.alert(
        'Confirmar Desactivación',
        `¿Estás seguro de que deseas desactivar el producto "${p.nombre_oficial}" del catálogo activo?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Desactivar',
            style: 'destructive',
            onPress: performDelete,
          },
        ]
      );
    }
  };

  const handleHardDeleteProduct = (p: Producto) => {
    const performHardDelete = async () => {
      try {
        const headers = await getApiHeaders();
        const res = await fetch(`${getApiUrl()}/api/inventario/productos/${p.id}`, {
          method: 'DELETE',
          headers,
        });

        const data = await res.json();
        if (!res.ok) {
          if (data.isForeignKeyConstraint) {
            showAlert(
              'No se puede eliminar definitivamente',
              data.error || 'Este producto está vinculado a ventas, cotizaciones o movimientos históricos. Puedes desactivarlo si deseas ocultarlo.'
            );
            return;
          }
          throw new Error(data.error || 'Error al eliminar el producto de la base de datos');
        }

        setProductos(prev => prev.filter(prod => prod.id !== p.id));
        showAlert('Éxito', `El producto "${p.nombre_oficial}" ha sido borrado definitivamente de la base de datos.`);
      } catch (err: any) {
        showAlert('Error', err.message || 'No se pudo eliminar el producto.');
      }
    };

    const msg = `¿Estás seguro de que deseas ELIMINAR DEFINITIVAMENTE el producto "${p.nombre_oficial}"? Esta acción no se puede deshacer y borrará permanentemente el registro del sistema.`;
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) {
        performHardDelete();
      }
    } else {
      Alert.alert(
        'Eliminación Definitiva (Hard Delete)',
        msg,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Borrar para siempre', style: 'destructive', onPress: performHardDelete }
        ]
      );
    }
  };

  const handleReactivateProduct = async (p: Producto) => {
    setProductos(prev => prev.map(prod => prod.id === p.id ? { ...prod, activo: true } : prod));
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/inventario/productos/${p.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ activo: true })
      });

      if (!res.ok) {
        setProductos(prev => prev.map(prod => prod.id === p.id ? { ...prod, activo: false } : prod));
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al reactivar el producto');
      }
      showAlert('Éxito', `El producto "${p.nombre_oficial}" ha sido reactivado.`);
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo reactivar el producto.');
    }
  };

  const handleQuickAddStock = async (product: Producto) => {
    const rawStr = (quickStockAdjustments[product.id] ?? '').trim();
    const toAdd = rawStr === '' ? 1 : parseFloat(rawStr);

    if (isNaN(toAdd) || toAdd <= 0) {
      showAlert('Validación', 'Por favor ingresa un número mayor a 0 para añadir al stock.');
      return;
    }

    const prevStock = Number(product.stock_actual) || 0;
    const prevNuevo = Number(product.stock_nuevo) || 0;
    const newStock = Math.round((prevStock + toAdd) * 100) / 100;
    const newNuevo = Math.round((prevNuevo + toAdd) * 100) / 100;

    setProductos(prev =>
      prev.map(prod =>
        prod.id === product.id
          ? { ...prod, stock_actual: newStock, stock_nuevo: newNuevo }
          : prod
      )
    );
    setQuickStockAdjustments(prev => ({ ...prev, [product.id]: '' }));

    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/inventario/productos/${product.id}/stock`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          cantidad: toAdd,
          motivo: 'AJUSTE_RAPIDO',
          currentStock: prevStock
        })
      });

      if (!res.ok) {
        setProductos(prev =>
          prev.map(prod =>
            prod.id === product.id
              ? { ...prod, stock_actual: prevStock, stock_nuevo: prevNuevo }
              : prod
          )
        );
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al añadir stock');
      }

      ModuleCache.invalidate('inventario_dashboard');
      setQuickStockAdjustments(prev => ({ ...prev, [product.id]: '' }));

      showAlert('Éxito', `Se añadieron ${toAdd} ${product.unidad || 'unidades'} a "${product.nombre_oficial}". Stock actual: ${newStock} ${product.unidad || 'pzas'}`);
      await loadAllData(true);
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo actualizar el stock del producto.');
    }
  };

  // --- Crear Categorías y Proveedores de Forma Manual ---
  const handleCreateCategory = async () => {
    if (!newCatNombre.trim()) {
      Alert.alert('Validación', 'Por favor ingresa el nombre de la categoría.');
      return;
    }
    setIsSavingNewCat(true);
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/inventario/catalogos/categoria`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          nombre: newCatNombre.trim(),
          descripcion: newCatDesc.trim() || null,
        })
      });
      if (!res.ok) { const errData = await res.json().catch(() => ({})); throw new Error(errData.error || 'Error al crear categoría'); }

      Alert.alert('Éxito', 'Categoría agregada correctamente.');
      setNewCatNombre('');
      setNewCatDesc('');
      setNewCatModalVisible(false);
      await loadAllData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo guardar la categoría.');
    } finally {
      setIsSavingNewCat(false);
    }
  };

  const handleCreateProveedor = async () => {
    if (!newProvNombre.trim()) {
      Alert.alert('Validación', 'Por favor ingresa el nombre del proveedor.');
      return;
    }

    const cleanRfc = newProvRfc.trim().toUpperCase();
    if (cleanRfc && cleanRfc.length !== 12 && cleanRfc.length !== 13) {
      Alert.alert('Validación', 'El RFC debe tener exactamente 12 o 13 caracteres.');
      return;
    }

    setIsSavingNewProv(true);
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/inventario/catalogos/proveedor`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          nombre: newProvNombre.trim(),
          rfc: cleanRfc || null,
        })
      });
      if (!res.ok) { const errData = await res.json().catch(() => ({})); throw new Error(errData.error || 'Error al crear proveedor'); }

      Alert.alert('Éxito', 'Proveedor agregado correctamente.');
      setNewProvNombre('');
      setNewProvRfc('');
      setNewProvModalVisible(false);
      await loadAllData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo guardar el proveedor.');
    } finally {
      setIsSavingNewProv(false);
    }
  };

  const handleAddNewCliente = async (nombre: string) => {
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/inventario/catalogos/cliente`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ nombre: nombre.trim() })
      });
      if (!res.ok) { const errData = await res.json().catch(() => ({})); throw new Error(errData.error || 'Error al crear cliente'); }
      const data = await res.json();
      if (data && data.data) {
        const newCli = data.data;
        setClientes(prev => [...prev, newCli].sort((a, b) => a.nombre.localeCompare(b.nombre)));
        setConsumoCliente(newCli.nombre);
      } else {
        await loadAllData();
        setConsumoCliente(nombre.trim());
      }
      setClienteSearch('');
      setShowCliDropdown(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo agregar el cliente.');
    }
  };

  // --- Registrar Consumo de Materiales ---
  const openProductSelectorForConsumo = () => {
    setSelectorTitle('Seleccionar Producto para Consumo');
    setSelectorSearch('');
    setSelectorOptions(
      productos
        .filter(p => p.activo)
        .map(p => ({
          id: p.id,
          label: `${p.nombre_oficial} (${p.sku_interno}) - Stock: ${p.stock_actual} ${p.unidad || 'pzas'}`,
        }))
    );
    setOnSelectOption(() => (id: string) => {
      setConsumoItems(prev => {
        const exists = prev.some(item => item.productoId === id);
        if (exists) {
          Alert.alert('Información', 'Este producto ya ha sido agregado a la lista de consumo.');
          return prev;
        }
        return [
          ...prev,
          {
            id: `consumo-${Date.now()}-${Math.random().toString(36).substring(3, 8)}`,
            productoId: id,
            cantidad: 1,
          },
        ];
      });
    });
    setSelectorVisible(true);
  };

  const handleRemoveConsumoItem = (id: string) => {
    setConsumoItems(prev => prev.filter(item => item.id !== id));
  };

  const handleUpdateConsumoItemQty = (id: string, qty: number) => {
    setConsumoItems(prev =>
      prev.map(item => {
        if (item.id !== id) return item;
        const prod = productos.find(p => p.id === item.productoId);
        const maxStock = prod ? (Number(prod.stock_actual) || 0) : 0;
        if (qty > maxStock) {
          Alert.alert('Stock Insuficiente', `No puedes consumir más de ${maxStock} ${prod?.unidad || 'unidades'} disponibles.`);
        }
        const clamped = Math.min(Math.max(0, qty), maxStock);
        return { ...item, cantidad: clamped };
      })
    );
  };

  const handleSaveConsumo = async () => {
    if (!consumoCliente.trim()) {
      Alert.alert('Validación', 'Por favor ingresa el Cliente o Referencia del Trabajo.');
      return;
    }

    if (consumoItems.length === 0) {
      Alert.alert('Validación', 'Agrega al menos un producto a descontar.');
      return;
    }

    for (const item of consumoItems) {
      const prod = productos.find(p => p.id === item.productoId);
      if (!prod) continue;

      if (item.cantidad <= 0) {
        Alert.alert('Validación', `La cantidad a consumir para "${prod.nombre_oficial}" debe ser mayor a 0.`);
        return;
      }

      if (item.cantidad > prod.stock_actual) {
        Alert.alert(
          'Stock Insuficiente',
          `No puedes consumir ${item.cantidad} ${prod.unidad || 'unidades'} de "${prod.nombre_oficial}" porque solo hay ${prod.stock_actual} disponibles.`
        );
        return;
      }
    }

    setIsSavingConsumo(true);
    try {
      const headers = await getApiHeaders();
      const itemsPayload = consumoItems.map(item => {
        const prod = productos.find(p => p.id === item.productoId)!;
        return {
          productoId: item.productoId,
          qty: item.cantidad,
          currentStock: prod.stock_actual
        };
      });

      const res = await fetch(`${getApiUrl()}/api/inventario/consumos`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          items: itemsPayload,
          esAsignacionEmpleado: false,
          destinoId: null,
          motivoGeneral: consumoCliente.trim()
        })
      });

      if (!res.ok) { const errData = await res.json().catch(() => ({})); throw new Error(errData.error || 'Error al registrar consumo'); }

      Alert.alert('Éxito', 'Consumo registrado. Se actualizaron los niveles de stock.');
      setConsumoItems([]);
      setConsumoCliente('');
      setActiveTab('importacion');
      await loadAllData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo guardar la nota de consumo.');
    } finally {
      setIsSavingConsumo(false);
    }
  };

  // --- Asignación de Material a Empleado / Camioneta ---
  const handleOpenAsignarModal = (preselectedEmpId?: string, prefillProductIds?: string[]) => {
    setAsignarEmpleadoId(preselectedEmpId || selectedEmpleadoRetribucion || '');
    setAsignarMotivo('');
    setAsignarProductSearch('');
    setShowAsignarEmpDropdown(false);
    setAsignarEmpSearch('');

    if (prefillProductIds && prefillProductIds.length > 0) {
      const itemsPrefill: AsignarItem[] = prefillProductIds
        .map(pId => {
          const prod = productos.find(p => p.id === pId);
          if (!prod) return null;
          return {
            id: `asig-${Date.now()}-${Math.random().toString(36).substring(3, 7)}`,
            productoId: pId,
            cantidad: 1
          };
        })
        .filter(Boolean) as AsignarItem[];
      setAsignarItems(itemsPrefill);
    } else {
      setAsignarItems([]);
    }
    setAsignarModalVisible(true);
  };

  const handleAddProductToAsignar = (prodId: string) => {
    const prod = productos.find(p => p.id === prodId);
    if (!prod) return;
    if (prod.stock_actual <= 0) {
      Alert.alert('Sin Stock', `El producto "${prod.nombre_oficial}" no tiene stock disponible en el inventario general.`);
      return;
    }

    setAsignarItems(prev => {
      const existing = prev.find(item => item.productoId === prodId);
      if (existing) {
        if (existing.cantidad + 1 > prod.stock_actual) {
          Alert.alert('Stock Insuficiente', `Solo hay ${prod.stock_actual} ${prod.unidad || 'unidades'} disponibles de "${prod.nombre_oficial}".`);
          return prev;
        }
        return prev.map(item => item.productoId === prodId ? { ...item, cantidad: item.cantidad + 1 } : item);
      }
      return [
        ...prev,
        {
          id: `asig-${Date.now()}-${Math.random().toString(36).substring(3, 7)}`,
          productoId: prodId,
          cantidad: 1
        }
      ];
    });
    setAsignarProductSearch('');
  };

  const handleRemoveProductFromAsignar = (id: string) => {
    setAsignarItems(prev => prev.filter(item => item.id !== id));
  };

  const handleUpdateAsignarItemQty = (id: string, qty: number) => {
    setAsignarItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const prod = productos.find(p => p.id === item.productoId);
      const maxStock = prod ? (Number(prod.stock_actual) || 0) : 0;
      if (qty > maxStock) {
        Alert.alert('Stock Insuficiente', `No puedes agregar más de ${maxStock} ${prod?.unidad || 'unidades'} disponibles en almacén.`);
      }
      const clamped = Math.min(Math.max(0, qty), maxStock);
      return { ...item, cantidad: clamped };
    }));
  };

  const handleConfirmAsignacion = async () => {
    if (!asignarEmpleadoId) {
      Alert.alert('Validación', 'Por favor selecciona al empleado destinatario.');
      return;
    }

    if (asignarItems.length === 0) {
      Alert.alert('Validación', 'Agrega al menos un material para transferir al empleado.');
      return;
    }

    for (const item of asignarItems) {
      const prod = productos.find(p => p.id === item.productoId);
      if (!prod) continue;
      if (item.cantidad <= 0) {
        Alert.alert('Validación', `La cantidad para "${prod.nombre_oficial}" debe ser mayor a 0.`);
        return;
      }
      if (item.cantidad > prod.stock_actual) {
        Alert.alert(
          'Stock Insuficiente',
          `No puedes asignar ${item.cantidad} ${prod.unidad || 'unidades'} de "${prod.nombre_oficial}" porque solo hay ${prod.stock_actual} en el inventario general.`
        );
        return;
      }
    }

    setIsSubmittingAsignacion(true);
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/inventario/asignar-empleado`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          empleadoId: asignarEmpleadoId,
          motivo: (asignarMotivo || '').trim(),
          items: asignarItems.map(it => ({
            productoId: it.productoId,
            cantidad: it.cantidad
          }))
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Error al asignar material al empleado');
      }

      const empName = empleados.find(e => e.id === asignarEmpleadoId)?.nombre || 'el empleado';
      Alert.alert('Éxito', data.mensaje || `Material asignado exitosamente a ${empName}.`);
      setAsignarModalVisible(false);
      setAsignarItems([]);
      setAsignarMotivo('');

      if (selectedEmpleadoRetribucion === asignarEmpleadoId) {
        loadRetribuciones(asignarEmpleadoId);
        loadDevolucionesPendientes(asignarEmpleadoId);
      }

      await loadAllData(true);
      if (asignarEmpleadoId === currentUser?.id) {
        loadMiInventario(currentUser?.id, true);
      }
      loadEmpleadosStock(true);
      clearSelection();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo completar la transferencia de material.');
    } finally {
      setIsSubmittingAsignacion(false);
    }
  };

  // --- Carga de Factura PDF/Imagen e IA ---
  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const fileAsset = result.assets[0];
      const uri = fileAsset.uri;
      const mimeType = fileAsset.mimeType || '';

      const isPdf = mimeType.includes('pdf') || uri.endsWith('.pdf') || fileAsset.name?.endsWith('.pdf');
      const isImage = mimeType.startsWith('image/') || uri.endsWith('.jpg') || uri.endsWith('.jpeg') || uri.endsWith('.png') || uri.endsWith('.webp');

      if (!isPdf && !isImage) {
        Alert.alert('Validación', 'Por favor selecciona únicamente archivos PDF o imágenes (JPG, PNG, WEBP).');
        return;
      }

      const resolvedMime = mimeType || (uri.endsWith('.pdf') || fileAsset.name?.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

      setIsAnalyzing(true);

      let base64Data = '';
      if (Platform.OS === 'web') {
        const response = await fetch(uri);
        const blob = await response.blob();
        base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const resultStr = reader.result as string;
            const data = resultStr.split(',')[1] || resultStr;
            resolve(data);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } else {
        base64Data = await new Promise<string>((resolve, reject) => {
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
        base64Data = base64Data.replace(/^data:[a-zA-Z0-9/\-+.]+;base64,/, '');
      }

      const catalogoMaestro = categorias.map(cat => ({
        categoria: cat.nombre,
        productos: productos
          .filter(p => p.categoria_id === cat.id && p.activo)
          .map(p => ({
            sku: p.sku_interno,
            nombre: p.nombre_oficial,
          })),
      }));
      const catalogoMaestroJson = JSON.stringify(catalogoMaestro, null, 2);

      const extraction = await GeminiService.extractInvoiceProducts(
        base64Data,
        resolvedMime,
        catalogoMaestroJson
      );

      if (extraction && extraction.partidas_extraidas) {
        if (extraction.factura_metadata) {
          const meta = extraction.factura_metadata;
          if (meta.folio_factura) {
            setFolioFactura(meta.folio_factura);
          }
          if (meta.proveedor_original) {
            const provName = normalizeText(meta.proveedor_original);
            const rfcClean = meta.rfc_emisor?.replace(/[^A-Z0-9]/ig, '') || '';
            const matchingProv = proveedores.find(p => {
              const pRfcClean = p.rfc?.replace(/[^A-Z0-9]/ig, '') || '';
              return (rfcClean && pRfcClean === rfcClean) || (provName && normalizeText(p.nombre).includes(provName));
            });
            if (matchingProv) {
              setSelectedProveedorId(matchingProv.id);
            }
          }
        }

        const mappedItems: FacturaItemStaging[] = extraction.partidas_extraidas.map((item, idx) => {
          const iaClass = item.clasificacion_ia;

          let suggestedProd = null;
          if (iaClass.producto_normalizado) {
            const normIaProd = normalizeText(iaClass.producto_normalizado);
            suggestedProd = productos.find(p =>
              p.activo && normalizeText(p.nombre_oficial) === normIaProd
            );
          }

          if (!suggestedProd && iaClass.producto_normalizado) {
            const normIaProd = normalizeText(iaClass.producto_normalizado);
            suggestedProd = productos.find(p =>
              p.activo && normalizeText(p.nombre_oficial).includes(normIaProd)
            );
          }

          const esNuevo = !suggestedProd || iaClass.requiere_revision || iaClass.confianza_mapeo < 0.80;

          const normIaCat = normalizeText(iaClass.categoria_maestra);
          const suggestedCat = categorias.find(c =>
            normalizeText(c.nombre) === normIaCat
          );

          return {
            id: `item-${idx}-${Date.now()}`,
            nombreFactura: item.descripcion_proveedor,
            cantidad: item.cantidad,
            precioUnitario: item.precio_unitario,
            productoIdSugerido: suggestedProd?.id,
            esNuevoProducto: esNuevo,
            categoriaSeleccionadaId: suggestedCat?.id || categorias[0]?.id,
            skuSugerido: esNuevo ? 'SKU-AI-' + Math.random().toString(36).substring(3, 8).toUpperCase() : undefined,
          };
        });

        setStagingItems(mappedItems);
      } else {
        throw new Error('La respuesta del servicio de IA no contiene partidas extraídas.');
      }
    } catch (err: any) {
      console.error('Error al procesar factura con IA:', err);
      Alert.alert('Error de Extracción', err.message || 'No se pudo procesar la factura con Inteligencia Artificial.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUpdateStagingItem = (id: string, updates: Partial<FacturaItemStaging>) => {
    setStagingItems(prev =>
      prev.map(item => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const handleSaveAIImport = async () => {
    if (!selectedProveedorId) {
      showAlert('Validación', 'Por favor selecciona un Proveedor de la lista (icono de búsqueda 🔍 junto a Proveedor Asignado).');
      return;
    }
    if (!folioFactura.trim()) {
      showAlert('Validación', 'Por favor ingresa el Folio de la Factura.');
      return;
    }
    if (stagingItems.length === 0) {
      showAlert('Validación', 'No hay ítems para procesar.');
      return;
    }
    if (folioDuplicado) {
      showAlert('Error', 'El folio de factura ingresado ya ha sido registrado previamente en el sistema. Cambia el folio para continuar.');
      return;
    }

    setIsSavingAIImport(true);
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/inventario/importar`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mappedItems: stagingItems.map(item => ({
            esNuevoProducto: item.esNuevoProducto,
            skuSugerido: item.skuSugerido,
            descripcionFactura: item.nombreFactura,
            categoriaSeleccionadaId: item.categoriaSeleccionadaId || categorias[0]?.id,
            cantidad: item.cantidad,
            precioUnitario: item.precioUnitario || 0,
            matchedProductId: item.productoIdSugerido
          })),
          proveedorId: selectedProveedorId,
          folioFactura: folioFactura.trim()
        })
      });

      if (!res.ok) { const errData = await res.json().catch(() => ({})); throw new Error(errData.error || 'Error al procesar la importación por IA'); }

      showAlert('Éxito', 'Inventario actualizado correctamente.');
      setStagingItems([]);
      setFolioFactura('');
      setSelectedProveedorId('');
      setActiveTab('importacion');
      await loadAllData();
    } catch (err: any) {
      console.error('Error crítico en handleSaveAIImport:', err);
      showAlert('Error', err.message || 'No se pudo guardar la importación.');
    } finally {
      setIsSavingAIImport(false);
    }
  };

  // Filtrado de catálogo memoizado
  const filteredProducts = useMemo(() => {
    const normSearch = normalizeText(searchTerm);
    return productos.filter(p => {
      if (!showInactive && !p.activo) return false;
      if (!showOutOfStock && (p.stock_actual || 0) <= 0) return false;
      const matchesSearch = !normSearch ||
        normalizeText(p.nombre_oficial).includes(normSearch) ||
        normalizeText(p.sku_interno).includes(normSearch);
      const matchesCat = selectedCategoryFilter ? p.categoria_id === selectedCategoryFilter : true;
      return matchesSearch && matchesCat;
    });
  }, [productos, showInactive, showOutOfStock, searchTerm, selectedCategoryFilter]);

  const toggleSelectAll = () => {
    const activeIds = filteredProducts.map(p => p.id);
    const areAllSelected = activeIds.length > 0 && activeIds.every(id => selectedProductIds.includes(id));
    if (areAllSelected) {
      setSelectedProductIds(prev => prev.filter(id => !activeIds.includes(id)));
    } else {
      const newSet = new Set([...selectedProductIds, ...activeIds]);
      setSelectedProductIds(Array.from(newSet));
    }
  };

  useEffect(() => {
    setCurrentPageProd(1);
  }, [searchTerm, selectedCategoryFilter, showInactive, showOutOfStock]);

  const totalPagesProd = Math.ceil(filteredProducts.length / pageSizeProd) || 1;
  const paginatedProducts = useMemo(() => {
    const start = (currentPageProd - 1) * pageSizeProd;
    return filteredProducts.slice(start, start + pageSizeProd);
  }, [filteredProducts, currentPageProd, pageSizeProd]);

  // Filtrado y estadísticas de Movimientos memoizados
  const { filteredMovimientos, totalMovimientosCount, totalEntradasCount, totalSalidasCount, totalGastosCount } = useMemo(() => {
    const normSearch = normalizeText(movimientosSearch);
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const filtered = movimientos.filter((m) => {
      if (m.source_table === 'movimientos_inventario' && /^ASIGNACI[OÓ]N/i.test(m.folio_factura || '')) {
        const hasGrouped = movimientos.some((other) => {
          if (other.id === m.id) return false;
          const otherTime = new Date(other.fecha || other.created_at || 0).getTime();
          const mTime = new Date(m.fecha || m.created_at || 0).getTime();
          if (Math.abs(otherTime - mTime) > 600000) return false;
          const isGroup = Array.isArray(other.materiales) && other.materiales.length > 0;
          const isAsig = other.tipo_gasto === 'Asignación de Material' || /asignaci[oó]n/i.test(other.tipo_gasto || '') || /asignaci[oó]n/i.test(other.folio_factura || '');
          return isGroup && isAsig;
        });
        if (hasGrouped) return false;
      }

      if (selectedUsuarioMovimiento &&
          m.usuario_id !== selectedUsuarioMovimiento &&
          m.usuario_nombre !== selectedUsuarioMovimiento &&
          m.empleado_id !== selectedUsuarioMovimiento &&
          m.empleado_nombre !== selectedUsuarioMovimiento) {
        return false;
      }

      if (selectedTipoMovimiento !== 'TODOS') {
        const isG = m.tipo === 'GASTO' || m.subtipo === 'GASTO' || m.subtipo === 'CONSUMO';
        const isDev = m.tipo === 'DEVOLUCIÓN' || m.subtipo === 'DEVOLUCIÓN';
        const isComp = m.tipo === 'COMPRA/FACTURA' || m.subtipo === 'COMPRA/FACTURA';
        const isEnt = m.tipo === 'ENTRADA' || (isDev && !isG);
        const isSal = (m.tipo === 'SALIDA' || m.subtipo === 'SALIDA' || m.subtipo === 'RETIRO') && !isG;

        if (selectedTipoMovimiento === 'ENTRADA' && !isEnt) return false;
        if (selectedTipoMovimiento === 'SALIDA' && !isSal) return false;
        if (selectedTipoMovimiento === 'GASTO' && !isG) return false;
        if (selectedTipoMovimiento === 'DEVOLUCIÓN' && !isDev) return false;
        if (selectedTipoMovimiento === 'COMPRA/FACTURA' && !isComp) return false;
      }

      const dateVal = m.fecha || m.created_at;
      if (selectedDateFilterMov !== 'TODOS' && dateVal) {
        const d = new Date(dateVal);
        if (selectedDateFilterMov === 'HOY') {
          if (d.toDateString() !== now.toDateString()) return false;
        } else if (selectedDateFilterMov === 'SEMANA') {
          if (d < oneWeekAgo) return false;
        } else if (selectedDateFilterMov === 'MES') {
          if (d.getMonth() !== currentMonth || d.getFullYear() !== currentYear) return false;
        }
      }

      if (normSearch) {
        const matchProd = normalizeText(m.producto_nombre || '').includes(normSearch);
        const matchSku = normalizeText(m.producto_sku || '').includes(normSearch);
        const matchUser = normalizeText(m.usuario_nombre || m.empleado_nombre || '').includes(normSearch);
        const matchCli = normalizeText(m.cliente_nombre || '').includes(normSearch);
        const matchDet = normalizeText(m.detalle_motivo || m.folio_factura || '').includes(normSearch);
        const matchProv = normalizeText(m.proveedor_nombre || '').includes(normSearch);
        const matchMats = (Array.isArray(m.materiales) ? m.materiales : []).some(
          (mat: any) => normalizeText(mat.nombre || '').includes(normSearch) || normalizeText(mat.sku || '').includes(normSearch)
        );
        if (!matchProd && !matchSku && !matchUser && !matchCli && !matchDet && !matchProv && !matchMats) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => {
      const tA = new Date(a.fecha || a.created_at || 0).getTime();
      const tB = new Date(b.fecha || b.created_at || 0).getTime();
      return tB - tA;
    });

    let totalEntradas = 0;
    let totalSalidas = 0;
    let totalGastos = 0;

    filtered.forEach((m) => {
      const isG = m.tipo === 'GASTO' || m.subtipo === 'GASTO' || m.subtipo === 'CONSUMO';
      const isEnt = m.tipo === 'ENTRADA' || m.subtipo === 'ENTRADA' || m.subtipo === 'DEVOLUCIÓN' || m.subtipo === 'COMPRA/FACTURA';
      if (isG) totalGastos++;
      else if (isEnt) totalEntradas++;
      else totalSalidas++;
    });

    return {
      filteredMovimientos: filtered,
      totalMovimientosCount: filtered.length,
      totalEntradasCount: totalEntradas,
      totalSalidasCount: totalSalidas,
      totalGastosCount: totalGastos,
    };
  }, [movimientos, selectedUsuarioMovimiento, selectedTipoMovimiento, selectedDateFilterMov, movimientosSearch]);

  // Filtrado y agrupaciones de Material en Empleados memoizados
  const { filteredEmpleadosStock, filteredPorEmpleado, filteredPorProducto } = useMemo(() => {
    const norm = normalizeText(empleadosStockSearch);

    let list = empleadosStockData.inventario || [];
    if (selectedEmpleadoStockFilter) {
      list = list.filter(it => it.empleado_id === selectedEmpleadoStockFilter);
    }
    if (norm) {
      list = list.filter(it =>
        normalizeText(it.empleado_nombre || '').includes(norm) ||
        normalizeText(it.producto_nombre || '').includes(norm) ||
        normalizeText(it.producto_sku || '').includes(norm) ||
        normalizeText(it.categoria_nombre || '').includes(norm)
      );
    }

    const empMap = new Map<string, any>();
    list.forEach(item => {
      if (!empMap.has(item.empleado_id)) {
        empMap.set(item.empleado_id, {
          empleado_id: item.empleado_id,
          empleado_nombre: item.empleado_nombre,
          empleado_email: item.empleado_email,
          empleado_rol: item.empleado_rol,
          total_articulos: 0,
          total_partidas: 0,
          valor_total: 0,
          materiales: []
        });
      }
      const e = empMap.get(item.empleado_id);
      e.total_articulos = Math.round((e.total_articulos + item.cantidad_disponible) * 100) / 100;
      e.total_partidas += 1;
      e.valor_total = Math.round((e.valor_total + item.valor_estimado) * 100) / 100;
      e.materiales.push(item);
    });

    const prodMap = new Map<string, any>();
    list.forEach(item => {
      if (!prodMap.has(item.producto_id)) {
        prodMap.set(item.producto_id, {
          producto_id: item.producto_id,
          producto_nombre: item.producto_nombre,
          producto_sku: item.producto_sku,
          producto_unidad: item.producto_unidad,
          producto_precio: item.producto_precio,
          categoria_nombre: item.categoria_nombre,
          producto_stock_general: item.producto_stock_general,
          total_custodia: 0,
          total_nuevo: 0,
          total_usado: 0,
          total_por_revisar: 0,
          valor_total: 0,
          empleados: []
        });
      }
      const p = prodMap.get(item.producto_id);
      p.total_custodia = Math.round((p.total_custodia + item.cantidad_disponible) * 100) / 100;
      p.total_nuevo = Math.round((p.total_nuevo + item.cantidad_nuevo) * 100) / 100;
      p.total_usado = Math.round((p.total_usado + item.cantidad_usado) * 100) / 100;
      p.total_por_revisar = Math.round((p.total_por_revisar + item.cantidad_por_revisar) * 100) / 100;
      p.valor_total = Math.round((p.valor_total + item.valor_estimado) * 100) / 100;
      p.empleados.push(item);
    });

    return {
      filteredEmpleadosStock: list,
      filteredPorEmpleado: Array.from(empMap.values()),
      filteredPorProducto: Array.from(prodMap.values())
    };
  }, [empleadosStockData, empleadosStockSearch, selectedEmpleadoStockFilter]);

  const handleExportEmpleadosStockExcel = async () => {
    if (filteredEmpleadosStock.length === 0) {
      showAlert('Sin Datos', 'No hay material asignado en inventarios de empleados para exportar.');
      return;
    }
    setIsExportingEmpleadosStockExcel(true);
    try {
      await ReportGenerator.exportInventarioEmpleadosToXLSX(filteredEmpleadosStock, 'reporte_material_en_empleados.xlsx');
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo generar el reporte en Excel.');
    } finally {
      setIsExportingEmpleadosStockExcel(false);
    }
  };

  const filteredMiInventario = useMemo(() => {
    if (!miInventarioSearch.trim()) return miInventario;
    const norm = normalizeText(miInventarioSearch);
    return miInventario.filter((item: any) => {
      const p = item.producto || {};
      return (
        normalizeText(p.nombre_oficial || '').includes(norm) ||
        normalizeText(p.sku_interno || '').includes(norm) ||
        normalizeText(p.categoria || '').includes(norm)
      );
    });
  }, [miInventario, miInventarioSearch]);

  useEffect(() => {
    setCurrentPageMov(1);
  }, [movimientosSearch, selectedTipoMovimiento, selectedUsuarioMovimiento, selectedDateFilterMov]);

  const totalPagesMov = Math.ceil(filteredMovimientos.length / pageSizeMov) || 1;
  const paginatedMovimientos = useMemo(() => {
    const start = (currentPageMov - 1) * pageSizeMov;
    return filteredMovimientos.slice(start, start + pageSizeMov);
  }, [filteredMovimientos, currentPageMov, pageSizeMov]);

  const activeCategoryName = categorias.find(c => c.id === selectedCategoryFilter)?.nombre;
  const activeFormCategoryName = categorias.find(c => c.id === formCategoriaId)?.nombre;
  const activeFormProveedorName = proveedores.find(p => p.id === formProveedorId)?.nombre;
  const activeProveedorName = proveedores.find(p => p.id === selectedProveedorId)?.nombre;

  return {
    router,
    isMobile,
    scheme,
    themeColors,
    showAlert,
    currentUser,
    activeTab,
    setActiveTab,
    miInventario,
    isLoadingMiInventario,
    miInventarioSearch,
    setMiInventarioSearch,
    gastoModalVisible,
    setGastoModalVisible,
    gastoTargetItem,
    gastoCantidad,
    setGastoCantidad,
    gastoCantidadNuevo,
    setGastoCantidadNuevo,
    gastoCantidadUsado,
    setGastoCantidadUsado,
    gastoCantidadPorRev,
    setGastoCantidadPorRev,
    gastoTipo,
    setGastoTipo,
    gastoClienteId,
    setGastoClienteId,
    gastoClienteNombre,
    setGastoClienteNombre,
    gastoSucursal,
    setGastoSucursal,
    gastoMotivo,
    setGastoMotivo,
    isSubmittingGasto,
    showGastoCliDropdown,
    setShowGastoCliDropdown,
    gastoCliSearch,
    setGastoCliSearch,
    devolverModalVisible,
    setDevolverModalVisible,
    devolverTargetItem,
    devolverCantidad,
    setDevolverCantidad,
    devolverCantidadNuevo,
    setDevolverCantidadNuevo,
    devolverCantidadUsado,
    setDevolverCantidadUsado,
    devolverCantidadPorRev,
    setDevolverCantidadPorRev,
    devolverMotivo,
    setDevolverMotivo,
    isSubmittingDevolucion,
    empleadosStockData,
    isLoadingEmpleadosStock,
    empleadosStockSearch,
    setEmpleadosStockSearch,
    empleadosStockViewMode,
    setEmpleadosStockViewMode,
    selectedEmpleadoStockFilter,
    setSelectedEmpleadoStockFilter,
    expandedEmpleadoIds,
    setExpandedEmpleadoIds,
    isExportingEmpleadosStockExcel,
    currentPageProd,
    setCurrentPageProd,
    pageSizeProd,
    setPageSizeProd,
    currentPageMov,
    setCurrentPageMov,
    pageSizeMov,
    setPageSizeMov,
    movimientos,
    isLoadingMovimientos,
    movimientosSearch,
    setMovimientosSearch,
    selectedUsuarioMovimiento,
    setSelectedUsuarioMovimiento,
    selectedTipoMovimiento,
    setSelectedTipoMovimiento,
    selectedDateFilterMov,
    setSelectedDateFilterMov,
    isExportingMovimientosPDF,
    isExportingMovimientosExcel,
    exportingSingleMovimientoId,
    productos,
    categorias,
    proveedores,
    empleados,
    historialConsumo,
    clientes,
    isLoading,
    searchTerm,
    setSearchTerm,
    selectedCategoryFilter,
    setSelectedCategoryFilter,
    showOutOfStock,
    setShowOutOfStock,
    showInactive,
    setShowInactive,
    selectedProductIds,
    isBulkDeleting,
    bulkEditModalVisible,
    setBulkEditModalVisible,
    isSavingBulkEdit,
    bulkUpdateCategory,
    setBulkUpdateCategory,
    bulkCategoryId,
    bulkUpdateProveedor,
    setBulkUpdateProveedor,
    bulkProveedorId,
    bulkUpdateStock,
    setBulkUpdateStock,
    bulkStockValue,
    setBulkStockValue,
    bulkUpdatePrice,
    setBulkUpdatePrice,
    bulkPriceValue,
    setBulkPriceValue,
    selectorVisible,
    setSelectorVisible,
    selectorTitle,
     setSelectorTitle,
    selectorOptions,
    setSelectorOptions,
    onSelectOption,
    setOnSelectOption,
    selectorSearch,
    setSelectorSearch,
    crudModalVisible,
    setCrudModalVisible,
    editingProduct,
    formSku,
    setFormSku,
    formNombre,
    setFormNombre,
    formCategoriaId,
    formProveedorId,
    formStock,
    setFormStock,
    showEstadoBreakdown,
    setShowEstadoBreakdown,
    formStockNuevo,
    setFormStockNuevo,
    formStockUsado,
    setFormStockUsado,
    formStockPorRevisar,
    setFormStockPorRevisar,
    formUnidad,
    setFormUnidad,
    formPrecio,
    setFormPrecio,
    isSavingProduct,
    newCatNombre,
    setNewCatNombre,
    newCatDesc,
    setNewCatDesc,
    isSavingNewCat,
    newProvNombre,
    setNewProvNombre,
    newProvRfc,
    setNewProvRfc,
    isSavingNewProv,
    newCatModalVisible,
    setNewCatModalVisible,
    newProvModalVisible,
    setNewProvModalVisible,
    quickStockAdjustments,
    setQuickStockAdjustments,
    consumoCliente,
    setConsumoCliente,
    showCliDropdown,
    setShowCliDropdown,
    clienteSearch,
    setClienteSearch,
    consumoItems,
    isSavingConsumo,
    selectedProveedorId,
    folioFactura,
    setFolioFactura,
    isAnalyzing,
    stagingItems,
    setStagingItems,
    folioDuplicado,
    isSavingAIImport,
    selectedEmpleadoRetribucion,
    setSelectedEmpleadoRetribucion,
    retribucionesData,
    verifyModalVisible,
    setVerifyModalVisible,
    verifyingEvidencia,
    isVerifying,
    employeeInventoryModalVisible,
    setEmployeeInventoryModalVisible,
    employeeInventoryData,
    isLoadingEmployeeInventory,
    devolucionesData,
    isLoadingDevoluciones,
    isApprovingDevolucion,
    isLoadingRetribuciones,
    asignarModalVisible,
    setAsignarModalVisible,
    asignarEmpleadoId,
    setAsignarEmpleadoId,
    asignarMotivo,
    setAsignarMotivo,
    asignarItems,
    setAsignarItems,
    asignarProductSearch,
    setAsignarProductSearch,
    isSubmittingAsignacion,
    showAsignarEmpDropdown,
    setShowAsignarEmpDropdown,
    asignarEmpSearch,
    setAsignarEmpSearch,
    handleOpenVerifyModal,
    handleConfirmVerification,
    loadDevolucionesPendientes,
    handleAprobarDevolucion,
    loadRetribuciones,
    fetchEmployeeInventory,
    loadAllData,
    loadEmpleadosStock,
    loadMiInventario,
    handleOpenGastoModal,
    handleConfirmGastoPersonal,
    handleOpenDevolverModal,
    handleConfirmDevolucionPersonal,
    handleExportEmpleadosStockExcel,
    loadMovimientos,
    handleExportMovimientosPDF,
    handleEliminarMovimiento,
    handleExportSingleMovimientoVale,
    handleExportMovimientosCSV,
    openCategoryFilter,
    openProveedorSelector,
    openProductSelectorForStaging,
    openFormCatSelector,
    openFormProveedorSelector,
    filteredSelectorOptions,
    toggleSelectProduct,
    toggleSelectAll,
    clearSelection,
    handleBulkDelete,
    handleOpenBulkEdit,
    openBulkCategorySelector,
    openBulkProveedorSelector,
    handleSaveBulkEdit,
    handleOpenCreateModal,
    handleOpenEditModal,
    handleSaveProduct,
    handleSoftDeleteProduct,
    handleHardDeleteProduct,
    handleReactivateProduct,
    handleQuickAddStock,
    handleCreateCategory,
    handleCreateProveedor,
    handleAddNewCliente,
    openProductSelectorForConsumo,
    handleRemoveConsumoItem,
    handleUpdateConsumoItemQty,
    handleSaveConsumo,
    handleOpenAsignarModal,
    handleAddProductToAsignar,
    handleRemoveProductFromAsignar,
    handleUpdateAsignarItemQty,
    handleConfirmAsignacion,
    handlePickDocument,
    handleUpdateStagingItem,
    handleSaveAIImport,
    filteredProducts,
    totalPagesProd,
    paginatedProducts,
    filteredMovimientos,
    totalMovimientosCount,
    totalEntradasCount,
    totalSalidasCount,
    totalGastosCount,
    filteredEmpleadosStock,
    filteredPorEmpleado,
    filteredPorProducto,
    filteredMiInventario,
    totalPagesMov,
    paginatedMovimientos,
    activeCategoryName,
    activeFormCategoryName,
    activeFormProveedorName,
    activeProveedorName,
  };
}
export type AdminInventarioHook = ReturnType<typeof useAdminInventario>;
