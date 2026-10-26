import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Skeleton, SkeletonCircle, SkeletonText } from './Skeleton';
import { BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface HerramientasGridSkeletonProps {
  count?: number;
  isMobile?: boolean;
}

export const HerramientaCardSkeleton: React.FC<{ isMobile?: boolean }> = ({ isMobile = false }) => {
  const themeColors = useTheme();

  return (
    <View
      style={[
        styles.toolCard,
        {
          backgroundColor: themeColors.backgroundElement,
          borderColor: themeColors.border,
          width: isMobile ? '100%' : '48.5%',
        },
      ]}
    >
      {/* Header: Código/Categoría a la izquierda, Estado a la derecha */}
      <View style={styles.toolCardHeader}>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Skeleton width={55} height={14} borderRadius={3} />
            <Skeleton width={75} height={12} borderRadius={3} />
          </View>
          <SkeletonText width="80%" height={16} borderRadius={4} />
        </View>
        <Skeleton width={75} height={22} borderRadius={11} />
      </View>

      {/* Badges de Cantidad y Desglose de Estado */}
      <View style={{ flexDirection: 'row', gap: 6, marginVertical: 6 }}>
        <Skeleton width={80} height={20} borderRadius={6} />
        <Skeleton width={65} height={20} borderRadius={6} />
      </View>

      {/* Info de Serie / Ubicación */}
      <View style={{ gap: 4, marginTop: 4 }}>
        <SkeletonText width="60%" height={12} borderRadius={3} />
        <SkeletonText width="45%" height={12} borderRadius={3} />
      </View>
    </View>
  );
};

export const HerramientasGridSkeleton: React.FC<HerramientasGridSkeletonProps> = ({
  count = 6,
  isMobile = false,
}) => {
  return (
    <View style={styles.gridContainer}>
      {Array.from({ length: count }).map((_, index) => (
        <HerramientaCardSkeleton key={`tool-skel-${index}`} isMobile={isMobile} />
      ))}
    </View>
  );
};

export interface VehiculosListSkeletonProps {
  count?: number;
}

export const VehiculoCardSkeleton: React.FC = () => {
  const themeColors = useTheme();

  return (
    <View
      style={[
        styles.vehiculoCard,
        {
          backgroundColor: themeColors.background,
          borderColor: themeColors.border,
        },
      ]}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SkeletonCircle size={18} />
          <SkeletonText width="55%" height={15} borderRadius={4} />
          <Skeleton width={55} height={16} borderRadius={8} />
        </View>
        <SkeletonText width="40%" height={12} borderRadius={3} style={{ marginLeft: 26 }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <SkeletonCircle size={24} />
        <SkeletonCircle size={24} />
        <SkeletonCircle size={24} />
      </View>
    </View>
  );
};

export const VehiculosListSkeleton: React.FC<VehiculosListSkeletonProps> = ({ count = 5 }) => {
  return (
    <View style={{ gap: Spacing.one }}>
      {Array.from({ length: count }).map((_, index) => (
        <VehiculoCardSkeleton key={`veh-skel-${index}`} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  toolCard: {
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    padding: Spacing.three,
    marginBottom: Spacing.two,
  },
  toolCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  vehiculoCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.two,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
  },
});
