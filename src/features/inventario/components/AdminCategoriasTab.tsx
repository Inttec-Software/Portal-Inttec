import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Spacing } from '@/constants/theme';
import { adminInventarioStyles as styles } from './adminInventarioStyles';
import { AdminInventarioHook } from '../hooks/useAdminInventario';

export function AdminCategoriasTab({ inv }: { inv: AdminInventarioHook }) {
  const { themeColors, categorias, productos, setNewCatModalVisible } = inv;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: 80 }]} keyboardShouldPersistTaps="handled">
        <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Categorías de Productos</Text>
        <Text style={[styles.description, { color: themeColors.textSecondary }]}>
          Visualiza el catálogo de categorías de productos y el volumen total de artículos asociados a cada una.
        </Text>

        {/* Listado de Categorías */}
        <Text style={[styles.subTitle, { color: themeColors.text, marginTop: Spacing.one }]}>
          Categorías y Volúmenes de Productos:
        </Text>
        {categorias.map(cat => {
          const count = productos.filter(p => p.categoria_id === cat.id && p.activo).length;
          return (
            <View
              key={cat.id}
              style={[styles.categoryInfoRow, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
            >
              <Text style={[styles.categoryName, { color: themeColors.text }]}>{cat.nombre}</Text>
              <View style={[styles.countBadge, { backgroundColor: themeColors.accent + '20' }]}>
                <Text style={{ color: themeColors.accent, fontSize: 12, fontWeight: '800' }}>
                  {count} {count === 1 ? 'producto' : 'productos'}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Botones de Acción Rápida Flotantes */}
      <View style={styles.floatingActionRow}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setNewCatModalVisible(true)}
          style={[styles.floatingActionBtn, { backgroundColor: themeColors.accent }]}
        >
          <Text style={styles.floatingActionBtnText}>➕ Categoría</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
