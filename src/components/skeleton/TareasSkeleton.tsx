import React from 'react';
import { StyleSheet, View, Platform, useWindowDimensions } from 'react-native';
import { Skeleton, SkeletonText } from './Skeleton';
import { BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface TareasListSkeletonProps {
  count?: number;
}

export const TaskCardSkeleton: React.FC<{ isWeb?: boolean }> = ({ isWeb = false }) => {
  const themeColors = useTheme();

  return (
    <View
      style={[
        styles.taskCard,
        {
          backgroundColor: themeColors.backgroundElement,
          borderColor: themeColors.border,
          width: isWeb ? '32%' : '100%',
          marginBottom: isWeb ? Spacing.four : Spacing.three,
        },
      ]}
    >
      {/* Indicador de semáforo lateral */}
      <View style={[styles.colorIndicator, { backgroundColor: themeColors.border }]} />

      <View style={styles.cardContent}>
        {/* Header: Título y Badge de Estado */}
        <View style={styles.cardHeader}>
          <SkeletonText width="65%" height={16} borderRadius={4} />
          <Skeleton width={75} height={20} borderRadius={10} />
        </View>

        {/* Descripción (2 líneas) */}
        <View style={{ gap: 4, marginVertical: 6 }}>
          <SkeletonText width="95%" height={12} borderRadius={3} />
          <SkeletonText width="70%" height={12} borderRadius={3} />
        </View>

        {/* Vínculo Tag */}
        <View style={{ marginVertical: 4 }}>
          <Skeleton width={110} height={18} borderRadius={4} />
        </View>

        {/* Días restantes / Urgencia */}
        <View style={{ marginVertical: 4 }}>
          <SkeletonText width="40%" height={11} borderRadius={3} />
        </View>

        {/* Footer: Botón de fecha & Responsable */}
        <View style={styles.cardFooter}>
          <Skeleton width={100} height={24} borderRadius={6} />
          <SkeletonText width="35%" height={12} borderRadius={3} />
        </View>
      </View>
    </View>
  );
};

export const TareasListSkeleton: React.FC<TareasListSkeletonProps> = ({ count = 6 }) => {
  const themeColors = useTheme();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web' && width > 768;

  return (
    <View style={styles.scrollContent}>
      {/* Sección 1: Mis Tareas */}
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeader}>
          <SkeletonText width={140} height={18} borderRadius={4} />
          <Skeleton width={20} height={20} borderRadius={10} />
        </View>

        <View style={[styles.gridContainer, isWeb && styles.gridWeb]}>
          {Array.from({ length: Math.min(count, 3) }).map((_, index) => (
            <TaskCardSkeleton key={`my-task-skel-${index}`} isWeb={isWeb} />
          ))}
        </View>
      </View>

      {/* Sección 2: Tareas de Otros */}
      <View style={[styles.sectionContainer, { marginTop: Spacing.four }]}>
        <View style={styles.sectionHeader}>
          <SkeletonText width={170} height={18} borderRadius={4} />
          <Skeleton width={20} height={20} borderRadius={10} />
        </View>

        <View style={[styles.gridContainer, isWeb && styles.gridWeb]}>
          {Array.from({ length: Math.max(1, count - 3) }).map((_, index) => (
            <TaskCardSkeleton key={`other-task-skel-${index}`} isWeb={isWeb} />
          ))}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: Spacing.four,
  },
  sectionContainer: {
    marginBottom: Spacing.three,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
    paddingHorizontal: Spacing.one,
  },
  gridContainer: {
    flexDirection: 'column',
  },
  gridWeb: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: '1.5%',
  },
  taskCard: {
    flexDirection: 'row',
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  colorIndicator: {
    width: 5,
  },
  cardContent: {
    flex: 1,
    padding: Spacing.three,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.one,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(150, 150, 150, 0.1)',
    paddingTop: Spacing.two,
    marginTop: Spacing.two,
  },
});
