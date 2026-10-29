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
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import CustomButton from '@/components/CustomButton';
import { EvidenciaItem } from '../types';

interface EvidenciaDetailModalProps {
  visible: boolean;
  evidencia: EvidenciaItem | null;
  isAdmin?: boolean;
  isExporting?: boolean;
  onClose: () => void;
  onExportPDF: (evidencia: EvidenciaItem) => void;
  onEdit?: (evidencia: EvidenciaItem) => void;
  onOpenPhoto: (url: string | null) => void;
}

export default function EvidenciaDetailModal({
  visible,
  evidencia,
  isAdmin = false,
  isExporting = false,
  onClose,
  onExportPDF,
  onEdit,
  onOpenPhoto,
}: EvidenciaDetailModalProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();

  if (!evidencia) return null;

  let parsedTrabajos: any[] = [];
  try {
    if (typeof evidencia.descripcion_trabajo === 'string') {
      parsedTrabajos = JSON.parse(evidencia.descripcion_trabajo);
    } else if (Array.isArray(evidencia.descripcion_trabajo)) {
      parsedTrabajos = evidencia.descripcion_trabajo;
    }
  } catch {
    parsedTrabajos = [{ descripcion: String(evidencia.descripcion_trabajo || '') }];
  }

  const techName =
    evidencia.creado_por_nombre ||
    evidencia.usuario?.nombre ||
    'Técnico Autorizado';

  const formattedDate = evidencia.created_at || evidencia.fecha
    ? new Date(evidencia.created_at || evidencia.fecha!).toLocaleDateString('es-MX', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'N/A';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
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
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: themeColors.text }]}>
                Detalle de Evidencia
              </Text>
              <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>
                {formattedDate} • Por: {techName}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={themeColors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1, padding: Spacing.three }} keyboardShouldPersistTaps="handled">
            {/* Cliente */}
            <View style={[styles.infoCard, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="business" size={16} color={themeColors.primary} />
                <Text style={{ fontSize: 15, fontWeight: '700', color: themeColors.text }}>
                  {evidencia.cliente}
                </Text>
              </View>
            </View>

            {/* Trabajos */}
            <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.text, marginVertical: Spacing.two }}>
              Trabajos Realizados ({parsedTrabajos.length})
            </Text>

            {parsedTrabajos.map((t, idx) => (
              <View
                key={idx}
                style={[
                  styles.jobCard,
                  { backgroundColor: themeColors.background, borderColor: themeColors.border },
                ]}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.primary, marginBottom: 4 }}>
                  Trabajo #{idx + 1}
                </Text>

                {t.descripcion ? (
                  <Text style={{ fontSize: 13, color: themeColors.text, marginBottom: 4 }}>
                    <Text style={{ fontWeight: '600' }}>Situación: </Text>
                    {t.descripcion}
                  </Text>
                ) : null}

                {t.solucion ? (
                  <Text style={{ fontSize: 13, color: themeColors.text, marginBottom: 4 }}>
                    <Text style={{ fontWeight: '600' }}>Solución: </Text>
                    {t.solucion}
                  </Text>
                ) : null}

                {t.materiales_usados && t.materiales_usados.length > 0 ? (
                  <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>
                    <Text style={{ fontWeight: '600' }}>Materiales: </Text>
                    {t.materiales_usados.map((m: any) => `${m.usado}x ${m.nombre}`).join(', ')}
                  </Text>
                ) : null}

                {/* Fotos del trabajo */}
                {(t.antesImg || t.despuesImg || (t.fotosAdicionales && t.fotosAdicionales.length > 0)) && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {t.antesImg && (
                      <TouchableOpacity
                        onPress={() => onOpenPhoto(typeof t.antesImg === 'string' ? t.antesImg : t.antesImg.uri)}
                        style={styles.thumbnailBox}
                      >
                        <Image
                          source={{ uri: typeof t.antesImg === 'string' ? t.antesImg : t.antesImg.uri }}
                          style={styles.thumbnail}
                          contentFit="cover"
                        />
                        <View style={[styles.photoTag, { backgroundColor: '#ef4444' }]}>
                          <Text style={styles.photoTagText}>Antes</Text>
                        </View>
                      </TouchableOpacity>
                    )}

                    {t.despuesImg && (
                      <TouchableOpacity
                        onPress={() => onOpenPhoto(typeof t.despuesImg === 'string' ? t.despuesImg : t.despuesImg.uri)}
                        style={styles.thumbnailBox}
                      >
                        <Image
                          source={{ uri: typeof t.despuesImg === 'string' ? t.despuesImg : t.despuesImg.uri }}
                          style={styles.thumbnail}
                          contentFit="cover"
                        />
                        <View style={[styles.photoTag, { backgroundColor: '#22c55e' }]}>
                          <Text style={styles.photoTagText}>Después</Text>
                        </View>
                      </TouchableOpacity>
                    )}

                    {Array.isArray(t.fotosAdicionales) &&
                      t.fotosAdicionales.map((f: any, fIdx: number) => {
                        const url = typeof f === 'string' ? f : f?.uri;
                        if (!url) return null;
                        return (
                          <TouchableOpacity
                            key={fIdx}
                            onPress={() => onOpenPhoto(url)}
                            style={styles.thumbnailBox}
                          >
                            <Image source={{ uri: url }} style={styles.thumbnail} contentFit="cover" />
                          </TouchableOpacity>
                        );
                      })}
                  </View>
                )}
              </View>
            ))}
          </ScrollView>

          {/* Footer de Acciones */}
          <View style={[styles.footer, { borderTopColor: themeColors.border }]}>
            {isAdmin && onEdit && (
              <CustomButton
                title="Editar Evidencia"
                variant="secondary"
                onPress={() => onEdit(evidencia)}
                style={{ flex: 1, marginRight: 8 }}
                icon={<Ionicons name="create-outline" size={16} color={themeColors.text} style={{ marginRight: 6 }} />}
              />
            )}

            <CustomButton
              title="Descargar PDF"
              variant="primary"
              loading={isExporting}
              onPress={() => onExportPDF(evidencia)}
              style={{ flex: 1 }}
              icon={<Ionicons name="document-text-outline" size={16} color="#fff" style={{ marginRight: 6 }} />}
            />
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
    maxWidth: 620,
    maxHeight: '90%',
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
  infoCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    padding: Spacing.two,
  },
  jobCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    padding: Spacing.two,
    marginBottom: Spacing.two,
  },
  thumbnailBox: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.small,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  photoTag: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  photoTagText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
  footer: {
    flexDirection: 'row',
    padding: Spacing.two,
    borderTopWidth: 1,
  },
});
