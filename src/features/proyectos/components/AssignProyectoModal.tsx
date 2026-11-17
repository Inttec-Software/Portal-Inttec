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
import { Gasto, GastoHelper } from '@/services/supabase';
import CustomButton from '@/components/CustomButton';
import { ProyectoResumen, TipoGasto } from '../types';

interface AssignProyectoModalProps {
  visible: boolean;
  gasto: Gasto | null;
  proyectos: ProyectoResumen[];
  isSaving: boolean;
  themeColors: any;
  formatCurrency: (val: number) => string;
  onClose: () => void;
  onConfirm: (payload: {
    proyecto_id: string | null;
    tipo_gasto: TipoGasto;
  }) => void;
  onOpenCreateProyecto?: () => void;
}

export function AssignProyectoModal({
  visible,
  gasto,
  proyectos,
  isSaving,
  themeColors,
  formatCurrency,
  onClose,
  onConfirm,
  onOpenCreateProyecto,
}: AssignProyectoModalProps) {
  const [selectedTipo, setSelectedTipo] = useState<TipoGasto>('PROYECTO');
  const [selectedProyectoId, setSelectedProyectoId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showClosed, setShowClosed] = useState(false);

  useEffect(() => {
    if (visible && gasto) {
      if (gasto.tipo_gasto === 'OPERATIVO' && !gasto.proyecto_id) {
        setSelectedTipo('OPERATIVO');
        setSelectedProyectoId('');
      } else {
        setSelectedTipo('PROYECTO');
        setSelectedProyectoId(gasto.proyecto_id || gasto.proyecto_rel?.id || '');
      }
      setSearchQuery('');
    }
  }, [visible, gasto]);

  const filteredProyectos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return proyectos.filter((p) => {
      if (!showClosed && p.status === 'CERRADO' && p.id !== selectedProyectoId) {
        return false;
      }
      if (!q) return true;
      const combined = `${p.nombre || ''} ${p.cliente_nombre || ''} ${p.sucursal_nombre || ''}`.toLowerCase();
      return combined.includes(q);
    });
  }, [proyectos, searchQuery, showClosed, selectedProyectoId]);

  const handleSave = () => {
    if (selectedTipo === 'OPERATIVO') {
      onConfirm({
        proyecto_id: null,
        tipo_gasto: 'OPERATIVO',
      });
    } else {
      onConfirm({
        proyecto_id: selectedProyectoId || null,
        tipo_gasto: 'PROYECTO',
      });
    }
  };

  if (!gasto) return null;

  const provName = GastoHelper.getProveedor(gasto);
  const catName = GastoHelper.getCategoria(gasto);
  const subcatName = GastoHelper.getSubcategoria(gasto);

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
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: themeColors.accent + '20',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="folder-open-outline" size={19} color={themeColors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: '800',
                      color: themeColors.text,
                    }}
                  >
                    Asignar Gasto a Proyecto / Destino
                  </Text>
                  <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                    Mueve o reclasifica este gasto en su proyecto correspondiente
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={onClose}
                disabled={isSaving}
                style={{ padding: 4 }}
              >
                <Ionicons name="close-circle" size={24} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Resumen del gasto a asignar */}
            <View
              style={{
                backgroundColor: themeColors.backgroundElement,
                borderRadius: BorderRadius.medium,
                borderWidth: 1,
                borderColor: themeColors.border,
                padding: Spacing.two,
                marginTop: Spacing.two,
                gap: 4,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '800',
                    color: themeColors.text,
                    flex: 1,
                  }}
                  numberOfLines={1}
                >
                  {provName || gasto.empleado_nombre || 'Gasto'}
                </Text>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: '900',
                    color: themeColors.primary,
                  }}
                >
                  {formatCurrency(Number(gasto.monto || 0))}
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                {catName || 'Sin categoría'}
                {subcatName ? ` > ${subcatName}` : ''} • Empleado:{' '}
                <Text style={{ fontWeight: '700', color: themeColors.text }}>
                  {gasto.empleado_nombre || 'N/D'}
                </Text>
              </Text>
              {(gasto.detalle_servicio_proyecto || gasto.tipo_servicio_proyecto) ? (
                <View
                  style={{
                    marginTop: 4,
                    paddingVertical: 4,
                    paddingHorizontal: 8,
                    borderRadius: BorderRadius.small,
                    backgroundColor: themeColors.warning + '15',
                    borderLeftWidth: 3,
                    borderLeftColor: themeColors.warning,
                  }}
                >
                  <Text style={{ fontSize: 11, color: themeColors.text }}>
                    <Text style={{ fontWeight: '800', color: themeColors.warning }}>
                      Referencia original:{' '}
                    </Text>
                    {gasto.tipo_servicio_proyecto
                      ? `[${gasto.tipo_servicio_proyecto}] `
                      : ''}
                    {gasto.detalle_servicio_proyecto || ''}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Selector Proyecto vs Operativo */}
            <View style={{ marginTop: Spacing.two, gap: 6 }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '800',
                  color: themeColors.textSecondary,
                  textTransform: 'uppercase',
                }}
              >
                1. Tipo de Destino
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => setSelectedTipo('PROYECTO')}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingVertical: 10,
                    borderRadius: BorderRadius.medium,
                    backgroundColor:
                      selectedTipo === 'PROYECTO'
                        ? themeColors.primary
                        : themeColors.backgroundElement,
                    borderWidth: 1,
                    borderColor:
                      selectedTipo === 'PROYECTO'
                        ? themeColors.primary
                        : themeColors.border,
                  }}
                >
                  <Ionicons
                    name="folder-open-outline"
                    size={16}
                    color={selectedTipo === 'PROYECTO' ? '#fff' : themeColors.text}
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '800',
                      color: selectedTipo === 'PROYECTO' ? '#fff' : themeColors.text,
                    }}
                  >
                    Gasto de Proyecto
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setSelectedTipo('OPERATIVO')}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingVertical: 10,
                    borderRadius: BorderRadius.medium,
                    backgroundColor:
                      selectedTipo === 'OPERATIVO'
                        ? '#0284C7'
                        : themeColors.backgroundElement,
                    borderWidth: 1,
                    borderColor:
                      selectedTipo === 'OPERATIVO' ? '#0284C7' : themeColors.border,
                  }}
                >
                  <Ionicons
                    name="business-outline"
                    size={16}
                    color={selectedTipo === 'OPERATIVO' ? '#fff' : themeColors.text}
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '800',
                      color: selectedTipo === 'OPERATIVO' ? '#fff' : themeColors.text,
                    }}
                  >
                    Operativo / General
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {selectedTipo === 'OPERATIVO' ? (
              <View
                style={{
                  marginVertical: Spacing.three,
                  padding: Spacing.three,
                  borderRadius: BorderRadius.medium,
                  backgroundColor: '#0284C715',
                  borderWidth: 1,
                  borderColor: '#0284C740',
                  gap: 6,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="information-circle" size={20} color="#0284C7" />
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '800',
                      color: '#0284C7',
                    }}
                  >
                    Gasto Operativo / General (Sin proyecto)
                  </Text>
                </View>
                <Text style={{ fontSize: 12, color: themeColors.text, lineHeight: 18 }}>
                  Este gasto se clasificará en la pestaña de{' '}
                  <Text style={{ fontWeight: '800' }}>Operativos</Text> (pagos como
                  IMSS, ISN, Telmex, JMAS, nómina, software, oficina o mantenimiento
                  general) sin sumarse a ningún proyecto.
                </Text>
              </View>
            ) : (
              <View style={{ flexShrink: 1, marginTop: Spacing.two, gap: 8 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '800',
                      color: themeColors.textSecondary,
                      textTransform: 'uppercase',
                    }}
                  >
                    2. Selecciona el Proyecto ({filteredProyectos.length})
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <TouchableOpacity onPress={() => setShowClosed(!showClosed)}>
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '700',
                          color: showClosed
                            ? themeColors.accent
                            : themeColors.textSecondary,
                        }}
                      >
                        {showClosed ? 'Ocultar cerrados' : 'Ver también cerrados'}
                      </Text>
                    </TouchableOpacity>
                    {onOpenCreateProyecto && (
                      <TouchableOpacity
                        onPress={onOpenCreateProyecto}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 3,
                          backgroundColor: themeColors.success + '18',
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: BorderRadius.small,
                        }}
                      >
                        <Ionicons
                          name="add-circle"
                          size={14}
                          color={themeColors.success}
                        />
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '800',
                            color: themeColors.success,
                          }}
                        >
                          Nuevo Proyecto
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* Buscador */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: themeColors.backgroundElement,
                    borderWidth: 1,
                    borderColor: themeColors.border,
                    borderRadius: BorderRadius.medium,
                    paddingHorizontal: 10,
                    height: 40,
                  }}
                >
                  <Ionicons
                    name="search-outline"
                    size={16}
                    color={themeColors.textSecondary}
                    style={{ marginRight: 6 }}
                  />
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Buscar proyecto por nombre, cliente o sucursal..."
                    placeholderTextColor={themeColors.textSecondary}
                    style={{ flex: 1, color: themeColors.text, fontSize: 13 }}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                      <Ionicons
                        name="close-circle"
                        size={16}
                        color={themeColors.textSecondary}
                      />
                    </TouchableOpacity>
                  )}
                </View>

                <ScrollView
                  nestedScrollEnabled
                  style={{ maxHeight: 250 }}
                  contentContainerStyle={{ gap: 6, paddingVertical: 4 }}
                >
                  {filteredProyectos.map((proy) => {
                    const isSelected = selectedProyectoId === proy.id;
                    return (
                      <TouchableOpacity
                        key={proy.id}
                        onPress={() => setSelectedProyectoId(proy.id)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: 10,
                          borderRadius: BorderRadius.medium,
                          backgroundColor: isSelected
                            ? themeColors.primary + '18'
                            : themeColors.backgroundElement,
                          borderWidth: 1.5,
                          borderColor: isSelected
                            ? themeColors.primary
                            : themeColors.border,
                        }}
                      >
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 14,
                                fontWeight: '800',
                                color: isSelected
                                  ? themeColors.primary
                                  : themeColors.text,
                              }}
                            >
                              {proy.nombre}
                            </Text>
                            {proy.status === 'CERRADO' && (
                              <View
                                style={{
                                  backgroundColor: '#64748b25',
                                  paddingHorizontal: 6,
                                  paddingVertical: 1,
                                  borderRadius: 4,
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 9,
                                    fontWeight: '800',
                                    color: '#64748b',
                                  }}
                                >
                                  CERRADO
                                </Text>
                              </View>
                            )}
                          </View>
                          {(proy.cliente_nombre || proy.sucursal_nombre) && (
                            <Text
                              style={{
                                fontSize: 11,
                                color: themeColors.textSecondary,
                                marginTop: 2,
                              }}
                            >
                              {proy.cliente_nombre || 'Sin cliente'}
                              {proy.sucursal_nombre
                                ? ` • Sucursal: ${proy.sucursal_nombre}`
                                : ''}
                            </Text>
                          )}
                        </View>
                        <Ionicons
                          name={
                            isSelected ? 'checkmark-circle' : 'ellipse-outline'
                          }
                          size={20}
                          color={
                            isSelected
                              ? themeColors.primary
                              : themeColors.textSecondary
                          }
                        />
                      </TouchableOpacity>
                    );
                  })}

                  {filteredProyectos.length === 0 && (
                    <View
                      style={{
                        padding: Spacing.three,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons
                        name="folder-open-outline"
                        size={32}
                        color={themeColors.textSecondary}
                      />
                      <Text
                        style={{
                          fontSize: 13,
                          color: themeColors.textSecondary,
                          marginTop: 6,
                          textAlign: 'center',
                        }}
                      >
                        No se encontraron proyectos con ese filtro.
                      </Text>
                    </View>
                  )}
                </ScrollView>
              </View>
            )}

            {/* Footer */}
            <View
              style={{
                flexDirection: 'row',
                gap: Spacing.two,
                paddingTop: Spacing.two,
                marginTop: Spacing.two,
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
                title={
                  selectedTipo === 'OPERATIVO'
                    ? 'Guardar como Operativo'
                    : 'Asignar a Proyecto'
                }
                variant="primary"
                loading={isSaving}
                disabled={
                  isSaving ||
                  (selectedTipo === 'PROYECTO' && !selectedProyectoId)
                }
                onPress={handleSave}
                style={{ flex: 1.4 }}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
