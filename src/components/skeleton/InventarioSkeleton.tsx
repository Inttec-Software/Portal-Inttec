import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Skeleton, SkeletonCircle, SkeletonText } from './Skeleton';
import { BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface InventarioListSkeletonProps {
  count?: number;
  isMobile?: boolean;
}

export const InventarioItemSkeleton: React.FC<{ isMobile?: boolean }> = ({ isMobile = false }) => {
  const themeColors = useTheme();

  if (isMobile) {
    return (
      <View
        style={[
          styles.listItem,
          {
            backgroundColor: themeColors.backgroundElement,
            borderColor: themeColors.border,
            flexDirection: 'column',
            padding: 12,
            gap: 8,
          },
        ]}
      >
        {/* Fila 1: Checkbox + SKU + Precio */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Skeleton width={20} height={20} borderRadius={4} />
            <Skeleton width={80} height={20} borderRadius={6} />
          </View>
          <SkeletonText width={70} height={16} borderRadius={4} />
        </View>

        {/* Fila 2: Nombre del Producto */}
        <View style={{ gap: 4 }}>
          <SkeletonText width="90%" height={15} borderRadius={4} />
          <SkeletonText width="40%" height={12} borderRadius={3} />
        </View>

        {/* Fila 3: Badges de Stock */}
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          <Skeleton width={90} height={20} borderRadius={10} />
          <Skeleton width={75} height={20} borderRadius={10} />
        </View>

        {/* Fila 4: Acciones */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTopWidth: 1,
            borderTopColor: themeColors.border,
            paddingTop: 8,
            marginTop: 2,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <SkeletonText width={45} height={12} borderRadius={3} />
            <Skeleton width={48} height={28} borderRadius={6} />
            <Skeleton width={28} height={28} borderRadius={6} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <SkeletonCircle size={28} />
            <SkeletonCircle size={28} />
          </View>
        </View>
      </View>
    );
  }

  // Vista de Escritorio
  return (
    <View
      style={[
        styles.listItem,
        {
          backgroundColor: themeColors.backgroundElement,
          borderColor: themeColors.border,
          flexDirection: 'row',
          alignItems: 'center',
          padding: Spacing.three,
        },
      ]}
    >
      {/* Checkbox */}
      <Skeleton width={20} height={20} borderRadius={4} />

      {/* Info Central */}
      <View style={{ flex: 1, gap: 4, marginLeft: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Skeleton width={85} height={20} borderRadius={6} />
          <SkeletonText width="45%" height={15} borderRadius={4} />
        </View>

        <SkeletonText width="25%" height={12} borderRadius={3} />

        <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
          <Skeleton width={95} height={20} borderRadius={10} />
          <Skeleton width={80} height={20} borderRadius={10} />
        </View>
      </View>

      {/* Acciones Derecha */}
      <View style={{ flexDirection: 'row', gap: Spacing.two, alignItems: 'center' }}>
        <SkeletonText width={80} height={18} borderRadius={4} />
        <Skeleton width={50} height={32} borderRadius={6} />
        <Skeleton width={32} height={32} borderRadius={6} />
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <SkeletonCircle size={30} />
          <SkeletonCircle size={30} />
        </View>
      </View>
    </View>
  );
};

export const InventarioListSkeleton: React.FC<InventarioListSkeletonProps> = ({
  count = 7,
  isMobile = false,
}) => {
  return (
    <View style={{ padding: Spacing.three, gap: Spacing.two }}>
      {Array.from({ length: count }).map((_, index) => (
        <InventarioItemSkeleton key={`inv-skel-${index}`} isMobile={isMobile} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  listItem: {
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
});
