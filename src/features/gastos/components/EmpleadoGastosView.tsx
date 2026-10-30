import React from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { GastoHelper } from '@/services/supabase';
import ExpenseCard from '@/components/ExpenseCard';
import { GastosCardsListSkeleton } from '@/components/skeleton';
import { Ionicons } from '@expo/vector-icons';
import ImageViewerModal from '@/components/ImageViewerModal';
import PendingTasksPopover from '@/components/PendingTasksPopover';
import { styles } from './empleadoGastosStyles';
import { useEmpleadoGastos } from '../hooks/useEmpleadoGastos';
import EmpleadoGastoDetailModal from './EmpleadoGastoDetailModal';
import EmpleadoVehiculosModal from './EmpleadoVehiculosModal';
import EmpleadoProfileModal from './EmpleadoProfileModal';

export default function EmpleadoGastosView() {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const emp = useEmpleadoGastos();
  const {
    router,
    user,
    company,
    env,
    changeEnv,
    offlineGastos,
    isLoading,
    activeTab,
    setActiveTab,
    isSyncing,
    showTasksPopover,
    setShowTasksPopover,
    pendingTasksCount,
    hasNewTasks,
    handleOpenTasksPopover,
    selectedGasto,
    setSelectedGasto,
    setModalVisible,
    viewerVisible,
    setViewerVisible,
    viewerInitialIndex,
    activePreviewUrl,
    setActivePreviewUrl,
    handleOpenProfile,
    refreshData,
    handleSyncManual,
    handleToggleCompany,
    pendingList,
    historyList,
    saldoPendiente,
    totalAprobado,
    formatCurrency,
  } = emp;

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Header Card Premium */}
      <View style={[
        styles.headerCard,
        {
          backgroundColor: themeColors.backgroundElement,
          borderColor: themeColors.border,
          shadowColor: themeColors.text
        }
      ]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, gap: 10 }}>
          <TouchableOpacity
            onPress={handleOpenProfile}
            style={[styles.headerAvatar, { backgroundColor: themeColors.primary + '15' }]}
            activeOpacity={0.7}
          >
            <Text style={[styles.headerAvatarText, { color: themeColors.primary }]}>
              {user?.nombre ? user.nombre.charAt(0).toUpperCase() : 'E'}
            </Text>
          </TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>¡Hola de nuevo!</Text>
            <Text
              style={[styles.headerTitle, { color: themeColors.text }]}
              numberOfLines={1}
              adjustsFontSizeToFit={true}
              minimumFontScale={0.8}
            >
              {user?.nombre || 'Empleado'}
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          {/* Checador Shortcut */}
          <TouchableOpacity
            onPress={() => router.push('/(empleado)/asistencia')}
            style={[
              styles.headerIconBtn,
              { backgroundColor: scheme === 'dark' ? 'rgba(29, 209, 161, 0.15)' : 'rgba(29, 209, 161, 0.1)' }
            ]}
          >
            <Ionicons name="finger-print" size={18} color={themeColors.success || '#1dd1a1'} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleOpenTasksPopover}
            style={[styles.headerIconBtn, { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,119,182,0.1)', position: 'relative' }]}
          >
            <Ionicons name="notifications-outline" size={18} color={themeColors.text} />
            {pendingTasksCount > 0 && (
              <View style={{
                position: 'absolute',
                top: 2,
                right: 3,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: hasNewTasks ? themeColors.danger : themeColors.warning,
                borderWidth: 1,
                borderColor: scheme === 'dark' ? '#0f172a' : '#f8fafc'
              }} />
            )}
          </TouchableOpacity>

          {user?.rol === 'DEV' && (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity
                onPress={() => changeEnv(env === 'cloud' ? 'test' : 'cloud')}
                style={[styles.headerIconBtn, { backgroundColor: env === 'cloud' ? themeColors.primary + '15' : Colors.light.danger + '15' }]}
              >
                <Ionicons name={env === 'cloud' ? 'cloud-outline' : 'server-outline'} size={17} color={env === 'cloud' ? themeColors.primary : Colors.light.danger} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.replace('/(admin)/dashboard')}
                style={[styles.headerIconBtn, { backgroundColor: themeColors.primary + '15' }]}
              >
                <Ionicons name="swap-horizontal-outline" size={17} color={themeColors.primary} />
              </TouchableOpacity>
            </View>
          )}

          {offlineGastos.length > 0 && (
            <TouchableOpacity
              onPress={handleSyncManual}
              disabled={isSyncing}
              style={[styles.headerIconBtn, { backgroundColor: themeColors.warning + '15' }]}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color={themeColors.warning} />
              ) : (
                <Ionicons name="cloud-upload" size={17} color={themeColors.warning} />
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Switch de Empresa - Fila Dedicada */}
      <View style={{
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: Spacing.four,
        marginBottom: Spacing.two,
      }}>
        <View style={{
          flexDirection: 'row',
          backgroundColor: scheme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
          borderRadius: 20,
          padding: 2,
          alignItems: 'center',
          width: 220,
        }}>
          <TouchableOpacity
            onPress={() => company !== 'inttec' && handleToggleCompany('inttec')}
            style={{
              flex: 1,
              paddingVertical: 6,
              borderRadius: 18,
              backgroundColor: company === 'inttec' ? themeColors.accent : 'transparent',
              alignItems: 'center'
            }}
          >
            <Text style={{
              fontSize: 11,
              fontWeight: '700',
              color: company === 'inttec' ? '#ffffff' : themeColors.textSecondary,
            }}>
              INTTEC
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => company !== 'daravisa' && handleToggleCompany('daravisa')}
            style={{
              flex: 1,
              paddingVertical: 6,
              borderRadius: 18,
              backgroundColor: company === 'daravisa' ? themeColors.accent : 'transparent',
              alignItems: 'center'
            }}
          >
            <Text style={{
              fontSize: 11,
              fontWeight: '700',
              color: company === 'daravisa' ? '#ffffff' : themeColors.textSecondary,
            }}>
              DARAVISA
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <PendingTasksPopover
        visible={showTasksPopover}
        onClose={() => setShowTasksPopover(false)}
      />

      {/* Resumen Cards */}
      <View style={styles.summaryContainer}>
        <View style={[styles.summaryCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: themeColors.warning + '18', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="time" size={14} color={themeColors.warning} />
            </View>
            <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]} numberOfLines={1}>
              PENDIENTE / OFFLINE
            </Text>
          </View>
          <Text
            style={[styles.summaryValue, { color: themeColors.text }]}
            numberOfLines={1}
            adjustsFontSizeToFit={true}
            minimumFontScale={0.75}
          >
            {formatCurrency(saldoPendiente)}
          </Text>
        </View>

        <View style={[styles.summaryCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: themeColors.success + '18', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="checkmark-circle" size={14} color={themeColors.success} />
            </View>
            <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]} numberOfLines={1}>
              TOTAL APROBADO
            </Text>
          </View>
          <Text
            style={[styles.summaryValue, { color: themeColors.success }]}
            numberOfLines={1}
            adjustsFontSizeToFit={true}
            minimumFontScale={0.75}
          >
            {formatCurrency(totalAprobado)}
          </Text>
        </View>
      </View>

      {/* Banner / Acceso Rápido a Checklist de Herramientas */}
      <View style={{ paddingHorizontal: Spacing.three, marginBottom: Spacing.two }}>
        <TouchableOpacity
          onPress={() => router.push('/(empleado)/herramientas' as any)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: scheme === 'dark' ? '#00cec920' : '#e6fffa',
            borderColor: '#00cec9',
            borderWidth: 1,
            borderRadius: BorderRadius.medium,
            padding: Spacing.two,
            gap: 10,
          }}
          activeOpacity={0.7}
        >
          <View style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: '#00cec9',
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            <Ionicons name="build" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: themeColors.text }}>
              Kit de Herramientas & Checklist
            </Text>
            <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 1 }}>
              Revisa las herramientas de tu camioneta antes de iniciar ruta
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={themeColors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          onPress={() => setActiveTab('pendientes')}
          style={[
            styles.tab,
            activeTab === 'pendientes' && { borderBottomColor: themeColors.accent, borderBottomWidth: 3 },
          ]}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'pendientes' ? themeColors.text : themeColors.textSecondary },
              activeTab === 'pendientes' && styles.tabTextActive,
            ]}
          >
            Pendientes ({pendingList.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('historial')}
          style={[
            styles.tab,
            activeTab === 'historial' && { borderBottomColor: themeColors.accent, borderBottomWidth: 3 },
          ]}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'historial' ? themeColors.text : themeColors.textSecondary },
              activeTab === 'historial' && styles.tabTextActive,
            ]}
          >
            Historial ({historyList.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {isLoading ? (
        <ScrollView style={{ flex: 1 }}>
          <GastosCardsListSkeleton count={5} />
        </ScrollView>
      ) : (
        <FlatList
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews={true}
          data={activeTab === 'pendientes' ? pendingList : historyList}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <ExpenseCard
              gasto={item}
              onPress={() => {
                setSelectedGasto(item);
                setModalVisible(true);
              }}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="file-tray-outline" size={48} color={themeColors.textSecondary} />
              <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                No hay gastos registrados en esta categoría.
              </Text>
            </View>
          }
          refreshing={isLoading}
          onRefresh={() => user && refreshData(user.id)}
        />
      )}

      {/* Floating Action Buttons (Right Side) */}
      <View style={styles.fabContainer}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push('/(empleado)/formulario')}
          style={[styles.fab, { backgroundColor: themeColors.accent }]}
        >
          <Ionicons name="receipt" size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <EmpleadoGastoDetailModal emp={emp} themeColors={themeColors} />
      <EmpleadoVehiculosModal emp={emp} themeColors={themeColors} />
      <EmpleadoProfileModal emp={emp} themeColors={themeColors} />

      <ImageViewerModal
        visible={viewerVisible}
        imageUrl={activePreviewUrl}
        imageUrls={
          selectedGasto
            ? GastoHelper.getFotoUrls(selectedGasto)
            : activePreviewUrl
            ? activePreviewUrl.includes(',')
              ? activePreviewUrl.split(',').map(u => u.trim())
              : [activePreviewUrl]
            : []
        }
        initialIndex={viewerInitialIndex}
        onClose={() => {
          setViewerVisible(false);
          setActivePreviewUrl(null);
        }}
      />
    </View>
  );
}
