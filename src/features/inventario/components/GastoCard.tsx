import React from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { decodeHtmlEntities } from '@/utils/helpers';
import { styles } from './devolucionesStyles';
import { MaterialItem } from '../types';

interface GastoCardProps {
  m: MaterialItem;
  idx: number;
  themeColors: any;
  isExpanded: boolean;
  onToggleExpand: () => void;
  handleClearItem: (listType: 'devolucion' | 'gasto', idx: number) => void;
  handleDirectQty: (
    listType: 'devolucion' | 'gasto',
    idx: number,
    textOrNum: number | string
  ) => void;
  handleSetAllCondition: (
    listType: 'devolucion' | 'gasto',
    idx: number,
    field: 'cantidad_nuevo' | 'cantidad_usado' | 'cantidad_por_revisar' | 'all'
  ) => void;
  handleConditionChange: (
    listType: 'devolucion' | 'gasto',
    idx: number,
    field: 'cantidad_nuevo' | 'cantidad_usado' | 'cantidad_por_revisar',
    val: number | ''
  ) => void;
}

export default function GastoCard({
  m,
  idx,
  themeColors,
  isExpanded,
  onToggleExpand,
  handleClearItem,
  handleDirectQty,
  handleSetAllCondition,
  handleConditionChange,
}: GastoCardProps) {
  const qNuevo = typeof m.cantidad_nuevo === 'number' ? m.cantidad_nuevo : 0;
  const qUsado = typeof m.cantidad_usado === 'number' ? m.cantidad_usado : 0;
  const qPorRev = typeof m.cantidad_por_revisar === 'number' ? m.cantidad_por_revisar : 0;
  const currentTotal = m.cantidad || 0;
  const remainingInVan = Math.max(0, m.maximo - currentTotal);

  return (
    <View
      style={[
        styles.itemCard,
        {
          borderColor: currentTotal > 0 ? '#10B981' : themeColors.border,
          backgroundColor: themeColors.background,
          borderWidth: currentTotal > 0 ? 1.5 : 1,
        },
      ]}
    >
      {/* Encabezado del Producto */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 8,
        }}
      >
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={{ color: themeColors.text, fontWeight: '700', fontSize: 15 }}>
            {decodeHtmlEntities(m.nombre)}
          </Text>
          <Text style={{ color: themeColors.textSecondary, fontSize: 12, marginTop: 2 }}>
            SKU: {m.sku || '-'} • En posesión:{' '}
            <Text style={{ fontWeight: 'bold', color: '#10B981' }}>
              {m.maximo} {m.unidad}
            </Text>
          </Text>
        </View>

        {currentTotal > 0 && (
          <TouchableOpacity
            onPress={() => handleClearItem('gasto', idx)}
            style={{
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 6,
              backgroundColor: themeColors.danger + '15',
            }}
          >
            <Text style={{ fontSize: 11, color: themeColors.danger, fontWeight: '700' }}>
              Limpiar
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Control Directo de Cantidad Gastada */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 4,
          marginBottom: m.hasUsedOrDamaged ? 8 : 4,
          flexWrap: 'wrap',
          rowGap: 6,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: '600', color: themeColors.text, flex: 1, marginRight: 6 }}>
          Cantidad Utilizada:
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {currentTotal === 0 && (
            <TouchableOpacity
              style={[
                styles.quickAllChip,
                { borderColor: '#10B981', backgroundColor: '#10B98115' },
              ]}
              onPress={() => handleDirectQty('gasto', idx, m.maximo)}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#10B981' }}>
                Todo ({m.maximo})
              </Text>
            </TouchableOpacity>
          )}

          <View
            style={[
              styles.stepperContainer,
              {
                backgroundColor: themeColors.backgroundElement,
                borderColor: currentTotal > 0 ? '#10B981' : themeColors.border,
              },
            ]}
          >
            <TouchableOpacity
              style={[styles.stepperBtn, { backgroundColor: themeColors.danger + '18' }]}
              onPress={() => handleDirectQty('gasto', idx, Math.max(0, currentTotal - 1))}
              disabled={currentTotal <= 0}
            >
              <Ionicons
                name="remove"
                size={14}
                color={currentTotal > 0 ? themeColors.danger : themeColors.textSecondary}
              />
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
              onPress={() =>
                handleDirectQty('gasto', idx, Math.min(m.maximo, currentTotal + 1))
              }
              disabled={currentTotal >= m.maximo}
            >
              <Ionicons
                name="add"
                size={14}
                color={currentTotal < m.maximo ? '#10B981' : themeColors.textSecondary}
              />
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
            },
          ]}
          onPress={onToggleExpand}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, paddingRight: 6 }}>
            <Ionicons
              name={isExpanded ? 'layers' : 'layers-outline'}
              size={14}
              color={isExpanded ? '#10B981' : themeColors.textSecondary}
            />
            <Text
              style={{
                fontSize: 12,
                fontWeight: '700',
                color: isExpanded ? '#10B981' : themeColors.text,
                flexShrink: 1,
              }}
            >
              Desglose por condición (Nuevas, Usadas, Dañadas)
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {(qUsado > 0 || qPorRev > 0) && (
              <View
                style={{
                  backgroundColor: '#D9770620',
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 6,
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#D97706' }}>
                  {qUsado > 0 ? `Usadas: ${qUsado}` : ''}{' '}
                  {qPorRev > 0 ? `Dañadas: ${qPorRev}` : ''}
                </Text>
              </View>
            )}

            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={isExpanded ? '#10B981' : themeColors.textSecondary}
            />
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View
            style={[
              styles.cascadeBody,
              {
                backgroundColor: themeColors.backgroundElement,
                borderColor: themeColors.border,
              },
            ]}
          >
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {m.pos_nuevo > 0 && (
                <TouchableOpacity
                  onPress={() => handleSetAllCondition('gasto', idx, 'cantidad_nuevo')}
                  style={[
                    styles.quickPresetBtn,
                    { borderColor: '#10B981', backgroundColor: '#10B98115' },
                  ]}
                >
                  <Ionicons name="sparkles-outline" size={12} color="#10B981" />
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#10B981' }}>
                    Todo Nuevo ({m.pos_nuevo})
                  </Text>
                </TouchableOpacity>
              )}
              {m.pos_usado > 0 && (
                <TouchableOpacity
                  onPress={() => handleSetAllCondition('gasto', idx, 'cantidad_usado')}
                  style={[
                    styles.quickPresetBtn,
                    { borderColor: '#D97706', backgroundColor: '#D9770615' },
                  ]}
                >
                  <Ionicons name="refresh-outline" size={12} color="#D97706" />
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#D97706' }}>
                    Todo Usado ({m.pos_usado})
                  </Text>
                </TouchableOpacity>
              )}
              {m.pos_por_revisar > 0 && (
                <TouchableOpacity
                  onPress={() => handleSetAllCondition('gasto', idx, 'cantidad_por_revisar')}
                  style={[
                    styles.quickPresetBtn,
                    { borderColor: '#DC2626', backgroundColor: '#DC262615' },
                  ]}
                >
                  <Ionicons name="alert-circle-outline" size={12} color="#DC2626" />
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#DC2626' }}>
                    Todo Dañado ({m.pos_por_revisar})
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 1. Nuevas */}
            <View style={styles.conditionRow}>
              <View style={{ flex: 1, paddingRight: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: '#10B981',
                    }}
                  />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.text }}>
                    Nuevas Utilizadas
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 10,
                    color: themeColors.textSecondary,
                    marginLeft: 14,
                  }}
                >
                  En posesión:{' '}
                  <Text style={{ fontWeight: '700', color: themeColors.text }}>
                    {m.pos_nuevo} {m.unidad}
                  </Text>
                </Text>
              </View>
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
                  style={[styles.stepperBtn, { backgroundColor: themeColors.danger + '18' }]}
                  onPress={() =>
                    handleConditionChange(
                      'gasto',
                      idx,
                      'cantidad_nuevo',
                      Math.max(0, qNuevo - 1)
                    )
                  }
                  disabled={qNuevo <= 0}
                >
                  <Ionicons
                    name="remove"
                    size={14}
                    color={qNuevo > 0 ? themeColors.danger : themeColors.textSecondary}
                  />
                </TouchableOpacity>
                <TextInput
                  style={[styles.stepperInput, { color: themeColors.text }]}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  value={m.cantidad_nuevo === '' ? '' : String(m.cantidad_nuevo)}
                  placeholder="0"
                  placeholderTextColor={themeColors.textSecondary}
                  onChangeText={(val) => {
                    if (val.trim() === '')
                      handleConditionChange('gasto', idx, 'cantidad_nuevo', '');
                    else {
                      const num = parseFloat(val.replace(/[^0-9.]/g, ''));
                      handleConditionChange(
                        'gasto',
                        idx,
                        'cantidad_nuevo',
                        isNaN(num) ? '' : num
                      );
                    }
                  }}
                />
                <TouchableOpacity
                  style={[styles.stepperBtn, { backgroundColor: '#10B98120' }]}
                  onPress={() =>
                    handleConditionChange('gasto', idx, 'cantidad_nuevo', qNuevo + 1)
                  }
                  disabled={qNuevo >= m.pos_nuevo || remainingInVan <= 0}
                >
                  <Ionicons
                    name="add"
                    size={14}
                    color={
                      qNuevo < m.pos_nuevo && remainingInVan > 0
                        ? '#10B981'
                        : themeColors.textSecondary
                    }
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* 2. Usadas */}
            <View style={[styles.conditionRow, { marginTop: 8 }]}>
              <View style={{ flex: 1, paddingRight: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: '#D97706',
                    }}
                  />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.text }}>
                    Usadas Utilizadas
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 10,
                    color: themeColors.textSecondary,
                    marginLeft: 14,
                  }}
                >
                  En posesión:{' '}
                  <Text style={{ fontWeight: '700', color: themeColors.text }}>
                    {m.pos_usado} {m.unidad}
                  </Text>
                </Text>
              </View>
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
                  style={[styles.stepperBtn, { backgroundColor: themeColors.danger + '18' }]}
                  onPress={() =>
                    handleConditionChange(
                      'gasto',
                      idx,
                      'cantidad_usado',
                      Math.max(0, qUsado - 1)
                    )
                  }
                  disabled={qUsado <= 0}
                >
                  <Ionicons
                    name="remove"
                    size={14}
                    color={qUsado > 0 ? themeColors.danger : themeColors.textSecondary}
                  />
                </TouchableOpacity>
                <TextInput
                  style={[styles.stepperInput, { color: themeColors.text }]}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  value={m.cantidad_usado === '' ? '' : String(m.cantidad_usado)}
                  placeholder="0"
                  placeholderTextColor={themeColors.textSecondary}
                  onChangeText={(val) => {
                    if (val.trim() === '')
                      handleConditionChange('gasto', idx, 'cantidad_usado', '');
                    else {
                      const num = parseFloat(val.replace(/[^0-9.]/g, ''));
                      handleConditionChange(
                        'gasto',
                        idx,
                        'cantidad_usado',
                        isNaN(num) ? '' : num
                      );
                    }
                  }}
                />
                <TouchableOpacity
                  style={[styles.stepperBtn, { backgroundColor: '#10B98120' }]}
                  onPress={() =>
                    handleConditionChange('gasto', idx, 'cantidad_usado', qUsado + 1)
                  }
                  disabled={qUsado >= m.pos_usado || remainingInVan <= 0}
                >
                  <Ionicons
                    name="add"
                    size={14}
                    color={
                      qUsado < m.pos_usado && remainingInVan > 0
                        ? '#10B981'
                        : themeColors.textSecondary
                    }
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* 3. Dañadas */}
            <View style={[styles.conditionRow, { marginTop: 8 }]}>
              <View style={{ flex: 1, paddingRight: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: '#DC2626',
                    }}
                  />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.text }}>
                    Dañadas Utilizadas/Descartadas
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 10,
                    color: themeColors.textSecondary,
                    marginLeft: 14,
                  }}
                >
                  En posesión:{' '}
                  <Text style={{ fontWeight: '700', color: themeColors.text }}>
                    {m.pos_por_revisar} {m.unidad}
                  </Text>
                </Text>
              </View>
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
                  style={[styles.stepperBtn, { backgroundColor: themeColors.danger + '18' }]}
                  onPress={() =>
                    handleConditionChange(
                      'gasto',
                      idx,
                      'cantidad_por_revisar',
                      Math.max(0, qPorRev - 1)
                    )
                  }
                  disabled={qPorRev <= 0}
                >
                  <Ionicons
                    name="remove"
                    size={14}
                    color={qPorRev > 0 ? themeColors.danger : themeColors.textSecondary}
                  />
                </TouchableOpacity>
                <TextInput
                  style={[styles.stepperInput, { color: themeColors.text }]}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  value={m.cantidad_por_revisar === '' ? '' : String(m.cantidad_por_revisar)}
                  placeholder="0"
                  placeholderTextColor={themeColors.textSecondary}
                  onChangeText={(val) => {
                    if (val.trim() === '')
                      handleConditionChange('gasto', idx, 'cantidad_por_revisar', '');
                    else {
                      const num = parseFloat(val.replace(/[^0-9.]/g, ''));
                      handleConditionChange(
                        'gasto',
                        idx,
                        'cantidad_por_revisar',
                        isNaN(num) ? '' : num
                      );
                    }
                  }}
                />
                <TouchableOpacity
                  style={[styles.stepperBtn, { backgroundColor: '#10B98120' }]}
                  onPress={() =>
                    handleConditionChange('gasto', idx, 'cantidad_por_revisar', qPorRev + 1)
                  }
                  disabled={qPorRev >= m.pos_por_revisar || remainingInVan <= 0}
                >
                  <Ionicons
                    name="add"
                    size={14}
                    color={
                      qPorRev < m.pos_por_revisar && remainingInVan > 0
                        ? '#10B981'
                        : themeColors.textSecondary
                    }
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Resumen del Item */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 10,
          flexWrap: 'wrap',
          gap: 6,
        }}
      >
        <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
          Te quedarán en camioneta:{' '}
          <Text style={{ fontWeight: 'bold', color: themeColors.text }}>
            {remainingInVan} {m.unidad}
          </Text>
        </Text>
        <Text
          style={{
            fontSize: 13,
            fontWeight: '700',
            color: currentTotal > 0 ? '#10B981' : themeColors.textSecondary,
          }}
        >
          Consumo: {currentTotal} {m.unidad}
        </Text>
      </View>
    </View>
  );
}
