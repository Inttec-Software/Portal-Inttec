import React from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';
import { Skeleton, SkeletonCircle, SkeletonText } from './Skeleton';
import { BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface FacturacionTableSkeletonProps {
  count?: number;
}

export const FacturacionTableRowSkeleton: React.FC = () => {
  const themeColors = useTheme();

  return (
    <View style={[styles.facturasTableRow, { borderBottomColor: themeColors.border }]}>
      {/* Checkbox (40px) */}
      <View style={{ width: 40, alignItems: 'center', justifyContent: 'center' }}>
        <Skeleton width={18} height={18} borderRadius={4} />
      </View>

      {/* Número / Folio (110px) */}
      <View style={{ width: 110, justifyContent: 'center' }}>
        <SkeletonText width={70} height={14} borderRadius={3} />
      </View>

      {/* Cliente (flex 1, minWidth 200) */}
      <View style={{ flex: 1, minWidth: 200, justifyContent: 'center', paddingRight: 8 }}>
        <SkeletonText width="80%" height={14} borderRadius={3} />
        <SkeletonText width="60%" height={10} borderRadius={2} style={{ marginTop: 4 }} />
      </View>

      {/* Etiqueta (130px) */}
      <View style={{ width: 130, justifyContent: 'center' }}>
        <Skeleton width={80} height={20} borderRadius={6} />
      </View>

      {/* Fecha (125px) */}
      <View style={{ width: 125, justifyContent: 'center' }}>
        <SkeletonText width={75} height={12} borderRadius={3} />
      </View>

      {/* Total (135px) */}
      <View style={{ width: 135, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 10 }}>
        <SkeletonText width={80} height={14} borderRadius={3} />
      </View>

      {/* Estado (110px) */}
      <View style={{ width: 110, alignItems: 'center', justifyContent: 'center' }}>
        <Skeleton width={75} height={20} borderRadius={10} />
      </View>

      {/* Acciones (140px) */}
      <View style={{ width: 140, flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
        <SkeletonCircle size={24} />
        <SkeletonCircle size={24} />
        <SkeletonCircle size={24} />
      </View>
    </View>
  );
};

export const FacturacionTableSkeleton: React.FC<FacturacionTableSkeletonProps> = ({ count = 8 }) => {
  const themeColors = useTheme();

  return (
    <ScrollView style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
        <ScrollView
          horizontal={true}
          showsHorizontalScrollIndicator={false}
          style={{ width: '100%' }}
          contentContainerStyle={{ minWidth: '100%' }}
        >
          <View
            style={[
              styles.tableContainer,
              {
                backgroundColor: themeColors.backgroundElement,
                borderColor: themeColors.border,
              },
            ]}
          >
            {/* Header */}
            <View
              style={[
                styles.facturasTableHeader,
                {
                  backgroundColor: themeColors.background,
                  borderBottomColor: themeColors.border,
                },
              ]}
            >
              <View style={{ width: 40, alignItems: 'center' }}>
                <Skeleton width={18} height={18} borderRadius={4} />
              </View>
              <View style={{ width: 110 }}><SkeletonText width={55} height={13} borderRadius={3} /></View>
              <View style={{ flex: 1, minWidth: 200 }}><SkeletonText width={70} height={13} borderRadius={3} /></View>
              <View style={{ width: 130 }}><SkeletonText width={60} height={13} borderRadius={3} /></View>
              <View style={{ width: 125 }}><SkeletonText width={65} height={13} borderRadius={3} /></View>
              <View style={{ width: 135, alignItems: 'flex-end', paddingRight: 10 }}><SkeletonText width={45} height={13} borderRadius={3} /></View>
              <View style={{ width: 110, alignItems: 'center' }}><SkeletonText width={50} height={13} borderRadius={3} /></View>
              <View style={{ width: 140, alignItems: 'center' }}><SkeletonText width={60} height={13} borderRadius={3} /></View>
            </View>

            {/* Rows */}
            {Array.from({ length: count }).map((_, index) => (
              <FacturacionTableRowSkeleton key={`fac-row-skel-${index}`} />
            ))}
          </View>
        </ScrollView>
      </View>
    </ScrollView>
  );
};

export const FacturacionCardSkeleton: React.FC = () => {
  const themeColors = useTheme();

  return (
    <View
      style={[
        styles.facturaRowCard,
        {
          backgroundColor: themeColors.backgroundElement,
          borderColor: themeColors.border,
        },
      ]}
    >
      {/* 1. Header: Folio y Estado */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Skeleton width={18} height={18} borderRadius={4} />
          <SkeletonText width={80} height={15} borderRadius={4} />
        </View>
        <Skeleton width={70} height={20} borderRadius={10} />
      </View>

      {/* 2. Cliente y UUID */}
      <View style={{ marginBottom: 10, gap: 4 }}>
        <SkeletonText width="70%" height={14} borderRadius={3} />
        <SkeletonText width="85%" height={10} borderRadius={2} />
      </View>

      {/* 3. Fecha y Total */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <SkeletonText width={90} height={12} borderRadius={3} />
        <SkeletonText width={95} height={16} borderRadius={4} />
      </View>

      {/* 4. Barra de Acciones */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 10,
          borderTopWidth: 1,
          borderTopColor: themeColors.border,
          paddingTop: 8,
        }}
      >
        <SkeletonCircle size={28} />
        <SkeletonCircle size={28} />
        <SkeletonCircle size={28} />
      </View>
    </View>
  );
};

export const FacturacionCardsListSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => {
  return (
    <View style={{ gap: 10, paddingHorizontal: 16, paddingVertical: 12 }}>
      {Array.from({ length: count }).map((_, index) => (
        <FacturacionCardSkeleton key={`fac-card-skel-${index}`} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  tableContainer: {
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  facturasTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  facturasTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  facturaRowCard: {
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
});
