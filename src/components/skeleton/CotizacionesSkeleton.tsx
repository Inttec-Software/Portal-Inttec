import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Skeleton, SkeletonCircle, SkeletonText } from './Skeleton';
import { BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface CotizacionesTableSkeletonProps {
  count?: number;
}

export const CotizacionTableRowSkeleton: React.FC = () => {
  const themeColors = useTheme();

  return (
    <View style={[styles.tableRow, { borderBottomColor: themeColors.border }]}>
      {/* 1. No. C (5%) */}
      <View style={{ width: '5%', alignItems: 'center', justifyContent: 'center' }}>
        <SkeletonText width={22} height={12} borderRadius={3} />
      </View>

      {/* 2. Folio (8%) */}
      <View style={{ width: '8%', alignItems: 'center', justifyContent: 'center' }}>
        <SkeletonText width={48} height={12} borderRadius={3} />
      </View>

      {/* 3. Fecha (9%) */}
      <View style={{ width: '9%', alignItems: 'center', justifyContent: 'center' }}>
        <SkeletonText width={54} height={12} borderRadius={3} />
      </View>

      {/* 4. Usuario (8%) */}
      <View style={{ width: '8%', alignItems: 'center', justifyContent: 'center' }}>
        <SkeletonText width={50} height={12} borderRadius={3} />
      </View>

      {/* 5. Empresa (18%) */}
      <View style={{ width: '18%', paddingHorizontal: 6 }}>
        <SkeletonText width="85%" height={13} borderRadius={3} />
      </View>

      {/* 6. Referencia (14%) */}
      <View style={{ width: '14%', paddingHorizontal: 6 }}>
        <SkeletonText width="75%" height={12} borderRadius={3} />
      </View>

      {/* 7. Estado (10%) */}
      <View style={{ width: '10%', alignItems: 'center', justifyContent: 'center' }}>
        <Skeleton width={62} height={18} borderRadius={10} />
      </View>

      {/* 8. Total (9%) */}
      <View style={{ width: '9%', alignItems: 'flex-end', paddingRight: 8 }}>
        <SkeletonText width={58} height={13} borderRadius={3} />
      </View>

      {/* 9. Acciones (19%) */}
      <View style={{ width: '19%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} width={24} height={24} borderRadius={4} />
        ))}
      </View>
    </View>
  );
};

export const CotizacionesTableSkeleton: React.FC<CotizacionesTableSkeletonProps> = ({ count = 8 }) => {
  return (
    <View>
      {Array.from({ length: count }).map((_, index) => (
        <CotizacionTableRowSkeleton key={index} />
      ))}
    </View>
  );
};

export interface CotizacionCardSkeletonProps {
  style?: object;
}

export const CotizacionCardSkeleton: React.FC<CotizacionCardSkeletonProps> = ({ style }) => {
  const themeColors = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: themeColors.backgroundElement,
          borderColor: themeColors.border,
        },
        style,
      ]}
    >
      {/* Header: Folio + Status Badge */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <SkeletonCircle size={16} />
          <SkeletonText width={80} height={15} borderRadius={4} />
        </View>
        <Skeleton width={68} height={18} borderRadius={10} />
      </View>

      {/* Cliente */}
      <SkeletonText width="65%" height={16} borderRadius={4} />
      <SkeletonText width="45%" height={12} borderRadius={3} style={{ marginTop: 6 }} />

      {/* Partidas Bar */}
      <View style={[styles.partidasBar, { backgroundColor: themeColors.background }]}>
        <SkeletonCircle size={14} style={{ marginRight: 6 }} />
        <SkeletonText width="70%" height={12} borderRadius={3} />
      </View>

      {/* Footer: Fecha y Total */}
      <View style={[styles.cardFooter, { borderTopColor: themeColors.border }]}>
        <SkeletonText width={75} height={12} borderRadius={3} />
        <SkeletonText width={90} height={16} borderRadius={4} />
      </View>

      {/* Botones de acción */}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} width={30} height={30} borderRadius={6} />
        ))}
      </View>
    </View>
  );
};

export interface CotizacionesCardsListSkeletonProps {
  count?: number;
}

export const CotizacionesCardsListSkeleton: React.FC<CotizacionesCardsListSkeletonProps> = ({ count = 5 }) => {
  return (
    <View style={{ gap: 12 }}>
      {Array.from({ length: count }).map((_, index) => (
        <CotizacionCardSkeleton key={index} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    width: '100%',
  },
  card: {
    borderRadius: BorderRadius.medium,
    padding: Spacing.three,
    borderWidth: 1,
  },
  partidasBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 6,
    marginVertical: 10,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
  },
});
