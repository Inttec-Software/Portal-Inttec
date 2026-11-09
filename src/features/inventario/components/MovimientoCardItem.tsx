import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MovimientoItemProps } from '../types';

export const MovimientoCardItem = React.memo(({
  m,
  themeColors,
  exportingSingleMovimientoId,
  onExportSingleVale,
  onDeleteMovimiento,
}: MovimientoItemProps) => {
  const isGasto = m.tipo === 'GASTO' || m.subtipo === 'GASTO' || m.subtipo === 'CONSUMO';
  const isRetiro = m.tipo === 'RETIRO' || m.subtipo === 'RETIRO';
  const isDevolucion = m.tipo === 'DEVOLUCIÓN' || m.subtipo === 'DEVOLUCIÓN';
  const isCompra = m.tipo === 'COMPRA/FACTURA' || m.subtipo === 'COMPRA/FACTURA';
  const isEntrada = m.tipo === 'ENTRADA' || (isDevolucion && !isGasto && !isRetiro);

  const folioStr = m.id ? m.id.substring(0, 8).toUpperCase() : 'MOV';
  const dateStr = (m.fecha || m.created_at) ? new Date(m.fecha || m.created_at).toLocaleString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }) : 'N/A';

  const isSingleExporting = exportingSingleMovimientoId === m.id;
  const tieneFirma = m.tiene_firma || Boolean(m.firma_base64);

  return (
    <View
      style={{
        backgroundColor: themeColors.backgroundElement,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderColor: isGasto ? '#8B5CF660' : isDevolucion ? '#2563EB50' : isCompra ? '#15803D50' : isEntrada ? '#10B98140' : '#EF444440',
        borderWidth: 1,
        borderLeftWidth: 4,
        borderLeftColor: isGasto ? '#8B5CF6' : isDevolucion ? '#2563EB' : isCompra ? '#15803D' : isEntrada ? '#10B981' : '#EF4444',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1
      }}
    >
      {/* Fila Superior: Folio + Fecha + Tipo Badge */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ backgroundColor: themeColors.primary + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: themeColors.primary }}>#{folioStr}</Text>
          </View>
          <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>{dateStr}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          {isGasto ? (
            <View style={{ backgroundColor: '#F3E8FF', borderColor: '#8B5CF6', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#8B5CF6' }}>Gasto</Text>
            </View>
          ) : isDevolucion ? (
            <View style={{ backgroundColor: '#DBEAFE', borderColor: '#2563EB', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#2563EB' }}>DEVOLUCIÓN</Text>
            </View>
          ) : isCompra ? (
            <View style={{ backgroundColor: '#DCFCE7', borderColor: '#15803D', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#15803D' }}>COMPRA</Text>
            </View>
          ) : isEntrada ? (
            <View style={{ backgroundColor: '#10B98120', borderColor: '#10B981', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#059669' }}>ENTRADA</Text>
            </View>
          ) : (
            <View style={{ backgroundColor: '#EF444420', borderColor: '#EF4444', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#DC2626' }}>SALIDA</Text>
            </View>
          )}
          {Boolean(m.tipo_gasto) ? (
            <View style={{ backgroundColor: isGasto ? '#8B5CF618' : themeColors.primary + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
              <Text style={{ fontSize: 10, fontWeight: '600', color: isGasto ? '#8B5CF6' : themeColors.primary }}>{m.tipo_gasto}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Fila del Producto o Desglose Multi-material */}
      {Array.isArray(m.materiales) && m.materiales.length > 1 ? (
        <View style={{ backgroundColor: themeColors.background, borderRadius: 8, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: themeColors.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text }}>
              {isDevolucion ? 'Materiales Devueltos' : isGasto ? 'Materiales Utilizados en Gasto' : 'Partidas Retiradas'} ({m.materiales.length}):
            </Text>
            <View style={{ backgroundColor: isGasto ? '#8B5CF618' : isEntrada ? '#10B98120' : '#EF444420', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: isGasto ? '#8B5CF6' : isEntrada ? '#059669' : '#DC2626' }}>
                Total: {isEntrada ? '+' : '-'}{m.cantidad} {m.producto_unidad || 'un.'}
              </Text>
            </View>
          </View>
          {m.materiales.map((mat: any, mIdx: number) => {
            const condTags = [];
            if (mat.devolver_nuevo > 0) condTags.push(`Nuevas: ${mat.devolver_nuevo}`);
            if (mat.devolver_usado > 0) condTags.push(`Usadas: ${mat.devolver_usado}`);
            if (mat.devolver_por_revisar > 0) condTags.push(`Dañadas: ${mat.devolver_por_revisar}`);
            const condStr = condTags.length > 0 ? ` (${condTags.join(', ')})` : '';

            return (
              <View key={mIdx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, borderBottomWidth: mIdx === m.materiales.length - 1 ? 0 : 1, borderBottomColor: themeColors.border }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.text }} numberOfLines={1}>
                    {mat.nombre || 'Material'}{condStr}
                  </Text>
                  <Text style={{ fontSize: 10, color: themeColors.textSecondary }}>SKU: {mat.sku || '-'}</Text>
                </View>
                <View style={{ backgroundColor: isGasto ? '#8B5CF618' : isEntrada ? '#10B98120' : '#EF444420', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: isGasto ? '#8B5CF6' : isEntrada ? '#059669' : '#DC2626' }}>
                    {isEntrada ? '+' : '-'}{mat.cantidad} {mat.unidad || 'pza'}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, backgroundColor: themeColors.background, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: themeColors.border }}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.text }}>{m.producto_nombre || 'Producto'}</Text>
            <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 1 }}>SKU: {m.producto_sku || '-'}</Text>
          </View>
          <View style={{ backgroundColor: isGasto ? '#8B5CF618' : isEntrada ? '#10B98120' : '#EF444420', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: isGasto ? '#8B5CF6' : isEntrada ? '#059669' : '#DC2626' }}>
              {isEntrada ? '+' : '-'}{m.cantidad} {m.producto_unidad || 'pza'}
            </Text>
          </View>
        </View>
      )}

      {/* Detalles: Responsable, Cliente, Concepto */}
      <View style={{ marginBottom: 10, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="person-circle-outline" size={16} color={(m.subtipo === 'GASTO' || m.subtipo === 'CONSUMO') ? '#8B5CF6' : themeColors.primary} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: themeColors.text }}>
            Responsable: <Text style={{ fontWeight: '400' }}>{m.usuario_nombre || m.empleado_nombre || 'Almacén'}</Text>
          </Text>
        </View>

        {m.cliente_nombre ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="location-outline" size={16} color={themeColors.textSecondary} />
            <Text style={{ fontSize: 12, color: themeColors.text }}>
              Cliente: <Text style={{ fontWeight: '600' }}>{m.cliente_nombre}</Text>
            </Text>
          </View>
        ) : null}

        {(m.detalle_motivo || m.folio_factura) ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="chatbubble-outline" size={16} color={themeColors.textSecondary} />
            <Text style={{ fontSize: 12, color: themeColors.text }}>
              Detalle: <Text style={{ fontStyle: 'italic', color: themeColors.textSecondary }}>{m.detalle_motivo || m.folio_factura}</Text>
            </Text>
          </View>
        ) : null}

        {m.proveedor_nombre ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="business-outline" size={16} color={themeColors.textSecondary} />
            <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>Proveedor: {m.proveedor_nombre}</Text>
          </View>
        ) : null}
      </View>

      {/* Botón de Vale Individual */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTopWidth: 1, borderTopColor: themeColors.border }}>
        {tieneFirma ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#10B98115', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#10B98130' }}>
            <Ionicons name="checkmark-circle" size={14} color="#10B981" />
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#10B981' }}>Responsiva Firmada</Text>
          </View>
        ) : <View />}

        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity
            onPress={() => onDeleteMovimiento(m)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#FEF2F2',
              borderColor: '#FECACA',
              borderWidth: 1,
              width: 34,
              height: 34,
              borderRadius: 6
            }}
          >
            <Ionicons name="trash-outline" size={18} color="#DC2626" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onExportSingleVale(m)}
            disabled={isSingleExporting}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: themeColors.background,
              borderColor: themeColors.border,
              borderWidth: 1,
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 6
            }}
          >
            {isSingleExporting ? (
              <ActivityIndicator size="small" color={themeColors.primary} />
            ) : (
              <Ionicons name="download-outline" size={15} color={themeColors.primary} />
            )}
            <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.primary }}>Descargar Vale (PDF)</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});
