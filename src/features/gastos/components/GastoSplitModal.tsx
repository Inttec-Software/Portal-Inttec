import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Modal,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, BorderRadius } from '@/constants/theme';
import CustomInput from '@/components/CustomInput';
import CustomButton from '@/components/CustomButton';
import { styles } from './gastoFormStyles';
import { useGastoForm, showAlert } from '../hooks/useGastoForm';

interface GastoSplitModalProps {
  form: ReturnType<typeof useGastoForm>;
  themeColors: any;
}

export default function GastoSplitModal({ form, themeColors }: GastoSplitModalProps) {
  const {
    role,
    showSplitModal,
    setShowSplitModal,
    monto,
    esComida,
    incluyePropina,
    montoPropina,
    splits,
    setSplits,
    clientes,
    sucursalesCliente,
    newSplitClienteId,
    setNewSplitClienteId,
    newSplitSucursalNombre,
    setNewSplitSucursalNombre,
    newSplitComentarioSucursal,
    setNewSplitComentarioSucursal,
    newSplitMonto,
    setNewSplitMonto,
    showNewSplitCliDropdown,
    setShowNewSplitCliDropdown,
    showNewSplitSucDropdown,
    setShowNewSplitSucDropdown,
    splitClienteSearch,
    setSplitClienteSearch,
    splitSucursalSearch,
    setSplitSucursalSearch,
    handleAddNewClienteForSplit,
    handleAddNewSucursalForSplit,
  } = form;

  return (
    <Modal
      statusBarTranslucent={true}
      visible={showSplitModal}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowSplitModal(false)}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', alignItems: 'center', padding: Spacing.four }}
          onPress={() => setShowSplitModal(false)}
        >
          <Pressable
            style={{ width: '100%', maxWidth: 480, maxHeight: '90%' }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ backgroundColor: themeColors.background, borderRadius: BorderRadius.large, padding: Spacing.four, width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 }}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ gap: Spacing.three }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: themeColors.text }}>Agregar División de Gasto</Text>
                  <TouchableOpacity onPress={() => setShowSplitModal(false)}>
                    <Ionicons name="close-circle-outline" size={24} color={themeColors.textSecondary} />
                  </TouchableOpacity>
                </View>

                {/* Banner de Total y Restante */}
                {(() => {
                  const totalGasto = Number(monto || 0) + (esComida && incluyePropina === false ? Number(montoPropina || 0) : 0);
                  const currentSum = splits.reduce((acc, curr) => acc + Number(curr.monto || 0), 0);
                  const remainder = Math.max(0, totalGasto - currentSum);

                  return (
                    <View style={{ backgroundColor: themeColors.primary + '15', padding: Spacing.two, borderRadius: BorderRadius.small, flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>Total Ticket: <Text style={{ color: themeColors.text, fontWeight: '700' }}>${totalGasto.toFixed(2)}</Text></Text>
                      <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>Restante: <Text style={{ color: themeColors.primary, fontWeight: '700' }}>${remainder.toFixed(2)}</Text></Text>
                    </View>
                  );
                })()}

                {/* Selector de Cliente */}
                <View style={[styles.customDropdownContainer, { zIndex: 120 }]}>
                  <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Cliente Relacionado *</Text>
                  <TouchableOpacity
                    style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                    onPress={() => {
                      Keyboard.dismiss();
                      setShowNewSplitSucDropdown(false);
                      setShowNewSplitCliDropdown(!showNewSplitCliDropdown);
                    }}
                  >
                    <Text style={{ color: newSplitClienteId ? themeColors.text : themeColors.textSecondary }}>
                      {newSplitClienteId || 'Selecciona un cliente'}
                    </Text>
                    <Ionicons name={showNewSplitCliDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                  </TouchableOpacity>
                  {showNewSplitCliDropdown && (
                    <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', zIndex: 120 }}>
                      <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                        <CustomInput
                          placeholder="Buscar o agregar cliente..."
                          value={splitClienteSearch}
                          onChangeText={setSplitClienteSearch}
                          iconName="search-outline"
                          style={{ margin: Spacing.one, height: 40 }}
                        />
                        <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                          {splitClienteSearch.trim().length > 0 && !clientes.some(c => c.nombre && c.nombre.toLowerCase() === splitClienteSearch.trim().toLowerCase()) && (
                            <TouchableOpacity
                              style={[styles.dropdownItem, { backgroundColor: themeColors.accent + '15', flexDirection: 'row', alignItems: 'center', gap: Spacing.one }]}
                              onPress={() => {
                                handleAddNewClienteForSplit(splitClienteSearch);
                              }}
                            >
                              <Ionicons name="add-circle-outline" size={24} color={themeColors.accent} />
                              <Text style={{ color: themeColors.accent, fontWeight: '600', fontSize: 14 }}>
                                {`Agregar "${splitClienteSearch.trim()}"`}
                              </Text>
                            </TouchableOpacity>
                          )}
                          {clientes
                            .filter(cli => cli.nombre && cli.nombre.toLowerCase().includes(splitClienteSearch.toLowerCase()))
                            .map((cli, index, array) => (
                              <TouchableOpacity
                                key={cli.id}
                                style={[
                                  styles.dropdownItem,
                                  index === array.length - 1 && { borderBottomWidth: 0 },
                                  { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, justifyContent: 'space-between' }
                                ]}
                                onPress={() => {
                                  setNewSplitClienteId(cli.nombre);
                                  const cliSucs = sucursalesCliente.filter(s => s.cliente_id === cli.id);
                                  if (cliSucs.length === 1) {
                                    setNewSplitSucursalNombre(cliSucs[0].nombre);
                                  } else {
                                    setNewSplitSucursalNombre('');
                                  }
                                  setSplitClienteSearch('');
                                  setShowNewSplitCliDropdown(false);
                                }}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.one, flex: 1 }}>
                                  <Ionicons name="person-circle-outline" size={20} color={themeColors.primary} />
                                  <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 14 }}>{cli.nombre}</Text>
                                </View>
                                {newSplitClienteId === cli.nombre && (
                                  <Ionicons name="checkmark" size={18} color={themeColors.primary} />
                                )}
                              </TouchableOpacity>
                            ))}
                        </ScrollView>
                      </View>
                    </Pressable>
                  )}
                </View>

                {/* Selector de Sucursal del Cliente */}
                <View style={[styles.customDropdownContainer, { marginTop: Spacing.two, zIndex: 110 }]}>
                  <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Sucursal del Cliente *</Text>
                  <TouchableOpacity
                    disabled={!newSplitClienteId}
                    style={[
                      styles.dropdownTrigger,
                      {
                        backgroundColor: !newSplitClienteId ? themeColors.backgroundElement + '80' : themeColors.backgroundElement,
                        borderColor: themeColors.border,
                        opacity: !newSplitClienteId ? 0.6 : 1
                      }
                    ]}
                    onPress={() => {
                      Keyboard.dismiss();
                      setShowNewSplitCliDropdown(false);
                      setShowNewSplitSucDropdown(!showNewSplitSucDropdown);
                    }}
                  >
                    <Text style={{ color: newSplitSucursalNombre ? themeColors.text : themeColors.textSecondary }}>
                      {newSplitSucursalNombre || (newSplitClienteId ? 'Selecciona una sucursal' : 'Selecciona un cliente primero')}
                    </Text>
                    <Ionicons name={showNewSplitSucDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                  </TouchableOpacity>
                  {showNewSplitSucDropdown && newSplitClienteId && (
                    <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', zIndex: 110 }}>
                      <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                        <CustomInput
                          placeholder="Buscar o agregar sucursal..."
                          value={splitSucursalSearch}
                          onChangeText={setSplitSucursalSearch}
                          iconName="search-outline"
                          style={{ margin: Spacing.one, height: 40 }}
                        />
                        <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                          {(() => {
                            const currentCli = clientes.find(c => c.nombre?.trim().toLowerCase() === newSplitClienteId?.trim().toLowerCase());
                            const filteredSuc = currentCli ? sucursalesCliente.filter(s => s.cliente_id === currentCli.id && s.nombre.toLowerCase().includes(splitSucursalSearch.toLowerCase())) : [];
                            const existsExact = currentCli && sucursalesCliente.some(s => s.cliente_id === currentCli.id && s.nombre.trim().toLowerCase() === splitSucursalSearch.trim().toLowerCase());

                            return (
                              <>
                                {role === 'empleado' && (
                                  <TouchableOpacity
                                    style={[styles.dropdownItem, { backgroundColor: themeColors.accent + '10', flexDirection: 'row', alignItems: 'center', gap: Spacing.one }]}
                                    onPress={() => {
                                      setNewSplitSucursalNombre('');
                                      setSplitSucursalSearch('');
                                      setShowNewSplitSucDropdown(false);
                                    }}
                                  >
                                    <Ionicons name="close-circle-outline" size={24} color={themeColors.danger} />
                                    <Text style={{ color: themeColors.danger, fontWeight: '600', fontSize: 13 }}>
                                      Dejar en blanco (Sin sucursal)
                                    </Text>
                                  </TouchableOpacity>
                                )}

                                {splitSucursalSearch.trim().length > 0 && !existsExact && currentCli && (
                                  <TouchableOpacity
                                    style={[styles.dropdownItem, { backgroundColor: themeColors.accent + '15', flexDirection: 'row', alignItems: 'center', gap: Spacing.one }]}
                                    onPress={() => handleAddNewSucursalForSplit(splitSucursalSearch)}
                                  >
                                    <Ionicons name="add-circle-outline" size={24} color={themeColors.accent} />
                                    <View style={{ flex: 1 }}>
                                      <Text style={{ color: themeColors.accent, fontWeight: '700', fontSize: 13 }}>
                                        {`➕ Agregar "${splitSucursalSearch.trim().toUpperCase()}"`}
                                      </Text>
                                      <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>
                                        {`Vincular a: ${currentCli.nombre}`}
                                      </Text>
                                    </View>
                                  </TouchableOpacity>
                                )}

                                {filteredSuc.map((suc, index, array) => (
                                  <TouchableOpacity
                                    key={suc.id}
                                    style={[
                                      styles.dropdownItem,
                                      index === array.length - 1 && { borderBottomWidth: 0 },
                                      { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, justifyContent: 'space-between' }
                                    ]}
                                    onPress={() => {
                                      setNewSplitSucursalNombre(suc.nombre);
                                      setSplitSucursalSearch('');
                                      setShowNewSplitSucDropdown(false);
                                    }}
                                  >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.one, flex: 1 }}>
                                      <Ionicons name="business-outline" size={18} color={themeColors.primary} />
                                      <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 14 }}>{suc.nombre}</Text>
                                    </View>
                                    {newSplitSucursalNombre === suc.nombre && (
                                      <Ionicons name="checkmark" size={18} color={themeColors.primary} />
                                    )}
                                  </TouchableOpacity>
                                ))}

                                {filteredSuc.length === 0 && !splitSucursalSearch.trim() && (
                                  <View style={{ padding: Spacing.two, alignItems: 'center' }}>
                                    <Text style={{ color: themeColors.textSecondary, fontSize: 12, textAlign: 'center', marginBottom: 4 }}>
                                      No hay sucursales registradas para este cliente.
                                    </Text>
                                    <Text style={{ color: themeColors.accent, fontSize: 11, fontWeight: '600', textAlign: 'center' }}>
                                      Escribe arriba para agregar una nueva.
                                    </Text>
                                  </View>
                                )}
                              </>
                            );
                          })()}
                        </ScrollView>
                      </View>
                    </Pressable>
                  )}
                </View>

                {role === 'empleado' && !newSplitSucursalNombre && newSplitClienteId ? (
                  <View style={{ marginTop: Spacing.two, zIndex: 105 }}>
                    <CustomInput
                      label="Sucursal a agregar *"
                      placeholder="Escribe el nombre de la sucursal..."
                      value={newSplitComentarioSucursal}
                      onChangeText={setNewSplitComentarioSucursal}
                      iconName="business-outline"
                    />
                    <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 4, marginLeft: 4 }}>
                      El administrador se encargará de registrar esta sucursal.
                    </Text>
                  </View>
                ) : null}

                {/* Monto Asignado */}
                <View style={{ marginTop: Spacing.two, zIndex: 1 }}>
                  <CustomInput
                    label="Monto Asignado *"
                    placeholder="Ej. 150.00"
                    keyboardType="decimal-pad"
                    value={newSplitMonto}
                    onChangeText={(val) => setNewSplitMonto(val.replace(',', '.'))}
                    iconName="cash-outline"
                    onFocus={() => {
                      setShowNewSplitCliDropdown(false);
                      setShowNewSplitSucDropdown(false);
                    }}
                  />
                  {(() => {
                    const totalGasto = Number(monto || 0) + (esComida && incluyePropina === false ? Number(montoPropina || 0) : 0);
                    const currentSum = splits.reduce((acc, curr) => acc + Number(curr.monto || 0), 0);
                    const remainder = Math.max(0, totalGasto - currentSum);

                    if (remainder > 0) {
                      return (
                        <TouchableOpacity
                          onPress={() => setNewSplitMonto(remainder.toFixed(2))}
                          style={{ alignSelf: 'flex-start', marginTop: 4, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: themeColors.primary + '15', borderRadius: BorderRadius.small }}
                        >
                          <Text style={{ color: themeColors.primary, fontSize: 12, fontWeight: '600' }}>
                            ⚡ Usar restante ($ {remainder.toFixed(2)})
                          </Text>
                        </TouchableOpacity>
                      );
                    }
                    return null;
                  })()}
                </View>

                <View style={{ flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.four, zIndex: 1 }}>
                  <CustomButton
                    title="Cancelar"
                    variant="secondary"
                    onPress={() => setShowSplitModal(false)}
                    style={{ flex: 1 }}
                  />
                  <CustomButton
                    title="Guardar"
                    onPress={() => {
                      if (!newSplitClienteId.trim()) {
                        showAlert('Atención', 'Por favor selecciona un cliente.');
                        return;
                      }
                      if (role === 'admin') {
                        if (!newSplitSucursalNombre.trim()) {
                          showAlert('Atención', 'Por favor selecciona o agrega una sucursal para el cliente.');
                          return;
                        }
                      } else {
                        if (!newSplitSucursalNombre.trim() && !newSplitComentarioSucursal.trim()) {
                          showAlert('Atención', 'Por favor selecciona la sucursal para el cliente o indica una nueva.');
                          return;
                        }
                      }
                      if (!newSplitMonto || isNaN(Number(newSplitMonto)) || Number(newSplitMonto) <= 0) {
                        showAlert('Atención', 'Por favor ingresa un monto válido mayor a 0.');
                        return;
                      }
                      const totalGasto = Number(monto || 0) + (esComida && incluyePropina === false ? Number(montoPropina || 0) : 0);
                      const currentSum = splits.reduce((acc, curr) => acc + Number(curr.monto || 0), 0);
                      if (currentSum + Number(newSplitMonto) > totalGasto + 0.01) {
                        showAlert('Atención', `El monto ingresado excede el total del ticket ($${totalGasto.toFixed(2)}). Restante: $${(totalGasto - currentSum).toFixed(2)}`);
                        return;
                      }
                      setSplits([
                        ...splits,
                        {
                          id: Date.now().toString(),
                          clienteId: newSplitClienteId,
                          sucursalNombre: newSplitSucursalNombre,
                          comentarioSucursal: role === 'empleado' ? newSplitComentarioSucursal : undefined,
                          monto: newSplitMonto,
                        },
                      ]);
                      setShowSplitModal(false);
                    }}
                    style={{ flex: 1 }}
                  />
                </View>
              </ScrollView>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
