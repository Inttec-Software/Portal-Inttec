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
      {/* Header: Categoria & Status Badge */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
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
            size={16}
            color={themeColors.accent}
          />
          <Text style={[styles.category, { color: themeColors.text }]} numberOfLines={1}>
            {gasto.categoria || 'Sin Categoría'}
            {gasto.subcategoria ? ` - ${gasto.subcategoria}` : ''}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
          <Ionicons name={statusIcon} size={11} color={statusColor} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
        </View>
      </View>
      
      {/* Detalle */}
      <View style={{ gap: 4, marginBottom: 8 }}>
        {showEmployeeName && gasto.empleado_nombre && (
          <Text style={[styles.detailText, { color: themeColors.textSecondary }]} numberOfLines={1}>
            <Text style={{fontWeight: '600', color: themeColors.text}}>Empleado: </Text>
            {gasto.empleado_nombre}
          </Text>
        )}
        {(gasto.proveedor || gasto.cliente) && (
          <Text style={[styles.detailText, { color: themeColors.textSecondary }]} numberOfLines={1}>
            <Text style={{fontWeight: '600', color: themeColors.text}}>Detalle: </Text>
            {gasto.proveedor}
            {gasto.proveedor && gasto.cliente ? ' | ' : ''}
            {gasto.cliente}
          </Text>
        )}
      </View>

      {/* Footer: Fecha & Monto */}
      <View style={styles.footer}>
        <View style={styles.detailRow}>
          <Ionicons name="calendar-outline" size={12} color={themeColors.textSecondary} />
          <Text style={[styles.detailText, { color: themeColors.textSecondary }]}>{fecha}</Text>
        </View>
        <Text style={[styles.monto, { color: themeColors.text }]}>{montoFormatted}</Text>
      </View>

      {gasto.status === 'ACTION_REQUIRED' && gasto.rejection_feedback && (
        <View style={[styles.feedbackContainer, { backgroundColor: themeColors.actionRequired + '08' }]}>
          <Text style={[styles.feedbackTitle, { color: themeColors.actionRequired }]}>
            Nota de revisión:
          </Text>
          <Text style={[styles.feedbackText, { color: themeColors.text }]} numberOfLines={2}>
            {`"${gasto.rejection_feedback}"`}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.large,
    padding: Spacing.two,
    marginBottom: Spacing.one,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  category: {
    fontSize: 14,
    fontWeight: '700',
  },
  monto: {
    fontSize: 15,
    fontWeight: '800',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailText: {
    fontSize: 12,
    maxWidth: 120,
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
