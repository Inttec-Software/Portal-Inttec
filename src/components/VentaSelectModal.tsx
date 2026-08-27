import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  Platform,
  ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';

interface VentaSelectModalProps {
  label: string;
  data: any[];
  value: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function VentaSelectModal({
  label,
  data,
  value,
  onSelect,
  disabled = false,
  placeholder = 'Selecciona una venta...'
}: VentaSelectModalProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSucursal, setFilterSucursal] = useState('');
  const [filterFecha, setFilterFecha] = useState('');
  const [showSucursales, setShowSucursales] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const selectedItem = data.find(item => item.id === value);
  const displayValue = selectedItem 
    ? `${selectedItem.factura_referencia || 'Sin Ref'} - ${selectedItem.sucursal || 'Sin Suc'} - ${selectedItem.fecha ? new Date(selectedItem.fecha).toLocaleDateString() : ''}`
    : placeholder;

  const sucursalesUnicas = Array.from(new Set(data.map(v => v.sucursal).filter(Boolean))) as string[];

  const normalize = (str?: any) => {
    if (!str) return '';
    return String(str).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  };

  const filteredData = data.filter(item => {
    let matchSearch = true;
    if (searchQuery.trim()) {
      const q = normalize(searchQuery);
      const tokens = q.split(/\s+/).filter(Boolean);
      const combined = normalize(`${item.cliente || ''} ${item.factura_referencia || ''} ${item.sucursal || ''} ${item.fecha || ''} ${item.descripcion || ''} ${item.folio || ''}`);
      matchSearch = tokens.every(t => combined.includes(t));
    }

    let matchSucursal = true;
    if (filterSucursal) {
      matchSucursal = item.sucursal === filterSucursal;
    }

    let matchFecha = true;
    if (filterFecha) {
      matchFecha = String(item.fecha || '').includes(filterFecha);
    }

    return matchSearch && matchSucursal && matchFecha;
  });

  const handleSelect = (val: string) => {
    onSelect(val);
    setModalVisible(false);
    setSearchQuery('');
    setFilterSucursal('');
    setFilterFecha('');
  };

  return (
    <View style={styles.container}>
      {label ? <Text style={[styles.label, { color: themeColors.text }]}>{label}</Text> : null}
      
      <TouchableOpacity
        style={[
          styles.dropdownBtn, 
          { 
            backgroundColor: disabled ? themeColors.border + '50' : themeColors.backgroundElement, 
            borderColor: themeColors.border 
          }
        ]}
        onPress={() => !disabled && setModalVisible(true)}
        activeOpacity={disabled ? 1 : 0.7}
      >
        <Text style={[
          styles.dropdownBtnText, 
          { color: selectedItem ? themeColors.text : themeColors.textSecondary }
        ]} numberOfLines={1}>
          {displayValue}
        </Text>
        <Ionicons name="chevron-down" size={20} color={themeColors.textSecondary} />
      </TouchableOpacity>

      <Modal statusBarTranslucent={true}
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <SafeAreaView style={styles.modalOverlay} edges={['top', 'bottom']}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
            
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>{label || 'Seleccionar Venta'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            {/* Barra de Búsqueda y Filtros */}
            <View style={[styles.searchSection, { borderBottomColor: themeColors.border }]}>
              <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color={themeColors.textSecondary} style={styles.searchIcon} />
                <TextInput
                  style={[styles.searchInput, { color: themeColors.text, backgroundColor: themeColors.backgroundElement }]}
                  placeholder="Buscar..."
                  placeholderTextColor={themeColors.textSecondary}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>

              <View style={styles.filtersRow}>
                {/* Filtro Sucursal */}
                <View style={styles.filterGroup}>
                  <Text style={[styles.filterLabel, { color: themeColors.textSecondary }]}>Sucursal:</Text>
                  <View style={[styles.filterInputWrapper, { backgroundColor: themeColors.backgroundElement }]}>
                    {Platform.OS === 'web' ? (
                      <select 
                        style={{ 
                          border: 'none', 
                          background: 'transparent', 
                          color: themeColors.text, 
                          width: '100%', 
                          outline: 'none',
                          padding: 8
                        }}
                        value={filterSucursal}
                        onChange={(e: any) => setFilterSucursal(e.target.value)}
                      >
                        <option value="">Todas</option>
                        {sucursalesUnicas.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <View>
                        <TouchableOpacity 
                          onPress={() => setShowSucursales(!showSucursales)} 
                          style={{ padding: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                        >
                          <Text style={{ color: themeColors.text }}>{filterSucursal || 'Todas'}</Text>
                          <Ionicons name={showSucursales ? "chevron-up" : "chevron-down"} size={16} color={themeColors.textSecondary} />
                        </TouchableOpacity>
                        {showSucursales && (
                           <View style={{ backgroundColor: themeColors.background, borderTopWidth: 1, borderTopColor: themeColors.border }}>
                             <TouchableOpacity onPress={() => { setFilterSucursal(''); setShowSucursales(false); }} style={{ padding: 8 }}>
                               <Text style={{ color: themeColors.text }}>Todas</Text>
                             </TouchableOpacity>
                             {sucursalesUnicas.map(s => (
                               <TouchableOpacity key={s} onPress={() => { setFilterSucursal(s); setShowSucursales(false); }} style={{ padding: 8, borderTopWidth: 1, borderTopColor: themeColors.border }}>
                                 <Text style={{ color: themeColors.text }}>{s}</Text>
                               </TouchableOpacity>
                             ))}
                           </View>
                        )}
                      </View>
                    )}
                  </View>
                </View>

                {/* Filtro Fecha */}
                <View style={styles.filterGroup}>
                  <Text style={[styles.filterLabel, { color: themeColors.textSecondary }]}>Fecha:</Text>
                  <View style={[styles.filterInputWrapper, { backgroundColor: themeColors.backgroundElement }]}>
                    {Platform.OS === 'web' ? (
                      <input 
                        type="date"
                        onClick={(e) => (e.target as any).showPicker?.()}
                        style={{ 
                          border: 'none', 
                          background: 'transparent', 
                          color: themeColors.text, 
                          width: '100%', 
                          outline: 'none',
                          padding: 8,
                          cursor: 'pointer'
                        }}
                        value={filterFecha}
                        onChange={(e) => setFilterFecha(e.target.value)}
                      />
                    ) : (
                      <>
                        <TouchableOpacity onPress={() => setShowDatePicker(true)} style={{ padding: 8 }}>
                          <Text style={{ color: filterFecha ? themeColors.text : themeColors.textSecondary }}>
                            {filterFecha || 'YYYY-MM-DD'}
                          </Text>
                        </TouchableOpacity>
                        {showDatePicker && (
                          <DateTimePicker
                            value={filterFecha ? new Date(filterFecha + 'T12:00:00') : new Date()}
                            mode="date"
                            display="default"
                            onValueChange={(event, selectedDate) => {
                              setShowDatePicker(false);
                              if (selectedDate) {
                                const yyyy = selectedDate.getFullYear();
                                const mm = String(selectedDate.getMonth() + 1).padStart(2, '0');
                                const dd = String(selectedDate.getDate()).padStart(2, '0');
                                setFilterFecha(`${yyyy}-${mm}-${dd}`);
                              }
                            }}
                            onDismiss={() => setShowDatePicker(false)}
                          />
                        )}
                      </>
                    )}
                  </View>
                </View>
              </View>
            </View>

            <FlatList
              data={filteredData}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => {
                const isSelected = item.id === value;
                return (
                  <TouchableOpacity
                    style={[styles.optionItem, { borderBottomColor: themeColors.border }]}
                    onPress={() => handleSelect(item.id)}
                  >
                    <View style={styles.optionContent}>
                      <Text style={[
                        styles.optionTitle, 
                        { 
                          color: isSelected ? themeColors.accent : themeColors.text,
                          fontWeight: isSelected ? '600' : '500'
                        }
                      ]}>
                        Ref: {item.factura_referencia || 'Sin Referencia'}
                      </Text>
                      <View style={styles.optionDetails}>
                        <Text style={[styles.detailText, { color: themeColors.textSecondary }]}>
                          <Ionicons name="calendar-outline" size={12} /> {item.fecha ? new Date(item.fecha).toLocaleDateString() : 'N/A'}
                        </Text>
                        <Text style={[styles.detailText, { color: themeColors.textSecondary }]}>
                          <Ionicons name="business-outline" size={12} /> {item.sucursal || 'N/A'}
                        </Text>
                      </View>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark" size={20} color={themeColors.accent} />
                    )}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                  No se encontraron ventas
                </Text>
              }
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.five,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: Spacing.two,
  },
  dropdownBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 48,
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: Spacing.three,
  },
  dropdownBtnText: {
    fontSize: 15,
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    height: '90%',
    borderTopLeftRadius: BorderRadius.large,
    borderTopRightRadius: BorderRadius.large,
    ...Platform.select({
      web: {
        width: 600,
        height: 700,
        alignSelf: 'center',
        borderRadius: BorderRadius.large,
        marginTop: 50,
      }
    })
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.four,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  searchSection: {
    padding: Spacing.four,
    borderBottomWidth: 1,
  },
  searchContainer: {
    position: 'relative',
    justifyContent: 'center',
    marginBottom: Spacing.three,
  },
  searchIcon: {
    position: 'absolute',
    left: 12,
    zIndex: 1,
  },
  searchInput: {
    height: 40,
    borderRadius: BorderRadius.medium,
    paddingLeft: 40,
    paddingRight: 12,
    fontSize: 15,
  },
  filtersRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  filterGroup: {
    flex: 1,
  },
  filterLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  filterInputWrapper: {
    borderRadius: BorderRadius.medium,
    overflow: 'hidden',
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.four,
    borderBottomWidth: 1,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 15,
    marginBottom: 4,
  },
  optionDetails: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  detailText: {
    fontSize: 12,
  },
  emptyText: {
    textAlign: 'center',
    padding: Spacing.five,
    fontSize: 15,
  }
});
