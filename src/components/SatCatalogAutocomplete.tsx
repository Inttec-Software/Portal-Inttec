import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  Platform,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { getApiHeaders, getApiUrl } from '@/services/apiHelper';
import {
  SAT_PRODUCTOS_SERVICIOS,
  SAT_UNIDADES,
  SatClaveProdServ,
  SatClaveUnidad,
  buscarClavesSat,
  buscarUnidadesSat,
  obtenerDescripcionClaveSat,
  obtenerNombreUnidadSat,
} from '@/constants/satCatalog';

interface SatCatalogAutocompleteProps {
  tipo: 'producto' | 'unidad';
  value: string;
  onChangeValue: (clave: string) => void;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
  style?: any;
}

export default function SatCatalogAutocomplete({
  tipo,
  value,
  onChangeValue,
  placeholder,
  disabled = false,
  label,
  style,
}: SatCatalogAutocompleteProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('TODOS');
  const [apiResults, setApiResults] = useState<any[] | null>(null);
  const [isSearchingApi, setIsSearchingApi] = useState(false);

  // Categorías destacadas para productos
  const categoriasProductos = useMemo(() => {
    const cats = Array.from(new Set(SAT_PRODUCTOS_SERVICIOS.map(p => p.categoria || 'Otros')));
    return ['TODOS', ...cats];
  }, []);

  // Búsqueda en vivo conectada al backend de más de 52,000 claves
  useEffect(() => {
    if (!modalVisible) {
      setApiResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      const q = searchQuery.trim();
      if (!q) {
        setApiResults(null);
        return;
      }

      setIsSearchingApi(true);
      try {
        const headers = await getApiHeaders();
        const endpoint = tipo === 'producto' ? 'productos-servicios' : 'unidades';
        const url = `${getApiUrl()}/api/sat/${endpoint}?q=${encodeURIComponent(q)}&limit=60`;
        const res = await fetch(url, { headers });
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.results)) {
            setApiResults(json.results);
          }
        }
      } catch (err) {
        // Fallback local transparente si el backend no responde
        setApiResults(null);
      } finally {
        setIsSearchingApi(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [searchQuery, modalVisible, tipo]);

  // Resultados combinados: Resultados de la API del backend (52k) o fallback local indexado
  const resultados = useMemo(() => {
    if (apiResults !== null && searchQuery.trim().length > 0) {
      if (tipo === 'producto' && selectedCategory !== 'TODOS') {
        return apiResults.filter(i => (i.categoria === selectedCategory) || !i.categoria);
      }
      return apiResults;
    }

    if (tipo === 'producto') {
      let items = buscarClavesSat(searchQuery, 50);
      if (selectedCategory !== 'TODOS') {
        items = items.filter(i => i.categoria === selectedCategory);
      }
      return items;
    } else {
      return buscarUnidadesSat(searchQuery, 40);
    }
  }, [tipo, searchQuery, selectedCategory, apiResults]);

  // Descripción del valor actual para tooltip o badge
  const descripcionActual = useMemo(() => {
    if (!value) return '';
    if (tipo === 'producto') {
      return obtenerDescripcionClaveSat(value);
    } else {
      return obtenerNombreUnidadSat(value);
    }
  }, [tipo, value]);

  const handleSelect = (clave: string) => {
    onChangeValue(clave);
    setModalVisible(false);
    setSearchQuery('');
  };

  const isCustomCode = useMemo(() => {
    if (!searchQuery.trim()) return false;
    const q = searchQuery.trim().toUpperCase();
    if (apiResults && apiResults.length > 0) {
      return !apiResults.some((r: any) => (r.clave || '').toUpperCase() === q);
    }
    if (tipo === 'producto') {
      return !SAT_PRODUCTOS_SERVICIOS.some(p => p.clave === q);
    } else {
      return !SAT_UNIDADES.some(u => u.clave.toUpperCase() === q);
    }
  }, [searchQuery, tipo, apiResults]);

  return (
    <View style={[{ flex: 1 }, style]}>
      {label && (
        <Text style={{ fontSize: 10, color: themeColors.textSecondary, marginBottom: 2 }}>
          {label}
        </Text>
      )}

      {/* Botón / Input de Activación */}
      <TouchableOpacity
        onPress={() => {
          if (!disabled) {
            setSearchQuery('');
            setSelectedCategory('TODOS');
            setModalVisible(true);
          }
        }}
        activeOpacity={0.7}
        style={[
          styles.inputContainer,
          {
            borderColor: themeColors.border,
            backgroundColor: themeColors.backgroundElement,
          },
        ]}
      >
        <TextInput
          style={[styles.textInput, { color: themeColors.text }]}
          value={value}
          onChangeText={onChangeValue}
          placeholder={placeholder || (tipo === 'producto' ? '01010101' : 'H87')}
          placeholderTextColor={themeColors.textSecondary}
          editable={!disabled}
          autoCapitalize="characters"
        />
        <TouchableOpacity
          onPress={() => {
            if (!disabled) {
              setSearchQuery('');
              setSelectedCategory('TODOS');
              setModalVisible(true);
            }
          }}
          style={styles.searchIconBtn}
        >
          <Ionicons name="search" size={14} color="#0284c7" />
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Mini Tooltip / Descripción amigable del código seleccionado */}
      {!!descripcionActual && descripcionActual !== value && (
        <Text
          numberOfLines={1}
          style={{
            fontSize: 9,
            color: '#0284c7',
            marginTop: 2,
            fontWeight: '600',
          }}
        >
          {descripcionActual}
        </Text>
      )}

      {/* ────────────────── MODAL DE BÚSQUEDA INTERACTIVA DEL SAT ────────────────── */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        statusBarTranslucent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>

          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: themeColors.backgroundElement,
                borderColor: themeColors.border,
              },
            ]}
          >
            {/* Header del Modal */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <View style={[styles.headerIconCircle, { backgroundColor: scheme === 'dark' ? '#082f49' : '#e0f2fe' }]}>
                  <Ionicons
                    name={tipo === 'producto' ? 'pricetag-outline' : 'cube-outline'}
                    size={20}
                    color="#0284c7"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                    {tipo === 'producto'
                      ? 'Catálogo Completo SAT (52,000+ Claves)'
                      : 'Catálogo de Unidades SAT (2,400+ Unidades)'}
                  </Text>
                  <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 1 }}>
                    {tipo === 'producto'
                      ? 'Búsqueda en tiempo real por clave oficial (8 dígitos) o cualquier palabra descriptiva'
                      : 'Búsqueda por código de unidad (H87, E48, etc.) o nombre comercial'}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={[styles.closeBtn, { backgroundColor: scheme === 'dark' ? '#334155' : '#f1f5f9' }]}
              >
                <Ionicons name="close" size={18} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            {/* Barra de Búsqueda Interactiva */}
            <View
              style={[
                styles.searchBar,
                {
                  borderColor: '#0284c7',
                  backgroundColor: scheme === 'dark' ? '#0f172a' : '#ffffff',
                },
              ]}
            >
              <Ionicons name="search" size={18} color="#0284c7" />
              <TextInput
                style={[styles.searchInput, { color: themeColors.text }]}
                placeholder={
                  tipo === 'producto'
                    ? 'Buscar en 52,000+ claves (ej. 4322, GPS, Instalación, Software, Tornillo, Flete)...'
                    : 'Buscar en 2,400+ unidades (ej. H87, Pieza, Servicio, KGM, LTR, EA)...'
                }
                placeholderTextColor={themeColors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus={true}
                clearButtonMode="while-editing"
              />
              {isSearchingApi ? (
                <ActivityIndicator size="small" color="#0284c7" />
              ) : !!searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                  <Ionicons name="close-circle" size={18} color={themeColors.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Filtro de Categorías (Para Productos/Servicios) */}
            {tipo === 'producto' && !searchQuery.trim() && (
              <View style={{ marginBottom: 10 }}>
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  data={categoriasProductos}
                  keyExtractor={item => item}
                  contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
                  renderItem={({ item }) => {
                    const isSelected = selectedCategory === item;
                    return (
                      <TouchableOpacity
                        onPress={() => setSelectedCategory(item)}
                        style={[
                          styles.categoryChip,
                          {
                            backgroundColor: isSelected
                              ? '#0284c7'
                              : scheme === 'dark'
                              ? '#1e293b'
                              : '#f1f5f9',
                            borderColor: isSelected ? '#0284c7' : themeColors.border,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: isSelected ? '700' : '500',
                            color: isSelected ? '#ffffff' : themeColors.text,
                          }}
                        >
                          {item}
                        </Text>
                      </TouchableOpacity>
                    );
                  }}
                />
              </View>
            )}

            {/* Opción de Asignar Valor Manual Escrito si no existe */}
            {isCustomCode && searchQuery.trim().length >= 2 && (
              <TouchableOpacity
                onPress={() => handleSelect(searchQuery.trim().toUpperCase())}
                style={[
                  styles.customCodeOption,
                  {
                    backgroundColor: scheme === 'dark' ? '#0f2b48' : '#e0f2fe',
                    borderColor: '#0284c7',
                  },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#0284c7" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#0284c7' }}>
                      Usar Clave Escrita: "{searchQuery.trim().toUpperCase()}"
                    </Text>
                    <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                      Asignar este código directamente para el timbrado de la partida.
                    </Text>
                  </View>
                </View>
                <Ionicons name="arrow-forward" size={16} color="#0284c7" />
              </TouchableOpacity>
            )}

            {/* Lista de Resultados del Catálogo Completo */}
            <FlatList
              data={resultados as any[]}
              keyExtractor={(item: any, idx: number) => item.clave || String(idx)}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingVertical: 4, gap: 6 }}
              keyboardShouldPersistTaps="always"
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="information-circle-outline" size={32} color={themeColors.textSecondary} />
                  <Text style={[styles.emptyText, { color: themeColors.text }]}>
                    No se encontraron coincidencias para "{searchQuery}"
                  </Text>
                  <Text style={{ fontSize: 12, color: themeColors.textSecondary, textAlign: 'center', marginTop: 4 }}>
                    Puedes hacer clic arriba en "Usar Clave Escrita" para asignarla directamente.
                  </Text>
                </View>
              }
              renderItem={({ item }: { item: any }) => {
                const isSelected = (value || '').toUpperCase() === (item.clave || '').toUpperCase();

                if (tipo === 'producto') {
                  return (
                    <TouchableOpacity
                      onPress={() => handleSelect(item.clave)}
                      style={[
                        styles.itemCard,
                        {
                          backgroundColor: isSelected
                            ? scheme === 'dark'
                              ? '#082f49'
                              : '#e0f2fe'
                            : scheme === 'dark'
                            ? '#0f172a'
                            : '#ffffff',
                          borderColor: isSelected ? '#0284c7' : themeColors.border,
                        },
                      ]}
                    >
                      <View style={styles.itemCodeRow}>
                        <View style={[styles.codeBadge, { backgroundColor: '#0284c7' }]}>
                          <Text style={styles.codeBadgeText}>{item.clave}</Text>
                        </View>
                        {item.categoria && (
                          <View style={[styles.categoryBadge, { backgroundColor: scheme === 'dark' ? '#1e293b' : '#f1f5f9' }]}>
                            <Text style={{ fontSize: 10, color: themeColors.textSecondary, fontWeight: '600' }}>
                              {item.categoria}
                            </Text>
                          </View>
                        )}
                        {item.palabrasSimilares ? (
                          <Text numberOfLines={1} style={{ fontSize: 10, color: themeColors.textSecondary, flex: 1, textAlign: 'right' }}>
                            {item.palabrasSimilares}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={[styles.itemDesc, { color: themeColors.text }]}>
                        {item.descripcion}
                      </Text>
                    </TouchableOpacity>
                  );
                } else {
                  return (
                    <TouchableOpacity
                      onPress={() => handleSelect(item.clave)}
                      style={[
                        styles.itemCard,
                        {
                          backgroundColor: isSelected
                            ? scheme === 'dark'
                              ? '#082f49'
                              : '#e0f2fe'
                            : scheme === 'dark'
                            ? '#0f172a'
                            : '#ffffff',
                          borderColor: isSelected ? '#0284c7' : themeColors.border,
                        },
                      ]}
                    >
                      <View style={styles.itemCodeRow}>
                        <View style={[styles.codeBadge, { backgroundColor: '#0284c7' }]}>
                          <Text style={styles.codeBadgeText}>{item.clave}</Text>
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text }}>
                          {item.nombre}
                        </Text>
                        {item.simbolo && (
                          <View style={[styles.categoryBadge, { backgroundColor: scheme === 'dark' ? '#1e293b' : '#f1f5f9', marginLeft: 'auto' }]}>
                            <Text style={{ fontSize: 10, color: themeColors.textSecondary, fontWeight: '600' }}>
                              {item.simbolo}
                            </Text>
                          </View>
                        )}
                      </View>
                      {item.descripcion && (
                        <Text style={[styles.itemDesc, { color: themeColors.textSecondary, marginTop: 4 }]}>
                          {item.descripcion}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                }
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 12,
    paddingVertical: 0,
    fontWeight: '600',
  },
  searchIconBtn: {
    padding: 4,
    marginLeft: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 640,
    height: '84%',
    maxHeight: 680,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
  },
  customCodeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  itemCard: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  itemCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  codeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  codeBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  itemDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 8,
    textAlign: 'center',
  },
});
