import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { GuiaBlock, VarianteConfig } from '../types';

type SelectorBlock = Extract<GuiaBlock, { type: 'selector_variantes' }>;

interface Props {
  block: SelectorBlock;
  localImageMap?: Record<string, string>;
  onOpenImage?: (url: string, title?: string, description?: string) => void;
}

export default function SelectorVariantesBlock({
  block,
  localImageMap = {},
  onOpenImage,
}: Props) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const variantes = useMemo(
    () => (Array.isArray(block.variantes) ? block.variantes : []),
    [block.variantes]
  );

  const opciones1 = useMemo(
    () => Array.from(new Set(variantes.map((v) => v.valor_1).filter(Boolean))),
    [variantes]
  );

  const [rawSel1, setRawSel1] = useState<string>('');
  const sel1 = opciones1.includes(rawSel1) ? rawSel1 : (opciones1[0] || '');

  const opciones2 = useMemo(
    () =>
      Array.from(
        new Set(
          variantes
            .filter((v) => !sel1 || v.valor_1 === sel1)
            .map((v) => v.valor_2)
            .filter(Boolean)
        )
      ),
    [variantes, sel1]
  );

  const [rawSel2, setRawSel2] = useState<string>('');
  const sel2 = opciones2.includes(rawSel2) ? rawSel2 : (opciones2[0] || '');

  const opciones3 = useMemo(
    () =>
      Array.from(
        new Set(
          variantes
            .filter(
              (v) => (!sel1 || v.valor_1 === sel1) && (!sel2 || v.valor_2 === sel2)
            )
            .map((v) => v.valor_3 || '')
            .filter(Boolean)
        )
      ),
    [variantes, sel1, sel2]
  );

  const [rawSel3, setRawSel3] = useState<string>('');
  const sel3 =
    opciones3.length === 0
      ? ''
      : opciones3.includes(rawSel3)
        ? rawSel3
        : (opciones3[0] || '');

  const activeVariante: VarianteConfig | undefined = useMemo(() => {
    return (
      variantes.find(
        (v) =>
          v.valor_1 === sel1 &&
          v.valor_2 === sel2 &&
          (opciones3.length === 0 || (v.valor_3 || '') === sel3)
      ) || variantes[0]
    );
  }, [variantes, sel1, sel2, sel3, opciones3.length]);

  const [localChecks, setLocalChecks] = useState<Record<string, boolean>>({});
  const toggleMatCheck = (idx: number) => {
    const key = `${activeVariante?.id || 'v'}_${idx}`;
    setLocalChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (variantes.length === 0) {
    return null;
  }

  const resolvedImg = activeVariante?.imagen_url
    ? localImageMap[activeVariante.imagen_url] || activeVariante.imagen_url
    : undefined;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: themeColors.backgroundElement,
          borderColor: themeColors.border,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.iconBadge, { backgroundColor: themeColors.accent + '18' }]}>
          <Ionicons name="options-outline" size={20} color={themeColors.accent} />
        </View>
        <Text style={[styles.blockTitle, { color: themeColors.text }]}>
          {block.titulo || 'Selector de Medidas'}
        </Text>
      </View>

      {/* Filtro 1 */}
      {opciones1.length > 0 && (
        <View style={styles.filterGroup}>
          <Text style={[styles.filterLabel, { color: themeColors.textSecondary }]}>
            {block.etiqueta_filtro_1 || 'Opción 1'}
          </Text>
          <View style={styles.chipsWrap}>
            {opciones1.map((opt) => {
              const active = opt === sel1;
              return (
                <TouchableOpacity
                  key={opt}
                  activeOpacity={0.75}
                  onPress={() => setRawSel1(opt)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active
                        ? themeColors.accent
                        : themeColors.background,
                      borderColor: active ? themeColors.accent : themeColors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: active ? '#ffffff' : themeColors.text },
                    ]}
                  >
                    {opt}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Filtro 2 */}
      {opciones2.length > 0 && (
        <View style={styles.filterGroup}>
          <Text style={[styles.filterLabel, { color: themeColors.textSecondary }]}>
            {block.etiqueta_filtro_2 || 'Opción 2'}
          </Text>
          <View style={styles.chipsWrap}>
            {opciones2.map((opt) => {
              const active = opt === sel2;
              return (
                <TouchableOpacity
                  key={opt}
                  activeOpacity={0.75}
                  onPress={() => setRawSel2(opt)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active
                        ? themeColors.accent
                        : themeColors.background,
                      borderColor: active ? themeColors.accent : themeColors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: active ? '#ffffff' : themeColors.text },
                    ]}
                  >
                    {opt}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Filtro 3 */}
      {opciones3.length > 0 && (
        <View style={styles.filterGroup}>
          <Text style={[styles.filterLabel, { color: themeColors.textSecondary }]}>
            {block.etiqueta_filtro_3 || 'Opción 3'}
          </Text>
          <View style={styles.chipsWrap}>
            {opciones3.map((opt) => {
              const active = opt === sel3;
              return (
                <TouchableOpacity
                  key={opt}
                  activeOpacity={0.75}
                  onPress={() => setRawSel3(opt)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active
                        ? themeColors.accent
                        : themeColors.background,
                      borderColor: active ? themeColors.accent : themeColors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: active ? '#ffffff' : themeColors.text },
                    ]}
                  >
                    {opt}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Resultado de la variante seleccionada */}
      {activeVariante && (
        <View
          style={[
            styles.resultBox,
            {
              backgroundColor: themeColors.background,
              borderColor: themeColors.border,
            },
          ]}
        >
          <View style={styles.resultHeader}>
            <Ionicons name="checkmark-circle" size={18} color={themeColors.success} />
            <Text style={[styles.resultSummary, { color: themeColors.text }]}>
              {[activeVariante.valor_1, activeVariante.valor_2, activeVariante.valor_3]
                .filter(Boolean)
                .join('  •  ')}
            </Text>
          </View>

          {/* Cortes */}
          {activeVariante.cortes && activeVariante.cortes.length > 0 && (
            <View style={styles.subSection}>
              <Text style={[styles.subSectionTitle, { color: themeColors.accent }]}>
                CORTES Y MEDIDAS
              </Text>
              {activeVariante.cortes.map((corte, idx) => (
                <View
                  key={`${corte.pieza}_${idx}`}
                  style={[
                    styles.corteRow,
                    {
                      backgroundColor: themeColors.backgroundElement,
                      borderColor: themeColors.border,
                    },
                  ]}
                >
                  <View style={styles.corteBadge}>
                    <Ionicons name="cut-outline" size={14} color="#d97706" />
                    <Text style={styles.cortePieza}>{corte.pieza}</Text>
                  </View>
                  <Text style={[styles.corteInst, { color: themeColors.text }]}>
                    {corte.instruccion}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Materiales / Herrajes */}
          {activeVariante.materiales && activeVariante.materiales.length > 0 && (
            <View style={styles.subSection}>
              <Text style={[styles.subSectionTitle, { color: themeColors.accent }]}>
                MATERIAL Y HERRAJES REQUERIDOS (toca para marcar)
              </Text>
              <View style={styles.matGrid}>
                {activeVariante.materiales.map((mat, idx) => {
                  const key = `${activeVariante.id}_${idx}`;
                  const checked = Boolean(localChecks[key]);
                  return (
                    <TouchableOpacity
                      key={`${mat.nombre}_${idx}`}
                      activeOpacity={0.75}
                      onPress={() => toggleMatCheck(idx)}
                      style={[
                        styles.matChip,
                        {
                          backgroundColor: checked
                            ? themeColors.success + '18'
                            : themeColors.backgroundElement,
                          borderColor: checked
                            ? themeColors.success
                            : themeColors.border,
                        },
                      ]}
                    >
                      <Ionicons
                        name={checked ? 'checkbox' : 'square-outline'}
                        size={18}
                        color={checked ? themeColors.success : themeColors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.matQty,
                          { color: checked ? themeColors.success : themeColors.accent },
                        ]}
                      >
                        {mat.cantidad}
                      </Text>
                      <Text
                        style={[
                          styles.matName,
                          {
                            color: themeColors.text,
                            textDecorationLine: checked ? 'line-through' : 'none',
                            opacity: checked ? 0.7 : 1,
                          },
                        ]}
                      >
                        {mat.nombre}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Diagrama de la variante */}
          {resolvedImg && (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() =>
                onOpenImage?.(
                  resolvedImg,
                  `${activeVariante.valor_1} • ${activeVariante.valor_2}`,
                  activeVariante.valor_3
                )
              }
              style={[styles.diagramWrapper, { borderColor: themeColors.border }]}
            >
              <Image
                source={{ uri: resolvedImg }}
                style={styles.diagramImg}
                resizeMode="contain"
              />
              <View style={styles.zoomHint}>
                <Ionicons name="expand-outline" size={14} color="#fff" />
                <Text style={styles.zoomHintText}>Toca para ampliar</Text>
              </View>
            </TouchableOpacity>
          )}

          {Boolean(activeVariante.notas) && (
            <View
              style={[
                styles.noteBox,
                { backgroundColor: themeColors.warning + '18', borderColor: themeColors.warning },
              ]}
            >
              <Ionicons name="information-circle-outline" size={16} color={themeColors.warning} />
              <Text style={[styles.noteText, { color: themeColors.text }]}>
                {activeVariante.notas}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockTitle: {
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  filterGroup: {
    gap: 6,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '700',
  },
  resultBox: {
    marginTop: 4,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    padding: Spacing.two,
    gap: Spacing.two,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resultSummary: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  subSection: {
    gap: 8,
  },
  subSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  corteRow: {
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    padding: 10,
    gap: 4,
  },
  corteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  cortePieza: {
    fontSize: 13,
    fontWeight: '700',
    color: '#d97706',
  },
  corteInst: {
    fontSize: 14,
    lineHeight: 20,
  },
  matGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  matChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
  },
  matQty: {
    fontSize: 14,
    fontWeight: '800',
  },
  matName: {
    fontSize: 13,
    fontWeight: '600',
  },
  diagramWrapper: {
    borderRadius: BorderRadius.small,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: '#0f172a0a',
  },
  diagramImg: {
    width: '100%',
    height: 220,
  },
  zoomHint: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  zoomHintText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
  },
  noteText: {
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
});
