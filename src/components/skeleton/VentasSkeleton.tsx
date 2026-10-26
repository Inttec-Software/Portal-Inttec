import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Skeleton, SkeletonCircle, SkeletonText } from './Skeleton';
import { BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface VentasTableSkeletonProps {
  count?: number;
}

export const VentaTableRowSkeleton: React.FC = () => {
  const themeColors = useTheme();

  return (
    <View style={[styles.tableRow, { borderBottomColor: themeColors.border }]}>
      {/* 1. Cliente (13%) */}
      <View style={{ width: '13%', paddingRight: 6 }}>
        <SkeletonText width="85%" height={14} borderRadius={3} />
      </View>

      {/* 2. Sucursal (10%) */}
      <View style={{ width: '10%', paddingRight: 6 }}>
        <SkeletonText width="70%" height={12} borderRadius={3} />
      </View>

      {/* 3. Fecha (8%) */}
      <View style={{ width: '8%', paddingRight: 4 }}>
        <SkeletonText width="75%" height={12} borderRadius={3} />
      </View>

      {/* 4. Referencia (9%) */}
      <View style={{ width: '9%', paddingRight: 4 }}>
        <SkeletonText width="80%" height={12} borderRadius={3} />
      </View>

      {/* 5. Proyecto (8%) */}
      <View style={{ width: '8%' }}>
        <Skeleton width={52} height={18} borderRadius={10} />
      </View>

      {/* 6. Estado Pago (10%) */}
      <View style={{ width: '10%' }}>
        <Skeleton width={68} height={18} borderRadius={10} />
      </View>

      {/* 7. Total Venta (11%) */}
      <View style={{ width: '11%', alignItems: 'flex-end', paddingRight: 8 }}>
        <SkeletonText width="75%" height={14} borderRadius={3} />
      </View>

      {/* 8. Pagado / Saldo (11%) */}
      <View style={{ width: '11%', alignItems: 'flex-end', paddingRight: 8 }}>
        <SkeletonText width="70%" height={12} borderRadius={3} />
        <SkeletonText width="55%" height={10} borderRadius={3} style={{ marginTop: 4 }} />
      </View>

      {/* 9. Utilidad (8%) */}
      <View style={{ width: '8%', alignItems: 'flex-end', paddingRight: 4 }}>
        <SkeletonText width="75%" height={13} borderRadius={3} />
      </View>

      {/* 10. Acciones (12%) */}
      <View style={{ width: '12%', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} width={24} height={24} borderRadius={6} />
        ))}
      </View>
    </View>
  );
};

export const VentasTableSkeleton: React.FC<VentasTableSkeletonProps> = ({ count = 8 }) => {
  const themeColors = useTheme();

  return (
    <View style={{ paddingHorizontal: Spacing.three, paddingVertical: Spacing.two }}>
      {/* Header simulado de tabla */}
      <View style={[styles.tableHeaderRow, { backgroundColor: themeColors.background, borderBottomColor: themeColors.border }]}>
        <View style={{ width: '13%' }}><SkeletonText width={48} height={12} borderRadius={3} /></View>
        <View style={{ width: '10%' }}><SkeletonText width={54} height={12} borderRadius={3} /></View>
        <View style={{ width: '8%' }}><SkeletonText width={40} height={12} borderRadius={3} /></View>
        <View style={{ width: '9%' }}><SkeletonText width={60} height={12} borderRadius={3} /></View>
        <View style={{ width: '8%' }}><SkeletonText width={50} height={12} borderRadius={3} /></View>
        <View style={{ width: '10%' }}><SkeletonText width={70} height={12} borderRadius={3} /></View>
        <View style={{ width: '11%', alignItems: 'flex-end', paddingRight: 8 }}><SkeletonText width={65} height={12} borderRadius={3} /></View>
        <View style={{ width: '11%', alignItems: 'flex-end', paddingRight: 8 }}><SkeletonText width={80} height={12} borderRadius={3} /></View>
        <View style={{ width: '8%', alignItems: 'flex-end', paddingRight: 4 }}><SkeletonText width={50} height={12} borderRadius={3} /></View>
        <View style={{ width: '12%', alignItems: 'center' }}><SkeletonText width={50} height={12} borderRadius={3} /></View>
      </View>

      {/* Filas con borde contenedor */}
      <View
        style={{
          backgroundColor: themeColors.backgroundElement,
          borderBottomLeftRadius: 8,
          borderBottomRightRadius: 8,
          borderWidth: 1,
          borderColor: themeColors.border,
          borderTopWidth: 0,
        }}
      >
        {Array.from({ length: count }).map((_, index) => (
          <VentaTableRowSkeleton key={index} />
        ))}
      </View>
    </View>
  );
};

export interface VentaCardSkeletonProps {
  style?: object;
}

export const VentaCardSkeleton: React.FC<VentaCardSkeletonProps> = ({ style }) => {
  const themeColors = useTheme();

  return (
    <View
      style={[
        styles.historialCard,
        {
          backgroundColor: themeColors.backgroundElement,
          borderColor: themeColors.border,
        },
        style,
      ]}
    >
      {/* 1. Header: Icono + Tipo a la izquierda, Badge a la derecha */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <SkeletonCircle size={26} />
          <Skeleton width={60} height={18} borderRadius={10} />
        </View>
        <Skeleton width={70} height={18} borderRadius={10} />
      </View>

      {/* 2. Cliente */}
      <View style={{ marginBottom: 6 }}>
        <SkeletonText width="65%" height={16} borderRadius={4} />
        <SkeletonText width="40%" height={12} borderRadius={3} style={{ marginTop: 4 }} />
      </View>

      {/* 3. Metadatos Box */}
      <View style={[styles.metadataBox, { backgroundColor: themeColors.background, borderColor: themeColors.border + '40' }]}>
        <SkeletonText width="50%" height={12} borderRadius={3} />
        <SkeletonText width="80%" height={12} borderRadius={3} style={{ marginTop: 4 }} />
      </View>

      {/* 4. Totales */}
      <View style={[styles.historialTotals, { backgroundColor: themeColors.background, borderColor: themeColors.border + '40' }]}>
        <View style={{ flex: 1 }}>
          <SkeletonText width={45} height={10} borderRadius={2} />
          <SkeletonText width={70} height={12} borderRadius={3} style={{ marginTop: 4 }} />
        </View>
        <View style={{ flex: 1.2, alignItems: 'center' }}>
          <SkeletonText width={55} height={10} borderRadius={2} />
          <SkeletonText width={80} height={13} borderRadius={3} style={{ marginTop: 4 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <SkeletonText width={45} height={10} borderRadius={2} />
          <SkeletonText width={65} height={12} borderRadius={3} style={{ marginTop: 4 }} />
        </View>
      </View>

      {/* 5. Acciones */}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} width={30} height={30} borderRadius={6} />
        ))}
      </View>
    </View>
  );
};

export interface VentasCardsListSkeletonProps {
  count?: number;
}

export const VentasCardsListSkeleton: React.FC<VentasCardsListSkeletonProps> = ({ count = 5 }) => {
  return (
    <View style={{ padding: Spacing.three, gap: Spacing.two }}>
      {Array.from({ length: count }).map((_, index) => (
        <VentaCardSkeleton key={index} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderWidth: 1,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  historialCard: {
    borderRadius: BorderRadius.medium,
    padding: Spacing.three,
    borderWidth: 1,
  },
  metadataBox: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  historialTotals: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
});
