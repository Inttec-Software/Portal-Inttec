import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing } from '@/constants/theme';
import { adminInventarioStyles as styles } from './adminInventarioStyles';
import { useAdminInventario } from '../hooks/useAdminInventario';
import { AdminCatalogoTab } from './AdminCatalogoTab';
import { AdminCategoriasTab } from './AdminCategoriasTab';
import { AdminRetribucionesTab } from './AdminRetribucionesTab';
import { AdminMovimientosTab } from './AdminMovimientosTab';
import { AdminEmpleadosStockTab } from './AdminEmpleadosStockTab';
import { AdminPersonalTab } from './AdminPersonalTab';
import { AdminInventarioModals } from './AdminInventarioModals';

export default function AdminInventarioView() {
  const inv = useAdminInventario();
  const {
    themeColors,
    activeTab,
    setActiveTab,
    loadMovimientos,
    loadEmpleadosStock,
    empleadosStockData,
    loadMiInventario,
    miInventario,
  } = inv;

  const renderScreenHeader = () => (
    <View>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Control de Inventario</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: Spacing.four,
          gap: 8,
          paddingBottom: Spacing.two,
        }}
      >
        <TouchableOpacity
          onPress={() => setActiveTab('importacion')}
          style={[
            styles.selectorBtn,
            activeTab === 'importacion'
              ? { backgroundColor: themeColors.accent, borderColor: themeColors.accent }
              : { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }
          ]}
        >
          <Ionicons name="cube-outline" size={15} color={activeTab === 'importacion' ? '#ffffff' : themeColors.textSecondary} />
          <Text style={[styles.selectorText, { color: activeTab === 'importacion' ? '#ffffff' : themeColors.textSecondary }]}>
            Importación y Catálogo
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('categorias')}
          style={[
            styles.selectorBtn,
            activeTab === 'categorias'
              ? { backgroundColor: themeColors.accent, borderColor: themeColors.accent }
              : { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }
          ]}
        >
          <Ionicons name="pricetags-outline" size={15} color={activeTab === 'categorias' ? '#ffffff' : themeColors.textSecondary} />
          <Text style={[styles.selectorText, { color: activeTab === 'categorias' ? '#ffffff' : themeColors.textSecondary }]}>
            Categorías
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('retribuciones')}
          style={[
            styles.selectorBtn,
            activeTab === 'retribuciones'
              ? { backgroundColor: themeColors.accent, borderColor: themeColors.accent }
              : { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }
          ]}
        >
          <Ionicons name="repeat-outline" size={15} color={activeTab === 'retribuciones' ? '#ffffff' : themeColors.textSecondary} />
          <Text style={[styles.selectorText, { color: activeTab === 'retribuciones' ? '#ffffff' : themeColors.textSecondary }]}>
            Retribuciones
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { setActiveTab('movimientos'); loadMovimientos(); }}
          style={[
            styles.selectorBtn,
            activeTab === 'movimientos'
              ? { backgroundColor: themeColors.accent, borderColor: themeColors.accent }
              : { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }
          ]}
        >
          <Ionicons name="swap-vertical-outline" size={15} color={activeTab === 'movimientos' ? '#ffffff' : themeColors.textSecondary} />
          <Text style={[styles.selectorText, { color: activeTab === 'movimientos' ? '#ffffff' : themeColors.textSecondary }]}>
            Movimientos
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { setActiveTab('empleados_stock'); loadEmpleadosStock(); }}
          style={[
            styles.selectorBtn,
            activeTab === 'empleados_stock'
              ? { backgroundColor: themeColors.accent, borderColor: themeColors.accent }
              : { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }
          ]}
        >
          <Ionicons name="people-outline" size={15} color={activeTab === 'empleados_stock' ? '#ffffff' : themeColors.textSecondary} />
          <Text style={[styles.selectorText, { color: activeTab === 'empleados_stock' ? '#ffffff' : themeColors.textSecondary }]}>
            Material en Empleados
          </Text>
          {empleadosStockData.resumen.total_empleados > 0 && (
            <View style={{ backgroundColor: activeTab === 'empleados_stock' ? '#ffffff30' : themeColors.accent + '25', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: activeTab === 'empleados_stock' ? '#ffffff' : themeColors.accent }}>
                {empleadosStockData.resumen.total_empleados}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { setActiveTab('inventario_personal'); loadMiInventario(); }}
          style={[
            styles.selectorBtn,
            activeTab === 'inventario_personal'
              ? { backgroundColor: themeColors.accent, borderColor: themeColors.accent }
              : { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }
          ]}
        >
          <Ionicons name="person-circle-outline" size={16} color={activeTab === 'inventario_personal' ? '#ffffff' : themeColors.textSecondary} />
          <Text style={[styles.selectorText, { color: activeTab === 'inventario_personal' ? '#ffffff' : themeColors.textSecondary }]}>
            Inventario Personal
          </Text>
          {miInventario.length > 0 && (
            <View style={{ backgroundColor: activeTab === 'inventario_personal' ? '#ffffff30' : themeColors.accent + '25', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: activeTab === 'inventario_personal' ? '#ffffff' : themeColors.accent }}>
                {miInventario.reduce((acc: number, it: any) => acc + (Number(it.cantidad_disponible) || 0), 0)}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={{ flex: 1 }}>
        {renderScreenHeader()}

        {activeTab === 'importacion' && <AdminCatalogoTab inv={inv} />}
        {activeTab === 'categorias' && <AdminCategoriasTab inv={inv} />}
        {activeTab === 'retribuciones' && <AdminRetribucionesTab inv={inv} />}
        {activeTab === 'movimientos' && <AdminMovimientosTab inv={inv} />}
        {activeTab === 'empleados_stock' && <AdminEmpleadosStockTab inv={inv} />}
        {activeTab === 'inventario_personal' && <AdminPersonalTab inv={inv} />}

        <AdminInventarioModals inv={inv} />
      </View>
    </View>
  );
}
