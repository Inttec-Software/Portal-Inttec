import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius, MaxContentWidth } from '@/constants/theme';
import { useGuiasOffline } from '@/features/guias/hooks/useGuiasOffline';
import { usePersonalChecklist } from '@/features/guias/hooks/usePersonalChecklist';
import { GuiasService } from '@/features/guias/api/guiasService';
import GuiaBlockRenderer from '@/features/guias/components/GuiaBlockRenderer';
import { Guia, GUIA_TIPO_META } from '@/features/guias/types';

export default function EmpleadoGuiaDetalleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const guiaId = typeof params.id === 'string' ? params.id : undefined;

  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const { getGuiaByIdLocal, localImageMap, loading: offlineLoading } = useGuiasOffline();
  const [fallbackGuia, setFallbackGuia] = useState<Guia | null>(null);
  const [fetchingRemote, setFetchingRemote] = useState(false);

  const cachedGuia = guiaId ? getGuiaByIdLocal(guiaId) : undefined;
  const guia = cachedGuia || fallbackGuia;

  useEffect(() => {
    let active = true;
    if (!guiaId || cachedGuia || offlineLoading) return;

    const loadRemote = async () => {
      setFetchingRemote(true);
      try {
        const res = await GuiasService.getGuiaById(guiaId);
        if (active) setFallbackGuia(res);
      } catch {
        // fallback vacío si está offline
      } finally {
        if (active) setFetchingRemote(false);
      }
    };
    void loadRemote();

    return () => {
      active = false;
    };
  }, [guiaId, cachedGuia, offlineLoading]);

  const {
    checkedMap,
    toggleItem,
    resetAll,
    totalCount,
    completedCount,
    progressPercent,
  } = usePersonalChecklist(guia?.id, guia?.bloques || []);

  if ((offlineLoading || fetchingRemote) && !guia) {
    return (
      <View style={[styles.center, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color={themeColors.accent} />
      </View>
    );
  }

  if (!guia) {
    return (
      <View style={[styles.center, { backgroundColor: themeColors.background, padding: 24 }]}>
        <Ionicons name="alert-circle-outline" size={44} color={themeColors.textSecondary} />
        <Text style={[styles.notFoundTitle, { color: themeColors.text }]}>
          Guía no encontrada
        </Text>
        <TouchableOpacity
          onPress={() => router.replace('/(empleado)/guias' as any)}
          style={[styles.backBtn, { backgroundColor: themeColors.accent }]}
        >
          <Text style={styles.backBtnText}>Volver a Guías</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const tipoMeta = GUIA_TIPO_META[guia.tipo] || GUIA_TIPO_META.CHECKLIST_SITIO;
  const catColor = guia.categoria_color || tipoMeta.color;

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Cabecera sticky con barra de progreso y reiniciar */}
      <View
        style={[
          styles.stickyHeader,
          { backgroundColor: themeColors.backgroundElement, borderBottomColor: themeColors.border },
        ]}
      >
        <View style={styles.stickyInner}>
          <View style={styles.headerTopRow}>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={styles.badgesRow}>
                {Boolean(guia.categoria_nombre) && (
                  <View style={[styles.badge, { backgroundColor: catColor + '18' }]}>
                    <Text style={[styles.badgeText, { color: catColor }]}>
                      {guia.categoria_nombre}
                    </Text>
                  </View>
                )}
                <View style={[styles.badge, { backgroundColor: tipoMeta.color + '15' }]}>
                  <Text style={[styles.badgeText, { color: tipoMeta.color }]}>
                    {tipoMeta.shortLabel}
                  </Text>
                </View>
              </View>
              <Text style={[styles.title, { color: themeColors.text }]}>{guia.titulo}</Text>
              {Boolean(guia.subtitulo) && (
                <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
                  {guia.subtitulo}
                </Text>
              )}
            </View>
          </View>

          {totalCount > 0 && (
            <View style={styles.progressBarContainer}>
              <View style={styles.progressInfoRow}>
                <Text style={[styles.progressText, { color: themeColors.text }]}>
                  Progreso personal:{' '}
                  <Text
                    style={{
                      fontWeight: '800',
                      color:
                        progressPercent === 100 ? themeColors.success : themeColors.accent,
                    }}
                  >
                    {completedCount}/{totalCount} ({progressPercent}%)
                  </Text>
                </Text>

                {completedCount > 0 && (
                  <TouchableOpacity
                    onPress={resetAll}
                    style={[styles.resetBtn, { borderColor: themeColors.border }]}
                  >
                    <Ionicons name="refresh-outline" size={14} color={themeColors.text} />
                    <Text style={[styles.resetBtnText, { color: themeColors.text }]}>
                      Reiniciar
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={[styles.track, { backgroundColor: themeColors.background }]}>
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${progressPercent}%`,
                      backgroundColor:
                        progressPercent === 100 ? themeColors.success : themeColors.accent,
                    },
                  ]}
                />
              </View>
            </View>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.inner}>
          <GuiaBlockRenderer
            bloques={guia.bloques || []}
            checkedMap={checkedMap}
            onToggleCheck={toggleItem}
            localImageMap={localImageMap}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  notFoundTitle: { fontSize: 17, fontWeight: '700' },
  backBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: BorderRadius.small,
  },
  backBtnText: { color: '#fff', fontWeight: '700' },
  stickyHeader: {
    borderBottomWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  stickyInner: {
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    gap: 10,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  progressBarContainer: {
    gap: 6,
  },
  progressInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressText: {
    fontSize: 13,
    fontWeight: '600',
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  resetBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
  scrollContent: {
    padding: Spacing.three,
    paddingBottom: Spacing.seven,
  },
  inner: {
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
});
