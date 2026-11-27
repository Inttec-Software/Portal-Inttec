import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { GuiaBlock, AlertaNivel } from '../types';
import SelectorVariantesBlock from './SelectorVariantesBlock';
import DiagramZoomModal from './DiagramZoomModal';

interface Props {
  bloques: GuiaBlock[];
  checkedMap: Record<string, boolean>;
  onToggleCheck: (key: string) => void;
  localImageMap?: Record<string, string>;
}

const ALERTA_STYLE: Record<
  AlertaNivel,
  { bg: string; border: string; icon: keyof typeof Ionicons.glyphMap; iconColor: string }
> = {
  critico: {
    bg: '#dc262615',
    border: '#dc2626',
    icon: 'warning',
    iconColor: '#dc2626',
  },
  precaucion: {
    bg: '#f59e0b18',
    border: '#d97706',
    icon: 'alert-circle',
    iconColor: '#d97706',
  },
  info: {
    bg: '#0284c715',
    border: '#0284c7',
    icon: 'information-circle',
    iconColor: '#0284c7',
  },
};

export default function GuiaBlockRenderer({
  bloques,
  checkedMap,
  onToggleCheck,
  localImageMap = {},
}: Props) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [zoomState, setZoomState] = useState<{
    visible: boolean;
    url: string | null;
    title?: string;
    description?: string;
  }>({ visible: false, url: null });

  const resolveImg = (url?: string) => {
    if (!url) return undefined;
    return localImageMap[url] || url;
  };

  const openZoom = (url: string, title?: string, description?: string) => {
    setZoomState({ visible: true, url, title, description });
  };

  return (
    <View style={styles.container}>
      {(bloques || []).map((block) => {
        if (block.type === 'alerta') {
          const cfg = ALERTA_STYLE[block.nivel || 'info'] || ALERTA_STYLE.info;
          return (
            <View
              key={block.id}
              style={[
                styles.alertaCard,
                {
                  backgroundColor: cfg.bg,
                  borderColor: cfg.border + '55',
                  borderLeftColor: cfg.border,
                },
              ]}
            >
              <View style={styles.alertaHeader}>
                <Ionicons name={cfg.icon} size={20} color={cfg.iconColor} />
                <Text style={[styles.alertaTitle, { color: cfg.iconColor }]}>
                  {block.titulo || 'Aviso'}
                </Text>
              </View>
              {Boolean(block.mensaje) && (
                <Text style={[styles.alertaMsg, { color: themeColors.text }]}>
                  {block.mensaje}
                </Text>
              )}
            </View>
          );
        }

        if (block.type === 'checklist') {
          const items = block.items || [];
          const doneCount = items.filter((it) =>
            Boolean(checkedMap[`${block.id}:${it.id}`])
          ).length;

          return (
            <View
              key={block.id}
              style={[
                styles.card,
                {
                  backgroundColor: themeColors.backgroundElement,
                  borderColor: themeColors.border,
                },
              ]}
            >
              <View style={styles.sectionHeader}>
                <View style={[styles.iconPill, { backgroundColor: '#16a34a18' }]}>
                  <Ionicons name="checkbox-outline" size={18} color="#16a34a" />
                </View>
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                  {block.titulo}
                </Text>
                <View style={[styles.counterPill, { backgroundColor: themeColors.background }]}>
                  <Text style={[styles.counterText, { color: themeColors.textSecondary }]}>
                    {doneCount}/{items.length}
                  </Text>
                </View>
              </View>

              <View style={styles.listGap}>
                {items.map((item) => {
                  const key = `${block.id}:${item.id}`;
                  const checked = Boolean(checkedMap[key]);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.75}
                      onPress={() => onToggleCheck(key)}
                      style={[
                        styles.checkRow,
                        {
                          backgroundColor: checked
                            ? themeColors.success + '14'
                            : themeColors.background,
                          borderColor: checked
                            ? themeColors.success
                            : item.critico
                              ? '#dc262666'
                              : themeColors.border,
                        },
                      ]}
                    >
                      <Ionicons
                        name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                        size={26}
                        color={
                          checked
                            ? themeColors.success
                            : item.critico
                              ? '#dc2626'
                              : themeColors.textSecondary
                        }
                      />
                      <View style={styles.checkBody}>
                        <View style={styles.checkTopLine}>
                          {Boolean(item.critico) && !checked && (
                            <View style={styles.criticoBadge}>
                              <Text style={styles.criticoBadgeText}>CRÍTICO</Text>
                            </View>
                          )}
                          {Boolean(item.cantidad) && (
                            <View
                              style={[
                                styles.qtyBadge,
                                { backgroundColor: themeColors.accent + '18' },
                              ]}
                            >
                              <Text style={[styles.qtyText, { color: themeColors.accent }]}>
                                x{item.cantidad}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text
                          style={[
                            styles.checkText,
                            {
                              color: themeColors.text,
                              textDecorationLine: checked ? 'line-through' : 'none',
                              opacity: checked ? 0.65 : 1,
                            },
                          ]}
                        >
                          {item.texto}
                        </Text>
                        {Boolean(item.nota) && (
                          <Text style={[styles.itemNote, { color: themeColors.textSecondary }]}>
                            {item.nota}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        }

        if (block.type === 'materiales') {
          const grupos = block.grupos || [];
          return (
            <View
              key={block.id}
              style={[
                styles.card,
                {
                  backgroundColor: themeColors.backgroundElement,
                  borderColor: themeColors.border,
                },
              ]}
            >
              <View style={styles.sectionHeader}>
                <View style={[styles.iconPill, { backgroundColor: '#0284c718' }]}>
                  <Ionicons name="hammer-outline" size={18} color="#0284c7" />
                </View>
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                  {block.titulo}
                </Text>
              </View>

              {grupos.map((grupo) => (
                <View key={grupo.id} style={styles.matGrupo}>
                  <Text style={[styles.matGrupoTitle, { color: themeColors.accent }]}>
                    {grupo.nombre}
                  </Text>
                  <View style={styles.listGap}>
                    {(grupo.items || []).map((item) => {
                      const key = `${block.id}:${grupo.id}:${item.id}`;
                      const checked = Boolean(checkedMap[key]);
                      return (
                        <TouchableOpacity
                          key={item.id}
                          activeOpacity={0.75}
                          onPress={() => onToggleCheck(key)}
                          style={[
                            styles.matRow,
                            {
                              backgroundColor: checked
                                ? themeColors.success + '14'
                                : themeColors.background,
                              borderColor: checked
                                ? themeColors.success
                                : themeColors.border,
                            },
                          ]}
                        >
                          <Ionicons
                            name={checked ? 'checkbox' : 'square-outline'}
                            size={22}
                            color={checked ? themeColors.success : themeColors.textSecondary}
                          />
                          {Boolean(item.cantidad) && (
                            <View
                              style={[
                                styles.qtyBadge,
                                { backgroundColor: themeColors.accent + '20' },
                              ]}
                            >
                              <Text style={[styles.qtyText, { color: themeColors.accent }]}>
                                {item.cantidad}
                              </Text>
                            </View>
                          )}
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.matName,
                                {
                                  color: themeColors.text,
                                  textDecorationLine: checked ? 'line-through' : 'none',
                                  opacity: checked ? 0.65 : 1,
                                },
                              ]}
                            >
                              {item.nombre}
                            </Text>
                            {Boolean(item.nota) && (
                              <Text style={[styles.itemNote, { color: themeColors.textSecondary }]}>
                                {item.nota}
                              </Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          );
        }

        if (block.type === 'pasos') {
          return (
            <View
              key={block.id}
              style={[
                styles.card,
                {
                  backgroundColor: themeColors.backgroundElement,
                  borderColor: themeColors.border,
                },
              ]}
            >
              <View style={styles.sectionHeader}>
                <View style={[styles.iconPill, { backgroundColor: '#7c3aed18' }]}>
                  <Ionicons name="list-outline" size={18} color="#7c3aed" />
                </View>
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                  {block.titulo}
                </Text>
              </View>

              <View style={styles.listGap}>
                {(block.pasos || []).map((paso, index) => {
                  const imgUri = resolveImg(paso.imagen_url);
                  return (
                    <View
                      key={paso.id}
                      style={[
                        styles.pasoCard,
                        {
                          backgroundColor: themeColors.background,
                          borderColor: themeColors.border,
                        },
                      ]}
                    >
                      <View style={styles.pasoHeader}>
                        <View style={[styles.stepNumber, { backgroundColor: themeColors.accent }]}>
                          <Text style={styles.stepNumberText}>{index + 1}</Text>
                        </View>
                        <Text style={[styles.pasoTitle, { color: themeColors.text }]}>
                          {paso.titulo || `Paso ${index + 1}`}
                        </Text>
                      </View>
                      {Boolean(paso.detalle) && (
                        <Text style={[styles.pasoDetalle, { color: themeColors.textSecondary }]}>
                          {paso.detalle}
                        </Text>
                      )}
                      {imgUri && (
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => openZoom(imgUri, paso.titulo, paso.detalle)}
                          style={[styles.imgBox, { borderColor: themeColors.border }]}
                        >
                          <Image source={{ uri: imgUri }} style={styles.pasoImg} resizeMode="contain" />
                          <View style={styles.zoomBadge}>
                            <Ionicons name="expand-outline" size={13} color="#fff" />
                            <Text style={styles.zoomBadgeText}>Ampliar</Text>
                          </View>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          );
        }

        if (block.type === 'diagrama') {
          const imgUri = resolveImg(block.imagen_url);
          if (!imgUri) return null;
          return (
            <View
              key={block.id}
              style={[
                styles.card,
                {
                  backgroundColor: themeColors.backgroundElement,
                  borderColor: themeColors.border,
                },
              ]}
            >
              <View style={styles.sectionHeader}>
                <View style={[styles.iconPill, { backgroundColor: '#ea580c18' }]}>
                  <Ionicons name="image-outline" size={18} color="#ea580c" />
                </View>
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                  {block.titulo}
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => openZoom(imgUri, block.titulo, block.descripcion)}
                style={[styles.imgBox, { borderColor: themeColors.border }]}
              >
                <Image source={{ uri: imgUri }} style={styles.diagramImg} resizeMode="contain" />
                <View style={styles.zoomBadge}>
                  <Ionicons name="expand-outline" size={14} color="#fff" />
                  <Text style={styles.zoomBadgeText}>Toca para hacer zoom</Text>
                </View>
              </TouchableOpacity>

              {Boolean(block.descripcion) && (
                <Text style={[styles.diagramDesc, { color: themeColors.textSecondary }]}>
                  {block.descripcion}
                </Text>
              )}
            </View>
          );
        }

        if (block.type === 'selector_variantes') {
          return (
            <SelectorVariantesBlock
              key={block.id}
              block={block}
              localImageMap={localImageMap}
              onOpenImage={openZoom}
            />
          );
        }

        return null;
      })}

      <DiagramZoomModal
        visible={zoomState.visible}
        imageUrl={zoomState.url}
        title={zoomState.title}
        description={zoomState.description}
        onClose={() => setZoomState({ visible: false, url: null })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  card: {
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  alertaCard: {
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    borderLeftWidth: 5,
    padding: Spacing.three,
    gap: 6,
  },
  alertaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alertaTitle: {
    fontSize: 15,
    fontWeight: '800',
    flex: 1,
  },
  alertaMsg: {
    fontSize: 14,
    lineHeight: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  iconPill: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  counterPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  counterText: {
    fontSize: 12,
    fontWeight: '700',
  },
  listGap: {
    gap: 8,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    minHeight: 54,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
  },
  checkBody: {
    flex: 1,
    gap: 3,
  },
  checkTopLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  criticoBadge: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  criticoBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  qtyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  qtyText: {
    fontSize: 12,
    fontWeight: '800',
  },
  checkText: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 21,
  },
  itemNote: {
    fontSize: 12,
    lineHeight: 17,
  },
  matGrupo: {
    gap: 8,
    marginTop: 4,
  },
  matGrupoTitle: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  matRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
  },
  matName: {
    fontSize: 14,
    fontWeight: '600',
  },
  pasoCard: {
    borderRadius: BorderRadius.small,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  pasoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  pasoTitle: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  pasoDetalle: {
    fontSize: 14,
    lineHeight: 20,
    paddingLeft: 36,
  },
  imgBox: {
    borderRadius: BorderRadius.small,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: '#0f172a0a',
  },
  pasoImg: {
    width: '100%',
    height: 180,
  },
  diagramImg: {
    width: '100%',
    height: 240,
  },
  zoomBadge: {
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
  zoomBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  diagramDesc: {
    fontSize: 13,
    lineHeight: 19,
  },
});
