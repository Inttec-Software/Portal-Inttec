import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, BorderRadius } from '@/constants/theme';
import CustomButton from '@/components/CustomButton';
import CustomInput from '@/components/CustomInput';
import SignatureCanvasModal from '@/components/SignatureCanvasModal';
import { styles } from './retiroMaterialStyles';
import {
  getProductoUnidad,
  hasMultipleStockStates,
  getTotalStock,
  getStockNuevo,
} from '../utils/inventarioUtils';
import { Producto, CartItem, TipoGastoMaterial } from '../types';
import { CatalogoItem, SucursalCliente } from '@/services/supabase';
import { decodeHtmlEntities } from '@/utils/helpers';

interface RetiroCartDrawerProps {
  themeColors: any;
  cart: CartItem[];
  cartModalVisible: boolean;
  setCartModalVisible: (val: boolean) => void;
  stateModalProduct: Producto | null;
  setStateModalProduct: (prod: Producto | null) => void;
  signatureModalVisible: boolean;
  setSignatureModalVisible: (val: boolean) => void;
  isSubmitting: boolean;
  motivoRetiro: string;
  setMotivoRetiro: (val: string) => void;
  tipoGasto: TipoGastoMaterial;
  setTipoGasto: (val: TipoGastoMaterial) => void;
  detalleServicioProyecto: string;
  setDetalleServicioProyecto: (val: string) => void;
  clientes: CatalogoItem[];
  sucursalesCliente: SucursalCliente[];
  selectedCliente: string;
  setSelectedCliente: (val: string) => void;
  selectedClienteId: string | null;
  setSelectedClienteId: (val: string | null) => void;
  clienteSearch: string;
  setClienteSearch: (val: string) => void;
  showCliDropdown: boolean;
  setShowCliDropdown: (val: boolean) => void;
  sucursal: string;
  setSucursal: (val: string) => void;
  selectedSucursalId: string | null;
  setSelectedSucursalId: (val: string | null) => void;
  sucursalSearch: string;
  setSucursalSearch: (val: string) => void;
  showSucursalDropdown: boolean;
  setShowSucursalDropdown: (val: boolean) => void;
  updateCartQty: (productoId: string, text: string) => void;
  updateCartStateQty: (
    producto: Producto,
    state: 'nuevo' | 'usado' | 'por_revisar',
    val: number | ''
  ) => void;
  removeFromCart: (productoId: string) => void;
  handleClearCart: () => void;
  formErrors?: string[];
  setFormErrors?: React.Dispatch<React.SetStateAction<string[]>>;
  handleConfirmarRetiro: () => void;
  handleProcessSignedRetiro: (signatureBase64: string) => Promise<void>;
}

export default function RetiroCartDrawer({
  themeColors,
  cart,
  cartModalVisible,
  setCartModalVisible,
  stateModalProduct,
  setStateModalProduct,
  signatureModalVisible,
  setSignatureModalVisible,
  isSubmitting,
  motivoRetiro,
  setMotivoRetiro,
  tipoGasto,
  setTipoGasto,
  detalleServicioProyecto,
  setDetalleServicioProyecto,
  clientes,
  sucursalesCliente,
  selectedCliente,
  setSelectedCliente,
  setSelectedClienteId,
  clienteSearch,
  setClienteSearch,
  showCliDropdown,
  setShowCliDropdown,
  sucursal,
  setSucursal,
  setSelectedSucursalId,
  sucursalSearch,
  setSucursalSearch,
  showSucursalDropdown,
  setShowSucursalDropdown,
  updateCartQty,
  updateCartStateQty,
  removeFromCart,
  handleClearCart,
  formErrors = [],
  setFormErrors,
  handleConfirmarRetiro,
  handleProcessSignedRetiro,
}: RetiroCartDrawerProps) {
  const insets = useSafeAreaInsets();
  return (
    <>
      {/* MODAL DE CARRITO Y CONFIRMACIÓN */}
      <Modal
        statusBarTranslucent={true}
        visible={cartModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setCartModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.modalOverlay, { paddingTop: Math.max(insets.top, 24) }]}
        >
          <View style={[styles.modalContent, { backgroundColor: themeColors.backgroundElement }]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: themeColors.text }}>
                  Confirmar Retiro de Material
                </Text>
                <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>
                  Verifica materiales y datos de asignación
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {cart.length > 0 && (
                  <TouchableOpacity
                    onPress={handleClearCart}
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6,
                      backgroundColor: themeColors.danger + '15',
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.danger }}>
                      Vaciar
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setCartModalVisible(false)} style={{ padding: 4 }}>
                  <Ionicons name="close" size={24} color={themeColors.text} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              style={{ padding: Spacing.three }}
              nestedScrollEnabled={true}
              keyboardShouldPersistTaps="handled"
            >
              {cart.length === 0 ? (
                <Text
                  style={{
                    color: themeColors.textSecondary,
                    textAlign: 'center',
                    marginTop: 20,
                  }}
                >
                  No has seleccionado ningún material.
                </Text>
              ) : (
                <>
                  {/* SECCIÓN 1: MATERIALES */}
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '700',
                      color: themeColors.text,
                      marginBottom: Spacing.one,
                    }}
                  >
                    Materiales a Retirar ({cart.length})
                  </Text>
                  <View
                    style={{
                      backgroundColor: themeColors.background,
                      borderRadius: 12,
                      padding: Spacing.two,
                      borderWidth: 1,
                      borderColor: themeColors.border,
                      marginBottom: Spacing.three,
                    }}
                  >
                    {cart.map((item) => {
                      const unit = getProductoUnidad(item.producto);
                      const multiState = hasMultipleStockStates(item.producto);
                      const stockNuevo = getStockNuevo(item.producto);
                      const stockUsado = item.producto.stock_usado || 0;
                      const stockPorRevisar = item.producto.stock_por_revisar || 0;

                      const qNuevo =
                        typeof item.cantidad_nuevo === 'number' ? item.cantidad_nuevo : 0;
                      const qUsado =
                        typeof item.cantidad_usado === 'number' ? item.cantidad_usado : 0;
                      const qPorRev =
                        typeof item.cantidad_por_revisar === 'number'
                          ? item.cantidad_por_revisar
                          : 0;

                      return (
                        <View
                          key={item.producto.id}
                          style={[
                            styles.cartItem,
                            {
                              borderBottomColor: themeColors.border,
                              flexDirection: 'column',
                              alignItems: 'stretch',
                            },
                          ]}
                        >
                          <View
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              alignItems: 'flex-start',
                            }}
                          >
                            <View style={{ flex: 1, paddingRight: 8 }}>
                              <Text
                                style={{
                                  fontSize: 14,
                                  fontWeight: '600',
                                  color: themeColors.text,
                                }}
                              >
                                {decodeHtmlEntities(item.producto.nombre_oficial)}
                              </Text>
                              <Text
                                style={{
                                  fontSize: 11,
                                  color: themeColors.textSecondary,
                                  marginTop: 2,
                                }}
                              >
                                SKU: {item.producto.sku_interno} • Total llevando: {item.cantidad}{' '}
                                {unit}
                              </Text>
                            </View>
                            <TouchableOpacity
                              onPress={() => removeFromCart(item.producto.id)}
                              style={{ padding: 4 }}
                            >
                              <Ionicons
                                name="trash-outline"
                                size={18}
                                color={themeColors.danger}
                              />
                            </TouchableOpacity>
                          </View>

                          {multiState ? (
                            <View
                              style={{
                                marginTop: 8,
                                gap: 6,
                                backgroundColor: themeColors.backgroundElement,
                                padding: 8,
                                borderRadius: 8,
                              }}
                            >
                              {/* Nuevas */}
                              <View
                                style={{
                                  flexDirection: 'row',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                }}
                              >
                                <Text
                                  style={{ fontSize: 12, fontWeight: '600', color: '#059669', flex: 1, marginRight: 6 }}
                                >
                                  🟢 Nuevas (Stock: {stockNuevo})
                                </Text>
                                <View
                                  style={[
                                    styles.stepperContainer,
                                    {
                                      backgroundColor: themeColors.background,
                                      borderColor: themeColors.border,
                                    },
                                  ]}
                                >
                                  <TouchableOpacity
                                    style={[
                                      styles.stepperBtn,
                                      { backgroundColor: themeColors.danger + '18' },
                                    ]}
                                    onPress={() =>
                                      updateCartStateQty(
                                        item.producto,
                                        'nuevo',
                                        Math.max(0, qNuevo - 1)
                                      )
                                    }
                                    disabled={qNuevo <= 0}
                                  >
                                    <Ionicons
                                      name="remove"
                                      size={12}
                                      color={
                                        qNuevo > 0 ? themeColors.danger : themeColors.textSecondary
                                      }
                                    />
                                  </TouchableOpacity>
                                  <TextInput
                                    style={[
                                      styles.stepperInput,
                                      {
                                        color: themeColors.text,
                                        height: 32, width: 38, fontSize: 13, paddingVertical: 0, includeFontPadding: false, textAlignVertical: 'center',
                                      },
                                    ]}
                                    value={String(item.cantidad_nuevo ?? 0)}
                                    keyboardType="decimal-pad"
                                    selectTextOnFocus
                                    onChangeText={(val) =>
                                      updateCartStateQty(
                                        item.producto,
                                        'nuevo',
                                        val === '' ? '' : parseFloat(val) || 0
                                      )
                                    }
                                  />
                                  <TouchableOpacity
                                    style={[
                                      styles.stepperBtn,
                                      { backgroundColor: themeColors.primary + '18' },
                                    ]}
                                    onPress={() =>
                                      updateCartStateQty(item.producto, 'nuevo', qNuevo + 1)
                                    }
                                    disabled={stockNuevo - qNuevo <= 0}
                                  >
                                    <Ionicons
                                      name="add"
                                      size={12}
                                      color={
                                        stockNuevo - qNuevo > 0
                                          ? themeColors.primary
                                          : themeColors.textSecondary
                                      }
                                    />
                                  </TouchableOpacity>
                                </View>
                              </View>

                              {/* Usadas */}
                              {stockUsado > 0 && (
                                <View
                                  style={{
                                    flexDirection: 'row',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                  }}
                                >
                                  <Text
                                    style={{ fontSize: 12, fontWeight: '600', color: '#D97706', flex: 1, marginRight: 6 }}
                                  >
                                    🟡 Usadas (Stock: {stockUsado})
                                  </Text>
                                  <View
                                    style={[
                                      styles.stepperContainer,
                                      {
                                        backgroundColor: themeColors.background,
                                        borderColor: themeColors.border,
                                      },
                                    ]}
                                  >
                                    <TouchableOpacity
                                      style={[
                                        styles.stepperBtn,
                                        { backgroundColor: themeColors.danger + '18' },
                                      ]}
                                      onPress={() =>
                                        updateCartStateQty(
                                          item.producto,
                                          'usado',
                                          Math.max(0, qUsado - 1)
                                        )
                                      }
                                      disabled={qUsado <= 0}
                                    >
                                      <Ionicons
                                        name="remove"
                                        size={12}
                                        color={
                                          qUsado > 0
                                            ? themeColors.danger
                                            : themeColors.textSecondary
                                        }
                                      />
                                    </TouchableOpacity>
                                    <TextInput
                                      style={[
                                        styles.stepperInput,
                                        {
                                          color: themeColors.text,
                                          height: 32, width: 38, fontSize: 13, paddingVertical: 0, includeFontPadding: false, textAlignVertical: 'center',
                                        },
                                      ]}
                                      value={String(item.cantidad_usado ?? 0)}
                                      keyboardType="decimal-pad"
                                      selectTextOnFocus
                                      onChangeText={(val) =>
                                        updateCartStateQty(
                                          item.producto,
                                          'usado',
                                          val === '' ? '' : parseFloat(val) || 0
                                        )
                                      }
                                    />
                                    <TouchableOpacity
                                      style={[
                                        styles.stepperBtn,
                                        { backgroundColor: themeColors.primary + '18' },
                                      ]}
                                      onPress={() =>
                                        updateCartStateQty(item.producto, 'usado', qUsado + 1)
                                      }
                                      disabled={stockUsado - qUsado <= 0}
                                    >
                                      <Ionicons
                                        name="add"
                                        size={12}
                                        color={
                                          stockUsado - qUsado > 0
                                            ? themeColors.primary
                                            : themeColors.textSecondary
                                        }
                                      />
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              )}

                              {/* Dañado / Incompleto */}
                              {stockPorRevisar > 0 && (
                                <View
                                  style={{
                                    flexDirection: 'row',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                  }}
                                >
                                  <Text
                                    style={{ fontSize: 12, fontWeight: '600', color: themeColors.danger, flex: 1, marginRight: 6 }}
                                  >
                                    🔴 Dañado/Incompleto (Stock: {stockPorRevisar})
                                  </Text>
                                  <View
                                    style={[
                                      styles.stepperContainer,
                                      {
                                        backgroundColor: themeColors.background,
                                        borderColor: themeColors.border,
                                      },
                                    ]}
                                  >
                                    <TouchableOpacity
                                      style={[
                                        styles.stepperBtn,
                                        { backgroundColor: themeColors.danger + '18' },
                                      ]}
                                      onPress={() =>
                                        updateCartStateQty(
                                          item.producto,
                                          'por_revisar',
                                          Math.max(0, qPorRev - 1)
                                        )
                                      }
                                      disabled={qPorRev <= 0}
                                    >
                                      <Ionicons
                                        name="remove"
                                        size={12}
                                        color={
                                          qPorRev > 0
                                            ? themeColors.danger
                                            : themeColors.textSecondary
                                        }
                                      />
                                    </TouchableOpacity>
                                    <TextInput
                                      style={[
                                        styles.stepperInput,
                                        {
                                          color: themeColors.text,
                                          height: 32, width: 38, fontSize: 13, paddingVertical: 0, includeFontPadding: false, textAlignVertical: 'center',
                                        },
                                      ]}
                                      value={String(item.cantidad_por_revisar ?? 0)}
                                      keyboardType="decimal-pad"
                                      selectTextOnFocus
                                      onChangeText={(val) =>
                                        updateCartStateQty(
                                          item.producto,
                                          'por_revisar',
                                          val === '' ? '' : parseFloat(val) || 0
                                        )
                                      }
                                    />
                                    <TouchableOpacity
                                      style={[
                                        styles.stepperBtn,
                                        { backgroundColor: themeColors.primary + '18' },
                                      ]}
                                      onPress={() =>
                                        updateCartStateQty(
                                          item.producto,
                                          'por_revisar',
                                          qPorRev + 1
                                        )
                                      }
                                      disabled={stockPorRevisar - qPorRev <= 0}
                                    >
                                      <Ionicons
                                        name="add"
                                        size={12}
                                        color={
                                          stockPorRevisar - qPorRev > 0
                                            ? themeColors.primary
                                            : themeColors.textSecondary
                                        }
                                      />
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              )}
                            </View>
                          ) : (
                            <View
                              style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 }}
                            >
                              <View
                                style={[
                                  styles.stepperContainer,
                                  {
                                    backgroundColor: themeColors.backgroundElement,
                                    borderColor: themeColors.border,
                                  },
                                ]}
                              >
                                <TouchableOpacity
                                  style={[
                                    styles.stepperBtn,
                                    { backgroundColor: themeColors.danger + '18' },
                                  ]}
                                  onPress={() => {
                                    const cur = Number(item.cantidad) || 0;
                                    const next = Math.max(0, cur - 1);
                                    if (next === 0) {
                                      removeFromCart(item.producto.id);
                                    } else {
                                      updateCartQty(item.producto.id, String(next));
                                    }
                                  }}
                                >
                                  <Ionicons name="remove" size={14} color={themeColors.danger} />
                                </TouchableOpacity>
                                <TextInput
                                  style={[
                                    styles.stepperInput,
                                    {
                                      color: themeColors.text,
                                      height: 32,
                                      width: 44,
                                      fontSize: 13,
                                      paddingVertical: 0,
                                      includeFontPadding: false,
                                      textAlignVertical: 'center',
                                    },
                                  ]}
                                  value={item.cantidad.toString()}
                                  keyboardType="decimal-pad"
                                  selectTextOnFocus
                                  onChangeText={(val) => updateCartQty(item.producto.id, val)}
                                />
                                <TouchableOpacity
                                  style={[
                                    styles.stepperBtn,
                                    { backgroundColor: themeColors.primary + '18' },
                                  ]}
                                  disabled={(Number(item.cantidad) || 0) >= getTotalStock(item.producto)}
                                  onPress={() =>
                                    updateCartQty(
                                      item.producto.id,
                                      String((Number(item.cantidad) || 0) + 1)
                                    )
                                  }
                                >
                                  <Ionicons
                                    name="add"
                                    size={14}
                                    color={
                                      (Number(item.cantidad) || 0) < getTotalStock(item.producto)
                                        ? themeColors.primary
                                        : themeColors.textSecondary
                                    }
                                  />
                                </TouchableOpacity>
                              </View>
                              <Text
                                style={{
                                  color: themeColors.textSecondary,
                                  fontSize: 13,
                                  fontWeight: '700',
                                }}
                              >
                                {unit}
                              </Text>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>

                  {/* SECCIÓN 2: CAMPOS DE ASIGNACIÓN */}
                  {formErrors.length > 0 && (
                    <View
                      style={{
                        backgroundColor: themeColors.danger + '18',
                        borderColor: themeColors.danger,
                        borderWidth: 1.5,
                        borderRadius: 8,
                        padding: 12,
                        marginBottom: Spacing.two,
                        gap: 4,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="alert-circle" size={18} color="#DC2626" />
                        <Text style={{ color: themeColors.danger, fontWeight: 'bold', fontSize: 13 }}>
                          Campos obligatorios incompletos:
                        </Text>
                      </View>
                      {formErrors.map((err, idx) => (
                        <Text key={idx} style={{ color: themeColors.danger, fontSize: 12, marginLeft: 24, fontWeight: '500' }}>
                          • {err}
                        </Text>
                      ))}
                    </View>
                  )}
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '700',
                      color: themeColors.text,
                      marginBottom: Spacing.two,
                    }}
                  >
                    Detalles de Asignación y Destino
                  </Text>

                  {/* 1. Tipo de Gasto / Destino */}
                  <View style={{ marginBottom: Spacing.two }}>
                    <Text
                      style={{
                        color: themeColors.text,
                        marginBottom: Spacing.half,
                        fontWeight: '600',
                        fontSize: 13,
                      }}
                    >
                      Tipo de Gasto / Destino *
                    </Text>
                    <View style={{ flexDirection: 'row', gap: Spacing.one }}>
                      {(['Servicio', 'Proyecto', 'Venta', 'Operativo'] as const).map((tipo) => {
                        const isSelected = tipoGasto === tipo;
                        return (
                          <TouchableOpacity
                            key={tipo}
                            style={{
                              flex: 1,
                              paddingVertical: 10,
                              borderRadius: BorderRadius.medium,
                              borderWidth: 1.5,
                              borderColor: isSelected ? themeColors.primary : themeColors.border,
                              backgroundColor: isSelected
                                ? themeColors.primary + '20'
                                : themeColors.background,
                              alignItems: 'center',
                            }}
                            onPress={() => setTipoGasto(tipo)}
                          >
                            <Text
                              style={{
                                color: isSelected
                                  ? themeColors.primary
                                  : themeColors.textSecondary,
                                fontWeight: isSelected ? '700' : '500',
                                fontSize: 13,
                              }}
                            >
                              {tipo}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* 3. Detalle de Servicio o Proyecto */}
                  <View style={{ marginBottom: Spacing.two }}>
                    <CustomInput
                      label="Detalle de Servicio o Proyecto *"
                      placeholder="Escribe el nombre o texto libre..."
                      value={detalleServicioProyecto}
                      onChangeText={setDetalleServicioProyecto}
                      iconName="briefcase-outline"
                    />
                  </View>

                  {/* Cliente Relacionado */}
                  <View style={[styles.customDropdownContainer, { marginBottom: Spacing.two }]}>
                    <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>
                      Cliente Relacionado *
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.dropdownTrigger,
                        {
                          backgroundColor: themeColors.background,
                          borderColor: themeColors.border,
                        },
                      ]}
                      onPress={() => {
                        Keyboard.dismiss();
                        setShowCliDropdown(!showCliDropdown);
                        setShowSucursalDropdown(false);
                      }}
                    >
                      <Ionicons
                        name="person-outline"
                        size={18}
                        color={themeColors.textSecondary}
                        style={{ marginRight: 6 }}
                      />
                      <Text
                        style={{
                          flex: 1,
                          color: selectedCliente ? themeColors.text : themeColors.textSecondary,
                        }}
                      >
                        {selectedCliente || 'Selecciona un cliente'}
                      </Text>
                      <Ionicons
                        name={showCliDropdown ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={themeColors.text}
                      />
                    </TouchableOpacity>

                    {showCliDropdown && (
                      <Pressable
                        onPress={(e) => e.stopPropagation()}
                        style={{ width: '100%', zIndex: 1000, marginTop: 4 }}
                      >
                        <View
                          style={[
                            styles.dropdownList,
                            {
                              backgroundColor: themeColors.background,
                              borderColor: themeColors.border,
                            },
                          ]}
                        >
                          <TextInput
                            placeholder="Buscar cliente..."
                            placeholderTextColor={themeColors.textSecondary}
                            value={clienteSearch}
                            onChangeText={setClienteSearch}
                            style={[
                              styles.textInput,
                              {
                                height: 38,
                                marginBottom: 6,
                                backgroundColor: themeColors.backgroundElement,
                                color: themeColors.text,
                                borderColor: themeColors.border,
                              },
                            ]}
                          />
                          <ScrollView
                            nestedScrollEnabled={true}
                            style={{ maxHeight: 200 }}
                            keyboardShouldPersistTaps="handled"
                          >
                            {clientes
                              .filter(
                                (cli) =>
                                  !clienteSearch ||
                                  (cli.nombre &&
                                    cli.nombre.toLowerCase().includes(clienteSearch.toLowerCase()))
                              )
                              .map((cli) => (
                                <TouchableOpacity
                                  key={cli.id}
                                  style={[
                                    styles.dropdownItem,
                                    { borderBottomColor: themeColors.border },
                                  ]}
                                  onPress={() => {
                                    setSelectedCliente(cli.nombre);
                                    setSelectedClienteId(cli.id);
                                    const cliSucs = sucursalesCliente.filter(
                                      (s) => s.cliente_id === cli.id
                                    );
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
                                  <Text style={{ color: themeColors.text, fontWeight: '500' }}>
                                    {cli.nombre}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                          </ScrollView>
                        </View>
                      </Pressable>
                    )}
                  </View>

                  {/* Sucursal del cliente */}
                  <View style={[styles.customDropdownContainer, { marginBottom: Spacing.two }]}>
                    <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>
                      Sucursal del cliente *
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.dropdownTrigger,
                        {
                          backgroundColor: themeColors.background,
                          borderColor: themeColors.border,
                          opacity: !selectedCliente ? 0.6 : 1,
                        },
                      ]}
                      disabled={!selectedCliente}
                      onPress={() => {
                        Keyboard.dismiss();
                        setShowSucursalDropdown(!showSucursalDropdown);
                        setShowCliDropdown(false);
                      }}
                    >
                      <Ionicons
                        name="location-outline"
                        size={18}
                        color={themeColors.textSecondary}
                        style={{ marginRight: 6 }}
                      />
                      <Text
                        style={{
                          flex: 1,
                          color: sucursal ? themeColors.text : themeColors.textSecondary,
                        }}
                      >
                        {sucursal ||
                          (selectedCliente
                            ? 'Selecciona una sucursal'
                            : 'Selecciona un cliente primero')}
                      </Text>
                      <Ionicons
                        name={showSucursalDropdown ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={themeColors.text}
                      />
                    </TouchableOpacity>

                    {showSucursalDropdown && selectedCliente && (
                      <Pressable
                        onPress={(e) => e.stopPropagation()}
                        style={{ width: '100%', zIndex: 1000, marginTop: 4 }}
                      >
                        <View
                          style={[
                            styles.dropdownList,
                            {
                              backgroundColor: themeColors.background,
                              borderColor: themeColors.border,
                            },
                          ]}
                        >
                          <TextInput
                            placeholder="Buscar sucursal..."
                            placeholderTextColor={themeColors.textSecondary}
                            value={sucursalSearch}
                            onChangeText={setSucursalSearch}
                            style={[
                              styles.textInput,
                              {
                                height: 38,
                                marginBottom: 6,
                                backgroundColor: themeColors.backgroundElement,
                                color: themeColors.text,
                                borderColor: themeColors.border,
                              },
                            ]}
                          />
                          <ScrollView
                            nestedScrollEnabled={true}
                            style={{ maxHeight: 180 }}
                            keyboardShouldPersistTaps="handled"
                          >
                            <TouchableOpacity
                              style={[
                                styles.dropdownItem,
                                { borderBottomColor: themeColors.border },
                              ]}
                              onPress={() => {
                                setSucursal('');
                                setSelectedSucursalId(null);
                                setShowSucursalDropdown(false);
                              }}
                            >
                              <Text style={{ color: themeColors.danger, fontWeight: '600' }}>
                                Sin sucursal (Dejar en blanco)
                              </Text>
                            </TouchableOpacity>
                            {(() => {
                              const currentCliente = clientes.find(
                                (c) =>
                                  c.nombre?.trim().toLowerCase() ===
                                  selectedCliente?.trim().toLowerCase()
                              );
                              const filteredSucs = currentCliente
                                ? sucursalesCliente.filter(
                                    (s) =>
                                      s.cliente_id === currentCliente.id &&
                                      (!sucursalSearch ||
                                        s.nombre
                                          .toLowerCase()
                                          .includes(sucursalSearch.toLowerCase()))
                                  )
                                : [];

                              return filteredSucs.map((suc) => (
                                <TouchableOpacity
                                  key={suc.id}
                                  style={[
                                    styles.dropdownItem,
                                    { borderBottomColor: themeColors.border },
                                  ]}
                                  onPress={() => {
                                    setSucursal(suc.nombre);
                                    setSelectedSucursalId(suc.id);
                                    setSucursalSearch('');
                                    setShowSucursalDropdown(false);
                                  }}
                                >
                                  <Text style={{ color: themeColors.text, fontWeight: '500' }}>
                                    {suc.nombre}
                                  </Text>
                                </TouchableOpacity>
                              ));
                            })()}
                          </ScrollView>
                        </View>
                      </Pressable>
                    )}
                  </View>

                  {/* Motivo o Referencia del Retiro */}
                  <View style={{ marginBottom: Spacing.four, marginTop: Spacing.one }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: themeColors.text,
                        marginBottom: Spacing.half,
                      }}
                    >
                      Motivo o Referencia del Retiro *
                    </Text>
                    <TextInput
                      style={[
                        styles.textInput,
                        {
                          backgroundColor: themeColors.background,
                          color: themeColors.text,
                          borderColor: themeColors.border,
                        },
                      ]}
                      placeholder="Ej. Proyecto Alpha, Reparación torre norte, Mantenimiento..."
                      placeholderTextColor={themeColors.textSecondary}
                      value={motivoRetiro}
                      onChangeText={setMotivoRetiro}
                    />
                  </View>
                </>
              )}
            </ScrollView>

            <View
              style={[
                styles.modalFooter,
                {
                  borderTopColor: themeColors.border,
                  paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 34 : Spacing.three),
                },
              ]}
            >
              <CustomButton
                title="Cerrar"
                variant="secondary"
                onPress={() => setCartModalVisible(false)}
                style={{ flex: 1, marginRight: Spacing.one }}
              />
              <CustomButton
                title="Firmar y Retirar Material"
                icon="create-outline"
                variant="primary"
                onPress={handleConfirmarRetiro}
                loading={isSubmitting}
                style={{ flex: 2 }}
                disabled={cart.length === 0}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL SELECTOR DE CANTIDADES POR ESTADO */}
      <Modal
        statusBarTranslucent={true}
        visible={stateModalProduct !== null}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setStateModalProduct(null)}
      >
        <View style={[styles.modalOverlay, { paddingTop: Math.max(insets.top, 24) }]}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: themeColors.backgroundElement, maxHeight: '80%' },
            ]}
          >
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: themeColors.text }}>
                  Seleccionar Cantidades por Estado
                </Text>
                <Text
                  style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}
                  numberOfLines={1}
                >
                  {decodeHtmlEntities(stateModalProduct?.nombre_oficial)}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setStateModalProduct(null)}>
                <Ionicons name="close" size={22} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            {stateModalProduct &&
              (() => {
                const prod = stateModalProduct;
                const unit = getProductoUnidad(prod);
                const cartItem = cart.find((c) => c.producto.id === prod.id);
                const stockNuevo = getStockNuevo(prod);
                const stockUsado = prod.stock_usado || 0;
                const stockPorRevisar = prod.stock_por_revisar || 0;

                const qNuevo =
                  typeof cartItem?.cantidad_nuevo === 'number' ? cartItem.cantidad_nuevo : 0;
                const qUsado =
                  typeof cartItem?.cantidad_usado === 'number' ? cartItem.cantidad_usado : 0;
                const qPorRev =
                  typeof cartItem?.cantidad_por_revisar === 'number'
                    ? cartItem.cantidad_por_revisar
                    : 0;
                const totalLlevando =
                  typeof cartItem?.cantidad === 'number' ? cartItem.cantidad : 0;

                return (
                  <View style={{ padding: Spacing.three }}>
                    <View
                      style={{
                        marginBottom: 12,
                        backgroundColor: themeColors.background,
                        padding: 10,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: themeColors.border,
                      }}
                    >
                      <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                        SKU:{' '}
                        <Text style={{ color: themeColors.text, fontWeight: '600' }}>
                          {prod.sku_interno}
                        </Text>
                      </Text>
                      <Text
                        style={{
                          fontSize: 12,
                          color: themeColors.textSecondary,
                          marginTop: 2,
                        }}
                      >
                        Stock Total Disponible:{' '}
                        <Text style={{ color: themeColors.primary, fontWeight: 'bold' }}>
                          {getTotalStock(prod)} {unit}
                        </Text>
                      </Text>
                    </View>

                    <View style={{ gap: 10 }}>
                      {/* Nuevas */}
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          backgroundColor: themeColors.background,
                          padding: 10,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: themeColors.border,
                        }}
                      >
                        <View style={{ flex: 1, paddingRight: 8, minWidth: 0 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#059669' }}>
                            🟢 Nuevas
                          </Text>
                          <Text
                            style={{
                              fontSize: 11,
                              color: themeColors.textSecondary,
                              marginTop: 2,
                            }}
                          >
                            Disponibles: {stockNuevo} {unit}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.stepperContainer,
                            {
                              backgroundColor: themeColors.backgroundElement,
                              borderColor: themeColors.border,
                            },
                          ]}
                        >
                          <TouchableOpacity
                            style={[
                              styles.stepperBtn,
                              { backgroundColor: themeColors.danger + '18' },
                            ]}
                            onPress={() =>
                              updateCartStateQty(prod, 'nuevo', Math.max(0, qNuevo - 1))
                            }
                            disabled={qNuevo <= 0}
                          >
                            <Ionicons
                              name="remove"
                              size={16}
                              color={qNuevo > 0 ? themeColors.danger : themeColors.textSecondary}
                            />
                          </TouchableOpacity>
                          <TextInput
                            style={[styles.stepperInput, { color: themeColors.text }]}
                            value={String(
                              cartItem?.cantidad_nuevo !== undefined ? cartItem.cantidad_nuevo : 0
                            )}
                            keyboardType="decimal-pad"
                            selectTextOnFocus
                            onChangeText={(val) =>
                              updateCartStateQty(
                                prod,
                                'nuevo',
                                val === '' ? '' : parseFloat(val) || 0
                              )
                            }
                          />
                          <TouchableOpacity
                            style={[
                              styles.stepperBtn,
                              { backgroundColor: themeColors.primary + '18' },
                            ]}
                            onPress={() => updateCartStateQty(prod, 'nuevo', qNuevo + 1)}
                            disabled={stockNuevo - qNuevo <= 0}
                          >
                            <Ionicons
                              name="add"
                              size={16}
                              color={
                                stockNuevo - qNuevo > 0
                                  ? themeColors.primary
                                  : themeColors.textSecondary
                              }
                            />
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Usadas */}
                      {stockUsado > 0 && (
                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            backgroundColor: themeColors.background,
                            padding: 10,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: themeColors.border,
                          }}
                        >
                          <View style={{ flex: 1, paddingRight: 8, minWidth: 0 }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#D97706' }}>
                              🟡 Usadas
                            </Text>
                            <Text
                              style={{
                                fontSize: 11,
                                color: themeColors.textSecondary,
                                marginTop: 2,
                              }}
                            >
                              Disponibles: {stockUsado} {unit}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.stepperContainer,
                              {
                                backgroundColor: themeColors.backgroundElement,
                                borderColor: themeColors.border,
                              },
                            ]}
                          >
                            <TouchableOpacity
                              style={[
                                styles.stepperBtn,
                                { backgroundColor: themeColors.danger + '18' },
                              ]}
                              onPress={() =>
                                updateCartStateQty(prod, 'usado', Math.max(0, qUsado - 1))
                              }
                              disabled={qUsado <= 0}
                            >
                              <Ionicons
                                name="remove"
                                size={16}
                                color={qUsado > 0 ? themeColors.danger : themeColors.textSecondary}
                              />
                            </TouchableOpacity>
                            <TextInput
                              style={[styles.stepperInput, { color: themeColors.text }]}
                              value={String(
                                cartItem?.cantidad_usado !== undefined ? cartItem.cantidad_usado : 0
                              )}
                              keyboardType="decimal-pad"
                              selectTextOnFocus
                              onChangeText={(val) =>
                                updateCartStateQty(
                                  prod,
                                  'usado',
                                  val === '' ? '' : parseFloat(val) || 0
                                )
                              }
                            />
                            <TouchableOpacity
                              style={[
                                styles.stepperBtn,
                                { backgroundColor: themeColors.primary + '18' },
                              ]}
                              onPress={() => updateCartStateQty(prod, 'usado', qUsado + 1)}
                              disabled={stockUsado - qUsado <= 0}
                            >
                              <Ionicons
                                name="add"
                                size={16}
                                color={
                                  stockUsado - qUsado > 0
                                    ? themeColors.primary
                                    : themeColors.textSecondary
                                }
                              />
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}

                      {/* Dañado / Incompleto */}
                      {stockPorRevisar > 0 && (
                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            backgroundColor: themeColors.background,
                            padding: 10,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: themeColors.border,
                          }}
                        >
                          <View style={{ flex: 1, paddingRight: 8, minWidth: 0 }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.danger }}>
                              🔴 Dañado / Incompleto
                            </Text>
                            <Text
                              style={{
                                fontSize: 11,
                                color: themeColors.textSecondary,
                                marginTop: 2,
                              }}
                            >
                              Disponibles: {stockPorRevisar} {unit}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.stepperContainer,
                              {
                                backgroundColor: themeColors.backgroundElement,
                                borderColor: themeColors.border,
                              },
                            ]}
                          >
                            <TouchableOpacity
                              style={[
                                styles.stepperBtn,
                                { backgroundColor: themeColors.danger + '18' },
                              ]}
                              onPress={() =>
                                updateCartStateQty(prod, 'por_revisar', Math.max(0, qPorRev - 1))
                              }
                              disabled={qPorRev <= 0}
                            >
                              <Ionicons
                                name="remove"
                                size={16}
                                color={
                                  qPorRev > 0 ? themeColors.danger : themeColors.textSecondary
                                }
                              />
                            </TouchableOpacity>
                            <TextInput
                              style={[styles.stepperInput, { color: themeColors.text }]}
                              value={String(
                                cartItem?.cantidad_por_revisar !== undefined
                                  ? cartItem.cantidad_por_revisar
                                  : 0
                              )}
                              keyboardType="decimal-pad"
                              selectTextOnFocus
                              onChangeText={(val) =>
                                updateCartStateQty(
                                  prod,
                                  'por_revisar',
                                  val === '' ? '' : parseFloat(val) || 0
                                )
                              }
                            />
                            <TouchableOpacity
                              style={[
                                styles.stepperBtn,
                                { backgroundColor: themeColors.primary + '18' },
                              ]}
                              onPress={() => updateCartStateQty(prod, 'por_revisar', qPorRev + 1)}
                              disabled={stockPorRevisar - qPorRev <= 0}
                            >
                              <Ionicons
                                name="add"
                                size={16}
                                color={
                                  stockPorRevisar - qPorRev > 0
                                    ? themeColors.primary
                                    : themeColors.textSecondary
                                }
                              />
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>

                    <View
                      style={{
                        marginTop: 14,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingVertical: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '600',
                          color: themeColors.textSecondary,
                        }}
                      >
                        Total seleccionado:
                      </Text>
                      <Text
                        style={{ fontSize: 16, fontWeight: '800', color: themeColors.primary }}
                      >
                        {totalLlevando} {unit}
                      </Text>
                    </View>
                  </View>
                );
              })()}

            <View
              style={[
                styles.modalFooter,
                {
                  borderTopColor: themeColors.border,
                  paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 34 : Spacing.three),
                },
              ]}
            >
              {cart.some((c) => c.producto.id === stateModalProduct?.id) && (
                <CustomButton
                  title="Quitar todo"
                  variant="danger"
                  onPress={() => {
                    if (stateModalProduct) removeFromCart(stateModalProduct.id);
                    setStateModalProduct(null);
                  }}
                  style={{ flex: 1, marginRight: Spacing.one }}
                />
              )}
              <CustomButton
                title="Listo"
                variant="primary"
                onPress={() => setStateModalProduct(null)}
                style={{ flex: 2 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL DE FIRMA DIGITAL Y RESPONSIVA */}
      <SignatureCanvasModal
        visible={signatureModalVisible}
        onClose={() => {
          setSignatureModalVisible(false);
          setCartModalVisible(true);
        }}
        onConfirm={handleProcessSignedRetiro}
        titulo="Firma de Carta Responsiva y Retiro"
        subtitulo="Compromiso de custodia: Al firmar, manifiesto recibir los materiales en buen estado y asumo la responsabilidad de su resguardo, uso debido y devolución conforme a las políticas de la empresa."
      />
    </>
  );
}
