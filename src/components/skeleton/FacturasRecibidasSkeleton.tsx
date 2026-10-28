import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Skeleton, SkeletonCircle, SkeletonText } from './Skeleton';
import { BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface FacturaCardSkeletonProps {
  style?: object;
}

export const FacturaCardSkeleton: React.FC<FacturaCardSkeletonProps> = ({ style }) => {
  const themeColors = useTheme();

  return (
    <View
      style={[
        styles.facturaCard,
        {
          backgroundColor: themeColors.backgroundElement,
          borderColor: themeColors.border,
        },
        style,
      ]}
    >
      {/* Header: Emisor y Monto / Badge */}
      <View style={styles.cardHeader}>
        <View style={{ flex: 1, marginRight: 12 }}>
          {/* Nombre de Emisor */}
          <SkeletonText width="75%" height={16} borderRadius={4} />
          {/* RFC y Fecha */}
          <SkeletonText width="55%" height={12} borderRadius={4} style={{ marginTop: 6 }} />
        </View>

        <View style={{ alignItems: 'flex-end' }}>
          {/* Total Factura */}
          <SkeletonText width={95} height={16} borderRadius={4} />
          {/* Badge de Estatus */}
          <Skeleton width={68} height={18} borderRadius={10} style={{ marginTop: 6 }} />
        </View>
      </View>

      {/* Footer: UUID y botón de acción */}
      <View style={[styles.cardFooter, { borderTopColor: themeColors.border }]}>
        <SkeletonText width="60%" height={11} borderRadius={3} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Skeleton width={26} height={26} borderRadius={6} />
          <Skeleton width={14} height={14} borderRadius={7} />
        </View>
      </View>
    </View>
  );
};

export const FacturasKpiGridSkeleton: React.FC = () => {
  const themeColors = useTheme();

  return (
    <View style={styles.kpiGrid}>
      {[0, 1, 2].map((idx) => (
        <View
          key={idx}
          style={[
            styles.kpiCard,
            {
              backgroundColor: themeColors.backgroundElement,
              borderColor: themeColors.border,
            },
          ]}
        >
          <SkeletonCircle size={44} style={{ marginRight: 12 }} />
          <View style={{ flex: 1 }}>
            <SkeletonText width="50%" height={12} borderRadius={4} />
            <SkeletonText width="75%" height={18} borderRadius={4} style={{ marginTop: 6 }} />
          </View>
        </View>
      ))}
    </View>
  );
};

export interface FacturasListSkeletonProps {
  count?: number;
}

export const FacturasListSkeleton: React.FC<FacturasListSkeletonProps> = ({ count = 6 }) => {
  return (
    <View style={styles.facturasList}>
      {Array.from({ length: count }).map((_, index) => (
        <FacturaCardSkeleton key={index} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  kpiGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: Spacing.four,
    flexWrap: 'wrap',
  },
  kpiCard: {
    flex: 1,
    minWidth: 200,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
  facturasList: {
    gap: 12,
  },
  facturaCard: {
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
  },
});
