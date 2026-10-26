import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Skeleton, SkeletonCircle, SkeletonText } from './Skeleton';
import { BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface GastosTableSkeletonProps {
  count?: number;
  isHistorial?: boolean;
}

export const GastoTableRowSkeleton: React.FC<{ isHistorial?: boolean }> = ({ isHistorial = false }) => {
  const themeColors = useTheme();

  if (isHistorial) {
    return (
      <View style={[styles.tableRow, { borderBottomColor: themeColors.border }]}>
        {/* Categoría (11%) */}
        <View style={{ width: '11%', paddingRight: 6 }}>
          <SkeletonText width="80%" height={13} borderRadius={3} />
        </View>

        {/* Empleado (11%) */}
        <View style={{ width: '11%', paddingRight: 6 }}>
          <SkeletonText width="85%" height={13} borderRadius={3} />
        </View>

        {/* Proveedor / Cliente (14%) */}
        <View style={{ width: '14%', paddingRight: 8 }}>
          <SkeletonText width="90%" height={13} borderRadius={3} />
        </View>

        {/* Sucursal (10%) */}
        <View style={{ width: '10%', paddingRight: 6 }}>
          <SkeletonText width="70%" height={12} borderRadius={3} />
        </View>

        {/* Fecha (9%) */}
        <View style={{ width: '9%', paddingRight: 6 }}>
          <SkeletonText width="75%" height={12} borderRadius={3} />
        </View>

        {/* Estado (8%) */}
        <View style={{ width: '8%', paddingRight: 4 }}>
          <Skeleton width={55} height={18} borderRadius={10} />
        </View>

        {/* Reembolso (11%) */}
        <View style={{ width: '11%', paddingRight: 6 }}>
          <SkeletonText width="65%" height={12} borderRadius={3} />
        </View>

        {/* Autorizado (8%) */}
        <View style={{ width: '8%', paddingRight: 4 }}>
          <SkeletonText width="60%" height={12} borderRadius={3} />
        </View>

        {/* Monto (10%) */}
        <View style={{ width: '10%', alignItems: 'flex-end', paddingRight: 8 }}>
          <SkeletonText width="75%" height={14} borderRadius={3} />
        </View>

        {/* Acciones (8%) */}
        <View style={{ width: '8%', flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
          <SkeletonCircle size={16} />
          <SkeletonCircle size={16} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.tableRow, { borderBottomColor: themeColors.border }]}>
      {/* Categoría (12%) */}
      <View style={{ width: '12%', paddingRight: 6 }}>
        <SkeletonText width="80%" height={13} borderRadius={3} />
      </View>

      {/* Empleado (12%) */}
      <View style={{ width: '12%', paddingRight: 6 }}>
        <SkeletonText width="85%" height={13} borderRadius={3} />
      </View>

      {/* Proveedor / Cliente (16%) */}
      <View style={{ width: '16%', paddingRight: 8 }}>
        <SkeletonText width="90%" height={13} borderRadius={3} />
      </View>

      {/* Sucursal (11%) */}
      <View style={{ width: '11%', paddingRight: 6 }}>
        <SkeletonText width="70%" height={12} borderRadius={3} />
      </View>

      {/* Fecha (10%) */}
      <View style={{ width: '10%', paddingRight: 6 }}>
        <SkeletonText width="75%" height={12} borderRadius={3} />
      </View>

      {/* Estado (9%) */}
      <View style={{ width: '9%', paddingRight: 4 }}>
        <Skeleton width={55} height={18} borderRadius={10} />
      </View>

      {/* Autorizado (10%) */}
      <View style={{ width: '10%', paddingRight: 6 }}>
        <SkeletonText width="60%" height={12} borderRadius={3} />
      </View>

      {/* Monto (10%) */}
      <View style={{ width: '10%', alignItems: 'flex-end', paddingRight: 8 }}>
        <SkeletonText width="75%" height={14} borderRadius={3} />
      </View>

      {/* Acciones (10%) */}
      <View style={{ width: '10%', flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
        <SkeletonCircle size={16} />
        <SkeletonCircle size={16} />
      </View>
    </View>
  );
};

export const GastosTableSkeleton: React.FC<GastosTableSkeletonProps> = ({
  count = 8,
  isHistorial = false,
}) => {
  const themeColors = useTheme();

  return (
    <View style={{ paddingHorizontal: Spacing.three, paddingVertical: Spacing.two }}>
      {/* Table Header Row Skeleton */}
      <View
        style={[
          styles.tableHeaderRow,
          {
            backgroundColor: themeColors.background,
            borderBottomColor: themeColors.border,
          },
        ]}
      >
        {isHistorial ? (
          <>
            <View style={{ width: '11%' }}><SkeletonText width="65%" height={13} borderRadius={3} /></View>
            <View style={{ width: '11%' }}><SkeletonText width="65%" height={13} borderRadius={3} /></View>
            <View style={{ width: '14%' }}><SkeletonText width="70%" height={13} borderRadius={3} /></View>
            <View style={{ width: '10%' }}><SkeletonText width="60%" height={13} borderRadius={3} /></View>
            <View style={{ width: '9%' }}><SkeletonText width="55%" height={13} borderRadius={3} /></View>
            <View style={{ width: '8%' }}><SkeletonText width="55%" height={13} borderRadius={3} /></View>
            <View style={{ width: '11%' }}><SkeletonText width="60%" height={13} borderRadius={3} /></View>
            <View style={{ width: '8%' }}><SkeletonText width="55%" height={13} borderRadius={3} /></View>
            <View style={{ width: '10%', alignItems: 'flex-end', paddingRight: 8 }}><SkeletonText width="60%" height={13} borderRadius={3} /></View>
            <View style={{ width: '8%', alignItems: 'center' }}><SkeletonCircle size={14} /></View>
          </>
        ) : (
          <>
            <View style={{ width: '12%' }}><SkeletonText width="65%" height={13} borderRadius={3} /></View>
            <View style={{ width: '12%' }}><SkeletonText width="65%" height={13} borderRadius={3} /></View>
            <View style={{ width: '16%' }}><SkeletonText width="70%" height={13} borderRadius={3} /></View>
            <View style={{ width: '11%' }}><SkeletonText width="60%" height={13} borderRadius={3} /></View>
            <View style={{ width: '10%' }}><SkeletonText width="55%" height={13} borderRadius={3} /></View>
            <View style={{ width: '9%' }}><SkeletonText width="55%" height={13} borderRadius={3} /></View>
            <View style={{ width: '10%' }}><SkeletonText width="60%" height={13} borderRadius={3} /></View>
            <View style={{ width: '10%', alignItems: 'flex-end', paddingRight: 8 }}><SkeletonText width="60%" height={13} borderRadius={3} /></View>
            <View style={{ width: '10%', alignItems: 'center' }}><SkeletonCircle size={14} /></View>
          </>
        )}
      </View>

      {/* Table Body */}
      <View
        style={[
          styles.tableBody,
          {
            backgroundColor: themeColors.backgroundElement,
            borderColor: themeColors.border,
          },
        ]}
      >
        {Array.from({ length: count }).map((_, index) => (
          <GastoTableRowSkeleton key={`gasto-skel-${index}`} isHistorial={isHistorial} />
        ))}
      </View>
    </View>
  );
};

export const GastoCardSkeleton: React.FC = () => {
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
      {/* 1. Header: Categoría a la izquierda & Badges a la derecha */}
      <View style={styles.cardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
          <SkeletonCircle size={26} />
          <SkeletonText width={95} height={13} borderRadius={3} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Skeleton width={62} height={18} borderRadius={10} />
          <Skeleton width={68} height={18} borderRadius={10} />
        </View>
      </View>

      {/* 2. Proveedor / Título & Monto */}
      <View style={styles.cardMainRow}>
        <SkeletonText width="55%" height={16} borderRadius={4} />
        <SkeletonText width="28%" height={18} borderRadius={4} />
      </View>

      {/* 3. Footer: Empleado, Sucursal, Fecha */}
      <View style={styles.cardFooter}>
        <SkeletonText width="45%" height={12} borderRadius={3} />
        <SkeletonText width="25%" height={12} borderRadius={3} />
      </View>
    </View>
  );
};

export interface GastosCardsListSkeletonProps {
  count?: number;
}

export const GastosCardsListSkeleton: React.FC<GastosCardsListSkeletonProps> = ({ count = 6 }) => {
  return (
    <View style={styles.listContent}>
      {Array.from({ length: count }).map((_, index) => (
        <GastoCardSkeleton key={`gasto-card-skel-${index}`} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  tableHeaderRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  tableBody: {
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderWidth: 1,
    borderTopWidth: 0,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
  },
  card: {
    borderRadius: BorderRadius.medium,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
