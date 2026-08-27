import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Platform,
  useWindowDimensions,
  Linking,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { DocumentoService, Documento, DocumentoFirmado } from '@/services/supabase';
import { PdfDocumentoService } from '@/services/pdfDocumentoService';
import SignatureCanvasModal from '@/components/SignatureCanvasModal';
import CustomButton from '@/components/CustomButton';
import CustomInput from '@/components/CustomInput';
import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

export default function AdminDocumentosScreen() {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ tab?: string }>();
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && windowWidth >= 1024;
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { user: authUser } = useAuth();

  // Pestaña principal: 'gestion' (emitidos) | 'mis_documentos' (por firmar)
  const [activeMainTab, setActiveMainTab] = useState<'gestion' | 'mis_documentos'>(
    searchParams.tab === 'mis_documentos' ? 'mis_documentos' : 'gestion'
  );

  useEffect(() => {
    if (searchParams.tab === 'mis_documentos') {
      setActiveMainTab('mis_documentos');
    }
  }, [searchParams.tab]);

  // Documentos de Gestión (Emitidos)
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Mis Documentos (Asignados para que el Admin firme)
  const [misDocumentos, setMisDocumentos] = useState<DocumentoFirmado[]>([]);
  const [misDocSubTab, setMisDocSubTab] = useState<'pendientes' | 'firmados'>('pendientes');

  // Modal de Detalle de Firmas por Empleado (Gestión)
  const [selectedDoc, setSelectedDoc] = useState<Documento | null>(null);
  const [firmasDetalle, setFirmasDetalle] = useState<DocumentoFirmado[]>([]);
  const [isLoadingFirmas, setIsLoadingFirmas] = useState(false);
  const [modalFirmasVisible, setModalFirmasVisible] = useState(false);

  // Modal de Lectura y Firma para el Admin
  const [selectedMisDoc, setSelectedMisDoc] = useState<DocumentoFirmado | null>(null);
  const [modalLecturaVisible, setModalLecturaVisible] = useState(false);
  const [modalFirmaVisible, setModalFirmaVisible] = useState(false);
  const [isSigning, setIsSigning] = useState(false);

  const showAlert = (title: string, message: string, onOk?: () => void) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
      if (onOk) onOk();
    } else {
      Alert.alert(title, message, onOk ? [{ text: 'Ok', onPress: onOk }] : undefined);
    }
  };

  useEffect(() => {
    cargarTodosLosDatos();
  }, [authUser?.id]);

  const cargarTodosLosDatos = async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      // 1. Cargar documentos emitidos
      const dataAdmin = await DocumentoService.obtenerDocumentosAdmin();
      setDocumentos(dataAdmin);

      // 2. Cargar mis documentos por firmar si hay usuario autenticado
      if (authUser?.id) {
        const misDocsData = await DocumentoService.obtenerMisDocumentosEmpleado(authUser.id);
        setMisDocumentos(misDocsData);
      }
    } catch (error) {
      console.error('Error al cargar documentos:', error);
      Alert.alert('Error', 'No se pudieron cargar los documentos.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleOpenDetalleFirmas = async (doc: Documento) => {
    setSelectedDoc(doc);
    setModalFirmasVisible(true);
    setIsLoadingFirmas(true);

    try {
      const detalle = await DocumentoService.obtenerFirmasDeDocumento(doc.id);
      setFirmasDetalle(detalle);
    } catch (error) {
      console.error('Error al cargar detalle de firmas:', error);
      Alert.alert('Error', 'No se pudo obtener el desglose de firmas.');
    } finally {
      setIsLoadingFirmas(false);
    }
  };

  const handleEliminarDocumento = (doc: Documento) => {
    const ejecutarEliminacion = async () => {
      try {
        await DocumentoService.eliminarDocumento(doc.id);
        await cargarTodosLosDatos();
        if (selectedDoc?.id === doc.id) setModalFirmasVisible(false);
      } catch (err: any) {
        console.error('Error al eliminar documento:', err);
        const msg = err?.message || String(err);
        if (Platform.OS === 'web') {
          window.alert(`Error: No se pudo eliminar el documento. (${msg})`);
        } else {
          Alert.alert('Error', `No se pudo eliminar el documento: ${msg}`);
        }
      }
    };

    const mensaje = `¿Estás seguro de eliminar "${doc.titulo}" y todo su historial de firmas? Esta acción no se puede deshacer.`;

    if (Platform.OS === 'web') {
      const confirmado = window.confirm(mensaje);
      if (confirmado) {
        ejecutarEliminacion();
      }
    } else {
      Alert.alert('Eliminar Documento', mensaje, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: ejecutarEliminacion },
      ]);
    }
  };

  // ── Flujo de Firma para el Admin ──
  const handleAbrirLecturaMisDoc = (docFirmado: DocumentoFirmado) => {
    setSelectedMisDoc(docFirmado);
    setModalLecturaVisible(true);
  };

  const handleConfirmarFirmaAdmin = async (signatureBase64: string) => {
    if (!selectedMisDoc || !selectedMisDoc.documentos) return;
    setIsSigning(true);

    try {
      // 1. Obtener ubicación GPS
      let gpsString = 'No proporcionada';
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          gpsString = `${loc.coords.latitude.toFixed(6)}, ${loc.coords.longitude.toFixed(6)}`;
        }
      } catch (e) {
        console.warn('GPS no disponible:', e);
      }

      const infoDispositivo = `${Platform.OS.toUpperCase()} (${Platform.Version || 'Mobile/Web'})`;

      // 2. Generar PDF compilado y firmado localmente con Hash SHA-256
      const pdfResult = await PdfDocumentoService.generarYCompartirPdf({
        documento: selectedMisDoc.documentos,
        firmado: { ...selectedMisDoc, firmado_at: new Date().toISOString() },
        firmaBase64: signatureBase64,
        ipRegistro: 'App Inttec (Admin Autenticado)',
        ubicacionGps: gpsString,
        dispositivoInfo: infoDispositivo,
      });

      let pdfFirmadoUrl: string | undefined = undefined;

      if (pdfResult?.uri) {
        try {
          pdfFirmadoUrl = await DocumentoService.subirPdfFirmado(
            pdfResult.uri,
            `Firmado_${selectedMisDoc.empleado_nombre || 'Admin'}_${selectedMisDoc.documentos.titulo}.pdf`
          );
        } catch (uploadErr) {
          console.warn('No se pudo subir PDF firmado a almacenamiento remoto:', uploadErr);
        }
      }

      // 3. Registrar firma completa en Supabase
      await DocumentoService.registrarFirma(selectedMisDoc.id, {
        firmaBase64: signatureBase64,
        pdfUrl: pdfFirmadoUrl,
        ipRegistro: 'App Inttec (Admin Autenticado)',
        ubicacionGps: gpsString,
        dispositivoInfo: infoDispositivo,
        hashSha256: pdfResult.hashSha256,
      });

      showAlert('¡Documento Firmado!', 'Has firmado el documento exitosamente con plena validez legal.', () => {
        setModalLecturaVisible(false);
        cargarTodosLosDatos();
      });
    } catch (error: any) {
      console.error('Error al procesar la firma del admin:', error);
      const msg = error?.message || String(error);
      showAlert('Error', `Ocurrió un fallo al registrar la firma del documento: ${msg}`);
    } finally {
      setIsSigning(false);
    }
  };

  // Filtrado de documentos de gestión
  const documentosFiltrados = useMemo(() => {
    if (!searchQuery.trim()) return documentos;
    const query = searchQuery.toLowerCase();
    return documentos.filter(
      (d) =>
        d.titulo.toLowerCase().includes(query) ||
        (d.descripcion && d.descripcion.toLowerCase().includes(query)) ||
        d.creador_nombre.toLowerCase().includes(query)
    );
  }, [documentos, searchQuery]);

  // Filtrado de mis documentos
  const misDocumentosPendientes = useMemo(
    () => misDocumentos.filter((d) => d.estado === 'PENDIENTE'),
    [misDocumentos]
  );
  const misDocumentosFirmados = useMemo(
    () => misDocumentos.filter((d) => d.estado === 'FIRMADO'),
    [misDocumentos]
  );
  const misDocumentosListaActual = misDocSubTab === 'pendientes' ? misDocumentosPendientes : misDocumentosFirmados;

  // Render Card de Gestión
  const renderDocumentoCard = ({ item }: { item: Documento }) => {
    const total = item.total_asignados || 0;
    const firmados = item.total_firmados || 0;
    const porcentaje = total > 0 ? Math.round((firmados / total) * 100) : 0;

    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: themeColors.backgroundElement,
            borderColor: themeColors.border,
          },
        ]}
      >
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <View style={[styles.badgeState, { backgroundColor: '#e0f2fe' }]}>
                <Text style={[styles.badgeText, { color: '#0369a1' }]}>{item.estado}</Text>
              </View>
              {item.requiere_todos && (
                <View style={[styles.badgeState, { backgroundColor: '#fef3c7' }]}>
                  <Text style={[styles.badgeText, { color: '#b45309' }]}>Todos los Empleados</Text>
                </View>
              )}
            </View>
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>{item.titulo}</Text>
          </View>

          <TouchableOpacity onPress={() => handleEliminarDocumento(item)} style={styles.deleteBtn}>
            <Ionicons name="trash-outline" size={20} color="#ef4444" />
          </TouchableOpacity>
        </View>

        {item.descripcion ? (
          <Text numberOfLines={2} style={[styles.cardDesc, { color: themeColors.textSecondary }]}>
            {item.descripcion}
          </Text>
        ) : null}

        {/* Barra de Progreso de Firmas */}
        <View style={styles.progressContainer}>
          <View style={styles.progressTextRow}>
            <Text style={[styles.progressLabel, { color: themeColors.text }]}>
              Estatus de Firmas: <Text style={{ fontWeight: 'bold' }}>{firmados} de {total}</Text>
            </Text>
            <Text style={[styles.progressPercent, { color: themeColors.accent }]}>{porcentaje}%</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${porcentaje}%`, backgroundColor: porcentaje === 100 ? '#10b981' : '#0284c7' },
              ]}
            />
          </View>
        </View>

        <View style={styles.cardFooter}>
          <Text style={[styles.cardMeta, { color: themeColors.textSecondary }]}>
            Emitido por: {item.creador_nombre} • {new Date(item.created_at || '').toLocaleDateString('es-MX')}
          </Text>
          <TouchableOpacity style={styles.detailBtn} onPress={() => handleOpenDetalleFirmas(item)}>
            <Ionicons name="people-outline" size={16} color="#ffffff" />
            <Text style={styles.detailBtnText}>Ver Firmantes</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Render Card de Mis Documentos por Firmar
  const renderMisDocumentoCard = ({ item }: { item: DocumentoFirmado }) => {
    const docInfo = item.documentos;
    const esPendiente = item.estado === 'PENDIENTE';

    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: themeColors.backgroundElement,
            borderColor: esPendiente ? '#f59e0b40' : themeColors.border,
          },
        ]}
      >
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <View
                style={[
                  styles.badgeState,
                  {
                    backgroundColor: esPendiente ? '#fef3c7' : '#d1fae5',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    { color: esPendiente ? '#b45309' : '#047857' },
                  ]}
                >
                  {esPendiente ? 'Pendiente de tu Firma' : 'Firmado por Ti'}
                </Text>
              </View>
            </View>
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>
              {docInfo?.titulo || 'Documento Corporativo'}
            </Text>
          </View>
        </View>

        {docInfo?.descripcion ? (
          <Text numberOfLines={2} style={[styles.cardDesc, { color: themeColors.textSecondary }]}>
            {docInfo.descripcion}
          </Text>
        ) : null}

        {item.firmado_at && (
          <View style={[styles.firmanteAuditBox, { backgroundColor: scheme === 'dark' ? '#0f291e' : '#f0fdf4', borderColor: scheme === 'dark' ? '#14532d' : '#bbf7d0', marginBottom: 8 }]}>
            <Ionicons name="checkmark-circle" size={14} color="#10b981" />
            <Text style={{ color: scheme === 'dark' ? '#86efac' : '#15803d', fontSize: 11, fontWeight: '500', flex: 1 }}>
              Firmaste el {new Date(item.firmado_at).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })} a las {new Date(item.firmado_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        )}

        <View style={styles.cardFooter}>
          <Text style={[styles.cardMeta, { color: themeColors.textSecondary }]}>
            Emitido por: {docInfo?.creador_nombre || 'Administración'} •{' '}
            {new Date(item.created_at || '').toLocaleDateString('es-MX')}
          </Text>

          <TouchableOpacity
            style={[
              styles.actionBtn,
              { backgroundColor: esPendiente ? '#0284c7' : '#334155' },
            ]}
            onPress={() => handleAbrirLecturaMisDoc(item)}
          >
            <Ionicons
              name={esPendiente ? 'create-outline' : 'document-text-outline'}
              size={16}
              color="#ffffff"
            />
            <Text style={styles.actionBtnText}>
              {esPendiente ? 'Leer y Firmar' : 'Ver Documento'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Header Superior */}
      <View style={styles.topHeader}>
        <View style={{ flex: 1, minWidth: 260 }}>
          <Text style={[styles.title, { color: themeColors.text }]}>Módulo de Documentos y Firmas</Text>
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
            Gestión corporativa, cartas responsivas y firma digital de acuerdos legales.
          </Text>
        </View>

        {activeMainTab === 'gestion' && (
          <TouchableOpacity
            style={styles.newDocBtn}
            onPress={() => router.push('/(admin)/nuevo-documento' as any)}
          >
            <Ionicons name="add-circle-outline" size={20} color="#ffffff" />
            <Text style={styles.newDocBtnText}>Emitir Documento</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Pestañas Principales (Gestión vs Mis Documentos) */}
      <View style={[styles.mainTabsContainer, { backgroundColor: scheme === 'dark' ? '#1e293b' : '#f1f5f9' }]}>
        <TouchableOpacity
          style={[
            styles.mainTabBtn,
            activeMainTab === 'gestion' && [styles.mainTabBtnActive, { backgroundColor: themeColors.backgroundElement }],
          ]}
          onPress={() => setActiveMainTab('gestion')}
        >
          <Ionicons
            name="folder-outline"
            size={18}
            color={activeMainTab === 'gestion' ? '#0284c7' : themeColors.textSecondary}
          />
          <Text
            style={[
              styles.mainTabBtnText,
              { color: activeMainTab === 'gestion' ? '#0284c7' : themeColors.textSecondary },
            ]}
          >
            Gestión y Emisión ({documentos.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.mainTabBtn,
            activeMainTab === 'mis_documentos' && [styles.mainTabBtnActive, { backgroundColor: themeColors.backgroundElement }],
          ]}
          onPress={() => setActiveMainTab('mis_documentos')}
        >
          <Ionicons
            name="pencil-outline"
            size={18}
            color={activeMainTab === 'mis_documentos' ? '#0284c7' : themeColors.textSecondary}
          />
          <Text
            style={[
              styles.mainTabBtnText,
              { color: activeMainTab === 'mis_documentos' ? '#0284c7' : themeColors.textSecondary },
            ]}
          >
            Mis Documentos por Firmar
          </Text>
          {misDocumentosPendientes.length > 0 && (
            <View style={styles.redBadge}>
              <Text style={styles.redBadgeText}>{misDocumentosPendientes.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ────────────────── CONTENIDO PESTAÑA: GESTIÓN ────────────────── */}
      {activeMainTab === 'gestion' && (
        <>
          {/* Buscador */}
          <View style={{ marginBottom: 16 }}>
            <CustomInput
              placeholder="Buscar por título, descripción o emisor..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              iconName="search-outline"
            />
          </View>

          {/* Lista de Gestión */}
          {isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={themeColors.accent} />
              <Text style={{ marginTop: 12, color: themeColors.textSecondary }}>Cargando documentos...</Text>
            </View>
          ) : (
            <FlatList
              data={documentosFiltrados}
              keyExtractor={(item) => item.id}
              renderItem={renderDocumentoCard}
              contentContainerStyle={{ paddingBottom: 40 }}
              onRefresh={() => cargarTodosLosDatos(true)}
              refreshing={isRefreshing}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="document-text-outline" size={64} color={themeColors.textSecondary} />
                  <Text style={[styles.emptyText, { color: themeColors.text }]}>
                    No hay documentos emitidos aún.
                  </Text>
                  <Text style={{ color: themeColors.textSecondary, fontSize: 13, marginTop: 4 }}>
                    Presiona "Emitir Documento" para crear el primero.
                  </Text>
                </View>
              }
            />
          )}
        </>
      )}

      {/* ────────────────── CONTENIDO PESTAÑA: MIS DOCUMENTOS ────────────────── */}
      {activeMainTab === 'mis_documentos' && (
        <>
          {/* Sub-tabs Pendientes vs Firmados */}
          <View style={styles.subTabsRow}>
            <TouchableOpacity
              style={[
                styles.subTab,
                misDocSubTab === 'pendientes' && { borderBottomColor: '#0284c7', borderBottomWidth: 3 },
              ]}
              onPress={() => setMisDocSubTab('pendientes')}
            >
              <Text
                style={[
                  styles.subTabText,
                  { color: misDocSubTab === 'pendientes' ? '#0284c7' : themeColors.textSecondary },
                ]}
              >
                Pendientes de Firma ({misDocumentosPendientes.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.subTab,
                misDocSubTab === 'firmados' && { borderBottomColor: '#0284c7', borderBottomWidth: 3 },
              ]}
              onPress={() => setMisDocSubTab('firmados')}
            >
              <Text
                style={[
                  styles.subTabText,
                  { color: misDocSubTab === 'firmados' ? '#0284c7' : themeColors.textSecondary },
                ]}
              >
                Firmados ({misDocumentosFirmados.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Lista de Mis Documentos */}
          {isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={themeColors.accent} />
              <Text style={{ marginTop: 12, color: themeColors.textSecondary }}>Cargando tus documentos...</Text>
            </View>
          ) : (
            <FlatList
              data={misDocumentosListaActual}
              keyExtractor={(item) => item.id}
              renderItem={renderMisDocumentoCard}
              contentContainerStyle={{ paddingBottom: 40 }}
              onRefresh={() => cargarTodosLosDatos(true)}
              refreshing={isRefreshing}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons
                    name={misDocSubTab === 'pendientes' ? 'checkmark-done-circle-outline' : 'document-outline'}
                    size={64}
                    color={themeColors.textSecondary}
                  />
                  <Text style={[styles.emptyText, { color: themeColors.text }]}>
                    {misDocSubTab === 'pendientes'
                      ? '¡Todo al día! No tienes documentos pendientes de firmar.'
                      : 'Aún no has firmado ningún documento.'}
                  </Text>
                </View>
              }
            />
          )}
        </>
      )}

      {/* ────────────────── MODAL DETALLE DE FIRMAS (GESTIÓN) ────────────────── */}
      <Modal
        visible={modalFirmasVisible}
        animationType="fade"
        transparent
        statusBarTranslucent={true}
        onRequestClose={() => setModalFirmasVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            {/* Header del Modal */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                <View style={[styles.modalHeaderIconBg, { backgroundColor: scheme === 'dark' ? '#0f2b48' : '#e0f2fe' }]}>
                  <Ionicons name="document-text" size={22} color="#0284c7" />
                </View>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={[styles.modalTitle, { color: themeColors.text }]} numberOfLines={1}>
                    {selectedDoc?.titulo}
                  </Text>
                  <Text style={{ color: themeColors.textSecondary, fontSize: 13, marginTop: 2 }}>
                    Desglose de Firmas por Empleado
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.modalCloseBtn, { backgroundColor: scheme === 'dark' ? '#334155' : '#f1f5f9' }]}
                onPress={() => setModalFirmasVisible(false)}
              >
                <Ionicons name="close" size={20} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            {/* Contador Resumen Simétrico */}
            {firmasDetalle.length > 0 && (
              <View style={[styles.modalStatsRow, { backgroundColor: scheme === 'dark' ? '#0f172a' : '#f8fafc', borderColor: themeColors.border }]}>
                <View style={styles.modalStatItem}>
                  <Text style={{ fontSize: 10, color: themeColors.textSecondary, fontWeight: '700', letterSpacing: 0.5 }}>TOTAL</Text>
                  <Text style={{ fontSize: 15, fontWeight: 'bold', color: themeColors.text, marginTop: 2 }}>{firmasDetalle.length}</Text>
                </View>
                <View style={[styles.modalStatDivider, { backgroundColor: themeColors.border }]} />
                <View style={styles.modalStatItem}>
                  <Text style={{ fontSize: 10, color: '#059669', fontWeight: '700', letterSpacing: 0.5 }}>FIRMADOS</Text>
                  <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#059669', marginTop: 2 }}>
                    {firmasDetalle.filter((f) => f.estado === 'FIRMADO').length}
                  </Text>
                </View>
                <View style={[styles.modalStatDivider, { backgroundColor: themeColors.border }]} />
                <View style={styles.modalStatItem}>
                  <Text style={{ fontSize: 10, color: '#d97706', fontWeight: '700', letterSpacing: 0.5 }}>PENDIENTES</Text>
                  <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#d97706', marginTop: 2 }}>
                    {firmasDetalle.filter((f) => f.estado !== 'FIRMADO' && f.estado !== 'RECHAZADO').length}
                  </Text>
                </View>
              </View>
            )}

            {isLoadingFirmas ? (
              <ActivityIndicator size="large" color={themeColors.accent} style={{ marginVertical: 40 }} />
            ) : (
              <ScrollView
                style={{ maxHeight: 480 }}
                contentContainerStyle={{ paddingVertical: 4, gap: 10 }}
                showsVerticalScrollIndicator={true}
              >
                {firmasDetalle.map((firmante) => {
                  const isFirmado = firmante.estado === 'FIRMADO';
                  const isRechazado = firmante.estado === 'RECHAZADO';
                  const initials = (firmante.empleado_nombre || 'E')
                    .split(' ')
                    .filter(Boolean)
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();

                  return (
                    <View
                      key={firmante.id}
                      style={[
                        styles.firmanteCard,
                        {
                          backgroundColor: scheme === 'dark' ? '#1e293b' : '#ffffff',
                          borderColor: themeColors.border,
                        },
                      ]}
                    >
                      {/* Fila Superior: Avatar + Info + Badge de Estado */}
                      <View style={styles.firmanteTopRow}>
                        <View
                          style={[
                            styles.firmanteAvatar,
                            {
                              backgroundColor: isFirmado
                                ? (scheme === 'dark' ? '#064e3b' : '#d1fae5')
                                : isRechazado
                                ? (scheme === 'dark' ? '#450a0a' : '#fee2e2')
                                : (scheme === 'dark' ? '#334155' : '#e2e8f0'),
                            },
                          ]}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: 'bold',
                              color: isFirmado ? '#059669' : isRechazado ? '#dc2626' : themeColors.text,
                            }}
                          >
                            {initials}
                          </Text>
                        </View>

                        <View style={{ flex: 1, paddingRight: 6 }}>
                          <Text style={[styles.firmanteName, { color: themeColors.text }]} numberOfLines={1}>
                            {firmante.empleado_nombre}
                          </Text>
                          <Text style={{ color: themeColors.textSecondary, fontSize: 11, marginTop: 1 }} numberOfLines={1}>
                            {firmante.empleado_email || 'Sin correo registrado'}
                          </Text>
                        </View>

                        {/* Badge Estado */}
                        <View
                          style={[
                            styles.modalBadge,
                            {
                              backgroundColor: isFirmado
                                ? (scheme === 'dark' ? 'rgba(5, 150, 105, 0.25)' : '#d1fae5')
                                : isRechazado
                                ? (scheme === 'dark' ? 'rgba(220, 38, 38, 0.25)' : '#fee2e2')
                                : (scheme === 'dark' ? 'rgba(217, 119, 6, 0.25)' : '#fef3c7'),
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.modalBadgeText,
                              {
                                color: isFirmado
                                  ? (scheme === 'dark' ? '#34d399' : '#047857')
                                  : isRechazado
                                  ? (scheme === 'dark' ? '#f87171' : '#b91c1c')
                                  : (scheme === 'dark' ? '#fbbf24' : '#b45309'),
                              },
                            ]}
                          >
                            {firmante.estado}
                          </Text>
                        </View>
                      </View>

                      {/* Info de firma */}
                      {firmante.firmado_at && (
                        <View style={[styles.firmanteAuditBox, { backgroundColor: scheme === 'dark' ? '#0f291e' : '#f0fdf4', borderColor: scheme === 'dark' ? '#14532d' : '#bbf7d0' }]}>
                          <Ionicons name="checkmark-circle" size={14} color="#10b981" />
                          <Text style={{ color: scheme === 'dark' ? '#86efac' : '#15803d', fontSize: 11, fontWeight: '500', flex: 1 }}>
                            Firmado el {new Date(firmante.firmado_at).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })} a las {new Date(firmante.firmado_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                      )}

                      {/* Info de rechazo */}
                      {isRechazado && firmante.motivo_rechazo && (
                        <View style={[styles.firmanteAuditBox, { backgroundColor: scheme === 'dark' ? '#2c1517' : '#fef2f2', borderColor: scheme === 'dark' ? '#7f1d1d' : '#fecaca' }]}>
                          <Ionicons name="alert-circle" size={14} color="#ef4444" />
                          <Text style={{ color: scheme === 'dark' ? '#fca5a5' : '#b91c1c', fontSize: 11, fontWeight: '500', flex: 1 }}>
                            Motivo: {firmante.motivo_rechazo}
                          </Text>
                        </View>
                      )}

                      {/* Botones de Acción */}
                      {isFirmado && (
                        <View style={styles.firmanteActionsRow}>
                          <TouchableOpacity
                            style={[styles.pdfButtonFilled, { backgroundColor: scheme === 'dark' ? '#0f2b48' : '#e0f2fe' }]}
                            onPress={async () => {
                              if (firmante.pdf_firmado_url) {
                                Linking.openURL(firmante.pdf_firmado_url);
                              } else if (selectedDoc && firmante.firma_base64) {
                                try {
                                  await PdfDocumentoService.generarYCompartirPdf({
                                    documento: selectedDoc,
                                    firmado: firmante,
                                    firmaBase64: firmante.firma_base64 || '',
                                    ipRegistro: firmante.ip_registro || '',
                                    ubicacionGps: firmante.ubicacion_gps || '',
                                    dispositivoInfo: firmante.dispositivo_info || '',
                                    incluirConstancia: false,
                                  });
                                } catch (e: any) {
                                  Alert.alert('Error', 'No se pudo abrir el PDF firmado.');
                                }
                              }
                            }}
                          >
                            <Ionicons name="document-text-outline" size={15} color="#0284c7" />
                            <Text style={{ color: '#0284c7', fontSize: 12, fontWeight: 'bold' }}>Ver PDF</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.constanciaButton, { borderColor: scheme === 'dark' ? '#0284c7' : '#bae6fd', backgroundColor: scheme === 'dark' ? '#082f49' : '#f0f9ff' }]}
                            onPress={async () => {
                              if (selectedDoc && firmante.firma_base64) {
                                try {
                                  await PdfDocumentoService.generarYCompartirPdf({
                                    documento: selectedDoc,
                                    firmado: firmante,
                                    firmaBase64: firmante.firma_base64 || '',
                                    ipRegistro: firmante.ip_registro || '',
                                    ubicacionGps: firmante.ubicacion_gps || '',
                                    dispositivoInfo: firmante.dispositivo_info || '',
                                    incluirConstancia: true,
                                  });
                                } catch (e: any) {
                                  Alert.alert('Error', 'No se pudo generar la constancia.');
                                }
                              } else {
                                Alert.alert('Aviso', 'Firma base64 no disponible para constancia NOM-151.');
                              }
                            }}
                          >
                            <Ionicons name="shield-checkmark" size={14} color="#0284c7" />
                            <Text style={{ color: '#0284c7', fontSize: 11, fontWeight: 'bold' }}>+ Constancia NOM-151</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ────────────────── MODAL LECTURA Y FIRMA (ADMIN) ────────────────── */}
      <Modal
        statusBarTranslucent={true}
        visible={modalLecturaVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalLecturaVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalLecturaContent, { backgroundColor: themeColors.backgroundElement }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                  {selectedMisDoc?.documentos?.titulo}
                </Text>
                <Text style={{ color: themeColors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  Emitido por: {selectedMisDoc?.documentos?.creador_nombre}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setModalLecturaVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.docScrollContent}>
              {selectedMisDoc?.documentos?.archivo_pdf_url ? (
                <View style={[styles.pdfNoticeBox, { borderColor: themeColors.border, backgroundColor: scheme === 'dark' ? '#0f2b48' : '#f0f9ff' }]}>
                  <Ionicons name="document-text-outline" size={32} color={scheme === 'dark' ? '#38bdf8' : '#0284c7'} />
                  <Text style={{ fontWeight: 'bold', color: themeColors.text, fontSize: 14, marginTop: 6 }}>
                    Documento PDF Adjunto Original
                  </Text>
                  <Text style={{ color: themeColors.textSecondary, fontSize: 12, textAlign: 'center', marginVertical: 6 }}>
                    Haz clic a continuación para abrir y leer el archivo PDF completo de la empresa antes de firmar.
                  </Text>
                  <TouchableOpacity
                    style={[styles.openPdfBtn, { backgroundColor: themeColors.accent }]}
                    onPress={() => {
                      if (selectedMisDoc.documentos?.archivo_pdf_url) {
                        Linking.openURL(selectedMisDoc.documentos.archivo_pdf_url);
                      }
                    }}
                  >
                    <Ionicons name="open-outline" size={16} color="#ffffff" />
                    <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 13 }}>
                      Abrir y Leer Documento PDF
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[styles.htmlViewBox, { borderColor: themeColors.border, backgroundColor: scheme === 'dark' ? '#0f172a' : '#f8fafc' }]}>
                  <Text style={[styles.htmlContentText, { color: themeColors.text }]}>
                    {selectedMisDoc?.documentos?.contenido_html?.replace(/<[^>]*>?/gm, '')}
                  </Text>
                </View>
              )}

              {selectedMisDoc?.estado === 'FIRMADO' && (
                <View style={[styles.signedNotice, { backgroundColor: scheme === 'dark' ? '#064e3b' : '#d1fae5' }]}>
                  <Ionicons name="shield-checkmark" size={20} color={scheme === 'dark' ? '#34d399' : '#047857'} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: 'bold', color: scheme === 'dark' ? '#34d399' : '#047857', fontSize: 13 }}>
                      Documento Firmado el {new Date(selectedMisDoc.firmado_at || '').toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })} a las {new Date(selectedMisDoc.firmado_at || '').toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <Text style={{ color: scheme === 'dark' ? '#6ee7b7' : '#065f46', fontSize: 11 }}>
                      Hash SHA-256: {selectedMisDoc.hash_sha256 || 'Registrado'}
                    </Text>
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalLecturaFooter}>
              {selectedMisDoc?.estado === 'PENDIENTE' ? (
                <CustomButton
                  title="Firmar Este Documento Ahora"
                  onPress={() => setModalFirmaVisible(true)}
                  loading={isSigning}
                  icon={<Ionicons name="create-outline" size={20} color="#ffffff" />}
                />
              ) : (
                <View style={{ gap: 8, width: '100%' }}>
                  <CustomButton
                    title="Ver PDF Firmado"
                    onPress={async () => {
                      if (selectedMisDoc?.pdf_firmado_url) {
                        Linking.openURL(selectedMisDoc.pdf_firmado_url);
                      } else if (selectedMisDoc?.documentos && selectedMisDoc.firma_base64) {
                        try {
                          await PdfDocumentoService.generarYCompartirPdf({
                            documento: selectedMisDoc.documentos,
                            firmado: selectedMisDoc,
                            firmaBase64: selectedMisDoc.firma_base64 || '',
                            ipRegistro: selectedMisDoc.ip_registro || '',
                            ubicacionGps: selectedMisDoc.ubicacion_gps || '',
                            dispositivoInfo: selectedMisDoc.dispositivo_info || '',
                            incluirConstancia: false,
                          });
                        } catch (e: any) {
                          Alert.alert('Error', 'No se pudo abrir el PDF firmado.');
                        }
                      }
                    }}
                    icon={<Ionicons name="document-text-outline" size={20} color="#ffffff" />}
                  />
                  <CustomButton
                    title="+ Constancia de Auditoría NOM-151"
                    variant="secondary"
                    onPress={async () => {
                      if (selectedMisDoc?.documentos && selectedMisDoc.firma_base64) {
                        try {
                          await PdfDocumentoService.generarYCompartirPdf({
                            documento: selectedMisDoc.documentos,
                            firmado: selectedMisDoc,
                            firmaBase64: selectedMisDoc.firma_base64 || '',
                            ipRegistro: selectedMisDoc.ip_registro || '',
                            ubicacionGps: selectedMisDoc.ubicacion_gps || '',
                            dispositivoInfo: selectedMisDoc.dispositivo_info || '',
                            incluirConstancia: true,
                          });
                        } catch (e: any) {
                          Alert.alert('Error', 'No se pudo generar la constancia.');
                        }
                      }
                    }}
                    icon={<Ionicons name="shield-checkmark" size={18} color={themeColors.accent} />}
                  />
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* ────────────────── MODAL CANVAS DE FIRMA DIGITAL ────────────────── */}
      <SignatureCanvasModal
        visible={modalFirmaVisible}
        titulo={`Firma: ${selectedMisDoc?.documentos?.titulo || 'Documento Corporativo'}`}
        onClose={() => setModalFirmaVisible(false)}
        onConfirm={handleConfirmarFirmaAdmin}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  newDocBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0284c7',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  newDocBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  mainTabsContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    gap: 6,
  },
  mainTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  mainTabBtnActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  mainTabBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  redBadge: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  redBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  subTabsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    marginBottom: 16,
  },
  subTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  subTabText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 60,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 12,
    textAlign: 'center',
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  cardDesc: {
    fontSize: 13,
    marginTop: 6,
    marginBottom: 12,
  },
  deleteBtn: {
    padding: 4,
  },
  badgeState: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  progressContainer: {
    marginVertical: 12,
  },
  progressTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  progressLabel: {
    fontSize: 13,
  },
  progressPercent: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 10,
    marginTop: 6,
    gap: 8,
  },
  cardMeta: {
    fontSize: 11,
    flex: 1,
  },
  detailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#334155',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  detailBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 580,
    maxHeight: '92%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalHeaderIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  modalStatItem: {
    alignItems: 'center',
    gap: 1,
  },
  modalStatDivider: {
    width: 1,
    height: 20,
  },
  firmanteCard: {
    flexDirection: 'column',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  firmanteTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  firmanteAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  firmanteName: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  firmanteAuditBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  firmanteActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  pdfButtonFilled: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    borderRadius: 8,
  },
  constanciaButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
  },
  modalLecturaContent: {
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  docScrollContent: {
    marginVertical: 10,
  },
  htmlViewBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    minHeight: 180,
  },
  htmlContentText: {
    fontSize: 14,
    lineHeight: 22,
  },
  signedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  pdfNoticeBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openPdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    marginTop: 8,
  },
  modalLecturaFooter: {
    marginTop: 16,
  },
});
