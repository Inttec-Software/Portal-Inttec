import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Skeleton, SkeletonCircle, SkeletonText } from './Skeleton';
import { BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// ==========================================
// EVIDENCIAS SKELETON
// ==========================================

export interface EvidenciasTableSkeletonProps {
  count?: number;
}

export const EvidenciasTableRowSkeleton: React.FC = () => {
  const themeColors = useTheme();

  return (
    <View style={[styles.tableRow, { borderBottomColor: themeColors.border }]}>
      <View style={{ width: '15%', paddingRight: 6 }}>
        <SkeletonText width="75%" height={12} borderRadius={3} />
      </View>
      <View style={{ width: '20%', paddingRight: 6 }}>
        <SkeletonText width="85%" height={13} borderRadius={3} />
      </View>
      <View style={{ width: '25%', paddingRight: 8 }}>
        <SkeletonText width="80%" height={13} borderRadius={3} />
      </View>
      <View style={{ width: '15%', paddingRight: 6 }}>
        <SkeletonText width="60%" height={12} borderRadius={3} />
      </View>
      <View style={{ width: '15%', paddingRight: 6 }}>
        <SkeletonText width="50%" height={12} borderRadius={3} />
      </View>
      <View style={{ width: '10%', alignItems: 'center' }}>
        <SkeletonCircle size={16} />
      </View>
    </View>
  );
};

export const EvidenciasTableSkeleton: React.FC<EvidenciasTableSkeletonProps> = ({ count = 8 }) => {
  const themeColors = useTheme();

  return (
    <View style={{ paddingHorizontal: Spacing.three, paddingVertical: Spacing.two }}>
      <View style={[styles.tableHeaderRow, { backgroundColor: themeColors.background, borderBottomColor: themeColors.border }]}>
        <View style={{ width: '15%' }}><SkeletonText width="55%" height={13} borderRadius={3} /></View>
        <View style={{ width: '20%' }}><SkeletonText width="65%" height={13} borderRadius={3} /></View>
        <View style={{ width: '25%' }}><SkeletonText width="60%" height={13} borderRadius={3} /></View>
        <View style={{ width: '15%' }}><SkeletonText width="50%" height={13} borderRadius={3} /></View>
        <View style={{ width: '15%' }}><SkeletonText width="50%" height={13} borderRadius={3} /></View>
        <View style={{ width: '10%', alignItems: 'center' }}><SkeletonCircle size={14} /></View>
      </View>

      <View style={[styles.tableBody, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
        {Array.from({ length: count }).map((_, index) => (
          <EvidenciasTableRowSkeleton key={`evi-row-skel-${index}`} />
        ))}
      </View>
    </View>
  );
};

export const EvidenciaCardSkeleton: React.FC = () => {
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
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <SkeletonText width="50%" height={15} borderRadius={4} />
        <SkeletonText width="25%" height={12} borderRadius={3} />
      </View>
      <SkeletonText width="70%" height={13} borderRadius={3} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        <Skeleton width={70} height={20} borderRadius={10} />
        <SkeletonCircle size={24} />
      </View>
    </View>
  );
};

export const EvidenciasCardsListSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => {
  return (
    <View style={{ paddingHorizontal: Spacing.three, gap: Spacing.two }}>
      {Array.from({ length: count }).map((_, index) => (
        <EvidenciaCardSkeleton key={`evi-card-skel-${index}`} />
      ))}
    </View>
  );
};

// ==========================================
// DOCUMENTOS SKELETON
// ==========================================

export const DocumentoCardSkeleton: React.FC = () => {
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
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <SkeletonText width="60%" height={16} borderRadius={4} />
        <Skeleton width={80} height={22} borderRadius={11} />
      </View>
      <View style={{ gap: 4, marginVertical: 6 }}>
        <SkeletonText width="90%" height={12} borderRadius={3} />
        <SkeletonText width="65%" height={12} borderRadius={3} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, borderTopWidth: 1, borderTopColor: themeColors.border, paddingTop: 8 }}>
        <SkeletonText width="45%" height={11} borderRadius={2} />
        <Skeleton width={110} height={28} borderRadius={6} />
      </View>
    </View>
  );
};

export const DocumentosListSkeleton: React.FC<{ count?: number }> = ({ count = 5 }) => {
  return (
    <View style={{ gap: Spacing.two }}>
      {Array.from({ length: count }).map((_, index) => (
        <DocumentoCardSkeleton key={`doc-skel-${index}`} />
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
  card: {
    borderRadius: BorderRadius.medium,
    padding: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
});
