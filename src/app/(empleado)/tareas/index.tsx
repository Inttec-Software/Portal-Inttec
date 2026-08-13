import React, { useState, useEffect } from 'react';
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
  Switch
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/services/supabase';

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
  
  // Nuevos Filtros
  const [showCompleted, setShowCompleted] = useState(false);
  const [dateRange, setDateRange] = useState<'30days' | 'all'>('30days');
  
  // Estado Acordeones
  const [myTasksExpanded, setMyTasksExpanded] = useState(true);
  const [otherTasksExpanded, setOtherTasksExpanded] = useState(false);

  useEffect(() => {
    const fetchTasks = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from('tareas')
          .select(`
            *,
            creador:usuarios!tareas_creado_por_fkey(nombre),
            responsable:usuarios!tareas_responsable_id_fkey(nombre)
          `)
          .order('fecha_compromiso', { ascending: true });

        if (user?.rol === 'EMPLEADO') {
          query = query.or(`responsable_id.eq.${user.id},creado_por.eq.${user.id}`);
        }

        const { data, error } = await query;
        if (error) throw error;

        const formattedTasks = (data || []).map(t => ({
          ...t,
          creado_por: Array.isArray(t.creador) ? t.creador[0]?.nombre : t.creador?.nombre,
          responsable_nombre: Array.isArray(t.responsable) ? t.responsable[0]?.nombre : t.responsable?.nombre,
        }));

        setTasks(formattedTasks);
      } catch (error) {
        console.error('Error al obtener tareas', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchTasks();
  }, [user?.id, user?.nombre]);

  const getSemaforoColor = (fechaCompromiso: string, status: string) => {
    if (status === 'Completada') return '#3498db'; // Azul
    if (status === 'Cancelada') return '#95a5a6'; // Gris

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(fechaCompromiso);
    target.setHours(0, 0, 0, 0);

    const diffTime = target.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays >= 2) return '#2ecc71'; // Verde
    if (diffDays === 1 || diffDays === 0) return '#f1c40f'; // Amarillo
    return '#e74c3c'; // Rojo (Vencido, diffDays < 0)
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
      const fecha = new Date(t.fecha_compromiso);
      return fecha >= thirtyDaysAgo;
    });
  }

  // Agrupar en Acordeón
  const myTasks = filtered.filter(t => t.responsable_id === user?.id);
  const otherTasks = filtered.filter(t => t.responsable_id !== user?.id);

  const renderTask = (item: any) => {
    const semaforoColor = getSemaforoColor(item.fecha_compromiso, item.status);
    const itemWidth = isWeb ? '32%' : '100%';
    
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
        onPress={() => router.push(`/(empleado)/tareas/${item.id}` as any)}
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
              <Text style={{ color: themeColors.primary, fontSize: 10, fontWeight: '600' }}>Vínculo: {item.vinculo_tipo === 'Interna' ? 'Interno' : item.vinculo_tipo}</Text>
            </View>
          )}
          
          <View style={styles.cardFooter}>
            <View style={styles.footerItem}>
              <Ionicons name="calendar-outline" size={14} color={themeColors.textSecondary} style={{ marginRight: 4 }} />
              <Text style={[styles.footerText, { color: themeColors.textSecondary }]}>
                {new Date(item.fecha_compromiso).toLocaleDateString()}
              </Text>
            </View>
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
            router.push('/(empleado)/tareas/nueva' as any);
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
