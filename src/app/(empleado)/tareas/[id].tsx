import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Platform,
  Alert
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/services/supabase';

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');

  useEffect(() => {
    fetchTaskDetails();
  }, [id]);

  const fetchTaskDetails = async () => {
    setLoading(true);
    try {
      const { data: taskData, error: taskError } = await supabase
        .from('tareas')
        .select(`
          *,
          creador:usuarios!tareas_creado_por_fkey(nombre),
          responsable:usuarios!tareas_responsable_id_fkey(nombre)
        `)
        .eq('id', id)
        .single();
      
      if (taskError) throw taskError;

      const { data: notesData } = await supabase
        .from('tarea_notas')
        .select('*, usuario:usuarios!tarea_notas_usuario_id_fkey(nombre)')
        .eq('tarea_id', id)
        .order('created_at', { ascending: false });

      let vinculo_nombre = '';
      if (taskData.vinculo_tipo === 'Cliente' && taskData.vinculo_id) {
        const { data: clientData } = await supabase.from('clientes').select('nombre').eq('id', taskData.vinculo_id).single();
        if (clientData) vinculo_nombre = clientData.nombre;
      } else if (taskData.vinculo_tipo === 'Venta' && taskData.vinculo_id) {
        const { data: ventaData } = await supabase.from('ventas').select('cliente, factura_referencia').eq('id', taskData.vinculo_id).single();
        if (ventaData) vinculo_nombre = `${ventaData.cliente} - ${ventaData.factura_referencia}`;
      }

      setTask({
        ...taskData,
        creado_por_nombre: Array.isArray(taskData.creador) ? taskData.creador[0]?.nombre : taskData.creador?.nombre,
        responsable_nombre: Array.isArray(taskData.responsable) ? taskData.responsable[0]?.nombre : taskData.responsable?.nombre,
        vinculo_nombre
      });

      setNotes((notesData || []).map((n: any) => ({
        ...n,
        usuario_nombre: Array.isArray(n.usuario) ? n.usuario[0]?.nombre : n.usuario?.nombre
      })));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    
    const note = {
      tarea_id: id,
      usuario_id: user?.id,
      comentario: newNote,
    };
    
    try {
      const { data, error } = await supabase.from('tarea_notas').insert(note).select('*, usuario:usuarios!tarea_notas_usuario_id_fkey(nombre)').single();
      if (error) throw error;
      
      setNotes([{
        ...data,
        usuario_nombre: Array.isArray(data.usuario) ? data.usuario[0]?.nombre : data.usuario?.nombre
      }, ...notes]);
      setNewNote('');
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'No se pudo guardar la nota.');
    }
  };

  const handleCompleteTask = () => {
    if (Platform.OS === 'web') {
      const confirm = window.confirm('¿Estás seguro de marcar esta tarea como completada?');
      if (confirm) completeTaskAction();
    } else {
      Alert.alert(
        'Completar Tarea',
        '¿Estás seguro de marcar esta tarea como completada?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Completar', onPress: () => completeTaskAction(), style: 'default' }
        ]
      );
    }
  };

  const completeTaskAction = async () => {
    try {
      const { error } = await supabase.from('tareas').update({ status: 'Completada' }).eq('id', id);
      if (error) throw error;
      setTask({ ...task, status: 'Completada' });
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'No se pudo completar la tarea.');
    }
  };

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
    if (diffDays === 1 || diffDays === 0) return '#f1c40f';
    return '#e74c3c';
  };

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color={themeColors.accent} />
      </View>
    );
  }

  if (!task) return null;

  const semaforoColor = getSemaforoColor(task.fecha_compromiso, task.status);
  const canComplete = user?.id === task.creado_por || user?.id === task.responsable_id;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['bottom', 'left', 'right']}>
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <View style={styles.backBtn} />
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Detalle de Tarea</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Task Info Card */}
        <View style={[styles.card, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
          <View style={[styles.colorTopBar, { backgroundColor: semaforoColor }]} />
          
          <View style={styles.cardInner}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: themeColors.text }]}>{task.titulo}</Text>
              <View style={[styles.badge, { backgroundColor: task.status === 'Completada' ? '#3498db20' : '#f39c1220' }]}>
                <Text style={[styles.badgeText, { color: task.status === 'Completada' ? '#3498db' : '#f39c12' }]}>
                  {task.status}
                </Text>
              </View>
            </View>

            <Text style={[styles.description, { color: themeColors.textSecondary }]}>
              {task.descripcion}
            </Text>

            <View style={styles.metaContainer}>
              <View style={styles.metaItem}>
                <Ionicons name="person" size={16} color={themeColors.textSecondary} />
                <View>
                  <Text style={[styles.metaLabel, { color: themeColors.textSecondary }]}>Responsable</Text>
                  <Text style={[styles.metaValue, { color: themeColors.text }]}>{task.responsable_nombre}</Text>
                </View>
              </View>
              
              <View style={styles.metaItem}>
                <Ionicons name="calendar" size={16} color={themeColors.textSecondary} />
                <View>
                  <Text style={[styles.metaLabel, { color: themeColors.textSecondary }]}>Vencimiento</Text>
                  <Text style={[styles.metaValue, { color: themeColors.text }]}>
                    {new Date(task.fecha_compromiso).toLocaleDateString()}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.metaContainer}>
              <View style={styles.metaItem}>
                <Ionicons name="add-circle-outline" size={16} color={themeColors.textSecondary} />
                <View>
                  <Text style={[styles.metaLabel, { color: themeColors.textSecondary }]}>Creada por</Text>
                  <Text style={[styles.metaValue, { color: themeColors.text }]}>{task.creado_por_nombre}</Text>
                </View>
              </View>

              {task.vinculo_tipo && (
                <View style={styles.metaItem}>
                  <Ionicons name="link-outline" size={16} color={themeColors.textSecondary} />
                  <View>
                    <Text style={[styles.metaLabel, { color: themeColors.textSecondary }]}>Vinculación</Text>
                    <Text style={[styles.metaValue, { color: themeColors.text }]}>
                      {task.vinculo_tipo === 'Interna' ? 'Interno' : task.vinculo_tipo}
                      {task.vinculo_nombre ? ` - ${task.vinculo_nombre}` : ''}
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {task.status !== 'Completada' && canComplete && (
              <TouchableOpacity 
                style={[styles.completeBtn, { backgroundColor: '#2ecc71' }]}
                onPress={handleCompleteTask}
              >
                <Ionicons name="checkmark-done" size={20} color="#fff" />
                <Text style={styles.completeBtnText}>Marcar como Completada</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Notes Section */}
        <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Notas y Avances</Text>
        
        {task.status !== 'Completada' && (
          <View style={[styles.addNoteContainer, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <TextInput
              style={[styles.noteInput, { color: themeColors.text }]}
              placeholder="Escribe un avance o aclaración..."
              placeholderTextColor={themeColors.textSecondary}
              multiline
              value={newNote}
              onChangeText={setNewNote}
            />
            <TouchableOpacity 
              style={[styles.sendNoteBtn, { backgroundColor: themeColors.accent, opacity: newNote.trim() ? 1 : 0.5 }]}
              onPress={handleAddNote}
              disabled={!newNote.trim()}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.timeline}>
          {notes.map((note, index) => (
            <View key={note.id} style={styles.timelineItem}>
              <View style={styles.timelineLeft}>
                <View style={[styles.timelineDot, { backgroundColor: themeColors.accent }]} />
                {index !== notes.length - 1 && <View style={[styles.timelineLine, { backgroundColor: themeColors.border }]} />}
              </View>
              <View style={[styles.noteCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                <View style={styles.noteHeader}>
                  <Text style={[styles.noteAuthor, { color: themeColors.text }]}>{note.usuario_nombre}</Text>
                  <Text style={[styles.noteDate, { color: themeColors.textSecondary }]}>
                    {new Date(note.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </Text>
                </View>
                <Text style={[styles.noteText, { color: themeColors.text }]}>{note.comentario}</Text>
              </View>
            </View>
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  scrollContent: {
    padding: Spacing.four,
    paddingBottom: 40,
  },
  card: {
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: Spacing.five,
  },
  colorTopBar: {
    height: 6,
    width: '100%',
  },
  cardInner: {
    padding: Spacing.four,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.three,
    gap: Spacing.two,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: Spacing.five,
  },
  metaContainer: {
    flexDirection: 'row',
    gap: Spacing.five,
    marginBottom: Spacing.five,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  metaLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  metaValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    gap: Spacing.two,
  },
  completeBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: Spacing.three,
  },
  addNoteContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: 1,
    borderRadius: BorderRadius.large,
    padding: Spacing.two,
    marginBottom: Spacing.five,
  },
  noteInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.two,
    fontSize: 15,
  },
  sendNoteBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Spacing.two,
  },
  timeline: {
    marginTop: Spacing.two,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: Spacing.three,
  },
  timelineLeft: {
    width: 30,
    alignItems: 'center',
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 6,
    zIndex: 1,
  },
  timelineLine: {
    position: 'absolute',
    top: 18,
    bottom: -Spacing.three,
    width: 2,
  },
  noteCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    padding: Spacing.three,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.one,
  },
  noteAuthor: {
    fontWeight: '600',
    fontSize: 14,
  },
  noteDate: {
    fontSize: 12,
  },
  noteText: {
    fontSize: 14,
    lineHeight: 20,
  }
});
