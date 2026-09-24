import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  Keyboard,
  Pressable,
  Platform,
  useWindowDimensions,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AuthService } from '@/services/supabase';
import { getApiHeaders, getApiUrl } from '@/services/apiHelper';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import CustomButton from '@/components/CustomButton';

type InventarioItem = {
  id: string;
  producto_id: string;
  cantidad_disponible: number;
  producto: {
    id?: string;
    nombre_oficial: string;
    sku_interno: string;
    unidad?: string;
    stock_actual?: number;
    stock_nuevo?: number;
    stock_usado?: number;
    stock_por_revisar?: number;
  };
};

type MaterialItem = {
  productoId: string;
  nombre: string;
  sku: string;
  unidad: string;
  maximo: number;
  pos_nuevo: number;
  pos_usado: number;
  pos_por_revisar: number;
  stock_nuevo: number;
  stock_usado: number;
  stock_por_revisar: number;
  hasUsedOrDamaged: boolean;
  cantidad_nuevo: number | '';
  cantidad_usado: number | '';
  cantidad_por_revisar: number | '';
  cantidad: number;
};

type CatalogoItem = {
  id: string;
  nombre: string;
};

type SucursalCliente = {
  id: string;
  nombre: string;
  cliente_id: string;
};

export default function DevolucionesEmpleadoScreen() {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [activeTab, setActiveTab] = useState<'devolucion' | 'gasto'>('devolucion');

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [inventario, setInventario] = useState<InventarioItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
  const [tipoGasto, setTipoGasto] = useState<'Servicio' | 'Proyecto' | 'Venta' | 'Operativo'>('Servicio');
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
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const init = async () => {
      const user = await AuthService.getCurrentUser();
      if (!user) {
        router.replace('/');
        return;
      }
      setCurrentUser(user);
      await Promise.all([
        loadInventario(user.id),
        loadCatalogs()
      ]);
    };
    init();
  }, []);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setFeedbackMessage({ type, text });
    setTimeout(() => {
      setFeedbackMessage(null);
    }, 5000);
  };

  const loadCatalogs = async () => {
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/reportes/form-catalogs`, { headers });
      if (res.ok) {
        const catData = await res.json();
        if (catData.clientes) setClientes(catData.clientes);
        if (catData.sucursales) setSucursalesCliente(catData.sucursales);
      }
    } catch (err) {
      console.warn('Error loading form catalogs:', err);
    }
  };

  const loadInventario = async (userId: string) => {
    try {
      setIsLoading(true);
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/devoluciones/inventario?userId=${userId}`, { headers });
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[loadInventario Error]', res.status, errorText);
        throw new Error(errorText || 'Error al cargar inventario');
      }
      const json = await res.json();
      const data = json.inventario;

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

            const posNuevo = (cNuevo === 0 && cUsado === 0 && cPorRev === 0) ? maximo : cNuevo;
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
              cantidad: 0
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

  // Helper genérico para actualizar cantidad directa
  const handleDirectQty = (
    listType: 'devolucion' | 'gasto',
    idx: number,
    textOrNum: number | string
  ) => {
    const setter = listType === 'devolucion' ? setMaterialesDevolver : setMaterialesGasto;
    setter(prev => {
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
    setter(prev => {
      const copy = [...prev];
      const item = { ...copy[idx] };

      const maxForField = field === 'cantidad_nuevo'
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
      const nPorRev = typeof item.cantidad_por_revisar === 'number' ? item.cantidad_por_revisar : 0;
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
    setter(prev => {
      const copy = [...prev];
      const item = { ...copy[idx] };

      if (field === 'all') {
        item.cantidad_nuevo = item.pos_nuevo > 0 ? item.pos_nuevo : '';
        item.cantidad_usado = item.pos_usado > 0 ? item.pos_usado : '';
        item.cantidad_por_revisar = item.pos_por_revisar > 0 ? item.pos_por_revisar : '';
        item.cantidad = item.maximo;
      } else {
        const qty = field === 'cantidad_nuevo'
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
    setter(prev => {
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
    setMaterialesDevolver(prev => {
      return prev.map(item => ({
        ...item,
        cantidad_nuevo: item.pos_nuevo > 0 ? item.pos_nuevo : '',
        cantidad_usado: item.pos_usado > 0 ? item.pos_usado : '',
        cantidad_por_revisar: item.pos_por_revisar > 0 ? item.pos_por_revisar : '',
        cantidad: item.maximo
      }));
    });
  };

  // Pasar el material restante no gastado a la pestaña de Devolución
  const handleTransferirRestanteADevolucion = () => {
    setMaterialesDevolver(prev => {
      return prev.map(item => {
        const gastoItem = materialesGasto.find(g => g.productoId === item.productoId);
        const qtyGastada = gastoItem ? (gastoItem.cantidad || 0) : 0;
        const remainingQty = Math.max(0, item.maximo - qtyGastada);

        // Distribuir de acuerdo a lo que quedó
        let rem = remainingQty;
        const gastNuevo = gastoItem && typeof gastoItem.cantidad_nuevo === 'number' ? gastoItem.cantidad_nuevo : 0;
        const gastUsado = gastoItem && typeof gastoItem.cantidad_usado === 'number' ? gastoItem.cantidad_usado : 0;
        const gastPorRev = gastoItem && typeof gastoItem.cantidad_por_revisar === 'number' ? gastoItem.cantidad_por_revisar : 0;

        const leftNuevo = Math.max(0, item.pos_nuevo - gastNuevo);
        const leftUsado = Math.max(0, item.pos_usado - gastUsado);
        const leftPorRev = Math.max(0, item.pos_por_revisar - gastPorRev);

        return {
          ...item,
          cantidad_nuevo: leftNuevo > 0 ? leftNuevo : '',
          cantidad_usado: leftUsado > 0 ? leftUsado : '',
          cantidad_por_revisar: leftPorRev > 0 ? leftPorRev : '',
          cantidad: remainingQty
        };
      });
    });

    setActiveTab('devolucion');
    showNotification('success', 'Se cargaron los materiales sobrantes en la pestaña de Devolución.');
  };

  // Envío Devolución al Almacén
  const handleEnviarDevolucion = async () => {
    const aDevolver = materialesDevolver
      .filter(m => m.cantidad > 0)
      .map(m => {
        const nNuevo = typeof m.cantidad_nuevo === 'number' ? m.cantidad_nuevo : 0;
        const nUsado = typeof m.cantidad_usado === 'number' ? m.cantidad_usado : 0;
        const nPorRev = typeof m.cantidad_por_revisar === 'number' ? m.cantidad_por_revisar : 0;
        const finalNuevo = (nNuevo === 0 && nUsado === 0 && nPorRev === 0) ? m.cantidad : nNuevo;

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
        showNotification('error', 'Debes indicar al menos un material con cantidad mayor a 0 para devolver.');
      } else {
        Alert.alert('Validación', 'Debes indicar al menos un material con cantidad mayor a 0 para devolver.');
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
        estado: 'PENDIENTE'
      };

      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/devoluciones/solicitar`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          payload,
          materiales: aDevolver
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Error al enviar la solicitud');
      }

      showNotification('success', 'Tu solicitud de devolución ha sido enviada al administrador.');
      setTimeout(() => {
        router.replace('/(empleado)/gastos');
      }, 1500);
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
      .filter(m => m.cantidad > 0)
      .map(m => {
        const nNuevo = typeof m.cantidad_nuevo === 'number' ? m.cantidad_nuevo : 0;
        const nUsado = typeof m.cantidad_usado === 'number' ? m.cantidad_usado : 0;
        const nPorRev = typeof m.cantidad_por_revisar === 'number' ? m.cantidad_por_revisar : 0;
        const finalNuevo = (nNuevo === 0 && nUsado === 0 && nPorRev === 0) ? m.cantidad : nNuevo;

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
      const msg = 'Debes indicar al menos un material con cantidad mayor a 0 que hayas utilizado.';
      if (Platform.OS === 'web') showNotification('error', msg);
      else Alert.alert('Validación', msg);
      return;
    }

    const detalleFinal = detalleTrabajo.trim() || `Gasto de material (${selectedCliente || tipoGasto})`;

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
        observaciones_devolucion: `Devolución de sobrantes tras trabajo en: ${detalleFinal}`
      };

      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/devoluciones/gasto-material`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Error al reportar el gasto de material');
      }

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

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={themeColors.primary} />
      </View>
    );
  }

  const totalDevolverGeneral = materialesDevolver.reduce((acc, curr) => acc + (curr.cantidad || 0), 0);
  const totalGastoGeneral = materialesGasto.reduce((acc, curr) => acc + (curr.cantidad || 0), 0);
  const totalPosesionGeneral = materialesGasto.reduce((acc, curr) => acc + (curr.maximo || 0), 0);
  const totalRestanteGeneral = Math.max(0, totalPosesionGeneral - totalGastoGeneral);

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* BANNER DE NOTIFICACIÓN EN PANTALLA */}
        {feedbackMessage && (
          <View
            style={[
              styles.feedbackBanner,
              {
                backgroundColor: feedbackMessage.type === 'success' ? '#10B98120' : '#DC262620',
                borderColor: feedbackMessage.type === 'success' ? '#10B981' : '#DC2626'
              }
            ]}
          >
            <Ionicons
              name={feedbackMessage.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
              size={20}
              color={feedbackMessage.type === 'success' ? '#10B981' : '#DC2626'}
            />
            <Text
              style={{
                color: feedbackMessage.type === 'success' ? '#10B981' : '#DC2626',
                fontWeight: '700',
                fontSize: 13,
                flex: 1
              }}
            >
              {feedbackMessage.text}
            </Text>
          </View>
        )}

        {/* ENCABEZADO */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: themeColors.text }]}>Control de Material</Text>
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
            Devuelve materiales sobrantes al almacén o reporta el material que utilizaste en tus servicios y proyectos.
          </Text>
        </View>

        {/* SELECTOR DE PESTAÑAS (SEGMENTED CONTROL) */}
        <View style={[styles.tabsContainer, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
          <TouchableOpacity
            style={[
              styles.tabBtn,
              activeTab === 'devolucion' && [styles.activeTabBtn, { backgroundColor: themeColors.primary }]
            ]}
            onPress={() => {
              Keyboard.dismiss();
              setActiveTab('devolucion');
            }}
            activeOpacity={0.8}
          >
            <Ionicons
              name="return-down-back-outline"
              size={18}
              color={activeTab === 'devolucion' ? '#ffffff' : themeColors.textSecondary}
            />
            <Text
              style={[
                styles.tabBtnText,
                { color: activeTab === 'devolucion' ? '#ffffff' : themeColors.textSecondary }
              ]}
            >
              Devolver al Almacén
            </Text>
            {totalDevolverGeneral > 0 && activeTab !== 'devolucion' && (
              <View style={[styles.tabBadge, { backgroundColor: themeColors.primary }]}>
                <Text style={styles.tabBadgeText}>{totalDevolverGeneral}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabBtn,
              activeTab === 'gasto' && [styles.activeTabBtn, { backgroundColor: '#10B981' }]
            ]}
            onPress={() => {
              Keyboard.dismiss();
              setActiveTab('gasto');
            }}
            activeOpacity={0.8}
          >
            <Ionicons
              name="construct-outline"
              size={18}
              color={activeTab === 'gasto' ? '#ffffff' : themeColors.textSecondary}
            />
            <Text
              style={[
                styles.tabBtnText,
                { color: activeTab === 'gasto' ? '#ffffff' : themeColors.textSecondary }
              ]}
            >
              Gasto de Material
            </Text>
            {totalGastoGeneral > 0 && activeTab !== 'gasto' && (
              <View style={[styles.tabBadge, { backgroundColor: '#10B981' }]}>
                <Text style={styles.tabBadgeText}>{totalGastoGeneral}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* CONTENIDO PRINCIPAL */}
        {inventario.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <Ionicons name="cube-outline" size={48} color={themeColors.textSecondary} />
            <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.two, textAlign: 'center', fontSize: 15, fontWeight: '500' }}>
              No tienes material en tu inventario personal / camioneta.
            </Text>
            <Text style={{ color: themeColors.textSecondary, marginTop: 4, textAlign: 'center', fontSize: 12 }}>
              Puedes solicitar material en la sección de "Retirar Material".
            </Text>
          </View>
        ) : (
          <View>
            {/* ========== TAB 1: DEVOLUCIÓN AL ALMACÉN ========== */}
            {activeTab === 'devolucion' && (
              <View style={[styles.card, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.two, flexWrap: 'wrap', gap: 8 }}>
                  <View>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: themeColors.text }}>
                      Material en Camioneta ({inventario.length})
                    </Text>
                    <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>
                      Selecciona lo que reintegrarás al almacén físico.
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={handleAutollenarDevolucionTodo}
                    style={[styles.quickPresetBtn, { borderColor: themeColors.primary, backgroundColor: themeColors.primary + '18' }]}
                  >
                    <Ionicons name="sparkles" size={14} color={themeColors.primary} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.primary }}>Devolver Todo</Text>
                  </TouchableOpacity>
                </View>

                {materialesDevolver.map((m, idx) => {
                  const qNuevo = typeof m.cantidad_nuevo === 'number' ? m.cantidad_nuevo : 0;
                  const qUsado = typeof m.cantidad_usado === 'number' ? m.cantidad_usado : 0;
                  const qPorRev = typeof m.cantidad_por_revisar === 'number' ? m.cantidad_por_revisar : 0;
                  const currentTotal = m.cantidad || 0;
                  const remainingToDevolve = Math.max(0, m.maximo - currentTotal);
                  const isExpanded = !!expandedDevolucion[m.productoId];

                  return (
                    <View
                      key={m.productoId}
                      style={[
                        styles.itemCard,
                        {
                          borderColor: currentTotal > 0 ? themeColors.primary : themeColors.border,
                          backgroundColor: themeColors.background,
                          borderWidth: currentTotal > 0 ? 1.5 : 1
                        }
                      ]}
                    >
                      {/* Encabezado del Producto */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={{ color: themeColors.text, fontWeight: '700', fontSize: 15 }}>{m.nombre}</Text>
                          <Text style={{ color: themeColors.textSecondary, fontSize: 12, marginTop: 2 }}>
                            SKU: {m.sku || '-'} • En posesión: <Text style={{ fontWeight: 'bold', color: themeColors.primary }}>{m.maximo} {m.unidad}</Text>
                          </Text>
                        </View>

                        {currentTotal > 0 && (
                          <TouchableOpacity
                            onPress={() => handleClearItem('devolucion', idx)}
                            style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: themeColors.danger + '15' }}
                          >
                            <Text style={{ fontSize: 11, color: themeColors.danger, fontWeight: '700' }}>Limpiar</Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* Control Directo de Cantidad */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, marginBottom: m.hasUsedOrDamaged ? 8 : 4 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: themeColors.text }}>
                          Cantidad a devolver:
                        </Text>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          {currentTotal === 0 && (
                            <TouchableOpacity
                              style={[styles.quickAllChip, { borderColor: themeColors.primary, backgroundColor: themeColors.primary + '15' }]}
                              onPress={() => handleDirectQty('devolucion', idx, m.maximo)}
                            >
                              <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.primary }}>Todo ({m.maximo})</Text>
                            </TouchableOpacity>
                          )}

                          <View style={[styles.stepperContainer, { backgroundColor: themeColors.backgroundElement, borderColor: currentTotal > 0 ? themeColors.primary : themeColors.border }]}>
                            <TouchableOpacity
                              style={[styles.stepperBtn, { backgroundColor: themeColors.danger + '18' }]}
                              onPress={() => handleDirectQty('devolucion', idx, Math.max(0, currentTotal - 1))}
                              disabled={currentTotal <= 0}
                            >
                              <Ionicons name="remove" size={14} color={currentTotal > 0 ? themeColors.danger : themeColors.textSecondary} />
                            </TouchableOpacity>

                            <TextInput
                              style={[styles.stepperInput, { color: themeColors.text }]}
                              keyboardType="decimal-pad"
                              selectTextOnFocus
                              value={currentTotal === 0 ? '' : String(currentTotal)}
                              placeholder="0"
                              placeholderTextColor={themeColors.textSecondary}
                              onChangeText={(val) => handleDirectQty('devolucion', idx, val)}
                            />

                            <TouchableOpacity
                              style={[styles.stepperBtn, { backgroundColor: themeColors.primary + '18' }]}
                              onPress={() => handleDirectQty('devolucion', idx, Math.min(m.maximo, currentTotal + 1))}
                              disabled={currentTotal >= m.maximo}
                            >
                              <Ionicons name="add" size={14} color={currentTotal < m.maximo ? themeColors.primary : themeColors.textSecondary} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>

                      {/* Desglose de Condición */}
                      <View style={{ marginTop: 6 }}>
                        <TouchableOpacity
                          style={[
                            styles.cascadeHeaderBtn,
                            {
                              backgroundColor: isExpanded ? themeColors.primary + '12' : themeColors.backgroundElement,
                              borderColor: isExpanded ? themeColors.primary : themeColors.border,
                            }
                          ]}
                          onPress={() => setExpandedDevolucion(prev => ({ ...prev, [m.productoId]: !prev[m.productoId] }))}
                          activeOpacity={0.7}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                            <Ionicons
                              name={isExpanded ? "layers" : "layers-outline"}
                              size={14}
                              color={isExpanded ? themeColors.primary : themeColors.textSecondary}
                            />
                            <Text style={{ fontSize: 12, fontWeight: '700', color: isExpanded ? themeColors.primary : themeColors.text }}>
                              Desglose por condición (Nuevas, Usadas, Dañadas)
                            </Text>
                          </View>

                          {(qUsado > 0 || qPorRev > 0) && (
                            <View style={{ backgroundColor: '#D9770620', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginRight: 6 }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#D97706' }}>
                                {qUsado > 0 ? `Usadas: ${qUsado}` : ''} {qPorRev > 0 ? `Dañadas: ${qPorRev}` : ''}
                              </Text>
                            </View>
                          )}

                          <Ionicons
                            name={isExpanded ? "chevron-up" : "chevron-down"}
                            size={14}
                            color={isExpanded ? themeColors.primary : themeColors.textSecondary}
                          />
                        </TouchableOpacity>

                        {isExpanded && (
                          <View style={[styles.cascadeBody, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                              {m.pos_nuevo > 0 && (
                                <TouchableOpacity
                                  onPress={() => handleSetAllCondition('devolucion', idx, 'cantidad_nuevo')}
                                  style={[styles.quickPresetBtn, { borderColor: '#10B981', backgroundColor: '#10B98115' }]}
                                >
                                  <Ionicons name="sparkles-outline" size={12} color="#10B981" />
                                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#10B981' }}>Todo Nuevo ({m.pos_nuevo})</Text>
                                </TouchableOpacity>
                              )}
                              {m.pos_usado > 0 && (
                                <TouchableOpacity
                                  onPress={() => handleSetAllCondition('devolucion', idx, 'cantidad_usado')}
                                  style={[styles.quickPresetBtn, { borderColor: '#D97706', backgroundColor: '#D9770615' }]}
                                >
                                  <Ionicons name="refresh-outline" size={12} color="#D97706" />
                                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#D97706' }}>Todo Usado ({m.pos_usado})</Text>
                                </TouchableOpacity>
                              )}
                              {m.pos_por_revisar > 0 && (
                                <TouchableOpacity
                                  onPress={() => handleSetAllCondition('devolucion', idx, 'cantidad_por_revisar')}
                                  style={[styles.quickPresetBtn, { borderColor: '#DC2626', backgroundColor: '#DC262615' }]}
                                >
                                  <Ionicons name="alert-circle-outline" size={12} color="#DC2626" />
                                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#DC2626' }}>Todo Dañado ({m.pos_por_revisar})</Text>
                                </TouchableOpacity>
                              )}
                              {m.maximo > 0 && (
                                <TouchableOpacity
                                  onPress={() => handleSetAllCondition('devolucion', idx, 'all')}
                                  style={[styles.quickPresetBtn, { borderColor: themeColors.primary, backgroundColor: themeColors.primary + '15' }]}
                                >
                                  <Ionicons name="checkmark-done-outline" size={12} color={themeColors.primary} />
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.primary }}>Devolver Todo ({m.maximo})</Text>
                                </TouchableOpacity>
                              )}
                            </View>

                            {/* 1. Nuevas */}
                            <View style={styles.conditionRow}>
                              <View style={{ flex: 1, paddingRight: 6 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' }} />
                                  <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.text }}>Nuevas (Intactas)</Text>
                                </View>
                                <Text style={{ fontSize: 10, color: themeColors.textSecondary, marginLeft: 14 }}>
                                  En posesión: <Text style={{ fontWeight: '700', color: themeColors.text }}>{m.pos_nuevo} {m.unidad}</Text>
                                </Text>
                              </View>
                              <View style={[styles.stepperContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                                <TouchableOpacity
                                  style={[styles.stepperBtn, { backgroundColor: themeColors.danger + '18' }]}
                                  onPress={() => handleConditionChange('devolucion', idx, 'cantidad_nuevo', Math.max(0, qNuevo - 1))}
                                  disabled={qNuevo <= 0}
                                >
                                  <Ionicons name="remove" size={14} color={qNuevo > 0 ? themeColors.danger : themeColors.textSecondary} />
                                </TouchableOpacity>
                                <TextInput
                                  style={[styles.stepperInput, { color: themeColors.text }]}
                                  keyboardType="decimal-pad"
                                  selectTextOnFocus
                                  value={m.cantidad_nuevo === '' ? '' : String(m.cantidad_nuevo)}
                                  placeholder="0"
                                  placeholderTextColor={themeColors.textSecondary}
                                  onChangeText={(val) => {
                                    if (val.trim() === '') handleConditionChange('devolucion', idx, 'cantidad_nuevo', '');
                                    else {
                                      const num = parseFloat(val.replace(/[^0-9.]/g, ''));
                                      handleConditionChange('devolucion', idx, 'cantidad_nuevo', isNaN(num) ? '' : num);
                                    }
                                  }}
                                />
                                <TouchableOpacity
                                  style={[styles.stepperBtn, { backgroundColor: themeColors.primary + '18' }]}
                                  onPress={() => handleConditionChange('devolucion', idx, 'cantidad_nuevo', qNuevo + 1)}
                                  disabled={qNuevo >= m.pos_nuevo || remainingToDevolve <= 0}
                                >
                                  <Ionicons name="add" size={14} color={(qNuevo < m.pos_nuevo && remainingToDevolve > 0) ? themeColors.primary : themeColors.textSecondary} />
                                </TouchableOpacity>
                              </View>
                            </View>

                            {/* 2. Usadas */}
                            <View style={[styles.conditionRow, { marginTop: 8 }]}>
                              <View style={{ flex: 1, paddingRight: 6 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#D97706' }} />
                                  <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.text }}>Usadas (Buen estado)</Text>
                                </View>
                                <Text style={{ fontSize: 10, color: themeColors.textSecondary, marginLeft: 14 }}>
                                  En posesión: <Text style={{ fontWeight: '700', color: themeColors.text }}>{m.pos_usado} {m.unidad}</Text>
                                </Text>
                              </View>
                              <View style={[styles.stepperContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                                <TouchableOpacity
                                  style={[styles.stepperBtn, { backgroundColor: themeColors.danger + '18' }]}
                                  onPress={() => handleConditionChange('devolucion', idx, 'cantidad_usado', Math.max(0, qUsado - 1))}
                                  disabled={qUsado <= 0}
                                >
                                  <Ionicons name="remove" size={14} color={qUsado > 0 ? themeColors.danger : themeColors.textSecondary} />
                                </TouchableOpacity>
                                <TextInput
                                  style={[styles.stepperInput, { color: themeColors.text }]}
                                  keyboardType="decimal-pad"
                                  selectTextOnFocus
                                  value={m.cantidad_usado === '' ? '' : String(m.cantidad_usado)}
                                  placeholder="0"
                                  placeholderTextColor={themeColors.textSecondary}
                                  onChangeText={(val) => {
                                    if (val.trim() === '') handleConditionChange('devolucion', idx, 'cantidad_usado', '');
                                    else {
                                      const num = parseFloat(val.replace(/[^0-9.]/g, ''));
                                      handleConditionChange('devolucion', idx, 'cantidad_usado', isNaN(num) ? '' : num);
                                    }
                                  }}
                                />
                                <TouchableOpacity
                                  style={[styles.stepperBtn, { backgroundColor: themeColors.primary + '18' }]}
                                  onPress={() => handleConditionChange('devolucion', idx, 'cantidad_usado', qUsado + 1)}
                                  disabled={qUsado >= m.pos_usado || remainingToDevolve <= 0}
                                >
                                  <Ionicons name="add" size={14} color={(qUsado < m.pos_usado && remainingToDevolve > 0) ? themeColors.primary : themeColors.textSecondary} />
                                </TouchableOpacity>
                              </View>
                            </View>

                            {/* 3. Dañado */}
                            <View style={[styles.conditionRow, { marginTop: 8 }]}>
                              <View style={{ flex: 1, paddingRight: 6 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#DC2626' }} />
                                  <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.text }}>Dañado / Incompleto</Text>
                                </View>
                                <Text style={{ fontSize: 10, color: themeColors.textSecondary, marginLeft: 14 }}>
                                  En posesión: <Text style={{ fontWeight: '700', color: themeColors.text }}>{m.pos_por_revisar} {m.unidad}</Text>
                                </Text>
                              </View>
                              <View style={[styles.stepperContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                                <TouchableOpacity
                                  style={[styles.stepperBtn, { backgroundColor: themeColors.danger + '18' }]}
                                  onPress={() => handleConditionChange('devolucion', idx, 'cantidad_por_revisar', Math.max(0, qPorRev - 1))}
                                  disabled={qPorRev <= 0}
                                >
                                  <Ionicons name="remove" size={14} color={qPorRev > 0 ? themeColors.danger : themeColors.textSecondary} />
                                </TouchableOpacity>
                                <TextInput
                                  style={[styles.stepperInput, { color: themeColors.text }]}
                                  keyboardType="decimal-pad"
                                  selectTextOnFocus
                                  value={m.cantidad_por_revisar === '' ? '' : String(m.cantidad_por_revisar)}
                                  placeholder="0"
                                  placeholderTextColor={themeColors.textSecondary}
                                  onChangeText={(val) => {
                                    if (val.trim() === '') handleConditionChange('devolucion', idx, 'cantidad_por_revisar', '');
                                    else {
                                      const num = parseFloat(val.replace(/[^0-9.]/g, ''));
                                      handleConditionChange('devolucion', idx, 'cantidad_por_revisar', isNaN(num) ? '' : num);
                                    }
                                  }}
                                />
                                <TouchableOpacity
                                  style={[styles.stepperBtn, { backgroundColor: themeColors.primary + '18' }]}
                                  onPress={() => handleConditionChange('devolucion', idx, 'cantidad_por_revisar', qPorRev + 1)}
                                  disabled={qPorRev >= m.pos_por_revisar || remainingToDevolve <= 0}
                                >
                                  <Ionicons name="add" size={14} color={(qPorRev < m.pos_por_revisar && remainingToDevolve > 0) ? themeColors.primary : themeColors.textSecondary} />
                                </TouchableOpacity>
                              </View>
                            </View>
                          </View>
                        )}
                      </View>

                      {/* Resumen del Item */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                        <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                          Te quedarás con: <Text style={{ fontWeight: 'bold', color: themeColors.text }}>{Math.max(0, m.maximo - currentTotal)} {m.unidad}</Text>
                        </Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: currentTotal > 0 ? themeColors.primary : themeColors.textSecondary }}>
                          Devolviendo: {currentTotal} {m.unidad}
                        </Text>
                      </View>
                    </View>
                  );
                })}

                <Text style={{ color: themeColors.text, fontWeight: '600', marginTop: Spacing.four, marginBottom: Spacing.two }}>
                  Observaciones o Motivo (Opcional)
                </Text>
                <TextInput
                  style={[styles.textArea, { borderColor: themeColors.border, color: themeColors.text, backgroundColor: themeColors.background }]}
                  multiline
                  numberOfLines={3}
                  placeholder="Ej: Material sobrante del servicio en sucursal X..."
                  placeholderTextColor={themeColors.textSecondary}
                  value={observacionesDevolucion}
                  onChangeText={setObservacionesDevolucion}
                />

                <CustomButton
                  title={totalDevolverGeneral > 0 ? `Solicitar Devolución (${totalDevolverGeneral} unidades)` : "Solicitar Devolución"}
                  variant="primary"
                  onPress={handleEnviarDevolucion}
                  loading={isSubmittingDevolucion}
                  disabled={totalDevolverGeneral === 0}
                  style={{ marginTop: Spacing.four }}
                />
              </View>
            )}

            {/* ========== TAB 2: GASTO / USO DE MATERIAL ========== */}
            {activeTab === 'gasto' && (
              <View style={[styles.card, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                {/* Encabezado de Gasto */}
                <View style={{ marginBottom: Spacing.three }}>
                  <Text style={{ fontSize: 16, fontWeight: 'bold', color: themeColors.text }}>
                    Reportar Consumo de Material
                  </Text>
                  <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>
                    Registra los materiales de tu camioneta que utilizaste en un servicio, instalación o proyecto.
                  </Text>
                </View>

                {/* 1. Selector de Tipo de Gasto */}
                <View style={{ marginBottom: Spacing.three }}>
                  <Text style={{ color: themeColors.text, marginBottom: Spacing.one, fontWeight: '600', fontSize: 13 }}>
                    Tipo de Destino / Gasto *
                  </Text>
                  <View style={{ flexDirection: 'row', gap: Spacing.one }}>
                    {(['Servicio', 'Proyecto', 'Venta', 'Operativo'] as const).map(tipo => {
                      const isSelected = tipoGasto === tipo;
                      return (
                        <TouchableOpacity
                          key={tipo}
                          style={{
                            flex: 1,
                            paddingVertical: 10,
                            borderRadius: BorderRadius.medium,
                            borderWidth: 1.5,
                            borderColor: isSelected ? '#10B981' : themeColors.border,
                            backgroundColor: isSelected ? '#10B98120' : themeColors.background,
                            alignItems: 'center'
                          }}
                          onPress={() => setTipoGasto(tipo)}
                        >
                          <Text style={{ color: isSelected ? '#10B981' : themeColors.textSecondary, fontWeight: isSelected ? '700' : '500', fontSize: 13 }}>
                            {tipo}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* 2. Cliente Relacionado */}
                <View style={{ marginBottom: Spacing.three, zIndex: 20 }}>
                  <Text style={{ color: themeColors.text, marginBottom: Spacing.half, fontWeight: '600', fontSize: 13 }}>
                    Cliente Relacionado (Opcional)
                  </Text>
                  <TouchableOpacity
                    style={[styles.dropdownTrigger, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}
                    onPress={() => {
                      Keyboard.dismiss();
                      setShowCliDropdown(!showCliDropdown);
                      setShowSucursalDropdown(false);
                    }}
                  >
                    <Ionicons name="business-outline" size={18} color={themeColors.textSecondary} style={{ marginRight: 6 }} />
                    <Text style={{ flex: 1, color: selectedCliente ? themeColors.text : themeColors.textSecondary }}>
                      {selectedCliente || 'Selecciona un cliente'}
                    </Text>
                    {selectedCliente ? (
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          setSelectedCliente('');
                          setSelectedClienteId(null);
                          setSucursal('');
                          setSelectedSucursalId(null);
                        }}
                        style={{ padding: 4 }}
                      >
                        <Ionicons name="close-circle" size={16} color={themeColors.textSecondary} />
                      </TouchableOpacity>
                    ) : (
                      <Ionicons name={showCliDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                    )}
                  </TouchableOpacity>

                  {showCliDropdown && (
                    <Pressable onPress={(e) => e.stopPropagation()} style={styles.dropdownListWrapper}>
                      <View style={[styles.dropdownList, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                        <TextInput
                          placeholder="Buscar cliente..."
                          placeholderTextColor={themeColors.textSecondary}
                          value={clienteSearch}
                          onChangeText={setClienteSearch}
                          style={[styles.textInput, { height: 38, marginBottom: 6, backgroundColor: themeColors.backgroundElement, color: themeColors.text, borderColor: themeColors.border }]}
                        />
                        <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled">
                          {clientes
                            .filter(cli => !clienteSearch || (cli.nombre && cli.nombre.toLowerCase().includes(clienteSearch.toLowerCase())))
                            .map(cli => (
                              <TouchableOpacity
                                key={cli.id}
                                style={[styles.dropdownItem, { borderBottomColor: themeColors.border }]}
                                onPress={() => {
                                  setSelectedCliente(cli.nombre);
                                  setSelectedClienteId(cli.id);
                                  const cliSucs = sucursalesCliente.filter(s => s.cliente_id === cli.id);
                                  if (cliSucs.length === 1) {
                                    setSucursal(cliSucs[0].nombre);
                                    setSelectedSucursalId(cliSucs[0].id);
                                  } else {
                                    setSucursal('');
                                    setSelectedSucursalId(null);
                                  }
                                  setClienteSearch('');
                                  setShowCliDropdown(false);
                                }}
                              >
                                <Text style={{ color: themeColors.text, fontSize: 13, fontWeight: selectedClienteId === cli.id ? '700' : '400' }}>
                                  {cli.nombre}
                                </Text>
                              </TouchableOpacity>
                            ))}
                        </ScrollView>
                      </View>
                    </Pressable>
                  )}
                </View>

                {/* 3. Sucursal */}
                {selectedClienteId && (
                  <View style={{ marginBottom: Spacing.three, zIndex: 10 }}>
                    <Text style={{ color: themeColors.text, marginBottom: Spacing.half, fontWeight: '600', fontSize: 13 }}>
                      Sucursal
                    </Text>
                    <TouchableOpacity
                      style={[styles.dropdownTrigger, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}
                      onPress={() => {
                        Keyboard.dismiss();
                        setShowSucursalDropdown(!showSucursalDropdown);
                        setShowCliDropdown(false);
                      }}
                    >
                      <Ionicons name="location-outline" size={18} color={themeColors.textSecondary} style={{ marginRight: 6 }} />
                      <Text style={{ flex: 1, color: sucursal ? themeColors.text : themeColors.textSecondary }}>
                        {sucursal || 'Selecciona una sucursal'}
                      </Text>
                      {sucursal ? (
                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation();
                            setSucursal('');
                            setSelectedSucursalId(null);
                          }}
                          style={{ padding: 4 }}
                        >
                          <Ionicons name="close-circle" size={16} color={themeColors.textSecondary} />
                        </TouchableOpacity>
                      ) : (
                        <Ionicons name={showSucursalDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                      )}
                    </TouchableOpacity>

                    {showSucursalDropdown && (
                      <Pressable onPress={(e) => e.stopPropagation()} style={styles.dropdownListWrapper}>
                        <View style={[styles.dropdownList, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                          <TextInput
                            placeholder="Buscar sucursal..."
                            placeholderTextColor={themeColors.textSecondary}
                            value={sucursalSearch}
                            onChangeText={setSucursalSearch}
                            style={[styles.textInput, { height: 38, marginBottom: 6, backgroundColor: themeColors.backgroundElement, color: themeColors.text, borderColor: themeColors.border }]}
                          />
                          <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled">
                            {sucursalesCliente
                              .filter(s => s.cliente_id === selectedClienteId)
                              .filter(s => !sucursalSearch || (s.nombre && s.nombre.toLowerCase().includes(sucursalSearch.toLowerCase())))
                              .map(s => (
                                <TouchableOpacity
                                  key={s.id}
                                  style={[styles.dropdownItem, { borderBottomColor: themeColors.border }]}
                                  onPress={() => {
                                    setSucursal(s.nombre);
                                    setSelectedSucursalId(s.id);
                                    setSucursalSearch('');
                                    setShowSucursalDropdown(false);
                                  }}
                                >
                                  <Text style={{ color: themeColors.text, fontSize: 13, fontWeight: selectedSucursalId === s.id ? '700' : '400' }}>
                                    {s.nombre}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                          </ScrollView>
                        </View>
                      </Pressable>
                    )}
                  </View>
                )}

                {/* 4. Detalle / Motivo del Trabajo */}
                <View style={{ marginBottom: Spacing.four }}>
                  <Text style={{ color: themeColors.text, marginBottom: Spacing.half, fontWeight: '600', fontSize: 13 }}>
                    Detalle o Motivo del Trabajo (Opcional)
                  </Text>
                  <TextInput
                    style={[styles.textInput, { borderColor: themeColors.border, color: themeColors.text, backgroundColor: themeColors.background, height: 42 }]}
                    placeholder="Ej: Instalación de nodo de red y parcheo en site principal..."
                    placeholderTextColor={themeColors.textSecondary}
                    value={detalleTrabajo}
                    onChangeText={setDetalleTrabajo}
                  />
                </View>

                {/* 5. Lista de Materiales a Gastar */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.two, flexWrap: 'wrap', gap: 8 }}>
                  <Text style={{ fontSize: 15, fontWeight: 'bold', color: themeColors.text }}>
                    Materiales Utilizados ({inventario.length})
                  </Text>

                  {totalGastoGeneral > 0 && (
                    <View style={{ backgroundColor: '#10B98120', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#10B981' }}>
                        Consumo: {totalGastoGeneral} | Restante: {totalRestanteGeneral}
                      </Text>
                    </View>
                  )}
                </View>

                {materialesGasto.map((m, idx) => {
                  const qNuevo = typeof m.cantidad_nuevo === 'number' ? m.cantidad_nuevo : 0;
                  const qUsado = typeof m.cantidad_usado === 'number' ? m.cantidad_usado : 0;
                  const qPorRev = typeof m.cantidad_por_revisar === 'number' ? m.cantidad_por_revisar : 0;
                  const currentTotal = m.cantidad || 0;
                  const remainingInVan = Math.max(0, m.maximo - currentTotal);
                  const isExpanded = !!expandedGasto[m.productoId];

                  return (
                    <View
                      key={m.productoId}
                      style={[
                        styles.itemCard,
                        {
                          borderColor: currentTotal > 0 ? '#10B981' : themeColors.border,
                          backgroundColor: themeColors.background,
                          borderWidth: currentTotal > 0 ? 1.5 : 1
                        }
                      ]}
                    >
                      {/* Encabezado del Producto */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={{ color: themeColors.text, fontWeight: '700', fontSize: 15 }}>{m.nombre}</Text>
                          <Text style={{ color: themeColors.textSecondary, fontSize: 12, marginTop: 2 }}>
                            SKU: {m.sku || '-'} • En posesión: <Text style={{ fontWeight: 'bold', color: '#10B981' }}>{m.maximo} {m.unidad}</Text>
                          </Text>
                        </View>

                        {currentTotal > 0 && (
                          <TouchableOpacity
                            onPress={() => handleClearItem('gasto', idx)}
                            style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: themeColors.danger + '15' }}
                          >
                            <Text style={{ fontSize: 11, color: themeColors.danger, fontWeight: '700' }}>Limpiar</Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* Control Directo de Cantidad Gastada */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, marginBottom: m.hasUsedOrDamaged ? 8 : 4 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: themeColors.text }}>
                          Cantidad Utilizada:
                        </Text>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          {currentTotal === 0 && (
                            <TouchableOpacity
                              style={[styles.quickAllChip, { borderColor: '#10B981', backgroundColor: '#10B98115' }]}
                              onPress={() => handleDirectQty('gasto', idx, m.maximo)}
                            >
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#10B981' }}>Todo ({m.maximo})</Text>
                            </TouchableOpacity>
                          )}

                          <View style={[styles.stepperContainer, { backgroundColor: themeColors.backgroundElement, borderColor: currentTotal > 0 ? '#10B981' : themeColors.border }]}>
                            <TouchableOpacity
                              style={[styles.stepperBtn, { backgroundColor: themeColors.danger + '18' }]}
                              onPress={() => handleDirectQty('gasto', idx, Math.max(0, currentTotal - 1))}
                              disabled={currentTotal <= 0}
                            >
                              <Ionicons name="remove" size={14} color={currentTotal > 0 ? themeColors.danger : themeColors.textSecondary} />
                            </TouchableOpacity>

                            <TextInput
                              style={[styles.stepperInput, { color: themeColors.text }]}
                              keyboardType="decimal-pad"
                              selectTextOnFocus
                              value={currentTotal === 0 ? '' : String(currentTotal)}
                              placeholder="0"
                              placeholderTextColor={themeColors.textSecondary}
                              onChangeText={(val) => handleDirectQty('gasto', idx, val)}
                            />

                            <TouchableOpacity
                              style={[styles.stepperBtn, { backgroundColor: '#10B98120' }]}
                              onPress={() => handleDirectQty('gasto', idx, Math.min(m.maximo, currentTotal + 1))}
                              disabled={currentTotal >= m.maximo}
                            >
                              <Ionicons name="add" size={14} color={currentTotal < m.maximo ? '#10B981' : themeColors.textSecondary} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>

                      {/* Desglose de Condición Gastada */}
                      <View style={{ marginTop: 6 }}>
                        <TouchableOpacity
                          style={[
                            styles.cascadeHeaderBtn,
                            {
                              backgroundColor: isExpanded ? '#10B98115' : themeColors.backgroundElement,
                              borderColor: isExpanded ? '#10B981' : themeColors.border,
                            }
                          ]}
                          onPress={() => setExpandedGasto(prev => ({ ...prev, [m.productoId]: !prev[m.productoId] }))}
                          activeOpacity={0.7}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                            <Ionicons
                              name={isExpanded ? "layers" : "layers-outline"}
                              size={14}
                              color={isExpanded ? '#10B981' : themeColors.textSecondary}
                            />
                            <Text style={{ fontSize: 12, fontWeight: '700', color: isExpanded ? '#10B981' : themeColors.text }}>
                              Desglose por condición (Nuevas, Usadas, Dañadas)
                            </Text>
                          </View>

                          {(qUsado > 0 || qPorRev > 0) && (
                            <View style={{ backgroundColor: '#D9770620', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginRight: 6 }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#D97706' }}>
                                {qUsado > 0 ? `Usadas: ${qUsado}` : ''} {qPorRev > 0 ? `Dañadas: ${qPorRev}` : ''}
                              </Text>
                            </View>
                          )}

                          <Ionicons
                            name={isExpanded ? "chevron-up" : "chevron-down"}
                            size={14}
                            color={isExpanded ? '#10B981' : themeColors.textSecondary}
                          />
                        </TouchableOpacity>

                        {isExpanded && (
                          <View style={[styles.cascadeBody, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                              {m.pos_nuevo > 0 && (
                                <TouchableOpacity
                                  onPress={() => handleSetAllCondition('gasto', idx, 'cantidad_nuevo')}
                                  style={[styles.quickPresetBtn, { borderColor: '#10B981', backgroundColor: '#10B98115' }]}
                                >
                                  <Ionicons name="sparkles-outline" size={12} color="#10B981" />
                                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#10B981' }}>Todo Nuevo ({m.pos_nuevo})</Text>
                                </TouchableOpacity>
                              )}
                              {m.pos_usado > 0 && (
                                <TouchableOpacity
                                  onPress={() => handleSetAllCondition('gasto', idx, 'cantidad_usado')}
                                  style={[styles.quickPresetBtn, { borderColor: '#D97706', backgroundColor: '#D9770615' }]}
                                >
                                  <Ionicons name="refresh-outline" size={12} color="#D97706" />
                                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#D97706' }}>Todo Usado ({m.pos_usado})</Text>
                                </TouchableOpacity>
                              )}
                              {m.pos_por_revisar > 0 && (
                                <TouchableOpacity
                                  onPress={() => handleSetAllCondition('gasto', idx, 'cantidad_por_revisar')}
                                  style={[styles.quickPresetBtn, { borderColor: '#DC2626', backgroundColor: '#DC262615' }]}
                                >
                                  <Ionicons name="alert-circle-outline" size={12} color="#DC2626" />
                                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#DC2626' }}>Todo Dañado ({m.pos_por_revisar})</Text>
                                </TouchableOpacity>
                              )}
                            </View>

                            {/* 1. Nuevas */}
                            <View style={styles.conditionRow}>
                              <View style={{ flex: 1, paddingRight: 6 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' }} />
                                  <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.text }}>Nuevas Utilizadas</Text>
                                </View>
                                <Text style={{ fontSize: 10, color: themeColors.textSecondary, marginLeft: 14 }}>
                                  En posesión: <Text style={{ fontWeight: '700', color: themeColors.text }}>{m.pos_nuevo} {m.unidad}</Text>
                                </Text>
                              </View>
                              <View style={[styles.stepperContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                                <TouchableOpacity
                                  style={[styles.stepperBtn, { backgroundColor: themeColors.danger + '18' }]}
                                  onPress={() => handleConditionChange('gasto', idx, 'cantidad_nuevo', Math.max(0, qNuevo - 1))}
                                  disabled={qNuevo <= 0}
                                >
                                  <Ionicons name="remove" size={14} color={qNuevo > 0 ? themeColors.danger : themeColors.textSecondary} />
                                </TouchableOpacity>
                                <TextInput
                                  style={[styles.stepperInput, { color: themeColors.text }]}
                                  keyboardType="decimal-pad"
                                  selectTextOnFocus
                                  value={m.cantidad_nuevo === '' ? '' : String(m.cantidad_nuevo)}
                                  placeholder="0"
                                  placeholderTextColor={themeColors.textSecondary}
                                  onChangeText={(val) => {
                                    if (val.trim() === '') handleConditionChange('gasto', idx, 'cantidad_nuevo', '');
                                    else {
                                      const num = parseFloat(val.replace(/[^0-9.]/g, ''));
                                      handleConditionChange('gasto', idx, 'cantidad_nuevo', isNaN(num) ? '' : num);
                                    }
                                  }}
                                />
                                <TouchableOpacity
                                  style={[styles.stepperBtn, { backgroundColor: '#10B98120' }]}
                                  onPress={() => handleConditionChange('gasto', idx, 'cantidad_nuevo', qNuevo + 1)}
                                  disabled={qNuevo >= m.pos_nuevo || remainingInVan <= 0}
                                >
                                  <Ionicons name="add" size={14} color={(qNuevo < m.pos_nuevo && remainingInVan > 0) ? '#10B981' : themeColors.textSecondary} />
                                </TouchableOpacity>
                              </View>
                            </View>

                            {/* 2. Usadas */}
                            <View style={[styles.conditionRow, { marginTop: 8 }]}>
                              <View style={{ flex: 1, paddingRight: 6 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#D97706' }} />
                                  <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.text }}>Usadas Utilizadas</Text>
                                </View>
                                <Text style={{ fontSize: 10, color: themeColors.textSecondary, marginLeft: 14 }}>
                                  En posesión: <Text style={{ fontWeight: '700', color: themeColors.text }}>{m.pos_usado} {m.unidad}</Text>
                                </Text>
                              </View>
                              <View style={[styles.stepperContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                                <TouchableOpacity
                                  style={[styles.stepperBtn, { backgroundColor: themeColors.danger + '18' }]}
                                  onPress={() => handleConditionChange('gasto', idx, 'cantidad_usado', Math.max(0, qUsado - 1))}
                                  disabled={qUsado <= 0}
                                >
                                  <Ionicons name="remove" size={14} color={qUsado > 0 ? themeColors.danger : themeColors.textSecondary} />
                                </TouchableOpacity>
                                <TextInput
                                  style={[styles.stepperInput, { color: themeColors.text }]}
                                  keyboardType="decimal-pad"
                                  selectTextOnFocus
                                  value={m.cantidad_usado === '' ? '' : String(m.cantidad_usado)}
                                  placeholder="0"
                                  placeholderTextColor={themeColors.textSecondary}
                                  onChangeText={(val) => {
                                    if (val.trim() === '') handleConditionChange('gasto', idx, 'cantidad_usado', '');
                                    else {
                                      const num = parseFloat(val.replace(/[^0-9.]/g, ''));
                                      handleConditionChange('gasto', idx, 'cantidad_usado', isNaN(num) ? '' : num);
                                    }
                                  }}
                                />
                                <TouchableOpacity
                                  style={[styles.stepperBtn, { backgroundColor: '#10B98120' }]}
                                  onPress={() => handleConditionChange('gasto', idx, 'cantidad_usado', qUsado + 1)}
                                  disabled={qUsado >= m.pos_usado || remainingInVan <= 0}
                                >
                                  <Ionicons name="add" size={14} color={(qUsado < m.pos_usado && remainingInVan > 0) ? '#10B981' : themeColors.textSecondary} />
                                </TouchableOpacity>
                              </View>
                            </View>

                            {/* 3. Dañadas */}
                            <View style={[styles.conditionRow, { marginTop: 8 }]}>
                              <View style={{ flex: 1, paddingRight: 6 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#DC2626' }} />
                                  <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.text }}>Dañadas Utilizadas/Descartadas</Text>
                                </View>
                                <Text style={{ fontSize: 10, color: themeColors.textSecondary, marginLeft: 14 }}>
                                  En posesión: <Text style={{ fontWeight: '700', color: themeColors.text }}>{m.pos_por_revisar} {m.unidad}</Text>
                                </Text>
                              </View>
                              <View style={[styles.stepperContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                                <TouchableOpacity
                                  style={[styles.stepperBtn, { backgroundColor: themeColors.danger + '18' }]}
                                  onPress={() => handleConditionChange('gasto', idx, 'cantidad_por_revisar', Math.max(0, qPorRev - 1))}
                                  disabled={qPorRev <= 0}
                                >
                                  <Ionicons name="remove" size={14} color={qPorRev > 0 ? themeColors.danger : themeColors.textSecondary} />
                                </TouchableOpacity>
                                <TextInput
                                  style={[styles.stepperInput, { color: themeColors.text }]}
                                  keyboardType="decimal-pad"
                                  selectTextOnFocus
                                  value={m.cantidad_por_revisar === '' ? '' : String(m.cantidad_por_revisar)}
                                  placeholder="0"
                                  placeholderTextColor={themeColors.textSecondary}
                                  onChangeText={(val) => {
                                    if (val.trim() === '') handleConditionChange('gasto', idx, 'cantidad_por_revisar', '');
                                    else {
                                      const num = parseFloat(val.replace(/[^0-9.]/g, ''));
                                      handleConditionChange('gasto', idx, 'cantidad_por_revisar', isNaN(num) ? '' : num);
                                    }
                                  }}
                                />
                                <TouchableOpacity
                                  style={[styles.stepperBtn, { backgroundColor: '#10B98120' }]}
                                  onPress={() => handleConditionChange('gasto', idx, 'cantidad_por_revisar', qPorRev + 1)}
                                  disabled={qPorRev >= m.pos_por_revisar || remainingInVan <= 0}
                                >
                                  <Ionicons name="add" size={14} color={(qPorRev < m.pos_por_revisar && remainingInVan > 0) ? '#10B981' : themeColors.textSecondary} />
                                </TouchableOpacity>
                              </View>
                            </View>
                          </View>
                        )}
                      </View>

                      {/* Resumen del Item */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                        <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                          Te quedarán en camioneta: <Text style={{ fontWeight: 'bold', color: themeColors.text }}>{remainingInVan} {m.unidad}</Text>
                        </Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: currentTotal > 0 ? '#10B981' : themeColors.textSecondary }}>
                          Consumo: {currentTotal} {m.unidad}
                        </Text>
                      </View>
                    </View>
                  );
                })}

                {/* BOTONES DE ACCIÓN PARA GASTO Y DEVOLUCIÓN DEL RESTANTE */}
                <View style={{ marginTop: Spacing.four, gap: Spacing.two }}>
                  {/* Botón 1: Reportar Consumo de Material */}
                  <CustomButton
                    title={totalGastoGeneral > 0 ? `Reportar Consumo (${totalGastoGeneral} unidades)` : "Reportar Consumo de Material"}
                    variant="primary"
                    onPress={() => handleEnviarGasto(false)}
                    loading={isSubmittingGasto}
                    disabled={totalGastoGeneral === 0}
                    style={{ backgroundColor: '#10B981' }}
                  />

                  {/* Botón 2: Reportar Consumo y Devolver Restante al Almacén */}
                  {totalRestanteGeneral > 0 && totalGastoGeneral > 0 && (
                    <TouchableOpacity
                      onPress={() => handleEnviarGasto(true)}
                      disabled={isSubmittingGastoYDevolucion || isSubmittingGasto}
                      style={[
                        styles.dualActionBtn,
                        {
                          backgroundColor: themeColors.primary + '18',
                          borderColor: themeColors.primary,
                        }
                      ]}
                    >
                      {isSubmittingGastoYDevolucion ? (
                        <ActivityIndicator size="small" color={themeColors.primary} />
                      ) : (
                        <>
                          <Ionicons name="swap-horizontal" size={18} color={themeColors.primary} />
                          <Text style={[styles.dualActionBtnText, { color: themeColors.primary }]}>
                            Reportar Consumo ({totalGastoGeneral}) y Devolver Restante ({totalRestanteGeneral}) al Almacén
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}

                  {/* Botón 3: Cargar sobrantes en la pestaña de devolución */}
                  {totalRestanteGeneral > 0 && (
                    <TouchableOpacity
                      onPress={handleTransferirRestanteADevolucion}
                      style={[
                        styles.dualActionBtn,
                        {
                          backgroundColor: themeColors.background,
                          borderColor: themeColors.border,
                        }
                      ]}
                    >
                      <Ionicons name="arrow-undo-outline" size={16} color={themeColors.textSecondary} />
                      <Text style={[styles.dualActionBtnText, { color: themeColors.textSecondary, fontSize: 12 }]}>
                        Pasar todo el sobrante ({totalRestanteGeneral} pzas) a Devolución al Almacén
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.three,
    paddingBottom: 60,
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    borderWidth: 1.5,
    marginBottom: Spacing.three,
    gap: 8,
  },
  header: {
    marginBottom: Spacing.three,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: Spacing.one,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  tabsContainer: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    marginBottom: Spacing.four,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.small,
    gap: 6,
  },
  activeTabBtn: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  tabBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  tabBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  emptyContainer: {
    padding: Spacing.five,
    borderRadius: BorderRadius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  card: {
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
  itemCard: {
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    marginBottom: Spacing.three,
  },
  quickAllChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  cascadeHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  cascadeBody: {
    marginTop: 6,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  quickPresetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  conditionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
    height: 32,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperInput: {
    width: 44,
    height: 32,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 13,
    padding: 0,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    paddingHorizontal: Spacing.three,
    fontSize: 14,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    padding: Spacing.three,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    height: 42,
    borderWidth: 1,
    borderRadius: BorderRadius.small,
  },
  dropdownListWrapper: {
    width: '100%',
    zIndex: 1000,
    marginTop: 4,
  },
  dropdownList: {
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    padding: Spacing.two,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dualActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.medium,
    borderWidth: 1.5,
    gap: 8,
  },
  dualActionBtnText: {
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  }
});
