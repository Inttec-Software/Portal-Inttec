import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
  FlatList,
  Modal,
  Image,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Gasto, GastoHelper, AuditoriaService, AuditoriaTarjeta, supabase } from '@/services/supabase';
import { getApiHeaders, getApiUrl } from '@/services/apiHelper';
import ImageViewerModal from '@/components/ImageViewerModal';
import GastoFotosGallery from '@/components/GastoFotosGallery';
import { AuditoriaTarjetaSkeleton } from '@/components/skeleton';
import { useAuth } from '@/context/AuthContext';
import { CardMovement, parseExcelStatement, ParseExcelResult } from '@/utils/excelStatementParser';
import {
  MatchedPair,
  ReconciliationResult,
  reconcileCardAndGastos,
  exportReconciliationToExcel,
  parseDateMs,
} from '@/utils/cardReconciliationMatcher';

// ─── Constantes ───────────────────────────────────────────────────────────────

const TARJETAS = [
  { key: 'BBVA', label: 'BBVA', color: '#004A97' },
  { key: 'AMEX', label: 'AMEX', color: '#016FD0' },
  { key: 'MARRIOT', label: 'Marriott', color: '#B5121B' },
  { key: 'BANORTE', label: 'Banorte', color: '#C8102E' },
  { key: 'INVEX', label: 'Invex', color: '#F48220' },
  { key: 'MERCADO PAGO', label: 'Mercado Pago', color: '#00B1EA' },
  { key: 'HILTON', label: 'Hilton', color: '#004F71' },
  { key: 'TODAS', label: 'Todas las Tarjetas', color: '#6366F1' },
];

const TIPOS_PAGO = [
  { key: 'tarjeta_credito', label: 'Crédito', icon: 'card-outline' as const },
  { key: 'tarjeta_debito', label: 'Débito', icon: 'wallet-outline' as const },
  { key: 'tarjeta', label: 'Cualquiera', icon: 'apps-outline' as const },
];

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

const formatCurrency = (val: number) =>
  '$' + Number(val || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const getTodayString = () => new Date().toISOString().split('T')[0];

type TarjetaKey = 'BBVA' | 'AMEX' | 'MARRIOT' | 'BANORTE' | 'INVEX' | 'MERCADO PAGO' | 'HILTON' | 'TODAS';
type MetodoPagoKey = 'tarjeta_credito' | 'tarjeta_debito' | 'tarjeta';
type InputMode = 'excel' | 'screenshot';
type ResultTab = 'conciliados' | 'gastos_sin_par' | 'app_sin_cobro';

export default function AuditoriaTarjetaScreen() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const isMobile = windowWidth < 700;
  const { company, user } = useAuth();
  const companyName = company === 'daravisa' ? 'Daravisa' : 'Inttec';

  // Pestaña principal: Nueva auditoría vs Historial
  const [activeMainTab, setActiveMainTab] = useState<'nueva' | 'historial'>('nueva');

  // Selección de Tarjeta
  const [selectedTarjeta, setSelectedTarjeta] = useState<TarjetaKey>('BBVA');
  const [selectedMetodoPago, setSelectedMetodoPago] = useState<MetodoPagoKey>('tarjeta');

  // Modo de entrada: Archivo Excel vs Tabla manual (para Screenshots)
  const [inputMode, setInputMode] = useState<InputMode>('excel');

  // Estado del archivo Excel o Imagen
  const [excelFileName, setExcelFileName] = useState<string | null>(null);
  const [excelResult, setExcelResult] = useState<ParseExcelResult | null>(null);
  const [savedExcelData, setSavedExcelData] = useState<{ data: string | ArrayBuffer; type: 'base64' | 'array' } | null>(null);
  const [isReadingExcel, setIsReadingExcel] = useState(false);
  const [uploadedImageUri, setUploadedImageUri] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  // Estado de la tabla de captura rápida (para screenshots)
  const [manualRows, setManualRows] = useState<Array<{ id: string; fecha: string; descripcion: string; monto: string }>>([
    { id: '1', fecha: '', descripcion: '', monto: '' },
    { id: '2', fecha: '', descripcion: '', monto: '' },
    { id: '3', fecha: '', descripcion: '', monto: '' },
  ]);
  const [fechaCapturaGeneral, setFechaCapturaGeneral] = useState('');
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('');
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('');
  const [pasteModalVisible, setPasteModalVisible] = useState(false);
  const [pasteText, setPasteText] = useState('');

  // Estados de conciliación
  const [isConciliating, setIsConciliating] = useState(false);
  const [reconciliation, setReconciliation] = useState<ReconciliationResult | null>(null);
  const [appGastos, setAppGastos] = useState<Gasto[]>([]);
  const [activeResultTab, setActiveResultTab] = useState<ResultTab>('conciliados');
  const [searchQuery, setSearchQuery] = useState('');

  // Modales interactivos
  const [selectedPairDetail, setSelectedPairDetail] = useState<MatchedPair | null>(null);
  const [manualPairCargo, setManualPairCargo] = useState<CardMovement | null>(null);
  const [manualPairGasto, setManualPairGasto] = useState<Gasto | null>(null);
  const [candidateSearchText, setCandidateSearchText] = useState('');

  // Visor de fotos de comprobantes
  const [photoViewerUrl, setPhotoViewerUrl] = useState<string | null>(null);
  const [viewerPhotoUrls, setViewerPhotoUrls] = useState<string[]>([]);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);

  // Exportación y persistencia
  const [isSavingAuditoria, setIsSavingAuditoria] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [isUpdatingGastoId, setIsUpdatingGastoId] = useState<string | null>(null);

  // Historial
  const [isLoadingHistorial, setIsLoadingHistorial] = useState(false);
  const [auditoriasHistorial, setAuditoriasHistorial] = useState<AuditoriaTarjeta[]>([]);
  const [historialFilter, setHistorialFilter] = useState<'TODAS' | TarjetaKey>('TODAS');
  const [selectedSavedAudit, setSelectedSavedAudit] = useState<AuditoriaTarjeta | null>(null);

  const selectedTarjetaInfo = TARJETAS.find(t => t.key === selectedTarjeta);

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Manejo de Carga de Archivo (Excel o Imagen / Screenshot)
  // ─────────────────────────────────────────────────────────────────────────────

  const handleSelectFileOrImage = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
          'image/*',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const uri = asset.uri;
      const name = asset.name || 'archivo';
      const mime = asset.mimeType || '';

      const isImage = mime.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(name) || /\.(png|jpe?g|webp)$/i.test(uri);
      const isExcel = name.match(/\.(xlsx|xls|csv)$/i) || mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv');

      if (!isImage && !isExcel) {
        showAlert('Formato no admitido', 'Por favor selecciona un archivo Excel (.xlsx, .xls, .csv) o una imagen de captura (.png, .jpg, .webp)');
        return;
      }

      // CASO A: Imagen / Screenshot
      if (isImage) {
        setUploadedImageUri(uri);
        setInputMode('screenshot');
        setIsProcessingImage(true);

        try {
          let b64 = '';
          if (Platform.OS === 'web') {
            if (uri.startsWith('data:')) {
              b64 = uri.split(',')[1] || '';
            } else if ((asset as any).file) {
              b64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = () => {
                  const res = reader.result as string;
                  resolve(res.split(',')[1] || '');
                };
                reader.readAsDataURL((asset as any).file);
              });
            } else {
              const response = await fetch(uri);
              const blob = await response.blob();
              b64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = () => {
                  const res = reader.result as string;
                  resolve(res.split(',')[1] || '');
                };
                reader.readAsDataURL(blob);
              });
            }
          } else {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const FileSys = require('expo-file-system/legacy');
            b64 = await FileSys.readAsStringAsync(uri, { encoding: FileSys.EncodingType.Base64 });
          }

          const headers = await getApiHeaders();
          const res = await fetch(`${getApiUrl()}/api/auditoria/ocr-imagen`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ base64Image: b64 }),
          });

          if (res.ok) {
            const data = await res.json();
            const movs = data.movimientos || [];
            if (movs.length > 0) {
              const newRows = movs.map((m: any, idx: number) => ({
                id: `ocr_${idx}_${Date.now()}`,
                fecha: m.fecha || fechaCapturaGeneral || '',
                descripcion: m.descripcion || '',
                monto: String(m.monto || ''),
              }));
              setManualRows(newRows);

              const ocrCargos: CardMovement[] = newRows
                .filter((r: any) => (Number(r.monto) || 0) > 0)
                .map((r: any, idx: number) => ({
                  id: `manual_${idx}_${r.id}`,
                  fecha: (r.fecha || fechaCapturaGeneral || '').trim(),
                  descripcion: r.descripcion.trim() || 'Movimiento de captura',
                  monto: Math.round(Math.abs(Number(r.monto) || 0) * 100) / 100,
                  tipo: 'cargo',
                  tarjetaRef: selectedTarjeta,
                }));

              if (ocrCargos.length > 0) {
                await handleExecuteReconciliation(ocrCargos, true);
              }
            } else {
              showAlert('Sin movimientos detectados', 'No se lograron identificar montos claros en la imagen. Puedes capturarlos en la tabla inferior.');
            }
          } else {
            const errTxt = await res.text().catch(() => '');
            console.warn('Error OCR backend:', res.status, errTxt);
            showAlert('Imagen cargada', 'Se cargó la captura. Puedes verla arriba y capturar los movimientos en la tabla.');
          }
        } catch (ocrErr: any) {
          console.warn('OCR error:', ocrErr);
          showAlert('Imagen cargada', 'Se cargó la captura de pantalla.');
        } finally {
          setIsProcessingImage(false);
        }
        return;
      }

      // CASO B: Archivo Excel
      setUploadedImageUri(null);
      setIsReadingExcel(true);
      setExcelFileName(name);

      let rawData: string | ArrayBuffer;
      let rawType: 'base64' | 'array';

      if (Platform.OS === 'web') {
        const response = await fetch(uri);
        rawData = await response.arrayBuffer();
        rawType = 'array';
      } else {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const FileSys = require('expo-file-system/legacy');
        rawData = await FileSys.readAsStringAsync(uri, { encoding: FileSys.EncodingType.Base64 });
        rawType = 'base64';
      }

      setSavedExcelData({ data: rawData, type: rawType });
      const parsed = parseExcelStatement(rawData, rawType, selectedTarjeta);

      if (parsed.cargos.length === 0) {
        showAlert(
          'Sin cargos detectados',
          `No se pudieron identificar cargos en la hoja "${parsed.selectedSheet}". Si el archivo tiene varias hojas, selecciona la hoja correspondiente en la barra de pestañas.`
        );
        setExcelResult(parsed);
      } else {
        setExcelResult(parsed);
      }
    } catch (err: any) {
      console.error('Error al leer archivo:', err);
      showAlert('Error al procesar archivo', err.message || 'No se pudo leer el archivo.');
    } finally {
      setIsReadingExcel(false);
    }
  };

  const handleSwitchExcelSheet = (sheetName: string) => {
    if (!savedExcelData) return;
    try {
      const parsed = parseExcelStatement(savedExcelData.data, savedExcelData.type, sheetName);
      setExcelResult(parsed);
      setReconciliation(null);
    } catch (err: any) {
      showAlert('Error al cambiar de hoja', err.message || 'No se pudo leer la hoja seleccionada.');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Manejo de Tabla Rápida (para Screenshots)
  // ─────────────────────────────────────────────────────────────────────────────

  const handleAddManualRow = () => {
    setManualRows(prev => [
      ...prev,
      { id: String(Date.now() + Math.random()), fecha: fechaCapturaGeneral || '', descripcion: '', monto: '' },
    ]);
  };

  const handleApplyFechaGeneralToRows = (fechaVal: string) => {
    setFechaCapturaGeneral(fechaVal);
    setManualRows(prev => prev.map(row => ({ ...row, fecha: fechaVal })));
  };

  const handleUpdateManualRow = (id: string, field: 'fecha' | 'descripcion' | 'monto', val: string) => {
    setManualRows(prev =>
      prev.map(row => (row.id === id ? { ...row, [field]: val } : row))
    );
  };

  const handleRemoveManualRow = (id: string) => {
    setManualRows(prev => prev.filter(row => row.id !== id));
  };

  const handleApplyPasteText = () => {
    if (!pasteText.trim()) {
      setPasteModalVisible(false);
      return;
    }

    const lines = pasteText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const newRows: Array<{ id: string; fecha: string; descripcion: string; monto: string }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Separación por tabulación o comas
      const parts = line.includes('\t') ? line.split('\t') : line.split(/[,;]/);

      if (parts.length >= 2) {
        const p0 = parts[0]?.trim() || '';
        const p1 = parts[1]?.trim() || '';
        const p2 = parts[2]?.trim() || '';

        // Determinar cuál es fecha, descripción o monto
        let fecha = getTodayString();
        let desc = '';
        let monto = '';

        if (p0.match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/) || p0.match(/\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/)) {
          fecha = p0;
          desc = p1;
          monto = p2 || '';
        } else {
          desc = p0;
          monto = p1;
        }

        newRows.push({
          id: `paste_${i}_${Date.now()}`,
          fecha,
          descripcion: desc,
          monto: monto.replace(/[$€,\s]/g, ''),
        });
      }
    }

    if (newRows.length > 0) {
      setManualRows(prev => [...prev.filter(r => r.descripcion || r.monto), ...newRows]);
      showAlert('Datos cargados', `Se agregaron ${newRows.length} movimientos desde el texto pegado.`);
    } else {
      showAlert('Formato no reconocido', 'Pega líneas con formato: Fecha [Tab] Concepto [Tab] Monto');
    }

    setPasteText('');
    setPasteModalVisible(false);
  };

  // Convertir filas manuales a lista de CardMovement
  const getManualCargos = (): CardMovement[] => {
    return manualRows
      .filter(r => (Number(r.monto) || 0) > 0)
      .map((r, idx) => ({
        id: `manual_${idx}_${r.id}`,
        fecha: (r.fecha || fechaCapturaGeneral || '').trim(),
        descripcion: r.descripcion.trim() || 'Movimiento de captura',
        monto: Math.round(Math.abs(Number(r.monto) || 0) * 100) / 100,
        tipo: 'cargo',
        tarjetaRef: selectedTarjeta,
      }));
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Ejecutar Conciliación (100% Algorítmica)
  // ─────────────────────────────────────────────────────────────────────────────

  const handleExecuteReconciliation = async (
    overrideCargos?: CardMovement[],
    isFromScreenshotOcr?: boolean
  ) => {
    // 1. Obtener la lista de cargos bancarios a comparar
    let cargosToAudit: CardMovement[] = [];
    if (Array.isArray(overrideCargos) && overrideCargos.length > 0) {
      cargosToAudit = overrideCargos;
    } else if (inputMode === 'excel') {
      if (!excelResult || excelResult.cargos.length === 0) {
        showAlert('Sin archivo', 'Primero selecciona y carga un archivo Excel con los movimientos de la tarjeta.');
        return;
      }
      cargosToAudit = excelResult.cargos;
    } else {
      cargosToAudit = getManualCargos();
      if (cargosToAudit.length === 0) {
        showAlert('Sin movimientos', 'Ingresa al menos un movimiento con monto mayor a $0 en la tabla.');
        return;
      }
    }

    setIsConciliating(true);
    try {
      // 2. Calcular rango de fechas de los cargos para consultar gastos
      const fechasMs = cargosToAudit
        .map(c => parseDateMs(c.fecha))
        .filter((t): t is number => t !== null);

      const overrideDesdeMs = parseDateMs(filtroFechaDesde);
      const overrideHastaMs = parseDateMs(filtroFechaHasta);

      let minDate = '';
      let maxDate = '';

      if (overrideDesdeMs !== null) {
        minDate = new Date(overrideDesdeMs).toISOString().split('T')[0];
      } else if (fechasMs.length > 0) {
        // Si los movimientos tienen fecha explícita, buscar en una ventana estrecha de ±5 días alrededor de esas fechas
        const minMs = Math.min(...fechasMs) - 5 * 86_400_000;
        minDate = new Date(minMs).toISOString().split('T')[0];
      } else {
        // Solo si la captura NO trae fecha y el usuario no ingresó fecha, abrir ventana amplia
        const now = new Date();
        minDate = new Date(now.getTime() - 120 * 86_400_000).toISOString().split('T')[0];
      }

      if (overrideHastaMs !== null) {
        maxDate = new Date(overrideHastaMs).toISOString().split('T')[0];
      } else if (fechasMs.length > 0) {
        const maxMs = Math.max(...fechasMs) + 5 * 86_400_000;
        maxDate = new Date(maxMs).toISOString().split('T')[0];
      } else {
        const now = new Date();
        maxDate = new Date(now.getTime() + 2 * 86_400_000).toISOString().split('T')[0];
      }

      // 3. Consultar gastos del sistema vía backend API
      const headers = await getApiHeaders();
      const queryParams = new URLSearchParams({
        tarjeta: selectedTarjeta,
        minDate,
        maxDate,
        metodoPago: selectedMetodoPago,
        status: 'ALL', // Aprobados y pendientes
      });

      const res = await fetch(`${getApiUrl()}/api/auditoria/gastos?${queryParams.toString()}`, { headers });
      if (!res.ok) {
        throw new Error('Error al obtener gastos registrados desde el servidor.');
      }
      const data = await res.json();
      const gastos: Gasto[] = data.gastos || [];
      setAppGastos(gastos);

      // 4. Ejecutar el motor de coincidencia inteligente con criterio estricto de fecha (±4 días máx cuando hay fecha)
      const result = reconcileCardAndGastos(cargosToAudit, gastos, {
        amountTolerance: 0.05,
        dayTolerance: 4,
      });

      setReconciliation(result);
      setActiveResultTab('conciliados');
    } catch (err: any) {
      console.error('Error al conciliar:', err);
      showAlert('Error en conciliación', err.message || 'Ocurrió un problema al contrastar los datos.');
    } finally {
      setIsConciliating(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Modificaciones Manuales (Desvincular / Vincular)
  // ─────────────────────────────────────────────────────────────────────────────

  const handleUnlinkPair = (pairId: string) => {
    if (!reconciliation) return;
    const pair = reconciliation.matched.find(p => p.id === pairId);
    if (!pair) return;

    setReconciliation(prev => {
      if (!prev) return null;
      const nextMatched = prev.matched.filter(p => p.id !== pairId);
      const nextUnmatchedCargos = [...prev.unmatchedCargos, pair.cargo];
      const nextUnmatchedGastos = [...prev.unmatchedGastos, pair.gasto];

      const conciliadoMonto = nextMatched.reduce((s, p) => s + p.cargo.monto, 0);
      const pendingPairs = nextMatched.filter(p => p.needsApproval);
      const pendingApprovalMonto = pendingPairs.reduce((s, p) => s + p.cargo.monto, 0);
      const unmatchedCargosMonto = nextUnmatchedCargos.reduce((s, c) => s + c.monto, 0);
      const unmatchedGastosMonto = nextUnmatchedGastos.reduce((s, g) => s + (Number(g.monto) || 0), 0);

      return {
        ...prev,
        matched: nextMatched,
        unmatchedCargos: nextUnmatchedCargos,
        unmatchedGastos: nextUnmatchedGastos,
        stats: {
          ...prev.stats,
          conciliadoCount: nextMatched.length,
          conciliadoMonto: Math.round(conciliadoMonto * 100) / 100,
          pendingApprovalCount: pendingPairs.length,
          pendingApprovalMonto: Math.round(pendingApprovalMonto * 100) / 100,
          unmatchedCargosCount: nextUnmatchedCargos.length,
          unmatchedCargosMonto: Math.round(unmatchedCargosMonto * 100) / 100,
          unmatchedGastosCount: nextUnmatchedGastos.length,
          unmatchedGastosMonto: Math.round(unmatchedGastosMonto * 100) / 100,
        },
      };
    });

    if (selectedPairDetail?.id === pairId) {
      setSelectedPairDetail(null);
    }
  };

  /**
   * Aprueba un par con diferencia de propina SIN modificar la cantidad del gasto en la base de datos
   */
  const handleApproveDifference = (pairId: string) => {
    if (!reconciliation) return;

    setReconciliation(prev => {
      if (!prev) return null;
      const nextMatched = prev.matched.map(p => {
        if (p.id !== pairId) return p;
        const cleanReason = p.matchReason.replace(/^Posible propina/, 'Diferencia aprobada');
        return {
          ...p,
          needsApproval: false,
          matchReason: cleanReason.includes('Diferencia aprobada')
            ? cleanReason
            : `Diferencia aprobada · ${p.matchReason}`,
        };
      });

      const pendingPairs = nextMatched.filter(p => p.needsApproval);
      const pendingApprovalMonto = pendingPairs.reduce((s, p) => s + p.cargo.monto, 0);

      return {
        ...prev,
        matched: nextMatched,
        stats: {
          ...prev.stats,
          pendingApprovalCount: pendingPairs.length,
          pendingApprovalMonto: Math.round(pendingApprovalMonto * 100) / 100,
        },
      };
    });

    setSelectedPairDetail(prev => {
      if (!prev || prev.id !== pairId) return prev;
      const cleanReason = prev.matchReason.replace(/^Posible propina/, 'Diferencia aprobada');
      return {
        ...prev,
        needsApproval: false,
        matchReason: cleanReason.includes('Diferencia aprobada')
          ? cleanReason
          : `Diferencia aprobada · ${prev.matchReason}`,
      };
    });
  };

  /**
   * Aprueba todas las diferencias pendientes en un solo clic (conservando las cantidades de los gastos intactas)
   */
  const handleApproveAllDifferences = () => {
    if (!reconciliation) return;
    setReconciliation(prev => {
      if (!prev) return null;
      const nextMatched = prev.matched.map(p => {
        if (!p.needsApproval) return p;
        const cleanReason = p.matchReason.replace(/^Posible propina/, 'Diferencia aprobada');
        return {
          ...p,
          needsApproval: false,
          matchReason: cleanReason.includes('Diferencia aprobada')
            ? cleanReason
            : `Diferencia aprobada · ${p.matchReason}`,
        };
      });
      return {
        ...prev,
        matched: nextMatched,
        stats: {
          ...prev.stats,
          pendingApprovalCount: 0,
          pendingApprovalMonto: 0,
        },
      };
    });
  };

  /**
   * Acción OPCIONAL para igualar el monto del gasto en la base de datos al monto cobrado por el banco
   */
  const handleOptionalUpdateGastoAmount = (pair: MatchedPair) => {
    const oldMonto = Number(pair.gasto.monto) || 0;
    const newMonto = pair.cargo.monto;

    const executeUpdate = async () => {
      setIsUpdatingGastoId(pair.gasto.id);
      try {
        const { error } = await supabase
          .from('gastos')
          .update({ monto: newMonto })
          .eq('id', pair.gasto.id);

        if (error) throw error;

        const updatedGasto: Gasto = { ...pair.gasto, monto: newMonto };

        setReconciliation(prev => {
          if (!prev) return null;
          const nextMatched = prev.matched.map(p => {
            if (p.id !== pair.id) return p;
            return {
              ...p,
              gasto: updatedGasto,
              needsApproval: false,
              diffAmount: 0,
              diffPercent: 0,
              matchReason: `Monto actualizado de ${formatCurrency(oldMonto)} a ${formatCurrency(newMonto)}`,
            };
          });

          const pendingPairs = nextMatched.filter(p => p.needsApproval);
          const pendingApprovalMonto = pendingPairs.reduce((s, p) => s + p.cargo.monto, 0);
          const totalGastosMonto =
            prev.stats.totalGastosMonto - oldMonto + newMonto;

          return {
            ...prev,
            matched: nextMatched,
            stats: {
              ...prev.stats,
              totalGastosMonto: Math.round(totalGastosMonto * 100) / 100,
              pendingApprovalCount: pendingPairs.length,
              pendingApprovalMonto: Math.round(pendingApprovalMonto * 100) / 100,
            },
          };
        });

        setSelectedPairDetail(prev => {
          if (!prev || prev.id !== pair.id) return prev;
          return {
            ...prev,
            gasto: updatedGasto,
            needsApproval: false,
            diffAmount: 0,
            diffPercent: 0,
            matchReason: `Monto actualizado de ${formatCurrency(oldMonto)} a ${formatCurrency(newMonto)}`,
          };
        });

        showAlert(
          'Monto actualizado',
          `El gasto fue actualizado opcionalmente de ${formatCurrency(oldMonto)} a ${formatCurrency(newMonto)} y el vínculo quedó aprobado.`
        );
      } catch (err: any) {
        console.error('Error al actualizar monto del gasto:', err);
        showAlert('Error', 'No se pudo actualizar el monto del gasto en la base de datos.');
      } finally {
        setIsUpdatingGastoId(null);
      }
    };

    const msg = `¿Deseas cambiar el monto del gasto de ${formatCurrency(oldMonto)} a ${formatCurrency(newMonto)} para incluir la diferencia/propina?\n\nNota: Esto es opcional. Si solo deseas aprobar la conciliación sin modificar el gasto, usa el botón "Aprobar diferencia".`;

    if (Platform.OS === 'web') {
      if (window.confirm(msg)) {
        executeUpdate();
      }
    } else {
      Alert.alert('Actualizar monto del gasto (Opcional)', msg, [
        { text: 'Cancelar', style: 'cancel' },
        { text: `Cambiar a ${formatCurrency(newMonto)}`, onPress: executeUpdate },
      ]);
    }
  };

  const handleManualPairConfirm = (cargo: CardMovement, gasto: Gasto) => {
    if (!reconciliation) return;

    const gastoMonto = Number(gasto.monto) || 0;
    const rawDiff = Math.round((cargo.monto - gastoMonto) * 100) / 100;
    const pctDiff = gastoMonto > 0 ? Math.round((rawDiff / gastoMonto) * 1000) / 10 : 0;

    const newPair: MatchedPair = {
      id: `manual_pair_${cargo.id}_${gasto.id}`,
      cargo,
      gasto,
      score: 100,
      needsApproval: false,
      diffAmount: rawDiff,
      diffPercent: pctDiff,
      matchReason:
        Math.abs(rawDiff) >= 0.05
          ? `Vinculado manualmente (Diferencia ${rawDiff > 0 ? '+' : ''}${formatCurrency(rawDiff)})`
          : 'Vinculado manualmente por el administrador',
    };

    setReconciliation(prev => {
      if (!prev) return null;
      const nextMatched = [...prev.matched, newPair];
      const nextUnmatchedCargos = prev.unmatchedCargos.filter(c => c.id !== cargo.id);
      const nextUnmatchedGastos = prev.unmatchedGastos.filter(g => g.id !== gasto.id);

      const conciliadoMonto = nextMatched.reduce((s, p) => s + p.cargo.monto, 0);
      const pendingPairs = nextMatched.filter(p => p.needsApproval);
      const pendingApprovalMonto = pendingPairs.reduce((s, p) => s + p.cargo.monto, 0);
      const unmatchedCargosMonto = nextUnmatchedCargos.reduce((s, c) => s + c.monto, 0);
      const unmatchedGastosMonto = nextUnmatchedGastos.reduce((s, g) => s + (Number(g.monto) || 0), 0);

      return {
        ...prev,
        matched: nextMatched,
        unmatchedCargos: nextUnmatchedCargos,
        unmatchedGastos: nextUnmatchedGastos,
        stats: {
          ...prev.stats,
          conciliadoCount: nextMatched.length,
          conciliadoMonto: Math.round(conciliadoMonto * 100) / 100,
          pendingApprovalCount: pendingPairs.length,
          pendingApprovalMonto: Math.round(pendingApprovalMonto * 100) / 100,
          unmatchedCargosCount: nextUnmatchedCargos.length,
          unmatchedCargosMonto: Math.round(unmatchedCargosMonto * 100) / 100,
          unmatchedGastosCount: nextUnmatchedGastos.length,
          unmatchedGastosMonto: Math.round(unmatchedGastosMonto * 100) / 100,
        },
      };
    });

    setManualPairCargo(null);
    setManualPairGasto(null);
    setCandidateSearchText('');
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Exportación a Excel y PDF
  // ─────────────────────────────────────────────────────────────────────────────

  const handleExportExcel = async () => {
    if (!reconciliation) return;
    try {
      const cardLabel = selectedTarjetaInfo?.label || selectedTarjeta;
      const { base64 } = exportReconciliationToExcel(reconciliation, cardLabel);

      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;
        link.download = `Auditoria_${cardLabel}_${getTodayString()}.xlsx`;
        link.click();
      } else {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const FileSys = require('expo-file-system');
        const fileUri = `${FileSys.cacheDirectory}Auditoria_${cardLabel}_${getTodayString()}.xlsx`;
        await FileSys.writeAsStringAsync(fileUri, base64, { encoding: FileSys.EncodingType.Base64 });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: `Auditoría ${cardLabel}`,
          });
        } else {
          showAlert('Listo', 'Archivo guardado en: ' + fileUri);
        }
      }
    } catch (err: any) {
      console.error('Error al exportar Excel:', err);
      showAlert('Error', 'No se pudo generar el archivo Excel.');
    }
  };

  const handleExportPDF = async () => {
    if (!reconciliation) return;
    setIsExportingPDF(true);
    try {
      const cardLabel = selectedTarjetaInfo?.label || selectedTarjeta;
      const nowStr = new Date().toLocaleDateString('es-MX', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      const tableStyle = `
        table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
        th, td { border: 1px solid #e2e8f0; padding: 7px 10px; text-align: left; }
        th { background-color: #f8fafc; color: #475569; font-weight: bold; text-transform: uppercase; font-size: 10px; }
        .monto { text-align: right; font-weight: bold; }
        .success { color: #16a34a; }
        .danger { color: #dc2626; }
        .sub-row td { background-color: #f0fdf4; font-size: 10px; color: #334155; padding-left: 18px; }
      `;

      let conciliadosHtml = '';
      if (reconciliation.matched.length > 0) {
        conciliadosHtml = `
          <h3 style="color: #16a34a; margin-top: 25px;">✅ 1. Cargos Conciliados (${reconciliation.matched.length})</h3>
          <table>
            <thead>
              <tr>
                <th>Fecha Banco</th>
                <th>Concepto Banco</th>
                <th class="monto">Monto Banco</th>
                <th>Correspondencia en App</th>
                <th class="monto">Monto App</th>
              </tr>
            </thead>
            <tbody>
              ${reconciliation.matched
                .map(
                  p => `
                <tr>
                  <td>${p.cargo.fecha}</td>
                  <td><strong>${p.cargo.descripcion}</strong></td>
                  <td class="monto success">${formatCurrency(p.cargo.monto)}</td>
                  <td>${p.gasto.empleado_nombre || 'Empleado'} — ${GastoHelper.getProveedor(p.gasto) || p.gasto.justificacion || 'Gasto'}</td>
                  <td class="monto">${formatCurrency(Number(p.gasto.monto) || 0)}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        `;
      }

      let gastosSinParHtml = '';
      if (reconciliation.unmatchedGastos.length > 0) {
        gastosSinParHtml = `
          <h3 style="color: #ea580c; margin-top: 30px;">⚠️ 2. Gastos en App sin Par en Tarjeta (${reconciliation.unmatchedGastos.length})</h3>
          <table>
            <thead>
              <tr>
                <th>Fecha Gasto</th>
                <th>Empleado</th>
                <th>Proveedor / Justificación</th>
                <th>Estatus</th>
                <th class="monto">Monto</th>
              </tr>
            </thead>
            <tbody>
              ${reconciliation.unmatchedGastos
                .map(
                  g => `
                <tr>
                  <td>${g.fecha_comprobante || '-'}</td>
                  <td><strong>${g.empleado_nombre || 'Empleado'}</strong></td>
                  <td>${GastoHelper.getProveedor(g) || g.justificacion || 'Sin detalle'}</td>
                  <td>${g.status}</td>
                  <td class="monto danger">${formatCurrency(Number(g.monto) || 0)}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        `;
      }

      let cobrosSinParHtml = '';
      if (reconciliation.unmatchedCargos.length > 0) {
        cobrosSinParHtml = `
          <h3 style="color: #dc2626; margin-top: 30px;">💳 3. Cobros en Tarjeta sin Gasto Reportado (${reconciliation.unmatchedCargos.length})</h3>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Concepto Banco</th>
                <th class="monto">Monto Cobro</th>
              </tr>
            </thead>
            <tbody>
              ${reconciliation.unmatchedCargos
                .map(
                  c => `
                <tr>
                  <td>${c.fecha}</td>
                  <td><strong>${c.descripcion}</strong></td>
                  <td class="monto danger">${formatCurrency(c.monto)}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        `;
      }

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 35px; color: #1e293b; }
            h1 { font-size: 22px; color: #0f172a; margin-bottom: 4px; }
            h2 { font-size: 14px; font-weight: normal; color: #64748b; margin-top: 0; margin-bottom: 25px; }
            .kpi-row { display: flex; gap: 12px; margin-bottom: 25px; }
            .kpi-card { flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
            .kpi-title { font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase; }
            .kpi-val { font-size: 18px; font-weight: 800; margin-top: 4px; }
            ${tableStyle}
            .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; }
          </style>
        </head>
        <body>
          <h1>Reporte de Auditoría y Conciliación de Tarjeta</h1>
          <h2>Tarjeta: <strong>${cardLabel}</strong> | Generado el ${nowStr} por ${companyName}</h2>

          <div class="kpi-row">
            <div class="kpi-card" style="background-color: #f8fafc;">
              <div class="kpi-title">TOTAL CARGOS BANCO</div>
              <div class="kpi-val" style="color: #0284c7;">${formatCurrency(reconciliation.stats.totalCargosMonto)}</div>
              <div style="font-size: 10px; color: #64748b;">${reconciliation.stats.totalCargosCount} mov.</div>
            </div>
            <div class="kpi-card" style="background-color: #f0fdf4;">
              <div class="kpi-title">CONCILIADO (CON PAR)</div>
              <div class="kpi-val" style="color: #16a34a;">${formatCurrency(reconciliation.stats.conciliadoMonto)}</div>
              <div style="font-size: 10px; color: #16a34a;">${reconciliation.stats.conciliadoCount} pares</div>
            </div>
            <div class="kpi-card" style="background-color: #fef2f2;">
              <div class="kpi-title">COBROS SIN REPORTAR</div>
              <div class="kpi-val" style="color: #dc2626;">${formatCurrency(reconciliation.stats.unmatchedCargosMonto)}</div>
              <div style="font-size: 10px; color: #dc2626;">${reconciliation.stats.unmatchedCargosCount} cargos</div>
            </div>
            <div class="kpi-card" style="background-color: #fff7ed;">
              <div class="kpi-title">GASTOS SIN COBRO</div>
              <div class="kpi-val" style="color: #ea580c;">${formatCurrency(reconciliation.stats.unmatchedGastosMonto)}</div>
              <div style="font-size: 10px; color: #ea580c;">${reconciliation.stats.unmatchedGastosCount} gastos</div>
            </div>
          </div>

          ${conciliadosHtml}
          ${cobrosSinParHtml}
          ${gastosSinParHtml}

          <div class="footer">
            Sistema Administrativo ${companyName} — Reporte generado automáticamente.
          </div>
        </body>
        </html>
      `;

      if (Platform.OS === 'web') {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.width = '0px';
        iframe.style.height = '0px';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow?.document || iframe.contentDocument;
        if (doc) {
          doc.open();
          doc.write(html);
          doc.close();
          setTimeout(() => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            document.body.removeChild(iframe);
          }, 500);
        }
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: `Auditoría ${cardLabel}`,
          });
        } else {
          showAlert('Listo', 'PDF guardado en: ' + uri);
        }
      }
    } catch (err: any) {
      console.error('Error al generar PDF:', err);
      showAlert('Error', 'No se pudo generar el reporte en PDF.');
    } finally {
      setIsExportingPDF(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Guardar en Base de Datos (Historial)
  // ─────────────────────────────────────────────────────────────────────────────

  const handleSaveToDatabase = async () => {
    if (!reconciliation) return;
    setIsSavingAuditoria(true);
    try {
      const cardLabel = selectedTarjetaInfo?.label || selectedTarjeta;
      await AuditoriaService.guardarAuditoria({
        tarjeta: selectedTarjeta,
        metodo_pago: selectedMetodoPago,
        titular: 'Conciliación Automática',
        periodo_inicio: null,
        periodo_fin: null,
        total_cargos: reconciliation.stats.totalCargosMonto,
        total_conciliado: reconciliation.stats.conciliadoMonto,
        total_faltante: reconciliation.stats.unmatchedCargosMonto,
        resultado_json: {
          reconciliation,
          tarjeta: selectedTarjeta,
          cardLabel,
          fechaAuditoria: new Date().toISOString(),
          modoEntrada: inputMode,
          archivo: excelFileName,
        },
        creado_por: user?.id || null,
        creado_por_nombre: user?.nombre || null,
      });

      showAlert('Éxito', 'La auditoría fue guardada correctamente en el historial.');
      loadHistorialAuditorias();
      setActiveMainTab('historial');
    } catch (err: any) {
      console.error('Error al guardar auditoría:', err);
      showAlert('Error', 'No se pudo guardar la auditoría: ' + (err.message || ''));
    } finally {
      setIsSavingAuditoria(false);
    }
  };

  const loadHistorialAuditorias = async () => {
    setIsLoadingHistorial(true);
    try {
      const data = await AuditoriaService.obtenerAuditorias();
      setAuditoriasHistorial(data);
    } catch (err: any) {
      console.error('Error al cargar historial:', err);
      showAlert('Error', 'No se pudo cargar el historial de auditorías.');
    } finally {
      setIsLoadingHistorial(false);
    }
  };

  const handleDeleteAuditoria = async (id: string) => {
    const doDelete = async () => {
      setIsLoadingHistorial(true);
      try {
        await AuditoriaService.eliminarAuditoria(id);
        showAlert('Éxito', 'Auditoría eliminada.');
        loadHistorialAuditorias();
      } catch (err: any) {
        showAlert('Error', 'No se pudo eliminar la auditoría.');
      } finally {
        setIsLoadingHistorial(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('¿Deseas eliminar esta auditoría del historial?')) {
        await doDelete();
      }
    } else {
      Alert.alert('Eliminar Auditoría', '¿Estás seguro?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Filtros y Búsqueda en Pantalla
  // ─────────────────────────────────────────────────────────────────────────────

  const filteredMatched = useMemo(() => {
    if (!reconciliation) return [];
    let list = reconciliation.matched;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      p =>
        p.cargo.descripcion.toLowerCase().includes(q) ||
        p.cargo.fecha.includes(q) ||
        String(p.cargo.monto).includes(q) ||
        (p.gasto.empleado_nombre || '').toLowerCase().includes(q) ||
        (GastoHelper.getProveedor(p.gasto) || '').toLowerCase().includes(q) ||
        (GastoHelper.getSucursal(p.gasto) || '').toLowerCase().includes(q) ||
        (GastoHelper.getSubcategoria(p.gasto) || '').toLowerCase().includes(q) ||
        (GastoHelper.getCliente(p.gasto) || '').toLowerCase().includes(q) ||
        (p.gasto.detalle_servicio_proyecto || '').toLowerCase().includes(q) ||
        (p.gasto.justificacion || '').toLowerCase().includes(q)
    );
  }, [reconciliation, searchQuery]);

  const filteredUnmatchedGastos = useMemo(() => {
    if (!reconciliation) return [];
    let list = reconciliation.unmatchedGastos;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      g =>
        (g.empleado_nombre || '').toLowerCase().includes(q) ||
        (g.fecha_comprobante || '').includes(q) ||
        String(g.monto).includes(q) ||
        (GastoHelper.getProveedor(g) || '').toLowerCase().includes(q) ||
        (GastoHelper.getSucursal(g) || '').toLowerCase().includes(q) ||
        (GastoHelper.getSubcategoria(g) || '').toLowerCase().includes(q) ||
        (GastoHelper.getCliente(g) || '').toLowerCase().includes(q) ||
        (g.detalle_servicio_proyecto || '').toLowerCase().includes(q) ||
        (g.justificacion || '').toLowerCase().includes(q)
    );
  }, [reconciliation, searchQuery]);

  const filteredUnmatchedCargos = useMemo(() => {
    if (!reconciliation) return [];
    let list = reconciliation.unmatchedCargos;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      c =>
        c.descripcion.toLowerCase().includes(q) ||
        c.fecha.includes(q) ||
        String(c.monto).includes(q)
    );
  }, [reconciliation, searchQuery]);

  const filteredHistorial = useMemo(() => {
    if (historialFilter === 'TODAS') return auditoriasHistorial;
    return auditoriasHistorial.filter(a => a.tarjeta === historialFilter);
  }, [auditoriasHistorial, historialFilter]);

  // Candidatos para vinculación manual con filtro y ordenados por cercanía de monto
  const candidateGastosForCargo = useMemo(() => {
    if (!manualPairCargo || !reconciliation) return [];
    const list = reconciliation.unmatchedGastos;
    const q = candidateSearchText.trim().toLowerCase();
    const cargoMonto = manualPairCargo.monto;

    let filtered = list;
    if (q) {
      filtered = list.filter(g => {
        const emp = (g.empleado_nombre || '').toLowerCase();
        const prov = (GastoHelper.getProveedor(g) || '').toLowerCase();
        const suc = (GastoHelper.getSucursal(g) || '').toLowerCase();
        const sub = (GastoHelper.getSubcategoria(g) || '').toLowerCase();
        const proy = (g.detalle_servicio_proyecto || '').toLowerCase();
        const just = (g.justificacion || '').toLowerCase();
        const montoStr = String(g.monto || '');
        const fecha = (g.fecha_comprobante || '').toLowerCase();
        return (
          emp.includes(q) ||
          prov.includes(q) ||
          suc.includes(q) ||
          sub.includes(q) ||
          proy.includes(q) ||
          just.includes(q) ||
          montoStr.includes(q) ||
          fecha.includes(q)
        );
      });
    }

    return [...filtered].sort((a, b) => {
      const diffA = Math.abs((Number(a.monto) || 0) - cargoMonto);
      const diffB = Math.abs((Number(b.monto) || 0) - cargoMonto);
      return diffA - diffB;
    });
  }, [manualPairCargo, reconciliation, candidateSearchText]);

  const candidateCargosForGasto = useMemo(() => {
    if (!manualPairGasto || !reconciliation) return [];
    const list = reconciliation.unmatchedCargos;
    const q = candidateSearchText.trim().toLowerCase();
    const gastoMonto = Number(manualPairGasto.monto) || 0;

    let filtered = list;
    if (q) {
      filtered = list.filter(c => {
        const desc = (c.descripcion || '').toLowerCase();
        const montoStr = String(c.monto || '');
        const fecha = (c.fecha || '').toLowerCase();
        return desc.includes(q) || montoStr.includes(q) || fecha.includes(q);
      });
    }

    return [...filtered].sort((a, b) => {
      const diffA = Math.abs(a.monto - gastoMonto);
      const diffB = Math.abs(b.monto - gastoMonto);
      return diffA - diffB;
    });
  }, [manualPairGasto, reconciliation, candidateSearchText]);

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. RENDERIZADO DE COMPONENTES
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Barra Superior */}
      <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
        <View>
          <Text style={[styles.title, { color: themeColors.text }]}>Auditoría de Tarjeta</Text>
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
            Conciliación de movimientos bancarios vs gastos reportados
          </Text>
        </View>

        {/* Selector Pestaña Principal (Nueva Auditoría / Historial) */}
        <View style={[styles.tabSelector, { backgroundColor: scheme === 'dark' ? '#1e293b' : '#e2e8f0' }]}>
          <TouchableOpacity
            style={[styles.tabButton, activeMainTab === 'nueva' && { backgroundColor: themeColors.accent }]}
            onPress={() => setActiveMainTab('nueva')}
          >
            <Ionicons name="flash-outline" size={15} color={activeMainTab === 'nueva' ? '#fff' : themeColors.textSecondary} />
            <Text style={[styles.tabButtonText, { color: activeMainTab === 'nueva' ? '#fff' : themeColors.textSecondary }]}>
              Nueva Conciliación
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeMainTab === 'historial' && { backgroundColor: themeColors.accent }]}
            onPress={() => {
              setActiveMainTab('historial');
              loadHistorialAuditorias();
            }}
          >
            <Ionicons name="time-outline" size={15} color={activeMainTab === 'historial' ? '#fff' : themeColors.textSecondary} />
            <Text style={[styles.tabButtonText, { color: activeMainTab === 'historial' ? '#fff' : themeColors.textSecondary }]}>
              Historial Guardado
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {activeMainTab === 'nueva' ? (
        <ScrollView contentContainerStyle={styles.scrollArea} keyboardShouldPersistTaps="handled">
          {/* PASO 1: SELECCIONAR TARJETA */}
          <View style={[styles.cardSection, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.stepBadge, { backgroundColor: themeColors.accent }]}>
                <Text style={styles.stepBadgeText}>1</Text>
              </View>
              <Text style={[styles.sectionHeading, { color: themeColors.text }]}>Selecciona la Tarjeta Corporativa</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardChipsRow}>
              {TARJETAS.map(t => {
                const isSelected = selectedTarjeta === t.key;
                return (
                  <TouchableOpacity
                    key={t.key}
                    onPress={() => {
                      setSelectedTarjeta(t.key as TarjetaKey);
                      setReconciliation(null);
                      if (savedExcelData) {
                        try {
                          const parsed = parseExcelStatement(savedExcelData.data, savedExcelData.type, t.key);
                          if (parsed.cargos.length > 0) {
                            setExcelResult(parsed);
                          }
                        } catch (e) {
                          console.warn(e);
                        }
                      }
                    }}
                    style={[
                      styles.cardChip,
                      {
                        borderColor: isSelected ? t.color : themeColors.border,
                        backgroundColor: isSelected ? t.color + '15' : themeColors.background,
                      },
                    ]}
                  >
                    <View style={[styles.cardDot, { backgroundColor: t.color }]} />
                    <Text style={[styles.cardChipText, { color: isSelected ? t.color : themeColors.text, fontWeight: isSelected ? '800' : '600' }]}>
                      {t.label}
                    </Text>
                    {isSelected && <Ionicons name="checkmark-circle" size={16} color={t.color} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.metodoPagoRow}>
              <Text style={[styles.smallLabel, { color: themeColors.textSecondary }]}>Tipo de pago en app:</Text>
              {TIPOS_PAGO.map(mp => {
                const isSelected = selectedMetodoPago === mp.key;
                return (
                  <TouchableOpacity
                    key={mp.key}
                    onPress={() => setSelectedMetodoPago(mp.key as MetodoPagoKey)}
                    style={[
                      styles.metodoChip,
                      {
                        backgroundColor: isSelected ? themeColors.accent : themeColors.background,
                        borderColor: isSelected ? themeColors.accent : themeColors.border,
                      },
                    ]}
                  >
                    <Ionicons name={mp.icon} size={14} color={isSelected ? '#fff' : themeColors.textSecondary} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: isSelected ? '#fff' : themeColors.textSecondary }}>
                      {mp.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* PASO 2: ENTRADA DE MOVIMIENTOS BANCARIOS (EXCEL O SCREENSHOT) */}
          <View style={[styles.cardSection, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.stepBadge, { backgroundColor: themeColors.accent }]}>
                <Text style={styles.stepBadgeText}>2</Text>
              </View>
              <Text style={[styles.sectionHeading, { color: themeColors.text }]}>Movimientos de la Tarjeta</Text>
            </View>

            {/* Toggle de Modo: Excel vs Tabla Manual (Screenshots) */}
            <View style={[styles.modeToggleContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
              <TouchableOpacity
                style={[styles.modeToggleBtn, inputMode === 'excel' && { backgroundColor: themeColors.accent }]}
                onPress={() => setInputMode('excel')}
              >
                <Ionicons name="document-text-outline" size={16} color={inputMode === 'excel' ? '#fff' : themeColors.textSecondary} />
                <Text style={[styles.modeToggleText, { color: inputMode === 'excel' ? '#fff' : themeColors.textSecondary }]}>
                  Subir Archivo Excel / CSV
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeToggleBtn, inputMode === 'screenshot' && { backgroundColor: themeColors.accent }]}
                onPress={() => setInputMode('screenshot')}
              >
                <Ionicons name="create-outline" size={16} color={inputMode === 'screenshot' ? '#fff' : themeColors.textSecondary} />
                <Text style={[styles.modeToggleText, { color: inputMode === 'screenshot' ? '#fff' : themeColors.textSecondary }]}>
                  Captura Rápida (para Screenshots)
                </Text>
              </TouchableOpacity>
            </View>

            {inputMode === 'excel' ? (
              // ── Modo Archivo (Excel o Imagen) ──
              <View style={styles.excelModeContainer}>
                <TouchableOpacity
                  style={[
                    styles.uploadBox,
                    {
                      borderColor: (excelFileName || uploadedImageUri) ? themeColors.accent : themeColors.border,
                      backgroundColor: (excelFileName || uploadedImageUri) ? themeColors.accent + '10' : themeColors.background,
                    },
                  ]}
                  onPress={handleSelectFileOrImage}
                  disabled={isReadingExcel || isProcessingImage}
                >
                  {(isReadingExcel || isProcessingImage) ? (
                    <ActivityIndicator size="small" color={themeColors.accent} />
                  ) : (
                    <Ionicons
                      name={(excelFileName || uploadedImageUri) ? 'checkmark-circle' : 'cloud-upload-outline'}
                      size={32}
                      color={themeColors.accent}
                    />
                  )}
                  <Text style={[styles.uploadBoxTitle, { color: themeColors.text }]}>
                    {isProcessingImage
                      ? 'Procesando captura de pantalla...'
                      : excelFileName
                        ? excelFileName
                        : uploadedImageUri
                          ? 'Captura de pantalla cargada'
                          : 'Seleccionar archivo (Excel, CSV o Imagen de Captura)'}
                  </Text>
                  <Text style={[styles.uploadBoxSub, { color: themeColors.textSecondary }]}>
                    {isProcessingImage
                      ? 'Extrayendo movimientos automáticamente...'
                      : excelResult
                        ? `Detectados ${excelResult.cargos.length} cargos bancarios por ${formatCurrency(excelResult.totalCargosMonto)} (${excelResult.minFecha || ''} a ${excelResult.maxFecha || ''})`
                        : 'Soporta archivos .xlsx, .xls, .csv o capturas de pantalla (.png, .jpg, .webp)'}
                  </Text>
                </TouchableOpacity>

                {excelResult && (
                  <View style={{ gap: 8 }}>
                    <View style={[styles.excelSummaryBanner, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                      <View style={styles.excelSummaryItem}>
                        <Text style={[styles.excelSummaryLabel, { color: themeColors.textSecondary }]}>Hoja</Text>
                        <Text style={[styles.excelSummaryVal, { color: themeColors.accent }]}>{excelResult.selectedSheet}</Text>
                      </View>
                      <View style={styles.excelSummaryItem}>
                        <Text style={[styles.excelSummaryLabel, { color: themeColors.textSecondary }]}>Cargos</Text>
                        <Text style={[styles.excelSummaryVal, { color: themeColors.text }]}>{excelResult.cargos.length}</Text>
                      </View>
                      <View style={styles.excelSummaryItem}>
                        <Text style={[styles.excelSummaryLabel, { color: themeColors.textSecondary }]}>Total Cargos</Text>
                        <Text style={[styles.excelSummaryVal, { color: themeColors.danger }]}>{formatCurrency(excelResult.totalCargosMonto)}</Text>
                      </View>
                      <View style={styles.excelSummaryItem}>
                        <Text style={[styles.excelSummaryLabel, { color: themeColors.textSecondary }]}>Período</Text>
                        <Text style={[styles.excelSummaryVal, { color: themeColors.text }]}>
                          {excelResult.minFecha || '—'} al {excelResult.maxFecha || '—'}
                        </Text>
                      </View>
                    </View>

                    {excelResult.availableSheets && excelResult.availableSheets.length > 1 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.textSecondary }}>
                          Hojas en el archivo Excel:
                        </Text>
                        {excelResult.availableSheets.map(sName => {
                          const isCurrent = sName === excelResult.selectedSheet;
                          return (
                            <TouchableOpacity
                              key={sName}
                              onPress={() => handleSwitchExcelSheet(sName)}
                              style={{
                                paddingHorizontal: 10,
                                paddingVertical: 4,
                                borderRadius: 6,
                                borderWidth: 1.5,
                                borderColor: isCurrent ? themeColors.accent : themeColors.border,
                                backgroundColor: isCurrent ? themeColors.accent + '20' : themeColors.background,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontWeight: isCurrent ? '800' : '600',
                                  color: isCurrent ? themeColors.accent : themeColors.textSecondary,
                                }}
                              >
                                {sName}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                )}
              </View>
            ) : (
              // ── Modo Tabla Manual (Screenshots) ──
              <View style={styles.screenshotModeContainer}>
                {/* Banner de previsualización de la imagen si se subió un screenshot */}
                {uploadedImageUri && (
                  <View style={[styles.imagePreviewBanner, { borderColor: themeColors.border, backgroundColor: themeColors.background }]}>
                    <Image source={{ uri: uploadedImageUri }} style={styles.thumbnailImg} resizeMode="cover" />
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: themeColors.text }}>Captura de Pantalla Cargada</Text>
                      <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                        {isProcessingImage
                          ? '⏳ Leyendo movimientos de la captura...'
                          : 'Comprueba que los datos en la tabla coincidan con la captura.'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.smallActionBtn, { borderColor: themeColors.accent }]}
                      onPress={() => {
                        setPhotoViewerUrl(uploadedImageUri);
                        setViewerPhotoUrls([uploadedImageUri]);
                        setViewerInitialIndex(0);
                      }}
                    >
                      <Ionicons name="expand-outline" size={15} color={themeColors.accent} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.accent }}>Ver Grande</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.smallActionBtn, { borderColor: themeColors.danger + '60' }]}
                      onPress={() => setUploadedImageUri(null)}
                    >
                      <Ionicons name="close" size={15} color={themeColors.danger} />
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.screenshotHeaderRow}>
                  <Text style={[styles.smallLabel, { color: themeColors.textSecondary }]}>
                    Movimientos detectados o capturados:
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={[styles.smallActionBtn, { borderColor: themeColors.accent, backgroundColor: themeColors.accent + '15' }]}
                      onPress={handleSelectFileOrImage}
                      disabled={isProcessingImage}
                    >
                      <Ionicons name="image-outline" size={14} color={themeColors.accent} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.accent }}>
                        {isProcessingImage ? 'Leyendo...' : 'Subir Imagen'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.smallActionBtn, { borderColor: themeColors.accent, backgroundColor: themeColors.accent + '15' }]}
                      onPress={() => setPasteModalVisible(true)}
                    >
                      <Ionicons name="clipboard-outline" size={14} color={themeColors.accent} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.accent }}>Pegar Texto</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.smallActionBtn, { borderColor: themeColors.success, backgroundColor: themeColors.success + '15' }]}
                      onPress={handleAddManualRow}
                    >
                      <Ionicons name="add" size={14} color={themeColors.success} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.success }}>Agregar Fila</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Barra rápida de Fecha de Operación / Rango de Fechas para Captura */}
                <View
                  style={{
                    flexDirection: isMobile ? 'column' : 'row',
                    alignItems: isMobile ? 'stretch' : 'center',
                    gap: 10,
                    padding: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: themeColors.border,
                    backgroundColor: themeColors.background,
                    marginBottom: 8,
                  }}
                >
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="calendar-outline" size={16} color={themeColors.accent} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text }}>
                      Fecha para todos los cargos:
                    </Text>
                    <TextInput
                      style={[
                        styles.inputCell,
                        {
                          flex: 1,
                          minWidth: 120,
                          color: themeColors.text,
                          borderColor: themeColors.border,
                          paddingVertical: 5,
                        },
                      ]}
                      value={fechaCapturaGeneral}
                      onChangeText={handleApplyFechaGeneralToRows}
                      placeholder="AAAA-MM-DD (ej. 2026-07-29)"
                      placeholderTextColor={themeColors.textSecondary}
                    />
                  </View>

                  <View style={{ flex: 1.4, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: themeColors.textSecondary }}>
                      Rango de búsqueda en BD (opcional):
                    </Text>
                    <TextInput
                      style={[
                        styles.inputCell,
                        {
                          width: 110,
                          color: themeColors.text,
                          borderColor: themeColors.border,
                          paddingVertical: 5,
                        },
                      ]}
                      value={filtroFechaDesde}
                      onChangeText={setFiltroFechaDesde}
                      placeholder="Desde AAAA-MM-DD"
                      placeholderTextColor={themeColors.textSecondary}
                    />
                    <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>a</Text>
                    <TextInput
                      style={[
                        styles.inputCell,
                        {
                          width: 110,
                          color: themeColors.text,
                          borderColor: themeColors.border,
                          paddingVertical: 5,
                        },
                      ]}
                      value={filtroFechaHasta}
                      onChangeText={setFiltroFechaHasta}
                      placeholder="Hasta AAAA-MM-DD"
                      placeholderTextColor={themeColors.textSecondary}
                    />
                  </View>
                </View>

                {/* Tabla Interactiva */}
                <View style={[styles.tableContainer, { borderColor: themeColors.border }]}>
                  <View style={[styles.tableHeaderRow, { backgroundColor: scheme === 'dark' ? '#1e293b' : '#f1f5f9' }]}>
                    <Text style={[styles.thCell, { flex: 1.2, color: themeColors.textSecondary }]}>Fecha (AAAA-MM-DD)</Text>
                    <Text style={[styles.thCell, { flex: 2.5, color: themeColors.textSecondary }]}>Concepto / Establecimiento</Text>
                    <Text style={[styles.thCell, { flex: 1.2, color: themeColors.textSecondary, textAlign: 'right' }]}>Monto ($)</Text>
                    <View style={{ width: 36 }} />
                  </View>

                  {manualRows.map((row, idx) => (
                    <View key={row.id} style={[styles.tableDataRow, { borderBottomColor: themeColors.border + '60' }]}>
                      <TextInput
                        style={[styles.inputCell, { flex: 1.2, color: themeColors.text, borderColor: themeColors.border }]}
                        value={row.fecha}
                        onChangeText={t => handleUpdateManualRow(row.id, 'fecha', t)}
                        placeholder="Ej: 2026-07-29 (o vacío)"
                        placeholderTextColor={themeColors.textSecondary}
                      />
                      <TextInput
                        style={[styles.inputCell, { flex: 2.5, color: themeColors.text, borderColor: themeColors.border }]}
                        value={row.descripcion}
                        onChangeText={t => handleUpdateManualRow(row.id, 'descripcion', t)}
                        placeholder="Ej: Oxxo gas, Steren..."
                        placeholderTextColor={themeColors.textSecondary}
                      />
                      <TextInput
                        style={[styles.inputCell, { flex: 1.2, color: themeColors.text, borderColor: themeColors.border, textAlign: 'right' }]}
                        value={row.monto}
                        onChangeText={t => handleUpdateManualRow(row.id, 'monto', t)}
                        placeholder="758.00"
                        placeholderTextColor={themeColors.textSecondary}
                        keyboardType="numeric"
                      />
                      <TouchableOpacity
                        style={{ width: 36, alignItems: 'center', justifyContent: 'center' }}
                        onPress={() => handleRemoveManualRow(row.id)}
                      >
                        <Ionicons name="trash-outline" size={16} color={themeColors.danger} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Botón de Ejecutar Conciliación */}
            <TouchableOpacity
              style={[
                styles.executeBtn,
                { backgroundColor: themeColors.accent, opacity: isConciliating ? 0.7 : 1 },
              ]}
              onPress={() => handleExecuteReconciliation()}
              disabled={isConciliating}
            >
              {isConciliating ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.executeBtnText}>Contrastando datos con el sistema...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="git-compare-outline" size={20} color="#fff" />
                  <Text style={styles.executeBtnText}>Ejecutar Conciliación Inteligente</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* PASO 3: DASHBOARD DE RESULTADOS (3 PESTAÑAS) */}
          {reconciliation && (
            <View style={styles.resultsContainer}>
              {/* Tarjetas de KPIs Resumen */}
              <View style={styles.kpiGrid}>
                <View style={[styles.kpiCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                  <Text style={[styles.kpiLabel, { color: themeColors.textSecondary }]}>GASTOS DOCUMENTO</Text>
                  <Text style={[styles.kpiValue, { color: themeColors.text }]}>{formatCurrency(reconciliation.stats.totalCargosMonto)}</Text>
                  <Text style={[styles.kpiSub, { color: themeColors.textSecondary }]}>{reconciliation.stats.totalCargosCount} en el documento</Text>
                </View>

                <View style={[styles.kpiCard, { backgroundColor: themeColors.success + '15', borderColor: themeColors.success + '40' }]}>
                  <Text style={[styles.kpiLabel, { color: themeColors.success }]}>CONCILIADO (CON PAR)</Text>
                  <Text style={[styles.kpiValue, { color: themeColors.success }]}>{formatCurrency(reconciliation.stats.conciliadoMonto)}</Text>
                  <Text style={[styles.kpiSub, { color: themeColors.success }]}>{reconciliation.stats.conciliadoCount} pares encontrados</Text>
                </View>

                <View style={[styles.kpiCard, { backgroundColor: themeColors.danger + '15', borderColor: themeColors.danger + '40' }]}>
                  <Text style={[styles.kpiLabel, { color: themeColors.danger }]}>GASTOS SIN PAR (DOCUMENTO)</Text>
                  <Text style={[styles.kpiValue, { color: themeColors.danger }]}>{formatCurrency(reconciliation.stats.unmatchedCargosMonto)}</Text>
                  <Text style={[styles.kpiSub, { color: themeColors.danger }]}>{reconciliation.stats.unmatchedCargosCount} gastos sin par</Text>
                </View>

                <View style={[styles.kpiCard, { backgroundColor: '#ea580c15', borderColor: '#ea580c40' }]}>
                  <Text style={[styles.kpiLabel, { color: '#ea580c' }]}>EN APP SIN COBRO</Text>
                  <Text style={[styles.kpiValue, { color: '#ea580c' }]}>{formatCurrency(reconciliation.stats.unmatchedGastosMonto)}</Text>
                  <Text style={[styles.kpiSub, { color: '#ea580c' }]}>{reconciliation.stats.unmatchedGastosCount} gastos en app</Text>
                </View>
              </View>

              {/* Botones de Acción (Exportar Excel, Exportar PDF, Guardar Historial) */}
              <View style={styles.actionButtonsRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#10b98118', borderColor: '#10b981' }]}
                  onPress={handleExportExcel}
                >
                  <Ionicons name="download-outline" size={17} color="#10b981" />
                  <Text style={[styles.actionBtnText, { color: '#10b981' }]}>Exportar a Excel (.xlsx)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#3b82f618', borderColor: '#3b82f6' }]}
                  onPress={handleExportPDF}
                  disabled={isExportingPDF}
                >
                  {isExportingPDF ? (
                    <ActivityIndicator size="small" color="#3b82f6" />
                  ) : (
                    <Ionicons name="document-text-outline" size={17} color="#3b82f6" />
                  )}
                  <Text style={[styles.actionBtnText, { color: '#3b82f6' }]}>Exportar a PDF</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: themeColors.accent + '18', borderColor: themeColors.accent }]}
                  onPress={handleSaveToDatabase}
                  disabled={isSavingAuditoria}
                >
                  {isSavingAuditoria ? (
                    <ActivityIndicator size="small" color={themeColors.accent} />
                  ) : (
                    <Ionicons name="save-outline" size={17} color={themeColors.accent} />
                  )}
                  <Text style={[styles.actionBtnText, { color: themeColors.accent }]}>Guardar Historial</Text>
                </TouchableOpacity>
              </View>

              {/* Selector de las 3 Pestañas de Resultados */}
              <View style={[styles.resultTabsContainer, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                <TouchableOpacity
                  style={[styles.resultTabItem, activeResultTab === 'conciliados' && { backgroundColor: themeColors.success }]}
                  onPress={() => setActiveResultTab('conciliados')}
                >
                  <Text style={[styles.resultTabText, { color: activeResultTab === 'conciliados' ? '#fff' : themeColors.textSecondary }]}>
                    ✅ Conciliados ({reconciliation.matched.length}
                    {(reconciliation.stats.pendingApprovalCount || 0) > 0
                      ? ` · ⚠️ ${reconciliation.stats.pendingApprovalCount} por aprobar`
                      : ''})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.resultTabItem, activeResultTab === 'gastos_sin_par' && { backgroundColor: themeColors.danger }]}
                  onPress={() => setActiveResultTab('gastos_sin_par')}
                >
                  <Text style={[styles.resultTabText, { color: activeResultTab === 'gastos_sin_par' ? '#fff' : themeColors.textSecondary }]}>
                    ⚠️ Gastos sin Par ({reconciliation.unmatchedCargos.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.resultTabItem, activeResultTab === 'app_sin_cobro' && { backgroundColor: '#ea580c' }]}
                  onPress={() => setActiveResultTab('app_sin_cobro')}
                >
                  <Text style={[styles.resultTabText, { color: activeResultTab === 'app_sin_cobro' ? '#fff' : themeColors.textSecondary }]}>
                    📱 En App sin Cobro ({reconciliation.unmatchedGastos.length})
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Barra de búsqueda */}
              <View style={[styles.searchBox, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                <Ionicons name="search-outline" size={18} color={themeColors.textSecondary} />
                <TextInput
                  style={[styles.searchInput, { color: themeColors.text }]}
                  placeholder="Filtrar por comercio, sucursal, empleado, justificación, monto..."
                  placeholderTextColor={themeColors.textSecondary}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={18} color={themeColors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Contenido de la pestaña activa */}
              {activeResultTab === 'conciliados' && (
                <View style={styles.tabContentList}>
                  {(reconciliation.stats.pendingApprovalCount || 0) > 0 && (
                    <View
                      style={[
                        styles.pendingApprovalBanner,
                        {
                          backgroundColor: scheme === 'dark' ? '#451a03' : '#fffbeb',
                          borderColor: '#f59e0b',
                        },
                      ]}
                    >
                      <View style={{ flex: 1, gap: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name="warning" size={16} color="#d97706" />
                          <Text style={{ fontSize: 13, fontWeight: '800', color: scheme === 'dark' ? '#fde68a' : '#92400e' }}>
                            {reconciliation.stats.pendingApprovalCount}{' '}
                            {reconciliation.stats.pendingApprovalCount === 1
                              ? 'gasto identificado con variación de monto (posible propina +1% a +25%)'
                              : 'gastos identificados con variación de monto (posible propina +1% a +25%)'}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 11, color: scheme === 'dark' ? '#fcd34d' : '#b45309' }}>
                          Al aprobar la diferencia se confirma el emparejamiento dejando la cantidad original del gasto igual (o puedes actualizar el monto del gasto de forma opcional).
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.approveAllBtn}
                        onPress={handleApproveAllDifferences}
                      >
                        <Ionicons name="checkmark-done" size={14} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>Aprobar todas</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {filteredMatched.length === 0 ? (
                    <View style={styles.emptyBox}>
                      <Ionicons name="checkmark-done-circle-outline" size={40} color={themeColors.textSecondary} />
                      <Text style={[styles.emptyBoxText, { color: themeColors.textSecondary }]}>
                        No hay pares conciliados con el filtro actual.
                      </Text>
                    </View>
                  ) : (
                    filteredMatched.map(pair => {
                      const gastoMonto = Number(pair.gasto.monto) || 0;
                      const diffVal = Math.round((pair.cargo.monto - gastoMonto) * 100) / 100;
                      const hasDiff = Math.abs(diffVal) >= 0.05;
                      const pctVal =
                        pair.diffPercent ||
                        (gastoMonto > 0 ? Math.round((diffVal / gastoMonto) * 1000) / 10 : 0);
                      const isPending = Boolean(pair.needsApproval);

                      return (
                        <View
                          key={pair.id}
                          style={[
                            styles.pairCard,
                            {
                              backgroundColor: isPending
                                ? scheme === 'dark'
                                  ? '#2e1d09'
                                  : '#fffbeb'
                                : themeColors.backgroundElement,
                              borderColor: isPending ? '#f59e0b' : themeColors.success + '60',
                              borderWidth: isPending ? 1.5 : 1,
                            },
                          ]}
                        >
                          <View style={[styles.pairHeaderRow, { flexWrap: 'wrap', gap: 8 }]}>
                            {isPending ? (
                              <View style={styles.badgeWarning}>
                                <Ionicons name="warning" size={14} color="#d97706" />
                                <Text style={styles.badgeWarningText}>
                                  ⚠️ {pair.matchReason} — Requiere aprobación
                                </Text>
                              </View>
                            ) : (
                              <View style={styles.badgeSuccess}>
                                <Ionicons name="checkmark-circle" size={13} color="#16a34a" />
                                <Text style={styles.badgeSuccessText}>{pair.matchReason}</Text>
                              </View>
                            )}

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              {isPending && (
                                <TouchableOpacity
                                  style={styles.approveDiffBtn}
                                  onPress={() => handleApproveDifference(pair.id)}
                                >
                                  <Ionicons name="checkmark-circle" size={14} color="#fff" />
                                  <Text style={styles.approveDiffBtnText}>Aprobar diferencia</Text>
                                </TouchableOpacity>
                              )}

                              {hasDiff && (
                                <TouchableOpacity
                                  style={[
                                    styles.optionalUpdateBtn,
                                    {
                                      borderColor: isPending ? '#d97706' : themeColors.accent,
                                      backgroundColor: isPending
                                        ? '#f59e0b18'
                                        : themeColors.accent + '12',
                                    },
                                  ]}
                                  onPress={() => handleOptionalUpdateGastoAmount(pair)}
                                  disabled={isUpdatingGastoId === pair.gasto.id}
                                >
                                  {isUpdatingGastoId === pair.gasto.id ? (
                                    <ActivityIndicator size="small" color={isPending ? '#d97706' : themeColors.accent} />
                                  ) : (
                                    <>
                                      <Ionicons
                                        name="sync-outline"
                                        size={13}
                                        color={isPending ? '#d97706' : themeColors.accent}
                                      />
                                      <Text
                                        style={{
                                          fontSize: 11,
                                          fontWeight: '700',
                                          color: isPending ? '#b45309' : themeColors.accent,
                                        }}
                                      >
                                        Cambiar gasto a {formatCurrency(pair.cargo.monto)} (Opcional)
                                      </Text>
                                    </>
                                  )}
                                </TouchableOpacity>
                              )}

                              <TouchableOpacity
                                style={[styles.unlinkBtn, { borderColor: themeColors.danger + '40' }]}
                                onPress={() => handleUnlinkPair(pair.id)}
                              >
                                <Ionicons name="unlink-outline" size={14} color={themeColors.danger} />
                                <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.danger }}>Desvincular</Text>
                              </TouchableOpacity>
                            </View>
                          </View>

                          <View style={[styles.pairColumnsRow, isMobile && { flexDirection: 'column' }]}>
                            {/* Lado Izquierdo: Cobro Banco */}
                            <View style={[styles.sideBox, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                              <View style={styles.sideBoxHeader}>
                                <Ionicons name="card" size={14} color={themeColors.accent} />
                                <Text style={[styles.sideBoxTitle, { color: themeColors.accent }]}>Cobro de Tarjeta (Banco)</Text>
                              </View>
                              <Text style={[styles.sideDesc, { color: themeColors.text }]} numberOfLines={2}>
                                {pair.cargo.descripcion}
                              </Text>
                              <View style={styles.sideInfoRow}>
                                <Text style={[styles.sideDate, { color: themeColors.textSecondary }]}>
                                  {pair.cargo.fecha || 'Sin fecha en captura'}
                                </Text>
                                <Text style={[styles.sideAmount, { color: themeColors.danger }]}>{formatCurrency(pair.cargo.monto)}</Text>
                              </View>
                            </View>

                            {/* Conector */}
                            {!isMobile && (
                              <View style={styles.pairLinkIcon}>
                                <Ionicons
                                  name={isPending ? 'help-circle' : 'link'}
                                  size={20}
                                  color={isPending ? '#d97706' : themeColors.success}
                                />
                              </View>
                            )}

                            {/* Lado Derecho: Gasto App */}
                            <View style={[styles.sideBox, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                              <View style={styles.sideBoxHeader}>
                                <Ionicons name="receipt" size={14} color={isPending ? '#d97706' : themeColors.success} />
                                <Text style={[styles.sideBoxTitle, { color: isPending ? '#d97706' : themeColors.success }]}>
                                  Gasto Reportado en App
                                </Text>
                              </View>
                              <Text style={[styles.sideDesc, { color: themeColors.text }]} numberOfLines={2}>
                                {pair.gasto.empleado_nombre} — {GastoHelper.getProveedor(pair.gasto) || pair.gasto.justificacion || 'Sin detalle'}
                              </Text>
                              {(GastoHelper.getSucursal(pair.gasto) || GastoHelper.getSubcategoria(pair.gasto)) ? (
                                <Text style={{ fontSize: 11, fontWeight: '600', color: themeColors.textSecondary, marginTop: 2 }}>
                                  {[
                                    GastoHelper.getSucursal(pair.gasto) ? `📍 ${GastoHelper.getSucursal(pair.gasto)}` : '',
                                    GastoHelper.getSubcategoria(pair.gasto) ? `🏷️ ${GastoHelper.getSubcategoria(pair.gasto)}` : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </Text>
                              ) : null}
                              <View style={styles.sideInfoRow}>
                                <Text style={[styles.sideDate, { color: themeColors.textSecondary }]}>
                                  {pair.gasto.fecha_comprobante || 'Sin fecha'}
                                </Text>
                                <View style={{ alignItems: 'flex-end' }}>
                                  <Text style={[styles.sideAmount, { color: isPending ? '#d97706' : themeColors.success }]}>
                                    {formatCurrency(gastoMonto)}
                                  </Text>
                                  {hasDiff && (
                                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#d97706' }}>
                                      Dif: {diffVal > 0 ? '+' : ''}{formatCurrency(diffVal)} ({pctVal > 0 ? '+' : ''}{pctVal}%)
                                    </Text>
                                  )}
                                </View>
                              </View>

                              <TouchableOpacity
                                style={styles.viewDetailLink}
                                onPress={() => setSelectedPairDetail(pair)}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.accent }}>Ver detalle y ticket</Text>
                                <Ionicons name="chevron-forward" size={12} color={themeColors.accent} />
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              )}

              {/* PESTAÑA: GASTOS DEL DOCUMENTO SIN PAR */}
              {activeResultTab === 'gastos_sin_par' && (
                <View style={styles.tabContentList}>
                  {filteredUnmatchedCargos.length === 0 ? (
                    <View style={styles.emptyBox}>
                      <Ionicons name="shield-checkmark-outline" size={40} color={themeColors.success} />
                      <Text style={[styles.emptyBoxText, { color: themeColors.textSecondary }]}>
                        ¡Excelente! Todos los gastos del documento tienen su correspondencia registrada en el sistema.
                      </Text>
                    </View>
                  ) : (
                    filteredUnmatchedCargos.map(cargo => (
                      <View
                        key={cargo.id}
                        style={[
                          styles.unmatchedCard,
                          {
                            backgroundColor: themeColors.backgroundElement,
                            borderColor: themeColors.danger + '60',
                            borderLeftColor: themeColors.danger,
                          },
                        ]}
                      >
                        <View style={styles.unmatchedCardHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.unmatchedTitle, { color: themeColors.text }]}>
                              {cargo.descripcion}
                            </Text>
                            <Text style={[styles.unmatchedSub, { color: themeColors.danger }]}>
                              Gasto del documento sin par en el sistema
                            </Text>
                            <Text style={[styles.unmatchedDate, { color: themeColors.textSecondary }]}>
                              Fecha en documento: {cargo.fecha || 'Sin fecha'}
                              {cargo.tarjetaRef ? ` · Hoja/Ref: ${cargo.tarjetaRef}` : ''}
                            </Text>
                          </View>

                          <View style={{ alignItems: 'flex-end', gap: 6 }}>
                            <Text style={[styles.sideAmount, { color: themeColors.danger }]}>
                              {formatCurrency(cargo.monto)}
                            </Text>

                            <TouchableOpacity
                              style={[
                                styles.pairActionBtn,
                                { borderColor: themeColors.accent, backgroundColor: themeColors.accent + '15' },
                              ]}
                              onPress={() => setManualPairCargo(cargo)}
                            >
                              <Ionicons name="link-outline" size={13} color={themeColors.accent} />
                              <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.accent }}>
                                Buscar Par en App
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              )}

              {/* PESTAÑA: REGISTRADOS EN APP SIN COBRO EN EL DOCUMENTO */}
              {activeResultTab === 'app_sin_cobro' && (
                <View style={styles.tabContentList}>
                  {filteredUnmatchedGastos.length === 0 ? (
                    <View style={styles.emptyBox}>
                      <Ionicons name="thumbs-up-outline" size={40} color={themeColors.textSecondary} />
                      <Text style={[styles.emptyBoxText, { color: themeColors.textSecondary }]}>
                        No hay gastos en la app pendientes de aparecer en el documento para este período.
                      </Text>
                    </View>
                  ) : (
                    filteredUnmatchedGastos.map(gasto => (
                      <View
                        key={gasto.id}
                        style={[
                          styles.unmatchedCard,
                          {
                            backgroundColor: themeColors.backgroundElement,
                            borderColor: '#ea580c60',
                            borderLeftColor: '#ea580c',
                          },
                        ]}
                      >
                        <View style={styles.unmatchedCardHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.unmatchedTitle, { color: themeColors.text }]}>
                              {gasto.empleado_nombre || 'Empleado'}
                            </Text>
                            <Text style={[styles.unmatchedSub, { color: themeColors.textSecondary }]}>
                              {GastoHelper.getProveedor(gasto) || gasto.justificacion || 'Gasto registrado'}
                            </Text>
                            <Text style={[styles.unmatchedDate, { color: themeColors.textSecondary }]}>
                              Fecha comprobante: {gasto.fecha_comprobante || 'No especificada'}
                              {GastoHelper.getSucursal(gasto) ? ` · Sucursal: ${GastoHelper.getSucursal(gasto)}` : ''}
                              {GastoHelper.getSubcategoria(gasto) ? ` · ${GastoHelper.getSubcategoria(gasto)}` : ''}
                              {` · Estatus: ${gasto.status}`}
                            </Text>
                          </View>

                          <View style={{ alignItems: 'flex-end', gap: 6 }}>
                            <Text style={[styles.sideAmount, { color: '#ea580c' }]}>
                              {formatCurrency(Number(gasto.monto) || 0)}
                            </Text>

                            <TouchableOpacity
                              style={[
                                styles.pairActionBtn,
                                { borderColor: themeColors.accent, backgroundColor: themeColors.accent + '15' },
                              ]}
                              onPress={() => setManualPairGasto(gasto)}
                            >
                              <Ionicons name="link-outline" size={13} color={themeColors.accent} />
                              <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.accent }}>
                                Buscar Par en Documento
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* Fotos de comprobantes si existen */}
                        <GastoFotosGallery
                          gasto={gasto}
                          themeColors={themeColors}
                          onPhotoPress={(url, index, allUrls) => {
                            setPhotoViewerUrl(url);
                            setViewerPhotoUrls(allUrls);
                            setViewerInitialIndex(index);
                          }}
                        />
                      </View>
                    ))
                  )}
                </View>
              )}
            </View>
          )}

          <View style={{ height: 60 }} />
        </ScrollView>
      ) : (
        // ── PESTAÑA HISTORIAL GUARDADO ──
        <View style={{ flex: 1, maxWidth: 1000, width: '100%', alignSelf: 'center' }}>
          {/* Barra de Filtros por Tarjeta */}
          <View style={{ borderBottomWidth: 1, borderBottomColor: themeColors.border }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0 }}
              contentContainerStyle={styles.historialFiltersRow}
            >
              {['TODAS', ...TARJETAS.filter(t => t.key !== 'TODAS').map(t => t.key)].map(key => {
                const isSelected = historialFilter === key;
                const cardInfo = TARJETAS.find(t => t.key === key);
                const count =
                  key === 'TODAS'
                    ? auditoriasHistorial.length
                    : auditoriasHistorial.filter(a => a.tarjeta === key).length;

                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setHistorialFilter(key as any)}
                    style={[
                      styles.historialFilterChip,
                      {
                        borderColor: isSelected ? (cardInfo?.color || themeColors.accent) : themeColors.border,
                        backgroundColor: isSelected
                          ? (cardInfo?.color || themeColors.accent) + '18'
                          : themeColors.backgroundElement,
                      },
                    ]}
                  >
                    {cardInfo?.color && key !== 'TODAS' && (
                      <View style={[styles.cardDot, { backgroundColor: cardInfo.color }]} />
                    )}
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: isSelected ? '800' : '600',
                        color: isSelected
                          ? (cardInfo?.color || themeColors.accent)
                          : themeColors.textSecondary,
                      }}
                    >
                      {cardInfo?.label || key}
                    </Text>
                    {count > 0 && (
                      <View
                        style={{
                          backgroundColor: isSelected
                            ? (cardInfo?.color || themeColors.accent)
                            : themeColors.border,
                          paddingHorizontal: 6,
                          paddingVertical: 1,
                          borderRadius: 10,
                          marginLeft: 2,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '700',
                            color: isSelected ? '#fff' : themeColors.textSecondary,
                          }}
                        >
                          {count}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {isLoadingHistorial ? (
            <ScrollView style={{ flex: 1 }}>
              <AuditoriaTarjetaSkeleton count={4} />
            </ScrollView>
          ) : filteredHistorial.length === 0 ? (
            <View style={[styles.emptyBox, { marginTop: 40 }]}>
              <Ionicons name="folder-open-outline" size={48} color={themeColors.textSecondary} />
              <Text
                style={[
                  styles.emptyBoxText,
                  { color: themeColors.text, fontWeight: '700', fontSize: 15, marginTop: 8 },
                ]}
              >
                No hay auditorías guardadas
              </Text>
              <Text style={{ fontSize: 12, color: themeColors.textSecondary, textAlign: 'center', maxWidth: 360 }}>
                {historialFilter === 'TODAS'
                  ? 'Cuando realices una conciliación, pulsa el botón "Guardar Historial" para registrarla aquí.'
                  : `No hay auditorías registradas para la tarjeta ${historialFilter}.`}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredHistorial}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: Spacing.four, gap: Spacing.three, paddingBottom: 80 }}
              renderItem={({ item }) => {
                const dateStr = item.creado_en
                  ? new Date(item.creado_en).toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' })
                  : 'N/A';
                const cardInfo = TARJETAS.find(c => c.key === item.tarjeta);

                return (
                  <View style={[styles.historyCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                    <View style={styles.historyCardHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={[styles.cardDot, { backgroundColor: cardInfo?.color || themeColors.accent }]} />
                        <Text style={[styles.historyCardTitle, { color: themeColors.text }]}>
                          Auditoría {cardInfo?.label || item.tarjeta}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>{dateStr}</Text>
                    </View>

                    <View style={[styles.historyKpiRow, { backgroundColor: scheme === 'dark' ? '#1e293b' : '#f8fafc' }]}>
                      <View style={styles.historyKpiItem}>
                        <Text style={[styles.historyKpiLabel, { color: themeColors.textSecondary }]}>CARGOS</Text>
                        <Text style={[styles.historyKpiVal, { color: themeColors.text }]}>{formatCurrency(item.total_cargos)}</Text>
                      </View>
                      <View style={styles.historyKpiItem}>
                        <Text style={[styles.historyKpiLabel, { color: themeColors.success }]}>CONCILIADO</Text>
                        <Text style={[styles.historyKpiVal, { color: themeColors.success }]}>{formatCurrency(item.total_conciliado)}</Text>
                      </View>
                      <View style={styles.historyKpiItem}>
                        <Text style={[styles.historyKpiLabel, { color: themeColors.danger }]}>PENDIENTE</Text>
                        <Text style={[styles.historyKpiVal, { color: themeColors.danger }]}>{formatCurrency(item.total_faltante)}</Text>
                      </View>
                    </View>

                    <View style={styles.historyActionsRow}>
                      <TouchableOpacity
                        style={[styles.historyActionBtn, { borderColor: themeColors.accent }]}
                        onPress={() => setSelectedSavedAudit(item)}
                      >
                        <Ionicons name="eye-outline" size={15} color={themeColors.accent} />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.accent }}>Ver Detalle</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.historyActionBtn, { backgroundColor: themeColors.danger + '15', borderColor: themeColors.danger + '40', flex: 0.3 }]}
                        onPress={() => handleDeleteAuditoria(item.id)}
                      >
                        <Ionicons name="trash-outline" size={15} color={themeColors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </View>
      )}

      {/* ── MODAL: DETALLE DEL PAR CONCILIADO ── */}
      <Modal statusBarTranslucent={true} visible={!!selectedPairDetail} transparent animationType="slide" onRequestClose={() => setSelectedPairDetail(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: themeColors.backgroundElement }]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Detalle de Par Conciliado</Text>
              <TouchableOpacity onPress={() => setSelectedPairDetail(null)}>
                <Ionicons name="close" size={22} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            {selectedPairDetail && (
              <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
                {selectedPairDetail.needsApproval && (
                  <View
                    style={[
                      styles.detailSection,
                      {
                        backgroundColor: scheme === 'dark' ? '#451a03' : '#fffbeb',
                        borderColor: '#f59e0b',
                      },
                    ]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="warning" size={16} color="#d97706" />
                      <Text style={{ fontSize: 13, fontWeight: '800', color: scheme === 'dark' ? '#fde68a' : '#92400e' }}>
                        Diferencia detectada (Posible propina)
                      </Text>
                    </View>
                    <Text style={{ fontSize: 12, color: scheme === 'dark' ? '#fcd34d' : '#b45309' }}>
                      {selectedPairDetail.matchReason}. Al aprobar la diferencia se conserva el monto original del gasto en la app.
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                      <TouchableOpacity
                        style={styles.approveDiffBtn}
                        onPress={() => handleApproveDifference(selectedPairDetail.id)}
                      >
                        <Ionicons name="checkmark-circle" size={15} color="#fff" />
                        <Text style={styles.approveDiffBtnText}>Aprobar diferencia</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                <View style={[styles.detailSection, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                  <Text style={[styles.detailSectionTitle, { color: themeColors.accent }]}>COBRO DE TARJETA (BANCO)</Text>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: themeColors.text }}>{selectedPairDetail.cargo.descripcion}</Text>
                  <Text style={{ fontSize: 13, color: themeColors.textSecondary }}>Fecha de operación: {selectedPairDetail.cargo.fecha}</Text>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: themeColors.danger, marginTop: 4 }}>
                    Monto cobrado: {formatCurrency(selectedPairDetail.cargo.monto)}
                  </Text>
                </View>

                <View style={[styles.detailSection, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                  <Text style={[styles.detailSectionTitle, { color: themeColors.success }]}>GASTO REPORTADO EN APP</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.text }}>Empleado: {selectedPairDetail.gasto.empleado_nombre}</Text>
                  {GastoHelper.getSucursal(selectedPairDetail.gasto) ? (
                    <Text style={{ fontSize: 13, color: themeColors.textSecondary }}>
                      Sucursal: {GastoHelper.getSucursal(selectedPairDetail.gasto)}
                    </Text>
                  ) : null}
                  {GastoHelper.getSubcategoria(selectedPairDetail.gasto) ? (
                    <Text style={{ fontSize: 13, color: themeColors.textSecondary }}>
                      Categoría: {GastoHelper.getCategoria(selectedPairDetail.gasto) ? `${GastoHelper.getCategoria(selectedPairDetail.gasto)} › ` : ''}{GastoHelper.getSubcategoria(selectedPairDetail.gasto)}
                    </Text>
                  ) : null}
                  <Text style={{ fontSize: 13, color: themeColors.textSecondary }}>
                    Proveedor: {GastoHelper.getProveedor(selectedPairDetail.gasto) || 'No especificado'}
                  </Text>
                  <Text style={{ fontSize: 13, color: themeColors.textSecondary }}>
                    Justificación: {selectedPairDetail.gasto.justificacion || 'Sin justificación'}
                  </Text>
                  <Text style={{ fontSize: 13, color: themeColors.textSecondary }}>
                    Fecha comprobante: {selectedPairDetail.gasto.fecha_comprobante || 'Sin fecha'}
                  </Text>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: themeColors.success, marginTop: 4 }}>
                    Monto registrado: {formatCurrency(Number(selectedPairDetail.gasto.monto) || 0)}
                  </Text>

                  {Math.abs(selectedPairDetail.cargo.monto - (Number(selectedPairDetail.gasto.monto) || 0)) >= 0.05 && (
                    <TouchableOpacity
                      style={[
                        styles.optionalUpdateBtn,
                        {
                          marginTop: 8,
                          alignSelf: 'flex-start',
                          borderColor: themeColors.accent,
                          backgroundColor: themeColors.accent + '12',
                        },
                      ]}
                      onPress={() => handleOptionalUpdateGastoAmount(selectedPairDetail)}
                      disabled={isUpdatingGastoId === selectedPairDetail.gasto.id}
                    >
                      <Ionicons name="sync-outline" size={14} color={themeColors.accent} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.accent }}>
                        Cambiar monto del gasto a {formatCurrency(selectedPairDetail.cargo.monto)} (Opcional)
                      </Text>
                    </TouchableOpacity>
                  )}

                  <GastoFotosGallery
                    gasto={selectedPairDetail.gasto}
                    themeColors={themeColors}
                    onPhotoPress={(url, index, allUrls) => {
                      setPhotoViewerUrl(url);
                      setViewerPhotoUrls(allUrls);
                      setViewerInitialIndex(index);
                    }}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.modalDangerBtn, { borderColor: themeColors.danger }]}
                  onPress={() => handleUnlinkPair(selectedPairDetail.id)}
                >
                  <Ionicons name="unlink-outline" size={16} color={themeColors.danger} />
                  <Text style={{ color: themeColors.danger, fontWeight: '700' }}>Desvincular este Par</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── MODAL: VINCULACIÓN MANUAL DE UN COBRO A UN GASTO ── */}
      <Modal
        statusBarTranslucent={true}
        visible={!!manualPairCargo}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setManualPairCargo(null);
          setCandidateSearchText('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: themeColors.backgroundElement }]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Vincular Cobro a Gasto</Text>
                <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 1 }}>
                  Selecciona el gasto que corresponde a este cobro
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setManualPairCargo(null);
                  setCandidateSearchText('');
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            {manualPairCargo && (
              <View style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {/* Cabecera fija: Cobro seleccionado y buscador */}
                <View style={{ padding: 14, gap: 10, borderBottomWidth: 1, borderBottomColor: themeColors.border }}>
                  <View style={[styles.detailSection, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: themeColors.danger }}>COBRO DE TARJETA SELECCIONADO</Text>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: themeColors.danger }}>
                        {formatCurrency(manualPairCargo.monto)}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.text }}>{manualPairCargo.descripcion}</Text>
                    <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>Fecha de operación: {manualPairCargo.fecha}</Text>
                  </View>

                  {/* Campo de búsqueda */}
                  <View style={[styles.modalSearchContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                    <Ionicons name="search" size={16} color={themeColors.textSecondary} />
                    <TextInput
                      style={[styles.modalSearchInput, { color: themeColors.text }]}
                      placeholder="Buscar por empleado, proveedor o concepto..."
                      placeholderTextColor={themeColors.textSecondary}
                      value={candidateSearchText}
                      onChangeText={setCandidateSearchText}
                    />
                    {candidateSearchText ? (
                      <TouchableOpacity onPress={() => setCandidateSearchText('')}>
                        <Ionicons name="close-circle" size={18} color={themeColors.textSecondary} />
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.textSecondary }}>
                      Gastos sugeridos ({candidateGastosForCargo.length})
                    </Text>
                    <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                      Ordenados por cercanía de monto
                    </Text>
                  </View>
                </View>

                {/* Lista scrollable de candidatos */}
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, gap: 8 }}>
                  {candidateGastosForCargo.length === 0 ? (
                    <View style={{ padding: 28, alignItems: 'center', gap: 6 }}>
                      <Ionicons name="search-outline" size={32} color={themeColors.textSecondary} />
                      <Text style={{ color: themeColors.textSecondary, textAlign: 'center', fontSize: 13 }}>
                        {candidateSearchText
                          ? 'No se encontraron gastos que coincidan con la búsqueda.'
                          : 'No hay gastos sin vincular disponibles.'}
                      </Text>
                    </View>
                  ) : (
                    candidateGastosForCargo.map(gasto => {
                      const gastoMonto = Number(gasto.monto) || 0;
                      const diff = Math.abs(gastoMonto - manualPairCargo.monto);
                      const isExact = diff < 0.05;

                      return (
                        <TouchableOpacity
                          key={gasto.id}
                          style={[
                            styles.selectableCandidate,
                            {
                              borderColor: isExact ? themeColors.success : themeColors.border,
                              backgroundColor: isExact
                                ? (scheme === 'dark' ? 'rgba(22, 163, 74, 0.15)' : 'rgba(22, 163, 74, 0.07)')
                                : themeColors.background,
                              borderWidth: isExact ? 1.5 : 1,
                            },
                          ]}
                          onPress={() => {
                            handleManualPairConfirm(manualPairCargo, gasto);
                            setCandidateSearchText('');
                          }}
                        >
                          <View style={{ flex: 1, gap: 3 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                              <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.text, flex: 1 }} numberOfLines={1}>
                                {gasto.empleado_nombre}
                              </Text>
                              <Text style={{ fontSize: 15, fontWeight: '800', color: isExact ? themeColors.success : themeColors.text }}>
                                {formatCurrency(gastoMonto)}
                              </Text>
                            </View>

                            <Text style={{ fontSize: 12, color: themeColors.textSecondary }} numberOfLines={1}>
                              {gasto.fecha_comprobante || 'Sin fecha'} · {GastoHelper.getProveedor(gasto) || gasto.justificacion || 'Sin detalle'}
                            </Text>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                              {isExact ? (
                                <View style={[styles.candidateMatchBadge, { backgroundColor: 'rgba(22, 163, 74, 0.2)' }]}>
                                  <Text style={[styles.candidateMatchBadgeText, { color: themeColors.success }]}>
                                    ✓ MONTO IDÉNTICO
                                  </Text>
                                </View>
                              ) : (
                                <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                                  Diferencia: {formatCurrency(diff)}
                                </Text>
                              )}
                            </View>
                          </View>

                          <View style={{ paddingLeft: 8 }}>
                            <Ionicons name="add-circle" size={26} color={isExact ? themeColors.success : themeColors.accent} />
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ── MODAL: BUSCAR PAR EN TARJETA PARA UN GASTO ── */}
      <Modal
        statusBarTranslucent={true}
        visible={!!manualPairGasto}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setManualPairGasto(null);
          setCandidateSearchText('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: themeColors.backgroundElement }]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Vincular Gasto a Cobro</Text>
                <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 1 }}>
                  Selecciona el cobro bancario de la tarjeta que corresponde a este gasto
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setManualPairGasto(null);
                  setCandidateSearchText('');
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            {manualPairGasto && (
              <View style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {/* Cabecera fija: Gasto seleccionado y buscador */}
                <View style={{ padding: 14, gap: 10, borderBottomWidth: 1, borderBottomColor: themeColors.border }}>
                  <View style={[styles.detailSection, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#ea580c' }}>GASTO DE LA APP SELECCIONADO</Text>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#ea580c' }}>
                        {formatCurrency(Number(manualPairGasto.monto) || 0)}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.text }}>{manualPairGasto.empleado_nombre}</Text>
                    <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                      {GastoHelper.getProveedor(manualPairGasto) || manualPairGasto.justificacion || 'Sin detalle'} · Fecha: {manualPairGasto.fecha_comprobante}
                    </Text>
                  </View>

                  {/* Campo de búsqueda */}
                  <View style={[styles.modalSearchContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                    <Ionicons name="search" size={16} color={themeColors.textSecondary} />
                    <TextInput
                      style={[styles.modalSearchInput, { color: themeColors.text }]}
                      placeholder="Buscar por comercio o concepto bancario..."
                      placeholderTextColor={themeColors.textSecondary}
                      value={candidateSearchText}
                      onChangeText={setCandidateSearchText}
                    />
                    {candidateSearchText ? (
                      <TouchableOpacity onPress={() => setCandidateSearchText('')}>
                        <Ionicons name="close-circle" size={18} color={themeColors.textSecondary} />
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.textSecondary }}>
                      Cobros candidatos ({candidateCargosForGasto.length})
                    </Text>
                    <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                      Ordenados por cercanía de monto
                    </Text>
                  </View>
                </View>

                {/* Lista scrollable de candidatos */}
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, gap: 8 }}>
                  {candidateCargosForGasto.length === 0 ? (
                    <View style={{ padding: 28, alignItems: 'center', gap: 6 }}>
                      <Ionicons name="search-outline" size={32} color={themeColors.textSecondary} />
                      <Text style={{ color: themeColors.textSecondary, textAlign: 'center', fontSize: 13 }}>
                        {candidateSearchText
                          ? 'No se encontraron cobros que coincidan con la búsqueda.'
                          : 'No hay cobros de tarjeta sin vincular disponibles.'}
                      </Text>
                    </View>
                  ) : (
                    candidateCargosForGasto.map(cargo => {
                      const gastoMonto = Number(manualPairGasto.monto) || 0;
                      const diff = Math.abs(cargo.monto - gastoMonto);
                      const isExact = diff < 0.05;

                      return (
                        <TouchableOpacity
                          key={cargo.id}
                          style={[
                            styles.selectableCandidate,
                            {
                              borderColor: isExact ? themeColors.success : themeColors.border,
                              backgroundColor: isExact
                                ? (scheme === 'dark' ? 'rgba(22, 163, 74, 0.15)' : 'rgba(22, 163, 74, 0.07)')
                                : themeColors.background,
                              borderWidth: isExact ? 1.5 : 1,
                            },
                          ]}
                          onPress={() => {
                            handleManualPairConfirm(cargo, manualPairGasto);
                            setCandidateSearchText('');
                          }}
                        >
                          <View style={{ flex: 1, gap: 3 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                              <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.text, flex: 1 }} numberOfLines={1}>
                                {cargo.descripcion}
                              </Text>
                              <Text style={{ fontSize: 15, fontWeight: '800', color: isExact ? themeColors.success : themeColors.text }}>
                                {formatCurrency(cargo.monto)}
                              </Text>
                            </View>

                            <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                              Fecha operación en banco: {cargo.fecha}
                            </Text>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                              {isExact ? (
                                <View style={[styles.candidateMatchBadge, { backgroundColor: 'rgba(22, 163, 74, 0.2)' }]}>
                                  <Text style={[styles.candidateMatchBadgeText, { color: themeColors.success }]}>
                                    ✓ MONTO IDÉNTICO
                                  </Text>
                                </View>
                              ) : (
                                <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                                  Diferencia: {formatCurrency(diff)}
                                </Text>
                              )}
                            </View>
                          </View>

                          <View style={{ paddingLeft: 8 }}>
                            <Ionicons name="add-circle" size={26} color={isExact ? themeColors.success : themeColors.accent} />
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ── MODAL: PEGAR TEXTO DE SCREENSHOT/EXCEL ── */}
      <Modal statusBarTranslucent={true} visible={pasteModalVisible} transparent animationType="slide" onRequestClose={() => setPasteModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: themeColors.backgroundElement }]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Pegar Movimientos</Text>
              <TouchableOpacity onPress={() => setPasteModalVisible(false)}>
                <Ionicons name="close" size={22} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 16, gap: 12 }}>
              <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                Pega texto copiado de Excel, WhatsApp o notas. Admite columnas separadas por tabulación o comas:
              </Text>
              <TextInput
                style={[styles.pasteInput, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.background }]}
                multiline
                numberOfLines={6}
                placeholder={`2024-07-28\tRest shing long revolu\t758.00\n2024-07-28\tOxxo gas garza sada\t1191.50`}
                placeholderTextColor={themeColors.textSecondary}
                value={pasteText}
                onChangeText={setPasteText}
              />
              <TouchableOpacity
                style={[styles.executeBtn, { backgroundColor: themeColors.accent }]}
                onPress={handleApplyPasteText}
              >
                <Text style={styles.executeBtnText}>Procesar e Insertar en Tabla</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL: DETALLE DE AUDITORÍA GUARDADA EN HISTORIAL ── */}
      <Modal statusBarTranslucent={true} visible={!!selectedSavedAudit} transparent animationType="slide" onRequestClose={() => setSelectedSavedAudit(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: themeColors.backgroundElement, maxHeight: '90%' }]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                Auditoría Guardada — {selectedSavedAudit?.tarjeta}
              </Text>
              <TouchableOpacity onPress={() => setSelectedSavedAudit(null)}>
                <Ionicons name="close" size={22} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            {selectedSavedAudit && (
              <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
                <View style={[styles.historyKpiRow, { backgroundColor: scheme === 'dark' ? '#1e293b' : '#f8fafc' }]}>
                  <View style={styles.historyKpiItem}>
                    <Text style={[styles.historyKpiLabel, { color: themeColors.textSecondary }]}>TOTAL CARGOS</Text>
                    <Text style={[styles.historyKpiVal, { color: themeColors.text }]}>{formatCurrency(selectedSavedAudit.total_cargos)}</Text>
                  </View>
                  <View style={styles.historyKpiItem}>
                    <Text style={[styles.historyKpiLabel, { color: themeColors.success }]}>CONCILIADO</Text>
                    <Text style={[styles.historyKpiVal, { color: themeColors.success }]}>{formatCurrency(selectedSavedAudit.total_conciliado)}</Text>
                  </View>
                  <View style={styles.historyKpiItem}>
                    <Text style={[styles.historyKpiLabel, { color: themeColors.danger }]}>PENDIENTE</Text>
                    <Text style={[styles.historyKpiVal, { color: themeColors.danger }]}>{formatCurrency(selectedSavedAudit.total_faltante)}</Text>
                  </View>
                </View>

                <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text }}>
                  Pares Conciliados ({selectedSavedAudit.resultado_json?.reconciliation?.matched?.length || 0})
                </Text>

                {(selectedSavedAudit.resultado_json?.reconciliation?.matched || []).map((p: any, idx: number) => (
                  <View key={idx} style={[styles.historyPairRow, { borderColor: themeColors.border, backgroundColor: themeColors.background }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text }}>{p.cargo?.descripcion}</Text>
                      <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>{p.cargo?.fecha} · Banco</Text>
                    </View>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.success }}>{p.gasto?.empleado_nombre}</Text>
                      <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>{formatCurrency(p.cargo?.monto)}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Visor de imágenes a pantalla completa */}
      <ImageViewerModal
        visible={!!photoViewerUrl}
        imageUrl={photoViewerUrl}
        imageUrls={viewerPhotoUrls.length > 0 ? viewerPhotoUrls : (photoViewerUrl ? [photoViewerUrl] : [])}
        initialIndex={viewerInitialIndex}
        onClose={() => {
          setPhotoViewerUrl(null);
          setViewerPhotoUrls([]);
        }}
      />
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  tabSelector: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 3,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  tabButtonText: { fontSize: 12, fontWeight: '700' },
  scrollArea: { padding: 16, gap: 16, maxWidth: 1000, alignSelf: 'center', width: '100%' },

  // Tarjetas contenedor
  cardSection: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  sectionHeading: { fontSize: 15, fontWeight: '800' },

  // Selector tarjetas
  cardChipsRow: { gap: 8, paddingVertical: 4 },
  cardChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  cardDot: { width: 10, height: 10, borderRadius: 5 },
  cardChipText: { fontSize: 12 },
  metodoPagoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  smallLabel: { fontSize: 12, fontWeight: '600' },
  metodoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },

  // Toggle de modo
  modeToggleContainer: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 8,
    padding: 3,
  },
  modeToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 6,
  },
  modeToggleText: { fontSize: 12, fontWeight: '700' },

  // Modo Excel
  excelModeContainer: { gap: 10 },
  uploadBox: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 10,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  uploadBoxTitle: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  uploadBoxSub: { fontSize: 12, textAlign: 'center' },
  excelSummaryBanner: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  excelSummaryItem: { alignItems: 'center' },
  excelSummaryLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  excelSummaryVal: { fontSize: 13, fontWeight: '800', marginTop: 2 },

  // Modo Screenshot (Tabla manual)
  screenshotModeContainer: { gap: 10 },
  imagePreviewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
  },
  thumbnailImg: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: '#000',
  },
  screenshotHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  smallActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  tableContainer: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  thCell: { fontSize: 11, fontWeight: '700' },
  tableDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: 1,
    gap: 6,
  },
  inputCell: {
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 4,
  },

  // Botón Conciliar
  executeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
  },
  executeBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  // Dashboard de Resultados
  resultsContainer: { gap: 14 },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiCard: {
    flex: 1,
    minWidth: 160,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  kpiLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  kpiValue: { fontSize: 18, fontWeight: '800', marginVertical: 3 },
  kpiSub: { fontSize: 11 },

  // Botones de acción
  actionButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    minWidth: 150,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionBtnText: { fontSize: 12, fontWeight: '700' },

  // Pestañas de resultados
  resultTabsContainer: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 8,
    padding: 3,
  },
  resultTabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 6,
  },
  resultTabText: { fontSize: 12, fontWeight: '700' },

  // Búsqueda
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 13 },

  // Listas de resultados
  tabContentList: { gap: 10 },
  emptyBox: {
    padding: 35,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyBoxText: { fontSize: 13, textAlign: 'center' },

  // Tarjeta de Par Conciliado
  pairCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  pairHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgeSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#16a34a15',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeSuccessText: { color: '#16a34a', fontSize: 11, fontWeight: '700' },
  badgeWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#f59e0b25',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#f59e0b80',
  },
  badgeWarningText: { color: '#b45309', fontSize: 11, fontWeight: '800' },
  pendingApprovalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 12,
  },
  approveAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#d97706',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  approveDiffBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#d97706',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
  },
  approveDiffBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  optionalUpdateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 5,
  },
  unlinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  pairColumnsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sideBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  sideBoxHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  sideBoxTitle: { fontSize: 11, fontWeight: '800' },
  sideDesc: { fontSize: 13, fontWeight: '600' },
  sideInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  sideDate: { fontSize: 11 },
  sideAmount: { fontSize: 14, fontWeight: '800' },
  pairLinkIcon: { paddingHorizontal: 4 },
  viewDetailLink: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4, alignSelf: 'flex-start' },

  // Tarjetas Sin Par
  unmatchedCard: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  unmatchedCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  unmatchedTitle: { fontSize: 14, fontWeight: '700' },
  unmatchedSub: { fontSize: 12, marginTop: 2 },
  unmatchedDate: { fontSize: 11, marginTop: 3 },
  pairActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
  },

  // Historial
  historialFiltersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  historialFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1.5,
    alignSelf: 'center',
  },
  historyCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    gap: 10,
  },
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyCardTitle: { fontSize: 15, fontWeight: '800' },
  historyKpiRow: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 8,
    justifyContent: 'space-around',
  },
  historyKpiItem: { alignItems: 'center' },
  historyKpiLabel: { fontSize: 10, fontWeight: '800' },
  historyKpiVal: { fontSize: 13, fontWeight: '800', marginTop: 2 },
  historyActionsRow: { flexDirection: 'row', gap: 8 },
  historyActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    paddingVertical: 7,
    borderRadius: 6,
  },

  // Modales
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalBox: {
    width: '100%',
    maxWidth: 600,
    maxHeight: '85%',
    borderRadius: 12,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 15, fontWeight: '800' },
  detailSection: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  detailSectionTitle: { fontSize: 11, fontWeight: '800', marginBottom: 2 },
  modalDangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 9,
    marginTop: 6,
  },
  selectableCandidate: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    gap: 8,
  },
  modalSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 38,
    gap: 8,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  candidateMatchBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  candidateMatchBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  pasteInput: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    fontSize: 12,
    textAlignVertical: 'top',
    height: 120,
  },
  historyPairRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
  },
});
