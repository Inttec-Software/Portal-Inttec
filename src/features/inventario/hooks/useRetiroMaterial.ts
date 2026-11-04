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
        const hasData =
          cart.length > 0 ||
          motivoRetiro.trim() !== '' ||
          detalleServicioProyecto.trim() !== '' ||
          selectedCliente.trim() !== '';

        if (hasData) {
          const draft = {
            cart,
            motivoRetiro,
            tipoGasto,
            detalleServicioProyecto,
            selectedCliente,
            selectedClienteId,
            sucursal,
            selectedSucursalId,
            updatedAt: Date.now(),
          };
          await AsyncStorage.setItem(draftKey, JSON.stringify(draft));
        } else {
          await AsyncStorage.removeItem(draftKey);
        }
      } catch (err) {
        console.warn('Error al guardar borrador de carrito:', err);
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
    currentUser?.id,
  ]);

  const normQuery = normalizeText(searchQuery);
  const filteredProductos = productos.filter(
    (p) =>
      !normQuery ||
      normalizeText(p.nombre_oficial).includes(normQuery) ||
      normalizeText(p.sku_interno).includes(normQuery)
  );

  const addToCart = (producto: Producto, qty: number = 1) => {
    const unit = getProductoUnidad(producto);
    const totalMax = getTotalStock(producto);
    setCart((prev) => {
      const existing = prev.find((item) => item.producto.id === producto.id);
      if (existing) {
        const currentQty = typeof existing.cantidad === 'number' ? existing.cantidad : 0;
        const newQty = Math.round((currentQty + qty) * 100) / 100;
        if (newQty > totalMax) {
          Alert.alert('Stock Insuficiente', `Solo hay ${totalMax} ${unit} disponibles.`);
          return prev;
        }
        return prev.map((item) =>
          item.producto.id === producto.id
            ? {
                ...item,
                cantidad: newQty,
                cantidad_nuevo: hasMultipleStockStates(producto)
                  ? typeof item.cantidad_nuevo === 'number'
                    ? item.cantidad_nuevo + qty
                    : qty
                  : newQty,
              }
            : item
        );
      }
      return [
        ...prev,
        {
          producto,
          cantidad: qty,
          cantidad_nuevo: qty,
          cantidad_usado: 0,
          cantidad_por_revisar: 0,
        },
      ];
    });
  };

  const updateCartQty = (productoId: string, text: string) => {
    setCart((prev) => {
      const item = prev.find((i) => i.producto.id === productoId);
      if (!item) return prev;

      const unit = getProductoUnidad(item.producto);
      const totalMax = getTotalStock(item.producto);

      if (text.trim() === '') {
        return prev.map((i) =>
          i.producto.id === productoId ? { ...i, cantidad: '', cantidad_nuevo: '' } : i
        );
      }

      const qty = parseFloat(text.replace(/[^0-9.]/g, ''));
      if (isNaN(qty)) {
        return prev.map((i) =>
          i.producto.id === productoId ? { ...i, cantidad: '', cantidad_nuevo: '' } : i
        );
      }

      if (qty > totalMax) {
        Alert.alert('Stock Insuficiente', `Solo hay ${totalMax} ${unit} disponibles.`);
        return prev.map((i) =>
          i.producto.id === productoId ? { ...i, cantidad: totalMax, cantidad_nuevo: totalMax } : i
        );
      }

      return prev.map((i) =>
        i.producto.id === productoId ? { ...i, cantidad: qty, cantidad_nuevo: qty } : i
      );
    });
  };

  const updateCartStateQty = (
    producto: Producto,
    state: 'nuevo' | 'usado' | 'por_revisar',
    val: number | ''
  ) => {
    const unit = getProductoUnidad(producto);
    const maxStock =
      state === 'nuevo'
        ? getStockNuevo(producto)
        : state === 'usado'
        ? producto.stock_usado || 0
        : producto.stock_por_revisar || 0;

    let numVal: number | '' = val;
    if (typeof val === 'number') {
      if (val > maxStock) {
        Alert.alert('Stock Insuficiente', `Solo hay ${maxStock} ${unit} de este estado.`);
        numVal = maxStock;
      } else if (val < 0) {
        numVal = 0;
      }
    }

    setCart((prev) => {
      const existing = prev.find((i) => i.producto.id === producto.id);
      let currentNuevo = existing?.cantidad_nuevo ?? 0;
      let currentUsado = existing?.cantidad_usado ?? 0;
      let currentPorRevisar = existing?.cantidad_por_revisar ?? 0;

      if (state === 'nuevo') currentNuevo = numVal;
      if (state === 'usado') currentUsado = numVal;
      if (state === 'por_revisar') currentPorRevisar = numVal;

      const nNuevo = typeof currentNuevo === 'number' ? currentNuevo : 0;
      const nUsado = typeof currentUsado === 'number' ? currentUsado : 0;
      const nPorRev = typeof currentPorRevisar === 'number' ? currentPorRevisar : 0;
      const total = Math.round((nNuevo + nUsado + nPorRev) * 100) / 100;

      if (total <= 0 && currentNuevo !== '' && currentUsado !== '' && currentPorRevisar !== '') {
        return prev.filter((i) => i.producto.id !== producto.id);
      }

      const updatedItem: CartItem = {
        producto,
        cantidad: total,
        cantidad_nuevo: currentNuevo,
        cantidad_usado: currentUsado,
        cantidad_por_revisar: currentPorRevisar,
      };

      if (existing) {
        return prev.map((i) => (i.producto.id === producto.id ? updatedItem : i));
      } else {
        return [...prev, updatedItem];
      }
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

    if (validCart.length === 0) {
      Alert.alert(
        'Carrito Vacío',
        'Agrega al menos un material con cantidad mayor a 0 para retirar.'
      );
      return;
    }

    if (!detalleServicioProyecto.trim()) {
      Alert.alert('Validación', 'Por favor ingresa el Detalle de Servicio o Proyecto.');
      return;
    }

    if (!selectedCliente) {
      Alert.alert('Validación', 'Por favor selecciona el Cliente Relacionado.');
      return;
    }

    if (!motivoRetiro.trim()) {
      Alert.alert('Validación', 'Por favor ingresa un motivo o referencia para el retiro.');
      return;
    }

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
    addToCart,
    updateCartQty,
    updateCartStateQty,
    removeFromCart,
    handleConfirmarRetiro,
    handleProcessSignedRetiro,
    handleClearCart,
  };
}
