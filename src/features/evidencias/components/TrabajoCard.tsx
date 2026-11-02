import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import CustomInput from '@/components/CustomInput';
import MaterialesSelector, { ProductoInventario } from '@/components/MaterialesSelector';
import { TrabajoRealizado, MaterialUsadoItem } from '../types';

interface TrabajoCardProps {
  trabajo: TrabajoRealizado;
  index: number;
  totalTrabajos: number;
  formErrors: Record<string, string>;
  productosDisponibles: ProductoInventario[];
  processingPhotoTarget: string | null;
  onUpdateField: (field: keyof TrabajoRealizado, value: any) => void;
  onUpdateMateriales: (mats: MaterialUsadoItem[]) => void;
  onRemove: () => void;
  onClone: () => void;
  onMejorarRedaccion: (texto: string, field: 'descripcion' | 'solucion') => void;
  onCapturePhoto: (type: 'antes' | 'despues' | 'adicional') => void;
  onSelectGallery: (type: 'antes' | 'despues' | 'adicional') => void;
  onRemovePhoto: (type: 'antes' | 'despues' | 'adicional', photoIndex?: number) => void;
  onOpenPhoto: (uri: string | null) => void;
  onLayout?: (e: any) => void;
}

export default function TrabajoCard({
  trabajo,
  index,
  totalTrabajos,
  formErrors,
  productosDisponibles,
  processingPhotoTarget,
  onUpdateField,
  onUpdateMateriales,
  onRemove,
  onClone,
  onMejorarRedaccion,
  onCapturePhoto,
  onSelectGallery,
  onRemovePhoto,
  onOpenPhoto,
  onLayout,
}: TrabajoCardProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const hasErrors = Boolean(formErrors['desc_' + index] || formErrors['sol_' + index]);

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.cardContainer,
        {
          borderLeftColor: hasErrors ? themeColors.danger : themeColors.accent,
          backgroundColor: themeColors.backgroundElement,
          borderColor: themeColors.border,
        },
      ]}
    >
      {/* Header del Trabajo */}
      <View style={styles.cardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>
            Trabajo / Arreglo #{index + 1}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            onPress={onClone}
            style={[styles.smallBtn, { backgroundColor: themeColors.primary + '15' }]}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="copy-outline" size={16} color={themeColors.primary} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.primary }}>Duplicar</Text>
          </TouchableOpacity>

          {totalTrabajos > 1 && (
            <TouchableOpacity
              onPress={onRemove}
              style={[styles.smallBtn, { backgroundColor: '#ef444415' }]}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="trash-outline" size={16} color="#ef4444" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Situación Encontrada */}
      <View style={{ marginBottom: Spacing.two }}>
        <View style={styles.fieldHeader}>
          <Text style={[styles.fieldLabel, { color: themeColors.text }]}>
            Situación encontrada (Descripción del problema) *
          </Text>
          <TouchableOpacity
            onPress={() => onMejorarRedaccion(trabajo.descripcion, 'descripcion')}
            style={[
              styles.aiBtn,
              { backgroundColor: themeColors.primary + '20', borderColor: themeColors.primary },
            ]}
          >
            <Text style={[styles.aiBtnText, { color: themeColors.primary }]}>✨ Mejorar IA</Text>
          </TouchableOpacity>
        </View>
        <CustomInput
          placeholder="Ej. Diagnóstico de falla, cableado expuesto, fuga detectada..."
          value={trabajo.descripcion}
          error={formErrors['desc_' + index]}
          onChangeText={(val) => onUpdateField('descripcion', val)}
          multiline
          numberOfLines={3}
          style={{ minHeight: 70 }}
          iconName="construct-outline"
        />
      </View>

      {/* Selector de Materiales de Inventario */}
      <MaterialesSelector
        productos={productosDisponibles}
        materiales={trabajo.materiales_usados || []}
        usaMateriales={
          trabajo.usa_materiales ??
          Boolean(trabajo.materiales_usados && trabajo.materiales_usados.length > 0)
        }
        onToggleUsaMateriales={(val) => {
          onUpdateField('usa_materiales', val);
          if (!val) {
            onUpdateField('materiales', '');
            onUpdateField('materiales_usados', []);
          }
        }}
        onChange={onUpdateMateriales}
      />

      {/* Solución Realizada */}
      <View style={{ marginBottom: Spacing.two, marginTop: Spacing.two }}>
        <View style={styles.fieldHeader}>
          <Text style={[styles.fieldLabel, { color: themeColors.text }]}>
            Solución (Qué se hizo para solucionar el problema) *
          </Text>
          <TouchableOpacity
            onPress={() => onMejorarRedaccion(trabajo.solucion, 'solucion')}
            style={[
              styles.aiBtn,
              { backgroundColor: themeColors.primary + '20', borderColor: themeColors.primary },
            ]}
          >
            <Text style={[styles.aiBtnText, { color: themeColors.primary }]}>✨ Mejorar IA</Text>
          </TouchableOpacity>
        </View>
        <CustomInput
          placeholder="Ej. Se reemplazó la pieza dañada y se realizaron pruebas operativas..."
          value={trabajo.solucion}
          error={formErrors['sol_' + index]}
          onChangeText={(val) => onUpdateField('solucion', val)}
          multiline
          numberOfLines={2}
          style={{ minHeight: 60 }}
          iconName="checkmark-circle-outline"
        />
      </View>

      {/* Fotografías Antes y Después */}
      <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
        Evidencia Fotográfica
      </Text>

      <View style={styles.photosRow}>
        {/* Foto Antes */}
        <View style={{ flex: 1 }}>
          <Text style={[styles.photoLabel, { color: themeColors.textSecondary }]}>Antes</Text>
          <View
            style={[
              styles.imageBox,
              { backgroundColor: themeColors.background, borderColor: themeColors.border },
            ]}
          >
            {processingPhotoTarget === `antes_${index}` ? (
              <View style={styles.processingCenter}>
                <ActivityIndicator size="small" color={themeColors.primary} />
                <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 4 }}>
                  Procesando...
                </Text>
              </View>
            ) : trabajo.antesImg?.uri ? (
              <View style={styles.imageWrapper}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => onOpenPhoto(trabajo.antesImg?.uri || null)}
                  style={{ flex: 1 }}
                >
                  <Image source={{ uri: trabajo.antesImg.uri }} style={styles.image} contentFit="contain" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deletePhotoBtn}
                  onPress={() => onRemovePhoto('antes')}
                >
                  <Ionicons name="trash" size={14} color="#ffffff" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.placeholderCenter}>
                <Ionicons name="camera-outline" size={24} color={themeColors.textSecondary} />
                <Text style={{ color: themeColors.textSecondary, fontSize: 11, marginTop: 2 }}>
                  Sin foto
                </Text>
              </View>
            )}
          </View>
          <View style={styles.photoActions}>
            <TouchableOpacity
              onPress={() => onCapturePhoto('antes')}
              style={[
                styles.photoActionBtn,
                { backgroundColor: themeColors.background, borderColor: themeColors.border },
              ]}
            >
              <Ionicons name="camera" size={15} color={themeColors.accent} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onSelectGallery('antes')}
              style={[
                styles.photoActionBtn,
                { backgroundColor: themeColors.background, borderColor: themeColors.border },
              ]}
            >
              <Ionicons name="images" size={15} color={themeColors.accent} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Foto Después */}
        <View style={{ flex: 1 }}>
          <Text style={[styles.photoLabel, { color: themeColors.textSecondary }]}>Después</Text>
          <View
            style={[
              styles.imageBox,
              { backgroundColor: themeColors.background, borderColor: themeColors.border },
            ]}
          >
            {processingPhotoTarget === `despues_${index}` ? (
              <View style={styles.processingCenter}>
                <ActivityIndicator size="small" color={themeColors.primary} />
                <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 4 }}>
                  Procesando...
                </Text>
              </View>
            ) : trabajo.despuesImg?.uri ? (
              <View style={styles.imageWrapper}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => onOpenPhoto(trabajo.despuesImg?.uri || null)}
                  style={{ flex: 1 }}
                >
                  <Image source={{ uri: trabajo.despuesImg.uri }} style={styles.image} contentFit="contain" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deletePhotoBtn}
                  onPress={() => onRemovePhoto('despues')}
                >
                  <Ionicons name="trash" size={14} color="#ffffff" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.placeholderCenter}>
                <Ionicons name="checkmark-circle-outline" size={24} color={themeColors.textSecondary} />
                <Text style={{ color: themeColors.textSecondary, fontSize: 11, marginTop: 2 }}>
                  Sin foto
                </Text>
              </View>
            )}
          </View>
          <View style={styles.photoActions}>
            <TouchableOpacity
              onPress={() => onCapturePhoto('despues')}
              style={[
                styles.photoActionBtn,
                { backgroundColor: themeColors.background, borderColor: themeColors.border },
              ]}
            >
              <Ionicons name="camera" size={15} color={themeColors.success} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onSelectGallery('despues')}
              style={[
                styles.photoActionBtn,
                { backgroundColor: themeColors.background, borderColor: themeColors.border },
              ]}
            >
              <Ionicons name="images" size={15} color={themeColors.success} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Fotos Adicionales */}
      <View
        style={[
          styles.additionalBox,
          { backgroundColor: themeColors.background, borderColor: themeColors.border },
        ]}
      >
        <View style={styles.additionalHeader}>
          <Text style={[styles.additionalTitle, { color: themeColors.text }]}>
            Fotos Adicionales ({trabajo.fotosAdicionales?.length || 0}/250)
          </Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              onPress={() => onCapturePhoto('adicional')}
              style={[
                styles.smallActionBtn,
                { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
              ]}
            >
              <Ionicons name="camera" size={14} color={themeColors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onSelectGallery('adicional')}
              style={[
                styles.smallActionBtn,
                { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
              ]}
            >
              <Ionicons name="images" size={14} color={themeColors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {processingPhotoTarget === `adicional_${index}` && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 6 }}>
            <ActivityIndicator size="small" color={themeColors.primary} />
            <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>Añadiendo foto...</Text>
          </View>
        )}

        {trabajo.fotosAdicionales && trabajo.fotosAdicionales.length > 0 ? (
          <View style={styles.thumbnailsGrid}>
            {trabajo.fotosAdicionales.map((photo, pIdx) => (
              <View
                key={pIdx}
                style={[
                  styles.thumbnailWrapper,
                  { borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement },
                ]}
              >
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => onOpenPhoto(photo.uri)}
                  style={{ flex: 1 }}
                >
                  <Image source={{ uri: photo.uri }} style={styles.thumbnail} contentFit="cover" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onRemovePhoto('adicional', pIdx)}
                  style={styles.deleteThumbnailBtn}
                >
                  <Ionicons name="close" size={12} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 4 }}>
            Opcional. Puedes agregar hasta 250 fotos de evidencia para este trabajo.
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    borderLeftWidth: 3.5,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    padding: Spacing.two,
    marginBottom: Spacing.three,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.small,
  },
  fieldHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.one,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  aiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    marginLeft: 8,
  },
  aiBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: Spacing.two,
    marginBottom: Spacing.one,
  },
  photosRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  photoLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  imageBox: {
    height: 120,
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    overflow: 'hidden',
  },
  processingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageWrapper: {
    flex: 1,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  deletePhotoBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(239, 68, 68, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoActions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  photoActionBtn: {
    flex: 1,
    paddingVertical: 5,
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  additionalBox: {
    marginTop: Spacing.two,
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    padding: Spacing.two,
  },
  additionalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  additionalTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  smallActionBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
  },
  thumbnailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  thumbnailWrapper: {
    width: 58,
    height: 58,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  deleteThumbnailBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
