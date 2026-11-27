import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Alert,
  Platform,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius, MaxContentWidth } from '@/constants/theme';
import { GuiasService } from '@/features/guias/api/guiasService';
import {
  Guia,
  GuiaCategoria,
  GUIA_TIPO_META,
  GUIA_TEMPLATES,
  GuiaTemplateKey,
  CATEGORIA_ICONOS,
  CATEGORIA_COLORES,
  normalizeSearch,
  countCheckableItems,
} from '@/features/guias/types';

export default function AdminGuiasScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [categorias, setCategorias] = useState<GuiaCategoria[]>([]);
  const [guias, setGuias] = useState<Guia[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState('');
  const [selectedCatId, setSelectedCatId] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PUBLISHED' | 'DRAFT'>('ALL');

  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [catModalVisible, setCatModalVisible] = useState(false);

  // Estado formulario categoría
  const [editingCat, setEditingCat] = useState<GuiaCategoria | null>(null);
  const [catNombre, setCatNombre] = useState('');
  const [catIcono, setCatIcono] = useState(CATEGORIA_ICONOS[0]);
  const [catColor, setCatColor] = useState(CATEGORIA_COLORES[0]);
  const [savingCat, setSavingCat] = useState(false);

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [cats, list] = await Promise.all([
        GuiasService.getCategorias(true),
        GuiasService.getGuias(true),
      ]);
      setCategorias(Array.isArray(cats) ? cats : []);
      setGuias(Array.isArray(list) ? list : []);
    } catch (err: any) {
      console.error('[AdminGuias] Error cargando datos:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadAll(false);
    }, [loadAll])
  );

  const filteredGuias = useMemo(() => {
    const q = normalizeSearch(search);
    return guias.filter((g) => {
      if (selectedCatId !== 'ALL' && g.categoria_id !== selectedCatId) return false;
      if (statusFilter === 'PUBLISHED' && !g.publicada) return false;
      if (statusFilter === 'DRAFT' && g.publicada) return false;
      if (q) {
        const haystack = normalizeSearch(
          `${g.titulo} ${g.subtitulo || ''} ${g.texto_busqueda || ''}`
        );
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [guias, search, selectedCatId, statusFilter]);

  const confirmAction = (title: string, msg: string, onConfirm: () => void) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${msg}`)) {
        onConfirm();
      }
    } else {
      Alert.alert(title, msg, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', style: 'destructive', onPress: onConfirm },
      ]);
    }
  };

  const handleTogglePublished = async (guia: Guia) => {
    try {
      await GuiasService.updateGuia(guia.id, {
        categoria_id: guia.categoria_id,
        titulo: guia.titulo,
        subtitulo: guia.subtitulo || '',
        tipo: guia.tipo,
        icono: guia.icono || 'document-text-outline',
        bloques: guia.bloques || [],
        destacada: guia.destacada,
        publicada: !guia.publicada,
        orden: guia.orden,
      });
      await loadAll(true);
    } catch (err: any) {
      const msg = err?.message || 'No se pudo cambiar el estado.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    }
  };

  const handleToggleFeatured = async (guia: Guia) => {
    try {
      await GuiasService.updateGuia(guia.id, {
        categoria_id: guia.categoria_id,
        titulo: guia.titulo,
        subtitulo: guia.subtitulo || '',
        tipo: guia.tipo,
        icono: guia.icono || 'document-text-outline',
        bloques: guia.bloques || [],
        destacada: !guia.destacada,
        publicada: guia.publicada,
        orden: guia.orden,
      });
      await loadAll(true);
    } catch (err: any) {
      const msg = err?.message || 'No se pudo actualizar.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    }
  };

  const handleDuplicate = async (guia: Guia) => {
    try {
      await GuiasService.createGuia({
        categoria_id: guia.categoria_id,
        titulo: `${guia.titulo} (Copia)`,
        subtitulo: guia.subtitulo || '',
        tipo: guia.tipo,
        icono: guia.icono || 'document-text-outline',
        bloques: guia.bloques || [],
        destacada: false,
        publicada: false,
        orden: guia.orden + 1,
      });
      await loadAll(true);
    } catch (err: any) {
      const msg = err?.message || 'No se pudo duplicar la guía.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    }
  };

  const handleDeleteGuia = (guia: Guia) => {
    confirmAction('Eliminar guía', `¿Eliminar permanentemente "${guia.titulo}"?`, () => {
      void GuiasService.deleteGuia(guia.id).then(() => loadAll(true));
    });
  };

  const openCatForm = (cat: GuiaCategoria | null) => {
    setEditingCat(cat);
    setCatNombre(cat?.nombre || '');
    setCatIcono(cat?.icono || CATEGORIA_ICONOS[0]);
    setCatColor(cat?.color || CATEGORIA_COLORES[0]);
  };

  const handleSaveCategoria = async () => {
    if (!catNombre.trim()) return;
    setSavingCat(true);
    try {
      if (editingCat) {
        await GuiasService.updateCategoria(editingCat.id, {
          nombre: catNombre.trim(),
          icono: catIcono,
          color: catColor,
        });
      } else {
        await GuiasService.createCategoria({
          nombre: catNombre.trim(),
          icono: catIcono,
          color: catColor,
          orden: categorias.length + 1,
        });
      }
      openCatForm(null);
      await loadAll(true);
    } catch (err: any) {
      const msg = err?.message || 'No se pudo guardar la categoría.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    } finally {
      setSavingCat(false);
    }
  };

  const handleDeleteCategoria = (cat: GuiaCategoria) => {
    confirmAction(
      'Eliminar categoría',
      `¿Eliminar "${cat.nombre}"? Las guías asociadas quedarán sin categoría.`,
      () => {
        void GuiasService.deleteCategoria(cat.id).then(() => loadAll(true));
      }
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void loadAll(true)} />
        }
      >
        <View style={styles.inner}>
          {/* Acciones principales */}
          <View style={styles.topActionsRow}>
            <TouchableOpacity
              onPress={() => setTemplateModalVisible(true)}
              style={[styles.primaryBtn, { backgroundColor: themeColors.accent }]}
            >
              <Ionicons name="add-circle-outline" size={20} color="#fff" />
              <Text style={styles.primaryBtnText}>Nueva Guía</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                openCatForm(null);
                setCatModalVisible(true);
              }}
              style={[
                styles.outlineBtn,
                { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
              ]}
            >
              <Ionicons name="pricetags-outline" size={18} color={themeColors.text} />
              <Text style={[styles.outlineBtnText, { color: themeColors.text }]}>
                Categorías ({categorias.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Buscador */}
          <View
            style={[
              styles.searchBox,
              { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
            ]}
          >
            <Ionicons name="search" size={18} color={themeColors.textSecondary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar por título, herramienta, medida (ej. MC4, 240x130)..."
              placeholderTextColor={themeColors.textSecondary}
              style={[styles.searchInput, { color: themeColors.text }]}
            />
            {Boolean(search) && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color={themeColors.textSecondary} />
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
                Todas ({guias.length})
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

          {/* Filtro estado */}
          <View style={styles.statusTabs}>
            {(
              [
                { key: 'ALL', label: 'Todas' },
                { key: 'PUBLISHED', label: 'Publicadas' },
                { key: 'DRAFT', label: 'Borradores' },
              ] as const
            ).map((tab) => {
              const active = statusFilter === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setStatusFilter(tab.key)}
                  style={[
                    styles.statusTab,
                    {
                      backgroundColor: active
                        ? themeColors.accent + '18'
                        : 'transparent',
                      borderColor: active ? themeColors.accent : themeColors.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: active ? themeColors.accent : themeColors.textSecondary,
                    }}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Listado */}
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
              <Ionicons name="book-outline" size={38} color={themeColors.textSecondary} />
              <Text style={[styles.emptyTitle, { color: themeColors.text }]}>
                No hay guías para mostrar
              </Text>
              <Text style={[styles.emptySub, { color: themeColors.textSecondary }]}>
                Crea una nueva guía con bloques interactivos usando el botón &quot;Nueva Guía&quot;.
              </Text>
            </View>
          ) : (
            <View style={styles.cardsList}>
              {filteredGuias.map((g) => {
                const tipoMeta = GUIA_TIPO_META[g.tipo] || GUIA_TIPO_META.CHECKLIST_SITIO;
                const checkCount = countCheckableItems(g.bloques || []);
                const catColor = g.categoria_color || tipoMeta.color;

                return (
                  <View
                    key={g.id}
                    style={[
                      styles.guiaCard,
                      {
                        backgroundColor: themeColors.backgroundElement,
                        borderColor: themeColors.border,
                      },
                    ]}
                  >
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => router.push(`/(admin)/guias/editor?id=${g.id}` as any)}
                      style={styles.guiaCardMain}
                    >
                      <View style={[styles.guiaIconBox, { backgroundColor: catColor + '18' }]}>
                        <Ionicons
                          name={(g.icono as any) || (tipoMeta.icon as any)}
                          size={22}
                          color={catColor}
                        />
                      </View>

                      <View style={styles.guiaInfo}>
                        <View style={styles.badgesRow}>
                          {Boolean(g.categoria_nombre) && (
                            <View style={[styles.miniPill, { backgroundColor: catColor + '18' }]}>
                              <Text style={[styles.miniPillText, { color: catColor }]}>
                                {g.categoria_nombre}
                              </Text>
                            </View>
                          )}
                          <View
                            style={[
                              styles.miniPill,
                              {
                                backgroundColor: g.publicada ? '#16a34a18' : '#f59e0b22',
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.miniPillText,
                                { color: g.publicada ? '#16a34a' : '#d97706' },
                              ]}
                            >
                              {g.publicada ? 'Publicada' : 'Borrador'}
                            </Text>
                          </View>
                          {g.destacada && (
                            <View style={[styles.miniPill, { backgroundColor: '#f59e0b20' }]}>
                              <Text style={[styles.miniPillText, { color: '#d97706' }]}>
                                ★ Fijada
                              </Text>
                            </View>
                          )}
                        </View>

                        <Text style={[styles.guiaTitle, { color: themeColors.text }]}>
                          {g.titulo}
                        </Text>
                        {Boolean(g.subtitulo) && (
                          <Text
                            style={[styles.guiaSub, { color: themeColors.textSecondary }]}
                            numberOfLines={2}
                          >
                            {g.subtitulo}
                          </Text>
                        )}
                        <Text style={[styles.guiaMeta, { color: themeColors.textSecondary }]}>
                          {(g.bloques || []).length} bloques • {checkCount} puntos marcables
                        </Text>
                      </View>
                    </TouchableOpacity>

                    {/* Acciones */}
                    <View
                      style={[
                        styles.cardActions,
                        { borderTopColor: themeColors.border },
                      ]}
                    >
                      <TouchableOpacity
                        onPress={() => router.push(`/(admin)/guias/editor?id=${g.id}` as any)}
                        style={styles.cardActionBtn}
                      >
                        <Ionicons name="create-outline" size={16} color={themeColors.accent} />
                        <Text style={[styles.cardActionText, { color: themeColors.accent }]}>
                          Editar
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => void handleToggleFeatured(g)}
                        style={styles.cardActionBtn}
                      >
                        <Ionicons
                          name={g.destacada ? 'star' : 'star-outline'}
                          size={16}
                          color="#d97706"
                        />
                        <Text style={[styles.cardActionText, { color: '#d97706' }]}>
                          {g.destacada ? 'Fijada' : 'Fijar'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => void handleTogglePublished(g)}
                        style={styles.cardActionBtn}
                      >
                        <Ionicons
                          name={g.publicada ? 'eye-off-outline' : 'eye-outline'}
                          size={16}
                          color={themeColors.textSecondary}
                        />
                        <Text style={[styles.cardActionText, { color: themeColors.textSecondary }]}>
                          {g.publicada ? 'Ocultar' : 'Publicar'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => void handleDuplicate(g)}
                        style={styles.cardActionBtn}
                      >
                        <Ionicons name="copy-outline" size={15} color={themeColors.textSecondary} />
                        <Text style={[styles.cardActionText, { color: themeColors.textSecondary }]}>
                          Duplicar
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => handleDeleteGuia(g)}
                        style={styles.cardActionBtn}
                      >
                        <Ionicons name="trash-outline" size={16} color={themeColors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Modal Plantillas Nueva Guía */}
      <Modal
        visible={templateModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTemplateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                Elige una plantilla inicial
              </Text>
              <TouchableOpacity onPress={() => setTemplateModalVisible(false)}>
                <Ionicons name="close" size={22} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            {(Object.keys(GUIA_TEMPLATES) as GuiaTemplateKey[]).map((key) => {
              const tpl = GUIA_TEMPLATES[key];
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => {
                    setTemplateModalVisible(false);
                    router.push(`/(admin)/guias/editor?template=${key}` as any);
                  }}
                  style={[
                    styles.templateOption,
                    { backgroundColor: themeColors.background, borderColor: themeColors.border },
                  ]}
                >
                  <View style={[styles.tplIcon, { backgroundColor: themeColors.accent + '18' }]}>
                    <Ionicons name={tpl.icono as any} size={22} color={themeColors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.tplTitle, { color: themeColors.text }]}>{tpl.label}</Text>
                    <Text style={[styles.tplSub, { color: themeColors.textSecondary }]}>
                      {tpl.descripcion}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={themeColors.textSecondary} />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>

      {/* Modal Categorías */}
      <Modal
        visible={catModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCatModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: themeColors.backgroundElement,
                borderColor: themeColors.border,
                maxHeight: '85%',
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                Gestionar Categorías
              </Text>
              <TouchableOpacity onPress={() => setCatModalVisible(false)}>
                <Ionicons name="close" size={22} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: 12 }}>
              {/* Formulario */}
              <View
                style={[
                  styles.catFormBox,
                  { backgroundColor: themeColors.background, borderColor: themeColors.border },
                ]}
              >
                <Text style={[styles.formLabel, { color: themeColors.text }]}>
                  {editingCat ? `Editando: ${editingCat.nombre}` : 'Nueva Categoría'}
                </Text>
                <TextInput
                  value={catNombre}
                  onChangeText={setCatNombre}
                  placeholder="Ej. Paneles Solares, CCTV, Minisplits..."
                  placeholderTextColor={themeColors.textSecondary}
                  style={[
                    styles.input,
                    { color: themeColors.text, borderColor: themeColors.border },
                  ]}
                />

                <Text style={[styles.miniLabel, { color: themeColors.textSecondary }]}>Icono</Text>
                <View style={styles.pickerRow}>
                  {CATEGORIA_ICONOS.map((ic) => (
                    <TouchableOpacity
                      key={ic}
                      onPress={() => setCatIcono(ic)}
                      style={[
                        styles.iconChoice,
                        {
                          borderColor:
                            catIcono === ic ? catColor : themeColors.border,
                          backgroundColor:
                            catIcono === ic ? catColor + '20' : 'transparent',
                        },
                      ]}
                    >
                      <Ionicons name={ic as any} size={18} color={catColor} />
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.miniLabel, { color: themeColors.textSecondary }]}>Color</Text>
                <View style={styles.pickerRow}>
                  {CATEGORIA_COLORES.map((col) => (
                    <TouchableOpacity
                      key={col}
                      onPress={() => setCatColor(col)}
                      style={[
                        styles.colorDot,
                        {
                          backgroundColor: col,
                          borderWidth: catColor === col ? 3 : 0,
                          borderColor: themeColors.text,
                        },
                      ]}
                    />
                  ))}
                </View>

                <View style={styles.formBtns}>
                  {editingCat && (
                    <TouchableOpacity
                      onPress={() => openCatForm(null)}
                      style={[styles.smallBtn, { borderColor: themeColors.border, borderWidth: 1 }]}
                    >
                      <Text style={{ color: themeColors.text, fontWeight: '600' }}>Cancelar</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    disabled={savingCat || !catNombre.trim()}
                    onPress={() => void handleSaveCategoria()}
                    style={[
                      styles.smallBtn,
                      {
                        backgroundColor: themeColors.accent,
                        opacity: savingCat || !catNombre.trim() ? 0.5 : 1,
                      },
                    ]}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>
                      {savingCat ? 'Guardando...' : editingCat ? 'Actualizar' : 'Agregar'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Lista de categorías */}
              {categorias.map((c) => (
                <View
                  key={c.id}
                  style={[
                    styles.catListRow,
                    { backgroundColor: themeColors.background, borderColor: themeColors.border },
                  ]}
                >
                  <View style={[styles.catDotIcon, { backgroundColor: c.color + '20' }]}>
                    <Ionicons name={(c.icono as any) || 'book-outline'} size={18} color={c.color} />
                  </View>
                  <Text style={[styles.catListName, { color: themeColors.text }]}>{c.nombre}</Text>
                  <TouchableOpacity onPress={() => openCatForm(c)} style={{ padding: 6 }}>
                    <Ionicons name="create-outline" size={18} color={themeColors.accent} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteCategoria(c)} style={{ padding: 6 }}>
                    <Ionicons name="trash-outline" size={18} color={themeColors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    maxWidth: MaxContentWidth + 160,
    width: '100%',
    alignSelf: 'center',
    gap: Spacing.two,
  },
  topActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: BorderRadius.medium,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
  outlineBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: 12,
    height: 44,
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
  catChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  statusTabs: {
    flexDirection: 'row',
    gap: 8,
  },
  statusTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
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
  cardsList: {
    gap: Spacing.two,
  },
  guiaCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    overflow: 'hidden',
  },
  guiaCardMain: {
    flexDirection: 'row',
    padding: Spacing.three,
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  guiaIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guiaInfo: {
    flex: 1,
    gap: 4,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  miniPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  miniPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  guiaTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  guiaSub: {
    fontSize: 13,
    lineHeight: 18,
  },
  guiaMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    paddingHorizontal: Spacing.two,
    paddingVertical: 8,
    gap: 14,
    alignItems: 'center',
  },
  cardActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  cardActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    padding: Spacing.three,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    padding: Spacing.three,
    gap: Spacing.two,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  templateOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
  },
  tplIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tplTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  tplSub: {
    fontSize: 12,
    marginTop: 2,
  },
  catFormBox: {
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    padding: 12,
    gap: 8,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  miniLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  pickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  iconChoice: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  formBtns: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  smallBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.small,
  },
  catListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
  },
  catDotIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catListName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
});
