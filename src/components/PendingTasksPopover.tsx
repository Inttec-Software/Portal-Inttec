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
import { NotificacionesService, Notificacion } from '@/services/supabase';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'expo-router';

interface PendingTasksPopoverProps {
  visible: boolean;
  onClose: () => void;
}

export default function PendingTasksPopover({ visible, onClose }: PendingTasksPopoverProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { user } = useAuth();
  const router = useRouter();

  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNotificaciones = async () => {
      if (!user?.id) return;
      setLoading(true);
      try {
        const data = await NotificacionesService.getMisNotificaciones(user.id);
        setNotificaciones(data || []);
      } catch (error) {
        console.error('Error fetching notificaciones', error);
      } finally {
        setLoading(false);
      }
    };

    if (visible && user) {
      fetchNotificaciones();
    }
  }, [visible, user?.id]);

  const handleNotificacionClick = async (notificacion: Notificacion) => {
    try {
      if (!notificacion.leido) {
        await NotificacionesService.marcarComoLeida(notificacion.id);
        setNotificaciones((prev) =>
          prev.map((n) => (n.id === notificacion.id ? { ...n, leido: true } : n))
        );
      }
    } catch (e) {
      console.error('Error al marcar como leída:', e);
    }
    
    onClose();

    // Redirección basada en el tipo de notificación
    const rolePrefix = user?.rol === 'ADMIN' ? '/(admin)' : '/(empleado)';
    
    switch (notificacion.tipo) {
      case 'DOCUMENTO_NUEVO':
        router.push(`${rolePrefix}/documentos` as any);
        break;
      case 'TAREA_NUEVA':
        if (notificacion.referencia_id) {
          router.push(`${rolePrefix}/tareas/${notificacion.referencia_id}` as any);
        } else {
          router.push(`${rolePrefix}/tareas` as any);
        }
        break;
      case 'GASTO_NUEVO':
        router.push(`${rolePrefix}/gastos` as any);
        break;
      case 'REPORTE_NUEVO':
        router.push(`${rolePrefix}/reportes` as any);
        break;
      default:
        // Navegación por defecto o no hacer nada
        break;
    }
  };

  const getIconForType = (tipo: string) => {
    switch(tipo) {
      case 'DOCUMENTO_NUEVO': return 'document-text';
      case 'TAREA_NUEVA': return 'checkbox';
      case 'GASTO_NUEVO': return 'cash';
      case 'REPORTE_NUEVO': return 'warning';
      default: return 'notifications';
    }
  };

  const getColorForType = (tipo: string) => {
    switch(tipo) {
      case 'DOCUMENTO_NUEVO': return '#3b82f6'; // blue
      case 'TAREA_NUEVA': return '#10b981'; // green
      case 'GASTO_NUEVO': return '#f59e0b'; // amber
      case 'REPORTE_NUEVO': return '#ef4444'; // red
      default: return '#8b5cf6'; // purple
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
            <Text style={[styles.headerTitle, { color: themeColors.text }]}>Notificaciones</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={styles.content}>
            {loading ? (
              <ActivityIndicator size="small" color={themeColors.primary} style={{ margin: 20 }} />
            ) : notificaciones.length === 0 ? (
              <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                No tienes notificaciones recientes.
              </Text>
            ) : (
              <FlatList
                data={notificaciones}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    style={[
                      styles.taskItem, 
                      { 
                        borderBottomColor: themeColors.border,
                        backgroundColor: item.leido ? 'transparent' : (scheme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)') 
                      }
                    ]}
                    onPress={() => handleNotificacionClick(item)}
                  >
                    <View style={[styles.iconContainer, { backgroundColor: getColorForType(item.tipo) + '20' }]}>
                      <Ionicons name={getIconForType(item.tipo) as any} size={20} color={getColorForType(item.tipo)} />
                    </View>
                    <View style={styles.taskInfo}>
                      <Text style={[styles.taskTitle, { color: themeColors.text, fontWeight: item.leido ? '400' : '700' }]} numberOfLines={1}>
                        {item.titulo}
                      </Text>
                      <Text style={[styles.taskDate, { color: themeColors.textSecondary }]} numberOfLines={2}>
                        {item.mensaje}
                      </Text>
                      <Text style={[styles.timeText, { color: themeColors.textSecondary }]}>
                        {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </Text>
                    </View>
                    {!item.leido && (
                      <View style={[styles.unreadDot, { backgroundColor: themeColors.primary }]} />
                    )}
                  </TouchableOpacity>
                )}
                scrollEnabled={true}
                style={{ maxHeight: 400 }}
              />
            )}
          </View>
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
    width: 350,
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
    paddingVertical: 0,
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
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.three,
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 14,
    marginBottom: 2,
  },
  taskDate: {
    fontSize: 12,
    marginBottom: 4,
  },
  timeText: {
    fontSize: 10,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: Spacing.two,
  },
});

