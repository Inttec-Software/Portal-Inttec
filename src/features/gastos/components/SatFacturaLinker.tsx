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

type MotivoDiferenciaType = 'PARCIAL' | 'PROPINA' | 'COMISION_PLATAFORMA' | 'DIFERENCIA_AUTORIZADA' | null;

interface SatFacturaLinkerProps {
  gasto: Gasto;
  themeColors: any;
  onAttachFactura: (
    factura: any,
    approveDirectly: boolean,
    extra?: {
      monto_aplicado?: number;
      monto_propina?: number;
      es_compartida?: boolean;
      motivo_diferencia?: string | null;
      detalle_diferencia?: string | null;
    }
  ) => Promise<void>;
  onDetachFactura: (facturaId?: string) => Promise<void>;
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
  // Lista normalizada de facturas vinculadas actualmente al gasto
  const linkedFacturas = React.useMemo(() => {
    if (Array.isArray(gasto.facturas_recibidas_rel) && gasto.facturas_recibidas_rel.length > 0) {
      return gasto.facturas_recibidas_rel;
    }
    return gasto.factura_recibida_rel ? [gasto.factura_recibida_rel] : [];
  }, [gasto.facturas_recibidas_rel, gasto.factura_recibida_rel]);

  const gastoMonto = Number(gasto.monto || 0);
  const totalComprobado = React.useMemo(() => {
    if (linkedFacturas.length === 0) return 0;
    return linkedFacturas.reduce((sum, f: any) => {
      const aplicado =
        f.monto_aplicado !== undefined && f.monto_aplicado !== null
          ? Number(f.monto_aplicado)
          : Math.min(Number(f.total || 0), Math.max(0, gastoMonto - Number(gasto.monto_propina || 0)));
      return sum + aplicado;
    }, 0);
  }, [linkedFacturas, gastoMonto, gasto.monto_propina]);

  const saldoPendienteGasto = Math.max(0, gastoMonto - totalComprobado);

  // Búsqueda por texto / UUID
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const searchTimeoutRef = useRef<any>(null);

  // Procesamiento de XML y Dropzone
  const [isProcessingXml, setIsProcessingXml] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const dropzoneRef = useRef<any>(null);

  // Control de mostrar/ocultar formulario para agregar otra factura
  const [showAddForm, setShowAddForm] = useState<boolean>(
    linkedFacturas.length === 0 || saldoPendienteGasto > 0.05
  );

  // Confirmación de desvinculación individual por factura_id
  const [confirmingDetachId, setConfirmingDetachId] = useState<string | null>(null);

  // Candidata seleccionada para vinculación
  const [candidateFactura, setCandidateFactura] = useState<any | null>(null);
  const [montoAplicadoInput, setMontoAplicadoInput] = useState<string>('');

  // Configuración de propina, diferencia y factura compartida para la candidata
  const [montoPropina, setMontoPropina] = useState<number>(0);
  const [motivoDiferencia, setMotivoDiferencia] = useState<MotivoDiferenciaType>(null);
  const [detalleDiferencia, setDetalleDiferencia] = useState<string>('');
  const [isCompartidaActive, setIsCompartidaActive] = useState<boolean>(false);

  // Sincronizar apertura automática del buscador si cambia el gasto o queda saldo pendiente
  useEffect(() => {
    setCandidateFactura(null);
    setConfirmingDetachId(null);
    setShowAddForm(linkedFacturas.length === 0 || saldoPendienteGasto > 0.05);
  }, [gasto.id, linkedFacturas.length, saldoPendienteGasto]);

  // Prevenir que el navegador web abra el XML en otra pestaña al arrastrarlo
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const preventDefaultGlobal = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener('dragover', preventDefaultGlobal);
    window.addEventListener('drop', preventDefaultGlobal);

    const el = dropzoneRef.current as any;
    const domNode = el?.addEventListener ? el : el?._nativeNode;

    const handleDropNative = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        const file = e.dataTransfer.files[0];
        if (file.name.toLowerCase().endsWith('.xml')) {
          const text = await file.text();
          await processXmlString(text);
        } else {
          Alert.alert('Archivo Inválido', 'Por favor selecciona o arrastra un archivo XML válido de CFDI 4.0.');
        }
      }
    };

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
    };

    if (domNode) {
      domNode.addEventListener('dragenter', handleDragEnter);
      domNode.addEventListener('dragover', handleDragEnter);
      domNode.addEventListener('dragleave', handleDragLeave);
      domNode.addEventListener('drop', handleDropNative);
    }

    return () => {
      window.removeEventListener('dragover', preventDefaultGlobal);
      window.removeEventListener('drop', preventDefaultGlobal);
      if (domNode) {
        domNode.removeEventListener('dragenter', handleDragEnter);
        domNode.removeEventListener('dragover', handleDragEnter);
        domNode.removeEventListener('dragleave', handleDragLeave);
        domNode.removeEventListener('drop', handleDropNative);
      }
    };
  }, [showAddForm, candidateFactura]);

  // Copiar UUID al portapapeles
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
    if (!trimmed) {
      setSearchResults([]);
      setHasSearched(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
    try {
      const headers = await getApiHeaders();
      const res = await fetch(
        `${getApiUrl()}/api/facturas-recibidas/lookup?q=${encodeURIComponent(trimmed)}&gasto_id=${gasto.id}`,
        { headers }
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.facturas || []);
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
      setHasSearched(false);
      return;
    }
    searchTimeoutRef.current = setTimeout(() => {
      performLookup(text);
    }, 450);
  };

  // Procesar contenido XML (desde archivo o drag & drop)
  const processXmlString = async (xmlText: string) => {
    setIsProcessingXml(true);
    try {
      const parsed = parseCFDIXML(xmlText);
      if (!parsed || !parsed.uuid) {
        Alert.alert('XML Inválido', 'No se pudo extraer el Folio Fiscal (UUID) del archivo XML.');
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
            es_factura_compartida: false,
            otros_gastos: [],
          };
        } else {
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
            es_factura_compartida: false,
            otros_gastos: [],
          };
        }
      }

      selectCandidate(foundFactura);
      setSearchQuery('');
      setSearchResults([]);
      setHasSearched(false);
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

  // Calcular total comprobado excluyendo una factura específica (por si se re-selecciona)
  const getTotalComprobadoPrevio = (excludeFacturaId?: string) => {
    return linkedFacturas
      .filter((f: any) => f.id !== excludeFacturaId)
      .reduce((sum, f: any) => {
        const aplicado =
          f.monto_aplicado !== undefined && f.monto_aplicado !== null
            ? Number(f.monto_aplicado)
            : Math.min(Number(f.total || 0), Math.max(0, gastoMonto - Number(gasto.monto_propina || 0)));
        return sum + aplicado;
      }, 0);
  };

  // Seleccionar candidata y configurar condiciones de validación
  const selectCandidate = (fac: any) => {
    setCandidateFactura(fac);
    setSearchResults([]);
    setHasSearched(false);

    const comprobadoPrevio = getTotalComprobadoPrevio(fac.id);
    const pendienteGasto = Math.max(0, gastoMonto - comprobadoPrevio);
    const saldoDispFac = Number(fac.saldo_disponible ?? fac.total ?? 0);

    const defaultAplicado = Number(
      Math.min(saldoDispFac, pendienteGasto > 0 ? pendienteGasto : gastoMonto).toFixed(2)
    );
    setMontoAplicadoInput(String(defaultAplicado));

    const diffRestante = Math.max(0, gastoMonto - (comprobadoPrevio + defaultAplicado));
    if (diffRestante > 0.05) {
      const cat = (gasto.categoria || gasto.subcategoria || '').toLowerCase();
      if (cat.includes('comida') || cat.includes('alimento') || cat.includes('restaurante')) {
        setMotivoDiferencia('PROPINA');
        setMontoPropina(Number(diffRestante.toFixed(2)));
      } else {
        setMotivoDiferencia('PARCIAL');
        setMontoPropina(0);
      }
    } else {
      setMontoPropina(0);
      setMotivoDiferencia(null);
    }
    setDetalleDiferencia('');

    if (fac.es_factura_compartida || fac.es_ya_vinculada) {
      setIsCompartidaActive(true);
    } else {
      setIsCompartidaActive(false);
    }
  };

  // Cuando el usuario edita manualmente el monto que cubre la factura
  const handleMontoAplicadoChange = (val: string) => {
    setMontoAplicadoInput(val);
    if (!candidateFactura) return;
    const num = Math.max(0, Number(val) || 0);
    const comprobadoPrevio = getTotalComprobadoPrevio(candidateFactura.id);
    const diffRestante = Math.max(0, gastoMonto - (comprobadoPrevio + num));

    if (diffRestante <= 0.05) {
      setMotivoDiferencia(null);
      setMontoPropina(0);
    } else if (!motivoDiferencia) {
      setMotivoDiferencia('PARCIAL');
    } else if (motivoDiferencia === 'PROPINA') {
      setMontoPropina(Number(diffRestante.toFixed(2)));
    }
  };

  // Ejecutar vinculación
  const handleConfirmAttach = async (approveDirectly: boolean) => {
    if (!candidateFactura) return;

    const montoAplicadoNum = Math.max(0, Number(montoAplicadoInput) || 0);
    const propinaFinal = motivoDiferencia === 'PROPINA' ? Math.max(0, Number(montoPropina) || 0) : 0;
    const isCompartidaFinal = Boolean(isCompartidaActive || candidateFactura.es_factura_compartida);

    await onAttachFactura(candidateFactura, approveDirectly, {
      monto_aplicado: montoAplicadoNum,
      monto_propina: propinaFinal,
      es_compartida: isCompartidaFinal,
      motivo_diferencia: motivoDiferencia,
      detalle_diferencia: detalleDiferencia.trim() || null,
    });

    setCandidateFactura(null);
  };

  const renderLinkedFacturaCard = (fac: any, idx: number) => {
    const totalSat = Number(fac.total || 0);
    const montoAplicado =
      fac.monto_aplicado !== undefined && fac.monto_aplicado !== null
        ? Number(fac.monto_aplicado)
        : Math.min(totalSat, Math.max(0, gastoMonto - Number(gasto.monto_propina || 0)));
    const esCompartida = Boolean(Number(fac.total_gastos_vinculados || 0) > 1 || gasto.es_factura_compartida);
    const totalConsumido = Number(fac.total_consumido || montoAplicado);
    const isConfirming = confirmingDetachId === fac.id;

    return (
      <View
        key={fac.id || idx}
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
            <Ionicons name="shield-checkmark" size={16} color={themeColors.success} />
            <Text style={[styles.linkedTitle, { color: themeColors.success }]}>
              {linkedFacturas.length > 1 ? `CFDI #${idx + 1} Vinculado` : 'CFDI SAT Vinculado'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            <View style={[styles.badge, { backgroundColor: themeColors.success + '20', borderColor: themeColors.success + '50' }]}>
              <Text style={[styles.badgeText, { color: themeColors.success }]}>
                Aplicado: ${montoAplicado.toFixed(2)}
              </Text>
            </View>
            {esCompartida && (
              <View style={[styles.badge, { backgroundColor: '#3b82f620', borderColor: '#3b82f650' }]}>
                <Ionicons name="git-branch-outline" size={12} color="#2563eb" />
                <Text style={[styles.badgeText, { color: '#2563eb' }]}>Compartida</Text>
              </View>
            )}
          </View>
        </View>

        <Text style={[styles.emisorName, { color: themeColors.text }]}>
          {fac.nombre_emisor || 'Proveedor SAT'}
        </Text>
        <Text style={[styles.emisorRfc, { color: themeColors.textSecondary }]}>
          RFC: <Text style={{ fontWeight: '700', color: themeColors.text }}>{fac.rfc_emisor || 'N/D'}</Text> • Fecha: {fac.fecha_emision ? fac.fecha_emision.split('T')[0] : 'N/D'}
        </Text>

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

        <View style={[styles.amountsRow, { borderTopColor: themeColors.border }]}>
          <View style={styles.amountCol}>
            <Text style={[styles.amountLabel, { color: themeColors.textSecondary }]}>Aplicado al Gasto</Text>
            <Text style={[styles.amountVal, { color: themeColors.text }]}>${montoAplicado.toFixed(2)}</Text>
          </View>
          <View style={styles.amountCol}>
            <Text style={[styles.amountLabel, { color: themeColors.textSecondary }]}>Total Timbrado SAT</Text>
            <Text style={[styles.amountVal, { color: themeColors.success }]}>${totalSat.toFixed(2)}</Text>
          </View>
          {esCompartida && (
            <View style={styles.amountCol}>
              <Text style={[styles.amountLabel, { color: '#2563eb' }]}>Consumido Total</Text>
              <Text style={[styles.amountVal, { color: '#2563eb' }]}>${totalConsumido.toFixed(2)}</Text>
            </View>
          )}
        </View>

        {isConfirming ? (
          <View style={[styles.bannerAlert, { backgroundColor: themeColors.danger + '15', borderColor: themeColors.danger + '50', marginTop: 4 }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.danger }}>
                ¿Desvincular esta factura del gasto?
              </Text>
              <Text style={{ fontSize: 11, color: themeColors.text, marginVertical: 3 }}>
                Se liberarán ${montoAplicado.toFixed(2)} de saldo por comprobar en el gasto.
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <TouchableOpacity
                  onPress={() => setConfirmingDetachId(null)}
                  style={[styles.btnOutline, { flex: 1, backgroundColor: themeColors.background, borderColor: themeColors.border }]}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.textSecondary }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={async () => {
                    setConfirmingDetachId(null);
                    await onDetachFactura(fac.id);
                  }}
                  disabled={isAttaching}
                  style={[styles.btnOutline, { flex: 1, backgroundColor: themeColors.danger, borderColor: themeColors.danger }]}
                >
                  {isAttaching ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>Sí, Desvincular</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
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
                  <Text style={[styles.btnOutlineText, { color: '#fff' }]}>PDF</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setConfirmingDetachId(fac.id)}
              disabled={isAttaching}
              style={[styles.btnOutline, { backgroundColor: themeColors.danger + '15', borderColor: themeColors.danger + '40' }]}
            >
              <Ionicons name="unlink-outline" size={14} color={themeColors.danger} />
              <Text style={[styles.btnOutlineText, { color: themeColors.danger }]}>Desvincular</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  // ==========================================
  // RENDER CANDIDATA SELECCIONADA
  // ==========================================
  const renderCandidatePanel = () => {
    if (!candidateFactura) return null;

    const facTotal = Number(candidateFactura.total || 0);
    const saldoDisp = Number(candidateFactura.saldo_disponible ?? facTotal);
    const comprobadoPrevio = getTotalComprobadoPrevio(candidateFactura.id);
    const pendienteAntesDeEsta = Math.max(0, gastoMonto - comprobadoPrevio);

    const montoAplicadoNum = Math.max(0, Number(montoAplicadoInput) || 0);
    const nuevoTotalComprobado = comprobadoPrevio + montoAplicadoNum;
    const diffRestante = Math.max(0, gastoMonto - nuevoTotalComprobado);
    const excedeGasto = nuevoTotalComprobado > gastoMonto + 0.05;
    const excedeFactura = montoAplicadoNum > facTotal + 0.05;

    const finalPropina = motivoDiferencia === 'PROPINA' ? Number(montoPropina || 0) : 0;

    // Validación 1: Factura ya vinculada a otro(s) gasto(s) y NO compartida -> BLOQUEO TOTAL
    const estaBloqueadaPorNoCompartida = candidateFactura.es_ya_vinculada && !candidateFactura.es_factura_compartida;

    // Validación 2: Factura compartida pero sin saldo suficiente para montoAplicadoNum -> BLOQUEO TOTAL
    const estaBloqueadaPorSaldoInsuficiente =
      candidateFactura.es_ya_vinculada &&
      candidateFactura.es_factura_compartida &&
      saldoDisp < montoAplicadoNum - 0.05;

    // Validación 3: Monto cubierto < total de la factura sin marcarla como compartida
    const esFacturaMayorQueAplicado = facTotal > montoAplicadoNum + 0.05;
    const requiereMarcarCompartida = !candidateFactura.es_ya_vinculada && esFacturaMayorQueAplicado && !isCompartidaActive;

    // Validación 4: Queda diferencia en el gasto sin clasificar
    const hayDiferenciaSinComprobar = diffRestante > 0.05;
    const requiereResolverDiferencia =
      hayDiferenciaSinComprobar &&
      (!motivoDiferencia || (motivoDiferencia === 'PROPINA' && Math.abs(diffRestante - finalPropina) > 0.05));

    const montoInvalido = montoAplicadoNum <= 0 || excedeGasto || excedeFactura;

    const puedeVincular =
      !montoInvalido &&
      !estaBloqueadaPorNoCompartida &&
      !estaBloqueadaPorSaldoInsuficiente &&
      !requiereMarcarCompartida &&
      !requiereResolverDiferencia;

    return (
      <View style={[styles.candidateCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.accent }]}>
        <View style={styles.rowBetween}>
          <Text style={[styles.candidateTitle, { color: themeColors.accent }]}>
            Revisión de Factura Recibida
          </Text>
          <TouchableOpacity onPress={() => setCandidateFactura(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle-outline" size={20} color={themeColors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Datos del CFDI candidato */}
        <View style={{ gap: 2, marginTop: 4 }}>
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
        <View style={[styles.amountsRow, { backgroundColor: themeColors.background, borderRadius: BorderRadius.small, padding: 8, marginVertical: 6 }]}>
          <View style={styles.amountCol}>
            <Text style={[styles.amountLabel, { color: themeColors.textSecondary }]}>Pendiente del Gasto</Text>
            <Text style={[styles.amountVal, { color: themeColors.text }]}>${pendienteAntesDeEsta.toFixed(2)}</Text>
          </View>
          <View style={styles.amountCol}>
            <Text style={[styles.amountLabel, { color: themeColors.textSecondary }]}>Total Factura SAT</Text>
            <Text style={[styles.amountVal, { color: themeColors.success }]}>${facTotal.toFixed(2)}</Text>
          </View>
          {candidateFactura.es_ya_vinculada && (
            <View style={styles.amountCol}>
              <Text style={[styles.amountLabel, { color: '#2563eb' }]}>Saldo Disp. CFDI</Text>
              <Text style={[styles.amountVal, { color: saldoDisp < montoAplicadoNum ? themeColors.danger : '#2563eb' }]}>
                ${saldoDisp.toFixed(2)}
              </Text>
            </View>
          )}
        </View>

        {/* Input obligatorio de monto que cubre del gasto */}
        {!estaBloqueadaPorNoCompartida && (
          <View style={[styles.montoAplicadoBox, { backgroundColor: themeColors.background, borderColor: montoInvalido ? themeColors.danger : themeColors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.text }}>
                Monto del gasto que cubre esta factura ($):
              </Text>
              <Text style={{ fontSize: 10, color: themeColors.textSecondary }}>
                Indica exactamente cuánto de este gasto ampara este CFDI.
              </Text>
            </View>
            <TextInput
              value={montoAplicadoInput}
              onChangeText={handleMontoAplicadoChange}
              keyboardType="numeric"
              style={{
                backgroundColor: themeColors.backgroundElement,
                borderWidth: 1,
                borderColor: montoInvalido ? themeColors.danger : themeColors.accent,
                borderRadius: BorderRadius.small,
                paddingHorizontal: 10,
                paddingVertical: 6,
                fontSize: 14,
                fontWeight: '800',
                color: themeColors.text,
                minWidth: 100,
                textAlign: 'right',
              }}
            />
          </View>
        )}

        {excedeGasto && (
          <Text style={{ fontSize: 11, color: themeColors.danger, fontWeight: '700' }}>
            El monto aplicado excede el saldo pendiente por comprobar del gasto (${pendienteAntesDeEsta.toFixed(2)}).
          </Text>
        )}
        {excedeFactura && (
          <Text style={{ fontSize: 11, color: themeColors.danger, fontWeight: '700' }}>
            El monto aplicado no puede superar el total de la factura (${facTotal.toFixed(2)}).
          </Text>
        )}

        {/* 1. BLOQUEO: Factura ya vinculada y NO compartida */}
        {estaBloqueadaPorNoCompartida && (
          <View style={[styles.bannerAlert, { backgroundColor: themeColors.danger + '18', borderColor: themeColors.danger }]}>
            <Ionicons name="close-circle" size={18} color={themeColors.danger} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: themeColors.danger }}>
                FACTURA YA VINCULADA (BLOQUEADA)
              </Text>
              <Text style={{ fontSize: 11, color: themeColors.text }}>
                Esta factura ya se encuentra vinculada de manera exclusiva al Gasto #{candidateFactura.otros_gastos[0]?.id?.slice(0, 8)} ({candidateFactura.otros_gastos[0]?.empleado_nombre || 'Empleado'}) por ${Number(candidateFactura.otros_gastos[0]?.monto || 0).toFixed(2)}. No puede asignarse a más gastos.
              </Text>
            </View>
          </View>
        )}

        {/* 2. BLOQUEO: Saldo insuficiente en factura compartida */}
        {estaBloqueadaPorSaldoInsuficiente && (
          <View style={[styles.bannerAlert, { backgroundColor: themeColors.danger + '18', borderColor: themeColors.danger }]}>
            <Ionicons name="alert-circle" size={18} color={themeColors.danger} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: themeColors.danger }}>
                SALDO INSUFICIENTE EN FACTURA COMPARTIDA
              </Text>
              <Text style={{ fontSize: 11, color: themeColors.text }}>
                El saldo libre de esta factura es de ${saldoDisp.toFixed(2)}, pero indicaste aplicar ${montoAplicadoNum.toFixed(2)}. Ajusta el monto aplicado.
              </Text>
            </View>
          </View>
        )}

        {/* 3. PERMITIDO: Factura compartida con saldo suficiente */}
        {candidateFactura.es_ya_vinculada && candidateFactura.es_factura_compartida && !estaBloqueadaPorSaldoInsuficiente && (
          <View style={[styles.bannerAlert, { backgroundColor: '#3b82f615', borderColor: '#3b82f640' }]}>
            <Ionicons name="git-branch" size={16} color="#2563eb" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#2563eb' }}>
                Factura Compartida Válida
              </Text>
              <Text style={{ fontSize: 11, color: themeColors.text }}>
                Saldo actual: ${saldoDisp.toFixed(2)} • Aplicado aquí: ${montoAplicadoNum.toFixed(2)} • Saldo libre restante: ${(saldoDisp - montoAplicadoNum).toFixed(2)}.
              </Text>
            </View>
          </View>
        )}

        {/* 4. REGLA: Factura mayor al monto aplicado sin marcarse como compartida */}
        {!candidateFactura.es_ya_vinculada && esFacturaMayorQueAplicado && !excedeFactura && (
          <View style={[styles.bannerAlert, { backgroundColor: isCompartidaActive ? '#3b82f615' : '#f59e0b15', borderColor: isCompartidaActive ? '#3b82f640' : '#f59e0b50', flexDirection: 'column', alignItems: 'flex-start' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="alert-circle" size={16} color={isCompartidaActive ? '#2563eb' : '#d97706'} />
              <Text style={{ fontSize: 12, fontWeight: '800', color: isCompartidaActive ? '#2563eb' : '#d97706' }}>
                Factura Mayor al Monto Aplicado (${facTotal.toFixed(2)} vs ${montoAplicadoNum.toFixed(2)})
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => setIsCompartidaActive(!isCompartidaActive)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}
            >
              <Ionicons
                name={isCompartidaActive ? 'checkbox' : 'square-outline'}
                size={18}
                color={isCompartidaActive ? '#2563eb' : themeColors.textSecondary}
              />
              <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text }}>
                Declarar como Factura Compartida (el saldo restante quedará libre)
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 5. REGLA: Queda saldo pendiente del gasto tras aplicar esta factura */}
        {!estaBloqueadaPorNoCompartida && !montoInvalido && hayDiferenciaSinComprobar && (
          <View style={[styles.bannerAlert, { backgroundColor: '#f59e0b10', borderColor: '#f59e0b40', flexDirection: 'column', alignItems: 'stretch' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="warning-outline" size={16} color="#d97706" />
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#d97706' }}>
                Saldo restante sin comprobar: ${diffRestante.toFixed(2)}
              </Text>
            </View>
            <Text style={{ fontSize: 11, color: themeColors.text, marginTop: 2 }}>
              Con esta factura el gasto queda comprobado en ${nuevoTotalComprobado.toFixed(2)} de ${gastoMonto.toFixed(2)}. Selecciona qué representa el resto:
            </Text>

            <View style={{ gap: 6, marginTop: 8 }}>
              {/* Opción 0: PARCIAL (Falta otra factura) */}
              <TouchableOpacity
                onPress={() => {
                  setMotivoDiferencia('PARCIAL');
                  setMontoPropina(0);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  padding: 8,
                  borderRadius: BorderRadius.small,
                  borderWidth: 1,
                  backgroundColor: motivoDiferencia === 'PARCIAL' ? '#3b82f620' : themeColors.background,
                  borderColor: motivoDiferencia === 'PARCIAL' ? '#2563eb' : themeColors.border,
                }}
              >
                <Ionicons
                  name={motivoDiferencia === 'PARCIAL' ? 'radio-button-on' : 'radio-button-off'}
                  size={16}
                  color={motivoDiferencia === 'PARCIAL' ? '#2563eb' : themeColors.textSecondary}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.text }}>
                    Falta otra factura (comprobación parcial • pendiente ${diffRestante.toFixed(2)})
                  </Text>
                  <Text style={{ fontSize: 10, color: themeColors.textSecondary }}>
                    Se agregarán una o más facturas adicionales para cubrir las partidas restantes del gasto.
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Opción 1: PROPINA */}
              <TouchableOpacity
                onPress={() => {
                  setMotivoDiferencia('PROPINA');
                  setMontoPropina(Number(diffRestante.toFixed(2)));
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  padding: 8,
                  borderRadius: BorderRadius.small,
                  borderWidth: 1,
                  backgroundColor: motivoDiferencia === 'PROPINA' ? '#f59e0b20' : themeColors.background,
                  borderColor: motivoDiferencia === 'PROPINA' ? '#d97706' : themeColors.border,
                }}
              >
                <Ionicons
                  name={motivoDiferencia === 'PROPINA' ? 'radio-button-on' : 'radio-button-off'}
                  size={16}
                  color={motivoDiferencia === 'PROPINA' ? '#d97706' : themeColors.textSecondary}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.text }}>
                    Propina en Alimentos / Restaurante (+${diffRestante.toFixed(2)})
                  </Text>
                  <Text style={{ fontSize: 10, color: themeColors.textSecondary }}>
                    El restaurante timbró solo el consumo; la propina se pagó voluntariamente.
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Opción 2: COMISION_PLATAFORMA */}
              <TouchableOpacity
                onPress={() => {
                  setMotivoDiferencia('COMISION_PLATAFORMA');
                  setMontoPropina(0);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  padding: 8,
                  borderRadius: BorderRadius.small,
                  borderWidth: 1,
                  backgroundColor: motivoDiferencia === 'COMISION_PLATAFORMA' ? '#8b5cf620' : themeColors.background,
                  borderColor: motivoDiferencia === 'COMISION_PLATAFORMA' ? '#7c3aed' : themeColors.border,
                }}
              >
                <Ionicons
                  name={motivoDiferencia === 'COMISION_PLATAFORMA' ? 'radio-button-on' : 'radio-button-off'}
                  size={16}
                  color={motivoDiferencia === 'COMISION_PLATAFORMA' ? '#7c3aed' : themeColors.textSecondary}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.text }}>
                    Comisión de Plataforma / Intermediario (+${diffRestante.toFixed(2)})
                  </Text>
                  <Text style={{ fontSize: 10, color: themeColors.textSecondary }}>
                    Para Expedia, Booking, Uber, etc., donde el proveedor timbró un monto menor al cobro total.
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Opción 3: DIFERENCIA_AUTORIZADA */}
              <TouchableOpacity
                onPress={() => {
                  setMotivoDiferencia('DIFERENCIA_AUTORIZADA');
                  setMontoPropina(0);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  padding: 8,
                  borderRadius: BorderRadius.small,
                  borderWidth: 1,
                  backgroundColor: motivoDiferencia === 'DIFERENCIA_AUTORIZADA' ? '#64748b20' : themeColors.background,
                  borderColor: motivoDiferencia === 'DIFERENCIA_AUTORIZADA' ? '#475569' : themeColors.border,
                }}
              >
                <Ionicons
                  name={motivoDiferencia === 'DIFERENCIA_AUTORIZADA' ? 'radio-button-on' : 'radio-button-off'}
                  size={16}
                  color={motivoDiferencia === 'DIFERENCIA_AUTORIZADA' ? '#475569' : themeColors.textSecondary}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.text }}>
                    Otra Diferencia Autorizada por Administración
                  </Text>
                  <Text style={{ fontSize: 10, color: themeColors.textSecondary }}>
                    Variación aceptada administrativamente que se absorbe sin comprobante fiscal.
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {motivoDiferencia === 'PROPINA' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, width: '100%' }}>
                <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>Confirmar importe de propina ($):</Text>
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
                {Math.abs(diffRestante - (Number(montoPropina) || 0)) > 0.05 && (
                  <Text style={{ fontSize: 10, color: themeColors.danger, fontWeight: '600', flex: 1 }}>
                    La propina debe ser ${diffRestante.toFixed(2)} para cuadrar con el gasto.
                  </Text>
                )}
              </View>
            )}

            {(motivoDiferencia === 'COMISION_PLATAFORMA' || motivoDiferencia === 'DIFERENCIA_AUTORIZADA') && (
              <View style={{ marginTop: 8, width: '100%' }}>
                <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginBottom: 4 }}>
                  Detalle / Justificación (opcional):
                </Text>
                <TextInput
                  value={detalleDiferencia}
                  onChangeText={setDetalleDiferencia}
                  placeholder={
                    motivoDiferencia === 'COMISION_PLATAFORMA'
                      ? 'Ej: Comisión por intermediación Expedia / Booking'
                      : 'Ej: Cargo por servicio administrativo autorizado'
                  }
                  placeholderTextColor={themeColors.textSecondary}
                  style={{
                    backgroundColor: themeColors.background,
                    borderWidth: 1,
                    borderColor: themeColors.border,
                    borderRadius: BorderRadius.small,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    fontSize: 12,
                    color: themeColors.text,
                  }}
                />
              </View>
            )}
          </View>
        )}

        {/* 6. Coincidencia Total */}
        {!estaBloqueadaPorNoCompartida && !montoInvalido && !hayDiferenciaSinComprobar && (
          <View style={[styles.bannerAlert, { backgroundColor: themeColors.success + '15', borderColor: themeColors.success + '40' }]}>
            <Ionicons name="checkmark-circle" size={16} color={themeColors.success} />
            <Text style={{ fontSize: 11, color: themeColors.success, fontWeight: '700', flex: 1 }}>
              El gasto queda 100% comprobado (${gastoMonto.toFixed(2)}).
            </Text>
          </View>
        )}

        {/* Botones de Acción */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <TouchableOpacity
            onPress={() => setCandidateFactura(null)}
            style={[styles.btnOutline, { backgroundColor: themeColors.background, borderColor: themeColors.border, flex: 1 }]}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.textSecondary }}>Cancelar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleConfirmAttach(false)}
            disabled={!puedeVincular || isAttaching}
            style={[
              styles.btnOutline,
              {
                backgroundColor: puedeVincular ? themeColors.accent : themeColors.border,
                borderColor: puedeVincular ? themeColors.accent : themeColors.border,
                flex: 2,
              },
            ]}
          >
            {isAttaching ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="link-outline" size={14} color="#fff" />
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>
                  {puedeVincular ? 'Vincular Factura' : 'No Permitido'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {gasto.status === 'PENDING' && puedeVincular && !hayDiferenciaSinComprobar && (
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
  };

  const renderAddFacturaForm = () => {
    return (
      <View style={{ gap: 10 }}>
        {/* Dropzone y selector de XML */}
        <View
          ref={dropzoneRef}
          style={[
            styles.dropzone,
            {
              backgroundColor: isDragOver ? themeColors.accent + '20' : themeColors.backgroundElement,
              borderColor: isDragOver ? themeColors.accent : themeColors.border,
            },
          ]}
        >
          {isProcessingXml ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14 }}>
              <ActivityIndicator size="small" color={themeColors.accent} />
              <Text style={{ fontSize: 12, color: themeColors.text, fontWeight: '600' }}>
                Leyendo CFDI y validando contra el SAT...
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              onPress={handlePickXmlFile}
              style={{ width: '100%', alignItems: 'center', paddingVertical: 14, gap: 4 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="cloud-upload-outline" size={22} color={themeColors.accent} />
                <Text style={{ fontSize: 13, fontWeight: '800', color: themeColors.accent }}>
                  Seleccionar o Arrastrar Archivo XML
                </Text>
              </View>
              <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                Extrae UUID, emisor e importes automáticamente
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Buscador de facturas e ingreso de UUID manual */}
        <View style={{ gap: 6 }}>
          <View style={[styles.searchInputContainer, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <Ionicons name="search-outline" size={16} color={themeColors.textSecondary} />
            <TextInput
              placeholder="Pegar Folio Fiscal (UUID) o buscar por RFC / Proveedor..."
              placeholderTextColor={themeColors.textSecondary + '90'}
              value={searchQuery}
              onChangeText={handleSearchChange}
              onSubmitEditing={() => performLookup(searchQuery)}
              style={[styles.searchInput, { color: themeColors.text }]}
              autoCapitalize="characters"
            />
            {isSearching ? (
              <ActivityIndicator size="small" color={themeColors.accent} />
            ) : searchQuery ? (
              <TouchableOpacity
                onPress={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                  setHasSearched(false);
                }}
              >
                <Ionicons name="close-circle" size={16} color={themeColors.textSecondary} />
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              onPress={() => performLookup(searchQuery)}
              disabled={!searchQuery.trim() || isSearching}
              style={{
                backgroundColor: searchQuery.trim() ? themeColors.accent : themeColors.border,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: BorderRadius.small,
                marginLeft: 4,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>Buscar</Text>
            </TouchableOpacity>
          </View>

          {searchResults.length > 0 && (
            <View style={[styles.inlineResultsContainer, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: themeColors.textSecondary, marginBottom: 4, textTransform: 'uppercase' }}>
                Facturas encontradas ({searchResults.length}):
              </Text>
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
                      RFC: {item.rfc_emisor} • {item.fecha_emision ? item.fecha_emision.split('T')[0] : ''}
                    </Text>
                    <Text style={{ fontSize: 10, color: themeColors.textSecondary }}>
                      UUID: {item.uuid}
                    </Text>
                    {item.es_ya_vinculada && (
                      <Text style={{ fontSize: 10, color: item.es_factura_compartida ? '#2563eb' : themeColors.danger, fontWeight: '700' }}>
                        {item.es_factura_compartida
                          ? `🔗 Compartida (${item.gastos_vinculados?.length} gastos) • Saldo disp: $${Number(item.saldo_disponible || 0).toFixed(2)}`
                          : `🚫 Vinculada exclusivamente a otro gasto`}
                      </Text>
                    )}
                  </View>

                  <View style={{ alignItems: 'flex-end', gap: 4, marginLeft: 8 }}>
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

          {hasSearched && searchResults.length === 0 && !isSearching && searchQuery.length >= 3 && (
            <View style={[styles.inlineResultsContainer, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, padding: 12, alignItems: 'center' }]}>
              <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                No se encontró ninguna factura recibida con "{searchQuery}"
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const propinaTotal = Number(gasto.monto_propina || 0);

  return (
    <View style={{ gap: 10, marginBottom: Spacing.two }}>
      <View style={styles.rowBetween}>
        <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>
          FACTURAS RECIBIDAS (CFDI SAT)
        </Text>
        {linkedFacturas.length > 0 && (
          <View
            style={[
              styles.badge,
              {
                backgroundColor: saldoPendienteGasto <= 0.05 ? themeColors.success + '18' : '#f59e0b18',
                borderColor: saldoPendienteGasto <= 0.05 ? themeColors.success + '45' : '#f59e0b45',
              },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                { color: saldoPendienteGasto <= 0.05 ? themeColors.success : '#d97706' },
              ]}
            >
              Comprobado: ${totalComprobado.toFixed(2)} / ${gastoMonto.toFixed(2)}
              {saldoPendienteGasto > 0.05 ? ` (Falta $${saldoPendienteGasto.toFixed(2)})` : ''}
            </Text>
          </View>
        )}
      </View>

      {/* Badges globales de propina / diferencia en el gasto */}
      {linkedFacturas.length > 0 && (propinaTotal > 0 || (gasto.motivo_sin_factura && (gasto.motivo_sin_factura.startsWith('COMISION_PLATAFORMA') || gasto.motivo_sin_factura.startsWith('DIFERENCIA_AUTORIZADA')))) && (
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {propinaTotal > 0 && (
            <View style={[styles.badge, { backgroundColor: '#f59e0b20', borderColor: '#f59e0b50' }]}>
              <Ionicons name="restaurant-outline" size={12} color="#d97706" />
              <Text style={[styles.badgeText, { color: '#d97706' }]}>Propina: +${propinaTotal.toFixed(2)}</Text>
            </View>
          )}
          {gasto.motivo_sin_factura?.startsWith('COMISION_PLATAFORMA') && (
            <View style={[styles.badge, { backgroundColor: '#8b5cf620', borderColor: '#8b5cf650' }]}>
              <Ionicons name="globe-outline" size={12} color="#7c3aed" />
              <Text style={[styles.badgeText, { color: '#7c3aed' }]}>{gasto.motivo_sin_factura}</Text>
            </View>
          )}
          {gasto.motivo_sin_factura?.startsWith('DIFERENCIA_AUTORIZADA') && (
            <View style={[styles.badge, { backgroundColor: '#64748b20', borderColor: '#64748b50' }]}>
              <Ionicons name="shield-outline" size={12} color="#475569" />
              <Text style={[styles.badgeText, { color: '#475569' }]}>{gasto.motivo_sin_factura}</Text>
            </View>
          )}
        </View>
      )}

      {/* Lista de facturas ya vinculadas */}
      {linkedFacturas.length > 0 && (
        <View style={{ gap: 8 }}>
          {linkedFacturas.map((fac, idx) => renderLinkedFacturaCard(fac, idx))}
        </View>
      )}

      {/* Candidata seleccionada o botón/buscador para agregar otra factura */}
      {candidateFactura ? (
        renderCandidatePanel()
      ) : (
        <>
          {linkedFacturas.length > 0 && (
            <TouchableOpacity
              onPress={() => setShowAddForm(!showAddForm)}
              style={[
                styles.addAnotherBtn,
                {
                  backgroundColor: showAddForm ? themeColors.backgroundElement : themeColors.accent + '12',
                  borderColor: showAddForm ? themeColors.border : themeColors.accent + '50',
                },
              ]}
            >
              <Ionicons
                name={showAddForm ? 'chevron-up-outline' : 'add-circle-outline'}
                size={16}
                color={showAddForm ? themeColors.textSecondary : themeColors.accent}
              />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: showAddForm ? themeColors.textSecondary : themeColors.accent,
                }}
              >
                {showAddForm ? 'Ocultar buscador de facturas' : '+ Agregar otra factura'}
              </Text>
            </TouchableOpacity>
          )}

          {(linkedFacturas.length === 0 || showAddForm) && renderAddFacturaForm()}
        </>
      )}
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
    flexWrap: 'wrap',
    gap: 6,
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
  montoAplicadoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    padding: 8,
    marginVertical: 2,
  },
  addAnotherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    paddingVertical: 8,
    paddingHorizontal: 12,
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
    gap: 6,
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    paddingHorizontal: 10,
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    height: '100%',
  },
  inlineResultsContainer: {
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    padding: 8,
    gap: 4,
    marginTop: 4,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
  },
  selectChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bannerAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    padding: 8,
    gap: 6,
    marginVertical: 4,
  },
});
