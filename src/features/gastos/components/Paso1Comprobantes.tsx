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
import { Spacing } from '@/constants/theme';
import CustomInput from '@/components/CustomInput';
import CustomButton from '@/components/CustomButton';
import { styles } from './gastoFormStyles';
import { useGastoForm } from '../hooks/useGastoForm';

interface Paso1ComprobantesProps {
  form: ReturnType<typeof useGastoForm>;
  themeColors: any;
}

export default function Paso1Comprobantes({ form, themeColors }: Paso1ComprobantesProps) {
  const {
    mode,
    currentUser,
    ticketFiles,
    activeTicketIndex,
    setActiveTicketIndex,
    imageUri,
    setImageUri,
    setImageBase64,
    imageExt,
    setImageExt,
    setActivePreviewUrl,
    setViewerInitialIndex,
    setViewerVisible,
    setAlertaPolitica,
    handleCapturePhoto,
    handleSelectGallery,
    handleRemoveTicket,
    handleClearAllTickets,
    handleSelectDocument,
    esComida,
    setEsComida,
    incluyePropina,
    setIncluyePropina,
    montoPropina,
    setMontoPropina,
    allUsers,
    selectedEmpleados,
    setSelectedEmpleados,
    showEmpList,
    setShowEmpList,
    nextStep,
  } = form;

  return (
    <View style={styles.stepContainer}>
      <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
        1. Sube tu Ticket de Gasto
      </Text>

      <View style={[styles.imageCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
        {(ticketFiles.length > 0 || imageUri) ? (
          <View style={styles.previewContainer}>
            <TouchableOpacity
              style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}
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
              activeOpacity={(ticketFiles[activeTicketIndex]?.ext || imageExt) === 'pdf' ? 1 : 0.7}
            >
              {(ticketFiles[activeTicketIndex]?.ext || imageExt) === 'pdf' ? (
                <View style={[styles.previewImage, { justifyContent: 'center', alignItems: 'center', backgroundColor: themeColors.backgroundElement }]}>
                  <Ionicons name="document-text" size={64} color={themeColors.danger} />
                  <Text style={{ color: themeColors.text, marginTop: Spacing.one, fontWeight: '500' }}>Documento PDF</Text>
                </View>
              ) : (
                <Image
                  source={{ uri: ticketFiles[activeTicketIndex]?.uri || ticketFiles[0]?.uri || imageUri! }}
                  style={[styles.previewImage, { width: '100%', height: '100%' }]}
                  resizeMode="contain"
                />
              )}
              {(ticketFiles[activeTicketIndex]?.ext || imageExt) !== 'pdf' && (
                <View style={styles.zoomBadgeOverlay}>
                  <Ionicons name="scan-outline" size={13} color="#ffffff" />
                  <Text style={styles.zoomBadgeOverlayText}>
                    {ticketFiles.length > 1 ? `Toca para ampliar (${activeTicketIndex + 1}/${ticketFiles.length})` : 'Toca para ampliar'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.removeImageBtn}
              onPress={() => {
                if (ticketFiles.length > 0) {
                  handleRemoveTicket(activeTicketIndex);
                } else {
                  setImageUri(null);
                  setImageBase64(null);
                  if (mode === 'edit') setImageExt('jpg');
                  setAlertaPolitica(null);
                  setIncluyePropina(null);
                  setMontoPropina('');
                }
              }}
            >
              <Ionicons name="trash" size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.uploadPlaceholder}>
            <Ionicons name="receipt-outline" size={64} color={themeColors.textSecondary} />
            <Text style={[styles.placeholderText, { color: themeColors.textSecondary }]}>
              {mode === 'create' ? 'Captura el comprobante (1 o varias fotos)' : 'Sin comprobante adjunto'}
            </Text>
          </View>
        )}
      </View>

      {/* Tira de miniaturas si hay más de 1 foto */}
      {ticketFiles.length > 1 && (
        <View style={{ marginTop: Spacing.one }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
            {ticketFiles.map((file, idx) => {
              const isSelected = idx === activeTicketIndex;
              return (
                <TouchableOpacity
                  key={idx}
                  onPress={() => {
                    setActiveTicketIndex(idx);
                    setImageUri(file.uri);
                    setImageBase64(file.base64 || null);
                    setImageExt(file.ext);
                  }}
                  style={{
                    width: 62,
                    height: 62,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: isSelected ? themeColors.accent : themeColors.border,
                    overflow: 'hidden',
                    position: 'relative',
                    backgroundColor: themeColors.backgroundElement,
                  }}
                >
                  {file.ext === 'pdf' ? (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name="document-text" size={22} color={themeColors.danger} />
                    </View>
                  ) : (
                    <Image source={{ uri: file.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  )}
                  <View
                    style={{
                      position: 'absolute',
                      bottom: 2,
                      left: 2,
                      backgroundColor: 'rgba(0,0,0,0.65)',
                      borderRadius: 4,
                      paddingHorizontal: 4,
                      paddingVertical: 1,
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>#{idx + 1}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleRemoveTicket(idx)}
                    style={{
                      position: 'absolute',
                      top: 2,
                      right: 2,
                      backgroundColor: 'rgba(239,68,68,0.85)',
                      borderRadius: 8,
                      width: 16,
                      height: 16,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Ionicons name="close" size={10} color="#fff" />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      <View style={{ flexDirection: 'column', gap: Spacing.one, marginTop: Spacing.two }}>
        <View style={{ flexDirection: 'row', gap: Spacing.one }}>
          <TouchableOpacity
            style={[{ flex: 1, backgroundColor: themeColors.primary, borderRadius: 16, height: 75, justifyContent: 'center', alignItems: 'center', shadowColor: themeColors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 }]}
            onPress={handleCapturePhoto}
          >
            <Ionicons name="camera" size={28} color="#ffffff" />
            <Text style={{ color: '#ffffff', marginTop: 4, fontWeight: '700', fontSize: 13 }}>
              {ticketFiles.length > 0 ? '+ Otra Foto' : 'Cámara'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[{ flex: 1, backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, borderWidth: 1, borderRadius: 16, height: 75, justifyContent: 'center', alignItems: 'center' }]}
            onPress={handleSelectGallery}
          >
            <Ionicons name="images" size={28} color={themeColors.text} />
            <Text style={{ color: themeColors.text, marginTop: 4, fontWeight: '700', fontSize: 13 }}>
              {ticketFiles.length > 0 ? '+ De Galería' : 'Galería'}
            </Text>
          </TouchableOpacity>
        </View>
        {mode === 'edit' && (
          <TouchableOpacity
            style={[{ width: '100%', backgroundColor: themeColors.backgroundElement, borderColor: themeColors.primary, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 16, height: 60, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 10 }]}
            onPress={handleSelectDocument}
          >
            <Ionicons name="document-text" size={24} color={themeColors.primary} />
            <Text style={{ color: themeColors.primary, fontWeight: '700', fontSize: 14 }}>Subir Documento (PDF o Imagen)</Text>
          </TouchableOpacity>
        )}
        {ticketFiles.length > 1 && (
          <TouchableOpacity
            style={{ alignSelf: 'center', paddingVertical: 4 }}
            onPress={handleClearAllTickets}
          >
            <Text style={{ color: themeColors.danger, fontSize: 12, fontWeight: '600' }}>
              Eliminar todas las fotos ({ticketFiles.length})
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Pregunta si es Comida */}
      <View style={[styles.innerCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, marginTop: Spacing.two, marginBottom: Spacing.one }]}>
        <Text style={[styles.selectorLabel, { color: themeColors.text, fontSize: 13, marginBottom: Spacing.one }]}>
          ¿Este gasto es de una comida (Alimentos)? *
        </Text>
        <View style={styles.paymentSelector}>
          <TouchableOpacity
            onPress={() => {
              setEsComida(true);
            }}
            style={[
              styles.paymentOption,
              {
                backgroundColor: esComida ? themeColors.accent : themeColors.backgroundElement,
                borderColor: esComida ? 'transparent' : themeColors.border,
                flex: 1,
                alignItems: 'center',
                paddingVertical: Spacing.one,
              },
            ]}
          >
            <Text style={[styles.paymentOptionText, { color: esComida ? '#ffffff' : themeColors.text, fontSize: 12 }]}>
              Sí
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setEsComida(false);
              setIncluyePropina(null);
              setMontoPropina('');
              setSelectedEmpleados([]);
            }}
            style={[
              styles.paymentOption,
              {
                backgroundColor: !esComida ? themeColors.accent : themeColors.backgroundElement,
                borderColor: !esComida ? 'transparent' : themeColors.border,
                flex: 1,
                alignItems: 'center',
                paddingVertical: Spacing.one,
              },
            ]}
          >
            <Text style={[styles.paymentOptionText, { color: !esComida ? '#ffffff' : themeColors.text, fontSize: 12 }]}>
              No
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {esComida && (
        <View style={[styles.customDropdownContainer, { marginTop: Spacing.two, zIndex: 50 }]}>
          <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>
            ¿Con cuántos empleados compartiste este consumo?
          </Text>
          <TouchableOpacity
            style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
            onPress={() => {
              Keyboard.dismiss();
              setShowEmpList(!showEmpList);
            }}
          >
            <Text style={{ color: selectedEmpleados.length > 0 ? themeColors.text : themeColors.textSecondary }}>
              {selectedEmpleados.length === 0
                ? 'Solo yo (1 persona)'
                : `Yo + ${selectedEmpleados.length} empleado(s) (${1 + selectedEmpleados.length} personas)`
              }
            </Text>
            <Ionicons name={showEmpList ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
          </TouchableOpacity>

          {showEmpList && (
            <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', zIndex: 1000 }}>
              <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                  {allUsers
                    .filter(u => u.id !== currentUser?.id)
                    .map((user, index, array) => {
                      const isSelected = selectedEmpleados.some(e => e.id === user.id);
                      return (
                        <TouchableOpacity
                          key={user.id}
                          style={[
                            styles.dropdownItem,
                            index === array.length - 1 && { borderBottomWidth: 0 },
                            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.one }
                          ]}
                          onPress={() => {
                            if (isSelected) {
                              setSelectedEmpleados(prev => prev.filter(e => e.id !== user.id));
                            } else {
                              setSelectedEmpleados(prev => [...prev, user]);
                            }
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.one }}>
                            <Ionicons name="person-add-outline" size={24} color={themeColors.primary} />
                            <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 14 }}>{user.nombre}</Text>
                          </View>
                          <Ionicons
                            name={isSelected ? 'checkbox-outline' : 'square-outline'}
                            size={24}
                            color={isSelected ? themeColors.accent : themeColors.textSecondary}
                          />
                        </TouchableOpacity>
                      );
                    })}
                </ScrollView>
              </View>
            </Pressable>
          )}
        </View>
      )}

      {imageUri && esComida && (
        <View style={[styles.innerCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, marginBottom: Spacing.two }]}>
          <Text style={[styles.selectorLabel, { color: themeColors.text, fontSize: 13, marginBottom: Spacing.one }]}>
            ¿El ticket incluye propina? *
          </Text>
          <View style={styles.paymentSelector}>
            <TouchableOpacity
              onPress={() => {
                setIncluyePropina(true);
                setMontoPropina('');
              }}
              style={[
                styles.paymentOption,
                {
                  backgroundColor: incluyePropina === true ? themeColors.accent : themeColors.backgroundElement,
                  borderColor: incluyePropina === true ? 'transparent' : themeColors.border,
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: Spacing.one,
                },
              ]}
            >
              <Text style={[styles.paymentOptionText, { color: incluyePropina === true ? '#ffffff' : themeColors.text, fontSize: 12 }]}>
                No
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setIncluyePropina(false);
              }}
              style={[
                styles.paymentOption,
                {
                  backgroundColor: incluyePropina === false ? themeColors.accent : themeColors.backgroundElement,
                  borderColor: incluyePropina === false ? 'transparent' : themeColors.border,
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: Spacing.one,
                },
              ]}
            >
              <Text style={[styles.paymentOptionText, { color: incluyePropina === false ? '#ffffff' : themeColors.text, fontSize: 12 }]}>
                Sí
              </Text>
            </TouchableOpacity>
          </View>

          {incluyePropina === false && (
            <View style={{ marginTop: Spacing.two }}>
              <CustomInput
                label="¿Cuánto se dejó de propina adicional/aparte? ($ MXN)"
                placeholder="0.00 (dejar en 0 si no se dejó propina)"
                keyboardType="decimal-pad"
                value={montoPropina}
                onChangeText={(val) => setMontoPropina(val.replace(',', '.').replace(/[^0-9.]/g, ''))}
                iconName={mode === 'create' ? 'logo-usd' : 'cash-outline'}
              />
            </View>
          )}
        </View>
      )}

      {mode === 'create' ? (
        <View style={[styles.footerNav, { marginTop: Spacing.three }]}>
          <CustomButton title="Siguiente" onPress={nextStep} style={{ width: '100%' }} />
        </View>
      ) : (
        <View style={styles.scanWrapper}>
          <View style={styles.footerNav}>
            <View style={{ flex: 1 }} />
            <CustomButton title="Siguiente" onPress={nextStep} style={styles.navBtn} />
          </View>
        </View>
      )}
    </View>
  );
}
