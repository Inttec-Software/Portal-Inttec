import { useState, useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthService, Usuario, CatalogoItem, SucursalCliente } from '@/services/supabase';
import { normalizeText } from '@/utils/helpers';
import { Producto, CartItem, TipoGastoMaterial } from '../types';
import { InventarioApi } from '../api/inventarioApi';
import {
  getProductoUnidad,
  hasMultipleStockStates,
  getTotalStock,
  getStockNuevo,
} from '../utils/inventarioUtils';

export function useRetiroMaterial() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cartModalVisible, setCartModalVisible] = useState(false);
  const [motivoRetiro, setMotivoRetiro] = useState('');
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);
  const [pendingWithdrawPayload, setPendingWithdrawPayload] = useState<any>(null);

  // Lista de campos con error de validación
  const [formErrors, setFormErrors] = useState<string[]>([]);

  // Catálogos
  const [clientes, setClientes] = useState<CatalogoItem[]>([]);
  const [sucursalesCliente, setSucursalesCliente] = useState<SucursalCliente[]>([]);

  // Campos extendidos del formulario
  const [tipoGasto, setTipoGasto] = useState<TipoGastoMaterial>('Servicio');
  const [detalleServicioProyecto, setDetalleServicioProyecto] = useState('');

  const [selectedCliente, setSelectedCliente] = useState('');
  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(null);
  const [clienteSearch, setClienteSearch] = useState('');
  const [showCliDropdown, setShowCliDropdown] = useState(false);

  const [sucursal, setSucursal] = useState('');
  const [selectedSucursalId, setSelectedSucursalId] = useState<string | null>(null);
  const [sucursalSearch, setSucursalSearch] = useState('');
  const [showSucursalDropdown, setShowSucursalDropdown] = useState(false);

  const [stateModalProduct, setStateModalProduct] = useState<Producto | null>(null);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const user = await AuthService.getCurrentUser();
      if (!user) {
        router.replace('/');
        return;
      }
      setCurrentUser(user);

      const normalized = await InventarioApi.fetchRetiroProductos();
      setProductos(normalized);

      // Cargar catálogos
      const catData = await InventarioApi.fetchFormCatalogs();
      if (catData.clientes) setClientes(catData.clientes);
      if (catData.sucursales) setSucursalesCliente(catData.sucursales);

      // Restaurar borrador del carrito si existe
      try {
        const draftKey = `retiro_material_draft_${user.id}`;
        const draftRaw = await AsyncStorage.getItem(draftKey);
        if (draftRaw) {
          const draft = JSON.parse(draftRaw);
          if (draft) {
            if (Array.isArray(draft.cart) && draft.cart.length > 0) {
              const syncedCart: CartItem[] = [];
              for (const item of draft.cart) {
                const freshProd = normalized.find((p: Producto) => p.id === item.producto.id);
                if (freshProd) {
                  const totalMax = getTotalStock(freshProd);
                  if (totalMax > 0) {
                    const qty = Math.min(Number(item.cantidad) || 0, totalMax);
                    const sNuevo = getStockNuevo(freshProd);
                    const sUsado = freshProd.stock_usado || 0;
                    const sPorRev = freshProd.stock_por_revisar || 0;

                    const qNuevo =
                      typeof item.cantidad_nuevo === 'number'
                        ? Math.min(item.cantidad_nuevo, sNuevo)
                        : item.cantidad_usado || item.cantidad_por_revisar
                        ? 0
                        : qty;
                    const qUsado =
                      typeof item.cantidad_usado === 'number'
                        ? Math.min(item.cantidad_usado, sUsado)
                        : 0;
                    const qPorRev =
                      typeof item.cantidad_por_revisar === 'number'
                        ? Math.min(item.cantidad_por_revisar, sPorRev)
                        : 0;

                    if (qty > 0) {
                      syncedCart.push({
                        producto: freshProd,
                        cantidad: qty,
                        cantidad_nuevo: qNuevo,
                        cantidad_usado: qUsado,
                        cantidad_por_revisar: qPorRev,
                      });
                    }
                  }
                }
              }
              if (syncedCart.length > 0) {
                setCart(syncedCart);
              }
            }
            if (draft.motivoRetiro) setMotivoRetiro(draft.motivoRetiro);
            if (draft.tipoGasto) setTipoGasto(draft.tipoGasto);
            if (draft.detalleServicioProyecto) setDetalleServicioProyecto(draft.detalleServicioProyecto);
            if (draft.selectedCliente) setSelectedCliente(draft.selectedCliente);
            if (draft.selectedClienteId) setSelectedClienteId(draft.selectedClienteId);
            if (draft.sucursal) setSucursal(draft.sucursal);
            if (draft.selectedSucursalId) setSelectedSucursalId(draft.selectedSucursalId);
          }
        }
      } catch (draftErr) {
        console.warn('Error al restaurar borrador de carrito:', draftErr);
      } finally {
        setIsDraftLoaded(true);
      }
    } catch (err) {
      console.error('Error loading products & catalogs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Guardar borrador automáticamente cuando cambien los materiales o datos del formulario
  useEffect(() => {
    if (!isDraftLoaded || !currentUser?.id) return;

    const saveDraft = async () => {
      try {
        const draftKey = `retiro_material_draft_${currentUser.id}`;
        const draft = {
          cart,
          motivoRetiro,
          tipoGasto,
          detalleServicioProyecto,
          selectedCliente,
          selectedClienteId,
          sucursal,
          selectedSucursalId,
        };
        await AsyncStorage.setItem(draftKey, JSON.stringify(draft));
      } catch (e) {
        console.warn('Error al guardar borrador del carrito:', e);
      }
    };

    saveDraft();
  }, [
    cart,
    motivoRetiro,
    tipoGasto,
    detalleServicioProyecto,
    selectedCliente,
    selectedClienteId,
    sucursal,
    selectedSucursalId,
    isDraftLoaded,
    currentUser,
  ]);

  const filteredProductos = productos.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = normalizeText(searchQuery);
    const matchNombre = normalizeText(p.nombre_oficial).includes(q);
    const matchSku = normalizeText(p.sku_interno).includes(q);
    return matchNombre || matchSku;
  });

  const addToCart = (producto: Producto) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.producto.id === producto.id);
      const totalStock = getTotalStock(producto);

      if (existing) {
        const curQty = typeof existing.cantidad === 'number' ? existing.cantidad : 0;
        if (curQty < totalStock) {
          const nextQty = curQty + 1;
          const sNuevo = getStockNuevo(producto);
          const nextNuevo = Math.min(nextQty, sNuevo);
          const nextUsado = Math.min(
            Math.max(0, nextQty - nextNuevo),
            producto.stock_usado || 0
          );
          const nextPorRev = Math.min(
            Math.max(0, nextQty - nextNuevo - nextUsado),
            producto.stock_por_revisar || 0
          );

          return prev.map((item) =>
            item.producto.id === producto.id
              ? {
                  ...item,
                  cantidad: nextQty,
                  cantidad_nuevo: nextNuevo,
                  cantidad_usado: nextUsado,
                  cantidad_por_revisar: nextPorRev,
                }
              : item
          );
        }
        return prev;
      }

      if (totalStock > 0) {
        const sNuevo = getStockNuevo(producto);
        const qNuevo = Math.min(1, sNuevo);
        const qUsado = qNuevo < 1 ? Math.min(1, producto.stock_usado || 0) : 0;
        const qPorRev = qNuevo + qUsado < 1 ? Math.min(1, producto.stock_por_revisar || 0) : 0;

        return [
          ...prev,
          {
            producto,
            cantidad: 1,
            cantidad_nuevo: qNuevo,
            cantidad_usado: qUsado,
            cantidad_por_revisar: qPorRev,
          },
        ];
      }
      return prev;
    });
  };

  const updateCartQty = (productoId: string, textOrNum: number | string) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.producto.id === productoId);
      if (!existing) return prev;

      const totalStock = getTotalStock(existing.producto);

      if (textOrNum === '') {
        return prev.map((item) =>
          item.producto.id === productoId
            ? {
                ...item,
                cantidad: '',
                cantidad_nuevo: '',
                cantidad_usado: '',
                cantidad_por_revisar: '',
              }
            : item
        );
      }

      let parsed = typeof textOrNum === 'number' ? textOrNum : parseFloat(textOrNum) || 0;
      if (parsed < 0) parsed = 0;
      if (parsed > totalStock) parsed = totalStock;

      if (parsed === 0) {
        return prev.filter((item) => item.producto.id !== productoId);
      }

      let remaining = parsed;
      const sNuevo = getStockNuevo(existing.producto);
      const sUsado = existing.producto.stock_usado || 0;
      const sPorRev = existing.producto.stock_por_revisar || 0;

      const assignNuevo = Math.min(sNuevo, remaining);
      remaining -= assignNuevo;

      const assignUsado = Math.min(sUsado, remaining);
      remaining -= assignUsado;

      const assignPorRev = Math.min(sPorRev, remaining);
      remaining -= assignPorRev;

      return prev.map((item) =>
        item.producto.id === productoId
          ? {
              ...item,
              cantidad: parsed,
              cantidad_nuevo: assignNuevo,
              cantidad_usado: assignUsado,
              cantidad_por_revisar: assignPorRev,
            }
          : item
      );
    });
  };

  const updateCartStateQty = (
    producto: Producto,
    state: 'nuevo' | 'usado' | 'por_revisar',
    val: number | ''
  ) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.producto.id === producto.id);
      const totalStock = getTotalStock(producto);

      const sNuevo = getStockNuevo(producto);
      const sUsado = producto.stock_usado || 0;
      const sPorRev = producto.stock_por_revisar || 0;

      let curNuevo =
        existing && typeof existing.cantidad_nuevo === 'number' ? existing.cantidad_nuevo : 0;
      let curUsado =
        existing && typeof existing.cantidad_usado === 'number' ? existing.cantidad_usado : 0;
      let curPorRev =
        existing && typeof existing.cantidad_por_revisar === 'number'
          ? existing.cantidad_por_revisar
          : 0;

      let maxForState = state === 'nuevo' ? sNuevo : state === 'usado' ? sUsado : sPorRev;
      let targetVal: number | '' = val;

      if (typeof val === 'number') {
        if (val < 0) targetVal = 0;
        else if (val > maxForState) targetVal = maxForState;
      }

      if (state === 'nuevo') curNuevo = typeof targetVal === 'number' ? targetVal : 0;
      if (state === 'usado') curUsado = typeof targetVal === 'number' ? targetVal : 0;
      if (state === 'por_revisar') curPorRev = typeof targetVal === 'number' ? targetVal : 0;

      const sum = Math.round((curNuevo + curUsado + curPorRev) * 100) / 100;
      if (sum > totalStock) return prev;

      if (sum === 0 && targetVal === 0) {
        return prev.filter((item) => item.producto.id !== producto.id);
      }

      if (!existing) {
        return [
          ...prev,
          {
            producto,
            cantidad: sum,
            cantidad_nuevo: state === 'nuevo' ? targetVal : 0,
            cantidad_usado: state === 'usado' ? targetVal : 0,
            cantidad_por_revisar: state === 'por_revisar' ? targetVal : 0,
          },
        ];
      }

      return prev.map((item) =>
        item.producto.id === producto.id
          ? {
              ...item,
              cantidad: sum,
              cantidad_nuevo: state === 'nuevo' ? targetVal : existing.cantidad_nuevo,
              cantidad_usado: state === 'usado' ? targetVal : existing.cantidad_usado,
              cantidad_por_revisar:
                state === 'por_revisar' ? targetVal : existing.cantidad_por_revisar,
            }
          : item
      );
    });
  };

  const removeFromCart = (productoId: string) => {
    setCart((prev) => prev.filter((item) => item.producto.id !== productoId));
  };

  const handleConfirmarRetiro = async () => {
    const validCart = cart
      .filter((item) => typeof item.cantidad === 'number' && item.cantidad > 0)
      .map((item) => {
        const qty = Number(item.cantidad) || 0;
        const qNuevo =
          typeof item.cantidad_nuevo === 'number'
            ? item.cantidad_nuevo
            : item.cantidad_usado || item.cantidad_por_revisar
            ? 0
            : qty;
        const qUsado = typeof item.cantidad_usado === 'number' ? item.cantidad_usado : 0;
        const qPorRevisar =
          typeof item.cantidad_por_revisar === 'number' ? item.cantidad_por_revisar : 0;
        return {
          producto: item.producto,
          cantidad: qty,
          cantidad_nuevo: qNuevo,
          cantidad_usado: qUsado,
          cantidad_por_revisar: qPorRevisar,
        };
      });

    // Validar y acumular todos los campos obligatorios faltantes
    const missingFields: string[] = [];

    if (validCart.length === 0) {
      missingFields.push('Materiales a retirar (agrega al menos un material con cantidad mayor a 0)');
    }

    if (!detalleServicioProyecto.trim()) {
      missingFields.push('Detalle de Servicio o Proyecto');
    }

    if (!selectedCliente || !selectedCliente.trim()) {
      missingFields.push('Cliente Relacionado');
    }

    // Si hay un cliente seleccionado y tiene sucursales disponibles en el catálogo, la sucursal es obligatoria
    const clientBranches = selectedClienteId
      ? sucursalesCliente.filter((s) => s.cliente_id === selectedClienteId)
      : [];
    if (clientBranches.length > 0 && (!sucursal || !sucursal.trim())) {
      missingFields.push('Sucursal del cliente');
    }

    if (!motivoRetiro.trim()) {
      missingFields.push('Motivo o Referencia del Retiro');
    }

    if (missingFields.length > 0) {
      setFormErrors(missingFields);
      const bulletList = missingFields.map((f) => `• ${f}`).join('\n');
      const alertTitle = 'Campos Obligatorios Incompletos';
      const alertMessage = `Te falta completar los siguientes campos obligatorios:\n\n${bulletList}`;
      if (Platform.OS === 'web') {
        window.alert(`${alertTitle}\n\n${alertMessage}`);
      } else {
        Alert.alert(alertTitle, alertMessage);
      }
      return;
    }

    setFormErrors([]);

    if (!currentUser) return;

    setPendingWithdrawPayload({
      cart: validCart,
      motivoRetiro: motivoRetiro.trim(),
      currentUser,
      tipoGasto,
      detalleServicioProyecto: detalleServicioProyecto.trim(),
      clienteId: selectedClienteId,
      clienteNombre: selectedCliente,
      sucursalId: selectedSucursalId,
      sucursalNombre: sucursal,
    });

    // Cerrar el modal del carrito para permitir que se despliegue el modal de firma
    setCartModalVisible(false);
    setTimeout(() => {
      setSignatureModalVisible(true);
    }, 150);
  };

  const handleProcessSignedRetiro = async (signatureBase64: string) => {
    if (!pendingWithdrawPayload || !currentUser) return;

    setIsSubmitting(true);
    try {
      const deviceInfo = `${Platform.OS} ${
        Platform.Version ? `v${Platform.Version}` : ''
      } ${typeof navigator !== 'undefined' ? navigator.userAgent : ''}`.trim();

      await InventarioApi.confirmarRetiroMaterial({
        ...pendingWithdrawPayload,
        firmaBase64: signatureBase64,
        dispositivoInfo: deviceInfo,
        responsivaAceptada: true,
      });

      setSignatureModalVisible(false);
      setPendingWithdrawPayload(null);
      setCart([]);
      setMotivoRetiro('');
      setDetalleServicioProyecto('');
      setSelectedCliente('');
      setSelectedClienteId(null);
      setSucursal('');
      setSelectedSucursalId(null);
      setFormErrors([]);
      if (currentUser?.id) {
        await AsyncStorage.removeItem(`retiro_material_draft_${currentUser.id}`).catch(() => {});
      }
      setCartModalVisible(false);
      await loadData();
      Alert.alert(
        'Retiro y Responsiva Firmada',
        'El material ha sido retirado con éxito y la carta responsiva quedó formalmente firmada.'
      );
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'No se pudo registrar el retiro.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearCart = () => {
    Alert.alert(
      'Vaciar Carrito',
      '¿Estás seguro de que deseas eliminar todos los productos seleccionados y reiniciar el formulario?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Vaciar',
          style: 'destructive',
          onPress: async () => {
            setCart([]);
            setMotivoRetiro('');
            setDetalleServicioProyecto('');
            setSelectedCliente('');
            setSelectedClienteId(null);
            setSucursal('');
            setSelectedSucursalId(null);
            setFormErrors([]);
            if (currentUser?.id) {
              await AsyncStorage.removeItem(`retiro_material_draft_${currentUser.id}`).catch(
                () => {}
              );
            }
          },
        },
      ]
    );
  };

  const totalItems = cart.reduce(
    (sum, item) => sum + (typeof item.cantidad === 'number' ? item.cantidad : 0),
    0
  );

  return {
    currentUser,
    productos,
    filteredProductos,
    isLoading,
    searchQuery,
    setSearchQuery,
    cart,
    totalItems,
    isSubmitting,
    cartModalVisible,
    setCartModalVisible,
    motivoRetiro,
    setMotivoRetiro,
    signatureModalVisible,
    setSignatureModalVisible,
    clientes,
    sucursalesCliente,
    tipoGasto,
    setTipoGasto,
    detalleServicioProyecto,
    setDetalleServicioProyecto,
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
    stateModalProduct,
    setStateModalProduct,
    formErrors,
    setFormErrors,
    addToCart,
    updateCartQty,
    updateCartStateQty,
    removeFromCart,
    handleConfirmarRetiro,
    handleProcessSignedRetiro,
    handleClearCart,
  };
}
