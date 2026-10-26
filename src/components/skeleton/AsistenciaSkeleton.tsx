import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Skeleton, SkeletonCircle, SkeletonText } from './Skeleton';
import { BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface AsistenciaGridSkeletonProps {
  count?: number;
}

export const AsistenciaCardSkeleton: React.FC = () => {
  const themeColors = useTheme();

  return (
    <View
      style={[
        styles.employeeCard,
        {
          backgroundColor: themeColors.backgroundElement,
          borderColor: themeColors.border,
        },
      ]}
    >
      {/* 1. Header con avatar, nombre/rol y badge de estado */}
      <View style={styles.cardTop}>
        <SkeletonCircle size={40} />

        <View style={{ flex: 1, marginLeft: 12 }}>
          <SkeletonText width="65%" height={15} borderRadius={4} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <SkeletonText width="35%" height={11} borderRadius={3} />
            <SkeletonText width="30%" height={11} borderRadius={3} />
          </View>
        </View>

        <Skeleton width={88} height={24} borderRadius={12} />
      </View>

      {/* 2. Caja de Horarios (Entrada / Salida) */}
      <View
        style={[
          styles.horariosBox,
          {
            backgroundColor: themeColors.background,
            borderColor: themeColors.border,
          },
        ]}
      >
        <View style={styles.horarioRow}>
          <SkeletonText width="35%" height={12} borderRadius={3} />
          <SkeletonText width="25%" height={12} borderRadius={3} />
        </View>
        <View style={[styles.horarioRow, { marginTop: 8 }]}>
          <SkeletonText width="32%" height={12} borderRadius={3} />
          <SkeletonText width="28%" height={12} borderRadius={3} />
        </View>
      </View>

      {/* 3. Resumen de Horas de Jornada */}
      <View
        style={[
          styles.hoursGrid,
          {
            backgroundColor: themeColors.background,
            borderColor: themeColors.border,
          },
        ]}
      >
        <View style={{ flex: 1, paddingRight: 8 }}>
          <SkeletonText width="45%" height={10} borderRadius={2} />
          <View style={{ marginTop: 6 }}>
            <SkeletonText width="60%" height={16} borderRadius={4} />
          </View>
        </View>
        <View style={{ width: 1, height: '80%', backgroundColor: themeColors.border }} />
        <View style={{ flex: 1, paddingLeft: 12 }}>
          <SkeletonText width="55%" height={10} borderRadius={2} />
          <View style={{ marginTop: 6 }}>
            <SkeletonText width="50%" height={16} borderRadius={4} />
          </View>
        </View>
      </View>

      {/* 4. Barra de Progreso Jornada */}
      <View style={{ marginTop: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
          <SkeletonText width="30%" height={10} borderRadius={2} />
          <SkeletonText width="15%" height={10} borderRadius={2} />
        </View>
        <Skeleton width="100%" height={8} borderRadius={4} />
      </View>
    </View>
  );
};

export const AsistenciaGridSkeleton: React.FC<AsistenciaGridSkeletonProps> = ({ count = 6 }) => {
  return (
    <View style={styles.employeeGrid}>
      {Array.from({ length: count }).map((_, index) => (
        <AsistenciaCardSkeleton key={`asistencia-skel-${index}`} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  employeeGrid: {
    gap: Spacing.two,
  },
  employeeCard: {
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  horariosBox: {
    padding: 10,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    marginBottom: 10,
  },
  horarioRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hoursGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
});
