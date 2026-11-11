import { useState, useEffect, useMemo } from 'react';
import { Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthService, CatalogoItem, SucursalCliente } from '@/services/supabase';
import {
  InventarioItem,
  MaterialItem,
  EmpleadoInventarioTabType,
  TipoGastoMaterial,
} from '../types';
import { InventarioApi } from '../api/inventarioApi';

export function useDevoluciones(defaultTab: EmpleadoInventarioTabType = 'stock') {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<EmpleadoInventarioTabType>(defaultTab);

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [inventario, setInventario] = useState<InventarioItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Búsqueda en catálogo personal de materiales
  const [searchQuery, setSearchQuery] = useState('');

  // Catálogos para gasto
  const [clientes, setClientes] = useState<CatalogoItem[]>([]);
  const [sucursalesCliente, setSucursalesCliente] = useState<SucursalCliente[]>([]);

  // Listas de materiales (una para devolución, una para gasto)
  const [materialesDevolver, setMaterialesDevolver] = useState<MaterialItem[]>([]);
  const [materialesGasto, setMaterialesGasto] = useState<MaterialItem[]>([]);

  // Estado para controlar menús de cascada colapsables
  const [expandedDevolucion, setExpandedDevolucion] = useState<Record<string, boolean>>({});
  const [expandedGasto, setExpandedGasto] = useState<Record<string, boolean>>({});

  // Campos Devolución
  const [observacionesDevolucion, setObservacionesDevolucion] = useState('');
  const [isSubmittingDevolucion, setIsSubmittingDevolucion] = useState(false);

  // Campos Gasto de Material
  const [tipoGasto, setTipoGasto] = useState<TipoGastoMaterial>('Servicio');
  const [detalleTrabajo, setDetalleTrabajo] = useState('');
  const [selectedCliente, setSelectedCliente] = useState('');
  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(null);
  const [clienteSearch, setClienteSearch] = useState('');
  const [showCliDropdown, setShowCliDropdown] = useState(false);

  const [sucursal, setSucursal] = useState('');
  const [selectedSucursalId, setSelectedSucursalId] = useState<string | null>(null);
  const [sucursalSearch, setSucursalSearch] = useState('');
  const [showSucursalDropdown, setShowSucursalDropdown] = useState(false);
  const [isSubmittingGasto, setIsSubmittingGasto] = useState(false);
  const [isSubmittingGastoYDevolucion, setIsSubmittingGastoYDevolucion] = useState(false);

  // Mensaje de éxito o feedback en pantalla
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setFeedbackMessage({ type, text });
    setTimeout(() => {
      setFeedbackMessage(null);
    }, 5000);
  };

  const loadCatalogs = async () => {
    try {
      const catData = await InventarioApi.fetchFormCatalogs();
      if (catData.clientes) setClientes(catData.clientes);
      if (catData.sucursales) setSucursalesCliente(catData.sucursales);
    } catch (err) {
      console.warn('Error loading form catalogs:', err);
    }
  };

  const loadInventario = async (userId: string) => {
    try {
      setIsLoading(true);
      const data = await InventarioApi.fetchDevolucionesInventario(userId);
      setInventario((data as any) || []);

      if (data) {
        const createInitialList = (): MaterialItem[] => {
          return data.map((item: any) => {
            const prodObj = Array.isArray(item.producto) ? item.producto[0] : item.producto;
            const sNuevo = Number(prodObj?.stock_nuevo) || 0;
            const sUsado = Number(prodObj?.stock_usado) || 0;
            const sPorRev = Number(prodObj?.stock_por_revisar) || 0;

            const maximo = Number(item.cantidad_disponible) || 0;
            const cNuevo = Number(item.cantidad_nuevo) || 0;
            const cUsado = Number(item.cantidad_usado) || 0;
            const cPorRev = Number(item.cantidad_por_revisar) || 0;

            const sumCond = Math.round((cNuevo + cUsado + cPorRev) * 100) / 100;
            const posNuevo = maximo > sumCond
              ? Math.round((cNuevo + (maximo - sumCond)) * 100) / 100
              : cNuevo;
            const posUsado = cUsado;
            const posPorRev = cPorRev;

            const hasUsedOrDamaged = posUsado > 0 || posPorRev > 0 || sUsado > 0 || sPorRev > 0;

            return {
              productoId: item.producto_id,
              nombre: prodObj?.nombre_oficial || 'Desconocido',
              sku: prodObj?.sku_interno || '',
              unidad: prodObj?.unidad || 'pza',
              maximo,
              pos_nuevo: posNuevo,
              pos_usado: posUsado,
              pos_por_revisar: posPorRev,
              stock_nuevo: sNuevo,
              stock_usado: sUsado,
              stock_por_revisar: sPorRev,
              hasUsedOrDamaged,
              cantidad_nuevo: '',
              cantidad_usado: '',
              cantidad_por_revisar: '',
              cantidad: 0,
            };
          });
        };

        setMaterialesDevolver(createInitialList());
        setMaterialesGasto(createInitialList());
      }
    } catch (err: any) {
      console.error(err);
      if (Platform.OS === 'web') {
        showNotification('error', 'No se pudo cargar el inventario personal.');
      } else {
        Alert.alert('Error', 'No se pudo cargar el inventario personal.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const user = await AuthService.getCurrentUser();
      if (!user) {
        router.replace('/');
        return;
      }
      setCurrentUser(user);
      await Promise.all([loadInventario(user.id), loadCatalogs()]);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helper genérico para actualizar cantidad directa
  const handleDirectQty = (
    listType: 'devolucion' | 'gasto',
    idx: number,
    textOrNum: number | string
  ) => {
    const setter = listType === 'devolucion' ? setMaterialesDevolver : setMaterialesGasto;
    setter((prev) => {
      const copy = [...prev];
      const item = { ...copy[idx] };

      let val: number = 0;
      if (typeof textOrNum === 'number') {
        val = textOrNum;
      } else {
        if (textOrNum.trim() === '') val = 0;
        else {
          const parsed = parseFloat(textOrNum.replace(/[^0-9.]/g, ''));
          val = isNaN(parsed) ? 0 : parsed;
        }
      }

      val = Math.max(0, val);
      if (val > item.maximo) {
        val = item.maximo;
      }

      let remaining = val;
      const assignNuevo = Math.min(item.pos_nuevo, remaining);
      remaining -= assignNuevo;

      const assignUsado = Math.min(item.pos_usado, remaining);
      remaining -= assignUsado;

      const assignPorRev = Math.min(item.pos_por_revisar, remaining);
      remaining -= assignPorRev;

      item.cantidad_nuevo = assignNuevo > 0 ? assignNuevo : '';
      item.cantidad_usado = assignUsado > 0 ? assignUsado : '';
      item.cantidad_por_revisar = assignPorRev > 0 ? assignPorRev : '';
      item.cantidad = val;

      copy[idx] = item;
      return copy;
    });
  };

  // Helper genérico para actualizar condición específica
  const handleConditionChange = (
    listType: 'devolucion' | 'gasto',
    idx: number,
    field: 'cantidad_nuevo' | 'cantidad_usado' | 'cantidad_por_revisar',
    val: number | ''
  ) => {
    const setter = listType === 'devolucion' ? setMaterialesDevolver : setMaterialesGasto;
    setter((prev) => {
      const copy = [...prev];
      const item = { ...copy[idx] };

      const maxForField =
        field === 'cantidad_nuevo'
          ? item.pos_nuevo
          : field === 'cantidad_usado'
          ? item.pos_usado
          : item.pos_por_revisar;

      let numVal: number | '' = val;
      if (typeof val === 'number') {
        if (val < 0) numVal = 0;
        else if (val > maxForField) {
          numVal = maxForField;
        }
      }

      item[field] = numVal;

      const nNuevo = typeof item.cantidad_nuevo === 'number' ? item.cantidad_nuevo : 0;
      const nUsado = typeof item.cantidad_usado === 'number' ? item.cantidad_usado : 0;
      const nPorRev =
        typeof item.cantidad_por_revisar === 'number' ? item.cantidad_por_revisar : 0;
      const sum = Math.round((nNuevo + nUsado + nPorRev) * 100) / 100;

      if (sum > item.maximo) {
        return prev;
      }

      item.cantidad = sum;
      copy[idx] = item;
      return copy;
    });
  };

  // Preset todo por condición
  const handleSetAllCondition = (
    listType: 'devolucion' | 'gasto',
    idx: number,
    field: 'cantidad_nuevo' | 'cantidad_usado' | 'cantidad_por_revisar' | 'all'
  ) => {
    const setter = listType === 'devolucion' ? setMaterialesDevolver : setMaterialesGasto;
    setter((prev) => {
      const copy = [...prev];
      const item = { ...copy[idx] };

      if (field === 'all') {
        item.cantidad_nuevo = item.pos_nuevo > 0 ? item.pos_nuevo : '';
        item.cantidad_usado = item.pos_usado > 0 ? item.pos_usado : '';
        item.cantidad_por_revisar = item.pos_por_revisar > 0 ? item.pos_por_revisar : '';
        item.cantidad = item.maximo;
      } else {
        const qty =
          field === 'cantidad_nuevo'
            ? item.pos_nuevo
            : field === 'cantidad_usado'
            ? item.pos_usado
            : item.pos_por_revisar;

        item.cantidad_nuevo = field === 'cantidad_nuevo' && qty > 0 ? qty : '';
        item.cantidad_usado = field === 'cantidad_usado' && qty > 0 ? qty : '';
        item.cantidad_por_revisar = field === 'cantidad_por_revisar' && qty > 0 ? qty : '';
        item.cantidad = qty;
      }

      copy[idx] = item;
      return copy;
    });
  };

  // Limpiar item
  const handleClearItem = (listType: 'devolucion' | 'gasto', idx: number) => {
    const setter = listType === 'devolucion' ? setMaterialesDevolver : setMaterialesGasto;
    setter((prev) => {
      const copy = [...prev];
      const item = { ...copy[idx] };
      item.cantidad_nuevo = '';
      item.cantidad_usado = '';
      item.cantidad_por_revisar = '';
      item.cantidad = 0;
      copy[idx] = item;
      return copy;
    });
  };

  // Autollenar devolución con todo el inventario disponible
  const handleAutollenarDevolucionTodo = () => {
    setMaterialesDevolver((prev) => {
      return prev.map((item) => ({
        ...item,
        cantidad_nuevo: item.pos_nuevo > 0 ? item.pos_nuevo : '',
        cantidad_usado: item.pos_usado > 0 ? item.pos_usado : '',
        cantidad_por_revisar: item.pos_por_revisar > 0 ? item.pos_por_revisar : '',
        cantidad: item.maximo,
      }));
    });
  };

  // Pasar el material restante no gastado a la pestaña de Devolución
  const handleTransferirRestanteADevolucion = () => {
    setMaterialesDevolver((prev) => {
      return prev.map((item) => {
        const gastoItem = materialesGasto.find((g) => g.productoId === item.productoId);
        const qtyGastada = gastoItem ? gastoItem.cantidad || 0 : 0;
        const remainingQty = Math.max(0, item.maximo - qtyGastada);

        const gastNuevo =
          gastoItem && typeof gastoItem.cantidad_nuevo === 'number'
            ? gastoItem.cantidad_nuevo
            : 0;
        const gastUsado =
          gastoItem && typeof gastoItem.cantidad_usado === 'number'
            ? gastoItem.cantidad_usado
            : 0;
        const gastPorRev =
          gastoItem && typeof gastoItem.cantidad_por_revisar === 'number'
            ? gastoItem.cantidad_por_revisar
            : 0;

        const leftNuevo = Math.max(0, item.pos_nuevo - gastNuevo);
        const leftUsado = Math.max(0, item.pos_usado - gastUsado);
        const leftPorRev = Math.max(0, item.pos_por_revisar - gastPorRev);

        return {
          ...item,
          cantidad_nuevo: leftNuevo > 0 ? leftNuevo : '',
          cantidad_usado: leftUsado > 0 ? leftUsado : '',
          cantidad_por_revisar: leftPorRev > 0 ? leftPorRev : '',
          cantidad: remainingQty,
        };
      });
    });

    setActiveTab('devolucion');
    showNotification('success', 'Se cargaron los materiales sobrantes en la pestaña de Devolución.');
  };

  // Envío Devolución al Almacén
  const handleEnviarDevolucion = async () => {
    const aDevolver = materialesDevolver
      .filter((m) => m.cantidad > 0)
      .map((m) => {
        const nNuevo = typeof m.cantidad_nuevo === 'number' ? m.cantidad_nuevo : 0;
        const nUsado = typeof m.cantidad_usado === 'number' ? m.cantidad_usado : 0;
        const nPorRev = typeof m.cantidad_por_revisar === 'number' ? m.cantidad_por_revisar : 0;
        const finalNuevo = nNuevo === 0 && nUsado === 0 && nPorRev === 0 ? m.cantidad : nNuevo;

        return {
          productoId: m.productoId,
          nombre: m.nombre,
          sku: m.sku,
          unidad: m.unidad,
          maximo: m.maximo,
          devolver: m.cantidad,
          devolver_nuevo: finalNuevo,
          devolver_usado: nUsado,
          devolver_por_revisar: nPorRev,
        };
      });

    if (aDevolver.length === 0) {
      if (Platform.OS === 'web') {
        showNotification(
          'error',
          'Debes indicar al menos un material con cantidad mayor a 0 para devolver.'
        );
      } else {
        Alert.alert(
          'Validación',
          'Debes indicar al menos un material con cantidad mayor a 0 para devolver.'
        );
      }
      return;
    }

    setIsSubmittingDevolucion(true);
    try {
      const payload = {
        empleado_id: currentUser.id,
        empleado_nombre: currentUser.nombre || currentUser.email || 'Empleado',
        materiales: JSON.stringify(aDevolver),
        observaciones: observacionesDevolucion.trim(),
        estado: 'PENDIENTE',
      };

      await InventarioApi.solicitarDevolucion({
        payload,
        materiales: aDevolver,
      });

      showNotification('success', 'Tu solicitud de devolución ha sido enviada al administrador.');
      setObservacionesDevolucion('');
      await loadInventario(currentUser.id);
      setActiveTab('stock');
    } catch (err: any) {
      console.error(err);
      if (Platform.OS === 'web') {
        showNotification('error', err.message || 'No se pudo enviar la solicitud.');
      } else {
        Alert.alert('Error', err.message || 'No se pudo enviar la solicitud.');
      }
    } finally {
      setIsSubmittingDevolucion(false);
    }
  };

  // Envío Gasto de Material (opcionalmente devolviendo el restante)
  const handleEnviarGasto = async (devolverRestante: boolean = false) => {
    const aGastar = materialesGasto
      .filter((m) => m.cantidad > 0)
      .map((m) => {
        const nNuevo = typeof m.cantidad_nuevo === 'number' ? m.cantidad_nuevo : 0;
        const nUsado = typeof m.cantidad_usado === 'number' ? m.cantidad_usado : 0;
        const nPorRev = typeof m.cantidad_por_revisar === 'number' ? m.cantidad_por_revisar : 0;
        const finalNuevo = nNuevo === 0 && nUsado === 0 && nPorRev === 0 ? m.cantidad : nNuevo;

        return {
          productoId: m.productoId,
          nombre: m.nombre,
          sku: m.sku,
          unidad: m.unidad,
          maximo: m.maximo,
          cantidad: m.cantidad,
          cantidad_nuevo: finalNuevo,
          cantidad_usado: nUsado,
          cantidad_por_revisar: nPorRev,
        };
      });

    if (aGastar.length === 0 && !devolverRestante) {
      const msg =
        'Debes indicar al menos un material con cantidad mayor a 0 que hayas utilizado.';
      if (Platform.OS === 'web') showNotification('error', msg);
      else Alert.alert('Validación', msg);
      return;
    }

    const detalleFinal =
      detalleTrabajo.trim() || `Gasto de material (${selectedCliente || tipoGasto})`;

    if (devolverRestante) {
      setIsSubmittingGastoYDevolucion(true);
    } else {
      setIsSubmittingGasto(true);
    }

    try {
      const payload = {
        empleado_id: currentUser.id,
        empleado_nombre: currentUser.nombre || currentUser.email || 'Empleado',
        tipo_gasto: tipoGasto,
        cliente_id: selectedClienteId,
        cliente_nombre: selectedCliente,
        sucursal_id: selectedSucursalId,
        sucursal_nombre: sucursal,
        detalle_motivo: detalleFinal,
        materiales: aGastar,
        devolver_restante: Boolean(devolverRestante),
        observaciones_devolucion: `Devolución de sobrantes tras trabajo en: ${detalleFinal}`,
      };

      await InventarioApi.reportarGastoMaterial(payload);

      const successMsg = devolverRestante
        ? '¡Gasto registrado y sobrantes devueltos al almacén exitosamente!'
        : '¡Consumo de material descontado y registrado con éxito!';

      showNotification('success', successMsg);

      // Limpiar formulario y recargar inventario de inmediato
      setDetalleTrabajo('');
      setSelectedCliente('');
      setSelectedClienteId(null);
      setSucursal('');
      setSelectedSucursalId(null);
      await loadInventario(currentUser.id);
      setActiveTab('stock');

      if (Platform.OS !== 'web') {
        Alert.alert('Éxito', successMsg);
      }
    } catch (err: any) {
      console.error(err);
      const errMsg = err.message || 'No se pudo reportar el gasto de material.';
      if (Platform.OS === 'web') showNotification('error', errMsg);
      else Alert.alert('Error', errMsg);
    } finally {
      setIsSubmittingGasto(false);
      setIsSubmittingGastoYDevolucion(false);
    }
  };

  // Filtrado de materiales en posesión para la vista 'stock'
  const filteredInventario = useMemo(() => {
    if (!searchQuery.trim()) return inventario;
    const q = searchQuery.toLowerCase().trim();
    return inventario.filter((item) => {
      const prod = Array.isArray(item.producto) ? item.producto[0] : item.producto;
      const nombre = (prod?.nombre_oficial || '').toLowerCase();
      const sku = (prod?.sku_interno || '').toLowerCase();
      return nombre.includes(q) || sku.includes(q);
    });
  }, [inventario, searchQuery]);

  // Totales y estadísticas del inventario del empleado
  const totalArticulosDistintos = inventario.length;
  const totalPiezasEnPosesion = inventario.reduce(
    (acc, curr) => acc + (Number(curr.cantidad_disponible) || 0),
    0
  );
  const totalNuevoEnPosesion = inventario.reduce(
    (acc, curr) => acc + (Number(curr.cantidad_nuevo) || 0),
    0
  );
  const totalUsadoEnPosesion = inventario.reduce(
    (acc, curr) => acc + (Number(curr.cantidad_usado) || 0),
    0
  );
  const totalPorRevisarEnPosesion = inventario.reduce(
    (acc, curr) => acc + (Number(curr.cantidad_por_revisar) || 0),
    0
  );

  // Acciones rápidas desde la tarjeta de un producto en posesión
  const handleSelectForGasto = (productoId: string) => {
    setActiveTab('gasto');
    setExpandedGasto((prev) => ({ ...prev, [productoId]: true }));
  };

  const handleSelectForDevolucion = (productoId: string) => {
    setActiveTab('devolucion');
    setExpandedDevolucion((prev) => ({ ...prev, [productoId]: true }));
  };

  const totalDevolverGeneral = materialesDevolver.reduce(
    (acc, curr) => acc + (curr.cantidad || 0),
    0
  );
  const totalGastoGeneral = materialesGasto.reduce((acc, curr) => acc + (curr.cantidad || 0), 0);
  const totalPosesionGeneral = materialesGasto.reduce((acc, curr) => acc + (curr.maximo || 0), 0);
  const totalRestanteGeneral = Math.max(0, totalPosesionGeneral - totalGastoGeneral);

  const refreshInventario = () => {
    if (currentUser?.id) {
      loadInventario(currentUser.id);
    }
  };

  return {
    activeTab,
    setActiveTab,
    inventario,
    filteredInventario,
    searchQuery,
    setSearchQuery,
    totalArticulosDistintos,
    totalPiezasEnPosesion,
    totalNuevoEnPosesion,
    totalUsadoEnPosesion,
    totalPorRevisarEnPosesion,
    handleSelectForGasto,
    handleSelectForDevolucion,
    refreshInventario,
    isLoading,
    clientes,
    sucursalesCliente,
    materialesDevolver,
    materialesGasto,
    expandedDevolucion,
    setExpandedDevolucion,
    expandedGasto,
    setExpandedGasto,
    observacionesDevolucion,
    setObservacionesDevolucion,
    isSubmittingDevolucion,
    tipoGasto,
    setTipoGasto,
    detalleTrabajo,
    setDetalleTrabajo,
    selectedCliente,
    setSelectedCliente,
    selectedClienteId,
    setSelectedClienteId,
    clienteSearch,
    setClienteSearch,
    showCliDropdown,
    setShowCliDropdown,
    sucursal,
    setSucursal,
    selectedSucursalId,
    setSelectedSucursalId,
    sucursalSearch,
    setSucursalSearch,
    showSucursalDropdown,
    setShowSucursalDropdown,
    isSubmittingGasto,
    isSubmittingGastoYDevolucion,
    feedbackMessage,
    totalDevolverGeneral,
    totalGastoGeneral,
    totalRestanteGeneral,
    handleDirectQty,
    handleConditionChange,
    handleSetAllCondition,
    handleClearItem,
    handleAutollenarDevolucionTodo,
    handleTransferirRestanteADevolucion,
    handleEnviarDevolucion,
    handleEnviarGasto,
  };
}

export const useEmpleadoInventario = useDevoluciones;
