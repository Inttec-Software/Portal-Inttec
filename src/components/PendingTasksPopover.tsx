import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Platform,
  FlatList,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { supabase } from '@/services/supabase';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'expo-router';

interface PendingTasksPopoverProps {
  visible: boolean;
  onClose: () => void;
}

interface TaskSummary {
  id: string;
  titulo: string;
  fecha_compromiso: string;
  status: string;
  color: string;
}

export default function PendingTasksPopover({ visible, onClose }: PendingTasksPopoverProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { user } = useAuth();
  const router = useRouter();

  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPendingTasks = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('tareas')
          .select('id, titulo, fecha_compromiso, status')
          .or(`responsable_id.eq.${user?.id},creado_por.eq.${user?.id}`)
          .neq('status', 'Completada')
          .order('fecha_compromiso', { ascending: true })
          .limit(5);
          
        if (error) throw error;

        const getSemaforoColor = (fechaCompromiso: string, status: string) => {
          if (status === 'Completada') return '#3498db';
          if (status === 'Cancelada') return '#95a5a6';
      
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const target = new Date(fechaCompromiso);
          target.setHours(0, 0, 0, 0);
      
          const diffTime = target.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
          if (diffDays >= 2) return '#2ecc71';
          if (diffDays === 1 || diffDays === 0) return '#f39c12';
          return '#e74c3c';
        };

        const formattedTasks = (data || []).map((t: any) => ({
          id: t.id,
          titulo: t.titulo,
          fecha_compromiso: t.fecha_compromiso,
          status: t.status,
          color: getSemaforoColor(t.fecha_compromiso, t.status)
        }));

        setTasks(formattedTasks);
      } catch (error) {
        console.error('Error fetching tasks', error);
      } finally {
        setLoading(false);
      }
    };

    if (visible && user) {
      fetchPendingTasks();
    }
  }, [visible, user?.id]);

  const navigateToTask = (id: string) => {
    onClose();
    if (user?.rol === 'EMPLEADO') {
      router.push(`/(empleado)/tareas/${id}` as any);
    } else {
      router.push(`/(admin)/tareas/${id}` as any);
    }
  };

  const navigateToAllTasks = () => {
    onClose();
    if (user?.rol === 'EMPLEADO') {
      router.push('/(empleado)/tareas' as any);
    } else {
      router.push('/(admin)/tareas' as any);
    }
  };

  if (!visible) return null;

  return (
    <Modal statusBarTranslucent={true}
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity 
        style={styles.overlay} 
        activeOpacity={1} 
        onPress={onClose}
      >
        <TouchableOpacity 
          activeOpacity={1} 
          style={[
            styles.popover, 
            { 
              backgroundColor: themeColors.backgroundElement,
              borderColor: themeColors.border 
            }
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
            <Text style={[styles.headerTitle, { color: themeColors.text }]}>Mis Tareas Pendientes</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={styles.content}>
            {loading ? (
              <ActivityIndicator size="small" color={themeColors.primary} style={{ margin: 20 }} />
            ) : tasks.length === 0 ? (
              <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                No tienes tareas pendientes. ¡Buen trabajo!
              </Text>
            ) : (
              <FlatList
                data={tasks}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    style={[styles.taskItem, { borderBottomColor: themeColors.border }]}
                    onPress={() => navigateToTask(item.id)}
                  >
                    <View style={[styles.statusIndicator, { backgroundColor: item.color }]} />
                    <View style={styles.taskInfo}>
                      <Text style={[styles.taskTitle, { color: themeColors.text }]} numberOfLines={1}>
                        {item.titulo}
                      </Text>
                      <Text style={[styles.taskDate, { color: themeColors.textSecondary }]}>
                        Vence: {new Date(item.fecha_compromiso).toLocaleDateString()}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={themeColors.border} />
                  </TouchableOpacity>
                )}
                scrollEnabled={false}
              />
            )}
          </View>

          {/* Footer */}
          <TouchableOpacity 
            style={[styles.footer, { borderTopColor: themeColors.border }]}
            onPress={navigateToAllTasks}
          >
            <Text style={[styles.footerText, { color: themeColors.primary }]}>Ver todas las tareas</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: Platform.OS === 'web' ? 'flex-start' : 'center',
    alignItems: Platform.OS === 'web' ? 'flex-end' : 'center',
  },
  popover: {
    width: 320,
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
    ...Platform.select({
      web: {
        marginTop: 60,
        marginRight: 20,
      },
      default: {
        marginHorizontal: 20,
      }
    })
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontWeight: '700',
    fontSize: 16,
  },
  closeBtn: {
    padding: 4,
  },
  content: {
    paddingVertical: Spacing.two,
  },
  emptyText: {
    textAlign: 'center',
    padding: Spacing.five,
    fontStyle: 'italic',
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: Spacing.three,
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    fontWeight: '500',
    fontSize: 14,
    marginBottom: 2,
  },
  taskDate: {
    fontSize: 12,
  },
  footer: {
    paddingVertical: Spacing.three,
    alignItems: 'center',
    borderTopWidth: 1,
  },
  footerText: {
    fontWeight: '600',
    fontSize: 14,
  }
});
