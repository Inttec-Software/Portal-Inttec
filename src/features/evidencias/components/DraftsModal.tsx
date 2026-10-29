import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { EvidenceDraft } from '@/services/evidenceDraftService';

interface DraftsModalProps {
  visible: boolean;
  onClose: () => void;
  drafts: EvidenceDraft[];
  activeDraftId: string | null;
  onLoadDraft: (draft: EvidenceDraft) => void;
  onDeleteDraft: (id: string) => void;
  onStartNewDraft: () => void;
  onSaveCurrentDraft: () => void;
  isSavingDraft: boolean;
}

export default function DraftsModal({
  visible,
  onClose,
  drafts,
  activeDraftId,
  onLoadDraft,
  onDeleteDraft,
  onStartNewDraft,
  onSaveCurrentDraft,
  isSavingDraft,
}: DraftsModalProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        style={[
          styles.overlay,
          {
            paddingTop: Platform.OS !== 'web' ? Math.max(insets.top + 16, 24) : 24,
            paddingBottom: Platform.OS !== 'web' ? Math.max(insets.bottom + 16, 24) : 24,
          },
        ]}
      >
        <View
          style={[
            styles.container,
            {
              backgroundColor: themeColors.backgroundElement,
              borderColor: themeColors.border,
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="folder-open" size={20} color={themeColors.accent} />
              <Text style={[styles.title, { color: themeColors.text }]}>
                Borradores Guardados ({drafts.length})
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={themeColors.text} />
            </TouchableOpacity>
          </View>

          {/* Acciones Rápidas */}
          <View style={{ flexDirection: 'row', gap: 8, padding: Spacing.two, borderBottomWidth: 1, borderBottomColor: themeColors.border }}>
            <TouchableOpacity
              onPress={onSaveCurrentDraft}
              disabled={isSavingDraft}
              style={[
                styles.actionBtn,
                { backgroundColor: themeColors.primary + '15', borderColor: themeColors.primary },
              ]}
            >
              <Ionicons name="save-outline" size={15} color={themeColors.primary} />
              <Text style={{ color: themeColors.primary, fontSize: 12, fontWeight: '700' }}>
                {isSavingDraft ? 'Guardando...' : 'Guardar Actual'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onStartNewDraft}
              style={[
                styles.actionBtn,
                { backgroundColor: themeColors.accent + '15', borderColor: themeColors.accent },
              ]}
            >
              <Ionicons name="add-circle-outline" size={15} color={themeColors.accent} />
              <Text style={{ color: themeColors.accent, fontSize: 12, fontWeight: '700' }}>
                Nueva Evidencia
              </Text>
            </TouchableOpacity>
          </View>

          {/* Lista de borradores */}
          {drafts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={48} color={themeColors.textSecondary} />
              <Text style={{ color: themeColors.textSecondary, marginTop: 8, fontSize: 14 }}>
                No tienes borradores guardados en este dispositivo.
              </Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1, padding: Spacing.two }} keyboardShouldPersistTaps="handled">
              {drafts.map((d) => {
                const isCurrent = d.id === activeDraftId;
                const formattedDate = new Date(d.updatedAt).toLocaleString([], {
                  dateStyle: 'short',
                  timeStyle: 'short',
                });
                const totalTrabajos = d.trabajos?.length || 0;

                return (
                  <View
                    key={d.id}
                    style={[
                      styles.draftCard,
                      {
                        backgroundColor: isCurrent ? themeColors.accent + '12' : themeColors.background,
                        borderColor: isCurrent ? themeColors.accent : themeColors.border,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.draftTitle, { color: themeColors.text }]}>
                          {d.clienteNombre || 'Sin Cliente Asignado'}
                        </Text>
                        {isCurrent && (
                          <View style={[styles.badge, { backgroundColor: themeColors.accent }]}>
                            <Text style={styles.badgeText}>En Edición</Text>
                          </View>
                        )}
                      </View>

                      {d.sucursalNombre ? (
                        <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>
                          📍 {d.sucursalNombre}
                        </Text>
                      ) : null}

                      <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 4 }}>
                        🕒 {formattedDate} • {totalTrabajos} {totalTrabajos === 1 ? 'trabajo' : 'trabajos'}
                      </Text>
                    </View>

                    {/* Botonera de item */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 8 }}>
                      <TouchableOpacity
                        onPress={() => onDeleteDraft(d.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={[styles.deleteBtn, { backgroundColor: '#ef444415' }]}
                      >
                        <Ionicons name="trash-outline" size={16} color="#ef4444" />
                      </TouchableOpacity>

                      {!isCurrent ? (
                        <TouchableOpacity
                          onPress={() => onLoadDraft(d)}
                          style={[styles.loadBtn, { backgroundColor: themeColors.primary }]}
                        >
                          <Ionicons name="arrow-forward-circle-outline" size={15} color="#fff" />
                          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Cargar</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          onPress={onClose}
                          style={[styles.loadBtn, { backgroundColor: themeColors.accent }]}
                        >
                          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Continuar</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {/* Footer */}
          <View style={[styles.footer, { borderTopColor: themeColors.border }]}>
            <TouchableOpacity
              onPress={onClose}
              style={[
                styles.closeBtn,
                { backgroundColor: themeColors.background, borderColor: themeColors.border },
              ]}
            >
              <Text style={{ color: themeColors.text, fontWeight: '700', fontSize: 13 }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  container: {
    width: '100%',
    maxWidth: 540,
    maxHeight: '85%',
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    paddingVertical: 7,
    borderRadius: BorderRadius.medium,
  },
  emptyContainer: {
    padding: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.two,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    marginBottom: 8,
  },
  draftTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.small,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  deleteBtn: {
    padding: 7,
    borderRadius: BorderRadius.small,
  },
  loadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.small,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: Spacing.two,
    borderTopWidth: 1,
  },
  closeBtn: {
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.medium,
  },
});
