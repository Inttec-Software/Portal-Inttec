import React from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, BorderRadius } from '@/constants/theme';
import { GastoHelper } from '@/services/supabase';
import CustomButton from '@/components/CustomButton';
import CustomInput from '@/components/CustomInput';
import GastoFotosGallery from '@/components/GastoFotosGallery';
import { styles } from './adminGastosStyles';
import { useAdminGastos } from '../hooks/useAdminGastos';

interface AdminGastoReviewModalProps {
  vm: ReturnType<typeof useAdminGastos>;
}

export function AdminGastoReviewModal({ vm }: AdminGastoReviewModalProps) {
  const {
    router,
    themeColors,
    adminUser,
    selectedGasto,
    setSelectedGasto,
    reviewModalVisible,
    setReviewModalVisible,
    rejectionFeedback,
    setRejectionFeedback,
    showFeedbackInput,
    setShowFeedbackInput,
    feedbackActionType,
    setFeedbackActionType,
    isProcessingAction,
    setViewerVisible,
    setViewerInitialIndex,
    setActivePreviewUrl,
    isUploadingInvoice,
    localMotivo,
    setLocalMotivo,
    isUpdatingEstadoReembolso,
    isSavingQuickProv,
    handleUpdateStatus,
    handleApproveClick,
    handleOpenRelinkSaleModal,
    handleDirectUnlinkSale,
    handleOpenQuickEditProveedor,
    handleQuickCreateProveedorAndAssign,
    handleOpenQuickEditField,
    handleCaptureAdminInvoice,
    handleSelectAdminInvoiceDocument,
    handleDeleteAdminInvoice,
    handleToggleAdminFacturado,
    handleSetPendienteEntrega,
    handleUpdateEstadoReembolso,
    handleUpdateAdminMotivoSinFactura,
    handleDeleteGasto,
    formatCurrency,
    formatFriendlyDate,
    parseJustificacion,
  } = vm;

  return (
    <Modal statusBarTranslucent={true}
      animationType="slide"
      transparent={true}
      visible={reviewModalVisible}
      onRequestClose={() => {
        setReviewModalVisible(false);
        setSelectedGasto(null);
        setRejectionFeedback('');
        setShowFeedbackInput(false);
      }}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>Revisión de Gasto</Text>
            <TouchableOpacity
              onPress={() => {
                setReviewModalVisible(false);
                setSelectedGasto(null);
                setRejectionFeedback('');
                setShowFeedbackInput(false);
              }}
            >
              <Ionicons name="close" size={24} color={themeColors.text} />
            </TouchableOpacity>
          </View>

          {selectedGasto && (
            <ScrollView contentContainerStyle={styles.modalScroll}>
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
                {/* Monto */}
                <View style={[styles.detailItem, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                  <View style={{ flex: 1, marginRight: Spacing.two }}>
                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Monto</Text>
                    <Text style={[styles.detailValue, { color: themeColors.text, fontSize: 22, fontWeight: '800' }]}>
                      {formatCurrency(selectedGasto.monto)}
                    </Text>
                  </View>
                  {selectedGasto.status === 'APPROVED' && (
                    <TouchableOpacity
                      onPress={() => handleOpenQuickEditField('monto')}
                      style={styles.quickFieldBtn}
                    >
                      <Ionicons name="pencil" size={14} color={themeColors.accent} />
                      <Text style={styles.quickFieldBtnText}>Cambiar</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Empleado */}
                <View style={styles.detailItem}>
                  <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Empleado</Text>
                  <Text style={[styles.detailValue, { color: themeColors.text, fontWeight: '700' }]}>
                    {selectedGasto.empleado_nombre || 'N/D'}
                  </Text>
                </View>

                {/* Servicio / Proyecto */}
                <View style={[styles.detailItem, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                  <View style={{ flex: 1, marginRight: Spacing.two }}>
                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Servicio / Proyecto</Text>
                    <Text style={[styles.detailValue, { color: themeColors.text }]}>
                      {selectedGasto.tipo_servicio_proyecto ? `Tipo: ${selectedGasto.tipo_servicio_proyecto}` : 'No especificado'}
                      {selectedGasto.detalle_servicio_proyecto ? `\nDetalle: ${selectedGasto.detalle_servicio_proyecto}` : ''}
                    </Text>
                  </View>
                  {selectedGasto.status === 'APPROVED' && (
                    <TouchableOpacity
                      onPress={() => handleOpenQuickEditField('servicio')}
                      style={styles.quickFieldBtn}
                    >
                      <Ionicons name="pencil" size={14} color={themeColors.accent} />
                      <Text style={styles.quickFieldBtnText}>Cambiar</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Proveedor */}
                <View style={[styles.detailItem, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                  <View style={{ flex: 1, marginRight: Spacing.two }}>
                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Proveedor</Text>
                    <Text style={[styles.detailValue, { color: GastoHelper.getProveedor(selectedGasto) ? themeColors.text : themeColors.danger, fontWeight: '700', fontSize: 15 }]}>
                      {GastoHelper.getProveedor(selectedGasto) || '⚠️ En blanco (Sin asignar)'}
                    </Text>
                  </View>
                  {selectedGasto.status === 'APPROVED' && (
                    <TouchableOpacity
                      onPress={() => handleOpenQuickEditProveedor(selectedGasto)}
                      style={styles.quickFieldBtn}
                    >
                      <Ionicons name="pencil" size={14} color={themeColors.accent} />
                      <Text style={styles.quickFieldBtnText}>
                        {GastoHelper.getProveedor(selectedGasto) ? 'Cambiar' : 'Asignar'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {(!GastoHelper.getProveedor(selectedGasto) || !GastoHelper.getProveedor(selectedGasto).trim()) && (
                  <View style={[styles.alertBanner, { backgroundColor: themeColors.warning + '18', borderColor: themeColors.warning, marginVertical: Spacing.half, padding: Spacing.two, borderRadius: BorderRadius.medium, borderWidth: 1, flexDirection: 'row', gap: Spacing.one }]}>
                    <Ionicons name="alert-circle-outline" size={22} color={themeColors.warning} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.alertTitle, { color: themeColors.warning, fontSize: 14, fontWeight: '700', marginBottom: 2 }]}>Proveedor Pendiente de Asignar</Text>
                      <Text style={[styles.alertText, { color: themeColors.text, fontSize: 13 }]}>
                        El empleado dejó el proveedor en blanco. Puedes asignarlo rápidamente aquí para poder aprobar el gasto.
                      </Text>
                      {(() => {
                        const parsed = parseJustificacion(selectedGasto.justificacion);
                        if (parsed.proveedorSugerido) {
                          return (
                            <View style={{ marginTop: 8, padding: 8, backgroundColor: themeColors.backgroundElement, borderRadius: BorderRadius.small, borderWidth: 1, borderColor: themeColors.border }}>
                              <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.text }}>
                                📝 Proveedor a agregar indicado por el empleado:
                              </Text>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.primary, marginTop: 2, marginBottom: 6 }}>
                                {parsed.proveedorSugerido}
                              </Text>
                              <TouchableOpacity
                                onPress={() => handleQuickCreateProveedorAndAssign(parsed.proveedorSugerido!)}
                                disabled={isSavingQuickProv}
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 6,
                                  backgroundColor: themeColors.primary,
                                  paddingVertical: 8,
                                  paddingHorizontal: 12,
                                  borderRadius: BorderRadius.small,
                                  marginTop: 4,
                                }}
                              >
                                {isSavingQuickProv ? (
                                  <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                  <>
                                    <Ionicons name="flash-outline" size={16} color="#fff" />
                                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
                                      ⚡ Asignar &quot;{parsed.proveedorSugerido}&quot;
                                    </Text>
                                  </>
                                )}
                              </TouchableOpacity>
                            </View>
                          );
                        }
                        return (
                          <TouchableOpacity
                            onPress={() => handleOpenQuickEditProveedor(selectedGasto)}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 6,
                              backgroundColor: themeColors.warning,
                              paddingVertical: 8,
                              paddingHorizontal: 12,
                              borderRadius: BorderRadius.small,
                              marginTop: 8,
                            }}
                          >
                            <Ionicons name="business-outline" size={16} color="#fff" />
                            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
                              Asignar Proveedor Ahora
                            </Text>
                          </TouchableOpacity>
                        );
                      })()}
                    </View>
                  </View>
                )}

                {/* Venta / Proyecto Vinculado */}
                <View style={[styles.detailItem, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                  <View style={{ flex: 1, marginRight: Spacing.two }}>
                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Venta / Proyecto Vinculado</Text>
                    {selectedGasto.venta_rel || selectedGasto.venta_id ? (
                      <View style={{ marginTop: 2 }}>
                        <Text style={[styles.detailValue, { color: themeColors.primary, fontWeight: '700' }]}>
                          {selectedGasto.venta_rel?.cliente
                            ? `${selectedGasto.venta_rel.cliente} (${selectedGasto.venta_rel.fecha || 'Sin fecha'})`
                            : `Venta ID: ${selectedGasto.venta_id}`}
                        </Text>
                        {selectedGasto.venta_rel?.tipo_proyecto ? (
                          <Text style={{ color: themeColors.textSecondary, fontSize: 12, marginTop: 1 }}>
                            Proyecto: {selectedGasto.venta_rel.tipo_proyecto} {selectedGasto.venta_rel.sucursal ? `| ${selectedGasto.venta_rel.sucursal}` : ''}
                          </Text>
                        ) : null}
                        {selectedGasto.venta_rel?.precio_total_facturado ? (
                          <Text style={{ color: themeColors.accent, fontSize: 11, fontWeight: '600', marginTop: 1 }}>
                            Total Venta: {formatCurrency(selectedGasto.venta_rel.precio_total_facturado)}
                          </Text>
                        ) : null}
                      </View>
                    ) : (
                      <Text style={[styles.detailValue, { color: themeColors.textSecondary, fontStyle: 'italic', marginTop: 2 }]}>
                        Sin venta vinculada (Gasto general no asignado)
                      </Text>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <TouchableOpacity
                      onPress={() => handleOpenRelinkSaleModal(selectedGasto)}
                      style={styles.quickFieldBtn}
                    >
                      <Ionicons name="swap-horizontal-outline" size={14} color={themeColors.accent} />
                      <Text style={styles.quickFieldBtnText}>
                        {selectedGasto.venta_id ? 'Cambiar' : 'Vincular'}
                      </Text>
                    </TouchableOpacity>
                    {selectedGasto.venta_id ? (
                      <TouchableOpacity
                        onPress={() => handleDirectUnlinkSale(selectedGasto)}
                        style={[styles.quickFieldBtn, { borderColor: themeColors.danger + '40', backgroundColor: themeColors.danger + '10' }]}
                      >
                        <Ionicons name="link-outline" size={14} color={themeColors.danger} />
                        <Text style={[styles.quickFieldBtnText, { color: themeColors.danger }]}>Desvincular</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>

                {/* Cliente / Sucursal */}
                <View style={[styles.detailItem, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                  <View style={{ flex: 1, marginRight: Spacing.two }}>
                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Cliente / Sucursal</Text>
                    <Text style={[styles.detailValue, { color: themeColors.text }]}>
                      {GastoHelper.getCliente(selectedGasto) || 'No especificado'} {GastoHelper.getSucursal(selectedGasto) ? `- Sucursal: ${GastoHelper.getSucursal(selectedGasto)}` : ''}
                    </Text>
                  </View>
                  {selectedGasto.status === 'APPROVED' && (
                    <TouchableOpacity
                      onPress={() => handleOpenQuickEditField('cliente')}
                      style={styles.quickFieldBtn}
                    >
                      <Ionicons name="pencil" size={14} color={themeColors.accent} />
                      <Text style={styles.quickFieldBtnText}>Cambiar</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Fecha de Gasto */}
                <View style={[styles.detailItem, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                  <View style={{ flex: 1, marginRight: Spacing.two }}>
                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Fecha de Gasto</Text>
                    <Text style={[styles.detailValue, { color: themeColors.text }]}>
                      {formatFriendlyDate(selectedGasto.fecha_comprobante || selectedGasto.created_at?.split('T')[0])}
                    </Text>
                  </View>
                  {selectedGasto.status === 'APPROVED' && (
                    <TouchableOpacity
                      onPress={() => handleOpenQuickEditField('fecha')}
                      style={styles.quickFieldBtn}
                    >
                      <Ionicons name="pencil" size={14} color={themeColors.accent} />
                      <Text style={styles.quickFieldBtnText}>Cambiar</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Categoría / Subcategoría */}
                <View style={[styles.detailItem, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                  <View style={{ flex: 1, marginRight: Spacing.two }}>
                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Categoría / Subcategoría</Text>
                    <Text style={[styles.detailValue, { color: themeColors.text }]}>
                      {GastoHelper.getCategoria(selectedGasto) || 'Sin Categoría'} {GastoHelper.getSubcategoria(selectedGasto) ? `> ${GastoHelper.getSubcategoria(selectedGasto)}` : ''}
                    </Text>
                  </View>
                  {selectedGasto.status === 'APPROVED' && (
                    <TouchableOpacity
                      onPress={() => handleOpenQuickEditField('categoria')}
                      style={styles.quickFieldBtn}
                    >
                      <Ionicons name="pencil" size={14} color={themeColors.accent} />
                      <Text style={styles.quickFieldBtnText}>Cambiar</Text>
                    </TouchableOpacity>
                  )}
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
                      {/* Método de Pago */}
                      <View style={[styles.detailItem, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                        <View style={{ flex: 1, marginRight: Spacing.two }}>
                          <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Método de Pago</Text>
                          <Text style={[styles.detailValue, { color: themeColors.text }]}>
                            {selectedGasto.metodo_pago === 'transferencia' ? 'Transferencia' : selectedGasto.metodo_pago === 'efectivo' ? 'Efectivo' : selectedGasto.metodo_pago === 'monedero_electronico' ? 'Monedero Electrónico' : selectedGasto.metodo_pago === 'tarjeta_debito' ? 'Tarjeta Débito' : selectedGasto.metodo_pago === 'tarjeta_credito' ? 'Tarjeta Crédito' : (selectedGasto.metodo_pago || 'No especificado')} {selectedGasto.tipo_tarjeta ? `(${selectedGasto.tipo_tarjeta})` : ''}
                          </Text>
                        </View>
                        {selectedGasto.status === 'APPROVED' && (
                          <TouchableOpacity
                            onPress={() => handleOpenQuickEditField('pago')}
                            style={styles.quickFieldBtn}
                          >
                            <Ionicons name="pencil" size={14} color={themeColors.accent} />
                            <Text style={styles.quickFieldBtnText}>Cambiar</Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* Comentarios / Justificación */}
                      <View style={[styles.detailItem, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                        <View style={{ flex: 1, marginRight: Spacing.two }}>
                          <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Comentarios / Justificación</Text>
                          <Text style={[styles.detailValue, { color: themeColors.text }]}>
                            {parsed.justificacion || 'No especificados'}
                          </Text>
                        </View>
                        {selectedGasto.status === 'APPROVED' && (
                          <TouchableOpacity
                            onPress={() => handleOpenQuickEditField('comentarios')}
                            style={styles.quickFieldBtn}
                          >
                            <Ionicons name="pencil" size={14} color={themeColors.accent} />
                            <Text style={styles.quickFieldBtnText}>Cambiar</Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      {(!selectedGasto.facturado || selectedGasto.motivo_sin_factura) && (
                        <View style={[styles.detailItem, { backgroundColor: themeColors.warning + '15', padding: Spacing.two, borderRadius: BorderRadius.medium, borderLeftWidth: 4, borderLeftColor: themeColors.warning, marginVertical: Spacing.one }]}>
                          <Text style={[styles.detailLabel, { color: themeColors.warning, fontWeight: '700' }]}>
                            {selectedGasto.motivo_sin_factura?.startsWith('PENDIENTE') ? '⏳ Factura Pendiente de Entregar' : '⚠️ Motivo de Falta de Factura'}
                          </Text>
                          <Text style={[styles.detailValue, { color: themeColors.text, fontWeight: '600', marginTop: 2 }]}>
                            {selectedGasto.motivo_sin_factura
                              ? (selectedGasto.motivo_sin_factura.includes('PENDIENTE_ENTREGA:')
                                  ? selectedGasto.motivo_sin_factura.replace('PENDIENTE_ENTREGA:', 'Comentario:')
                                  : (selectedGasto.motivo_sin_factura === 'PENDIENTE_ENTREGA' ? 'Sin comentarios adicionales.' : selectedGasto.motivo_sin_factura))
                              : localMotivo || 'No especificado por el empleado'}
                          </Text>
                        </View>
                      )}

                      <View style={[styles.detailItem, { marginTop: Spacing.one, borderTopWidth: 1, borderTopColor: themeColors.border, paddingTop: Spacing.two }]}>
                        <Text style={[styles.detailLabel, { color: themeColors.textSecondary, fontWeight: '700', marginBottom: Spacing.one }]}>GESTIÓN DE FACTURACIÓN (ADMIN)</Text>

                        {/* Selector de 3 Opciones: Sí Facturado / Pendiente de Factura / No Facturable */}
                        <View style={{ flexDirection: 'row', gap: Spacing.one, marginBottom: Spacing.two }}>
                          <TouchableOpacity
                            onPress={() => handleToggleAdminFacturado(true)}
                            style={{
                              flex: 1,
                              height: 38,
                              borderRadius: BorderRadius.small,
                              borderWidth: 1,
                              borderColor: selectedGasto.facturado ? 'transparent' : themeColors.border,
                              backgroundColor: selectedGasto.facturado ? themeColors.success : themeColors.backgroundElement,
                              justifyContent: 'center',
                              alignItems: 'center',
                              paddingHorizontal: 4
                            }}
                          >
                            <Text style={{ color: selectedGasto.facturado ? '#ffffff' : themeColors.text, fontWeight: '700', fontSize: 11, textAlign: 'center' }}>
                              ✓ Facturado
                            </Text>
                          </TouchableOpacity>

                          {(() => {
                            const isPendiente = !selectedGasto.facturado && !!selectedGasto.motivo_sin_factura && selectedGasto.motivo_sin_factura.toUpperCase().includes('PENDIENTE');
                            return (
                              <>
                                <TouchableOpacity
                                  onPress={handleSetPendienteEntrega}
                                  style={{
                                    flex: 1.2,
                                    height: 38,
                                    borderRadius: BorderRadius.small,
                                    borderWidth: 1,
                                    borderColor: isPendiente ? 'transparent' : themeColors.border,
                                    backgroundColor: isPendiente ? themeColors.warning : themeColors.backgroundElement,
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    paddingHorizontal: 4
                                  }}
                                >
                                  <Text style={{ color: isPendiente ? '#ffffff' : themeColors.text, fontWeight: '700', fontSize: 11, textAlign: 'center' }}>
                                    ⏳ Pend. Factura
                                  </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                  onPress={() => handleToggleAdminFacturado(false)}
                                  style={{
                                    flex: 1,
                                    height: 38,
                                    borderRadius: BorderRadius.small,
                                    borderWidth: 1,
                                    borderColor: (!selectedGasto.facturado && !isPendiente) ? 'transparent' : themeColors.border,
                                    backgroundColor: (!selectedGasto.facturado && !isPendiente) ? themeColors.accent : themeColors.backgroundElement,
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    paddingHorizontal: 4
                                  }}
                                >
                                  <Text style={{ color: (!selectedGasto.facturado && !isPendiente) ? '#ffffff' : themeColors.text, fontWeight: '700', fontSize: 11, textAlign: 'center' }}>
                                    ❌ No Facturado
                                  </Text>
                                </TouchableOpacity>
                              </>
                            );
                          })()}
                        </View>

                        {/* Secciones según el toggle */}
                        {selectedGasto.facturado ? (
                          <View style={{ gap: Spacing.one }}>
                            <Text style={{ color: themeColors.textSecondary, fontSize: 12, marginBottom: 2 }}>
                              Archivos de Factura Adjuntos ({GastoHelper.getFacturaUrls(selectedGasto).length}):
                            </Text>
                            {(() => {
                              const urls = GastoHelper.getFacturaUrls(selectedGasto);
                              if (urls.length > 0) {
                                return (
                                  <View style={{ gap: 8 }}>
                                    {urls.map((url, idx) => (
                                      <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                                        <TouchableOpacity
                                          style={[styles.invoiceLinkBtn, { backgroundColor: themeColors.accent + '15', flex: 1, height: 40, justifyContent: 'center', borderRadius: BorderRadius.small }]}
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
                                            {urls.length > 1 ? `Ver Factura #${idx + 1}` : 'Ver Factura Adjunta'}
                                          </Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                          style={{
                                            backgroundColor: themeColors.danger + '15',
                                            padding: Spacing.one,
                                            borderRadius: BorderRadius.small,
                                            borderWidth: 1,
                                            borderColor: themeColors.danger + '40',
                                            height: 40,
                                            justifyContent: 'center',
                                            alignItems: 'center',
                                            aspectRatio: 1
                                          }}
                                          onPress={() => handleDeleteAdminInvoice(idx)}
                                          disabled={isUploadingInvoice}
                                        >
                                          <Ionicons name="trash-outline" size={18} color={themeColors.danger} />
                                        </TouchableOpacity>
                                      </View>
                                    ))}
                                  </View>
                                );
                              }
                              return (
                                <Text style={{ color: themeColors.danger, fontSize: 12, fontStyle: 'italic', marginBottom: 4 }}>⚠️ Falta factura correspondiente</Text>
                              );
                            })()}

                            {/* Botones para anexar más facturas */}
                            {isUploadingInvoice ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.one, padding: Spacing.one, marginTop: 4 }}>
                                <ActivityIndicator size="small" color={themeColors.accent} />
                                <Text style={{ color: themeColors.text, fontSize: 12 }}>Subiendo factura a Supabase...</Text>
                              </View>
                            ) : (
                              <View style={{ flexDirection: 'row', gap: Spacing.one, marginTop: 6 }}>
                                <TouchableOpacity
                                  style={{ flex: 1, backgroundColor: themeColors.backgroundElement, borderWidth: 1, borderColor: themeColors.border, padding: Spacing.one, borderRadius: BorderRadius.small, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                                  onPress={handleCaptureAdminInvoice}
                                >
                                  <Ionicons name="camera-outline" size={16} color={themeColors.text} />
                                  <Text style={{ color: themeColors.text, fontSize: 11, fontWeight: '600' }}>+ Añadir Foto</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                  style={{ flex: 1, backgroundColor: themeColors.backgroundElement, borderWidth: 1, borderColor: themeColors.border, padding: Spacing.one, borderRadius: BorderRadius.small, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                                  onPress={handleSelectAdminInvoiceDocument}
                                >
                                  <Ionicons name="document-attach-outline" size={16} color={themeColors.text} />
                                  <Text style={{ color: themeColors.text, fontSize: 11, fontWeight: '600' }}>+ Añadir Archivo</Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        ) : (
                          <View style={{ gap: Spacing.one }}>
                            <CustomInput
                              label="Motivo de falta de factura:"
                              placeholder="Escribe el motivo (ej. Proveedor informal)..."
                              value={localMotivo}
                              onChangeText={setLocalMotivo}
                              onBlur={() => handleUpdateAdminMotivoSinFactura(localMotivo)}
                              onEndEditing={() => handleUpdateAdminMotivoSinFactura(localMotivo)}
                              style={{ height: 40 }}
                              iconName="warning-outline"
                            />
                          </View>
                        )}
                      </View>

                      {/* ESTADO DE REEMBOLSO (ADMIN) */}
                      <View style={[styles.detailItem, { marginTop: Spacing.one, borderTopWidth: 1, borderTopColor: themeColors.border, paddingTop: Spacing.two }]}>
                        <Text style={[styles.detailLabel, { color: themeColors.textSecondary, fontWeight: '700', marginBottom: Spacing.one }]}>
                          ESTADO DE REEMBOLSO (ADMIN)
                        </Text>
                        <View style={{ flexDirection: 'row', gap: Spacing.one }}>
                          <TouchableOpacity
                            onPress={() => handleUpdateEstadoReembolso('NORMAL')}
                            disabled={isUpdatingEstadoReembolso}
                            style={{
                              flex: 1,
                              height: 38,
                              borderRadius: BorderRadius.small,
                              borderWidth: 1,
                              borderColor: (!selectedGasto.estado_reembolso || selectedGasto.estado_reembolso === 'NORMAL') ? 'transparent' : themeColors.border,
                              backgroundColor: (!selectedGasto.estado_reembolso || selectedGasto.estado_reembolso === 'NORMAL') ? themeColors.accent : themeColors.backgroundElement,
                              justifyContent: 'center',
                              alignItems: 'center',
                              paddingHorizontal: 4
                            }}
                          >
                            <Text style={{ color: (!selectedGasto.estado_reembolso || selectedGasto.estado_reembolso === 'NORMAL') ? '#ffffff' : themeColors.text, fontWeight: '700', fontSize: 11, textAlign: 'center' }}>
                              ✓ Normal
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => handleUpdateEstadoReembolso('PENDIENTE_REEMBOLSO')}
                            disabled={isUpdatingEstadoReembolso}
                            style={{
                              flex: 1.2,
                              height: 38,
                              borderRadius: BorderRadius.small,
                              borderWidth: 1,
                              borderColor: selectedGasto.estado_reembolso === 'PENDIENTE_REEMBOLSO' ? 'transparent' : themeColors.border,
                              backgroundColor: selectedGasto.estado_reembolso === 'PENDIENTE_REEMBOLSO' ? themeColors.warning : themeColors.backgroundElement,
                              justifyContent: 'center',
                              alignItems: 'center',
                              paddingHorizontal: 4
                            }}
                          >
                            <Text style={{ color: selectedGasto.estado_reembolso === 'PENDIENTE_REEMBOLSO' ? '#ffffff' : themeColors.text, fontWeight: '700', fontSize: 11, textAlign: 'center' }}>
                              ⏳ Pend. Reembolso
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => handleUpdateEstadoReembolso('REEMBOLSADO')}
                            disabled={isUpdatingEstadoReembolso}
                            style={{
                              flex: 1.1,
                              height: 38,
                              borderRadius: BorderRadius.small,
                              borderWidth: 1,
                              borderColor: selectedGasto.estado_reembolso === 'REEMBOLSADO' ? 'transparent' : themeColors.border,
                              backgroundColor: selectedGasto.estado_reembolso === 'REEMBOLSADO' ? '#8b5cf6' : themeColors.backgroundElement,
                              justifyContent: 'center',
                              alignItems: 'center',
                              paddingHorizontal: 4
                            }}
                          >
                            <Text style={{ color: selectedGasto.estado_reembolso === 'REEMBOLSADO' ? '#ffffff' : themeColors.text, fontWeight: '700', fontSize: 11, textAlign: 'center' }}>
                              ↩️ Reembolsado
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </>
                  );
                })()}

                {/* Acciones para gastos PENDIENTES */}
                {selectedGasto.status === 'PENDING' && (
                  <View style={styles.reviewActions}>
                    {selectedGasto.empleado_id === adminUser?.id && adminUser?.rol !== 'DEV' ? (
                      <View style={[styles.alertBanner, { backgroundColor: themeColors.warning + '15', borderColor: themeColors.warning, marginBottom: 0, padding: Spacing.two, borderRadius: BorderRadius.medium, borderWidth: 1, flexDirection: 'row', gap: Spacing.one }]}>
                        <Ionicons name="warning-outline" size={22} color={themeColors.warning} style={{ marginTop: 2 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.alertTitle, { color: themeColors.warning, fontSize: 14, fontWeight: '700', marginBottom: 2 }]}>Revisión Cruzada</Text>
                          <Text style={[styles.alertText, { color: themeColors.text, fontSize: 13 }]}>
                            No puedes revisar tus propios gastos. Este registro debe ser aprobado o rechazado por otro administrador.
                          </Text>
                        </View>
                      </View>
                    ) : !showFeedbackInput ? (
                      <>
                        <View style={styles.rowActions}>
                          <CustomButton
                            title="Aprobar"
                            onPress={handleApproveClick}
                            variant="success"
                            style={{ flex: 1 }}
                            loading={isProcessingAction}
                          />
                          <CustomButton
                            title="Rechazar"
                            onPress={() => {
                              setFeedbackActionType('REJECTED');
                              setShowFeedbackInput(true);
                            }}
                            variant="danger"
                            style={{ flex: 1 }}
                            disabled={isProcessingAction}
                          />
                        </View>
                        <CustomButton
                          title="Devolver (Acción Requerida)"
                          onPress={() => {
                            setFeedbackActionType('ACTION_REQUIRED');
                            setShowFeedbackInput(true);
                          }}
                          variant="secondary"
                          style={{ width: '100%', marginTop: Spacing.one }}
                          disabled={isProcessingAction}
                        />
                        <CustomButton
                          title="Editar Gasto"
                          onPress={() => {
                            setReviewModalVisible(false);
                            router.push(`/(admin)/editar-gasto?id=${selectedGasto.id}` as any);
                          }}
                          variant="primary"
                          style={{ width: '100%', marginTop: Spacing.one }}
                          disabled={isProcessingAction}
                        />
                        <CustomButton
                          title="Eliminar Gasto Permanente"
                          onPress={() => handleDeleteGasto(selectedGasto.id)}
                          variant="danger"
                          style={{ width: '100%', marginTop: Spacing.one }}
                          loading={isProcessingAction}
                          icon={<Ionicons name="trash-outline" size={20} color="#fff" style={{ marginRight: 8 }} />}
                        />
                      </>
                    ) : (
                      <View style={styles.feedbackForm}>
                        <CustomInput
                          label={feedbackActionType === 'REJECTED' ? "Motivo de Rechazo del Gasto *" : "Duda / Comentario para el Empleado *"}
                          placeholder={feedbackActionType === 'REJECTED' ? "Escribe el motivo por el cual se rechaza este gasto..." : "Escribe la información faltante requerida..."}
                          value={rejectionFeedback}
                          onChangeText={setRejectionFeedback}
                          multiline
                          numberOfLines={3}
                          style={{ height: 75 }}
                        />
                        <View style={styles.rowActions}>
                          <CustomButton
                            title="Cancelar"
                            onPress={() => {
                              setShowFeedbackInput(false);
                              setRejectionFeedback('');
                            }}
                            variant="secondary"
                            style={{ flex: 1 }}
                            disabled={isProcessingAction}
                          />
                          <CustomButton
                            title={feedbackActionType === 'REJECTED' ? "Confirmar Rechazo" : "Enviar Observación"}
                            onPress={() => handleUpdateStatus(feedbackActionType)}
                            variant={feedbackActionType === 'REJECTED' ? "danger" : "warning"}
                            style={{ flex: 1.5 }}
                            loading={isProcessingAction}
                          />
                        </View>
                      </View>
                    )}
                  </View>
                )}

                {/* Detalle informativo de estado si ya fue resuelto */}
                {selectedGasto.status !== 'PENDING' && (
                  <View style={{ gap: Spacing.two, marginTop: Spacing.two }}>
                    <View style={[styles.resolvedBadge, { backgroundColor: themeColors.backgroundSelected, marginBottom: 0 }]}>
                      <Text style={[styles.resolvedText, { color: themeColors.text, fontWeight: '700' }]}>
                        Estado de Revisión: {selectedGasto.status === 'APPROVED' ? 'Aprobado' : selectedGasto.status === 'REJECTED' ? 'Rechazado' : 'Acción Requerida'}
                      </Text>
                      {selectedGasto.rejection_feedback && (
                        <Text style={{ color: themeColors.textSecondary, fontSize: 13, marginTop: 4 }}>
                          {`Feedback enviado: "${selectedGasto.rejection_feedback}"`}
                        </Text>
                      )}
                    </View>
                    <CustomButton
                      title="Revertir a Pendiente (Revisión)"
                      onPress={() => {
                        if (Platform.OS === 'web') {
                          const confirmed = window.confirm('¿Estás seguro de que deseas regresar este gasto a la bandeja de pendientes para revisarlo nuevamente?');
                          if (confirmed) {
                            handleUpdateStatus('PENDING');
                          }
                        } else {
                          Alert.alert(
                            'Revertir Gasto',
                            '¿Estás seguro de que deseas regresar este gasto a la bandeja de pendientes para revisarlo nuevamente?',
                            [
                              { text: 'Cancelar', style: 'cancel' },
                              {
                                text: 'Confirmar Reversión',
                                style: 'destructive',
                                onPress: () => handleUpdateStatus('PENDING'),
                              },
                            ]
                          );
                        }
                      }}
                      variant="secondary"
                      style={{ width: '100%', marginTop: Spacing.one }}
                      loading={isProcessingAction}
                      icon={<Ionicons name="arrow-undo-outline" size={20} color={themeColors.text} style={{ marginRight: 8 }} />}
                    />
                    {selectedGasto.status === 'ACTION_REQUIRED' && (
                      <CustomButton
                        title="Editar Gasto"
                        onPress={() => {
                          setReviewModalVisible(false);
                          router.push(`/(admin)/editar-gasto?id=${selectedGasto.id}` as any);
                        }}
                        variant="primary"
                        style={{ width: '100%', marginTop: Spacing.one }}
                        loading={isProcessingAction}
                      />
                    )}
                    <CustomButton
                      title="Eliminar Gasto Permanente"
                      onPress={() => handleDeleteGasto(selectedGasto.id)}
                      variant="danger"
                      style={{ width: '100%', marginTop: Spacing.one }}
                      loading={isProcessingAction}
                      icon={<Ionicons name="trash-outline" size={20} color="#fff" style={{ marginRight: 8 }} />}
                    />
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
