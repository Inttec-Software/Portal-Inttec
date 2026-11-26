import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  DirectorioCliente,
  DirectorioClientesService,
} from '@/services/directorioClientesService';

interface DirectorioClientesViewProps {
  canEdit: boolean;
}

export function DirectorioClientesView({ canEdit }: DirectorioClientesViewProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [clientes, setClientes] = useState<DirectorioCliente[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal de creación / edición (solo admins)
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCliente, setEditingCliente] = useState<DirectorioCliente | null>(null);
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [correo, setCorreo] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const showAlert = (title: string, msg: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${msg}`);
    } else {
      Alert.alert(title, msg);
    }
  };

  const fetchClientes = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const data = await DirectorioClientesService.list();
      setClientes(data);
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo cargar el directorio.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchClientes();
  }, [fetchClientes]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchClientes(true);
  };

  const filteredClientes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) => {
      return (
        (c.nombre || '').toLowerCase().includes(q) ||
        (c.direccion || '').toLowerCase().includes(q) ||
        (c.telefono || '').toLowerCase().includes(q) ||
        (c.correo || '').toLowerCase().includes(q)
      );
    });
  }, [clientes, searchQuery]);

  const openCreateModal = () => {
    if (!canEdit) return;
    setEditingCliente(null);
    setNombre('');
    setDireccion('');
    setTelefono('');
    setCorreo('');
    setFormError(null);
    setModalVisible(true);
  };

  const openEditModal = (cliente: DirectorioCliente) => {
    if (!canEdit) return;
    setEditingCliente(cliente);
    setNombre(cliente.nombre || '');
    setDireccion(cliente.direccion || '');
    setTelefono(cliente.telefono || '');
    setCorreo(cliente.correo || '');
    setFormError(null);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!canEdit) return;
    const cleanNombre = nombre.trim();
    if (!cleanNombre) {
      setFormError('El nombre del cliente es obligatorio.');
      return;
    }

    setIsSaving(true);
    setFormError(null);
    try {
      const payload = {
        nombre: cleanNombre,
        direccion: direccion.trim() || null,
        telefono: telefono.trim() || null,
        correo: correo.trim() || null,
      };

      if (editingCliente) {
        const updated = await DirectorioClientesService.update(editingCliente.id, payload);
        setClientes((prev) =>
          prev
            .map((c) => (c.id === updated.id ? updated : c))
            .sort((a, b) => a.nombre.localeCompare(b.nombre))
        );
      } else {
        const created = await DirectorioClientesService.create(payload);
        setClientes((prev) =>
          [...prev, created].sort((a, b) => a.nombre.localeCompare(b.nombre))
        );
      }
      setModalVisible(false);
    } catch (err: any) {
      setFormError(err.message || 'Ocurrió un error al guardar.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (cliente: DirectorioCliente) => {
    if (!canEdit) return;

    const performDelete = async () => {
      try {
        await DirectorioClientesService.remove(cliente.id);
        setClientes((prev) => prev.filter((c) => c.id !== cliente.id));
      } catch (err: any) {
        showAlert('Error', err.message || 'No se pudo eliminar el cliente.');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`¿Eliminar a "${cliente.nombre}" del directorio?`)) {
        performDelete();
      }
    } else {
      Alert.alert(
        'Eliminar Cliente',
        `¿Estás seguro de eliminar a "${cliente.nombre}" del directorio?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Eliminar', style: 'destructive', onPress: performDelete },
        ]
      );
    }
  };

  const handleCopy = (label: string, value: string) => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(value);
      window.alert(`${label} copiado: ${value}`);
    } else {
      Alert.alert(label, value);
    }
  };

  const handleCall = (tel: string) => {
    const clean = tel.replace(/[^\d+]/g, '');
    if (clean) Linking.openURL(`tel:${clean}`).catch(() => {});
  };

  const handleEmail = (email: string) => {
    if (email) Linking.openURL(`mailto:${email.trim()}`).catch(() => {});
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Barra superior */}
      <View
        style={[
          styles.toolbar,
          {
            backgroundColor: themeColors.backgroundElement,
            borderBottomColor: themeColors.border,
          },
        ]}
      >
        <View style={[styles.searchBox, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
          <Ionicons name="search-outline" size={18} color={themeColors.textSecondary} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Buscar por nombre, dirección, teléfono o correo..."
            placeholderTextColor={themeColors.textSecondary}
            style={[styles.searchInput, { color: themeColors.text }]}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={themeColors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.toolbarRight}>
          <View style={[styles.countBadge, { backgroundColor: '#0ea5e918', borderColor: '#0ea5e940' }]}>
            <Ionicons name="book-outline" size={14} color="#0ea5e9" />
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#0ea5e9' }}>
              {filteredClientes.length} {filteredClientes.length === 1 ? 'cliente' : 'clientes'}
            </Text>
          </View>
          
          {canEdit && (
            <TouchableOpacity
              onPress={openCreateModal}
              style={[styles.addBtn, { backgroundColor: '#0ea5e9' }]}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle-outline" size={18} color="#fff" />
              <Text style={styles.addBtnText}>Nuevo Cliente</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Contenido */}
      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#0ea5e9" />
          <Text style={[styles.stateText, { color: themeColors.textSecondary }]}>
            Cargando directorio...
          </Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.scrollContent,
            isDesktop && { paddingHorizontal: 24, maxWidth: 1200, alignSelf: 'center', width: '100%' },
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#0ea5e9" />
          }
        >
          {filteredClientes.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
              <Ionicons name="book-outline" size={48} color={themeColors.textSecondary} />
              <Text style={[styles.emptyTitle, { color: themeColors.text }]}>
                {searchQuery
                  ? 'Sin coincidencias'
                  : 'El directorio está vacío'}
              </Text>
              <Text style={[styles.emptySub, { color: themeColors.textSecondary }]}>
                {searchQuery
                  ? `No se encontraron clientes que coincidan con "${searchQuery}".`
                  : canEdit
                    ? 'Agrega el primer cliente con el botón "Nuevo Cliente".'
                    : 'Aún no hay clientes registrados en el directorio.'}
              </Text>
            </View>
          ) : (
            <View style={[styles.grid, isDesktop && styles.gridDesktop]}>
              {filteredClientes.map((cliente) => (
                <View
                  key={cliente.id}
                  style={[
                    styles.card,
                    isDesktop && styles.cardDesktop,
                    {
                      backgroundColor: themeColors.backgroundElement,
                      borderColor: themeColors.border,
                    },
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <View style={[styles.avatar, { backgroundColor: '#0ea5e918' }]}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#0ea5e9' }}>
                        {(cliente.nombre || '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardName, { color: themeColors.text }]}>
                        {cliente.nombre}
                      </Text>
                    </View>

                    {canEdit && (
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity
                          onPress={() => openEditModal(cliente)}
                          style={[styles.iconActionBtn, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}
                        >
                          <Ionicons name="create-outline" size={16} color="#0ea5e9" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDelete(cliente)}
                          style={[styles.iconActionBtn, { backgroundColor: themeColors.danger + '12', borderColor: themeColors.danger + '40' }]}
                        >
                          <Ionicons name="trash-outline" size={16} color={themeColors.danger} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

                  <View style={{ gap: 8 }}>
                    <View style={styles.infoRow}>
                      <Ionicons name="location-outline" size={15} color={themeColors.textSecondary} />
                      <Text style={[styles.infoText, { color: cliente.direccion ? themeColors.text : themeColors.textSecondary }]}>
                        {cliente.direccion || 'Sin dirección registrada'}
                      </Text>
                      {cliente.direccion ? (
                        <TouchableOpacity onPress={() => handleCopy('Dirección', cliente.direccion!)}>
                          <Ionicons name="copy-outline" size={14} color={themeColors.textSecondary} />
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    <View style={styles.infoRow}>
                      <Ionicons name="call-outline" size={15} color={themeColors.textSecondary} />
                      {cliente.telefono ? (
                        <>
                          <TouchableOpacity onPress={() => handleCall(cliente.telefono!)} style={{ flex: 1 }}>
                            <Text style={[styles.infoText, { color: '#0ea5e9', fontWeight: '600' }]}>
                              {cliente.telefono}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleCopy('Teléfono', cliente.telefono!)}>
                            <Ionicons name="copy-outline" size={14} color={themeColors.textSecondary} />
                          </TouchableOpacity>
                        </>
                      ) : (
                        <Text style={[styles.infoText, { color: themeColors.textSecondary }]}>
                          Sin teléfono registrado
                        </Text>
                      )}
                    </View>

                    <View style={styles.infoRow}>
                      <Ionicons name="mail-outline" size={15} color={themeColors.textSecondary} />
                      {cliente.correo ? (
                        <>
                          <TouchableOpacity onPress={() => handleEmail(cliente.correo!)} style={{ flex: 1 }}>
                            <Text style={[styles.infoText, { color: '#0ea5e9', fontWeight: '600' }]} numberOfLines={1}>
                              {cliente.correo}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleCopy('Correo', cliente.correo!)}>
                            <Ionicons name="copy-outline" size={14} color={themeColors.textSecondary} />
                          </TouchableOpacity>
                        </>
                      ) : (
                        <Text style={[styles.infoText, { color: themeColors.textSecondary }]}>
                          Sin correo registrado
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* Modal Crear / Editar Cliente (solo para admins) */}
      {canEdit && (
        <Modal
          visible={modalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: themeColors.background,
                  borderColor: themeColors.border,
                },
              ]}
            >
              <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                  {editingCliente ? 'Editar Cliente' : 'Nuevo Cliente'}
                </Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close" size={22} color={themeColors.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.modalBody}>
                {formError && (
                  <View style={[styles.errorBox, { backgroundColor: themeColors.danger + '15', borderColor: themeColors.danger }]}>
                    <Text style={{ fontSize: 12, color: themeColors.danger, fontWeight: '700' }}>
                      {formError}
                    </Text>
                  </View>
                )}

                <View style={styles.field}>
                  <Text style={[styles.label, { color: themeColors.text }]}>Nombre *</Text>
                  <TextInput
                    value={nombre}
                    onChangeText={setNombre}
                    placeholder="Nombre o Razón Social del cliente"
                    placeholderTextColor={themeColors.textSecondary}
                    style={[styles.input, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, color: themeColors.text }]}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={[styles.label, { color: themeColors.text }]}>Dirección</Text>
                  <TextInput
                    value={direccion}
                    onChangeText={setDireccion}
                    placeholder="Calle, número, colonia, ciudad..."
                    placeholderTextColor={themeColors.textSecondary}
                    multiline
                    numberOfLines={2}
                    style={[styles.input, styles.textArea, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, color: themeColors.text }]}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={[styles.label, { color: themeColors.text }]}>Teléfono</Text>
                  <TextInput
                    value={telefono}
                    onChangeText={setTelefono}
                    placeholder="Ej. 33 1234 5678"
                    placeholderTextColor={themeColors.textSecondary}
                    keyboardType="phone-pad"
                    style={[styles.input, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, color: themeColors.text }]}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={[styles.label, { color: themeColors.text }]}>Correo electrónico</Text>
                  <TextInput
                    value={correo}
                    onChangeText={setCorreo}
                    placeholder="contacto@empresa.com"
                    placeholderTextColor={themeColors.textSecondary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    style={[styles.input, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, color: themeColors.text }]}
                  />
                </View>
              </ScrollView>

              <View style={[styles.modalFooter, { borderTopColor: themeColors.border }]}>
                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  style={[styles.footerBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, borderWidth: 1 }]}
                >
                  <Text style={{ fontWeight: '700', color: themeColors.textSecondary }}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSave}
                  disabled={isSaving}
                  style={[styles.footerBtn, { backgroundColor: '#0ea5e9', flex: 1.5 }]}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={{ fontWeight: '800', color: '#fff' }}>
                      {editingCliente ? 'Guardar Cambios' : 'Crear Cliente'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 240,
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    height: '100%',
  },
  toolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  stateText: {
    fontSize: 13,
    fontWeight: '600',
  },
  scrollContent: {
    padding: Spacing.three,
    paddingBottom: 40,
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.large,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 360,
  },
  grid: {
    gap: 12,
  },
  gridDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  card: {
    borderWidth: 1,
    borderRadius: BorderRadius.large,
    padding: Spacing.three,
    gap: 10,
  },
  cardDesktop: {
    width: '48.8%',
    minWidth: 320,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardName: {
    fontSize: 15,
    fontWeight: '800',
  },
  iconActionBtn: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    width: '100%',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: 13,
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.three,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    overflow: 'hidden',
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  modalBody: {
    padding: Spacing.three,
    gap: 14,
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    padding: 10,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  textArea: {
    minHeight: 68,
    textAlignVertical: 'top',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    padding: Spacing.three,
    borderTopWidth: 1,
  },
  footerBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: BorderRadius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
