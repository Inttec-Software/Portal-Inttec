import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Pressable,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, BorderRadius } from '@/constants/theme';
import { getComentariosPlaceholder, isCombustibleExpense } from '@/utils/helpers';
import CustomInput from '@/components/CustomInput';
import CustomButton from '@/components/CustomButton';
import { styles } from './gastoFormStyles';
import { useGastoForm } from '../hooks/useGastoForm';

interface Paso3CategorizacionProps {
  form: ReturnType<typeof useGastoForm>;
  themeColors: any;
}

export default function Paso3Categorizacion({ form, themeColors }: Paso3CategorizacionProps) {
  const {
    mode,
    ticketFiles,
    activeTicketIndex,
    imageUri,
    imageExt,
    setActivePreviewUrl,
    setViewerInitialIndex,
    setViewerVisible,
    alertaPolitica,
    alertaLocal,
    categorias,
    selectedCategoria,
    setSelectedCategoria,
    showCatDropdown,
    setShowCatDropdown,
    filteredSubcategorias,
    selectedSubcategoria,
    setSelectedSubcategoria,
    showSubDropdown,
    setShowSubDropdown,
    setShowCliDropdown,
    vehiculos,
    selectedVehiculoId,
    setSelectedVehiculoId,
    showVehiculoDropdown,
    setShowVehiculoDropdown,
    kilometrajeActual,
    setKilometrajeActual,
    litrosGasolina,
    setLitrosGasolina,
    justificacion,
    setJustificacion,
    isSubmitting,
    prevStep,
    handleSaveGasto,
  } = form;

  return (
    <View style={styles.stepContainer}>
      <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
        3. Categorización e Información de Negocio
      </Text>

      {(ticketFiles.length > 0 || imageUri) && (
        <TouchableOpacity
          onPress={() => {
            const currentFile = ticketFiles[activeTicketIndex] || ticketFiles[0];
            const curExt = currentFile ? currentFile.ext : imageExt;
            const curUri = currentFile ? currentFile.uri : imageUri;
            if (curExt !== 'pdf' && curUri) {
              setActivePreviewUrl(curUri);
              setViewerInitialIndex(ticketFiles.length > 0 ? activeTicketIndex : 0);
              setViewerVisible(true);
            }
          }}
          activeOpacity={0.8}
          style={[styles.floatingPreviewBanner, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
        >
          {(ticketFiles[0]?.ext === 'pdf' || (!ticketFiles.length && imageExt === 'pdf')) ? (
            <View style={styles.floatingPreviewThumb}>
              <Ionicons name="document-text" size={24} color={themeColors.danger} />
            </View>
          ) : (
            <Image source={{ uri: ticketFiles[0]?.uri || imageUri! }} style={styles.floatingPreviewThumb} resizeMode="cover" />
          )}
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.floatingPreviewTitle, { color: themeColors.text }]}>
              Ticket{ticketFiles.length > 1 ? `s (${ticketFiles.length} fotos)` : ''} Adjunto
            </Text>
            <Text style={[styles.floatingPreviewSub, { color: themeColors.textSecondary }]}>
              Toca aquí para ampliar y revisar {ticketFiles.length > 1 ? 'las fotos' : 'el ticket'}
            </Text>
          </View>
          <Ionicons name="eye-outline" size={20} color={themeColors.primary} />
        </TouchableOpacity>
      )}

      {!!(alertaPolitica || alertaLocal) && (
        <View style={[styles.alertBanner, { backgroundColor: themeColors.danger + '15', borderColor: themeColors.danger }]}>
          <Ionicons name="warning-outline" size={22} color={themeColors.danger} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.alertTitle, { color: themeColors.danger }]}>Alerta de Políticas de Gasto</Text>
            <Text style={[styles.alertText, { color: themeColors.text }]}>
              {[alertaPolitica, alertaLocal].filter(Boolean).join('\n')}
            </Text>
          </View>
        </View>
      )}

      {/* Selector de Categorías */}
      <View style={styles.customDropdownContainer}>
        <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Categoría *</Text>
        <TouchableOpacity
          style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
          onPress={() => {
            Keyboard.dismiss();
            setShowCatDropdown(!showCatDropdown);
            setShowSubDropdown(false);
            setShowCliDropdown(false);
          }}
        >
          <Text style={{ color: selectedCategoria ? themeColors.text : themeColors.textSecondary }}>
            {selectedCategoria || 'Selecciona una categoría'}
          </Text>
          <Ionicons name={showCatDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
        </TouchableOpacity>
        {showCatDropdown && (
          <View style={{ width: '100%', zIndex: 1000 }}>
            <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
              <ScrollView
                nestedScrollEnabled={true}
                style={{ maxHeight: 160, paddingHorizontal: Spacing.half }}
                keyboardShouldPersistTaps="always"
                showsVerticalScrollIndicator={true}
                bounces={false}
              >
                {categorias.map((cat, index, array) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.dropdownItem,
                      index === array.length - 1 && { borderBottomWidth: 0 },
                      { flexDirection: 'row', alignItems: 'center', gap: Spacing.one }
                    ]}
                    onPress={() => {
                      setSelectedCategoria(cat.nombre);
                      setSelectedSubcategoria('');
                      setShowCatDropdown(false);
                    }}
                  >
                    <Ionicons name="folder-open-outline" size={24} color={themeColors.primary} />
                    <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 14 }}>{cat.nombre}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        )}
      </View>

      {/* Selector de Subcategorías (Filtrado dependiente) */}
      {!!selectedCategoria && (
        <View style={styles.customDropdownContainer}>
          <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Subcategoría *</Text>
          <TouchableOpacity
            style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
            onPress={() => {
              Keyboard.dismiss();
              setShowSubDropdown(!showSubDropdown);
              setShowCatDropdown(false);
              setShowCliDropdown(false);
            }}
          >
            <Text style={{ color: selectedSubcategoria ? themeColors.text : themeColors.textSecondary }}>
              {selectedSubcategoria || 'Selecciona una subcategoría'}
            </Text>
            <Ionicons name={showSubDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
          </TouchableOpacity>
          {showSubDropdown && (
            <View style={{ width: '100%', zIndex: 1000 }}>
              <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                <ScrollView
                  nestedScrollEnabled={true}
                  style={{ maxHeight: 160, paddingHorizontal: Spacing.half }}
                  keyboardShouldPersistTaps="always"
                  showsVerticalScrollIndicator={true}
                  bounces={false}
                >
                  {filteredSubcategorias.length > 0 ? (
                    filteredSubcategorias.map((sub, index, array) => (
                      <TouchableOpacity
                        key={sub.id}
                        style={[
                          styles.dropdownItem,
                          index === array.length - 1 && { borderBottomWidth: 0 },
                          { flexDirection: 'row', alignItems: 'center', gap: Spacing.one }
                        ]}
                        onPress={() => {
                          setSelectedSubcategoria(sub.nombre);
                          setShowSubDropdown(false);
                        }}
                      >
                        <Ionicons name="pricetag-outline" size={24} color={themeColors.primary} />
                        <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 14 }}>{sub.nombre}</Text>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <Text style={{ padding: Spacing.two, color: themeColors.textSecondary, textAlign: 'center' }}>
                      {mode === 'create' ? 'No hay subcategorías' : 'Sin subcategorías para esta sección'}
                    </Text>
                  )}
                </ScrollView>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Información de Gasolina / Combustible (Solo en modo create y si es gasto de combustible) */}
      {mode === 'create' && isCombustibleExpense(selectedCategoria, selectedSubcategoria) && (
        <View style={{
          padding: Spacing.three,
          borderRadius: BorderRadius.medium,
          backgroundColor: themeColors.primary + '08',
          borderColor: themeColors.primary + '20',
          borderWidth: 1,
          marginBottom: Spacing.three,
        }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.primary, marginBottom: Spacing.two }}>
            Detalles de Combustible / Bitácora
          </Text>

          {/* Selector de Vehículo */}
          <View style={styles.customDropdownContainer}>
            <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Vehículo *</Text>
            <TouchableOpacity
              style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
              onPress={() => {
                Keyboard.dismiss();
                setShowVehiculoDropdown(!showVehiculoDropdown);
                setShowCatDropdown(false);
                setShowSubDropdown(false);
                setShowCliDropdown(false);
              }}
            >
              <Text style={{ color: selectedVehiculoId ? themeColors.text : themeColors.textSecondary }}>
                {vehiculos.find(v => v.id === selectedVehiculoId)
                  ? `${vehiculos.find(v => v.id === selectedVehiculoId)?.marca} ${vehiculos.find(v => v.id === selectedVehiculoId)?.modelo} (${vehiculos.find(v => v.id === selectedVehiculoId)?.placas})`
                  : 'Selecciona un vehículo'}
              </Text>
              <Ionicons name={showVehiculoDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
            </TouchableOpacity>
            {showVehiculoDropdown && (
              <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', zIndex: 1001 }}>
                <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                  <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 150 }} keyboardShouldPersistTaps="handled">
                    {vehiculos.map((veh, index, array) => (
                      <TouchableOpacity
                        key={veh.id}
                        style={[
                          styles.dropdownItem,
                          index === array.length - 1 && { borderBottomWidth: 0 },
                          { flexDirection: 'row', alignItems: 'center', gap: Spacing.one }
                        ]}
                        onPress={() => {
                          setSelectedVehiculoId(veh.id);
                          setShowVehiculoDropdown(false);
                        }}
                      >
                        <Ionicons name="car-outline" size={24} color={themeColors.primary} />
                        <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 13 }}>
                          {veh.marca} {veh.modelo} - {veh.placas}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    {vehiculos.length === 0 && (
                      <Text style={{ padding: Spacing.two, color: themeColors.textSecondary, textAlign: 'center' }}>
                        No hay vehículos registrados.
                      </Text>
                    )}
                  </ScrollView>
                </View>
              </Pressable>
            )}
          </View>

          {/* Kilometraje Actual */}
          <CustomInput
            label="Kilometraje Actual (Odómetro) *"
            placeholder="Ej. 142500"
            value={kilometrajeActual}
            onChangeText={setKilometrajeActual}
            keyboardType="numeric"
          />

          {/* Litros de Gasolina */}
          <CustomInput
            label="Litros Cargados *"
            placeholder="Ej. 45.5"
            value={litrosGasolina}
            onChangeText={(val) => setLitrosGasolina(val.replace(',', '.'))}
            keyboardType="decimal-pad"
          />
        </View>
      )}

      <CustomInput
        label="Comentarios *"
        placeholder={getComentariosPlaceholder(selectedCategoria, selectedSubcategoria)}
        value={justificacion}
        onChangeText={setJustificacion}
        multiline
        numberOfLines={4}
        style={{ height: 90 }}
        iconName="document-text-outline"
      />

      <View style={styles.footerNav}>
        <CustomButton
          title="Atrás"
          onPress={prevStep}
          variant="secondary"
          style={styles.navBtn}
          disabled={isSubmitting}
        />
        <CustomButton
          title="Guardar Gasto"
          onPress={handleSaveGasto}
          loading={isSubmitting}
          style={styles.navBtn}
        />
      </View>
    </View>
  );
}
