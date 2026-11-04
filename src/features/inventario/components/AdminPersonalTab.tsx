import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CustomInput from '@/components/CustomInput';
import { AdminInventarioHook } from '../hooks/useAdminInventario';

export function AdminPersonalTab({ inv }: { inv: AdminInventarioHook }) {
  const {
    themeColors,
    currentUser,
    handleOpenAsignarModal,
    loadMiInventario,
    isLoadingMiInventario,
    miInventario,
    miInventarioSearch,
    setMiInventarioSearch,
    filteredMiInventario,
    handleOpenGastoModal,
    handleOpenDevolverModal,
  } = inv;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header del Módulo Personal */}
      <View style={{ backgroundColor: themeColors.backgroundElement, borderRadius: 12, padding: 16, marginBottom: 16, borderColor: themeColors.border, borderWidth: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 220 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <View style={{ backgroundColor: '#2563EB20', padding: 6, borderRadius: 8 }}>
                <Ionicons name="person-circle" size={22} color="#2563EB" />
              </View>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: themeColors.text }}>
                Inventario Personal
              </Text>
              {currentUser?.rol && (
                <View style={{ backgroundColor: '#2563EB15', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#2563EB' }}>{currentUser.rol}</Text>
                </View>
              )}
            </View>
            <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>
              Materiales, insumos y herramientas actualmente bajo tu custodia directa ({currentUser?.nombre || 'Administrador'}).
            </Text>
          </View>

          {/* Botonera de Acciones */}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <TouchableOpacity
              onPress={() => handleOpenAsignarModal(currentUser?.id)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: '#2563EB',
                paddingHorizontal: 12,
                paddingVertical: 9,
                borderRadius: 8
              }}
            >
              <Ionicons name="download-outline" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Retirar de Almacén</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => loadMiInventario(currentUser?.id)}
              disabled={isLoadingMiInventario}
              style={{
                backgroundColor: themeColors.background,
                borderColor: themeColors.border,
                borderWidth: 1,
                paddingHorizontal: 10,
                paddingVertical: 9,
                borderRadius: 8,
                justifyContent: 'center',
                alignItems: 'center'
              }}
            >
              <Ionicons name="refresh-outline" size={16} color={themeColors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Resumen Compacto */}
        {miInventario.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: themeColors.border, flexWrap: 'wrap' }}>
            <View style={{ backgroundColor: themeColors.background, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: themeColors.border }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: themeColors.textSecondary, textTransform: 'uppercase' }}>Artículos Totales</Text>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#10B981', marginTop: 2 }}>
                {miInventario.reduce((acc, it) => acc + (Number(it.cantidad_disponible) || 0), 0)} pzas
              </Text>
            </View>

            <View style={{ backgroundColor: themeColors.background, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: themeColors.border }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: themeColors.textSecondary, textTransform: 'uppercase' }}>Partidas Únicas</Text>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#2563EB', marginTop: 2 }}>
                {miInventario.length} {miInventario.length === 1 ? 'producto' : 'productos'}
              </Text>
            </View>

            <View style={{ backgroundColor: themeColors.background, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: themeColors.border }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: themeColors.textSecondary, textTransform: 'uppercase' }}>Valor Estimado</Text>
              <Text style={{ fontSize: 16, fontWeight: '800', color: themeColors.text, marginTop: 2 }}>
                ${miInventario.reduce((acc, it) => acc + (Number(it.cantidad_disponible) || 0) * (Number(it.producto?.precio_unitario) || 0), 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Buscador */}
      <View style={{ marginBottom: 16 }}>
        <CustomInput
          placeholder="Buscar material en tu inventario personal por nombre, SKU..."
          value={miInventarioSearch}
          onChangeText={setMiInventarioSearch}
          iconName="search-outline"
        />
      </View>

      {/* Listado */}
      {isLoadingMiInventario ? (
        <View style={{ padding: 40, alignItems: 'center' }}>
          <ActivityIndicator size="large" color={themeColors.primary} />
          <Text style={{ marginTop: 10, color: themeColors.textSecondary, fontSize: 13 }}>Cargando tu inventario personal...</Text>
        </View>
      ) : filteredMiInventario.length === 0 ? (
        <View style={{ padding: 40, backgroundColor: themeColors.backgroundElement, borderRadius: 12, alignItems: 'center', borderColor: themeColors.border, borderWidth: 1 }}>
          <Ionicons name="briefcase-outline" size={44} color={themeColors.textSecondary} />
          <Text style={{ color: themeColors.text, fontWeight: 'bold', fontSize: 16, marginTop: 12 }}>
            {miInventarioSearch ? 'Sin coincidencias' : 'No Tienes Material en Custodia'}
          </Text>
          <Text style={{ color: themeColors.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 4, maxWidth: 380 }}>
            {miInventarioSearch
              ? 'No se encontraron insumos con ese nombre o SKU en tu inventario.'
              : 'Actualmente no tienes insumos asignados a tu cuenta. Puedes autoasignarte insumos desde el almacén central con el botón "Retirar de Almacén".'}
          </Text>
          {!miInventarioSearch && (
            <TouchableOpacity
              onPress={() => handleOpenAsignarModal(currentUser?.id)}
              style={{
                marginTop: 16,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: '#2563EB',
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 8
              }}
            >
              <Ionicons name="download-outline" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Retirar de Almacén Ahora</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {filteredMiInventario.map((item: any) => {
            const prod = item.producto || {};
            const qNuevo = Number(item.cantidad_nuevo) || 0;
            const qUsado = Number(item.cantidad_usado) || 0;
            const qPorRev = Number(item.cantidad_por_revisar) || 0;
            const totalDisp = Number(item.cantidad_disponible) || 0;
            const unit = prod.unidad || 'pza';
            const estVal = totalDisp * (Number(prod.precio_unitario) || 0);

            return (
              <View
                key={item.id}
                style={{
                  backgroundColor: themeColors.backgroundElement,
                  borderRadius: 12,
                  borderColor: themeColors.border,
                  borderWidth: 1,
                  padding: 14,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.04,
                  shadowRadius: 2,
                  elevation: 1,
                  gap: 10
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 200 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: themeColors.text }}>
                      {prod.nombre_oficial || 'Producto'}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
                      <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                        SKU: <Text style={{ fontWeight: '600' }}>{prod.sku_interno || '-'}</Text>
                      </Text>
                      {prod.categoria && (
                        <>
                          <View style={{ backgroundColor: themeColors.border, width: 4, height: 4, borderRadius: 2 }} />
                          <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>{prod.categoria}</Text>
                        </>
                      )}
                    </View>
                  </View>

                  {/* Total Disponible Badge */}
                  <View style={{ backgroundColor: '#10B98120', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#059669' }}>
                      {totalDisp} {unit}
                    </Text>
                  </View>
                </View>

                {/* Desglose de condición y valor estimado */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, paddingTop: 2 }}>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    {qNuevo > 0 && (
                      <View style={{ backgroundColor: '#10B98118', borderColor: '#10B981', borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 11, color: '#10B981', fontWeight: '700' }}>🟢 Nuevas: {qNuevo}</Text>
                      </View>
                    )}
                    {qUsado > 0 && (
                      <View style={{ backgroundColor: '#D9770618', borderColor: '#D97706', borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 11, color: '#D97706', fontWeight: '700' }}>🟡 Usadas: {qUsado}</Text>
                      </View>
                    )}
                    {qPorRev > 0 && (
                      <View style={{ backgroundColor: '#DC262618', borderColor: '#DC2626', borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '700' }}>🔴 Dañadas: {qPorRev}</Text>
                      </View>
                    )}
                  </View>

                  {estVal > 0 && (
                    <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                      Valor est: ${estVal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                    </Text>
                  )}
                </View>

                {/* Barra de Acciones del Material */}
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: themeColors.border, paddingTop: 10, marginTop: 4 }}>
                  <TouchableOpacity
                    onPress={() => handleOpenGastoModal(item)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      backgroundColor: '#F59E0B15',
                      borderColor: '#F59E0B',
                      borderWidth: 1,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 6
                    }}
                  >
                    <Ionicons name="document-text-outline" size={15} color="#D97706" />
                    <Text style={{ color: '#D97706', fontSize: 12, fontWeight: '700' }}>Reportar Gasto</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleOpenDevolverModal(item)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      backgroundColor: '#2563EB15',
                      borderColor: '#2563EB',
                      borderWidth: 1,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 6
                    }}
                  >
                    <Ionicons name="arrow-undo-outline" size={15} color="#2563EB" />
                    <Text style={{ color: '#2563EB', fontSize: 12, fontWeight: '700' }}>Devolver a Almacén</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}
