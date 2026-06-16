import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '../constants/theme';
import { Gasto } from '../services/supabase';
import { Ionicons } from '@expo/vector-icons';

interface ExpenseCardProps {
  gasto: Gasto & { isOffline?: boolean };
  onPress: () => void;
  showEmployeeName?: boolean;
}

export default function ExpenseCard({
  gasto,
  onPress,
  showEmployeeName = false,
}: ExpenseCardProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const montoFormatted = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(gasto.monto);

  const rawFecha = gasto.fecha_comprobante || gasto.created_at?.split('T')[0] || '';
  let fecha = rawFecha;
  if (rawFecha) {
    const parts = rawFecha.split('-');
    if (parts.length === 3) {
      fecha = `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  }

  // Configuración de estados
  let statusText = 'PENDIENTE';
  let statusColor: string = themeColors.warning;
  let statusIcon: keyof typeof Ionicons.glyphMap = 'time-outline';

  if (gasto.isOffline) {
    statusText = 'OFFLINE';
    statusColor = themeColors.textSecondary;
    statusIcon = 'cloud-offline-outline';
  } else if (gasto.status === 'APPROVED') {
    statusText = 'APROBADO';
    statusColor = themeColors.success;
    statusIcon = 'checkmark-circle-outline';
  } else if (gasto.status === 'REJECTED') {
    statusText = 'RECHAZADO';
    statusColor = themeColors.danger;
    statusIcon = 'close-circle-outline';
  } else if (gasto.status === 'ACTION_REQUIRED') {
    statusText = 'ACCIÓN REQUERIDA';
    statusColor = themeColors.actionRequired;
    statusIcon = 'alert-circle-outline';
  }

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[
        styles.card,
        {
          backgroundColor: themeColors.backgroundElement,
          borderColor: gasto.status === 'ACTION_REQUIRED' ? themeColors.actionRequired : themeColors.border,
          borderWidth: gasto.status === 'ACTION_REQUIRED' ? 1.5 : 1,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.categoryContainer}>
          <View style={[styles.iconContainer, { backgroundColor: themeColors.background }]}>
            <Ionicons
              name={
                gasto.categoria?.toLowerCase().includes('transporte')
                  ? 'car-outline'
                  : gasto.categoria?.toLowerCase().includes('aliment')
                  ? 'restaurant-outline'
                  : gasto.categoria?.toLowerCase().includes('hosped')
                  ? 'bed-outline'
                  : 'receipt-outline'
              }
              size={18}
              color={themeColors.accent}
            />
          </View>
          <View>
            <Text style={[styles.category, { color: themeColors.text }]} numberOfLines={1}>
              {gasto.categoria || 'Sin Categoría'}
            </Text>
            {gasto.subcategoria && (
              <Text style={[styles.subcat, { color: themeColors.textSecondary }]} numberOfLines={1}>
                {gasto.subcategoria}
              </Text>
            )}
          </View>
        </View>
        <Text style={[styles.monto, { color: themeColors.text }]}>{montoFormatted}</Text>
      </View>

      {showEmployeeName && gasto.empleado_nombre && (
        <View style={styles.detailRow}>
          <Ionicons name="person-outline" size={14} color={themeColors.textSecondary} />
          <Text style={[styles.detailText, { color: themeColors.textSecondary }]}>
            {gasto.empleado_nombre}
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        <View style={styles.leftInfo}>
          <View style={styles.detailRow}>
            <Ionicons name="business-outline" size={14} color={themeColors.textSecondary} />
            <Text style={[styles.detailText, { color: themeColors.textSecondary }]} numberOfLines={1}>
              {gasto.proveedor || 'S/P'}
            </Text>
          </View>
          <View style={[styles.detailRow, { marginLeft: Spacing.two }]}>
            <Ionicons name="calendar-outline" size={14} color={themeColors.textSecondary} />
            <Text style={[styles.detailText, { color: themeColors.textSecondary }]}>{fecha}</Text>
          </View>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
          <Ionicons name={statusIcon} size={12} color={statusColor} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
        </View>
      </View>

      {gasto.status === 'ACTION_REQUIRED' && gasto.rejection_feedback && (
        <View style={[styles.feedbackContainer, { backgroundColor: themeColors.actionRequired + '08' }]}>
          <Text style={[styles.feedbackTitle, { color: themeColors.actionRequired }]}>
            Nota de revisión:
          </Text>
          <Text style={[styles.feedbackText, { color: themeColors.text }]} numberOfLines={2}>
            "{gasto.rejection_feedback}"
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.medium,
    padding: Spacing.three,
    marginBottom: Spacing.two,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  categoryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: Spacing.one,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.small,
    justifyContent: 'center',
    alignItems: 'center',
  },
  category: {
    fontSize: 15,
    fontWeight: '700',
  },
  subcat: {
    fontSize: 12,
    marginTop: 1,
  },
  monto: {
    fontSize: 16,
    fontWeight: '800',
    marginLeft: Spacing.one,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  leftInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: 12,
    maxWidth: 100,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.one,
    paddingVertical: 4,
    borderRadius: BorderRadius.small,
    gap: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  feedbackContainer: {
    marginTop: Spacing.two,
    padding: Spacing.one,
    borderRadius: BorderRadius.small,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent', // Custom color set programmatically or dynamically
  },
  feedbackTitle: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  feedbackText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
});
