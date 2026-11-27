import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { GuiasService } from '../api/guiasService';
import {
  AlertaNivel,
  GuiaBlock,
  VarianteConfig,
  createEmptyBlock,
  generateBlockId,
  parsePastedLines,
} from '../types';

interface Props {
  bloques: GuiaBlock[];
  onChange: (next: GuiaBlock[]) => void;
}

const BLOCK_OPTIONS: {
  type: GuiaBlock['type'];
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}[] = [
  { type: 'checklist', label: 'Checklist', icon: 'checkbox-outline', color: '#16a34a' },
  { type: 'materiales', label: 'Materiales', icon: 'hammer-outline', color: '#0284c7' },
  { type: 'alerta', label: 'Alerta / Tip', icon: 'warning-outline', color: '#dc2626' },
  { type: 'pasos', label: 'Pasos', icon: 'list-outline', color: '#7c3aed' },
  { type: 'diagrama', label: 'Diagrama', icon: 'image-outline', color: '#ea580c' },
  { type: 'selector_variantes', label: 'Selector Medidas', icon: 'options-outline', color: '#d97706' },
];

export default function GuiaBlockEditor({ bloques, onChange }: Props) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({});
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [pasteTarget, setPasteTarget] = useState<{
    blockId: string;
    mode: 'checklist' | 'materiales';
    grupoId?: string;
  } | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [pasteImageTarget, setPasteImageTarget] = useState<{
    key: string;
    onUploaded: (url: string) => void;
  } | null>(null);

  const updateBlock = (blockId: string, updater: (b: GuiaBlock) => GuiaBlock) => {
    onChange(bloques.map((b) => (b.id === blockId ? updater(b) : b)));
  };

  const moveBlock = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= bloques.length) return;
    const copy = [...bloques];
    const [removed] = copy.splice(index, 1);
    copy.splice(target, 0, removed);
    onChange(copy);
  };

  const removeBlock = (blockId: string) => {
    onChange(bloques.filter((b) => b.id !== blockId));
  };

  const addBlock = (type: GuiaBlock['type']) => {
    onChange([...bloques, createEmptyBlock(type)]);
  };

  const pickAndUploadImage = async (
    key: string,
    onUploaded: (url: string) => void
  ) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (!asset.base64) {
        const msg = 'No se pudo leer la imagen en Base64.';
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Error', msg);
        return;
      }

      setUploadingKey(key);
      const fileName = asset.fileName || `guia_${Date.now()}.jpg`;
      const mimeType = asset.mimeType || 'image/jpeg';
      const uploadedUrl = await GuiasService.uploadDiagramImage(
        asset.base64,
        fileName,
        mimeType
      );
      onUploaded(uploadedUrl);
    } catch (err: any) {
      const msg = err?.message || 'No se pudo subir la imagen.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error al subir', msg);
    } finally {
      setUploadingKey(null);
    }
  };

  const uploadClipboardBlob = async (
    blob: Blob,
    key: string,
    onUploaded: (url: string) => void
  ) => {
    const mimeType = blob.type || 'image/png';
    const ext = mimeType.split('/')[1]?.split('+')[0] || 'png';
    const fileName = `clipboard_${Date.now()}.${ext}`;

    setUploadingKey(key);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const res = typeof reader.result === 'string' ? reader.result : '';
          if (!res) reject(new Error('No se pudo leer la imagen del portapapeles.'));
          else resolve(res);
        };
        reader.onerror = () => reject(new Error('Error leyendo imagen del portapapeles.'));
        reader.readAsDataURL(blob);
      });

      const uploadedUrl = await GuiasService.uploadDiagramImage(base64, fileName, mimeType);
      onUploaded(uploadedUrl);
      setPasteImageTarget(null);
    } catch (err: any) {
      const msg = err?.message || 'No se pudo subir la imagen del portapapeles.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error al subir', msg);
    } finally {
      setUploadingKey(null);
    }
  };

  const pasteImageFromClipboard = async (
    key: string,
    onUploaded: (url: string) => void
  ) => {
    if (Platform.OS !== 'web') {
      Alert.alert(
        'Pegar imagen',
        'El pegado directo de imágenes del portapapeles está disponible en la versión Web. En móvil usa "Subir diagrama".'
      );
      return;
    }

    try {
      const navClipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
      if (navClipboard && typeof navClipboard.read === 'function') {
        const items = await navClipboard.read();
        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            await uploadClipboardBlob(blob, key, onUploaded);
            return;
          }
        }
      }
    } catch {
      // Si el navegador bloquea navigator.clipboard.read(), abrimos el modal de Ctrl+V
    }

    setPasteImageTarget({ key, onUploaded });
  };

  useEffect(() => {
    if (Platform.OS !== 'web' || !pasteImageTarget || typeof window === 'undefined') return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            void uploadClipboardBlob(file, pasteImageTarget.key, pasteImageTarget.onUploaded);
            return;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [pasteImageTarget]);

  const applyPastedLines = () => {
    if (!pasteTarget) return;
    const parsed = parsePastedLines(pasteText);
    if (parsed.length === 0) {
      setPasteTarget(null);
      setPasteText('');
      return;
    }

    updateBlock(pasteTarget.blockId, (b) => {
      if (b.type === 'checklist') {
        const newItems = parsed.map((p) => ({
          id: generateBlockId('chk'),
          texto: p.texto,
          cantidad: p.cantidad,
        }));
        const nonEmptyExisting = b.items.filter((it) => it.texto.trim().length > 0);
        return { ...b, items: [...nonEmptyExisting, ...newItems] };
      }

      if (b.type === 'materiales' && pasteTarget.grupoId) {
        return {
          ...b,
          grupos: b.grupos.map((g) => {
            if (g.id !== pasteTarget.grupoId) return g;
            const newItems = parsed.map((p) => ({
              id: generateBlockId('mat'),
              nombre: p.texto,
              cantidad: p.cantidad || '',
            }));
            const nonEmpty = g.items.filter((it) => it.nombre.trim().length > 0);
            return { ...g, items: [...nonEmpty, ...newItems] };
          }),
        };
      }
      return b;
    });

    setPasteTarget(null);
    setPasteText('');
  };

  return (
    <View style={styles.wrapper}>
      {bloques.length === 0 && (
        <View
          style={[
            styles.emptyBox,
            { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
          ]}
        >
          <Ionicons name="layers-outline" size={32} color={themeColors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: themeColors.text }]}>
            Aún no hay bloques en esta guía
          </Text>
          <Text style={[styles.emptySub, { color: themeColors.textSecondary }]}>
            Agrega un Checklist, Lista de Materiales, Alerta, Pasos, Diagrama o Selector de Medidas abajo.
          </Text>
        </View>
      )}

      {bloques.map((block, index) => {
        const meta = BLOCK_OPTIONS.find((o) => o.type === block.type);
        const collapsed = Boolean(collapsedMap[block.id]);

        return (
          <View
            key={block.id}
            style={[
              styles.blockCard,
              { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
            ]}
          >
            {/* Cabecera de bloque */}
            <View style={styles.blockTopBar}>
              <View style={[styles.typeBadge, { backgroundColor: (meta?.color || '#0284c7') + '18' }]}>
                <Ionicons
                  name={meta?.icon || 'cube-outline'}
                  size={15}
                  color={meta?.color || '#0284c7'}
                />
                <Text style={[styles.typeBadgeText, { color: meta?.color || '#0284c7' }]}>
                  {meta?.label || block.type}
                </Text>
              </View>

              <View style={styles.topActions}>
                <TouchableOpacity
                  onPress={() => moveBlock(index, -1)}
                  disabled={index === 0}
                  style={[styles.iconActionBtn, { opacity: index === 0 ? 0.35 : 1 }]}
                >
                  <Ionicons name="arrow-up" size={17} color={themeColors.text} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => moveBlock(index, 1)}
                  disabled={index === bloques.length - 1}
                  style={[
                    styles.iconActionBtn,
                    { opacity: index === bloques.length - 1 ? 0.35 : 1 },
                  ]}
                >
                  <Ionicons name="arrow-down" size={17} color={themeColors.text} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    setCollapsedMap((p) => ({ ...p, [block.id]: !p[block.id] }))
                  }
                  style={styles.iconActionBtn}
                >
                  <Ionicons
                    name={collapsed ? 'chevron-down' : 'chevron-up'}
                    size={18}
                    color={themeColors.text}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => removeBlock(block.id)}
                  style={styles.iconActionBtn}
                >
                  <Ionicons name="trash-outline" size={17} color={themeColors.danger} />
                </TouchableOpacity>
              </View>
            </View>

            {!collapsed && (
              <View style={styles.blockBody}>
                {/* Título común */}
                <TextInput
                  value={block.titulo}
                  onChangeText={(txt) =>
                    updateBlock(block.id, (b) => ({ ...b, titulo: txt }))
                  }
                  placeholder="Título de la sección"
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

                {/* Editor específico: ALERTA */}
                {block.type === 'alerta' && (
                  <>
                    <View style={styles.rowChips}>
                      {(['critico', 'precaucion', 'info'] as AlertaNivel[]).map((lvl) => {
                        const active = block.nivel === lvl;
                        const label =
                          lvl === 'critico'
                            ? 'Crítico (Rojo)'
                            : lvl === 'precaucion'
                              ? 'Precaución (Ámbar)'
                              : 'Tip / Info (Azul)';
                        const color =
                          lvl === 'critico'
                            ? '#dc2626'
                            : lvl === 'precaucion'
                              ? '#d97706'
                              : '#0284c7';
                        return (
                          <TouchableOpacity
                            key={lvl}
                            onPress={() =>
                              updateBlock(block.id, (b) =>
                                b.type === 'alerta' ? { ...b, nivel: lvl } : b
                              )
                            }
                            style={[
                              styles.smallChip,
                              {
                                backgroundColor: active ? color : themeColors.background,
                                borderColor: active ? color : themeColors.border,
                              },
                            ]}
                          >
                            <Text
                              style={{
                                color: active ? '#fff' : themeColors.text,
                                fontSize: 12,
                                fontWeight: '700',
                              }}
                            >
                              {label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <TextInput
                      value={block.mensaje}
                      onChangeText={(txt) =>
                        updateBlock(block.id, (b) =>
                          b.type === 'alerta' ? { ...b, mensaje: txt } : b
                        )
                      }
                      placeholder="Detalle de advertencia, garantía o recomendación..."
                      placeholderTextColor={themeColors.textSecondary}
                      multiline
                      style={[
                        styles.input,
                        styles.multilineInput,
                        {
                          color: themeColors.text,
                          borderColor: themeColors.border,
                          backgroundColor: themeColors.background,
                        },
                      ]}
                    />
                  </>
                )}

                {/* Editor específico: CHECKLIST */}
                {block.type === 'checklist' && (
                  <View style={styles.subList}>
                    {block.items.map((item, itemIdx) => (
                      <View
                        key={item.id}
                        style={[
                          styles.itemBox,
                          { backgroundColor: themeColors.background, borderColor: themeColors.border },
                        ]}
                      >
                        <View style={styles.itemRowTop}>
                          <Text style={[styles.itemIdx, { color: themeColors.textSecondary }]}>
                            #{itemIdx + 1}
                          </Text>
                          <TextInput
                            value={item.texto}
                            onChangeText={(txt) =>
                              updateBlock(block.id, (b) =>
                                b.type === 'checklist'
                                  ? {
                                      ...b,
                                      items: b.items.map((it) =>
                                        it.id === item.id ? { ...it, texto: txt } : it
                                      ),
                                    }
                                  : b
                              )
                            }
                            placeholder="Punto a revisar..."
                            placeholderTextColor={themeColors.textSecondary}
                            style={[
                              styles.inputCompact,
                              { flex: 1, color: themeColors.text, borderColor: themeColors.border },
                            ]}
                          />
                          <TouchableOpacity
                            onPress={() =>
                              updateBlock(block.id, (b) =>
                                b.type === 'checklist'
                                  ? {
                                      ...b,
                                      items: b.items.filter((it) => it.id !== item.id),
                                    }
                                  : b
                              )
                            }
                          >
                            <Ionicons name="close-circle" size={20} color={themeColors.danger} />
                          </TouchableOpacity>
                        </View>

                        <View style={styles.itemMetaRow}>
                          <TextInput
                            value={item.cantidad || ''}
                            onChangeText={(txt) =>
                              updateBlock(block.id, (b) =>
                                b.type === 'checklist'
                                  ? {
                                      ...b,
                                      items: b.items.map((it) =>
                                        it.id === item.id ? { ...it, cantidad: txt } : it
                                      ),
                                    }
                                  : b
                              )
                            }
                            placeholder="Cant. (opcional)"
                            placeholderTextColor={themeColors.textSecondary}
                            style={[
                              styles.inputCompact,
                              { width: 115, color: themeColors.text, borderColor: themeColors.border },
                            ]}
                          />
                          <TouchableOpacity
                            onPress={() =>
                              updateBlock(block.id, (b) =>
                                b.type === 'checklist'
                                  ? {
                                      ...b,
                                      items: b.items.map((it) =>
                                        it.id === item.id
                                          ? { ...it, critico: !it.critico }
                                          : it
                                      ),
                                    }
                                  : b
                              )
                            }
                            style={[
                              styles.smallChip,
                              {
                                backgroundColor: item.critico ? '#dc2626' : themeColors.backgroundElement,
                                borderColor: item.critico ? '#dc2626' : themeColors.border,
                              },
                            ]}
                          >
                            <Text
                              style={{
                                color: item.critico ? '#fff' : themeColors.textSecondary,
                                fontSize: 11,
                                fontWeight: '700',
                              }}
                            >
                              {item.critico ? 'Crítico ✓' : 'Marcar crítico'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}

                    <View style={styles.inlineBtns}>
                      <TouchableOpacity
                        onPress={() =>
                          updateBlock(block.id, (b) =>
                            b.type === 'checklist'
                              ? {
                                  ...b,
                                  items: [...b.items, { id: generateBlockId('chk'), texto: '' }],
                                }
                              : b
                          )
                        }
                        style={[styles.secondaryBtn, { borderColor: themeColors.accent }]}
                      >
                        <Ionicons name="add" size={16} color={themeColors.accent} />
                        <Text style={[styles.secondaryBtnText, { color: themeColors.accent }]}>
                          Agregar punto
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => {
                          setPasteText('');
                          setPasteTarget({ blockId: block.id, mode: 'checklist' });
                        }}
                        style={[styles.secondaryBtn, { borderColor: '#16a34a' }]}
                      >
                        <Ionicons name="clipboard-outline" size={15} color="#16a34a" />
                        <Text style={[styles.secondaryBtnText, { color: '#16a34a' }]}>
                          Pegar lista rápida
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Editor específico: MATERIALES */}
                {block.type === 'materiales' && (
                  <View style={styles.subList}>
                    {block.grupos.map((grupo) => (
                      <View
                        key={grupo.id}
                        style={[
                          styles.itemBox,
                          { backgroundColor: themeColors.background, borderColor: themeColors.border },
                        ]}
                      >
                        <View style={styles.itemRowTop}>
                          <TextInput
                            value={grupo.nombre}
                            onChangeText={(txt) =>
                              updateBlock(block.id, (b) =>
                                b.type === 'materiales'
                                  ? {
                                      ...b,
                                      grupos: b.grupos.map((g) =>
                                        g.id === grupo.id ? { ...g, nombre: txt } : g
                                      ),
                                    }
                                  : b
                              )
                            }
                            placeholder="Nombre del grupo (ej. Herramienta Eléctrica)"
                            placeholderTextColor={themeColors.textSecondary}
                            style={[
                              styles.inputCompact,
                              {
                                flex: 1,
                                color: themeColors.accent,
                                borderColor: themeColors.border,
                                fontWeight: '700',
                              },
                            ]}
                          />
                          <TouchableOpacity
                            onPress={() =>
                              updateBlock(block.id, (b) =>
                                b.type === 'materiales'
                                  ? {
                                      ...b,
                                      grupos: b.grupos.filter((g) => g.id !== grupo.id),
                                    }
                                  : b
                              )
                            }
                          >
                            <Ionicons name="trash-outline" size={18} color={themeColors.danger} />
                          </TouchableOpacity>
                        </View>

                        {grupo.items.map((mat) => (
                          <View key={mat.id} style={styles.itemRowTop}>
                            <TextInput
                              value={mat.cantidad || ''}
                              onChangeText={(txt) =>
                                updateBlock(block.id, (b) =>
                                  b.type === 'materiales'
                                    ? {
                                        ...b,
                                        grupos: b.grupos.map((g) =>
                                          g.id === grupo.id
                                            ? {
                                                ...g,
                                                items: g.items.map((m) =>
                                                  m.id === mat.id ? { ...m, cantidad: txt } : m
                                                ),
                                              }
                                            : g
                                        ),
                                      }
                                    : b
                                )
                              }
                              placeholder="Cant."
                              placeholderTextColor={themeColors.textSecondary}
                              style={[
                                styles.inputCompact,
                                { width: 64, color: themeColors.text, borderColor: themeColors.border },
                              ]}
                            />
                            <TextInput
                              value={mat.nombre}
                              onChangeText={(txt) =>
                                updateBlock(block.id, (b) =>
                                  b.type === 'materiales'
                                    ? {
                                        ...b,
                                        grupos: b.grupos.map((g) =>
                                          g.id === grupo.id
                                            ? {
                                                ...g,
                                                items: g.items.map((m) =>
                                                  m.id === mat.id ? { ...m, nombre: txt } : m
                                                ),
                                              }
                                            : g
                                        ),
                                      }
                                    : b
                                )
                              }
                              placeholder="Herramienta o material..."
                              placeholderTextColor={themeColors.textSecondary}
                              style={[
                                styles.inputCompact,
                                { flex: 1, color: themeColors.text, borderColor: themeColors.border },
                              ]}
                            />
                            <TouchableOpacity
                              onPress={() =>
                                updateBlock(block.id, (b) =>
                                  b.type === 'materiales'
                                    ? {
                                        ...b,
                                        grupos: b.grupos.map((g) =>
                                          g.id === grupo.id
                                            ? {
                                                ...g,
                                                items: g.items.filter((m) => m.id !== mat.id),
                                              }
                                            : g
                                        ),
                                      }
                                    : b
                                )
                              }
                            >
                              <Ionicons name="close-circle" size={19} color={themeColors.danger} />
                            </TouchableOpacity>
                          </View>
                        ))}

                        <View style={styles.inlineBtns}>
                          <TouchableOpacity
                            onPress={() =>
                              updateBlock(block.id, (b) =>
                                b.type === 'materiales'
                                  ? {
                                      ...b,
                                      grupos: b.grupos.map((g) =>
                                        g.id === grupo.id
                                          ? {
                                              ...g,
                                              items: [
                                                ...g.items,
                                                { id: generateBlockId('mat'), nombre: '', cantidad: '' },
                                              ],
                                            }
                                          : g
                                      ),
                                    }
                                  : b
                              )
                            }
                            style={[styles.secondaryBtn, { borderColor: themeColors.accent }]}
                          >
                            <Ionicons name="add" size={15} color={themeColors.accent} />
                            <Text style={[styles.secondaryBtnText, { color: themeColors.accent }]}>
                              Agregar material
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => {
                              setPasteText('');
                              setPasteTarget({
                                blockId: block.id,
                                mode: 'materiales',
                                grupoId: grupo.id,
                              });
                            }}
                            style={[styles.secondaryBtn, { borderColor: '#16a34a' }]}
                          >
                            <Ionicons name="clipboard-outline" size={14} color="#16a34a" />
                            <Text style={[styles.secondaryBtnText, { color: '#16a34a' }]}>
                              Pegar lista
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}

                    <TouchableOpacity
                      onPress={() =>
                        updateBlock(block.id, (b) =>
                          b.type === 'materiales'
                            ? {
                                ...b,
                                grupos: [
                                  ...b.grupos,
                                  {
                                    id: generateBlockId('grp'),
                                    nombre: 'Nuevo Grupo',
                                    items: [{ id: generateBlockId('mat'), nombre: '', cantidad: '' }],
                                  },
                                ],
                              }
                            : b
                        )
                      }
                      style={[styles.secondaryBtn, { borderColor: themeColors.border }]}
                    >
                      <Ionicons name="folder-open-outline" size={15} color={themeColors.text} />
                      <Text style={[styles.secondaryBtnText, { color: themeColors.text }]}>
                        Agregar grupo de materiales
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Editor específico: PASOS */}
                {block.type === 'pasos' && (
                  <View style={styles.subList}>
                    {block.pasos.map((paso, pIdx) => (
                      <View
                        key={paso.id}
                        style={[
                          styles.itemBox,
                          { backgroundColor: themeColors.background, borderColor: themeColors.border },
                        ]}
                      >
                        <View style={styles.itemRowTop}>
                          <Text style={[styles.itemIdx, { color: themeColors.accent }]}>
                            Paso {pIdx + 1}
                          </Text>
                          <TextInput
                            value={paso.titulo}
                            onChangeText={(txt) =>
                              updateBlock(block.id, (b) =>
                                b.type === 'pasos'
                                  ? {
                                      ...b,
                                      pasos: b.pasos.map((p) =>
                                        p.id === paso.id ? { ...p, titulo: txt } : p
                                      ),
                                    }
                                  : b
                              )
                            }
                            placeholder="Título del paso"
                            placeholderTextColor={themeColors.textSecondary}
                            style={[
                              styles.inputCompact,
                              { flex: 1, color: themeColors.text, borderColor: themeColors.border },
                            ]}
                          />
                          <TouchableOpacity
                            onPress={() =>
                              updateBlock(block.id, (b) =>
                                b.type === 'pasos'
                                  ? { ...b, pasos: b.pasos.filter((p) => p.id !== paso.id) }
                                  : b
                              )
                            }
                          >
                            <Ionicons name="close-circle" size={19} color={themeColors.danger} />
                          </TouchableOpacity>
                        </View>

                        <TextInput
                          value={paso.detalle}
                          onChangeText={(txt) =>
                            updateBlock(block.id, (b) =>
                              b.type === 'pasos'
                                ? {
                                    ...b,
                                    pasos: b.pasos.map((p) =>
                                      p.id === paso.id ? { ...p, detalle: txt } : p
                                    ),
                                  }
                                : b
                            )
                          }
                          placeholder="Instrucciones del paso..."
                          placeholderTextColor={themeColors.textSecondary}
                          multiline
                          style={[
                            styles.inputCompact,
                            styles.multilineInput,
                            { color: themeColors.text, borderColor: themeColors.border },
                          ]}
                        />

                        <View style={styles.inlineBtns}>
                          <TouchableOpacity
                            onPress={() =>
                              void pickAndUploadImage(paso.id, (url) =>
                                updateBlock(block.id, (b) =>
                                  b.type === 'pasos'
                                    ? {
                                        ...b,
                                        pasos: b.pasos.map((p) =>
                                          p.id === paso.id ? { ...p, imagen_url: url } : p
                                        ),
                                      }
                                    : b
                                )
                              )
                            }
                            style={[styles.secondaryBtn, { borderColor: '#7c3aed' }]}
                          >
                            {uploadingKey === paso.id ? (
                              <ActivityIndicator size="small" color="#7c3aed" />
                            ) : (
                              <Ionicons name="cloud-upload-outline" size={15} color="#7c3aed" />
                            )}
                            <Text style={[styles.secondaryBtnText, { color: '#7c3aed' }]}>
                              {paso.imagen_url ? 'Cambiar foto' : 'Subir foto (opcional)'}
                            </Text>
                          </TouchableOpacity>

                          {Platform.OS === 'web' && (
                            <TouchableOpacity
                              onPress={() =>
                                void pasteImageFromClipboard(paso.id, (url) =>
                                  updateBlock(block.id, (b) =>
                                    b.type === 'pasos'
                                      ? {
                                          ...b,
                                          pasos: b.pasos.map((p) =>
                                            p.id === paso.id ? { ...p, imagen_url: url } : p
                                          ),
                                        }
                                      : b
                                  )
                                )
                              }
                              style={[styles.secondaryBtn, { borderColor: '#0284c7' }]}
                            >
                              <Ionicons name="clipboard-outline" size={15} color="#0284c7" />
                              <Text style={[styles.secondaryBtnText, { color: '#0284c7' }]}>
                                Pegar portapapeles
                              </Text>
                            </TouchableOpacity>
                          )}

                          {Boolean(paso.imagen_url) && (
                            <TouchableOpacity
                              onPress={() =>
                                updateBlock(block.id, (b) =>
                                  b.type === 'pasos'
                                    ? {
                                        ...b,
                                        pasos: b.pasos.map((p) =>
                                          p.id === paso.id ? { ...p, imagen_url: '' } : p
                                        ),
                                      }
                                    : b
                                )
                              }
                              style={[styles.secondaryBtn, { borderColor: themeColors.danger }]}
                            >
                              <Text style={[styles.secondaryBtnText, { color: themeColors.danger }]}>
                                Quitar foto
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    ))}

                    <TouchableOpacity
                      onPress={() =>
                        updateBlock(block.id, (b) =>
                          b.type === 'pasos'
                            ? {
                                ...b,
                                pasos: [
                                  ...b.pasos,
                                  { id: generateBlockId('paso'), titulo: '', detalle: '' },
                                ],
                              }
                            : b
                        )
                      }
                      style={[styles.secondaryBtn, { borderColor: themeColors.accent }]}
                    >
                      <Ionicons name="add" size={16} color={themeColors.accent} />
                      <Text style={[styles.secondaryBtnText, { color: themeColors.accent }]}>
                        Agregar paso
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Editor específico: DIAGRAMA */}
                {block.type === 'diagrama' && (
                  <View style={styles.subList}>
                    {Boolean(block.imagen_url) && (
                      <Image
                        source={{ uri: block.imagen_url }}
                        style={[styles.previewThumb, { borderColor: themeColors.border }]}
                        resizeMode="contain"
                      />
                    )}
                    <View style={styles.inlineBtns}>
                      <TouchableOpacity
                        onPress={() =>
                          void pickAndUploadImage(block.id, (url) =>
                            updateBlock(block.id, (b) =>
                              b.type === 'diagrama' ? { ...b, imagen_url: url } : b
                            )
                          )
                        }
                        style={[styles.secondaryBtn, { borderColor: '#ea580c' }]}
                      >
                        {uploadingKey === block.id ? (
                          <ActivityIndicator size="small" color="#ea580c" />
                        ) : (
                          <Ionicons name="cloud-upload-outline" size={16} color="#ea580c" />
                        )}
                        <Text style={[styles.secondaryBtnText, { color: '#ea580c' }]}>
                          {block.imagen_url ? 'Cambiar imagen' : 'Subir diagrama / imagen'}
                        </Text>
                      </TouchableOpacity>

                      {Platform.OS === 'web' && (
                        <TouchableOpacity
                          onPress={() =>
                            void pasteImageFromClipboard(block.id, (url) =>
                              updateBlock(block.id, (b) =>
                                b.type === 'diagrama' ? { ...b, imagen_url: url } : b
                              )
                            )
                          }
                          style={[styles.secondaryBtn, { borderColor: '#0284c7' }]}
                        >
                          <Ionicons name="clipboard-outline" size={15} color="#0284c7" />
                          <Text style={[styles.secondaryBtnText, { color: '#0284c7' }]}>
                            Pegar portapapeles
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <TextInput
                      value={block.imagen_url}
                      onChangeText={(txt) =>
                        updateBlock(block.id, (b) =>
                          b.type === 'diagrama' ? { ...b, imagen_url: txt } : b
                        )
                      }
                      placeholder="O pega URL de imagen..."
                      placeholderTextColor={themeColors.textSecondary}
                      style={[
                        styles.inputCompact,
                        {
                          color: themeColors.text,
                          borderColor: themeColors.border,
                          backgroundColor: themeColors.background,
                        },
                      ]}
                    />
                    <TextInput
                      value={block.descripcion || ''}
                      onChangeText={(txt) =>
                        updateBlock(block.id, (b) =>
                          b.type === 'diagrama' ? { ...b, descripcion: txt } : b
                        )
                      }
                      placeholder="Descripción o notas del diagrama (opcional)"
                      placeholderTextColor={themeColors.textSecondary}
                      multiline
                      style={[
                        styles.inputCompact,
                        {
                          color: themeColors.text,
                          borderColor: themeColors.border,
                          backgroundColor: themeColors.background,
                        },
                      ]}
                    />
                  </View>
                )}

                {/* Editor específico: SELECTOR DE VARIANTES */}
                {block.type === 'selector_variantes' && (
                  <View style={styles.subList}>
                    <View style={styles.filterLabelsRow}>
                      <TextInput
                        value={block.etiqueta_filtro_1}
                        onChangeText={(txt) =>
                          updateBlock(block.id, (b) =>
                            b.type === 'selector_variantes'
                              ? { ...b, etiqueta_filtro_1: txt }
                              : b
                          )
                        }
                        placeholder="Etiqueta filtro 1"
                        placeholderTextColor={themeColors.textSecondary}
                        style={[
                          styles.inputCompact,
                          { flex: 1, color: themeColors.text, borderColor: themeColors.border },
                        ]}
                      />
                      <TextInput
                        value={block.etiqueta_filtro_2}
                        onChangeText={(txt) =>
                          updateBlock(block.id, (b) =>
                            b.type === 'selector_variantes'
                              ? { ...b, etiqueta_filtro_2: txt }
                              : b
                          )
                        }
                        placeholder="Etiqueta filtro 2"
                        placeholderTextColor={themeColors.textSecondary}
                        style={[
                          styles.inputCompact,
                          { flex: 1, color: themeColors.text, borderColor: themeColors.border },
                        ]}
                      />
                      <TextInput
                        value={block.etiqueta_filtro_3 || ''}
                        onChangeText={(txt) =>
                          updateBlock(block.id, (b) =>
                            b.type === 'selector_variantes'
                              ? { ...b, etiqueta_filtro_3: txt }
                              : b
                          )
                        }
                        placeholder="Filtro 3 (opc.)"
                        placeholderTextColor={themeColors.textSecondary}
                        style={[
                          styles.inputCompact,
                          { flex: 1, color: themeColors.text, borderColor: themeColors.border },
                        ]}
                      />
                    </View>

                    {block.variantes.map((v, vIdx) => (
                      <View
                        key={v.id}
                        style={[
                          styles.itemBox,
                          { backgroundColor: themeColors.background, borderColor: themeColors.border },
                        ]}
                      >
                        <View style={styles.itemRowTop}>
                          <Text style={[styles.itemIdx, { color: themeColors.accent }]}>
                            Variante {vIdx + 1}
                          </Text>
                          <View style={{ flex: 1 }} />
                          <TouchableOpacity
                            onPress={() => {
                              const copyVar: VarianteConfig = {
                                ...v,
                                id: generateBlockId('var'),
                                cortes: v.cortes.map((c) => ({ ...c })),
                                materiales: v.materiales.map((m) => ({ ...m })),
                              };
                              updateBlock(block.id, (b) =>
                                b.type === 'selector_variantes'
                                  ? { ...b, variantes: [...b.variantes, copyVar] }
                                  : b
                              );
                            }}
                            style={{ marginRight: 8 }}
                          >
                            <Ionicons name="copy-outline" size={17} color={themeColors.accent} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() =>
                              updateBlock(block.id, (b) =>
                                b.type === 'selector_variantes'
                                  ? {
                                      ...b,
                                      variantes: b.variantes.filter((item) => item.id !== v.id),
                                    }
                                  : b
                              )
                            }
                          >
                            <Ionicons name="close-circle" size={19} color={themeColors.danger} />
                          </TouchableOpacity>
                        </View>

                        <View style={styles.filterLabelsRow}>
                          <TextInput
                            value={v.valor_1}
                            onChangeText={(txt) =>
                              updateBlock(block.id, (b) =>
                                b.type === 'selector_variantes'
                                  ? {
                                      ...b,
                                      variantes: b.variantes.map((vr) =>
                                        vr.id === v.id ? { ...vr, valor_1: txt } : vr
                                      ),
                                    }
                                  : b
                              )
                            }
                            placeholder={block.etiqueta_filtro_1 || 'Valor 1'}
                            placeholderTextColor={themeColors.textSecondary}
                            style={[
                              styles.inputCompact,
                              { flex: 1, color: themeColors.text, borderColor: themeColors.border },
                            ]}
                          />
                          <TextInput
                            value={v.valor_2}
                            onChangeText={(txt) =>
                              updateBlock(block.id, (b) =>
                                b.type === 'selector_variantes'
                                  ? {
                                      ...b,
                                      variantes: b.variantes.map((vr) =>
                                        vr.id === v.id ? { ...vr, valor_2: txt } : vr
                                      ),
                                    }
                                  : b
                              )
                            }
                            placeholder={block.etiqueta_filtro_2 || 'Valor 2'}
                            placeholderTextColor={themeColors.textSecondary}
                            style={[
                              styles.inputCompact,
                              { flex: 1, color: themeColors.text, borderColor: themeColors.border },
                            ]}
                          />
                          <TextInput
                            value={v.valor_3 || ''}
                            onChangeText={(txt) =>
                              updateBlock(block.id, (b) =>
                                b.type === 'selector_variantes'
                                  ? {
                                      ...b,
                                      variantes: b.variantes.map((vr) =>
                                        vr.id === v.id ? { ...vr, valor_3: txt } : vr
                                      ),
                                    }
                                  : b
                              )
                            }
                            placeholder={block.etiqueta_filtro_3 || 'Valor 3'}
                            placeholderTextColor={themeColors.textSecondary}
                            style={[
                              styles.inputCompact,
                              { flex: 1, color: themeColors.text, borderColor: themeColors.border },
                            ]}
                          />
                        </View>

                        {/* Cortes */}
                        <Text style={[styles.miniLabel, { color: themeColors.textSecondary }]}>
                          Cortes / Medidas
                        </Text>
                        {v.cortes.map((corte, cIdx) => (
                          <View key={cIdx} style={styles.itemRowTop}>
                            <TextInput
                              value={corte.pieza}
                              onChangeText={(txt) =>
                                updateBlock(block.id, (b) =>
                                  b.type === 'selector_variantes'
                                    ? {
                                        ...b,
                                        variantes: b.variantes.map((vr) =>
                                          vr.id === v.id
                                            ? {
                                                ...vr,
                                                cortes: vr.cortes.map((c, i) =>
                                                  i === cIdx ? { ...c, pieza: txt } : c
                                                ),
                                              }
                                            : vr
                                        ),
                                      }
                                    : b
                                )
                              }
                              placeholder="Pieza"
                              placeholderTextColor={themeColors.textSecondary}
                              style={[
                                styles.inputCompact,
                                { width: 115, color: themeColors.text, borderColor: themeColors.border },
                              ]}
                            />
                            <TextInput
                              value={corte.instruccion}
                              onChangeText={(txt) =>
                                updateBlock(block.id, (b) =>
                                  b.type === 'selector_variantes'
                                    ? {
                                        ...b,
                                        variantes: b.variantes.map((vr) =>
                                          vr.id === v.id
                                            ? {
                                                ...vr,
                                                cortes: vr.cortes.map((c, i) =>
                                                  i === cIdx ? { ...c, instruccion: txt } : c
                                                ),
                                              }
                                            : vr
                                        ),
                                      }
                                    : b
                                )
                              }
                              placeholder="Medida o corte exacto..."
                              placeholderTextColor={themeColors.textSecondary}
                              style={[
                                styles.inputCompact,
                                { flex: 1, color: themeColors.text, borderColor: themeColors.border },
                              ]}
                            />
                            <TouchableOpacity
                              onPress={() =>
                                updateBlock(block.id, (b) =>
                                  b.type === 'selector_variantes'
                                    ? {
                                        ...b,
                                        variantes: b.variantes.map((vr) =>
                                          vr.id === v.id
                                            ? {
                                                ...vr,
                                                cortes: vr.cortes.filter((_, i) => i !== cIdx),
                                              }
                                            : vr
                                        ),
                                      }
                                    : b
                                )
                              }
                            >
                              <Ionicons name="remove-circle-outline" size={18} color={themeColors.danger} />
                            </TouchableOpacity>
                          </View>
                        ))}
                        <TouchableOpacity
                          onPress={() =>
                            updateBlock(block.id, (b) =>
                              b.type === 'selector_variantes'
                                ? {
                                    ...b,
                                    variantes: b.variantes.map((vr) =>
                                      vr.id === v.id
                                        ? {
                                            ...vr,
                                            cortes: [...vr.cortes, { pieza: '', instruccion: '' }],
                                          }
                                        : vr
                                    ),
                                  }
                                : b
                            )
                          }
                          style={[styles.secondaryBtn, { borderColor: themeColors.border }]}
                        >
                          <Ionicons name="add" size={14} color={themeColors.text} />
                          <Text style={[styles.secondaryBtnText, { color: themeColors.text }]}>
                            + Corte
                          </Text>
                        </TouchableOpacity>

                        {/* Materiales de variante */}
                        <Text style={[styles.miniLabel, { color: themeColors.textSecondary }]}>
                          Material / Herrajes
                        </Text>
                        {v.materiales.map((mat, mIdx) => (
                          <View key={mIdx} style={styles.itemRowTop}>
                            <TextInput
                              value={mat.cantidad}
                              onChangeText={(txt) =>
                                updateBlock(block.id, (b) =>
                                  b.type === 'selector_variantes'
                                    ? {
                                        ...b,
                                        variantes: b.variantes.map((vr) =>
                                          vr.id === v.id
                                            ? {
                                                ...vr,
                                                materiales: vr.materiales.map((m, i) =>
                                                  i === mIdx ? { ...m, cantidad: txt } : m
                                                ),
                                              }
                                            : vr
                                        ),
                                      }
                                    : b
                                )
                              }
                              placeholder="Cant."
                              placeholderTextColor={themeColors.textSecondary}
                              style={[
                                styles.inputCompact,
                                { width: 64, color: themeColors.text, borderColor: themeColors.border },
                              ]}
                            />
                            <TextInput
                              value={mat.nombre}
                              onChangeText={(txt) =>
                                updateBlock(block.id, (b) =>
                                  b.type === 'selector_variantes'
                                    ? {
                                        ...b,
                                        variantes: b.variantes.map((vr) =>
                                          vr.id === v.id
                                            ? {
                                                ...vr,
                                                materiales: vr.materiales.map((m, i) =>
                                                  i === mIdx ? { ...m, nombre: txt } : m
                                                ),
                                              }
                                            : vr
                                        ),
                                      }
                                    : b
                                )
                              }
                              placeholder="Herraje o material"
                              placeholderTextColor={themeColors.textSecondary}
                              style={[
                                styles.inputCompact,
                                { flex: 1, color: themeColors.text, borderColor: themeColors.border },
                              ]}
                            />
                            <TouchableOpacity
                              onPress={() =>
                                updateBlock(block.id, (b) =>
                                  b.type === 'selector_variantes'
                                    ? {
                                        ...b,
                                        variantes: b.variantes.map((vr) =>
                                          vr.id === v.id
                                            ? {
                                                ...vr,
                                                materiales: vr.materiales.filter(
                                                  (_, i) => i !== mIdx
                                                ),
                                              }
                                            : vr
                                        ),
                                      }
                                    : b
                                )
                              }
                            >
                              <Ionicons name="remove-circle-outline" size={18} color={themeColors.danger} />
                            </TouchableOpacity>
                          </View>
                        ))}

                        <View style={styles.inlineBtns}>
                          <TouchableOpacity
                            onPress={() =>
                              updateBlock(block.id, (b) =>
                                b.type === 'selector_variantes'
                                  ? {
                                      ...b,
                                      variantes: b.variantes.map((vr) =>
                                        vr.id === v.id
                                          ? {
                                              ...vr,
                                              materiales: [
                                                ...vr.materiales,
                                                { nombre: '', cantidad: '' },
                                              ],
                                            }
                                          : vr
                                      ),
                                    }
                                  : b
                              )
                            }
                            style={[styles.secondaryBtn, { borderColor: themeColors.border }]}
                          >
                            <Ionicons name="add" size={14} color={themeColors.text} />
                            <Text style={[styles.secondaryBtnText, { color: themeColors.text }]}>
                              + Material
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() =>
                              void pickAndUploadImage(v.id, (url) =>
                                updateBlock(block.id, (b) =>
                                  b.type === 'selector_variantes'
                                    ? {
                                        ...b,
                                        variantes: b.variantes.map((vr) =>
                                          vr.id === v.id ? { ...vr, imagen_url: url } : vr
                                        ),
                                      }
                                    : b
                                )
                              )
                            }
                            style={[styles.secondaryBtn, { borderColor: '#ea580c' }]}
                          >
                            {uploadingKey === v.id ? (
                              <ActivityIndicator size="small" color="#ea580c" />
                            ) : (
                              <Ionicons name="image-outline" size={14} color="#ea580c" />
                            )}
                            <Text style={[styles.secondaryBtnText, { color: '#ea580c' }]}>
                              {v.imagen_url ? 'Cambiar diagrama' : 'Subir diagrama'}
                            </Text>
                          </TouchableOpacity>

                          {Platform.OS === 'web' && (
                            <TouchableOpacity
                              onPress={() =>
                                void pasteImageFromClipboard(v.id, (url) =>
                                  updateBlock(block.id, (b) =>
                                    b.type === 'selector_variantes'
                                      ? {
                                          ...b,
                                          variantes: b.variantes.map((vr) =>
                                            vr.id === v.id ? { ...vr, imagen_url: url } : vr
                                          ),
                                        }
                                      : b
                                  )
                                )
                              }
                              style={[styles.secondaryBtn, { borderColor: '#0284c7' }]}
                            >
                              <Ionicons name="clipboard-outline" size={14} color="#0284c7" />
                              <Text style={[styles.secondaryBtnText, { color: '#0284c7' }]}>
                                Pegar portapapeles
                              </Text>
                            </TouchableOpacity>
                          )}

                          {Boolean(v.imagen_url) && (
                            <TouchableOpacity
                              onPress={() =>
                                updateBlock(block.id, (b) =>
                                  b.type === 'selector_variantes'
                                    ? {
                                        ...b,
                                        variantes: b.variantes.map((vr) =>
                                          vr.id === v.id ? { ...vr, imagen_url: '' } : vr
                                        ),
                                      }
                                    : b
                                )
                              }
                              style={[styles.secondaryBtn, { borderColor: themeColors.danger }]}
                            >
                              <Ionicons name="trash-outline" size={14} color={themeColors.danger} />
                              <Text style={[styles.secondaryBtnText, { color: themeColors.danger }]}>
                                Quitar diagrama
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>

                        {Boolean(v.imagen_url) && (
                          <Image
                            source={{ uri: v.imagen_url }}
                            style={[styles.previewThumb, { borderColor: themeColors.border }]}
                            resizeMode="contain"
                          />
                        )}

                        <TextInput
                          value={v.imagen_url || ''}
                          onChangeText={(txt) =>
                            updateBlock(block.id, (b) =>
                              b.type === 'selector_variantes'
                                ? {
                                    ...b,
                                    variantes: b.variantes.map((vr) =>
                                      vr.id === v.id ? { ...vr, imagen_url: txt } : vr
                                    ),
                                  }
                                : b
                            )
                          }
                          placeholder="URL del diagrama de esta variante (opcional)"
                          placeholderTextColor={themeColors.textSecondary}
                          style={[
                            styles.inputCompact,
                            { color: themeColors.text, borderColor: themeColors.border },
                          ]}
                        />

                        <TextInput
                          value={v.notas || ''}
                          onChangeText={(txt) =>
                            updateBlock(block.id, (b) =>
                              b.type === 'selector_variantes'
                                ? {
                                    ...b,
                                    variantes: b.variantes.map((vr) =>
                                      vr.id === v.id ? { ...vr, notas: txt } : vr
                                    ),
                                  }
                                : b
                            )
                          }
                          placeholder="Notas técnicas de esta variante (opcional)"
                          placeholderTextColor={themeColors.textSecondary}
                          multiline
                          style={[
                            styles.inputCompact,
                            { color: themeColors.text, borderColor: themeColors.border },
                          ]}
                        />
                      </View>
                    ))}

                    <TouchableOpacity
                      onPress={() =>
                        updateBlock(block.id, (b) =>
                          b.type === 'selector_variantes'
                            ? {
                                ...b,
                                variantes: [
                                  ...b.variantes,
                                  {
                                    id: generateBlockId('var'),
                                    valor_1: '',
                                    valor_2: '',
                                    valor_3: '',
                                    cortes: [{ pieza: '', instruccion: '' }],
                                    materiales: [{ nombre: '', cantidad: '' }],
                                  },
                                ],
                              }
                            : b
                        )
                      }
                      style={[styles.secondaryBtn, { borderColor: themeColors.accent }]}
                    >
                      <Ionicons name="add" size={16} color={themeColors.accent} />
                      <Text style={[styles.secondaryBtnText, { color: themeColors.accent }]}>
                        Agregar variante
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>
        );
      })}

      {/* Barra para agregar bloques */}
      <View
        style={[
          styles.addBar,
          { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
        ]}
      >
        <Text style={[styles.addBarTitle, { color: themeColors.textSecondary }]}>
          + AGREGAR BLOQUE VISUAL
        </Text>
        <View style={styles.addGrid}>
          {BLOCK_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.type}
              onPress={() => addBlock(opt.type)}
              style={[
                styles.addBlockBtn,
                { backgroundColor: opt.color + '14', borderColor: opt.color + '44' },
              ]}
            >
              <Ionicons name={opt.icon} size={18} color={opt.color} />
              <Text style={[styles.addBlockLabel, { color: opt.color }]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Modal Pegar Imagen con Ctrl+V */}
      <Modal
        visible={Boolean(pasteImageTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => setPasteImageTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>
              Pegar Imagen del Portapapeles
            </Text>
            <Text style={[styles.modalHint, { color: themeColors.textSecondary }]}>
              Presiona <Text style={{ fontWeight: '800' }}>Ctrl + V</Text> (o Cmd + V) ahora para subir la captura o diagrama copiado.
            </Text>
            <View
              style={[
                styles.emptyBox,
                { borderColor: themeColors.accent, backgroundColor: themeColors.background },
              ]}
            >
              {uploadingKey && pasteImageTarget?.key === uploadingKey ? (
                <ActivityIndicator size="large" color={themeColors.accent} />
              ) : (
                <Ionicons name="clipboard-outline" size={34} color={themeColors.accent} />
              )}
              <Text style={[styles.emptyTitle, { color: themeColors.text }]}>
                {uploadingKey && pasteImageTarget?.key === uploadingKey
                  ? 'Subiendo imagen...'
                  : 'Esperando Ctrl + V'}
              </Text>
            </View>
            <View style={styles.modalBtns}>
              <TouchableOpacity
                onPress={() => setPasteImageTarget(null)}
                style={[styles.modalBtn, { borderColor: themeColors.border, borderWidth: 1 }]}
              >
                <Text style={{ color: themeColors.text, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Pegado Rápido */}
      <Modal
        visible={Boolean(pasteTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => setPasteTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>
              Pegar Lista Rápida
            </Text>
            <Text style={[styles.modalHint, { color: themeColors.textSecondary }]}>
              Pega líneas copiadas de Word o PDF (una por línea). Si empieza con número (ej. &quot;20 Jacks Panduit&quot;), separa la cantidad automáticamente.
            </Text>
            <TextInput
              value={pasteText}
              onChangeText={setPasteText}
              placeholder={'• Verificar polaridad MC4\n• 20 Jacks Panduit\n• ...'}
              placeholderTextColor={themeColors.textSecondary}
              multiline
              style={[
                styles.pasteBox,
                {
                  color: themeColors.text,
                  borderColor: themeColors.border,
                  backgroundColor: themeColors.background,
                },
              ]}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                onPress={() => setPasteTarget(null)}
                style={[styles.modalBtn, { borderColor: themeColors.border, borderWidth: 1 }]}
              >
                <Text style={{ color: themeColors.text, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={applyPastedLines}
                style={[styles.modalBtn, { backgroundColor: '#16a34a' }]}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Convertir en ítems</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.three,
  },
  emptyBox: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.medium,
    padding: Spacing.four,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
  },
  blockCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  blockTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconActionBtn: {
    padding: 5,
  },
  blockBody: {
    gap: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  inputCompact: {
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },
  multilineInput: {
    minHeight: 74,
    textAlignVertical: 'top',
  },
  rowChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  smallChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  subList: {
    gap: 10,
  },
  itemBox: {
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    padding: 10,
    gap: 8,
  },
  itemRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemIdx: {
    fontSize: 12,
    fontWeight: '700',
  },
  inlineBtns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  previewThumb: {
    width: '100%',
    height: 160,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
    backgroundColor: '#0f172a08',
  },
  filterLabelsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  miniLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 4,
  },
  addBar: {
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    padding: Spacing.three,
    gap: 10,
  },
  addBarTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  addGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  addBlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  addBlockLabel: {
    fontSize: 13,
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
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  modalHint: {
    fontSize: 13,
    lineHeight: 18,
  },
  pasteBox: {
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    padding: 12,
    minHeight: 170,
    textAlignVertical: 'top',
    fontSize: 13,
  },
  modalBtns: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: BorderRadius.small,
  },
});
