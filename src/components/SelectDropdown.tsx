import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';

interface SelectDropdownProps {
  label: string;
  data: any[];
  value: string;
  onSelect: (value: string) => void;
  labelKey?: string;
  valueKey?: string;
  searchable?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

export default function SelectDropdown({
  label,
  data,
  value,
  onSelect,
  labelKey = 'nombre',
  valueKey = 'id',
  searchable = false,
  placeholder = 'Selecciona una opción...',
  disabled = false
}: SelectDropdownProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const selectedItem = data.find(item => item[valueKey] === value);
  const displayValue = selectedItem ? selectedItem[labelKey] : placeholder;

  const filteredData = searchable && searchQuery
    ? data.filter(item => 
        String(item[labelKey]).toLowerCase().includes(searchQuery.toLowerCase())
      )
    : data;

  const handleSelect = (val: string) => {
    onSelect(val);
    setModalVisible(false);
    setSearchQuery('');
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
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>{label || 'Seleccionar'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            {searchable && (
              <View style={[styles.searchContainer, { borderBottomColor: themeColors.border }]}>
                <Ionicons name="search" size={20} color={themeColors.textSecondary} style={styles.searchIcon} />
                <TextInput
                  style={[styles.searchInput, { color: themeColors.text, backgroundColor: themeColors.backgroundElement }]}
                  placeholder="Buscar..."
                  placeholderTextColor={themeColors.textSecondary}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
            )}

            <FlatList
              data={filteredData}
              keyExtractor={(item, index) => String(item[valueKey] || index)}
              renderItem={({ item }) => {
                const isSelected = item[valueKey] === value;
                return (
                  <TouchableOpacity
                    style={[styles.optionItem, { borderBottomColor: themeColors.border }]}
                    onPress={() => handleSelect(item[valueKey])}
                  >
                    <Text style={[
                      styles.optionText, 
                      { 
                        color: isSelected ? themeColors.accent : themeColors.text,
                        fontWeight: isSelected ? '600' : '400'
                      }
                    ]}>
                      {item[labelKey]}
                    </Text>
                    {isSelected && (
                      <Ionicons name="checkmark" size={20} color={themeColors.accent} />
                    )}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                  No se encontraron resultados
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
    height: '80%',
    borderTopLeftRadius: BorderRadius.large,
    borderTopRightRadius: BorderRadius.large,
    ...Platform.select({
      web: {
        width: 500,
        height: 600,
        alignSelf: 'center',
        borderRadius: BorderRadius.large,
        marginTop: 100,
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
  searchContainer: {
    padding: Spacing.four,
    borderBottomWidth: 1,
    position: 'relative',
    justifyContent: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: Spacing.four + 12,
    zIndex: 1,
  },
  searchInput: {
    height: 40,
    borderRadius: BorderRadius.medium,
    paddingLeft: 40,
    paddingRight: 12,
    fontSize: 15,
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.four,
    borderBottomWidth: 1,
  },
  optionText: {
    fontSize: 16,
    flex: 1,
  },
  emptyText: {
    textAlign: 'center',
    padding: Spacing.five,
    fontSize: 15,
  }
});
