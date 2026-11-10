import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Gasto } from '@/services/supabase';
import { parseCFDIXML } from '@/utils/cfdiParser';
import { getApiUrl, getApiHeaders } from '@/services/apiHelper';
import { BorderRadius, Spacing } from '@/constants/theme';

interface SatFacturaLinkerProps {
  gasto: Gasto;
  themeColors: any;
  onAttachFactura: (
    factura: any,
    approveDirectly: boolean,
    extra?: { monto_propina?: number; es_compartida?: boolean }
  ) => Promise<void>;
  onDetachFactura: () => Promise<void>;
  onPreviewFactura: (factura: any) => void;
  onDownloadPdf: (factura: any) => void;
  isExportingSatPdf?: boolean;
  isAttaching?: boolean;
}

export function SatFacturaLinker({
  gasto,
  themeColors,
  onAttachFactura,
  onDetachFactura,
  onPreviewFactura,
  onDownloadPdf,
  isExportingSatPdf = false,
  isAttaching = false,
}: SatFacturaLinkerProps) {
  // Búsqueda por texto
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchTimeoutRef = useRef<any>(null);

  // Procesamiento de XML y Dropzone
  const [isProcessingXml, setIsProcessingXml] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Candidata seleccionada para vinculación
  const [candidateFactura, setCandidateFactura] = useState<any | null>(null);

  // Configuración de propina y factura compartida para la candidata
  const [montoPropina, setMontoPropina] = useState<number>(0);
  const [isPropinaActive, setIsPropinaActive] = useState<boolean>(false);
  const [isCompartidaActive, setIsCompartidaActive] = useState<boolean>(false);

  // Copiar UUID
  const handleCopyUuid = (uuid: string) => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(uuid);
      Alert.alert('Copiado', 'UUID copiado al portapapeles.');
    } else {
      Alert.alert('UUID SAT', uuid);
    }
  };

  // Buscar facturas por texto (UUID, RFC, Emisor)
  const performLookup = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < 3) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const headers = await getApiHeaders();
      const res = await fetch(
        `${getApiUrl()}/api/facturas-recibidas/lookup?q=${encodeURIComponent(trimmed)}&gasto_id=${gasto.id}`,
        { headers }
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.facturas || []);
        setShowSearchResults(true);
      }
    } catch (e) {
      console.warn('[SatFacturaLinker] Error buscando facturas:', e);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!text.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    searchTimeoutRef.current = setTimeout(() => {
      performLookup(text);
    }, 400);
  };

  // Procesar contenido XML (desde archivo o drag & drop)
  const processXmlString = async (xmlText: string) => {
    setIsProcessingXml(true);
    try {
      const parsed = parseCFDIXML(xmlText);
      if (!parsed || !parsed.uuid) {
        Alert.alert('XML Inválido', 'No se pudo extraer el Folio Fiscal (UUID) del XML.');
        return;
      }

      const headers = await getApiHeaders();

      // 1. Verificar si ya existe en la base de datos
      const lookupRes = await fetch(
        `${getApiUrl()}/api/facturas-recibidas/lookup?q=${encodeURIComponent(parsed.uuid)}&gasto_id=${gasto.id}`,
        { headers }
      );
      let foundFactura: any = null;
      if (lookupRes.ok) {
        const lookupData = await lookupRes.json();
        if (lookupData.facturas && lookupData.facturas.length > 0) {
          foundFactura = lookupData.facturas[0];
        }
      }

      // 2. Si no existe aún en facturas_recibidas, importarla de inmediato
      if (!foundFactura) {
        const importRes = await fetch(`${getApiUrl()}/api/facturas-recibidas/import`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            parsed: {
              uuid: parsed.uuid,
              rfcEmisor: parsed.issuer?.tax_id,
              nombreEmisor: parsed.issuer?.legal_name,
              rfcReceptor: parsed.customer?.tax_id,
              rfcPac: parsed.stamp?.pac_rfc || null,
              fechaEmision: parsed.created_at,
              subtotal: parsed.subtotal,
              descuento: 0,
              iva: parsed.iva || (parsed.total_impuestos_trasladados || 0),
              retencionIsr: 0,
              retencionIva: 0,
              total: parsed.total,
              moneda: parsed.currency || 'MXN',
              tipoComprobante: 'I',
              estadoSat: 'VIGENTE',
              conceptos: parsed.items || [],
            },
          }),
        });

        if (importRes.ok) {
          const importData = await importRes.json();
          const imported = importData.factura || {};
          foundFactura = {
            ...imported,
            gastos_vinculados: [],
            total_consumido: 0,
            saldo_disponible: Number(imported.total || parsed.total || 0),
            es_ya_vinculada: false,
            otros_gastos: [],
          };
        } else {
          // Si falló el guardado, armar objeto mínimo para que no se bloquee
          foundFactura = {
            id: null,
            uuid: parsed.uuid,
            nombre_emisor: parsed.issuer?.legal_name,
            rfc_emisor: parsed.issuer?.tax_id,
            total: parsed.total,
            fecha_emision: parsed.created_at,
            gastos_vinculados: [],
            total_consumido: 0,
            saldo_disponible: parsed.total,
            es_ya_vinculada: false,
            otros_gastos: [],
          };
        }
      }

      selectCandidate(foundFactura);
      setSearchQuery('');
      setShowSearchResults(false);
    } catch (err: any) {
      console.error('[processXmlString] Error procesando XML:', err);
      Alert.alert('Error', 'Hubo un error al leer el archivo XML: ' + (err.message || 'Formato no soportado'));
    } finally {
      setIsProcessingXml(false);
    }
  };

  // Abrir selector de archivos XML
  const handlePickXmlFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/xml', 'application/xml', '*/*'],
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets && res.assets[0]) {
        const asset = res.assets[0];
        let xmlContent = '';

        if (Platform.OS === 'web' && (asset as any).file) {
          xmlContent = await (asset as any).file.text();
        } else if (Platform.OS !== 'web') {
          xmlContent = await FileSystem.readAsStringAsync(asset.uri);
        }

        if (xmlContent) {
          await processXmlString(xmlContent);
        }
      }
    } catch (e: any) {
      Alert.alert('Error', 'No se pudo cargar el archivo XML: ' + (e.message || ''));
    }
  };

  // Seleccionar candidata y preconfigurar propina o compartida
  const selectCandidate = (fac: any) => {
    setCandidateFactura(fac);
    setShowSearchResults(false);

    const gastoMonto = Number(gasto.monto || 0);
    const facTotal = Number(fac.total || 0);
    const diff = gastoMonto - facTotal;

    // Si el gasto es mayor que la factura, sugerir propina automáticamente
    if (diff > 0.01) {
      setMontoPropina(Number(diff.toFixed(2)));
      setIsPropinaActive(true);
    } else {
      setMontoPropina(0);
      setIsPropinaActive(false);
    }

    // Si ya está vinculada a otros gastos, sugerir compartida
    if (fac.es_ya_vinculada) {
      setIsCompartidaActive(true);
    } else {
      setIsCompartidaActive(false);
    }
  };

  // Ejecutar vinculación
  const handleConfirmAttach = async (approveDirectly: boolean) => {
    if (!candidateFactura) return;

    const propinaFinal = isPropinaActive ? Math.max(0, Number(montoPropina) || 0) : 0;
    const isCompartidaFinal = Boolean(isCompartidaActive || candidateFactura.es_ya_vinculada);

    await onAttachFactura(candidateFactura, approveDirectly, {
      monto_propina: propinaFinal,
      es_compartida: isCompartidaFinal,
    });

    setCandidateFactura(null);
  };

  // Confirmación para desvincular
  const handleConfirmDetach = () => {
    Alert.alert(
      'Desvincular Factura Recibida',
      '¿Estás segura de que deseas desvincular este CFDI del gasto? El gasto quedará pendiente de factura o no facturado.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, Desvincular',
          style: 'destructive',
          onPress: async () => {
            await onDetachFactura();
          },
        },
      ]
    );
  };

  // ==========================================
  // CASO 1: YA TIENE FACTURA VINCULADA
  // ==========================================
  if (gasto.factura_recibida_rel) {
    const fac = gasto.factura_recibida_rel;
    const propina = Number(gasto.monto_propina || 0);
    const esCompartida = Boolean(gasto.es_factura_compartida);
    const totalSat = Number(fac.total || 0);
    const totalConsumido = Number(fac.total_consumido || gasto.monto || 0);

    return (
      <View
        style={[
          styles.linkedCard,
          {
            backgroundColor: themeColors.success + '0F',
            borderColor: themeColors.success + '40',
          },
        ]}
      >
        <View style={styles.rowBetween}>
          <View style={styles.rowAlign}>
            <Ionicons name="shield-checkmark" size={18} color={themeColors.success} />
            <Text style={[styles.linkedTitle, { color: themeColors.success }]}>
              CFDI SAT Vinculado
            </Text>
          </View>

          {/* Badges especiales */}
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {propina > 0 && (
              <View style={[styles.badge, { backgroundColor: '#f59e0b20', borderColor: '#f59e0b50' }]}>
                <Ionicons name="restaurant-outline" size={12} color="#d97706" />
                <Text style={[styles.badgeText, { color: '#d97706' }]}>
                  Propina: +${propina.toFixed(2)}
                </Text>
              </View>
            )}
            {esCompartida && (
              <View style={[styles.badge, { backgroundColor: '#3b82f620', borderColor: '#3b82f650' }]}>
                <Ionicons name="git-branch-outline" size={12} color="#2563eb" />
                <Text style={[styles.badgeText, { color: '#2563eb' }]}>
                  Factura Compartida
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Proveedor y Emisor */}
        <Text style={[styles.emisorName, { color: themeColors.text }]}>
          {fac.nombre_emisor || 'Proveedor SAT'}
        </Text>
        <Text style={[styles.emisorRfc, { color: themeColors.textSecondary }]}>
          RFC: <Text style={{ fontWeight: '700', color: themeColors.text }}>{fac.rfc_emisor || 'N/D'}</Text> • Fecha: {fac.fecha_emision ? fac.fecha_emision.split('T')[0] : 'N/D'}
        </Text>

        {/* UUID con botón de copiar */}
        <View style={[styles.uuidRow, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
          <Ionicons name="key-outline" size={14} color={themeColors.textSecondary} />
          <Text style={[styles.uuidText, { color: themeColors.text }]} numberOfLines={1}>
            {fac.uuid}
          </Text>
          <TouchableOpacity
            onPress={() => handleCopyUuid(fac.uuid)}
            style={styles.copyBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="copy-outline" size={14} color={themeColors.accent} />
          </TouchableOpacity>
        </View>

        {/* Montos y Desglose */}
        <View style={[styles.amountsRow, { borderTopColor: themeColors.border }]}>
          <View style={styles.amountCol}>
            <Text style={[styles.amountLabel, { color: themeColors.textSecondary }]}>Monto Gasto</Text>
            <Text style={[styles.amountVal, { color: themeColors.text }]}>${Number(gasto.monto || 0).toFixed(2)}</Text>
          </View>
          <View style={styles.amountCol}>
            <Text style={[styles.amountLabel, { color: themeColors.textSecondary }]}>Total Timbrado SAT</Text>
            <Text style={[styles.amountVal, { color: themeColors.success }]}>${totalSat.toFixed(2)}</Text>
          </View>
          {propina > 0 && (
            <View style={styles.amountCol}>
              <Text style={[styles.amountLabel, { color: '#d97706' }]}>Propina</Text>
              <Text style={[styles.amountVal, { color: '#d97706' }]}>+${propina.toFixed(2)}</Text>
            </View>
          )}
          {esCompartida && (
            <View style={styles.amountCol}>
              <Text style={[styles.amountLabel, { color: '#2563eb' }]}>Consumido Total</Text>
              <Text style={[styles.amountVal, { color: '#2563eb' }]}>${totalConsumido.toFixed(2)}</Text>
            </View>
          )}
        </View>

        {/* Botones de acción */}
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity
            onPress={() => onPreviewFactura(fac)}
            style={[styles.btnOutline, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
          >
            <Ionicons name="eye-outline" size={14} color={themeColors.text} />
            <Text style={[styles.btnOutlineText, { color: themeColors.text }]}>Mostrar CFDI</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => onDownloadPdf(fac)}
            disabled={isExportingSatPdf}
            style={[styles.btnOutline, { backgroundColor: '#e74c3c', borderColor: '#e74c3c' }]}
          >
            {isExportingSatPdf ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="download-outline" size={14} color="#fff" />
                <Text style={[styles.btnOutlineText, { color: '#fff' }]}>Descargar PDF</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleConfirmDetach}
            disabled={isAttaching}
            style={[styles.btnOutline, { backgroundColor: themeColors.danger + '15', borderColor: themeColors.danger + '40' }]}
          >
            <Ionicons name="unlink-outline" size={14} color={themeColors.danger} />
            <Text style={[styles.btnOutlineText, { color: themeColors.danger }]}>Desvincular</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ==========================================
  // CASO 2: PANEL DE DECISIÓN DE CANDIDATA
  // ==========================================
  if (candidateFactura) {
    const gastoMonto = Number(gasto.monto || 0);
    const facTotal = Number(candidateFactura.total || 0);
    const diff = gastoMonto - facTotal;
    const esExacto = Math.abs(diff) < 0.01;
    const saldoDisp = Number(candidateFactura.saldo_disponible ?? facTotal);
    const otrosGastosCount = candidateFactura.otros_gastos?.length || 0;
    const finalPropina = isPropinaActive ? Number(montoPropina || 0) : 0;
    const consumoEfectivo = gastoMonto - finalPropina;
    const saldoInsuficiente = candidateFactura.es_ya_vinculada && saldoDisp < consumoEfectivo;

    return (
      <View style={[styles.candidateCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.accent }]}>
        <View style={styles.rowBetween}>
          <Text style={[styles.candidateTitle, { color: themeColors.accent }]}>
            Confirmar Vinculación de CFDI
          </Text>
          <TouchableOpacity onPress={() => setCandidateFactura(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle-outline" size={20} color={themeColors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Datos del CFDI candidato */}
        <View style={{ gap: 3, marginTop: 4 }}>
          <Text style={{ fontWeight: '800', fontSize: 13, color: themeColors.text }}>
            {candidateFactura.nombre_emisor || 'Proveedor SAT'}
          </Text>
          <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
            RFC: <Text style={{ fontWeight: '700', color: themeColors.text }}>{candidateFactura.rfc_emisor}</Text> • Fecha: {candidateFactura.fecha_emision ? candidateFactura.fecha_emision.split('T')[0] : 'N/D'}
          </Text>
          <Text style={{ fontSize: 10, color: themeColors.textSecondary }}>
            UUID: {candidateFactura.uuid}
          </Text>
        </View>

        {/* Resumen comparativo de montos */}
        <View style={[styles.amountsRow, { backgroundColor: themeColors.background, borderRadius: BorderRadius.small, padding: 8, marginVertical: 8 }]}>
          <View style={styles.amountCol}>
            <Text style={[styles.amountLabel, { color: themeColors.textSecondary }]}>Monto del Gasto</Text>
            <Text style={[styles.amountVal, { color: themeColors.text }]}>${gastoMonto.toFixed(2)}</Text>
          </View>
          <View style={styles.amountCol}>
            <Text style={[styles.amountLabel, { color: themeColors.textSecondary }]}>Total Factura SAT</Text>
            <Text style={[styles.amountVal, { color: themeColors.success }]}>${facTotal.toFixed(2)}</Text>
          </View>
          {candidateFactura.es_ya_vinculada && (
            <View style={styles.amountCol}>
              <Text style={[styles.amountLabel, { color: '#2563eb' }]}>Saldo Disponible</Text>
              <Text style={[styles.amountVal, { color: '#2563eb' }]}>${saldoDisp.toFixed(2)}</Text>
            </View>
          )}
        </View>

        {/* Notificación de Match Exacto */}
        {esExacto && (
          <View style={[styles.bannerAlert, { backgroundColor: themeColors.success + '15', borderColor: themeColors.success + '40' }]}>
            <Ionicons name="checkmark-circle" size={16} color={themeColors.success} />
            <Text style={{ fontSize: 11, color: themeColors.success, fontWeight: '700', flex: 1 }}>
              Coincidencia exacta de importe (${gastoMonto.toFixed(2)}).
            </Text>
          </View>
        )}

        {/* Notificación y Configuración de Propina (Gasto > Factura) */}
        {diff > 0.01 && (
          <View style={[styles.bannerAlert, { backgroundColor: '#f59e0b15', borderColor: '#f59e0b40', flexDirection: 'column', alignItems: 'flex-start' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="restaurant" size={16} color="#d97706" />
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#d97706' }}>
                Diferencia de ${diff.toFixed(2)} detectada
              </Text>
            </View>
            <Text style={{ fontSize: 11, color: themeColors.text, marginTop: 2 }}>
              El monto reportado es mayor al CFDI timbrado. ¿Corresponde a propina de restaurante/alimentos?
            </Text>

            <TouchableOpacity
              onPress={() => setIsPropinaActive(!isPropinaActive)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}
            >
              <Ionicons
                name={isPropinaActive ? 'checkbox' : 'square-outline'}
                size={18}
                color={isPropinaActive ? '#d97706' : themeColors.textSecondary}
              />
              <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text }}>
                Registrar propina en este gasto
              </Text>
            </TouchableOpacity>

            {isPropinaActive && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, width: '100%' }}>
                <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>Importe de propina ($):</Text>
                <TextInput
                  value={String(montoPropina)}
                  onChangeText={(val) => setMontoPropina(Number(val) || 0)}
                  keyboardType="numeric"
                  style={{
                    backgroundColor: themeColors.background,
                    borderWidth: 1,
                    borderColor: themeColors.border,
                    borderRadius: BorderRadius.small,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    fontSize: 12,
                    fontWeight: '700',
                    color: themeColors.text,
                    minWidth: 80,
                  }}
                />
              </View>
            )}
          </View>
        )}

        {/* Notificación y Configuración de Factura Compartida (Ya Vinculada) */}
        {candidateFactura.es_ya_vinculada && (
          <View style={[styles.bannerAlert, { backgroundColor: '#3b82f615', borderColor: '#3b82f640', flexDirection: 'column', alignItems: 'flex-start' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="git-branch" size={16} color="#2563eb" />
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#2563eb' }}>
                Factura ya vinculada ({otrosGastosCount} gasto{otrosGastosCount > 1 ? 's' : ''})
              </Text>
            </View>
            <Text style={{ fontSize: 11, color: themeColors.text, marginTop: 2 }}>
              Total: ${facTotal.toFixed(2)} • Consumido previo: ${Number(candidateFactura.total_consumido_otros || 0).toFixed(2)} • Saldo libre: ${saldoDisp.toFixed(2)}.
            </Text>

            {saldoInsuficiente && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <Ionicons name="alert-circle" size={14} color={themeColors.danger} />
                <Text style={{ fontSize: 11, color: themeColors.danger, fontWeight: '700' }}>
                  Atención: El saldo disponible (${saldoDisp.toFixed(2)}) es menor al gasto (${consumoEfectivo.toFixed(2)}).
                </Text>
              </View>
            )}

            <TouchableOpacity
              onPress={() => setIsCompartidaActive(!isCompartidaActive)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}
            >
              <Ionicons
                name={isCompartidaActive ? 'checkbox' : 'square-outline'}
                size={18}
                color={isCompartidaActive ? '#2563eb' : themeColors.textSecondary}
              />
              <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text }}>
                Vincular como Factura Compartida
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Factura mayor al gasto (Sin propina y sin gastos previos) */}
        {facTotal > gastoMonto && !candidateFactura.es_ya_vinculada && (
          <View style={[styles.bannerAlert, { backgroundColor: '#0284c715', borderColor: '#0284c740' }]}>
            <Ionicons name="information-circle" size={16} color="#0284c7" />
            <Text style={{ fontSize: 11, color: '#0284c7', flex: 1 }}>
              La factura es por un monto mayor (${facTotal.toFixed(2)}). El saldo remanente (${(facTotal - gastoMonto).toFixed(2)}) quedará disponible para otros gastos.
            </Text>
          </View>
        )}

        {/* Botones para Vincular */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <TouchableOpacity
            onPress={() => setCandidateFactura(null)}
            style={[styles.btnOutline, { backgroundColor: themeColors.background, borderColor: themeColors.border, flex: 1 }]}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.textSecondary }}>Cancelar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleConfirmAttach(false)}
            disabled={isAttaching}
            style={[styles.btnOutline, { backgroundColor: themeColors.accent, borderColor: themeColors.accent, flex: 2 }]}
          >
            {isAttaching ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="link-outline" size={14} color="#fff" />
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>Vincular Factura</Text>
              </>
            )}
          </TouchableOpacity>

          {gasto.status === 'PENDING' && (
            <TouchableOpacity
              onPress={() => handleConfirmAttach(true)}
              disabled={isAttaching}
              style={[styles.btnOutline, { backgroundColor: themeColors.success, borderColor: themeColors.success, flex: 2 }]}
            >
              <Ionicons name="checkmark-done" size={14} color="#fff" />
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>Vincular y Aprobar</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // ==========================================
  // CASO 3: SELECTOR (DROPZONE XML + BÚSQUEDA)
  // ==========================================
  return (
    <View style={{ gap: 8, marginBottom: Spacing.two }}>
      <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>
        VINCULAR FACTURA RECIBIDA (CFDI SAT)
      </Text>

      {/* Dropzone y botón de subida de XML */}
      <View
        // Soporte drag & drop en web
        {...(Platform.OS === 'web'
          ? {
              onDragOver: (e: any) => {
                e.preventDefault();
                setIsDragOver(true);
              },
              onDragLeave: () => setIsDragOver(false),
              onDrop: async (e: any) => {
                e.preventDefault();
                setIsDragOver(false);
                if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
                  const file = e.dataTransfer.files[0];
                  if (file.name.toLowerCase().endsWith('.xml')) {
                    const text = await file.text();
                    await processXmlString(text);
                  } else {
                    Alert.alert('Archivo Inválido', 'Por favor arrastra únicamente un archivo XML con timbre fiscal.');
                  }
                }
              },
            }
          : {})}
        style={[
          styles.dropzone,
          {
            backgroundColor: isDragOver ? themeColors.accent + '15' : themeColors.backgroundElement,
            borderColor: isDragOver ? themeColors.accent : themeColors.border,
          },
        ]}
      >
        {isProcessingXml ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 }}>
            <ActivityIndicator size="small" color={themeColors.accent} />
            <Text style={{ fontSize: 12, color: themeColors.text, fontWeight: '600' }}>
              Extrayendo CFDI y verificando con SAT...
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            onPress={handlePickXmlFile}
            style={{ width: '100%', alignItems: 'center', paddingVertical: 12, gap: 4 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="document-attach-outline" size={20} color={themeColors.accent} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: themeColors.accent }}>
                {Platform.OS === 'web' ? 'Arrastrar archivo XML aquí o Clic para Seleccionar' : 'Seleccionar Archivo XML del CFDI'}
              </Text>
            </View>
            <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
              Detecta automáticamente UUID, Emisor, Total y Propinas
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Buscador de facturas por texto */}
      <View style={{ position: 'relative' }}>
        <View style={[styles.searchInputContainer, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
          <Ionicons name="search-outline" size={16} color={themeColors.textSecondary} />
          <TextInput
            placeholder="O buscar por UUID, RFC o Proveedor..."
            placeholderTextColor={themeColors.textSecondary + '90'}
            value={searchQuery}
            onChangeText={handleSearchChange}
            onFocus={() => {
              if (searchResults.length > 0) setShowSearchResults(true);
            }}
            style={[styles.searchInput, { color: themeColors.text }]}
          />
          {isSearching ? (
            <ActivityIndicator size="small" color={themeColors.accent} />
          ) : searchQuery ? (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
                setSearchResults([]);
                setShowSearchResults(false);
              }}
            >
              <Ionicons name="close-circle" size={16} color={themeColors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Lista flotante de resultados de búsqueda */}
        {showSearchResults && searchResults.length > 0 && (
          <View style={[styles.dropdownResults, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            {searchResults.map((item) => (
              <TouchableOpacity
                key={item.id || item.uuid}
                onPress={() => selectCandidate(item)}
                style={[styles.resultItem, { borderBottomColor: themeColors.border }]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text }} numberOfLines={1}>
                    {item.nombre_emisor || 'Proveedor SAT'}
                  </Text>
                  <Text style={{ fontSize: 10, color: themeColors.textSecondary }}>
                    RFC: {item.rfc_emisor} • {item.fecha_emision ? item.fecha_emision.split('T')[0] : ''} • UUID: {item.uuid.slice(0, 16)}...
                  </Text>
                  {item.es_ya_vinculada && (
                    <Text style={{ fontSize: 10, color: '#2563eb', fontWeight: '700' }}>
                      ⚠️ Compartida ({item.gastos_vinculados?.length} gasto{item.gastos_vinculados?.length > 1 ? 's' : ''}) • Saldo disp: ${Number(item.saldo_disponible || 0).toFixed(2)}
                    </Text>
                  )}
                </View>

                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: themeColors.success }}>
                    ${Number(item.total || 0).toFixed(2)}
                  </Text>
                  <View style={[styles.selectChip, { backgroundColor: themeColors.accent + '20' }]}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: themeColors.accent }}>Seleccionar</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {showSearchResults && searchResults.length === 0 && !isSearching && searchQuery.length >= 3 && (
          <View style={[styles.dropdownResults, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, padding: 12, alignItems: 'center' }]}>
            <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
              No se encontraron facturas recibidas con "{searchQuery}"
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  linkedCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    padding: Spacing.two,
    gap: 8,
  },
  candidateCard: {
    borderWidth: 1.5,
    borderRadius: BorderRadius.small,
    padding: Spacing.two,
    gap: 6,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowAlign: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  linkedTitle: {
    fontSize: 12,
    fontWeight: '800',
  },
  candidateTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  emisorName: {
    fontSize: 13,
    fontWeight: '800',
  },
  emisorRfc: {
    fontSize: 11,
  },
  uuidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  uuidText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    flex: 1,
  },
  copyBtn: {
    padding: 2,
  },
  amountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 6,
    marginTop: 2,
  },
  amountCol: {
    gap: 2,
  },
  amountLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  amountVal: {
    fontSize: 12,
    fontWeight: '800',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  btnOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    paddingVertical: 7,
    borderRadius: BorderRadius.small,
  },
  btnOutlineText: {
    fontSize: 11,
    fontWeight: '700',
  },
  dropzone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.small,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    paddingHorizontal: 10,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    height: '100%',
  },
  dropdownResults: {
    position: 'absolute',
    top: 44,
    left: 0,
    right: 0,
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    maxHeight: 220,
    zIndex: 999,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
  },
  selectChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bannerAlert: {
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    padding: 8,
    gap: 6,
    marginVertical: 4,
  },
});
