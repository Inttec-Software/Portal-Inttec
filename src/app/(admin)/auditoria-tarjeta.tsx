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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { supabase, Gasto } from '@/services/supabase';
import { GeminiService, CardTransaction, CardStatementResult } from '@/services/gemini';
import ImageViewerModal from '@/components/ImageViewerModal';

// ─── Constants ────────────────────────────────────────────────────────────────

const TARJETAS = [
  { key: 'BBVA',    label: 'BBVA',     color: '#004A97' },
  { key: 'AMEX',    label: 'AMEX',     color: '#016FD0' },
  { key: 'MARRIOT', label: 'Marriott', color: '#B5121B' },
  { key: 'BANORTE', label: 'Banorte',  color: '#C8102E' },
];

const TIPOS_PAGO = [
  { key: 'tarjeta_credito', label: 'Crédito',    icon: 'card-outline' as const },
  { key: 'tarjeta_debito',  label: 'Débito',     icon: 'wallet-outline' as const },
  { key: 'tarjeta',         label: 'Cualquiera', icon: 'apps-outline' as const },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

const formatCurrency = (val: number) =>
  '$' + val.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const toMs = (dateStr: string | null): number | null => {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00Z');
  return isNaN(d.getTime()) ? null : d.getTime();
};

const DAY_MS = 86_400_000;
const MATCH_TOLERANCE_DAYS = 3;
const AMOUNT_TOLERANCE = 0.05;

// ─── Types ────────────────────────────────────────────────────────────────────

type TarjetaKey = 'BBVA' | 'AMEX' | 'MARRIOT' | 'BANORTE';
type MetodoPagoKey = 'tarjeta_credito' | 'tarjeta_debito' | 'tarjeta';

interface MatchedTransaction {
  transaction: CardTransaction;
  matchedGastos: Gasto[];
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function AuditoriaTarjetaScreen() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const isMobile = windowWidth < 600;

  // Card selector
  const [selectedTarjeta, setSelectedTarjeta] = useState<TarjetaKey | null>(null);
  const [selectedMetodoPago, setSelectedMetodoPago] = useState<MetodoPagoKey>('tarjeta_credito');

  // File
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [fileMimeType, setFileMimeType] = useState<string>('application/pdf');
  const [fileName, setFileName] = useState<string | null>(null);

  // Analysis
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [statementResult, setStatementResult] = useState<CardStatementResult | null>(null);
  const [matchedList, setMatchedList] = useState<MatchedTransaction[]>([]);
  const [appGastos, setAppGastos] = useState<Gasto[]>([]);

  // UI
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'todos' | 'reportados' | 'no_reportados'>('todos');
  const [selectedMatch, setSelectedMatch] = useState<MatchedTransaction | null>(null);
  const [selectedGastosToLink, setSelectedGastosToLink] = useState<Set<string>>(new Set());
  const [photoViewerUrl, setPhotoViewerUrl] = useState<string | null>(null);

  const selectedTarjetaInfo = TARJETAS.find(t => t.key === selectedTarjeta);
  const selectedMetodoPagoInfo = TIPOS_PAGO.find(m => m.key === selectedMetodoPago);
  const canUpload = !!selectedTarjeta;

  // ─────────────────────────────────────────────────────────────────────────────
  // File selection
  // ─────────────────────────────────────────────────────────────────────────────

  const handleSelectFile = async () => {
    if (!selectedTarjeta) {
      showAlert('Selecciona una tarjeta', 'Primero elige la tarjeta corporativa del estado de cuenta.');
      return;
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const uri = asset.uri;
      const mime = asset.mimeType || (uri.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
      const isPdf = mime.includes('pdf') || uri.endsWith('.pdf') || asset.name?.endsWith('.pdf');
      const isImage = mime.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(uri);

      if (!isPdf && !isImage) {
        showAlert('Formato no soportado', 'Selecciona un PDF o imagen (JPG, PNG, WEBP).');
        return;
      }

      setFileName(asset.name || 'estado_de_cuenta');
      setFileMimeType(mime);
      setStatementResult(null);
      setMatchedList([]);

      try {
        if (Platform.OS !== 'web') {
          const FileSys = require('expo-file-system/legacy');
          const tempFileName = `temp_${Date.now()}_${asset.name || 'estado.pdf'}`;
          const targetUri = `${FileSys.cacheDirectory}${tempFileName}`;
          await FileSys.copyAsync({ from: uri, to: targetUri });
          const b64 = await FileSys.readAsStringAsync(targetUri, {
            encoding: FileSys.EncodingType.Base64,
          });
          setFileBase64(b64);
        } else {
          const response = await fetch(uri);
          const blob = await response.blob();
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            setFileBase64(dataUrl.split(',')[1] || '');
          };
          reader.readAsDataURL(blob);
        }
      } catch (readErr: any) {
        showAlert('Error', 'No se pudo leer el archivo. Intenta de nuevo.');
        console.error('Read error:', readErr);
      }
    } catch (err) {
      console.error('Document picker error:', err);
      showAlert('Error', 'No se pudo seleccionar el archivo.');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Analysis + cross-reference
  // ─────────────────────────────────────────────────────────────────────────────

  const handleAnalyze = async () => {
    if (!selectedTarjeta) {
      showAlert('Sin tarjeta', 'Selecciona la tarjeta corporativa primero.');
      return;
    }
    if (!fileBase64) {
      showAlert('Sin archivo', 'Primero selecciona el estado de cuenta.');
      return;
    }

    setIsAnalyzing(true);
    try {
      // 1. Extract transactions via Gemini
      const result = await GeminiService.analyzeCardStatement(fileBase64, fileMimeType);
      setStatementResult(result);

      const cargos = result.transacciones.filter(t => t.tipo !== 'abono');
      if (cargos.length === 0) {
        showAlert('Sin cargos', 'No se encontraron cargos en el estado de cuenta.');
        setIsAnalyzing(false);
        return;
      }

      // 2. Date range
      const fechaMs = cargos.map(t => toMs(t.fecha)).filter(Boolean) as number[];
      const minDate = fechaMs.length > 0
        ? new Date(Math.min(...fechaMs) - DAY_MS * MATCH_TOLERANCE_DAYS).toISOString().split('T')[0]
        : result.periodo_inicio || '2000-01-01';
      const maxDate = fechaMs.length > 0
        ? new Date(Math.max(...fechaMs) + DAY_MS * MATCH_TOLERANCE_DAYS).toISOString().split('T')[0]
        : result.periodo_fin || new Date().toISOString().split('T')[0];

      // 3. Fetch gastos filtered by SPECIFIC card AND payment method
      let query = supabase
        .from('gastos')
        .select('*')
        .eq('status', 'APPROVED')
        .eq('tipo_tarjeta', selectedTarjeta)
        .gte('fecha_comprobante', minDate)
        .lte('fecha_comprobante', maxDate);

      if (selectedMetodoPago !== 'tarjeta') {
        // Specific method: credit or debit
        query = query.eq('metodo_pago', selectedMetodoPago);
      } else {
        // "Any" card method
        query = query.in('metodo_pago', ['tarjeta', 'tarjeta_credito', 'tarjeta_debito']);
      }

      const { data: gastosData, error } = await query;
      if (error) throw error;
      const gastos: Gasto[] = gastosData || [];

      // 4. Cross-reference each cargo with a reported expense
      const usedGastoIds = new Set<string>();
      const matched: MatchedTransaction[] = cargos.map(cargo => {
        const cargoMs = toMs(cargo.fecha);
        const cargoMonto = Number(cargo.monto) || 0;

        const candidate = gastos.find(g => {
          if (usedGastoIds.has(g.id)) return false;
          const gastoMs = toMs(g.fecha_comprobante ?? null);
          const montoMatch = Math.abs((Number(g.monto) || 0) - cargoMonto) <= AMOUNT_TOLERANCE;
          const dateMatch = cargoMs !== null && gastoMs !== null
            ? Math.abs(cargoMs - gastoMs) <= MATCH_TOLERANCE_DAYS * DAY_MS
            : false;
          return montoMatch && dateMatch;
        });

        if (candidate) usedGastoIds.add(candidate.id);
        return { transaction: cargo, matchedGastos: candidate ? [candidate] : [] };
      });

      setAppGastos(gastos);
      setMatchedList(matched);
    } catch (err: any) {
      console.error('Analysis error:', err);
      showAlert('Error de análisis', err.message || 'No se pudo analizar el estado de cuenta.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Derived state
  // ─────────────────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const reportados = matchedList.filter(m => m.matchedGastos.length > 0);
    const noReportados = matchedList.filter(m => m.matchedGastos.length === 0);
    const totalCargos = matchedList.reduce((s, m) => s + (m.transaction.monto ?? 0), 0);
    const totalNoReportado = noReportados.reduce((s, m) => s + (m.transaction.monto ?? 0), 0);
    return { reportados, noReportados, totalCargos, totalNoReportado };
  }, [matchedList]);

  const filteredList = useMemo(() => {
    let list = matchedList;
    if (filterTab === 'reportados') list = list.filter(m => m.matchedGastos.length > 0);
    if (filterTab === 'no_reportados') list = list.filter(m => m.matchedGastos.length === 0);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(m =>
        m.transaction.descripcion?.toLowerCase().includes(q) ||
        m.transaction.fecha?.includes(q) ||
        String(m.transaction.monto).includes(q) ||
        m.matchedGastos.some(g =>
          g.justificacion?.toLowerCase().includes(q) ||
          g.proveedor?.toLowerCase().includes(q) ||
          g.empleado_nombre?.toLowerCase().includes(q)
        )
      );
    }
    return list;
  }, [matchedList, filterTab, searchQuery]);

  const availableGastos = useMemo(() => {
    const usedIds = new Set<string>();
    matchedList.forEach(m => {
      if (m !== selectedMatch) {
        m.matchedGastos.forEach(g => usedIds.add(g.id));
      }
    });
    return appGastos.filter(g => !usedIds.has(g.id));
  }, [appGastos, matchedList, selectedMatch]);

  const handleLinkSelectedGastos = () => {
    if (!selectedMatch || selectedGastosToLink.size === 0) return;
    const gastosToLink = availableGastos.filter(g => selectedGastosToLink.has(g.id));
    
    // Update matchedList in memory
    setMatchedList(prev => prev.map(m => {
      if (m === selectedMatch) {
        return { ...m, matchedGastos: gastosToLink };
      }
      return m;
    }));
    
    // Reset and close
    setSelectedMatch(null);
    setSelectedGastosToLink(new Set());
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Report Generation (PDF)
  // ─────────────────────────────────────────────────────────────────────────────

  const generatePDFReport = async () => {
    setIsGeneratingPDF(true);
    try {
      const now = new Date();
      const dateString = now.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      
      const tableStyle = `
        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
        th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
        th { background-color: #f8fafc; color: #475569; font-weight: bold; text-transform: uppercase; font-size: 11px; }
        .monto { text-align: right; font-weight: bold; }
        .danger { color: #dc2626; }
        .success { color: #059669; }
        .sub-row td { background-color: #f0fdf4; border-top: none; color: #334155; padding-left: 24px; font-size: 11px; }
      `;

      let reportadosHtml = '';
      if (stats.reportados.length > 0) {
        reportadosHtml = `
          <h3>✅ Cargos Conciliados (${stats.reportados.length})</h3>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Concepto Banco</th>
                <th class="monto">Monto Banco</th>
              </tr>
            </thead>
            <tbody>
              ${stats.reportados.map(m => `
                <tr>
                  <td>${m.transaction.fecha || '-'}</td>
                  <td><strong>${m.transaction.descripcion || '-'}</strong></td>
                  <td class="monto success">${formatCurrency(m.transaction.monto || 0)}</td>
                </tr>
                ${m.matchedGastos.map(g => `
                  <tr class="sub-row">
                    <td colspan="2">↳ <em>Gasto App:</em> ${g.empleado_nombre || 'Empleado'} - ${g.justificacion || g.proveedor || 'Sin detalles'}</td>
                    <td class="monto" style="color: #64748b; font-weight: normal;">${formatCurrency(Number(g.monto) || 0)}</td>
                  </tr>
                `).join('')}
              `).join('')}
            </tbody>
          </table>
        `;
      }

      let noReportadosHtml = '';
      if (stats.noReportados.length > 0) {
        noReportadosHtml = `
          <h3 style="margin-top: 30px; color: #dc2626;">⚠ Cargos Sin Reportar (${stats.noReportados.length})</h3>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Concepto Banco</th>
                <th class="monto">Monto Banco</th>
              </tr>
            </thead>
            <tbody>
              ${stats.noReportados.map(m => `
                <tr>
                  <td>${m.transaction.fecha || '-'}</td>
                  <td>${m.transaction.descripcion || '-'}</td>
                  <td class="monto danger">${formatCurrency(m.transaction.monto || 0)}</td>
                </tr>
              `).join('')}
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
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.5; padding: 40px; }
            h1 { color: #0f172a; margin-bottom: 5px; font-size: 24px; }
            h2 { color: #334155; font-size: 16px; margin-top: 0; font-weight: normal; margin-bottom: 30px; }
            .header-info { display: flex; justify-content: space-between; margin-bottom: 30px; background-color: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; }
            .header-info div { flex: 1; }
            .header-info strong { display: block; font-size: 11px; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
            .header-info span { font-size: 14px; font-weight: 600; }
            
            .stats-grid { display: flex; gap: 15px; margin-bottom: 40px; }
            .stat-box { flex: 1; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center; }
            .stat-box.primary { background-color: #f0f9ff; border-color: #bae6fd; }
            .stat-box.success { background-color: #f0fdf4; border-color: #bbf7d0; }
            .stat-box.danger { background-color: #fef2f2; border-color: #fecaca; }
            .stat-label { font-size: 11px; font-weight: bold; color: #64748b; margin-bottom: 5px; display: block; }
            .stat-value { font-size: 20px; font-weight: 800; }
            .stat-box.primary .stat-value { color: #0284c7; }
            .stat-box.success .stat-value { color: #16a34a; }
            .stat-box.danger .stat-value { color: #dc2626; }
            ${tableStyle}
            .footer { margin-top: 50px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px; }
          </style>
        </head>
        <body>
          <h1>Reporte de Auditoría de Tarjeta</h1>
          <h2>Generado el ${dateString}</h2>

          <div class="header-info">
            <div>
              <strong>Tarjeta Auditada</strong>
              <span>${selectedTarjetaInfo?.label || 'Desconocida'} (${selectedMetodoPagoInfo?.label || 'Cualquiera'})</span>
            </div>
            <div>
              <strong>Titular de Cuenta</strong>
              <span>${statementResult?.titular || 'No especificado'}</span>
            </div>
            <div>
              <strong>Período</strong>
              <span>${statementResult?.periodo_inicio || '-'} al ${statementResult?.periodo_fin || '-'}</span>
            </div>
          </div>

          <div class="stats-grid">
            <div class="stat-box primary">
              <span class="stat-label">TOTAL CARGOS (${matchedList.length})</span>
              <span class="stat-value">${formatCurrency(stats.totalCargos)}</span>
            </div>
            <div class="stat-box success">
              <span class="stat-label">CONCILIADO (${stats.reportados.length})</span>
              <span class="stat-value">${formatCurrency(stats.reportados.reduce((s, m) => s + (m.transaction.monto || 0), 0))}</span>
            </div>
            <div class="stat-box danger">
              <span class="stat-label">FALTANTE (${stats.noReportados.length})</span>
              <span class="stat-value">${formatCurrency(stats.totalNoReportado)}</span>
            </div>
          </div>

          ${reportadosHtml}
          ${noReportadosHtml}

          <div class="footer">
            Reporte generado automáticamente por el Portal Administrativo Inttec.<br>
            Archivo fuente procesado: ${fileName || 'Desconocido'}
          </div>
        </body>
        </html>
      `;

      const reportTitle = `Auditoria de tarjeta ${selectedTarjetaInfo?.label || 'banco'}`;

      if (Platform.OS === 'web') {
        // Custom robust iframe printing for Web to avoid expo-print iframe issues
        // and force the browser to use our custom title as the PDF filename.
        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.width = '0px';
        iframe.style.height = '0px';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);
        
        const doc = iframe.contentWindow?.document || iframe.contentDocument;
        if (doc) {
          const htmlWithTitle = html.replace('<head>', `<head><title>${reportTitle}</title>`);
          doc.open();
          doc.write(htmlWithTitle);
          doc.close();
          
          setTimeout(() => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            document.body.removeChild(iframe);
          }, 500);
        }
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        let shareUri = uri;
        
        try {
          // Rename the temp file so the shared PDF has the correct name
          const FileSys = require('expo-file-system');
          const cleanTitle = reportTitle.replace(/[^a-zA-Z0-9_]/g, '_');
          const newUri = `${FileSys.cacheDirectory}${cleanTitle}.pdf`;
          await FileSys.copyAsync({ from: uri, to: newUri });
          shareUri = newUri;
        } catch (copyErr) {
          console.warn('Could not rename PDF file:', copyErr);
        }

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(shareUri, {
            mimeType: 'application/pdf',
            dialogTitle: reportTitle,
            UTI: 'com.adobe.pdf'
          });
        } else {
          showAlert('Listo', 'PDF Generado en: ' + shareUri);
        }
      }
    } catch (err: any) {
      console.error('Error generando PDF:', err);
      showAlert('Error', 'No se pudo generar el documento PDF.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────────

  const renderTransactionCard = useCallback(({ item }: { item: MatchedTransaction }) => {
    const { transaction, matchedGastos } = item;
    const isMatched = matchedGastos.length > 0;

    return (
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={() => setSelectedMatch(item)}
        style={[
          styles.txCard,
          {
            backgroundColor: themeColors.backgroundElement,
            borderColor: isMatched ? themeColors.success : themeColors.danger,
            borderLeftWidth: 4,
            borderWidth: 1,
          },
        ]}
      >
        <View style={styles.txCardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.txDesc, { color: themeColors.text }]} numberOfLines={2}>
              {transaction.descripcion || 'Sin descripción'}
            </Text>
            <Text style={[styles.txFecha, { color: themeColors.textSecondary }]}>
              {transaction.fecha || 'Sin fecha'}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.txMonto, { color: themeColors.danger }]}>
              {formatCurrency(transaction.monto ?? 0)}
            </Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: isMatched ? themeColors.success + '25' : themeColors.danger + '25' },
              ]}
            >
              <Ionicons
                name={isMatched ? 'checkmark-circle' : 'warning'}
                size={12}
                color={isMatched ? themeColors.success : themeColors.danger}
              />
              <Text style={[styles.statusText, { color: isMatched ? themeColors.success : themeColors.danger }]}>
                {isMatched ? 'Reportado' : 'Sin reportar'}
              </Text>
            </View>
          </View>
        </View>

        {isMatched && (
          <View
            style={[
              styles.matchedDetail,
              { backgroundColor: themeColors.success + '10', borderColor: themeColors.success + '30', flexDirection: 'column', alignItems: 'flex-start' },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Ionicons name="receipt-outline" size={13} color={themeColors.success} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.success, marginLeft: 4 }}>
                {matchedGastos.length} {matchedGastos.length === 1 ? 'gasto vinculado' : 'gastos vinculados'}
              </Text>
            </View>
            {matchedGastos.map(g => (
              <Text key={g.id} style={[styles.matchedText, { color: themeColors.textSecondary }]} numberOfLines={1}>
                • {formatCurrency(g.monto)} — {g.justificacion || g.proveedor || 'Gasto'} ({g.empleado_nombre})
              </Text>
            ))}
          </View>
        )}
      </TouchableOpacity>
    );
  }, [themeColors]);

  const hasResults = matchedList.length > 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.background }]}>

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity
          onPress={() => router.replace('/(admin)/dashboard' as any)}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color={themeColors.text} />
        </TouchableOpacity>
        <View>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Auditoría de Tarjeta</Text>
          <Text style={[styles.headerSub, { color: themeColors.textSecondary }]}>
            Estado de cuenta vs gastos reportados
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scrollContent,
          { maxWidth: 800, alignSelf: 'center', width: '100%' },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ═══════════════════════════════════════
            PASO 1 — Seleccionar tarjeta
        ═══════════════════════════════════════ */}
        <View style={[styles.sectionCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.stepCircle, { backgroundColor: themeColors.accent }]}>
              <Text style={styles.stepCircleText}>1</Text>
            </View>
            <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Selecciona la tarjeta</Text>
          </View>

          <Text style={[styles.hint, { color: themeColors.textSecondary }]}>
            Elige la tarjeta corporativa cuyo estado de cuenta vas a auditar.
          </Text>

          {/* Card grid */}
          <View style={[styles.cardGrid, isMobile ? { flexDirection: 'column' } : { flexDirection: 'row' }]}>
            {TARJETAS.map(t => {
              const isSelected = selectedTarjeta === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => {
                    setSelectedTarjeta(t.key as TarjetaKey);
                    setFileBase64(null);
                    setFileName(null);
                    setStatementResult(null);
                    setMatchedList([]);
                  }}
                  style={[
                    styles.cardOption,
                    {
                      borderColor: isSelected ? t.color : themeColors.border,
                      backgroundColor: isSelected ? t.color + '18' : themeColors.background,
                    },
                  ]}
                >
                  <View style={[styles.cardDot, { backgroundColor: t.color }]} />
                  <Text
                    style={[
                      styles.cardOptionLabel,
                      { color: isSelected ? t.color : themeColors.text, fontWeight: isSelected ? '800' : '600' },
                    ]}
                  >
                    {t.label}
                  </Text>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={18} color={t.color} style={{ marginLeft: 'auto' }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Tipo de pago — only show after selecting a card */}
          {selectedTarjeta && (
            <>
              <Text style={[styles.subLabel, { color: themeColors.textSecondary, marginTop: Spacing.two }]}>
                Tipo de tarjeta:
              </Text>
              <View style={styles.metodoPagoRow}>
                {TIPOS_PAGO.map(mp => {
                  const isSelected = selectedMetodoPago === mp.key;
                  return (
                    <TouchableOpacity
                      key={mp.key}
                      onPress={() => {
                        setSelectedMetodoPago(mp.key as MetodoPagoKey);
                        setStatementResult(null);
                        setMatchedList([]);
                      }}
                      style={[
                        styles.metodoPagoBtn,
                        {
                          backgroundColor: isSelected ? themeColors.accent : themeColors.background,
                          borderColor: isSelected ? themeColors.accent : themeColors.border,
                        },
                      ]}
                    >
                      <Ionicons
                        name={mp.icon}
                        size={16}
                        color={isSelected ? '#fff' : themeColors.textSecondary}
                      />
                      <Text style={[styles.metodoPagoBtnText, { color: isSelected ? '#fff' : themeColors.textSecondary }]}>
                        {mp.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
        </View>

        {/* ═══════════════════════════════════════
            PASO 2 — Subir estado de cuenta
        ═══════════════════════════════════════ */}
        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: themeColors.backgroundElement,
              borderColor: themeColors.border,
              opacity: canUpload ? 1 : 0.45,
            },
          ]}
        >
          <View style={styles.sectionHeader}>
            <View style={[styles.stepCircle, { backgroundColor: canUpload ? themeColors.accent : themeColors.textSecondary }]}>
              <Text style={styles.stepCircleText}>2</Text>
            </View>
            <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
              {'Sube el estado de cuenta'}
              {selectedTarjetaInfo ? ` — ${selectedTarjetaInfo.label}` : ''}
            </Text>
          </View>

          <Text style={[styles.hint, { color: themeColors.textSecondary }]}>
            {'Sube el PDF o imagen del estado de cuenta de '}
            <Text style={{ fontWeight: '700' }}>
              {selectedTarjetaInfo?.label ?? 'la tarjeta'}{' '}
              ({selectedMetodoPagoInfo?.label ?? 'Crédito'})
            </Text>
            {'. La IA extraerá todas las transacciones automáticamente.'}
          </Text>

          <TouchableOpacity
            style={[
              styles.uploadBtn,
              {
                backgroundColor: fileBase64 ? themeColors.accent + '18' : themeColors.accent,
                borderColor: themeColors.accent,
                borderWidth: fileBase64 ? 1 : 0,
              },
            ]}
            onPress={handleSelectFile}
            disabled={!canUpload}
          >
            <Ionicons
              name={fileBase64 ? 'document-text' : 'cloud-upload-outline'}
              size={22}
              color={fileBase64 ? themeColors.accent : '#fff'}
            />
            <Text
              style={[styles.uploadBtnText, { color: fileBase64 ? themeColors.accent : '#fff' }]}
              numberOfLines={1}
            >
              {fileBase64 ? (fileName || 'Archivo seleccionado') : 'Seleccionar PDF o Imagen'}
            </Text>
            {fileBase64 && (
              <Ionicons name="checkmark-circle" size={18} color={themeColors.success} />
            )}
          </TouchableOpacity>

          {fileBase64 && (
            <TouchableOpacity
              style={[
                styles.analyzeBtn,
                { backgroundColor: isAnalyzing ? themeColors.border : themeColors.success },
              ]}
              onPress={handleAnalyze}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.analyzeBtnText}>Analizando con IA...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="sparkles" size={20} color="#fff" />
                  <Text style={styles.analyzeBtnText}>Analizar con IA</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Statement metadata */}
        {statementResult && (
          <View style={[styles.metaCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="information-circle" size={18} color={themeColors.accent} />
              <Text style={[styles.sectionTitle, { color: themeColors.accent }]}>Información detectada</Text>
            </View>
            <View style={styles.metaGrid}>
              {statementResult.titular ? (
                <View style={styles.metaItem}>
                  <Ionicons name="person" size={13} color={themeColors.textSecondary} />
                  <Text style={[styles.metaLabel, { color: themeColors.textSecondary }]}>Titular:</Text>
                  <Text style={[styles.metaValue, { color: themeColors.text }]}>{statementResult.titular}</Text>
                </View>
              ) : null}
              {statementResult.numero_tarjeta_parcial ? (
                <View style={styles.metaItem}>
                  <Ionicons name="card" size={13} color={themeColors.textSecondary} />
                  <Text style={[styles.metaLabel, { color: themeColors.textSecondary }]}>Tarjeta:</Text>
                  <Text style={[styles.metaValue, { color: themeColors.text }]}>****{statementResult.numero_tarjeta_parcial}</Text>
                </View>
              ) : null}
              {statementResult.periodo_inicio ? (
                <View style={styles.metaItem}>
                  <Ionicons name="calendar" size={13} color={themeColors.textSecondary} />
                  <Text style={[styles.metaLabel, { color: themeColors.textSecondary }]}>Período:</Text>
                  <Text style={[styles.metaValue, { color: themeColors.text }]}>
                    {statementResult.periodo_inicio} → {statementResult.periodo_fin || '—'}
                  </Text>
                </View>
              ) : null}
              <View style={styles.metaItem}>
                <Ionicons name="list" size={13} color={themeColors.textSecondary} />
                <Text style={[styles.metaLabel, { color: themeColors.textSecondary }]}>Transacciones:</Text>
                <Text style={[styles.metaValue, { color: themeColors.text }]}>{statementResult.transacciones.length}</Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="card-outline" size={13} color={themeColors.textSecondary} />
                <Text style={[styles.metaLabel, { color: themeColors.textSecondary }]}>Auditando:</Text>
                <Text style={[styles.metaValue, { color: selectedTarjetaInfo?.color ?? themeColors.text, fontWeight: '800' }]}>
                  {selectedTarjetaInfo?.label} — {selectedMetodoPagoInfo?.label}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Stats */}
        {hasResults && (
          <View style={{ marginBottom: Spacing.four }}>
            <View style={[styles.statsGrid, { marginBottom: Spacing.three }]}>
              <View style={[styles.statCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                <Ionicons name="wallet" size={22} color={themeColors.accent} />
                <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>TOTAL CARGOS</Text>
                <Text style={[styles.statValue, { color: themeColors.accent }]}>{formatCurrency(stats.totalCargos)}</Text>
                <Text style={[styles.statCount, { color: themeColors.textSecondary }]}>{matchedList.length} mov.</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: themeColors.success + '12', borderColor: themeColors.success + '40' }]}>
                <Ionicons name="checkmark-circle" size={22} color={themeColors.success} />
                <Text style={[styles.statLabel, { color: themeColors.success }]}>REPORTADOS</Text>
                <Text style={[styles.statValue, { color: themeColors.success }]}>
                  {formatCurrency(stats.reportados.reduce((s, m) => s + (m.transaction.monto ?? 0), 0))}
                </Text>
                <Text style={[styles.statCount, { color: themeColors.success }]}>{stats.reportados.length} mov.</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: themeColors.danger + '12', borderColor: themeColors.danger + '40' }]}>
                <Ionicons name="warning" size={22} color={themeColors.danger} />
                <Text style={[styles.statLabel, { color: themeColors.danger }]}>SIN REPORTAR</Text>
                <Text style={[styles.statValue, { color: themeColors.danger }]}>{formatCurrency(stats.totalNoReportado)}</Text>
                <Text style={[styles.statCount, { color: themeColors.danger }]}>{stats.noReportados.length} mov.</Text>
              </View>
            </View>

            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: themeColors.accent + '18',
                borderColor: themeColors.accent,
                borderWidth: 1,
                paddingVertical: Spacing.two,
                borderRadius: BorderRadius.small,
              }}
              onPress={generatePDFReport}
              disabled={isGeneratingPDF}
            >
              {isGeneratingPDF ? (
                <ActivityIndicator size="small" color={themeColors.accent} />
              ) : (
                <Ionicons name="document-text" size={18} color={themeColors.accent} />
              )}
              <Text style={{ marginLeft: Spacing.one, color: themeColors.accent, fontWeight: 'bold' }}>
                {isGeneratingPDF ? 'Generando PDF...' : 'Exportar Reporte PDF'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Alert banner */}
        {hasResults && stats.noReportados.length > 0 && (
          <View style={[styles.alertBanner, { backgroundColor: themeColors.danger + '12', borderColor: themeColors.danger + '50' }]}>
            <Ionicons name="alert-circle" size={20} color={themeColors.danger} />
            <Text style={[styles.alertText, { color: themeColors.danger }]}>
              {'Se detectaron '}
              <Text style={{ fontWeight: '800' }}>{stats.noReportados.length} cargo(s)</Text>
              {' de '}
              <Text style={{ fontWeight: '800' }}>{selectedTarjetaInfo?.label}</Text>
              {' por '}
              <Text style={{ fontWeight: '800' }}>{formatCurrency(stats.totalNoReportado)}</Text>
              {' sin gasto registrado en la app.'}
            </Text>
          </View>
        )}

        {/* Results */}
        {hasResults && (
          <View style={{ gap: Spacing.two }}>
            {/* Tabs */}
            <View style={[styles.filterRow, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
              {(
                [
                  { key: 'todos', label: `Todos (${matchedList.length})` },
                  { key: 'reportados', label: `✓ Reportados (${stats.reportados.length})` },
                  { key: 'no_reportados', label: `⚠ Sin reportar (${stats.noReportados.length})` },
                ] as const
              ).map(tab => (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setFilterTab(tab.key)}
                  style={[styles.filterTab, filterTab === tab.key && { backgroundColor: themeColors.accent }]}
                >
                  <Text
                    style={[styles.filterTabText, { color: filterTab === tab.key ? '#fff' : themeColors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Search */}
            <View style={[styles.searchContainer, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
              <Ionicons name="search" size={16} color={themeColors.textSecondary} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.searchInput, { color: themeColors.text }]}
                placeholder="Buscar por comercio, monto, fecha, empleado..."
                placeholderTextColor={themeColors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                clearButtonMode="while-editing"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color={themeColors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {/* List */}
            {filteredList.length === 0 ? (
              <View style={[styles.emptyResults, { borderColor: themeColors.border }]}>
                <Ionicons name="search-outline" size={36} color={themeColors.textSecondary} />
                <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>Sin resultados</Text>
              </View>
            ) : (
              <FlatList
                data={filteredList}
                keyExtractor={(_, i) => String(i)}
                renderItem={renderTransactionCard}
                scrollEnabled={false}
                contentContainerStyle={{ gap: Spacing.two }}
              />
            )}
          </View>
        )}

        <View style={{ height: Spacing.six }} />
      </ScrollView>

      {/* ══════════════════════════════════════════════════
          MODAL — Detalle de transacción vs gasto
      ══════════════════════════════════════════════════ */}
      <Modal
        visible={!!selectedMatch}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setSelectedMatch(null);
          setSelectedGastosToLink(new Set());
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: themeColors.backgroundElement }]}>
            {/* Modal header */}
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                {selectedMatch?.matchedGastos && selectedMatch.matchedGastos.length > 0 ? 'Detalle de coincidencia' : 'Vincular Gastos Manualmente'}
              </Text>
              <TouchableOpacity onPress={() => {
                setSelectedMatch(null);
                setSelectedGastosToLink(new Set());
              }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.three, padding: Spacing.three }}>

              {/* ── Panel izquierdo: Transacción del estado de cuenta ── */}
              <View style={[styles.modalPanel, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                <View style={styles.modalPanelHeader}>
                  <View style={[styles.modalPanelBadge, { backgroundColor: themeColors.accent + '20' }]}>
                    <Ionicons name="card" size={14} color={themeColors.accent} />
                    <Text style={[styles.modalPanelBadgeText, { color: themeColors.accent }]}>Estado de Cuenta</Text>
                  </View>
                  <Text style={[styles.modalPanelBrand, { color: selectedTarjetaInfo?.color ?? themeColors.accent }]}>
                    {selectedTarjetaInfo?.label ?? ''} · {selectedMetodoPagoInfo?.label ?? ''}
                  </Text>
                </View>

                <View style={styles.modalFieldList}>
                  <ModalField label="Comercio / Concepto" value={selectedMatch?.transaction.descripcion ?? '—'} themeColors={themeColors} />
                  <ModalField label="Fecha" value={selectedMatch?.transaction.fecha ?? '—'} themeColors={themeColors} />
                  <ModalField
                    label="Monto"
                    value={formatCurrency(selectedMatch?.transaction.monto ?? 0)}
                    themeColors={themeColors}
                    valueColor={themeColors.danger}
                    bold
                  />
                  <ModalField
                    label="Tipo"
                    value={selectedMatch?.transaction.tipo === 'cargo' ? 'Cargo' : selectedMatch?.transaction.tipo === 'abono' ? 'Abono' : 'Desconocido'}
                    themeColors={themeColors}
                  />
                </View>
              </View>

              {/* ── Conector de coincidencia ── */}
              <View style={styles.matchConnector}>
                <View style={[styles.matchConnectorLine, { backgroundColor: themeColors.success + '50' }]} />
                <View style={[styles.matchConnectorBadge, { backgroundColor: themeColors.success + '20', borderColor: themeColors.success + '50' }]}>
                  <Ionicons name="link" size={14} color={themeColors.success} />
                  <Text style={[styles.matchConnectorText, { color: themeColors.success }]}>Coincidencia</Text>
                </View>
                <View style={[styles.matchConnectorLine, { backgroundColor: themeColors.success + '50' }]} />
              </View>

              {/* ── Panel derecho: Gasto(s) registrado(s) o Selección Manual ── */}
              {selectedMatch?.matchedGastos && selectedMatch.matchedGastos.length > 0 ? (
                // ── MODO LECTURA: Mostrar gastos vinculados ──
                <View style={[styles.modalPanel, { backgroundColor: themeColors.background, borderColor: themeColors.success + '60' }]}>
                  <View style={styles.modalPanelHeader}>
                    <View style={[styles.modalPanelBadge, { backgroundColor: themeColors.success + '20' }]}>
                      <Ionicons name="receipt" size={14} color={themeColors.success} />
                      <Text style={[styles.modalPanelBadgeText, { color: themeColors.success }]}>Gastos Vinculados ({selectedMatch.matchedGastos.length})</Text>
                    </View>
                  </View>

                  {selectedMatch.matchedGastos.map((gasto, index) => (
                    <View key={gasto.id} style={{ marginBottom: index < selectedMatch.matchedGastos.length - 1 ? Spacing.four : 0, paddingBottom: index < selectedMatch.matchedGastos.length - 1 ? Spacing.four : 0, borderBottomWidth: index < selectedMatch.matchedGastos.length - 1 ? 1 : 0, borderBottomColor: themeColors.border }}>
                      {/* Foto del comprobante */}
                      {gasto.foto_url ? (
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => setPhotoViewerUrl(gasto.foto_url!)}
                        >
                          <Image
                            source={{ uri: gasto.foto_url }}
                            style={styles.modalPhoto}
                            resizeMode="cover"
                          />
                          <View style={[styles.photoTapHint, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
                            <Ionicons name="expand-outline" size={16} color="#fff" />
                            <Text style={styles.photoTapHintText}>Toca para ampliar</Text>
                          </View>
                        </TouchableOpacity>
                      ) : (
                        <View style={[styles.modalPhotoPlaceholder, { backgroundColor: themeColors.border + '40' }]}>
                          <Ionicons name="image-outline" size={28} color={themeColors.textSecondary} />
                          <Text style={[styles.modalPhotoPlaceholderText, { color: themeColors.textSecondary }]}>Sin foto de comprobante</Text>
                        </View>
                      )}

                      <View style={styles.modalFieldList}>
                        <ModalField label="Empleado" value={gasto.empleado_nombre ?? '—'} themeColors={themeColors} />
                        <ModalField label="Proveedor" value={gasto.proveedor ?? '—'} themeColors={themeColors} />
                        <ModalField label="Justificación" value={gasto.justificacion ?? '—'} themeColors={themeColors} />
                        <ModalField label="Fecha comprobante" value={gasto.fecha_comprobante ?? '—'} themeColors={themeColors} />
                        <ModalField
                          label="Monto registrado"
                          value={formatCurrency(Number(gasto.monto) || 0)}
                          themeColors={themeColors}
                          valueColor={themeColors.success}
                          bold
                        />
                        <ModalField label="Método de pago" value={`${gasto.metodo_pago}${gasto.tipo_tarjeta ? ` (${gasto.tipo_tarjeta})` : ''}`} themeColors={themeColors} />
                        {gasto.categoria ? (
                          <ModalField label="Categoría" value={`${gasto.categoria}${gasto.subcategoria ? ` / ${gasto.subcategoria}` : ''}`} themeColors={themeColors} />
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                // ── MODO VINCULACIÓN MANUAL ──
                <View style={[styles.modalPanel, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                  <View style={styles.modalPanelHeader}>
                    <View style={[styles.modalPanelBadge, { backgroundColor: themeColors.border }]}>
                      <Ionicons name="search" size={14} color={themeColors.text} />
                      <Text style={[styles.modalPanelBadgeText, { color: themeColors.text }]}>Gastos Disponibles</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>Selecciona uno o más</Text>
                  </View>

                  {availableGastos.length === 0 ? (
                    <Text style={{ color: themeColors.textSecondary, fontStyle: 'italic', paddingVertical: Spacing.two, textAlign: 'center' }}>
                      No hay gastos sin vincular para esta tarjeta.
                    </Text>
                  ) : (
                    <View style={{ gap: Spacing.two }}>
                      {availableGastos.map(gasto => {
                        const isSelected = selectedGastosToLink.has(gasto.id);
                        return (
                          <TouchableOpacity
                            key={gasto.id}
                            activeOpacity={0.7}
                            onPress={() => {
                              const next = new Set(selectedGastosToLink);
                              if (isSelected) next.delete(gasto.id);
                              else next.add(gasto.id);
                              setSelectedGastosToLink(next);
                            }}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              padding: Spacing.two,
                              borderRadius: BorderRadius.small,
                              borderWidth: 1,
                              borderColor: isSelected ? themeColors.accent : themeColors.border,
                              backgroundColor: isSelected ? themeColors.accent + '15' : themeColors.backgroundElement,
                            }}
                          >
                            <Ionicons
                              name={isSelected ? "checkbox" : "square-outline"}
                              size={20}
                              color={isSelected ? themeColors.accent : themeColors.textSecondary}
                              style={{ marginRight: Spacing.two }}
                            />
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: themeColors.text, fontWeight: 'bold' }}>{formatCurrency(Number(gasto.monto) || 0)}</Text>
                              <Text style={{ color: themeColors.textSecondary, fontSize: 12 }} numberOfLines={1}>
                                {gasto.fecha_comprobante} · {gasto.justificacion || gasto.proveedor || 'Sin descripción'}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                  
                  {selectedGastosToLink.size > 0 && (
                    <View style={{ marginTop: Spacing.four, padding: Spacing.two, backgroundColor: themeColors.accent + '10', borderRadius: BorderRadius.small }}>
                      <Text style={{ color: themeColors.text, fontSize: 12, marginBottom: 4 }}>
                        Total seleccionado: 
                        <Text style={{ fontWeight: 'bold', color: themeColors.accent }}>
                          {' '}{formatCurrency(Array.from(selectedGastosToLink).reduce((acc, id) => {
                            const g = availableGastos.find(g => g.id === id);
                            return acc + (Number(g?.monto) || 0);
                          }, 0))}
                        </Text>
                      </Text>
                      <TouchableOpacity
                        style={{ backgroundColor: themeColors.accent, padding: Spacing.two, borderRadius: BorderRadius.small, alignItems: 'center', marginTop: Spacing.one }}
                        onPress={handleLinkSelectedGastos}
                      >
                        <Text style={{ color: '#fff', fontWeight: 'bold' }}>Vincular Selección</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              <TouchableOpacity
                style={[styles.modalCloseBtn, { backgroundColor: themeColors.accent }]}
                onPress={() => {
                  setSelectedMatch(null);
                  setSelectedGastosToLink(new Set());
                }}
              >
                <Text style={styles.modalCloseBtnText}>Cerrar</Text>
              </TouchableOpacity>

            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Fullscreen photo viewer */}
      <ImageViewerModal
        visible={!!photoViewerUrl}
        imageUrl={photoViewerUrl}
        onClose={() => setPhotoViewerUrl(null)}
      />

    </SafeAreaView>
  );
}

// ─── ModalField helper ────────────────────────────────────────────────────────

interface ModalFieldProps {
  label: string;
  value: string;
  themeColors: any;
  valueColor?: string;
  bold?: boolean;
}

function ModalField({ label, value, themeColors, valueColor, bold }: ModalFieldProps) {
  return (
    <View style={[mfStyles.row, { borderBottomColor: themeColors.border + '50' }]}>
      <Text style={[mfStyles.label, { color: themeColors.textSecondary }]}>{label}</Text>
      <Text
        style={[mfStyles.value, { color: valueColor ?? themeColors.text, fontWeight: bold ? '800' : '600' }]}
        selectable
      >
        {value || '—'}
      </Text>
    </View>
  );
}

const mfStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 7,
    borderBottomWidth: 1,
    gap: Spacing.two,
  },
  label: { fontSize: 12, fontWeight: '600', flex: 1 },
  value: { fontSize: 12, flex: 1.5, textAlign: 'right' },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({

  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.four, paddingVertical: Spacing.two, borderBottomWidth: 1,
  },
  backBtn: { padding: 4, width: 40 },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  headerSub: { fontSize: 11, fontWeight: '500', marginTop: 1 },
  scrollContent: { padding: Spacing.three, gap: Spacing.three },

  // Section cards (step containers)
  sectionCard: { borderRadius: BorderRadius.large, borderWidth: 1, padding: Spacing.four, gap: Spacing.two },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stepCircle: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepCircleText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  sectionTitle: { fontSize: 15, fontWeight: '800', flex: 1 },
  hint: { fontSize: 13, lineHeight: 18 },
  subLabel: { fontSize: 12, fontWeight: '700' },

  // Card selector
  cardGrid: { gap: Spacing.two, flexWrap: 'wrap' },
  cardOption: { flex: 1, minWidth: 120, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three, borderRadius: BorderRadius.medium, borderWidth: 2 },
  cardDot: { width: 12, height: 12, borderRadius: 6 },
  cardOptionLabel: { fontSize: 13 },

  // Método de pago selector
  metodoPagoRow: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  metodoPagoBtn: { flex: 1, minWidth: 90, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.two, paddingHorizontal: Spacing.two, borderRadius: BorderRadius.medium, borderWidth: 1 },
  metodoPagoBtnText: { fontSize: 12, fontWeight: '700' },

  // Upload
  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, paddingVertical: Spacing.three, paddingHorizontal: Spacing.four, borderRadius: BorderRadius.medium },
  uploadBtnText: { fontSize: 14, fontWeight: '700', flex: 1 },
  analyzeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, paddingVertical: Spacing.three, borderRadius: BorderRadius.medium, marginTop: Spacing.one },
  analyzeBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  // Metadata card
  metaCard: { borderRadius: BorderRadius.large, borderWidth: 1, padding: Spacing.three, gap: Spacing.two },
  metaGrid: { gap: Spacing.one },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  metaLabel: { fontSize: 12, fontWeight: '600' },
  metaValue: { fontSize: 12, fontWeight: '700' },

  // Stats
  statsGrid: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  statCard: { flex: 1, minWidth: 100, borderRadius: BorderRadius.large, borderWidth: 1, padding: Spacing.three, alignItems: 'center', gap: 4 },
  statLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5, textAlign: 'center' },
  statValue: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
  statCount: { fontSize: 10, fontWeight: '600', textAlign: 'center' },

  // Alert
  alertBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, padding: Spacing.three, borderRadius: BorderRadius.medium, borderWidth: 1 },
  alertText: { flex: 1, fontSize: 13, lineHeight: 19 },

  // Filter / search
  filterRow: { flexDirection: 'row', borderRadius: BorderRadius.medium, borderWidth: 1, overflow: 'hidden', padding: 3, gap: 3 },
  filterTab: { flex: 1, paddingVertical: 8, paddingHorizontal: 6, borderRadius: BorderRadius.small, alignItems: 'center' },
  filterTabText: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', borderRadius: BorderRadius.medium, borderWidth: 1, paddingHorizontal: Spacing.two, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500' },

  // Transaction card
  txCard: { borderRadius: BorderRadius.medium, padding: Spacing.three, gap: Spacing.one },
  txCardHeader: { flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between' },
  txDesc: { fontSize: 14, fontWeight: '700' },
  txFecha: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  txMonto: { fontSize: 15, fontWeight: '800' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, marginTop: 4 },
  statusText: { fontSize: 10, fontWeight: '800' },
  matchedDetail: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, padding: Spacing.two, borderRadius: BorderRadius.small, borderWidth: 1, marginTop: 4 },
  matchedText: { fontSize: 12, flex: 1, lineHeight: 16 },

  // Empty
  emptyResults: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.six, gap: Spacing.two, borderRadius: BorderRadius.medium, borderWidth: 1, borderStyle: 'dashed' },
  emptyText: { fontSize: 14, fontWeight: '600' },

  // ── Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  modalPanel: {
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  modalPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  modalPanelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  modalPanelBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  modalPanelBrand: {
    fontSize: 11,
    fontWeight: '700',
  },
  modalFieldList: {
    gap: 0,
  },
  modalPhoto: {
    width: '100%',
    height: 180,
    borderRadius: BorderRadius.medium,
    marginBottom: Spacing.one,
  },
  photoTapHint: {
    position: 'absolute',
    bottom: Spacing.one,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    borderBottomLeftRadius: BorderRadius.medium,
    borderBottomRightRadius: BorderRadius.medium,
  },
  photoTapHintText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  modalPhotoPlaceholder: {
    width: '100%',
    height: 80,
    borderRadius: BorderRadius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: Spacing.one,
  },
  modalPhotoPlaceholderText: {
    fontSize: 11,
    fontWeight: '600',
  },
  matchConnector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  matchConnectorLine: {
    flex: 1,
    height: 1,
  },
  matchConnectorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  matchConnectorText: {
    fontSize: 12,
    fontWeight: '800',
  },
  modalCloseBtn: {
    paddingVertical: Spacing.three,
    borderRadius: BorderRadius.medium,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  modalCloseBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});

