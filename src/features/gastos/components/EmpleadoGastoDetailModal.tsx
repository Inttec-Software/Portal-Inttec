import React from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing } from '@/constants/theme';
import { GastoHelper } from '@/services/supabase';
import CustomButton from '@/components/CustomButton';
import GastoFotosGallery from '@/components/GastoFotosGallery';
import { styles } from './empleadoGastosStyles';
import { useEmpleadoGastos } from '../hooks/useEmpleadoGastos';

interface EmpleadoGastoDetailModalProps {
  emp: ReturnType<typeof useEmpleadoGastos>;
  themeColors: any;
}

export default function EmpleadoGastoDetailModal({ emp, themeColors }: EmpleadoGastoDetailModalProps) {
  const {
    router,
    modalVisible,
    setModalVisible,
    selectedGasto,
    setSelectedGasto,
    setRespondFeedback,
    setActivePreviewUrl,
    setViewerInitialIndex,
    setViewerVisible,
    formatCurrency,
    formatFriendlyDate,
    parseJustificacion,
  } = emp;

  return (
    <Modal
      statusBarTranslucent={true}
      animationType="slide"
      transparent={true}
      visible={modalVisible}
      onRequestClose={() => setModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>Detalle del Gasto</Text>
            <TouchableOpacity
              onPress={() => {
                setModalVisible(false);
                setSelectedGasto(null);
                setRespondFeedback('');
              }}
            >
              <Ionicons name="close" size={24} color={themeColors.text} />
            </TouchableOpacity>
          </View>

          {selectedGasto && (
            <ScrollView contentContainerStyle={styles.modalScroll}>
              {/* Evidencia Imagen */}
              <GastoFotosGallery
                gasto={selectedGasto}
                themeColors={themeColors}
                onPhotoPress={(url, index) => {
                  setActivePreviewUrl(url);
                  setViewerInitialIndex(index);
                  setViewerVisible(true);
                }}
              />

              <View style={styles.modalDetails}>
                <View style={styles.detailItem}>
                  <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Monto</Text>
                  <Text style={[styles.detailValue, { color: themeColors.text, fontSize: 20, fontWeight: '800' }]}>
                    {formatCurrency(selectedGasto.monto)}
                  </Text>
                </View>

                <View style={styles.detailItem}>
                  <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Proveedor</Text>
                  <Text style={[styles.detailValue, { color: themeColors.text }]}>
                    {GastoHelper.getProveedor(selectedGasto) || 'N/A'}
                  </Text>
                </View>

                <View style={styles.detailItem}>
                  <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Fecha de Gasto</Text>
                  <Text style={[styles.detailValue, { color: themeColors.text }]}>
                    {formatFriendlyDate(selectedGasto.fecha_comprobante || selectedGasto.created_at?.split('T')[0])}
                  </Text>
                </View>

                <View style={styles.detailItem}>
                  <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Categoría / Subcategoría</Text>
                  <Text style={[styles.detailValue, { color: themeColors.text }]}>
                    {GastoHelper.getCategoria(selectedGasto) || 'Sin Categoría'} {GastoHelper.getSubcategoria(selectedGasto) ? ` > ${GastoHelper.getSubcategoria(selectedGasto)}` : ''}
                  </Text>
                </View>

                <View style={styles.detailItem}>
                  <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Método de Pago</Text>
                  <Text style={[styles.detailValue, { color: themeColors.text }]}>
                    {selectedGasto.metodo_pago === 'transferencia'
                      ? 'Transferencia'
                      : selectedGasto.metodo_pago === 'efectivo'
                      ? 'Efectivo'
                      : selectedGasto.metodo_pago === 'monedero_electronico'
                      ? 'Monedero Electrónico'
                      : selectedGasto.metodo_pago === 'tarjeta_debito'
                      ? 'Tarjeta Débito'
                      : selectedGasto.metodo_pago === 'tarjeta_credito'
                      ? 'Tarjeta Crédito'
                      : (selectedGasto.metodo_pago || 'No especificado')}{' '}
                    {selectedGasto.tipo_tarjeta ? `(${selectedGasto.tipo_tarjeta})` : ''}
                  </Text>
                </View>

                {/* Parsear justificación para ver si hay alerta de IA */}
                {(() => {
                  const parsed = parseJustificacion(selectedGasto.justificacion);
                  return (
                    <>
                      {parsed.alerta && (
                        <View style={[styles.alertBanner, { backgroundColor: themeColors.danger + '15', borderColor: themeColors.danger, marginBottom: Spacing.two }]}>
                          <Ionicons name="warning-outline" size={22} color={themeColors.danger} style={{ marginTop: 2 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.alertTitle, { color: themeColors.danger }]}>Alerta de Políticas de Gasto</Text>
                            <Text style={[styles.alertText, { color: themeColors.text }]}>{parsed.alerta}</Text>
                          </View>
                        </View>
                      )}
                      <View style={styles.detailItem}>
                        <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Comentarios</Text>
                        <Text style={[styles.detailValue, { color: themeColors.text }]}>
                          {parsed.justificacion || 'No especificada'}
                        </Text>
                      </View>
                    </>
                  );
                })()}

                {(selectedGasto.tipo_servicio_proyecto || selectedGasto.detalle_servicio_proyecto) && (
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Servicio / Proyecto</Text>
                    <Text style={[styles.detailValue, { color: themeColors.text }]}>
                      {selectedGasto.tipo_servicio_proyecto ? `Tipo: ${selectedGasto.tipo_servicio_proyecto}` : ''}
                      {selectedGasto.detalle_servicio_proyecto ? `\nDetalle: ${selectedGasto.detalle_servicio_proyecto}` : ''}
                    </Text>
                  </View>
                )}

                <View style={styles.detailItem}>
                  <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Sucursal / Cliente</Text>
                  <Text style={[styles.detailValue, { color: themeColors.text }]}>
                    {GastoHelper.getSucursal(selectedGasto) ? `Sucursal: ${GastoHelper.getSucursal(selectedGasto)}` : ''}
                    {GastoHelper.getCliente(selectedGasto) ? `${GastoHelper.getSucursal(selectedGasto) ? ' | ' : ''}Cliente: ${GastoHelper.getCliente(selectedGasto)}` : ''}
                    {!GastoHelper.getSucursal(selectedGasto) && !GastoHelper.getCliente(selectedGasto) ? 'N/A' : ''}
                  </Text>
                </View>

                <View style={styles.detailItem}>
                  <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Facturación</Text>
                  <Text style={[styles.detailValue, { color: themeColors.text }]}>
                    {selectedGasto.facturado ? 'Sí, Facturado' : 'No Facturado'}
                  </Text>
                </View>

                {selectedGasto.facturado ? (
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>
                      Facturas Adjuntas ({GastoHelper.getFacturaUrls(selectedGasto).length})
                    </Text>
                    {(() => {
                      const urls = GastoHelper.getFacturaUrls(selectedGasto);
                      if (urls.length > 0) {
                        return (
                          <View style={{ gap: 6, marginTop: 4 }}>
                            {urls.map((url, idx) => (
                              <TouchableOpacity
                                key={idx}
                                style={[styles.invoiceLinkBtn, { backgroundColor: themeColors.accent + '15' }]}
                                onPress={() => {
                                  if (url.toLowerCase().includes('.pdf')) {
                                    Linking.openURL(url).catch(() => {
                                      Alert.alert('Error', 'No se pudo abrir el archivo PDF.');
                                    });
                                  } else {
                                    setActivePreviewUrl(url);
                                    setViewerVisible(true);
                                  }
                                }}
                              >
                                <Ionicons name={url.toLowerCase().includes('.pdf') ? 'document-text-outline' : 'image-outline'} size={18} color={themeColors.accent} />
                                <Text style={[styles.invoiceLinkText, { color: themeColors.accent }]}>
                                  {urls.length > 1 ? `Ver Factura #${idx + 1}` : 'Ver Factura'}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        );
                      } else if (selectedGasto.isOffline && (selectedGasto as any).base64Factura) {
                        return (
                          <TouchableOpacity
                            style={[styles.invoiceLinkBtn, { backgroundColor: themeColors.accent + '15' }]}
                            onPress={() => {
                              const imgUrl = `data:image/jpeg;base64,${(selectedGasto as any).base64Factura}`;
                              setActivePreviewUrl(imgUrl);
                              setViewerVisible(true);
                            }}
                          >
                            <Ionicons name="image" size={18} color={themeColors.accent} />
                            <Text style={[styles.invoiceLinkText, { color: themeColors.accent }]}>Ver Factura (Offline)</Text>
                          </TouchableOpacity>
                        );
                      } else {
                        return (
                          <Text style={[styles.detailValue, { color: themeColors.textSecondary }]}>Sin archivo adjunto</Text>
                        );
                      }
                    })()}
                  </View>
                ) : (
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Motivo de No Factura</Text>
                    <Text style={[styles.detailValue, { color: themeColors.text, fontStyle: 'italic' }]}>
                      {selectedGasto.motivo_sin_factura || 'No especificado'}
                    </Text>
                  </View>
                )}

                {/* Sección Action Required */}
                {selectedGasto.status === 'ACTION_REQUIRED' && (
                  <View style={[styles.actionRequiredBox, { borderColor: themeColors.actionRequired }]}>
                    <View style={styles.actionRequiredHeader}>
                      <Ionicons name="alert-circle" size={20} color={themeColors.actionRequired} />
                      <Text style={[styles.actionRequiredTitle, { color: themeColors.actionRequired }]}>
                        ACCIÓN REQUERIDA (Observación del Admin)
                      </Text>
                    </View>
                    <Text style={[styles.observationText, { color: themeColors.text }]}>
                      {`"${selectedGasto.rejection_feedback}"`}
                    </Text>

                    <View style={styles.responseForm}>
                      <CustomButton
                        title="Editar Gasto"
                        onPress={() => {
                          setModalVisible(false);
                          router.push(`/(empleado)/editar-gasto?id=${selectedGasto.id}` as any);
                        }}
                        variant="primary"
                      />
                    </View>
                  </View>
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
