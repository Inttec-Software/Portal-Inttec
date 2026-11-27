import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  Alert,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius, MaxContentWidth } from '@/constants/theme';
import { GuiasService } from '@/features/guias/api/guiasService';
import GuiaBlockEditor from '@/features/guias/components/GuiaBlockEditor';
import GuiaBlockRenderer from '@/features/guias/components/GuiaBlockRenderer';
import {
  GuiaBlock,
  GuiaCategoria,
  GuiaTipo,
  GUIA_TIPO_META,
  GUIA_TEMPLATES,
  GuiaTemplateKey,
} from '@/features/guias/types';

export default function AdminGuiaEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; template?: string }>();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const guiaId = typeof params.id === 'string' ? params.id : undefined;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');

  const [categorias, setCategorias] = useState<GuiaCategoria[]>([]);
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('');
  const [subtitulo, setSubtitulo] = useState('');
  const [tipo, setTipo] = useState<GuiaTipo>('CHECKLIST_SITIO');
  const [icono, setIcono] = useState('document-text-outline');
  const [destacada, setDestacada] = useState(false);
  const [publicada, setPublicada] = useState(true);
  const [orden, setOrden] = useState(0);
  const [bloques, setBloques] = useState<GuiaBlock[]>([]);

  // Estado temporal solo para probar interactividad en Vista Previa
  const [previewChecks, setPreviewChecks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        const cats = await GuiasService.getCategorias(true);
        if (!active) return;
        const catList = Array.isArray(cats) ? cats : [];
        setCategorias(catList);

        if (guiaId) {
          const guia = await GuiasService.getGuiaById(guiaId);
          if (!active) return;
          setCategoriaId(guia.categoria_id || null);
          setTitulo(guia.titulo || '');
          setSubtitulo(guia.subtitulo || '');
          setTipo(guia.tipo || 'CHECKLIST_SITIO');
          setIcono(guia.icono || 'document-text-outline');
          setDestacada(Boolean(guia.destacada));
          setPublicada(Boolean(guia.publicada));
          setOrden(Number(guia.orden) || 0);
          setBloques(Array.isArray(guia.bloques) ? guia.bloques : []);
        } else {
          const tplKey = (params.template as GuiaTemplateKey) || 'BLANK';
          const tpl = GUIA_TEMPLATES[tplKey] || GUIA_TEMPLATES.BLANK;
          setTipo(tpl.tipo);
          setIcono(tpl.icono);
          setBloques(tpl.bloques());
          if (catList.length > 0) setCategoriaId(catList[0].id);
        }
      } catch (err: any) {
        const msg = err?.message || 'No se pudo cargar la guía.';
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Error', msg);
      } finally {
        if (active) setLoading(false);
      }
    };
    void init();
    return () => {
      active = false;
    };
  }, [guiaId, params.template]);

  const handleSave = async () => {
    if (!titulo.trim()) {
      const msg = 'Por favor escribe un título para la guía.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Falta título', msg);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        categoria_id: categoriaId,
        titulo: titulo.trim(),
        subtitulo: subtitulo.trim(),
        tipo,
        icono,
        bloques,
        destacada,
        publicada,
        orden,
      };

      if (guiaId) {
        await GuiasService.updateGuia(guiaId, payload);
      } else {
        await GuiasService.createGuia(payload);
      }

      if (router.canGoBack()) router.back();
      else router.replace('/(admin)/guias' as any);
    } catch (err: any) {
      const msg = err?.message || 'No se pudo guardar la guía.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color={themeColors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Barra superior del editor */}
      <View
        style={[
          styles.topBar,
          { backgroundColor: themeColors.backgroundElement, borderBottomColor: themeColors.border },
        ]}
      >
        <View style={styles.modeTabs}>
          <TouchableOpacity
            onPress={() => setMode('edit')}
            style={[
              styles.modeTab,
              mode === 'edit' && { backgroundColor: themeColors.accent },
            ]}
          >
            <Ionicons
              name="construct-outline"
              size={16}
              color={mode === 'edit' ? '#fff' : themeColors.textSecondary}
            />
            <Text
              style={[
                styles.modeTabText,
                { color: mode === 'edit' ? '#fff' : themeColors.textSecondary },
              ]}
            >
              Constructor
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setMode('preview')}
            style={[
              styles.modeTab,
              mode === 'preview' && { backgroundColor: themeColors.accent },
            ]}
          >
            <Ionicons
              name="phone-portrait-outline"
              size={16}
              color={mode === 'preview' ? '#fff' : themeColors.textSecondary}
            />
            <Text
              style={[
                styles.modeTabText,
                { color: mode === 'preview' ? '#fff' : themeColors.textSecondary },
              ]}
            >
              Vista Previa
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          disabled={saving}
          onPress={() => void handleSave()}
          style={[
            styles.saveBtn,
            { backgroundColor: '#16a34a', opacity: saving ? 0.6 : 1 },
          ]}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="save-outline" size={17} color="#fff" />
          )}
          <Text style={styles.saveBtnText}>{saving ? 'Guardando...' : 'Guardar'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.inner}>
          {mode === 'edit' ? (
            <>
              {/* Metadatos */}
              <View
                style={[
                  styles.metaCard,
                  { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
                ]}
              >
                <Text style={[styles.sectionLabel, { color: themeColors.accent }]}>
                  DATOS GENERALES DE LA GUÍA
                </Text>

                <TextInput
                  value={titulo}
                  onChangeText={setTitulo}
                  placeholder="Título (ej. Puntos antes de encender inversor)"
                  placeholderTextColor={themeColors.textSecondary}
                  style={[
                    styles.input,
                    {
                      color: themeColors.text,
                      borderColor: themeColors.border,
                      backgroundColor: themeColors.background,
                      fontWeight: '700',
                    },
                  ]}
                />

                <TextInput
                  value={subtitulo}
                  onChangeText={setSubtitulo}
                  placeholder="Descripción breve para el empleado (opcional)"
                  placeholderTextColor={themeColors.textSecondary}
                  style={[
                    styles.input,
                    {
                      color: themeColors.text,
                      borderColor: themeColors.border,
                      backgroundColor: themeColors.background,
                    },
                  ]}
                />

                <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>
                  Categoría
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipsRow}
                >
                  {categorias.map((c) => {
                    const active = categoriaId === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => setCategoriaId(c.id)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: active ? c.color : themeColors.background,
                            borderColor: active ? c.color : themeColors.border,
                          },
                        ]}
                      >
                        <Ionicons
                          name={(c.icono as any) || 'book-outline'}
                          size={14}
                          color={active ? '#fff' : c.color}
                        />
                        <Text
                          style={{
                            color: active ? '#fff' : themeColors.text,
                            fontSize: 13,
                            fontWeight: '600',
                          }}
                        >
                          {c.nombre}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>
                  Tipo de Guía
                </Text>
                <View style={styles.chipsWrap}>
                  {(Object.keys(GUIA_TIPO_META) as GuiaTipo[]).map((t) => {
                    const meta = GUIA_TIPO_META[t];
                    const active = tipo === t;
                    return (
                      <TouchableOpacity
                        key={t}
                        onPress={() => {
                          setTipo(t);
                          setIcono(meta.icon);
                        }}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: active ? meta.color : themeColors.background,
                            borderColor: active ? meta.color : themeColors.border,
                          },
                        ]}
                      >
                        <Ionicons
                          name={meta.icon as any}
                          size={14}
                          color={active ? '#fff' : meta.color}
                        />
                        <Text
                          style={{
                            color: active ? '#fff' : themeColors.text,
                            fontSize: 12,
                            fontWeight: '700',
                          }}
                        >
                          {meta.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.switchesRow}>
                  <View style={styles.switchItem}>
                    <Text style={[styles.switchLabel, { color: themeColors.text }]}>
                      Publicada
                    </Text>
                    <Switch value={publicada} onValueChange={setPublicada} />
                  </View>

                  <View style={styles.switchItem}>
                    <Text style={[styles.switchLabel, { color: themeColors.text }]}>
                      Fijar arriba (★)
                    </Text>
                    <Switch value={destacada} onValueChange={setDestacada} />
                  </View>
                </View>
              </View>

              {/* Constructor de bloques */}
              <GuiaBlockEditor bloques={bloques} onChange={setBloques} />
            </>
          ) : (
            <View style={{ gap: Spacing.three }}>
              <View
                style={[
                  styles.previewHeader,
                  { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
                ]}
              >
                <Text style={[styles.previewTitle, { color: themeColors.text }]}>
                  {titulo || 'Sin título'}
                </Text>
                {Boolean(subtitulo) && (
                  <Text style={[styles.previewSub, { color: themeColors.textSecondary }]}>
                    {subtitulo}
                  </Text>
                )}
              </View>

              <GuiaBlockRenderer
                bloques={bloques}
                checkedMap={previewChecks}
                onToggleCheck={(k) =>
                  setPreviewChecks((prev) => ({ ...prev, [k]: !prev[k] }))
                }
              />
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  modeTabs: {
    flexDirection: 'row',
    gap: 6,
  },
  modeTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BorderRadius.small,
  },
  modeTabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: BorderRadius.small,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  scrollContent: {
    padding: Spacing.three,
    paddingBottom: Spacing.seven,
  },
  inner: {
    maxWidth: MaxContentWidth + 120,
    width: '100%',
    alignSelf: 'center',
    gap: Spacing.three,
  },
  metaCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  chipsRow: {
    gap: 8,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
  switchesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
    marginTop: 4,
  },
  switchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  previewHeader: {
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    padding: Spacing.three,
    gap: 4,
  },
  previewTitle: {
    fontSize: 19,
    fontWeight: '800',
  },
  previewSub: {
    fontSize: 13,
  },
});
