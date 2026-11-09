import React from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Modal,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, BorderRadius } from '@/constants/theme';
import { GastoHelper } from '@/services/supabase';
import CustomButton from '@/components/CustomButton';
import CustomInput from '@/components/CustomInput';
import { useAdminGastos, TIPOS_PROYECTO } from '../hooks/useAdminGastos';

interface AdminGastoQuickEditModalsProps {
  vm: ReturnType<typeof useAdminGastos>;
}

export function AdminGastoQuickEditModals({ vm }: AdminGastoQuickEditModalsProps) {
  const {
    themeColors,
    selectedGasto,
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
    handleSelectQuickProveedor,
    handleQuickCreateProveedorAndAssign,
    handleSaveQuickField,
    formatCurrency,
    formatFriendlyDate,
    parseJustificacion,
  } = vm;

  return (
    <>
      {/* MODAL DE EDICIÓN / ASIGNACIÓN RÁPIDA DE PROVEEDOR */}
      <Modal
        animationType="fade"
        transparent={true}
        statusBarTranslucent={true}
        visible={quickEditProvModalVisible}
        onRequestClose={() => {
          if (!isSavingQuickProv) setQuickEditProvModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.65)', justifyContent: 'center', alignItems: 'center', padding: Spacing.three }}>
            <View style={{
              backgroundColor: themeColors.background,
              width: '100%',
              maxWidth: 500,
              height: '82%',
              maxHeight: 650,
              borderRadius: BorderRadius.large,
              padding: Spacing.three,
              borderWidth: 1,
              borderColor: themeColors.border,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.3,
              shadowRadius: 20,
              elevation: 10,
              flexDirection: 'column',
            }}>
              {/* Header */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: Spacing.two, borderBottomWidth: 1, borderBottomColor: themeColors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: themeColors.accent + '20', justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="business" size={18} color={themeColors.accent} />
                  </View>
                  <View>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: themeColors.text }}>Asignar Proveedor</Text>
                    <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>Gasto: {selectedGasto ? formatCurrency(selectedGasto.monto) : ''}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => setQuickEditProvModalVisible(false)}
                  disabled={isSavingQuickProv}
                  style={{ padding: 4 }}
                >
                  <Ionicons name="close-circle" size={24} color={themeColors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Sugerencia del empleado (si existe) */}
              {(() => {
                const parsed = parseJustificacion(selectedGasto?.justificacion);
                if (parsed.proveedorSugerido) {
                  return (
                    <View style={{
                      backgroundColor: themeColors.accent + '15',
                      borderColor: themeColors.accent + '40',
                      borderWidth: 1,
                      borderRadius: BorderRadius.medium,
                      padding: Spacing.two,
                      marginTop: Spacing.two,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.accent, textTransform: 'uppercase' }}>
                          💡 Sugerido por empleado:
                        </Text>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: themeColors.text, marginTop: 1 }}>
                          {parsed.proveedorSugerido}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleQuickCreateProveedorAndAssign(parsed.proveedorSugerido!)}
                        disabled={isSavingQuickProv}
                        style={{
                          backgroundColor: themeColors.accent,
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: BorderRadius.small,
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>
                          ⚡ Usar este
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                }
                return null;
              })()}

              {/* Buscador */}
              <View style={{ marginTop: Spacing.two, marginBottom: Spacing.two }}>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: themeColors.backgroundElement,
                  borderWidth: 1,
                  borderColor: themeColors.border,
                  borderRadius: BorderRadius.medium,
                  paddingHorizontal: Spacing.two,
                  height: 44,
                  gap: 8,
                }}>
                  <Ionicons name="search-outline" size={18} color={themeColors.textSecondary} />
                  <TextInput
                    style={{ flex: 1, color: themeColors.text, fontSize: 14 }}
                    placeholder="Buscar o escribir nombre de proveedor..."
                    placeholderTextColor={themeColors.textSecondary + '90'}
                    value={quickEditProvSearch}
                    onChangeText={setQuickEditProvSearch}
                    autoCapitalize="words"
                  />
                  {quickEditProvSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setQuickEditProvSearch('')} style={{ padding: 4 }}>
                      <Ionicons name="close" size={18} color={themeColors.textSecondary} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Botón de Crear Nuevo Proveedor si no existe */}
              {quickEditProvSearch.trim().length > 0 &&
                !proveedoresCatalog.some(p => p.nombre && p.nombre.toLowerCase() === quickEditProvSearch.trim().toLowerCase()) && (
                  <TouchableOpacity
                    onPress={() => {
                      setNewQuickProvName(quickEditProvSearch.trim());
                      setShowNewProvInQuickModal(true);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      backgroundColor: themeColors.success + '15',
                      borderWidth: 1,
                      borderColor: themeColors.success + '40',
                      borderRadius: BorderRadius.medium,
                      padding: Spacing.two,
                      marginBottom: Spacing.two,
                    }}
                  >
                    <Ionicons name="add-circle" size={22} color={themeColors.success} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: themeColors.success, fontWeight: '800', fontSize: 13 }}>
                        + Registrar y asignar &quot;{quickEditProvSearch.trim()}&quot;
                      </Text>
                      <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>
                        Se agregará al catálogo maestro y se asignará al gasto
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}

              {/* Mini formulario para agregar nuevo proveedor con RFC */}
              {showNewProvInQuickModal && (
                <View style={{
                  backgroundColor: themeColors.backgroundElement,
                  borderRadius: BorderRadius.medium,
                  padding: Spacing.two,
                  borderWidth: 1,
                  borderColor: themeColors.primary,
                  marginBottom: Spacing.two,
                  gap: Spacing.one,
                }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.primary }}>
                    Nuevo Proveedor
                  </Text>
                  <CustomInput
                    placeholder="Nombre comercial / Razón Social *"
                    value={newQuickProvName}
                    onChangeText={setNewQuickProvName}
                    style={{ height: 40 }}
                  />
                  <CustomInput
                    placeholder="RFC (Opcional)"
                    value={newQuickProvRfc}
                    onChangeText={t => setNewQuickProvRfc(t.toUpperCase())}
                    autoCapitalize="characters"
                    style={{ height: 40 }}
                  />
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                    <CustomButton
                      title="Cancelar"
                      variant="secondary"
                      onPress={() => setShowNewProvInQuickModal(false)}
                      style={{ flex: 1, height: 36 }}
                    />
                    <CustomButton
                      title="Guardar y Asignar"
                      variant="primary"
                      loading={isSavingQuickProv}
                      onPress={() => handleQuickCreateProveedorAndAssign(newQuickProvName, newQuickProvRfc)}
                      style={{ flex: 1.5, height: 36 }}
                    />
                  </View>
                </View>
              )}

              {/* Lista de Proveedores */}
              <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.textSecondary, textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 }}>
                Proveedores Registrados ({proveedoresCatalog.filter(p => !quickEditProvSearch || (p.nombre && p.nombre.toLowerCase().includes(quickEditProvSearch.toLowerCase()))).length})
              </Text>

              <View style={{ flex: 1, minHeight: 100 }}>
                <FlatList
                  data={proveedoresCatalog.filter(p => {
                    if (!quickEditProvSearch.trim()) return true;
                    const query = quickEditProvSearch.toLowerCase();
                    const nameMatch = p.nombre && p.nombre.toLowerCase().includes(query);
                    const rfcMatch = p.rfc && p.rfc.toLowerCase().includes(query);
                    return nameMatch || rfcMatch;
                  })}
                  keyExtractor={(item) => item.id}
                  keyboardShouldPersistTaps="handled"
                  style={{ flex: 1 }}
                  contentContainerStyle={{ gap: 6, paddingBottom: Spacing.two }}
                  renderItem={({ item }) => {
                    const isCurrent = (selectedGasto?.proveedor_id === item.id) ||
                      (GastoHelper.getProveedor(selectedGasto)?.toLowerCase() === item.nombre?.toLowerCase());

                    return (
                      <TouchableOpacity
                        onPress={() => handleSelectQuickProveedor(item)}
                        disabled={isSavingQuickProv}
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          paddingVertical: 10,
                          paddingHorizontal: 12,
                          borderRadius: BorderRadius.medium,
                          backgroundColor: isCurrent ? themeColors.accent + '20' : themeColors.backgroundElement,
                          borderWidth: 1,
                          borderColor: isCurrent ? themeColors.accent : themeColors.border,
                        }}
                      >
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={{
                            fontSize: 14,
                            fontWeight: isCurrent ? '800' : '600',
                            color: isCurrent ? themeColors.accent : themeColors.text,
                          }}>
                            {item.nombre}
                          </Text>
                          {item.rfc ? (
                            <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 1 }}>
                              RFC: {item.rfc}
                            </Text>
                          ) : null}
                        </View>
                        {isCurrent ? (
                          <Ionicons name="checkmark-circle" size={20} color={themeColors.accent} />
                        ) : (
                          <Ionicons name="chevron-forward" size={16} color={themeColors.textSecondary} />
                        )}
                      </TouchableOpacity>
                    );
                  }}
                  ListEmptyComponent={
                    <View style={{ padding: Spacing.three, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="alert-circle-outline" size={32} color={themeColors.textSecondary} />
                      <Text style={{ color: themeColors.textSecondary, fontSize: 13, marginTop: 6, textAlign: 'center' }}>
                        No se encontraron proveedores que coincidan con la búsqueda.
                      </Text>
                    </View>
                  }
                />
              </View>

              {/* Footer con opción de dejar sin proveedor */}
              <View style={{ paddingTop: Spacing.two, borderTopWidth: 1, borderTopColor: themeColors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                {GastoHelper.getProveedor(selectedGasto) ? (
                  <TouchableOpacity
                    onPress={() => {
                      if (Platform.OS === 'web') {
                        if (window.confirm('¿Deseas desasignar el proveedor de este gasto?')) {
                          handleSelectQuickProveedor(null);
                        }
                      } else {
                        Alert.alert('Desasignar Proveedor', '¿Deseas quitar el proveedor de este gasto?', [
                          { text: 'Cancelar', style: 'cancel' },
                          { text: 'Quitar', style: 'destructive', onPress: () => handleSelectQuickProveedor(null) },
                        ]);
                      }
                    }}
                    disabled={isSavingQuickProv}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 10 }}
                  >
                    <Ionicons name="trash-outline" size={15} color={themeColors.danger} />
                    <Text style={{ color: themeColors.danger, fontSize: 12, fontWeight: '700' }}>
                      Quitar Proveedor
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View />
                )}

                <TouchableOpacity
                  onPress={() => setQuickEditProvModalVisible(false)}
                  disabled={isSavingQuickProv}
                  style={{
                    backgroundColor: themeColors.backgroundElement,
                    borderWidth: 1,
                    borderColor: themeColors.border,
                    paddingVertical: 8,
                    paddingHorizontal: 16,
                    borderRadius: BorderRadius.medium,
                  }}
                >
                  <Text style={{ color: themeColors.text, fontWeight: '700', fontSize: 13 }}>Cerrar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL DE EDICIÓN RÁPIDA DE CAMPOS INDIVIDUALES */}
      <Modal
        animationType="fade"
        transparent={true}
        statusBarTranslucent={true}
        visible={quickEditFieldModalVisible}
        onRequestClose={() => {
          if (!isSavingQuickField) setQuickEditFieldModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.65)', justifyContent: 'center', alignItems: 'center', padding: Spacing.three }}>
            <View style={{
              backgroundColor: themeColors.background,
              width: '100%',
              maxWidth: 520,
              maxHeight: '85%',
              borderRadius: BorderRadius.large,
              padding: Spacing.three,
              borderWidth: 1,
              borderColor: themeColors.border,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.3,
              shadowRadius: 20,
              elevation: 10,
              flexDirection: 'column',
            }}>
              {/* Header */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: Spacing.two, borderBottomWidth: 1, borderBottomColor: themeColors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: themeColors.accent + '20', justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons
                      name={
                        quickEditFieldType === 'monto' ? 'cash' :
                        quickEditFieldType === 'fecha' ? 'calendar' :
                        quickEditFieldType === 'categoria' ? 'pricetag' :
                        quickEditFieldType === 'cliente' ? 'business' :
                        quickEditFieldType === 'servicio' ? 'briefcase' :
                        quickEditFieldType === 'pago' ? 'card' : 'chatbubble-ellipses'
                      }
                      size={18}
                      color={themeColors.accent}
                    />
                  </View>
                  <View>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: themeColors.text }}>
                      {
                        quickEditFieldType === 'monto' ? 'Editar Monto' :
                        quickEditFieldType === 'fecha' ? 'Editar Fecha de Gasto' :
                        quickEditFieldType === 'categoria' ? 'Editar Categoría' :
                        quickEditFieldType === 'cliente' ? 'Asignar Cliente y Sucursal' :
                        quickEditFieldType === 'servicio' ? 'Editar Servicio / Proyecto' :
                        quickEditFieldType === 'pago' ? 'Método de Pago y Comentarios' : 'Editar Justificación'
                      }
                    </Text>
                    <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>Gasto #{selectedGasto?.id?.slice(0, 8) || ''}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => setQuickEditFieldModalVisible(false)}
                  disabled={isSavingQuickField}
                  style={{ padding: 4 }}
                >
                  <Ionicons name="close-circle" size={24} color={themeColors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Body */}
              <ScrollView
                style={{ flexGrow: 0, marginVertical: Spacing.two }}
                contentContainerStyle={{ gap: Spacing.two }}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled={true}
              >
                {/* CAMPO: MONTO */}
                {quickEditFieldType === 'monto' && (
                  <View style={{ gap: Spacing.two }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: themeColors.textSecondary, textTransform: 'uppercase' }}>
                      Monto del Gasto ($ MXN):
                    </Text>
                    <CustomInput
                      placeholder="0.00"
                      value={tempMonto}
                      onChangeText={setTempMonto}
                      keyboardType="decimal-pad"
                      style={{ fontSize: 20, fontWeight: '800' }}
                    />
                    <View style={{ backgroundColor: themeColors.backgroundElement, padding: Spacing.two, borderRadius: BorderRadius.small, borderWidth: 1, borderColor: themeColors.border }}>
                      <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                        Vista previa con formato:
                      </Text>
                      <Text style={{ fontSize: 18, fontWeight: '800', color: themeColors.primary, marginTop: 2 }}>
                        {!isNaN(parseFloat(tempMonto)) && parseFloat(tempMonto) > 0 ? formatCurrency(parseFloat(tempMonto)) : '$0.00 MXN'}
                      </Text>
                    </View>
                  </View>
                )}

                {/* CAMPO: FECHA (CALENDARIO) */}
                {quickEditFieldType === 'fecha' && (() => {
                  const monthNames = [
                    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
                  ];
                  const dayNames = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];

                  const firstDayIndex = new Date(calViewYear, calViewMonth, 1).getDay();
                  const totalDaysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();
                  const prevMonthDays = new Date(calViewYear, calViewMonth, 0).getDate();
                  const todayStr = new Date().toISOString().split('T')[0];

                  type CalendarCell = {
                    day: number;
                    dateStr: string;
                    isCurrentMonth: boolean;
                    year: number;
                    month: number;
                  };

                  const cells: CalendarCell[] = [];

                  for (let i = firstDayIndex - 1; i >= 0; i--) {
                    const dayNum = prevMonthDays - i;
                    const prevM = calViewMonth === 0 ? 11 : calViewMonth - 1;
                    const prevY = calViewMonth === 0 ? calViewYear - 1 : calViewYear;
                    const dateStr = `${prevY}-${String(prevM + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                    cells.push({ day: dayNum, dateStr, isCurrentMonth: false, year: prevY, month: prevM });
                  }

                  for (let dayNum = 1; dayNum <= totalDaysInMonth; dayNum++) {
                    const dateStr = `${calViewYear}-${String(calViewMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                    cells.push({ day: dayNum, dateStr, isCurrentMonth: true, year: calViewYear, month: calViewMonth });
                  }

                  const remaining = (7 - (cells.length % 7)) % 7;
                  for (let dayNum = 1; dayNum <= remaining; dayNum++) {
                    const nextM = calViewMonth === 11 ? 0 : calViewMonth + 1;
                    const nextY = calViewMonth === 11 ? calViewYear + 1 : calViewYear;
                    const dateStr = `${nextY}-${String(nextM + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                    cells.push({ day: dayNum, dateStr, isCurrentMonth: false, year: nextY, month: nextM });
                  }

                  const handlePrevMonth = () => {
                    if (calViewMonth === 0) {
                      setCalViewMonth(11);
                      setCalViewYear(prev => prev - 1);
                    } else {
                      setCalViewMonth(prev => prev - 1);
                    }
                  };

                  const handleNextMonth = () => {
                    if (calViewMonth === 11) {
                      setCalViewMonth(0);
                      setCalViewYear(prev => prev + 1);
                    } else {
                      setCalViewMonth(prev => prev + 1);
                    }
                  };

                  const handleSelectToday = () => {
                    const now = new Date();
                    const nowStr = now.toISOString().split('T')[0];
                    setTempFecha(nowStr);
                    setCalViewYear(now.getFullYear());
                    setCalViewMonth(now.getMonth());
                  };

                  const handleSelectYesterday = () => {
                    const d = new Date();
                    d.setDate(d.getDate() - 1);
                    const yestStr = d.toISOString().split('T')[0];
                    setTempFecha(yestStr);
                    setCalViewYear(d.getFullYear());
                    setCalViewMonth(d.getMonth());
                  };

                  return (
                    <View style={{ gap: Spacing.two }}>
                      <View style={{
                        backgroundColor: themeColors.backgroundElement,
                        borderRadius: BorderRadius.medium,
                        padding: Spacing.two,
                        borderWidth: 1,
                        borderColor: themeColors.border,
                        gap: Spacing.one
                      }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.one }}>
                          <TouchableOpacity
                            onPress={handlePrevMonth}
                            style={{
                              padding: 8,
                              borderRadius: BorderRadius.small,
                              backgroundColor: themeColors.background,
                              borderWidth: 1,
                              borderColor: themeColors.border
                            }}
                          >
                            <Ionicons name="chevron-back" size={18} color={themeColors.text} />
                          </TouchableOpacity>

                          <View style={{ alignItems: 'center' }}>
                            <Text style={{ fontSize: 16, fontWeight: '800', color: themeColors.text }}>
                              {monthNames[calViewMonth]} {calViewYear}
                            </Text>
                          </View>

                          <TouchableOpacity
                            onPress={handleNextMonth}
                            style={{
                              padding: 8,
                              borderRadius: BorderRadius.small,
                              backgroundColor: themeColors.background,
                              borderWidth: 1,
                              borderColor: themeColors.border
                            }}
                          >
                            <Ionicons name="chevron-forward" size={18} color={themeColors.text} />
                          </TouchableOpacity>
                        </View>

                        <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 6 }}>
                          {dayNames.map((dName, idx) => (
                            <View key={idx} style={{ flex: 1, alignItems: 'center' }}>
                              <Text style={{
                                fontSize: 11,
                                fontWeight: '700',
                                color: themeColors.textSecondary,
                                textTransform: 'uppercase'
                              }}>
                                {dName}
                              </Text>
                            </View>
                          ))}
                        </View>

                        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                          {cells.map((cell, index) => {
                            const isSelected = cell.dateStr === tempFecha;
                            const isToday = cell.dateStr === todayStr;

                            return (
                              <View key={index} style={{ width: `${100 / 7}%`, padding: 2, alignItems: 'center', justifyContent: 'center' }}>
                                <TouchableOpacity
                                  onPress={() => {
                                    setTempFecha(cell.dateStr);
                                    if (!cell.isCurrentMonth) {
                                      setCalViewYear(cell.year);
                                      setCalViewMonth(cell.month);
                                    }
                                  }}
                                  style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: 18,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: isSelected ? themeColors.primary : 'transparent',
                                    borderWidth: isToday && !isSelected ? 1.5 : 0,
                                    borderColor: themeColors.accent,
                                    opacity: cell.isCurrentMonth ? 1 : 0.35,
                                  }}
                                >
                                  <Text style={{
                                    fontSize: 13,
                                    fontWeight: isSelected ? '800' : (cell.isCurrentMonth ? '600' : '400'),
                                    color: isSelected ? '#ffffff' : (isToday ? themeColors.accent : themeColors.text)
                                  }}>
                                    {cell.day}
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            );
                          })}
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          onPress={handleSelectToday}
                          style={{
                            flex: 1,
                            paddingVertical: 10,
                            borderRadius: BorderRadius.small,
                            backgroundColor: themeColors.backgroundElement,
                            borderWidth: 1,
                            borderColor: themeColors.border,
                            alignItems: 'center',
                            flexDirection: 'row',
                            justifyContent: 'center',
                            gap: 6
                          }}
                        >
                          <Ionicons name="today-outline" size={16} color={themeColors.accent} />
                          <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text }}>Hoy</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={handleSelectYesterday}
                          style={{
                            flex: 1,
                            paddingVertical: 10,
                            borderRadius: BorderRadius.small,
                            backgroundColor: themeColors.backgroundElement,
                            borderWidth: 1,
                            borderColor: themeColors.border,
                            alignItems: 'center',
                            flexDirection: 'row',
                            justifyContent: 'center',
                            gap: 6
                          }}
                        >
                          <Ionicons name="time-outline" size={16} color={themeColors.accent} />
                          <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text }}>Ayer</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={{
                        backgroundColor: themeColors.primary + '15',
                        padding: Spacing.two,
                        borderRadius: BorderRadius.small,
                        borderWidth: 1,
                        borderColor: themeColors.primary + '40',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: Spacing.one
                      }}>
                        <Ionicons name="calendar" size={20} color={themeColors.primary} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.textSecondary, textTransform: 'uppercase' }}>
                            Fecha seleccionada:
                          </Text>
                          <Text style={{ fontSize: 15, fontWeight: '800', color: themeColors.primary, marginTop: 1 }}>
                            {formatFriendlyDate(tempFecha)} ({tempFecha})
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })()}

                {/* CAMPO: CATEGORÍA */}
                {quickEditFieldType === 'categoria' && (
                  <View style={{ gap: Spacing.two }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: themeColors.textSecondary, textTransform: 'uppercase' }}>
                      1. Selecciona la Categoría Principal:
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {categoriasCatalog.map((cat: any) => {
                        const isSelected = tempCatId === cat.id;
                        return (
                          <TouchableOpacity
                            key={cat.id}
                            onPress={() => {
                              setTempCatId(cat.id);
                              const subs = subcategoriasCatalog.filter((s: any) => s.categoria_id === cat.id);
                              if (subs.length > 0) {
                                setTempSubcatId(subs[0].id);
                              } else {
                                setTempSubcatId('');
                              }
                            }}
                            style={{
                              paddingVertical: 8,
                              paddingHorizontal: 12,
                              borderRadius: BorderRadius.medium,
                              backgroundColor: isSelected ? themeColors.primary : themeColors.backgroundElement,
                              borderWidth: 1,
                              borderColor: isSelected ? themeColors.primary : themeColors.border,
                            }}
                          >
                            <Text style={{
                              fontSize: 12,
                              fontWeight: isSelected ? '800' : '600',
                              color: isSelected ? '#ffffff' : themeColors.text
                            }}>
                              {cat.nombre}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <Text style={{ fontSize: 12, fontWeight: '800', color: themeColors.textSecondary, textTransform: 'uppercase', marginTop: Spacing.one }}>
                      2. Selecciona la Subcategoría:
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {subcategoriasCatalog
                        .filter((sub: any) => !tempCatId || sub.categoria_id === tempCatId)
                        .map((sub: any) => {
                          const isSelected = tempSubcatId === sub.id;
                          return (
                            <TouchableOpacity
                              key={sub.id}
                              onPress={() => setTempSubcatId(sub.id)}
                              style={{
                                paddingVertical: 8,
                                paddingHorizontal: 12,
                                borderRadius: BorderRadius.medium,
                                backgroundColor: isSelected ? themeColors.accent : themeColors.backgroundElement,
                                borderWidth: 1,
                                borderColor: isSelected ? themeColors.accent : themeColors.border,
                              }}
                            >
                              <Text style={{
                                fontSize: 12,
                                fontWeight: isSelected ? '800' : '600',
                                color: isSelected ? '#ffffff' : themeColors.text
                              }}>
                                {isSelected ? '✓ ' : ''}{sub.nombre}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      {subcategoriasCatalog.filter((sub: any) => !tempCatId || sub.categoria_id === tempCatId).length === 0 && (
                        <Text style={{ fontSize: 12, color: themeColors.textSecondary, fontStyle: 'italic' }}>
                          No hay subcategorías registradas para esta categoría.
                        </Text>
                      )}
                    </View>
                  </View>
                )}

                {/* CAMPO: CLIENTE Y SUCURSAL */}
                {quickEditFieldType === 'cliente' && (
                  <View style={{ gap: Spacing.two }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: themeColors.textSecondary, textTransform: 'uppercase' }}>
                      Buscar Cliente:
                    </Text>
                    <CustomInput
                      placeholder="Filtrar por nombre de cliente..."
                      value={quickCliSearch}
                      onChangeText={setQuickCliSearch}
                      style={{ height: 40 }}
                    />

                    <TouchableOpacity
                      onPress={() => {
                        setTempCliId('');
                        setTempSucId('');
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingVertical: 6,
                        paddingHorizontal: 10,
                        borderRadius: BorderRadius.small,
                        backgroundColor: !tempCliId ? themeColors.accent + '20' : themeColors.backgroundElement,
                        borderWidth: 1,
                        borderColor: !tempCliId ? themeColors.accent : themeColors.border,
                        alignSelf: 'flex-start'
                      }}
                    >
                      <Ionicons name="close-circle-outline" size={16} color={!tempCliId ? themeColors.accent : themeColors.textSecondary} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: !tempCliId ? themeColors.accent : themeColors.textSecondary }}>
                        Sin Cliente Asignado (General)
                      </Text>
                    </TouchableOpacity>

                    <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.textSecondary, textTransform: 'uppercase' }}>
                      Clientes Disponibles ({clientesCatalog.filter((c: any) => !quickCliSearch.trim() || c.nombre?.toLowerCase().includes(quickCliSearch.toLowerCase())).length})
                    </Text>

                    <View style={{ maxHeight: 180 }}>
                      <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 180 }}>
                        <View style={{ gap: 4 }}>
                          {clientesCatalog
                            .filter((c: any) => !quickCliSearch.trim() || c.nombre?.toLowerCase().includes(quickCliSearch.toLowerCase()))
                            .map((c: any) => {
                              const isSelected = tempCliId === c.id;
                              return (
                                <TouchableOpacity
                                  key={c.id}
                                  onPress={() => {
                                    setTempCliId(c.id);
                                    setTempSucId('');
                                  }}
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    paddingVertical: 8,
                                    paddingHorizontal: 12,
                                    borderRadius: BorderRadius.small,
                                    backgroundColor: isSelected ? themeColors.accent + '20' : themeColors.backgroundElement,
                                    borderWidth: 1,
                                    borderColor: isSelected ? themeColors.accent : themeColors.border,
                                  }}
                                >
                                  <Text style={{ fontSize: 13, fontWeight: isSelected ? '800' : '600', color: isSelected ? themeColors.accent : themeColors.text }}>
                                    {c.nombre}
                                  </Text>
                                  {isSelected && <Ionicons name="checkmark-circle" size={18} color={themeColors.accent} />}
                                </TouchableOpacity>
                              );
                            })}
                        </View>
                      </ScrollView>
                    </View>

                    {tempCliId ? (
                      <View style={{ marginTop: Spacing.one, gap: 6 }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: themeColors.textSecondary, textTransform: 'uppercase' }}>
                          Sucursal del Cliente:
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          <TouchableOpacity
                            onPress={() => setTempSucId('')}
                            style={{
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              borderRadius: BorderRadius.small,
                              backgroundColor: !tempSucId ? themeColors.primary : themeColors.backgroundElement,
                              borderWidth: 1,
                              borderColor: !tempSucId ? themeColors.primary : themeColors.border,
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '700', color: !tempSucId ? '#ffffff' : themeColors.text }}>
                              Sin Sucursal Específica
                            </Text>
                          </TouchableOpacity>
                          {sucursalesCatalog
                            .filter((s: any) => s.cliente_id === tempCliId)
                            .map((s: any) => {
                              const isSelected = tempSucId === s.id;
                              return (
                                <TouchableOpacity
                                  key={s.id}
                                  onPress={() => setTempSucId(s.id)}
                                  style={{
                                    paddingVertical: 6,
                                    paddingHorizontal: 10,
                                    borderRadius: BorderRadius.small,
                                    backgroundColor: isSelected ? themeColors.primary : themeColors.backgroundElement,
                                    borderWidth: 1,
                                    borderColor: isSelected ? themeColors.primary : themeColors.border,
                                  }}
                                >
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#ffffff' : themeColors.text }}>
                                    {isSelected ? '✓ ' : ''}{s.nombre}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                        </View>
                      </View>
                    ) : null}
                  </View>
                )}

                {/* CAMPO: SERVICIO / PROYECTO */}
                {quickEditFieldType === 'servicio' && (
                  <View style={{ gap: Spacing.two }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: themeColors.textSecondary, textTransform: 'uppercase' }}>
                      Tipo de Gasto *:
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {TIPOS_PROYECTO.map(t => {
                        const isSelected = tempTipoProyecto === t;
                        return (
                          <TouchableOpacity
                            key={t}
                            onPress={() => setTempTipoProyecto(t)}
                            style={{
                              flex: 1,
                              paddingVertical: 10,
                              borderRadius: BorderRadius.medium,
                              backgroundColor: isSelected ? themeColors.primary + '20' : themeColors.backgroundElement,
                              borderWidth: 1,
                              borderColor: isSelected ? themeColors.primary : themeColors.border,
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <Text style={{
                              fontSize: 13,
                              fontWeight: isSelected ? '700' : '600',
                              color: isSelected ? themeColors.primary : themeColors.textSecondary
                            }}>
                              {t}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <Text style={{ fontSize: 12, fontWeight: '800', color: themeColors.textSecondary, textTransform: 'uppercase', marginTop: Spacing.one }}>
                      Detalle de Servicio o Proyecto *:
                    </Text>
                    <CustomInput
                      placeholder="Escribe el nombre o texto libre..."
                      value={tempDetalleProyecto}
                      onChangeText={setTempDetalleProyecto}
                      multiline
                      numberOfLines={3}
                      style={{ height: 80 }}
                    />
                  </View>
                )}

                {/* CAMPO: PAGO */}
                {quickEditFieldType === 'pago' && (
                  <View style={{ gap: Spacing.two }}>
                    <View style={{ gap: 6 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text }}>
                        Método de Pago *
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          onPress={() => {
                            setTempMetodoPago('efectivo');
                            setTempTipoTarjeta(null);
                          }}
                          style={{
                            flex: 1,
                            paddingVertical: 12,
                            borderRadius: BorderRadius.medium,
                            backgroundColor: tempMetodoPago === 'efectivo' ? themeColors.accent : themeColors.backgroundElement,
                            borderWidth: 1,
                            borderColor: tempMetodoPago === 'efectivo' ? 'transparent' : themeColors.border,
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <Text style={{
                            fontSize: 13,
                            fontWeight: tempMetodoPago === 'efectivo' ? '800' : '600',
                            color: tempMetodoPago === 'efectivo' ? '#ffffff' : themeColors.text
                          }}>
                            Efectivo
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => {
                            if (tempMetodoPago === 'efectivo' || tempMetodoPago === 'transferencia' || tempMetodoPago === 'monedero_electronico') {
                              setTempMetodoPago('tarjeta_debito');
                            }
                            if (!tempTipoTarjeta) {
                              setTempTipoTarjeta('BBVA');
                            }
                          }}
                          style={{
                            flex: 1,
                            paddingVertical: 12,
                            borderRadius: BorderRadius.medium,
                            backgroundColor: (tempMetodoPago === 'tarjeta_debito' || tempMetodoPago === 'tarjeta_credito' || tempMetodoPago === 'tarjeta') ? themeColors.accent : themeColors.backgroundElement,
                            borderWidth: 1,
                            borderColor: (tempMetodoPago === 'tarjeta_debito' || tempMetodoPago === 'tarjeta_credito' || tempMetodoPago === 'tarjeta') ? 'transparent' : themeColors.border,
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <Text style={{
                            fontSize: 13,
                            fontWeight: (tempMetodoPago === 'tarjeta_debito' || tempMetodoPago === 'tarjeta_credito' || tempMetodoPago === 'tarjeta') ? '800' : '600',
                            color: (tempMetodoPago === 'tarjeta_debito' || tempMetodoPago === 'tarjeta_credito' || tempMetodoPago === 'tarjeta') ? '#ffffff' : themeColors.text
                          }}>
                            Tarjeta
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => {
                            setTempMetodoPago('transferencia');
                            setTempTipoTarjeta(null);
                          }}
                          style={{
                            flex: 1,
                            paddingVertical: 12,
                            borderRadius: BorderRadius.medium,
                            backgroundColor: tempMetodoPago === 'transferencia' ? themeColors.accent : themeColors.backgroundElement,
                            borderWidth: 1,
                            borderColor: tempMetodoPago === 'transferencia' ? 'transparent' : themeColors.border,
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <Text style={{
                            fontSize: 13,
                            fontWeight: tempMetodoPago === 'transferencia' ? '800' : '600',
                            color: tempMetodoPago === 'transferencia' ? '#ffffff' : themeColors.text
                          }}>
                            Transferencia
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => {
                            setTempMetodoPago('monedero_electronico');
                            setTempTipoTarjeta(null);
                          }}
                          style={{
                            flex: 1,
                            paddingVertical: 12,
                            borderRadius: BorderRadius.medium,
                            backgroundColor: tempMetodoPago === 'monedero_electronico' ? themeColors.accent : themeColors.backgroundElement,
                            borderWidth: 1,
                            borderColor: tempMetodoPago === 'monedero_electronico' ? 'transparent' : themeColors.border,
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <Text style={{
                            fontSize: 13,
                            fontWeight: tempMetodoPago === 'monedero_electronico' ? '800' : '600',
                            color: tempMetodoPago === 'monedero_electronico' ? '#ffffff' : themeColors.text,
                            textAlign: 'center'
                          }}>
                            Monedero
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {(tempMetodoPago === 'tarjeta_debito' || tempMetodoPago === 'tarjeta_credito' || tempMetodoPago === 'tarjeta') && (
                      <View style={{ gap: Spacing.two, marginTop: 4 }}>
                        <View style={{ gap: 6 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text }}>
                            Tipo de Tarjeta *
                          </Text>
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity
                              onPress={() => setTempMetodoPago('tarjeta_debito')}
                              style={{
                                flex: 1,
                                paddingVertical: 12,
                                borderRadius: BorderRadius.medium,
                                backgroundColor: tempMetodoPago === 'tarjeta_debito' ? themeColors.accent : themeColors.backgroundElement,
                                borderWidth: 1,
                                borderColor: tempMetodoPago === 'tarjeta_debito' ? 'transparent' : themeColors.border,
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              <Text style={{
                                fontSize: 13,
                                fontWeight: tempMetodoPago === 'tarjeta_debito' ? '800' : '600',
                                color: tempMetodoPago === 'tarjeta_debito' ? '#ffffff' : themeColors.text
                              }}>
                                Débito
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              onPress={() => setTempMetodoPago('tarjeta_credito')}
                              style={{
                                flex: 1,
                                paddingVertical: 12,
                                borderRadius: BorderRadius.medium,
                                backgroundColor: tempMetodoPago === 'tarjeta_credito' ? themeColors.accent : themeColors.backgroundElement,
                                borderWidth: 1,
                                borderColor: tempMetodoPago === 'tarjeta_credito' ? 'transparent' : themeColors.border,
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              <Text style={{
                                fontSize: 13,
                                fontWeight: tempMetodoPago === 'tarjeta_credito' ? '800' : '600',
                                color: tempMetodoPago === 'tarjeta_credito' ? '#ffffff' : themeColors.text
                              }}>
                                Crédito
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>

                        <View style={{ gap: 6 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text }}>
                            Selecciona la Tarjeta *
                          </Text>
                          <View style={{ gap: 8 }}>
                            {[
                              ['BBVA', 'AMEX'],
                              ['MARRIOT', 'BANORTE'],
                              ['INVEX', 'MERCADO PAGO'],
                              ['HILTON'],
                            ].map((pair, rowIdx) => (
                              <View key={rowIdx} style={{ flexDirection: 'row', gap: 8 }}>
                                {pair.map(card => {
                                  const isSelected = tempTipoTarjeta === card;
                                  return (
                                    <TouchableOpacity
                                      key={card}
                                      onPress={() => setTempTipoTarjeta(card as any)}
                                      style={{
                                        flex: 1,
                                        paddingVertical: 12,
                                        borderRadius: BorderRadius.medium,
                                        backgroundColor: isSelected ? themeColors.accent : themeColors.backgroundElement,
                                        borderWidth: 1,
                                        borderColor: isSelected ? 'transparent' : themeColors.border,
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                      }}
                                    >
                                      <Text style={{
                                        fontSize: 12,
                                        fontWeight: isSelected ? '800' : '600',
                                        color: isSelected ? '#ffffff' : themeColors.text
                                      }}>
                                        {card}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                })}
                                {pair.length === 1 && <View style={{ flex: 1 }} />}
                              </View>
                            ))}
                          </View>
                        </View>
                      </View>
                    )}

                    <Text style={{ fontSize: 12, fontWeight: '800', color: themeColors.textSecondary, textTransform: 'uppercase', marginTop: Spacing.one }}>
                      Comentarios:
                    </Text>
                    <CustomInput
                      placeholder="Observaciones o justificación del gasto..."
                      value={tempComentarios}
                      onChangeText={setTempComentarios}
                      multiline
                      numberOfLines={3}
                      style={{ height: 80 }}
                    />
                  </View>
                )}

                {/* CAMPO: JUSTIFICACIÓN / COMENTARIOS */}
                {quickEditFieldType === 'comentarios' && (
                  <View style={{ gap: Spacing.two }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: themeColors.textSecondary, textTransform: 'uppercase' }}>
                      Justificación / Comentarios del Gasto:
                    </Text>
                    <CustomInput
                      placeholder="Escribe la justificación u observaciones..."
                      value={tempComentarios}
                      onChangeText={setTempComentarios}
                      multiline
                      numberOfLines={4}
                      style={{ height: 100 }}
                    />
                  </View>
                )}
              </ScrollView>

              {/* Footer */}
              <View style={{ paddingTop: Spacing.two, borderTopWidth: 1, borderTopColor: themeColors.border, flexDirection: 'row', gap: Spacing.two }}>
                <CustomButton
                  title="Cancelar"
                  variant="secondary"
                  onPress={() => setQuickEditFieldModalVisible(false)}
                  disabled={isSavingQuickField}
                  style={{ flex: 1 }}
                />
                <CustomButton
                  title="Guardar Cambios"
                  variant="primary"
                  loading={isSavingQuickField}
                  onPress={handleSaveQuickField}
                  style={{ flex: 1.5 }}
                />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL DE FILTRO DE FECHAS Y CALENDARIO */}
      <Modal statusBarTranslucent={true}
        animationType="fade"
        transparent={true}
        visible={dateFilterModalVisible}
        onRequestClose={() => setDateFilterModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'center', alignItems: 'center', padding: Spacing.three }}>
          <View style={{ backgroundColor: themeColors.background, width: '100%', maxWidth: 440, borderRadius: BorderRadius.large, padding: Spacing.three, borderWidth: 1, borderColor: themeColors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 15, elevation: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.two, borderBottomWidth: 1, borderBottomColor: themeColors.border, paddingBottom: Spacing.two }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="calendar" size={22} color={themeColors.accent} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: themeColors.text }}>Filtrar por Fecha</Text>
              </View>
              <TouchableOpacity onPress={() => setDateFilterModalVisible(false)} style={{ padding: 4 }}>
                <Ionicons name="close-circle" size={24} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: Spacing.two }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Filtros Rápidos</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => {
                    setStartDateFilter(null);
                    setEndDateFilter(null);
                    setTempStartDate('');
                    setTempEndDate('');
                    setDateFilterModalVisible(false);
                  }}
                  style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: (!startDateFilter && !endDateFilter) ? themeColors.accent : themeColors.backgroundElement, borderWidth: 1, borderColor: themeColors.border }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: (!startDateFilter && !endDateFilter) ? '#fff' : themeColors.text }}>Todas las Fechas</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    const todayStr = new Date().toISOString().split('T')[0];
                    setStartDateFilter(todayStr);
                    setEndDateFilter(todayStr);
                    setTempStartDate(todayStr);
                    setTempEndDate(todayStr);
                    setDateFilterModalVisible(false);
                  }}
                  style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: (startDateFilter === new Date().toISOString().split('T')[0] && endDateFilter === new Date().toISOString().split('T')[0]) ? themeColors.accent : themeColors.backgroundElement, borderWidth: 1, borderColor: themeColors.border }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: (startDateFilter === new Date().toISOString().split('T')[0] && endDateFilter === new Date().toISOString().split('T')[0]) ? '#fff' : themeColors.text }}>Hoy</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    const now = new Date();
                    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
                    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
                    setStartDateFilter(firstDay);
                    setEndDateFilter(lastDay);
                    setTempStartDate(firstDay);
                    setTempEndDate(lastDay);
                    setDateFilterModalVisible(false);
                  }}
                  style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: themeColors.backgroundElement, borderWidth: 1, borderColor: themeColors.border }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.text }}>Este Mes</Text>
                </TouchableOpacity>
              </View>

              <View style={{ borderTopWidth: 1, borderTopColor: themeColors.border, paddingTop: Spacing.two, marginTop: Spacing.one }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text, marginBottom: 10 }}>📅 Seleccionar Fecha / Rango:</Text>

                {Platform.OS === 'web' ? (
                  <View style={{ gap: Spacing.two }}>
                    <View style={{ gap: 4 }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.textSecondary }}>Fecha Inicio (ó Día Único):</Text>
                      {/* @ts-ignore */}
                      <input
                        type="date"
                        value={tempStartDate}
                        onChange={(e: any) => setTempStartDate(e.target.value)}
                        style={{
                          width: '100%',
                          height: '42px',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: `1px solid ${themeColors.border}`,
                          backgroundColor: themeColors.backgroundElement,
                          color: themeColors.text,
                          fontSize: '14px',
                          outline: 'none',
                          boxSizing: 'border-box',
                          cursor: 'pointer'
                        }}
                      />
                    </View>

                    <View style={{ gap: 4 }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.textSecondary }}>Fecha Fin (Opcional para Rango):</Text>
                      {/* @ts-ignore */}
                      <input
                        type="date"
                        value={tempEndDate}
                        onChange={(e: any) => setTempEndDate(e.target.value)}
                        style={{
                          width: '100%',
                          height: '42px',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: `1px solid ${themeColors.border}`,
                          backgroundColor: themeColors.backgroundElement,
                          color: themeColors.text,
                          fontSize: '14px',
                          outline: 'none',
                          boxSizing: 'border-box',
                          cursor: 'pointer'
                        }}
                      />
                    </View>
                  </View>
                ) : (
                  <View style={{ gap: Spacing.two }}>
                    <CustomInput
                      label="Fecha Inicio (AAAA-MM-DD) *"
                      placeholder="Ej. 2026-07-20"
                      value={tempStartDate}
                      onChangeText={setTempStartDate}
                      iconName="calendar-outline"
                    />
                    <CustomInput
                      label="Fecha Fin (AAAA-MM-DD)"
                      placeholder="Ej. 2026-07-25"
                      value={tempEndDate}
                      onChangeText={setTempEndDate}
                      iconName="calendar-outline"
                    />
                  </View>
                )}
              </View>

              <View style={{ flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two }}>
                <View style={{ flex: 1 }}>
                  <CustomButton
                    title="Limpiar"
                    onPress={() => {
                      setTempStartDate('');
                      setTempEndDate('');
                      setStartDateFilter(null);
                      setEndDateFilter(null);
                      setDateFilterModalVisible(false);
                    }}
                    variant="secondary"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <CustomButton
                    title="Aplicar Fechas"
                    onPress={() => {
                      const s = tempStartDate.trim() || null;
                      const e = tempEndDate.trim() || s;
                      setStartDateFilter(s);
                      setEndDateFilter(e);
                      setDateFilterModalVisible(false);
                    }}
                    variant="primary"
                  />
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
