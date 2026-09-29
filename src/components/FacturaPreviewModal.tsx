import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
  ScrollView,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing } from '@/constants/theme';
import { generarFacturaHTML, exportarFacturaOdooPDF, exportarReciboPagoPDF, cleanFolio } from '@/utils/reportGenerator';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { cacheDirectory, writeAsStringAsync } from 'expo-file-system/legacy';

export interface FacturaPreviewModalProps {
  visible: boolean;
  onClose: () => void;
  venta?: any;
  facturaData?: any;
  xmlText?: string;
  isDraft?: boolean;
  title?: string;
  onConfirmTimbrar?: () => void;
  customHtml?: string;
}

export default function FacturaPreviewModal({
  visible,
  onClose,
  venta,
  facturaData,
  xmlText,
  isDraft = false,
  title,
  onConfirmTimbrar,
  customHtml,
}: FacturaPreviewModalProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [htmlContent, setHtmlContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
  const iframeRef = useRef<any>(null);

  useEffect(() => {
    if (visible && (customHtml || venta || facturaData)) {
      loadHTML();
    } else {
      setHtmlContent('');
    }
  }, [visible, venta, facturaData, isDraft, customHtml]);

  const loadHTML = async () => {
    try {
      setIsLoading(true);
      if (customHtml) {
        setHtmlContent(customHtml);
        return;
      }
      const safeVenta = venta || {
        cliente: facturaData?.customer?.legal_name || 'Cliente',
        precio_total_facturado: facturaData?.total || 0,
      };
      const safeFacturaData = facturaData || {
        folio_number: safeVenta?.folio || '1',
        total: safeVenta?.precio_total_facturado || 0,
      };

      const html = await generarFacturaHTML(safeVenta, safeFacturaData, isDraft);
      setHtmlContent(html);
    } catch (err) {
      console.error('Error generando HTML de factura:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const getCleanFileName = (ext: string) => {
    const isPago = isDraft
      ? (title?.includes('Pago') || title?.includes('Recibo'))
      : (facturaData?.serie === 'P' || title?.includes('Pago') || title?.includes('Recibo') || Boolean(facturaData?.complementos_pago_doctos));
    const clienteRaw = venta?.cliente || facturaData?.customer?.legal_name || facturaData?.cliente_nombre || 'Cliente';
    const clienteSanitized = clienteRaw.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    const defaultSerie = isPago ? 'P' : 'A';
    const serie = (facturaData?.series || facturaData?.serie || venta?.cfdi_serie || venta?.factura_serie || defaultSerie).toUpperCase().trim();
    let folioNum = cleanFolio(facturaData?.folio_number || facturaData?.folio || venta?.cfdi_folio || venta?.factura_folio || venta?.folio || '');
    if (folioNum.toUpperCase().startsWith(serie)) {
      folioNum = folioNum.slice(serie.length).trim();
    }
    if (/^\d+$/.test(folioNum)) {
      folioNum = String(parseInt(folioNum, 10)).padStart(4, '0');
    } else if (!folioNum) {
      folioNum = '0001';
    }
    const fullFolio = `${serie}${folioNum}`;
    const prefix = isPago ? `${clienteSanitized}_Pago_${fullFolio}` : `${clienteSanitized}_${fullFolio}`;
    return `${prefix}.${ext}`;
  };

  const handlePrint = async () => {
    try {
      setIsActionLoading(true);
      if (Platform.OS === 'web') {
        const fileNameWithoutExt = getCleanFileName('pdf').replace('.pdf', '');
        const prevTitle = document.title;
        document.title = fileNameWithoutExt;
        if (iframeRef.current?.contentWindow) {
          try {
            if (iframeRef.current.contentDocument) {
              iframeRef.current.contentDocument.title = fileNameWithoutExt;
            }
          } catch (_) {}
          iframeRef.current.contentWindow.focus();
          iframeRef.current.contentWindow.print();
        } else {
          // Fallback
          const printWindow = window.open('', '_blank');
          if (printWindow) {
            printWindow.document.write(htmlContent);
            printWindow.document.title = fileNameWithoutExt;
            printWindow.document.close();
            printWindow.focus();
            printWindow.print();
          }
        }
        setTimeout(() => { document.title = prevTitle; }, 1500);
      } else {
        await Print.printAsync({ html: htmlContent });
      }
    } catch (err: any) {
      console.error('Error al imprimir:', err);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      setIsActionLoading(true);
      if (customHtml) {
        const isPago = facturaData?.serie === 'P' || facturaData?.folio_completo || title?.includes('Pago') || title?.includes('Recibo') || Boolean(facturaData?.complementos_pago_doctos);
        if (isPago) {
          const compData = facturaData || venta || {};
          await exportarReciboPagoPDF(compData, compData.complementos_pago_doctos || [], 'download');
          return;
        }
      }
      const safeVenta = venta || { cliente: 'Cliente' };
      const safeFacturaData = facturaData || { folio_number: '1' };
      await exportarFacturaOdooPDF(safeVenta, safeFacturaData, 'download');
    } catch (err: any) {
      console.error('Error descargando PDF:', err);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDownloadXML = async () => {
    if (!xmlText) return;
    try {
      setIsActionLoading(true);
      const fileName = getCleanFileName('xml');

      if (Platform.OS === 'web') {
        const blob = new Blob([xmlText], { type: 'application/xml;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const fileUri = `${cacheDirectory}${fileName}`;
        await writeAsStringAsync(fileUri, xmlText, { encoding: 'utf8' as any });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, { mimeType: 'application/xml' });
        }
      }
    } catch (err: any) {
      console.error('Error descargando XML:', err);
    } finally {
      setIsActionLoading(false);
    }
  };

  const isCanceled = venta?.cfdi_estado === 'CANCELADA' || facturaData?.status === 'canceled';
  const displayTitle = title || (
    isDraft
      ? 'Vista Previa (Borrador)'
      : `Factura: ${facturaData?.folio_number || venta?.folio || facturaData?.uuid?.slice(0, 8) || 'CFDI'}`
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.modalContainer,
            {
              backgroundColor: themeColors.background,
              borderColor: themeColors.border,
              width: isDesktop ? '92%' : '98%',
              maxWidth: 1020,
              height: isDesktop ? '94%' : '98%',
            },
          ]}
        >
          {/* Top Bar Header */}
          <View style={[styles.header, { borderBottomColor: themeColors.border, backgroundColor: themeColors.backgroundElement }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View style={[styles.iconCircle, { backgroundColor: isDraft ? '#f59e0b20' : isCanceled ? '#ef444420' : '#10b98120' }]}>
                <Ionicons
                  name={isDraft ? 'document-text-outline' : isCanceled ? 'close-circle-outline' : 'receipt-outline'}
                  size={20}
                  color={isDraft ? '#d97706' : isCanceled ? '#ef4444' : '#10b981'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={[styles.title, { color: themeColors.text }]} numberOfLines={1}>
                    {displayTitle}
                  </Text>
                  {isDraft ? (
                    <View style={[styles.badge, { backgroundColor: '#f59e0b25', borderColor: '#f59e0b' }]}>
                      <Text style={[styles.badgeText, { color: '#b45309' }]}>BORRADOR PRE-TIMBRADO</Text>
                    </View>
                  ) : isCanceled ? (
                    <View style={[styles.badge, { backgroundColor: '#ef444425', borderColor: '#ef4444' }]}>
                      <Text style={[styles.badgeText, { color: '#dc2626' }]}>CANCELADA ANTE EL SAT</Text>
                    </View>
                  ) : (
                    <View style={[styles.badge, { backgroundColor: '#10b98125', borderColor: '#10b981' }]}>
                      <Text style={[styles.badgeText, { color: '#059669' }]}>CFDI 4.0 TIMBRADA</Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 2 }}>
                  {venta?.cliente || facturaData?.customer?.legal_name || 'Receptor'}
                  {venta?.fecha ? ` • ${venta.fecha}` : ''}
                </Text>
              </View>
            </View>

            {/* Action Buttons Toolbar */}
            <View style={styles.toolbar}>
              <TouchableOpacity
                onPress={handlePrint}
                disabled={isLoading || isActionLoading}
                style={[styles.toolBtn, { backgroundColor: '#0284c7', borderColor: '#0284c7' }]}
                activeOpacity={0.8}
              >
                <Ionicons name="print-outline" size={16} color="#fff" />
                {isDesktop && <Text style={styles.toolBtnText}>Imprimir</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleDownloadPDF}
                disabled={isLoading || isActionLoading}
                style={[styles.toolBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                activeOpacity={0.8}
              >
                <Ionicons name="download-outline" size={16} color={themeColors.text} />
                {isDesktop && <Text style={[styles.toolBtnText, { color: themeColors.text }]}>PDF</Text>}
              </TouchableOpacity>

              {!!xmlText && (
                <TouchableOpacity
                  onPress={handleDownloadXML}
                  disabled={isLoading || isActionLoading}
                  style={[styles.toolBtn, { backgroundColor: '#10b98118', borderColor: '#10b98160' }]}
                  activeOpacity={0.8}
                >
                  <Ionicons name="code-download-outline" size={16} color="#10b981" />
                  {isDesktop && <Text style={[styles.toolBtnText, { color: '#10b981' }]}>XML</Text>}
                </TouchableOpacity>
              )}

              {isDraft && onConfirmTimbrar && (
                <TouchableOpacity
                  onPress={onConfirmTimbrar}
                  disabled={isLoading || isActionLoading}
                  style={[styles.toolBtn, { backgroundColor: '#10b981', borderColor: '#10b981' }]}
                  activeOpacity={0.8}
                >
                  <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                  <Text style={styles.toolBtnText}>Timbrar Ahora</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                style={[
                  styles.closeBtn,
                  { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
                  Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined
                ]}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color={themeColors.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Document Preview Body */}
          <View style={styles.body}>
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0284c7" />
                <Text style={{ marginTop: 12, color: themeColors.textSecondary, fontSize: 13 }}>
                  Generando vista previa de la factura...
                </Text>
              </View>
            ) : Platform.OS === 'web' ? (
              <View style={styles.webPaperContainer}>
                {/* @ts-ignore */}
                <iframe
                  ref={iframeRef}
                  srcDoc={htmlContent}
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    borderRadius: 8,
                    backgroundColor: '#fff',
                  }}
                  title="Factura Preview"
                />
              </View>
            ) : (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.three, alignItems: 'center' }}>
                <View style={[styles.mobileCard, { backgroundColor: '#fff', borderColor: '#e2e8f0' }]}>
                  <Text style={{ color: '#64748b', fontSize: 13, textAlign: 'center', marginBottom: 12 }}>
                    Vista previa de factura formateada para impresión. Puedes enviarla directamente a la impresora o compartirla como PDF.
                  </Text>
                  <TouchableOpacity
                    onPress={handlePrint}
                    style={{ backgroundColor: '#0284c7', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' }}
                  >
                    <Ionicons name="print-outline" size={18} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>Abrir Visor de Impresión</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
  modalContainer: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    zIndex: 10,
    position: 'relative',
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  toolBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    backgroundColor: '#71717a20',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  webPaperContainer: {
    flex: 1,
    margin: 12,
    borderRadius: 6,
    overflow: 'hidden',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
    backgroundColor: '#fff',
  },
  mobileCard: {
    width: '100%',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
  },
});
