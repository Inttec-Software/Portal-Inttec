import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Skeleton, SkeletonCircle, SkeletonText } from './Skeleton';
import { BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export const EmpleadoAsistenciaSkeleton: React.FC = () => {
  const themeColors = useTheme();

  return (
    <View style={styles.container}>
      {/* Icono central de huella / selfie */}
      <View style={{ alignSelf: 'center', marginVertical: Spacing.three }}>
        <SkeletonCircle size={80} />
      </View>

      {/* Título y subtítulo */}
      <View style={{ alignItems: 'center', gap: 6, marginBottom: Spacing.four }}>
        <SkeletonText width={160} height={20} borderRadius={6} />
        <SkeletonText width={260} height={13} borderRadius={4} />
      </View>

      {/* Tarjeta de Estado del Día */}
      <View
        style={[
          styles.statusCard,
          {
            backgroundColor: themeColors.backgroundElement,
            borderColor: themeColors.border,
          },
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <SkeletonCircle size={28} />
          <View style={{ flex: 1, gap: 4 }}>
            <SkeletonText width="55%" height={14} borderRadius={3} />
            <SkeletonText width="80%" height={12} borderRadius={3} />
          </View>
        </View>
      </View>

      {/* Botón de Acción Principal */}
      <View style={{ marginVertical: Spacing.three }}>
        <Skeleton width="100%" height={52} borderRadius={26} />
      </View>

      {/* Tarjeta de Resumen Semanal de Horas */}
      <View
        style={[
          styles.statusCard,
          {
            backgroundColor: themeColors.backgroundElement,
            borderColor: themeColors.border,
            marginTop: Spacing.two,
          },
        ]}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <SkeletonText width="45%" height={14} borderRadius={3} />
          <SkeletonText width="25%" height={14} borderRadius={3} />
        </View>
        <Skeleton width="100%" height={8} borderRadius={4} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: Spacing.four,
    maxWidth: 550,
    width: '100%',
    alignSelf: 'center',
  },
  statusCard: {
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    padding: Spacing.three,
  },
});
