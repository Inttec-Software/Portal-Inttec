import React from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { Skeleton, SkeletonCircle, SkeletonText } from './Skeleton';
import { BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface AuditoriaTarjetaSkeletonProps {
  count?: number;
}

export const AuditoriaCardSkeleton: React.FC = () => {
  const themeColors = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: themeColors.backgroundElement,
          borderColor: themeColors.border,
        },
      ]}
    >
      {/* 1. Header: Tarjeta dot + Título y Fecha */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.one }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.one }}>
          <SkeletonCircle size={10} />
          <SkeletonText width={150} height={16} borderRadius={4} />
        </View>
        <SkeletonText width={70} height={12} borderRadius={3} />
      </View>

      {/* 2. Titular y Período */}
      <View style={{ gap: 6, marginVertical: Spacing.one }}>
        <SkeletonText width="60%" height={12} borderRadius={3} />
        <SkeletonText width="75%" height={12} borderRadius={3} />
      </View>

      {/* 3. Summary Values Box (Cargos / Conciliado / Faltante) */}
      <View
        style={[
          styles.summaryBox,
          {
            backgroundColor: themeColors.background,
            borderColor: themeColors.border,
          },
        ]}
      >
        <View style={{ alignItems: 'center', flex: 1, gap: 4 }}>
          <SkeletonText width="50%" height={9} borderRadius={2} />
          <SkeletonText width="70%" height={14} borderRadius={3} />
        </View>
        <View style={{ width: 1, height: '80%', backgroundColor: themeColors.border }} />
        <View style={{ alignItems: 'center', flex: 1, gap: 4 }}>
          <SkeletonText width="55%" height={9} borderRadius={2} />
          <SkeletonText width="70%" height={14} borderRadius={3} />
        </View>
        <View style={{ width: 1, height: '80%', backgroundColor: themeColors.border }} />
        <View style={{ alignItems: 'center', flex: 1, gap: 4 }}>
          <SkeletonText width="50%" height={9} borderRadius={2} />
          <SkeletonText width="70%" height={14} borderRadius={3} />
        </View>
      </View>

      {/* 4. Action Buttons Footer */}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: Spacing.one }}>
        <Skeleton width={80} height={28} borderRadius={6} />
        <Skeleton width={80} height={28} borderRadius={6} />
      </View>
    </View>
  );
};

export const AuditoriaTarjetaSkeleton: React.FC<AuditoriaTarjetaSkeletonProps> = ({ count = 4 }) => {
  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, index) => (
        <AuditoriaCardSkeleton key={`audit-skel-${index}`} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.four,
    paddingBottom: 100,
    gap: Spacing.three,
  },
  card: {
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    padding: Spacing.three,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
      android: { elevation: 2 },
      web: { boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)' },
    }),
  },
  summaryBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    marginVertical: Spacing.two,
  },
});
