import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Skeleton, SkeletonCircle, SkeletonText } from './Skeleton';
import { BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  GastosTableSkeleton,
  GastosCardsListSkeleton,
  GastosTableSkeletonProps,
  GastosCardsListSkeletonProps,
} from './GastosSkeleton';

// ==========================================
// CATALOGOS SKELETON
// ==========================================

export const CatalogoItemSkeleton: React.FC = () => {
  const themeColors = useTheme();

  return (
    <View
      style={[
        styles.catCard,
        {
          backgroundColor: themeColors.backgroundElement,
          borderColor: themeColors.border,
        },
      ]}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <SkeletonText width="65%" height={15} borderRadius={4} />
        <SkeletonText width="40%" height={12} borderRadius={3} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <SkeletonCircle size={24} />
        <SkeletonCircle size={24} />
      </View>
    </View>
  );
};

export const CatalogosListSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => {
  return (
    <View style={{ gap: Spacing.two, paddingHorizontal: Spacing.two, paddingBottom: 40 }}>
      {Array.from({ length: count }).map((_, index) => (
        <CatalogoItemSkeleton key={`cat-skel-${index}`} />
      ))}
    </View>
  );
};

// ==========================================
// REPORTES SKELETON
// ==========================================

export interface ReportesTableSkeletonProps extends GastosTableSkeletonProps {}
export interface ReportesCardsListSkeletonProps extends GastosCardsListSkeletonProps {}

export const ReportesTableSkeleton: React.FC<ReportesTableSkeletonProps> = (props) => {
  return <GastosTableSkeleton {...props} />;
};

export const ReportesCardsListSkeleton: React.FC<ReportesCardsListSkeletonProps> = (props) => {
  return <GastosCardsListSkeleton {...props} />;
};

const styles = StyleSheet.create({
  catCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
});
