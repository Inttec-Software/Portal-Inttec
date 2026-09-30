import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, BorderRadius } from '@/constants/theme';
import { Gasto, GastoHelper } from '@/services/supabase';

interface GastoFotosGalleryProps {
  gasto?: Gasto | null;
  foto_url?: string | null;
  themeColors: any;
  onPhotoPress?: (url: string, index: number, allUrls: string[]) => void;
}

export default function GastoFotosGallery({
  gasto,
  foto_url,
  themeColors,
  onPhotoPress,
}: GastoFotosGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  // Extract all urls using GastoHelper or fallback
  const urls: string[] = gasto
    ? GastoHelper.getFotoUrls(gasto)
    : (foto_url ? GastoHelper.getFotoUrls({ foto_url } as any) : []);

  if (urls.length === 0) {
    return (
      <View style={[styles.noImageContainer, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
        <Ionicons name="image-outline" size={44} color={themeColors.textSecondary} />
        <Text style={[styles.noImageText, { color: themeColors.textSecondary }]}>
          Sin fotografía de ticket
        </Text>
      </View>
    );
  }

  const currentUrl = urls[activeIndex] || urls[0];

  const handlePressMain = () => {
    if (onPhotoPress) {
      onPhotoPress(currentUrl, activeIndex, urls);
    }
  };

  const handlePressThumb = (idx: number) => {
    setActiveIndex(idx);
  };

  return (
    <View style={styles.container}>
      {urls.length > 1 && (
        <View style={styles.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="images" size={16} color={themeColors.accent} />
            <Text style={[styles.headerTitle, { color: themeColors.text }]}>
              Fotografías del Comprobante
            </Text>
          </View>
          <View style={[styles.counterPill, { backgroundColor: themeColors.accent + '20', borderColor: themeColors.accent }]}>
            <Text style={[styles.counterPillText, { color: themeColors.accent }]}>
              {urls.length} fotos
            </Text>
          </View>
        </View>
      )}

      {/* Main Active Image */}
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={handlePressMain}
        style={[styles.mainImageContainer, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
      >
        <Image
          source={{ uri: currentUrl }}
          style={styles.mainImage}
          contentFit="contain"
          transition={200}
        />
        <View style={styles.zoomOverlay}>
          <Ionicons name="scan-outline" size={14} color="#ffffff" />
          <Text style={styles.zoomOverlayText}>
            {urls.length > 1 ? `Toca para ampliar (${activeIndex + 1}/${urls.length})` : 'Toca para ampliar'}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Thumbnails row if multiple images */}
      {urls.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbsScroll}
        >
          {urls.map((url, idx) => {
            const isSelected = idx === activeIndex;
            return (
              <TouchableOpacity
                key={`${url}_${idx}`}
                onPress={() => handlePressThumb(idx)}
                activeOpacity={0.8}
                style={[
                  styles.thumbWrapper,
                  {
                    borderColor: isSelected ? themeColors.accent : themeColors.border,
                    backgroundColor: themeColors.backgroundElement,
                  },
                  isSelected && styles.thumbWrapperActive,
                ]}
              >
                <Image
                  source={{ uri: url }}
                  style={styles.thumbImage}
                  contentFit="cover"
                />
                <View style={[styles.thumbBadge, { backgroundColor: isSelected ? themeColors.accent : 'rgba(0,0,0,0.6)' }]}>
                  <Text style={styles.thumbBadgeText}>#{idx + 1}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: Spacing.three,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  counterPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
  counterPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  mainImageContainer: {
    width: '100%',
    height: 250,
    borderRadius: BorderRadius.medium,
    overflow: 'hidden',
    borderWidth: 1,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainImage: {
    width: '100%',
    height: '100%',
  },
  zoomOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.pill,
  },
  zoomOverlayText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  noImageContainer: {
    width: '100%',
    height: 180,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.one,
    marginBottom: Spacing.three,
  },
  noImageText: {
    fontSize: 13,
    fontWeight: '500',
  },
  thumbsScroll: {
    gap: Spacing.two,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
    paddingHorizontal: 2,
  },
  thumbWrapper: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.medium,
    overflow: 'hidden',
    borderWidth: 1.5,
    position: 'relative',
  },
  thumbWrapperActive: {
    borderWidth: 2.5,
    transform: [{ scale: 1.05 }],
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbBadge: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  thumbBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
});
