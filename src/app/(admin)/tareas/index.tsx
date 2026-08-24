import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  ScrollView,
  useWindowDimensions,
  Platform,
  Switch,
  Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/services/supabase';
import { TareasService } from '@/services/tareasService';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function TareasScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isWeb = width > 768; // Para grid de 3 columnas

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Date Editing state
  const [editingTaskForDate, setEditingTaskForDate] = useState<any | null>(null);
  const [showDatePickerModal, setShowDatePickerModal] = useState(false);
  const [isUpdatingCardDate, setIsUpdatingCardDate] = useState<string | null>(null);
  const webDateInputRef = useRef<any>(null);

  // Nuevos Filtros
  const [showCompleted, setShowCompleted] = useState(false);
  const [dateRange, setDateRange] = useState<'30days' | 'all'>('30days');
  const [filterColors, setFilterColors] = useState({ red: true, yellow: true, green: true });
  
  // Estado Acordeones
  const [myTasksExpanded, setMyTasksExpanded] = useState(true);
  const [otherTasksExpanded, setOtherTasksExpanded] = useState(false);

  useEffect(() => {
    const fetchTasks = async () => {
      setLoading(true);
      try {
        const formattedTasks = await TareasService.getTareas();
        setTasks(formattedTasks);
      } catch (error) {
        console.error('Error al obtener tareas', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchTasks();
  }, [user?.id, user?.nombre]);

  const parseLocalDate = (dateString: string) => {
    if (!dateString) return new Date();
    const [year, month, day] = dateString.split('T')[0].split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const getDaysDiff = (fechaCompromiso: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = parseLocalDate(fechaCompromiso);
    target.setHours(0, 0, 0, 0);
    const diffTime = target.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getUrgencyLevel = (fechaCompromiso: string, status: string) => {
    if (status === 'Completada' || status === 'Cancelada') return 4;
    const diffDays = getDaysDiff(fechaCompromiso);
    if (diffDays < 0) return 1; // Rojo (Vencido)
    if (diffDays === 0 || diffDays === 1) return 2; // Amarillo
    return 3; // Verde
  };

  const getSemaforoColor = (fechaCompromiso: string, status: string) => {
    if (status === 'Completada') return '#3498db';
    if (status === 'Cancelada') return '#95a5a6';
    const urgency = getUrgencyLevel(fechaCompromiso, status);
    if (urgency === 1) return '#e74c3c'; // Rojo
    if (urgency === 2) return '#f1c40f'; // Amarillo
    return '#2ecc71'; // Verde
  };

  const renderDaysText = (fechaCompromiso: string, status: string) => {
    if (status === 'Completada' || status === 'Cancelada') return null;
    const diffDays = getDaysDiff(fechaCompromiso);
    if (diffDays < 0) return `Venció hace ${Math.abs(diffDays)} días`;
    if (diffDays === 0) return `Vence hoy`;
    if (diffDays === 1) return `Vence mañana`;
    return `Faltan ${diffDays} días`;
  };

  // 1. Filtrar por texto (titulo, descripcion o responsable)
  let filtered = tasks.filter(t => {
    const q = searchQuery.toLowerCase();
    const tituloMatch = t.titulo?.toLowerCase().includes(q);
    const descMatch = t.descripcion?.toLowerCase().includes(q);
    const respMatch = t.responsable_nombre?.toLowerCase().includes(q);
    return tituloMatch || descMatch || respMatch;
  });

  // 2. Filtrar completadas
  if (!showCompleted) {
    filtered = filtered.filter(t => t.status !== 'Completada' && t.status !== 'Cancelada');
  }

  // 3. Filtrar por fechas
  if (dateRange === '30days') {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);
    
    filtered = filtered.filter(t => {
      const fecha = parseLocalDate(t.fecha_compromiso);
      return fecha >= thirtyDaysAgo;
    });
  }

  // 4. Filtrar por colores (Urgencia)
  filtered = filtered.filter(t => {
    if (t.status === 'Completada' || t.status === 'Cancelada') return true; 
    const urgency = getUrgencyLevel(t.fecha_compromiso, t.status);
    if (urgency === 1 && !filterColors.red) return false;
    if (urgency === 2 && !filterColors.yellow) return false;
    if (urgency === 3 && !filterColors.green) return false;
    return true;
  });

  // Sort array
  const sortTasks = (tasksList: any[]) => {
    return tasksList.sort((a, b) => {
      const urgencyA = getUrgencyLevel(a.fecha_compromiso, a.status);
      const urgencyB = getUrgencyLevel(b.fecha_compromiso, b.status);
      if (urgencyA !== urgencyB) return urgencyA - urgencyB;
      // If same urgency, sort by fecha_compromiso ascending
      return parseLocalDate(a.fecha_compromiso).getTime() - parseLocalDate(b.fecha_compromiso).getTime();
    });
  };

  // Agrupar en Acordeón
  const myTasks = sortTasks(filtered.filter(t => t.responsable_id === user?.id));
  const otherTasks = sortTasks(filtered.filter(t => t.responsable_id !== user?.id));

  const handleUpdateTaskDate = async (taskItem: any, newDate: Date) => {
    if (!taskItem || !newDate || isNaN(newDate.getTime())) return;
    setIsUpdatingCardDate(taskItem.id);
    try {
      const isoDate = newDate.toISOString();
      const formattedDate = newDate.toLocaleDateString('es-MX', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      });

      await TareasService.updateTarea(taskItem.id, {
        fecha_compromiso: isoDate,
        nota_texto: `📅 Fecha de entrega actualizada al ${formattedDate}`
      });

      setTasks(prevTasks => prevTasks.map(t => t.id === taskItem.id ? { ...t, fecha_compromiso: isoDate } : t));

      if (Platform.OS !== 'web') {
        Alert.alert('Éxito', `Fecha de entrega de "${taskItem.titulo}" actualizada al ${formattedDate}`);
      }
    } catch (err: any) {
      console.error('Error al actualizar fecha:', err);
      if (Platform.OS === 'web') {
        window.alert('No se pudo actualizar la fecha: ' + (err.message || ''));
      } else {
        Alert.alert('Error', 'No se pudo actualizar la fecha de entrega.');
      }
    } finally {
      setIsUpdatingCardDate(null);
      setEditingTaskForDate(null);
      setShowDatePickerModal(false);
    }
  };

  const handleOpenDateEdit = (taskItem: any) => {
    setEditingTaskForDate(taskItem);
    if (Platform.OS === 'web') {
      if (webDateInputRef.current) {
        try {
          webDateInputRef.current.showPicker();
        } catch {
          webDateInputRef.current.focus();
          webDateInputRef.current.click();
        }
      }
    } else {
      setShowDatePickerModal(true);
    }
  };

  const renderTask = (item: any) => {
    const semaforoColor = getSemaforoColor(item.fecha_compromiso, item.status);
    const itemWidth = isWeb ? '32%' : '100%';
    const isUpdatingThis = isUpdatingCardDate === item.id;
    
    return (
      <TouchableOpacity 
        key={item.id}
        style={[
          styles.taskCard, 
          { 
            backgroundColor: themeColors.backgroundElement, 
            borderColor: themeColors.border,
            width: itemWidth,
            marginBottom: isWeb ? Spacing.four : Spacing.three,
          }
        ]}
        onPress={() => router.push(`/(admin)/tareas/${item.id}` as any)}
        activeOpacity={0.7}
      >
        <View style={[styles.colorIndicator, { backgroundColor: semaforoColor }]} />
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <Text style={[styles.taskTitle, { color: themeColors.text }]} numberOfLines={1}>
              {item.titulo}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: item.status === 'Completada' ? '#3498db20' : '#f39c1220' }]}>
              <Text style={[styles.statusText, { color: item.status === 'Completada' ? '#3498db' : '#f39c12' }]}>
                {item.status}
              </Text>
            </View>
          </View>
          
          <Text style={[styles.taskDesc, { color: themeColors.textSecondary }]} numberOfLines={2}>
            {item.descripcion}
          </Text>

          {item.vinculo_tipo && (
            <View style={{ alignSelf: 'flex-start', backgroundColor: themeColors.primary + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginBottom: 8 }}>
              <Text style={{ color: themeColors.primary, fontSize: 10, fontWeight: '600' }}>
                Vínculo: {item.vinculo_tipo === 'Interna' ? 'Interno' : item.vinculo_tipo}
                {item.vinculo_nombre ? ` - ${item.vinculo_nombre}` : ''}
              </Text>
            </View>
          )}

          {renderDaysText(item.fecha_compromiso, item.status) && (
            <View style={{ marginBottom: 8 }}>
              <Text style={{ color: getSemaforoColor(item.fecha_compromiso, item.status), fontSize: 12, fontWeight: '600' }}>
                {renderDaysText(item.fecha_compromiso, item.status)}
              </Text>
            </View>
          )}
          
          <View style={styles.cardFooter}>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                handleOpenDateEdit(item);
              }}
              activeOpacity={0.7}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: themeColors.accent + '18',
                borderColor: themeColors.accent + '40',
                borderWidth: 1,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 6,
                gap: 5
              }}
            >
              {isUpdatingThis ? (
                <ActivityIndicator size="small" color={themeColors.accent} style={{ transform: [{ scale: 0.7 }] }} />
              ) : (
                <Ionicons name="calendar-outline" size={13} color={themeColors.accent} />
              )}
              <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.text }}>
                {parseLocalDate(item.fecha_compromiso).toLocaleDateString()}
              </Text>
              <View style={{ backgroundColor: themeColors.accent, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, marginLeft: 2 }}>
                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>EDITAR</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.footerItem}>
              <Ionicons name="person-outline" size={14} color={themeColors.textSecondary} style={{ marginRight: 4 }} />
              <Text style={[styles.footerText, { color: themeColors.textSecondary }]} numberOfLines={1}>
                {item.responsable_nombre}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['bottom', 'left', 'right']}>
      {/* HEADER & SEARCH */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={themeColors.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: themeColors.text, backgroundColor: themeColors.backgroundElement }]}
            placeholder="Buscar por título, descripción o responsable..."
            placeholderTextColor={themeColors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <TouchableOpacity 
          style={[styles.addButton, { backgroundColor: themeColors.accent }]}
          onPress={() => {
            router.push('/(admin)/tareas/nueva' as any);
          }}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* FILTERS TRAY */}
      <View style={[styles.filtersContainer, { borderBottomColor: themeColors.border }]}>
        {/* Toggle Completadas */}
        <View style={styles.filterToggleRow}>
          <Text style={[styles.filterLabel, { color: themeColors.textSecondary }]}>Mostrar completadas</Text>
          <Switch 
            value={showCompleted}
            onValueChange={setShowCompleted}
            trackColor={{ false: themeColors.border, true: themeColors.accent + '80' }}
            thumbColor={showCompleted ? themeColors.accent : '#f4f3f4'}
          />
        </View>

        {/* Color Filters */}
        <View style={styles.colorFiltersContainer}>
          <TouchableOpacity 
            style={[styles.colorFilterBtn, { borderColor: '#e74c3c' }, filterColors.red && { backgroundColor: '#e74c3c' }]}
            onPress={() => setFilterColors(prev => ({ ...prev, red: !prev.red }))}
          >
            <Text style={{ color: filterColors.red ? '#fff' : '#e74c3c', fontSize: 12, fontWeight: '600' }}>Mostrar tareas vencidas</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.colorFilterBtn, { borderColor: '#f1c40f' }, filterColors.yellow && { backgroundColor: '#f1c40f' }]}
            onPress={() => setFilterColors(prev => ({ ...prev, yellow: !prev.yellow }))}
          >
            <Text style={{ color: filterColors.yellow ? '#fff' : '#f1c40f', fontSize: 12, fontWeight: '600' }}>Mostrar tareas urgentes</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.colorFilterBtn, { borderColor: '#2ecc71' }, filterColors.green && { backgroundColor: '#2ecc71' }]}
            onPress={() => setFilterColors(prev => ({ ...prev, green: !prev.green }))}
          >
            <Text style={{ color: filterColors.green ? '#fff' : '#2ecc71', fontSize: 12, fontWeight: '600' }}>Mostrar tareas vigentes</Text>
          </TouchableOpacity>
        </View>

        {/* Date Filter */}
        <View style={styles.dateFilterContainer}>
          <TouchableOpacity 
            style={[
              styles.dateBtn, 
              dateRange === '30days' ? { backgroundColor: themeColors.accent } : { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }
            ]}
            onPress={() => setDateRange('30days')}
          >
            <Text style={{ color: dateRange === '30days' ? '#fff' : themeColors.text, fontSize: 13, fontWeight: '500' }}>Últimos 30 días</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[
              styles.dateBtn, 
              dateRange === 'all' ? { backgroundColor: themeColors.accent } : { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }
            ]}
            onPress={() => setDateRange('all')}
          >
            <Text style={{ color: dateRange === 'all' ? '#fff' : themeColors.text, fontSize: 13, fontWeight: '500' }}>Todos los tiempos</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* CONTENT LIST */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={themeColors.accent} />
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
          
          {/* SECCIÓN: MIS TAREAS */}
          {myTasks.length > 0 && (
            <View style={styles.sectionContainer}>
              <TouchableOpacity 
                style={styles.sectionHeader}
                onPress={() => setMyTasksExpanded(!myTasksExpanded)}
                activeOpacity={0.7}
              >
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                  Mis Tareas ({myTasks.length})
                </Text>
                <Ionicons name={myTasksExpanded ? 'chevron-down' : 'chevron-forward'} size={20} color={themeColors.textSecondary} />
              </TouchableOpacity>
              
              {myTasksExpanded && (
                <View style={[styles.gridContainer, isWeb && styles.gridWeb]}>
                  {myTasks.map(renderTask)}
                </View>
              )}
            </View>
          )}

          {/* SECCIÓN: TAREAS DE OTROS */}
          {otherTasks.length > 0 && (
            <View style={styles.sectionContainer}>
              <TouchableOpacity 
                style={styles.sectionHeader}
                onPress={() => setOtherTasksExpanded(!otherTasksExpanded)}
                activeOpacity={0.7}
              >
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                  Tareas de otros usuarios ({otherTasks.length})
                </Text>
                <Ionicons name={otherTasksExpanded ? 'chevron-down' : 'chevron-forward'} size={20} color={themeColors.textSecondary} />
              </TouchableOpacity>
              
              {otherTasksExpanded && (
                <View style={[styles.gridContainer, isWeb && styles.gridWeb]}>
                  {otherTasks.map(renderTask)}
                </View>
              )}
            </View>
          )}

          {/* EMPTY STATE */}
          {myTasks.length === 0 && otherTasks.length === 0 && (
            <View style={styles.emptyContainer}>
              <Ionicons name="checkmark-done-circle-outline" size={60} color={themeColors.border} />
              <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                No se encontraron tareas que coincidan con los filtros.
              </Text>
            </View>
          )}
          
        </ScrollView>
      )}

      {Platform.OS === 'web' && (
        // @ts-ignore
        <input
          ref={webDateInputRef}
          type="date"
          style={{
            position: 'absolute',
            opacity: 0,
            width: 0,
            height: 0,
            pointerEvents: 'none'
          }}
          value={editingTaskForDate?.fecha_compromiso ? new Date(editingTaskForDate.fecha_compromiso).toISOString().split('T')[0] : ''}
          onChange={(e: any) => {
            if (e.target.value && editingTaskForDate) {
              const [y, m, d] = e.target.value.split('-').map(Number);
              const newD = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
              handleUpdateTaskDate(editingTaskForDate, newD);
            }
          }}
        />
      )}

      {showDatePickerModal && editingTaskForDate && (
        <DateTimePicker
          value={editingTaskForDate.fecha_compromiso ? parseLocalDate(editingTaskForDate.fecha_compromiso) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onValueChange={(event, selectedDate) => {
            setShowDatePickerModal(false);
            if (selectedDate) {
              handleUpdateTaskDate(editingTaskForDate, selectedDate);
            }
          }}
          onDismiss={() => setShowDatePickerModal(false)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    gap: Spacing.three,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  searchIcon: {
    position: 'absolute',
    left: 12,
    zIndex: 1,
  },
  searchInput: {
    flex: 1,
    height: 40,
    borderRadius: BorderRadius.medium,
    paddingLeft: 40,
    paddingRight: 12,
    fontSize: 15,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  filtersContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  filterToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  dateFilterContainer: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  dateBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  colorFiltersContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  colorFilterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  scrollContent: {
    padding: Spacing.four,
    paddingBottom: 100,
  },
  sectionContainer: {
    marginBottom: Spacing.five,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    marginBottom: Spacing.two,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  gridContainer: {
    flexDirection: 'column',
  },
  gridWeb: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: '2%', // Used alongside width: '32%' for proper spacing
  },
  taskCard: {
    flexDirection: 'row',
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
    // Note: margin handled inline based on isWeb
  },
  colorIndicator: {
    width: 8,
  },
  cardContent: {
    flex: 1,
    padding: Spacing.four,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.two,
    gap: Spacing.two,
  },
  taskTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  taskDesc: {
    fontSize: 14,
    marginBottom: Spacing.three,
    lineHeight: 20,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1, // Para evitar text overflow en el nombre
  },
  footerText: {
    fontSize: 12,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
  }
});
