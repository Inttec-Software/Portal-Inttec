import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, BorderRadius } from '@/constants/theme';
import CustomButton from '@/components/CustomButton';
import CustomInput from '@/components/CustomInput';
import { Proyecto, ProyectoStatus } from '../types';

interface ProyectoFormModalProps {
  visible: boolean;
  editingProyecto: Proyecto | null;
  clientesCatalog: any[];
  sucursalesCatalog: any[];
  isSaving: boolean;
  themeColors: any;
  onClose: () => void;
  onSave: (payload: {
    nombre: string;
    cliente_id: string | null;
    sucursal_id: string | null;
    status: ProyectoStatus;
    notas: string | null;
  }) => void;
}

export function ProyectoFormModal({
  visible,
  editingProyecto,
  clientesCatalog,
  sucursalesCatalog,
  isSaving,
  themeColors,
  onClose,
  onSave,
}: ProyectoFormModalProps) {
  const [nombre, setNombre] = useState('');
  const [clienteId, setClienteId] = useState<string>('');
  const [sucursalId, setSucursalId] = useState<string>('');
  const [status, setStatus] = useState<ProyectoStatus>('ACTIVO');
  const [notas, setNotas] = useState('');
  const [clienteSearch, setClienteSearch] = useState('');
  const [showSucursalDropdown, setShowSucursalDropdown] = useState(false);
  const [sucursalSearch, setSucursalSearch] = useState('');

  useEffect(() => {
    if (visible) {
      if (editingProyecto) {
        setNombre(editingProyecto.nombre || '');
        setClienteId(editingProyecto.cliente_id || '');
        setSucursalId(editingProyecto.sucursal_id || '');
        setStatus(editingProyecto.status || 'ACTIVO');
        setNotas(editingProyecto.notas || '');
      } else {
        setNombre('');
        setClienteId('');
        setSucursalId('');
        setStatus('ACTIVO');
        setNotas('');
      }
      setClienteSearch('');
      setShowSucursalDropdown(false);
      setSucursalSearch('');
    }
  }, [visible, editingProyecto]);

  const filteredClientes = useMemo(() => {
    const q = clienteSearch.trim().toLowerCase();
    if (!q) return clientesCatalog;
    return clientesCatalog.filter(
      (c: any) => c.nombre && String(c.nombre).toLowerCase().includes(q)
    );
  }, [clientesCatalog, clienteSearch]);

  const filteredSucursales = useMemo(() => {
    if (!clienteId) return [];
    return sucursalesCatalog.filter((s: any) => s.cliente_id === clienteId);
  }, [sucursalesCatalog, clienteId]);

  const selectedClienteObj = useMemo(
    () => clientesCatalog.find((c: any) => c.id === clienteId),
    [clientesCatalog, clienteId]
  );

  const handleConfirm = () => {
    onSave({
      nombre: nombre.trim(),
      cliente_id: clienteId || null,
      sucursal_id: sucursalId || null,
      status,
      notas: notas.trim() || null,
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={() => {
        if (!isSaving) onClose();
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.65)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: Spacing.three,
          }}
        >
          <View
            style={{
              backgroundColor: themeColors.background,
              width: '100%',
              maxWidth: 540,
              maxHeight: '90%',
              borderRadius: BorderRadius.large,
              padding: Spacing.three,
              borderWidth: 1,
              borderColor: themeColors.border,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.3,
              shadowRadius: 20,
              elevation: 10,
            }}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingBottom: Spacing.two,
                borderBottomWidth: 1,
                borderBottomColor: themeColors.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: themeColors.primary + '20',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="folder-open" size={20} color={themeColors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 17,
                      fontWeight: '800',
                      color: themeColors.text,
                    }}
                  >
                    {editingProyecto ? 'Editar Proyecto' : 'Nuevo Proyecto'}
                  </Text>
                  <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                    {editingProyecto
                      ? 'Actualiza los datos o el estado del proyecto'
                      : 'Crea el proyecto donde los empleados asignarán sus gastos'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={onClose}
                disabled={isSaving}
                style={{ padding: 4 }}
              >
                <Ionicons name="close-circle" size={26} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ marginVertical: Spacing.two }}
              contentContainerStyle={{ gap: Spacing.two }}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {/* Nombre del proyecto */}
              <View style={{ gap: 4 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '800',
                    color: themeColors.textSecondary,
                    textTransform: 'uppercase',
                  }}
                >
                  Nombre del Proyecto *
                </Text>
                <CustomInput
                  placeholder="Ej. Panamericano Obregón - Instalación Cámaras"
                  value={nombre}
                  onChangeText={setNombre}
                  iconName="briefcase-outline"
                />
              </View>

              {/* Estado del proyecto */}
              <View style={{ gap: 6 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '800',
                    color: themeColors.textSecondary,
                    textTransform: 'uppercase',
                  }}
                >
                  Estado del Proyecto
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setStatus('ACTIVO')}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      paddingVertical: 10,
                      borderRadius: BorderRadius.medium,
                      backgroundColor:
                        status === 'ACTIVO'
                          ? themeColors.success
                          : themeColors.backgroundElement,
                      borderWidth: 1,
                      borderColor:
                        status === 'ACTIVO' ? themeColors.success : themeColors.border,
                    }}
                  >
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={status === 'ACTIVO' ? '#fff' : themeColors.textSecondary}
                    />
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '800',
                        color: status === 'ACTIVO' ? '#fff' : themeColors.text,
                      }}
                    >
                      ACTIVO (Recibe gastos)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setStatus('CERRADO')}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      paddingVertical: 10,
                      borderRadius: BorderRadius.medium,
                      backgroundColor:
                        status === 'CERRADO'
                          ? '#64748b'
                          : themeColors.backgroundElement,
                      borderWidth: 1,
                      borderColor:
                        status === 'CERRADO' ? '#64748b' : themeColors.border,
                    }}
                  >
                    <Ionicons
                      name="lock-closed"
                      size={16}
                      color={status === 'CERRADO' ? '#fff' : themeColors.textSecondary}
                    />
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '800',
                        color: status === 'CERRADO' ? '#fff' : themeColors.text,
                      }}
                    >
                      CERRADO
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Cliente */}
              <View style={{ gap: 6 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '800',
                      color: themeColors.textSecondary,
                      textTransform: 'uppercase',
                    }}
                  >
                    Cliente
                  </Text>
                  {selectedClienteObj && (
                    <TouchableOpacity
                      onPress={() => {
                        setClienteId('');
                        setSucursalId('');
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '700',
                          color: themeColors.danger,
                        }}
                      >
                        Quitar cliente
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: themeColors.backgroundElement,
                    borderWidth: 1,
                    borderColor: themeColors.border,
                    borderRadius: BorderRadius.medium,
                    paddingHorizontal: 10,
                    height: 38,
                  }}
                >
                  <Ionicons
                    name="search-outline"
                    size={16}
                    color={themeColors.textSecondary}
                    style={{ marginRight: 6 }}
                  />
                  <TextInput
                    value={clienteSearch}
                    onChangeText={setClienteSearch}
                    placeholder="Buscar cliente..."
                    placeholderTextColor={themeColors.textSecondary}
                    style={{ flex: 1, color: themeColors.text, fontSize: 13 }}
                  />
                  {clienteSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setClienteSearch('')}>
                      <Ionicons
                        name="close-circle"
                        size={16}
                        color={themeColors.textSecondary}
                      />
                    </TouchableOpacity>
                  )}
                </View>

                <View
                  style={{
                    maxHeight: 140,
                    borderWidth: 1,
                    borderColor: themeColors.border,
                    borderRadius: BorderRadius.medium,
                    backgroundColor: themeColors.backgroundElement,
                    padding: 6,
                  }}
                >
                  <ScrollView nestedScrollEnabled style={{ maxHeight: 128 }}>
                    <View style={{ gap: 4 }}>
                      {filteredClientes.map((cli: any) => {
                        const isSelected = clienteId === cli.id;
                        return (
                          <TouchableOpacity
                            key={cli.id}
                            onPress={() => {
                              setClienteId(cli.id);
                              setSucursalId('');
                            }}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              paddingVertical: 7,
                              paddingHorizontal: 10,
                              borderRadius: BorderRadius.small,
                              backgroundColor: isSelected
                                ? themeColors.primary + '20'
                                : 'transparent',
                              borderWidth: isSelected ? 1 : 0,
                              borderColor: themeColors.primary,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: isSelected ? '800' : '600',
                                color: isSelected
                                  ? themeColors.primary
                                  : themeColors.text,
                              }}
                            >
                              {cli.nombre}
                            </Text>
                            {isSelected && (
                              <Ionicons
                                name="checkmark-circle"
                                size={18}
                                color={themeColors.primary}
                              />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                      {filteredClientes.length === 0 && (
                        <Text
                          style={{
                            fontSize: 12,
                            color: themeColors.textSecondary,
                            textAlign: 'center',
                            paddingVertical: 8,
                          }}
                        >
                          No se encontraron clientes
                        </Text>
                      )}
                    </View>
                  </ScrollView>
                </View>
              </View>

              {/* Sucursal (Dropdown con buscador) */}
              {clienteId ? (
                <View style={{ gap: 6 }}>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '800',
                      color: themeColors.textSecondary,
                      textTransform: 'uppercase',
                    }}
                  >
                    Sucursal ({filteredSucursales.length})
                  </Text>

                  <TouchableOpacity
                    onPress={() => setShowSucursalDropdown(!showSucursalDropdown)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: themeColors.backgroundElement,
                      borderWidth: 1,
                      borderColor: showSucursalDropdown ? themeColors.accent : themeColors.border,
                      borderRadius: BorderRadius.medium,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <Ionicons
                        name="business-outline"
                        size={16}
                        color={sucursalId ? themeColors.accent : themeColors.textSecondary}
                      />
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: sucursalId ? '700' : '600',
                          color: themeColors.text,
                          flex: 1,
                        }}
                        numberOfLines={1}
                      >
                        {sucursalId
                          ? filteredSucursales.find((s: any) => s.id === sucursalId)?.nombre || 'Sucursal seleccionada'
                          : 'Sin sucursal específica'}
                      </Text>
                    </View>
                    <Ionicons
                      name={showSucursalDropdown ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={themeColors.textSecondary}
                    />
                  </TouchableOpacity>

                  {showSucursalDropdown && (
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: themeColors.border,
                        borderRadius: BorderRadius.medium,
                        backgroundColor: themeColors.backgroundElement,
                        padding: 6,
                        gap: 6,
                      }}
                    >
                      {filteredSucursales.length > 5 && (
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: themeColors.background,
                            borderWidth: 1,
                            borderColor: themeColors.border,
                            borderRadius: BorderRadius.small,
                            paddingHorizontal: 8,
                            height: 34,
                          }}
                        >
                          <Ionicons
                            name="search-outline"
                            size={14}
                            color={themeColors.textSecondary}
                            style={{ marginRight: 6 }}
                          />
                          <TextInput
                            value={sucursalSearch}
                            onChangeText={setSucursalSearch}
                            placeholder="Buscar sucursal..."
                            placeholderTextColor={themeColors.textSecondary}
                            style={{ flex: 1, color: themeColors.text, fontSize: 12 }}
                          />
                          {sucursalSearch.length > 0 && (
                            <TouchableOpacity onPress={() => setSucursalSearch('')}>
                              <Ionicons name="close-circle" size={14} color={themeColors.textSecondary} />
                            </TouchableOpacity>
                          )}
                        </View>
                      )}

                      <ScrollView nestedScrollEnabled style={{ maxHeight: 160 }}>
                        <View style={{ gap: 2 }}>
                          <TouchableOpacity
                            onPress={() => {
                              setSucursalId('');
                              setShowSucursalDropdown(false);
                            }}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              paddingVertical: 8,
                              paddingHorizontal: 10,
                              borderRadius: BorderRadius.small,
                              backgroundColor: !sucursalId ? themeColors.accent + '18' : 'transparent',
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: !sucursalId ? '800' : '600',
                                color: !sucursalId ? themeColors.accent : themeColors.textSecondary,
                              }}
                            >
                              Sin sucursal específica
                            </Text>
                            {!sucursalId && (
                              <Ionicons name="checkmark" size={16} color={themeColors.accent} />
                            )}
                          </TouchableOpacity>

                          {filteredSucursales
                            .filter((s: any) => {
                              const q = sucursalSearch.trim().toLowerCase();
                              return !q || (s.nombre && String(s.nombre).toLowerCase().includes(q));
                            })
                            .map((suc: any) => {
                              const isSelected = sucursalId === suc.id;
                              return (
                                <TouchableOpacity
                                  key={suc.id}
                                  onPress={() => {
                                    setSucursalId(suc.id);
                                    setShowSucursalDropdown(false);
                                  }}
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    paddingVertical: 8,
                                    paddingHorizontal: 10,
                                    borderRadius: BorderRadius.small,
                                    backgroundColor: isSelected ? themeColors.accent + '18' : 'transparent',
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontSize: 12,
                                      fontWeight: isSelected ? '800' : '600',
                                      color: isSelected ? themeColors.accent : themeColors.text,
                                    }}
                                  >
                                    {suc.nombre}
                                  </Text>
                                  {isSelected && (
                                    <Ionicons name="checkmark" size={16} color={themeColors.accent} />
                                  )}
                                </TouchableOpacity>
                              );
                            })}
                        </View>
                      </ScrollView>
                    </View>
                  )}
                </View>
              ) : null}

              {/* Notas */}
              <View style={{ gap: 4 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '800',
                    color: themeColors.textSecondary,
                    textTransform: 'uppercase',
                  }}
                >
                  Notas / Observaciones (Opcional)
                </Text>
                <CustomInput
                  placeholder="Descripción breve de la obra, alcance o referencia..."
                  value={notas}
                  onChangeText={setNotas}
                  multiline
                  numberOfLines={3}
                  style={{ height: 75 }}
                />
              </View>
            </ScrollView>

            {/* Footer */}
            <View
              style={{
                flexDirection: 'row',
                gap: Spacing.two,
                paddingTop: Spacing.two,
                borderTopWidth: 1,
                borderTopColor: themeColors.border,
              }}
            >
              <CustomButton
                title="Cancelar"
                variant="secondary"
                onPress={onClose}
                disabled={isSaving}
                style={{ flex: 1 }}
              />
              <CustomButton
                title={editingProyecto ? 'Guardar Cambios' : 'Crear Proyecto'}
                variant="primary"
                loading={isSaving}
                disabled={!nombre.trim() || isSaving}
                onPress={handleConfirm}
                style={{ flex: 1.4 }}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
