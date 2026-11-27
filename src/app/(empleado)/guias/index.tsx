import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius, MaxContentWidth } from '@/constants/theme';
import { useGuiasOffline } from '@/features/guias/hooks/useGuiasOffline';
import { useGuiasProgressSummary } from '@/features/guias/hooks/usePersonalChecklist';
import { Guia, GUIA_TIPO_META, normalizeSearch } from '@/features/guias/types';

export default function EmpleadoGuiasScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const { categorias, guias, loading, syncing, isOffline, lastSyncedAt, refresh } =
    useGuiasOffline();
  const { summaryMap, refreshSummary } = useGuiasProgressSummary(guias);

  const [search, setSearch] = useState('');
  const [selectedCatId, setSelectedCatId] = useState<string>('ALL');

  useFocusEffect(
    useCallback(() => {
      void refreshSummary();
    }, [refreshSummary])
  );

  const filteredGuias = useMemo(() => {
    const q = normalizeSearch(search);
    return guias.filter((g) => {
      if (selectedCatId !== 'ALL' && g.categoria_id !== selectedCatId) return false;
      if (q) {
        const haystack = normalizeSearch(
          `${g.titulo} ${g.subtitulo || ''} ${g.categoria_nombre || ''} ${g.texto_busqueda || ''}`
        );
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [guias, search, selectedCatId]);

  const featuredGuias = useMemo(
    () => (search.trim() || selectedCatId !== 'ALL' ? [] : filteredGuias.filter((g) => g.destacada)),
    [filteredGuias, search, selectedCatId]
  );

  const regularGuias = useMemo(() => {
    if (featuredGuias.length === 0) return filteredGuias;
    const featuredIds = new Set(featuredGuias.map((f) => f.id));
    return filteredGuias.filter((g) => !featuredIds.has(g.id));
  }, [filteredGuias, featuredGuias]);

  const formattedSync = useMemo(() => {
    if (!lastSyncedAt) return null;
    try {
      return new Date(lastSyncedAt).toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return null;
    }
  }, [lastSyncedAt]);

  const renderGuiaCard = (guia: Guia) => {
    const tipoMeta = GUIA_TIPO_META[guia.tipo] || GUIA_TIPO_META.CHECKLIST_SITIO;
    const catColor = guia.categoria_color || tipoMeta.color;
    const progress = summaryMap[guia.id];
    const hasProgress = Boolean(progress && progress.total > 0);
    const pct = hasProgress ? Math.round((progress.completed / progress.total) * 100) : 0;

    return (
      <TouchableOpacity
        key={guia.id}
        activeOpacity={0.78}
        onPress={() => router.push(`/(empleado)/guias/${guia.id}` as any)}
        style={[
          styles.guiaCard,
          {
            backgroundColor: themeColors.backgroundElement,
            borderColor: themeColors.border,
          },
        ]}
      >
        <View style={[styles.cardIconBox, { backgroundColor: catColor + '18' }]}>
          <Ionicons
            name={(guia.icono as any) || (tipoMeta.icon as any)}
            size={24}
            color={catColor}
          />
        </View>

        <View style={styles.cardBody}>
          <View style={styles.cardBadges}>
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

          <Text style={[styles.cardTitle, { color: themeColors.text }]}>
            {guia.titulo}
          </Text>
          {Boolean(guia.subtitulo) && (
            <Text
              style={[styles.cardSub, { color: themeColors.textSecondary }]}
              numberOfLines={2}
            >
              {guia.subtitulo}
            </Text>
          )}

          {hasProgress && (
            <View style={styles.progressWrap}>
              <View style={[styles.progressTrack, { backgroundColor: themeColors.background }]}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${pct}%`,
                      backgroundColor: pct === 100 ? themeColors.success : themeColors.accent,
                    },
                  ]}
                />
              </View>
              <Text
                style={[
                  styles.progressLabel,
                  { color: pct === 100 ? themeColors.success : themeColors.textSecondary },
                ]}
              >
                {progress.completed}/{progress.total}
              </Text>
            </View>
          )}
        </View>

        <Ionicons name="chevron-forward" size={20} color={themeColors.textSecondary} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={syncing} onRefresh={() => void refresh()} />
        }
      >
        <View style={styles.inner}>
          {/* Estado offline / sincronización */}
          <View
            style={[
              styles.syncBar,
              {
                backgroundColor: isOffline ? '#f59e0b18' : '#16a34a14',
                borderColor: isOffline ? '#f59e0b55' : '#16a34a44',
              },
            ]}
          >
            <Ionicons
              name={isOffline ? 'cloud-offline-outline' : 'cloud-done-outline'}
              size={17}
              color={isOffline ? '#d97706' : '#16a34a'}
            />
            <Text style={[styles.syncText, { color: themeColors.text }]}>
              {isOffline
                ? 'Modo sin conexión — usando guías guardadas en tu dispositivo'
                : `Disponible offline${formattedSync ? ` • Sincronizado ${formattedSync}` : ''}`}
            </Text>
            <TouchableOpacity onPress={() => void refresh()} style={{ padding: 4 }}>
              <Ionicons name="refresh" size={17} color={themeColors.accent} />
            </TouchableOpacity>
          </View>

          {/* Buscador */}
          <View
            style={[
              styles.searchBox,
              { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
            ]}
          >
            <Ionicons name="search" size={19} color={themeColors.textSecondary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar guía, conector (MC4), medida (240x130), broca..."
              placeholderTextColor={themeColors.textSecondary}
              style={[styles.searchInput, { color: themeColors.text }]}
            />
            {Boolean(search) && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={19} color={themeColors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Chips de categoría */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsScroll}
          >
            <TouchableOpacity
              onPress={() => setSelectedCatId('ALL')}
              style={[
                styles.catChip,
                {
                  backgroundColor:
                    selectedCatId === 'ALL' ? themeColors.accent : themeColors.backgroundElement,
                  borderColor:
                    selectedCatId === 'ALL' ? themeColors.accent : themeColors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.catChipText,
                  { color: selectedCatId === 'ALL' ? '#fff' : themeColors.text },
                ]}
              >
                Todas
              </Text>
            </TouchableOpacity>

            {categorias.map((cat) => {
              const active = selectedCatId === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => setSelectedCatId(cat.id)}
                  style={[
                    styles.catChip,
                    {
                      backgroundColor: active ? cat.color : themeColors.backgroundElement,
                      borderColor: active ? cat.color : themeColors.border,
                    },
                  ]}
                >
                  <Ionicons
                    name={(cat.icono as any) || 'book-outline'}
                    size={15}
                    color={active ? '#fff' : cat.color}
                  />
                  <Text
                    style={[
                      styles.catChipText,
                      { color: active ? '#fff' : themeColors.text },
                    ]}
                  >
                    {cat.nombre}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={themeColors.accent} />
            </View>
          ) : filteredGuias.length === 0 ? (
            <View
              style={[
                styles.emptyCard,
                { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
              ]}
            >
              <Ionicons name="document-text-outline" size={38} color={themeColors.textSecondary} />
              <Text style={[styles.emptyTitle, { color: themeColors.text }]}>
                Sin resultados
              </Text>
              <Text style={[styles.emptySub, { color: themeColors.textSecondary }]}>
                {search
                  ? 'Prueba con otro término o limpia los filtros.'
                  : 'Aún no hay guías publicadas por administración.'}
              </Text>
            </View>
          ) : (
            <>
              {featuredGuias.length > 0 && (
                <View style={styles.sectionBlock}>
                  <Text style={[styles.sectionHeaderText, { color: themeColors.textSecondary }]}>
                    ★ ACCESO RÁPIDO / FIJADAS
                  </Text>
                  <View style={styles.listGap}>{featuredGuias.map(renderGuiaCard)}</View>
                </View>
              )}

              {regularGuias.length > 0 && (
                <View style={styles.sectionBlock}>
                  {featuredGuias.length > 0 && (
                    <Text style={[styles.sectionHeaderText, { color: themeColors.textSecondary }]}>
                      TODAS LAS GUÍAS Y CHECKLISTS
                    </Text>
                  )}
                  <View style={styles.listGap}>{regularGuias.map(renderGuiaCard)}</View>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
  },
  inner: {
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    gap: Spacing.two,
  },
  syncBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
  syncText: {
    fontSize: 12,
    flex: 1,
    fontWeight: '500',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: 12,
    height: 46,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  chipsScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
  catChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  centerBox: {
    padding: Spacing.six,
    alignItems: 'center',
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    padding: Spacing.five,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
  },
  sectionBlock: {
    gap: Spacing.one,
    marginTop: 4,
  },
  sectionHeaderText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  listGap: {
    gap: Spacing.two,
  },
  guiaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    padding: Spacing.three,
  },
  cardIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    gap: 4,
  },
  cardBadges: {
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
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  cardSub: {
    fontSize: 13,
    lineHeight: 18,
  },
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
});
