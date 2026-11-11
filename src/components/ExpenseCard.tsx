import { supabase } from '@/services/supabase';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '../constants/theme';
import { Gasto, GastoHelper } from '../services/supabase';
import { formatFriendlyDate } from '@/utils/helpers';
import { Ionicons } from '@expo/vector-icons';

interface ExpenseCardProps {
  gasto: Gasto & { isOffline?: boolean };
  onPress: () => void;
  onDelete?: () => void;
  showEmployeeName?: boolean;
}

function ExpenseCard({
  gasto,
  onPress,
  onDelete,
  showEmployeeName = false,
}: ExpenseCardProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const montoFormatted = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(gasto.monto);

  const fecha = formatFriendlyDate(gasto.fecha_comprobante || gasto.created_at);

  const categoriaNombre = GastoHelper.getCategoria(gasto);
  const subcategoriaNombre = GastoHelper.getSubcategoria(gasto);
  const proveedorNombre = GastoHelper.getProveedor(gasto);
  const clienteNombre = GastoHelper.getCliente(gasto);
  const sucursalNombre = GastoHelper.getSucursal(gasto);

  const isDevueltoFactura = gasto.status === 'PENDING' && Boolean(gasto.devuelto_por_factura);
  const isNuevoConFacturaDetectada = gasto.status === 'PENDING' && !gasto.devuelto_por_factura && Boolean(gasto.factura_sugerida_rel || gasto.factura_sugerida_id);

  // Configuración de estados
  let statusText = 'PENDIENTE';
  let statusColor: string = themeColors.warning;
  let statusIcon: keyof typeof Ionicons.glyphMap = 'time-outline';

  if (gasto.isOffline) {
    statusText = 'OFFLINE';
    statusColor = themeColors.textSecondary;
    statusIcon = 'cloud-offline-outline';
  } else if (isDevueltoFactura) {
    statusText = 'FACTURA DETECTADA (DEVUELTO)';
    statusColor = '#0284C7';
    statusIcon = 'document-attach-outline';
  } else if (isNuevoConFacturaDetectada) {
    statusText = 'COMPROBAR FACTURA';
    statusColor = '#D97706';
    statusIcon = 'search-outline';
  } else if (gasto.status === 'APPROVED') {
    statusText = 'APROBADO';
    statusColor = themeColors.success;
    statusIcon = 'checkmark-circle-outline';
  } else if (gasto.status === 'REJECTED') {
    statusText = 'RECHAZADO';
    statusColor = themeColors.danger;
    statusIcon = 'close-circle-outline';
  } else if (gasto.status === 'ACTION_REQUIRED') {
    statusText = 'ACCIÓN REQ.';
    statusColor = themeColors.actionRequired;
    statusIcon = 'alert-circle-outline';
  }

  const matchProv = gasto.justificacion?.match(/\[Proveedor a agregar:\s*([^\]]+)\]/);
  const provSugerido = matchProv ? matchProv[1].trim() : null;

  const matchSuc = gasto.justificacion?.match(/\[Sucursal a agregar:\s*([^\]]+)\]/);
  const sucSugerida = matchSuc ? matchSuc[1].trim() : null;

  const mainTitle = proveedorNombre || (provSugerido ? `[Pendiente: ${provSugerido}]` : (clienteNombre || 'Sin proveedor'));

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[
        styles.card,
        {
          backgroundColor: themeColors.backgroundElement,
          borderColor: isDevueltoFactura
            ? '#0284C7'
            : isNuevoConFacturaDetectada
            ? '#F59E0B'
            : gasto.status === 'ACTION_REQUIRED'
            ? themeColors.actionRequired
            : themeColors.border,
          borderWidth: (isDevueltoFactura || isNuevoConFacturaDetectada || gasto.status === 'ACTION_REQUIRED') ? 1.5 : 1,
        },
      ]}
    >
      {/* 1. Header: Categoría a la izquierda & Badges de Estado a la derecha */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: themeColors.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons
              name={
                categoriaNombre.toLowerCase().includes('transporte')
                  ? 'car-outline'
                  : categoriaNombre.toLowerCase().includes('aliment')
                  ? 'restaurant-outline'
                  : categoriaNombre.toLowerCase().includes('hosped')
                  ? 'bed-outline'
                  : 'receipt-outline'
              }
              size={15}
              color={themeColors.accent}
            />
          </View>
          <Text style={[styles.category, { color: themeColors.textSecondary }]} numberOfLines={1}>
            {categoriaNombre || 'Sin Categoría'}
            {subcategoriaNombre ? ` • ${subcategoriaNombre}` : ''}
          </Text>
        </View>

        {/* Badges de Estado */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 1 }}>
          {/* Factura Badge */}
          {(gasto.factura_recibida_rel || gasto.factura_recibida_id) ? (
            <View style={[styles.statusBadge, { backgroundColor: themeColors.success + '18' }]}>
              <Ionicons name="shield-checkmark" size={11} color={themeColors.success} />
              <Text style={[styles.statusText, { color: themeColors.success }]}>
                CFDI SAT{gasto.es_factura_compartida ? ' (Comp)' : ''}
              </Text>
            </View>
          ) : gasto.facturado ? (
            <View style={[styles.statusBadge, { backgroundColor: themeColors.success + '18' }]}>
              <Ionicons name="checkmark-circle-outline" size={11} color={themeColors.success} />
              <Text style={[styles.statusText, { color: themeColors.success }]}>Facturado</Text>
            </View>
          ) : (gasto.motivo_sin_factura?.startsWith('PENDIENTE') || gasto.motivo_sin_factura?.toLowerCase().includes('pendiente')) ? (
            <View style={[styles.statusBadge, { backgroundColor: themeColors.warning + '18' }]}>
              <Ionicons name="time-outline" size={11} color={themeColors.warning} />
              <Text style={[styles.statusText, { color: themeColors.warning }]}>Pend. Factura</Text>
            </View>
          ) : (
            <View style={[styles.statusBadge, { backgroundColor: themeColors.danger + '15' }]}>
              <Ionicons name="document-text-outline" size={11} color={themeColors.danger} />
              <Text style={[styles.statusText, { color: themeColors.danger }]}>Sin Factura</Text>
            </View>
          )}

          {Number(gasto.monto_propina || 0) > 0 && (
            <View style={[styles.statusBadge, { backgroundColor: '#f59e0b18' }]}>
              <Ionicons name="restaurant-outline" size={11} color="#d97706" />
              <Text style={[styles.statusText, { color: '#d97706' }]}>
                Propina ${Number(gasto.monto_propina).toFixed(2)}
              </Text>
            </View>
          )}

          {gasto.motivo_sin_factura?.startsWith('COMISION_PLATAFORMA') && (
            <View style={[styles.statusBadge, { backgroundColor: '#8b5cf618' }]}>
              <Ionicons name="globe-outline" size={11} color="#7c3aed" />
              <Text style={[styles.statusText, { color: '#7c3aed' }]}>Comisión</Text>
            </View>
          )}

          {gasto.motivo_sin_factura?.startsWith('DIFERENCIA_AUTORIZADA') && (
            <View style={[styles.statusBadge, { backgroundColor: '#64748b18' }]}>
              <Ionicons name="shield-outline" size={11} color="#475569" />
              <Text style={[styles.statusText, { color: '#475569' }]}>Dif. Autorizada</Text>
            </View>
          )}

          <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
            <Ionicons name={statusIcon} size={11} color={statusColor} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
          </View>

          {onDelete && (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              style={{
                padding: 4,
                backgroundColor: themeColors.danger + '15',
                borderRadius: BorderRadius.small,
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={13} color={themeColors.danger} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      
      {/* 2. Proveedor / Título Principal (Fila dedicada de ancho completo para evitar empalmes) */}
      <View style={{ marginBottom: 6 }}>
        <Text style={[styles.mainTitle, { color: themeColors.text }]}>
          {mainTitle}
        </Text>

        {/* Cliente vinculado si existe y no es el título principal */}
        {clienteNombre && proveedorNombre ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <Ionicons name="business-outline" size={13} color={themeColors.primary} />
            <Text style={{ color: themeColors.primary, fontSize: 12, fontWeight: '600' }}>
              Cliente: {clienteNombre}
            </Text>
          </View>
        ) : null}

        {/* Sucursal vinculada si existe */}
        {(sucursalNombre || sucSugerida) ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <Ionicons name="location-outline" size={13} color={themeColors.textSecondary} />
            <Text style={{ color: themeColors.textSecondary, fontSize: 12, fontWeight: '500' }}>
              Sucursal: {sucursalNombre || `[Pendiente: ${sucSugerida}]`}
            </Text>
          </View>
        ) : null}
      </View>

      {/* 3. Empleado (si se requiere mostrar) */}
      {showEmployeeName && gasto.empleado_nombre ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
          <Ionicons name="person-outline" size={12} color={themeColors.textSecondary} />
          <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>
            Empleado: <Text style={{ color: themeColors.text, fontWeight: '600' }}>{gasto.empleado_nombre}</Text>
          </Text>
        </View>
      ) : null}

      {/* 4. Footer: Fecha & Monto */}
      <View style={[styles.footer, { borderTopColor: themeColors.border + '30' }]}>
        <View style={styles.detailRow}>
          <Ionicons name="calendar-outline" size={13} color={themeColors.textSecondary} />
          <Text style={[styles.dateText, { color: themeColors.textSecondary }]}>{fecha}</Text>
        </View>
        <Text style={[styles.monto, { color: themeColors.text }]}>{montoFormatted}</Text>
      </View>

      {/* 5. Banner de Factura Recibida Detectada (Devuelto de Historial vs Gasto Nuevo) */}
      {isDevueltoFactura && gasto.factura_sugerida_rel ? (
        <View style={[styles.feedbackContainer, { backgroundColor: '#0284C715', borderLeftColor: '#0284C7' }]}>
          <Text style={[styles.feedbackTitle, { color: '#0284C7' }]}>
            📄 Factura Recibida Detectada (Devuelto de Historial)
          </Text>
          <Text style={{ fontSize: 12, color: themeColors.text, fontWeight: '600' }} numberOfLines={2}>
            Coincide con CFDI de {gasto.factura_sugerida_rel.nombre_emisor || gasto.factura_sugerida_rel.rfc_emisor || 'Proveedor'} por {montoFormatted}. Toca para ver PDF y volver a enviar.
          </Text>
        </View>
      ) : isNuevoConFacturaDetectada && gasto.factura_sugerida_rel ? (
        <View style={[styles.feedbackContainer, { backgroundColor: '#F59E0B18', borderLeftColor: '#D97706' }]}>
          <Text style={[styles.feedbackTitle, { color: '#D97706' }]}>
            ⚠️ Favor de comprobar que la factura recibida coincide con el gasto
          </Text>
          <Text style={{ fontSize: 12, color: themeColors.text }} numberOfLines={2}>
            Se detectó una factura recibida por {montoFormatted} ({gasto.factura_sugerida_rel.nombre_emisor || gasto.factura_sugerida_rel.rfc_emisor || 'SAT'}).
          </Text>
        </View>
      ) : null}

      {/* 6. Feedback Box */}
      {gasto.rejection_feedback ? (
        <View style={[styles.feedbackContainer, { backgroundColor: statusColor + '10', borderLeftColor: statusColor }]}>
          <Text style={[styles.feedbackTitle, { color: statusColor }]}>
            {gasto.status === 'APPROVED' ? 'Revisión:' : gasto.status === 'REJECTED' ? 'Motivo de rechazo:' : 'Nota de revisión:'}
          </Text>
          <Text style={[styles.feedbackText, { color: themeColors.text }]} numberOfLines={3}>
            {gasto.rejection_feedback.startsWith('[') ? gasto.rejection_feedback : `"${gasto.rejection_feedback}"`}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const ExpenseCardMemo = React.memo(ExpenseCard, (prevProps, nextProps) => {
  return (
    prevProps.gasto.id === nextProps.gasto.id &&
    prevProps.gasto.status === nextProps.gasto.status &&
    prevProps.gasto.facturado === nextProps.gasto.facturado &&
    prevProps.gasto.motivo_sin_factura === nextProps.gasto.motivo_sin_factura &&
    prevProps.gasto.proveedor_id === nextProps.gasto.proveedor_id &&
    prevProps.gasto.devuelto_por_factura === nextProps.gasto.devuelto_por_factura &&
    prevProps.gasto.factura_sugerida_id === nextProps.gasto.factura_sugerida_id &&
    prevProps.gasto.factura_recibida_id === nextProps.gasto.factura_recibida_id &&
    prevProps.gasto.monto_propina === nextProps.gasto.monto_propina &&
    prevProps.gasto.es_factura_compartida === nextProps.gasto.es_factura_compartida &&
    prevProps.showEmployeeName === nextProps.showEmployeeName
  );
});

export default ExpenseCardMemo;

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.large,
    padding: Spacing.three,
    marginBottom: Spacing.two,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  category: {
    fontSize: 12,
    fontWeight: '700',
  },
  mainTitle: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  monto: {
    fontSize: 16,
    fontWeight: '800',
  },
  dateText: {
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: BorderRadius.small,
    gap: 3,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '800',
  },
  feedbackContainer: {
    marginTop: Spacing.two,
    padding: Spacing.two,
    borderRadius: BorderRadius.small,
    borderLeftWidth: 3,
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
