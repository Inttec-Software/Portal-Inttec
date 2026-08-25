import React, { useState, useEffect } from 'react';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { supabase, Usuario, AuthService, inttecClient, daravisaClient } from '@/services/supabase';
import { useAuth } from '@/context/AuthContext';
import { SyncService, base64ToArrayBuffer } from '@/services/sync';
import { getApiUrl, getApiHeaders } from '@/services/apiHelper';
import { optimizeImage } from '@/utils/imageOptimizer';
import { EvidenceReportGenerator } from '@/utils/evidenceReportGenerator';
import StepIndicator from '@/components/StepIndicator';
import CustomInput from '@/components/CustomInput';
import CustomButton from '@/components/CustomButton';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import ImageViewerModal from '@/components/ImageViewerModal';
import MaterialesSelector from '@/components/MaterialesSelector';

export default function EvidenciaForm() {
  const router = useRouter();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { company, changeCompany } = useAuth();

  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estados de Ruedita de Carga / Progreso de Fotos
  const [loadingModalVisible, setLoadingModalVisible] = useState(false);
  const [loadingTitle, setLoadingTitle] = useState('Procesando imágenes');
  const [loadingMessage, setLoadingMessage] = useState('');
  const [loadingCurrent, setLoadingCurrent] = useState(0);
  const [loadingTotal, setLoadingTotal] = useState(0);

  // Catálogos
  const [clientes, setClientes] = useState<any[]>([]);
  const [sucursalesCliente, setSucursalesCliente] = useState<any[]>([]);
  
  const [selectedCliente, setSelectedCliente] = useState<string>('');
  const [clienteSearch, setClienteSearch] = useState('');
  const [showCliDropdown, setShowCliDropdown] = useState(false);
  
  const [selectedSucursal, setSelectedSucursal] = useState<string>('');
  const [sucursalSearch, setSucursalSearch] = useState('');
  const [showSucursalDropdown, setShowSucursalDropdown] = useState(false);
  const [productos, setProductos] = useState<any[]>([]);

  const [trabajos, setTrabajos] = useState<{
    descripcion: string;
    materiales: string;
    materiales_usados?: { productoId: string; nombre: string; retirado: number; usado: number; sobrante: number }[];
    solucion: string;
    antesImg?: { uri: string; base64: string | null };
    despuesImg?: { uri: string; base64: string | null };
    fotosAdicionales?: { uri: string; base64: string | null }[];
  }[]>([
    { descripcion: '', materiales: '', materiales_usados: [], solucion: '', fotosAdicionales: [] }
  ]);

  // Modal de imagen a pantalla completa
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [viewerVisible, setViewerVisible] = useState(false);

  const handleOpenPhoto = (uri: string | null) => {
    if (uri) {
      setSelectedPhoto(uri);
      setViewerVisible(true);
    }
  };


  const loadCatalogos = async (userId?: string) => {
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/evidencias/catalogos`, { headers });
      if (!res.ok) throw new Error('Error al cargar catálogos de evidencias');
      const data = await res.json();
      
      if (data.clientes) setClientes(data.clientes);
      if (data.sucursales) setSucursalesCliente(data.sucursales);
      if (data.inventario) {
        const formattedProductos = data.inventario.map((item: any) => ({
          id: item.producto_id,
          sku_interno: item.productos?.sku_interno || '',
          nombre_oficial: item.productos?.nombre_oficial || '',
          stock_actual: item.cantidad_disponible
        }));
        setProductos(formattedProductos);
      }
    } catch (err) {
      console.error('Error loading catalogs:', err);
    }
  };

  useEffect(() => {
    const init = async () => {
      const user = await AuthService.getCurrentUser();
      if (!user) {
        router.replace('/');
        return;
      }
      setCurrentUser(user);
      await loadCatalogos(user.id);
    };
    init();
  }, [router]);

  // Solicitar permiso de cámara
  const requestCameraPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'web') return true;
    const cameraStatus = await ImagePicker.requestCameraPermissionsAsync();
    if (cameraStatus.status !== 'granted') {
      Alert.alert(
        'Permiso de cámara requerido',
        'Necesitamos permiso de la cámara para capturar fotos de las evidencias.'
      );
      return false;
    }
    return true;
  };

  // Solicitar permiso de galería
  const requestLibraryPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'web') return true;
    const libraryStatus = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (libraryStatus.status !== 'granted') {
      Alert.alert(
        'Permiso de galería requerido',
        'Necesitamos permiso de la galería para seleccionar las imágenes de las evidencias.'
      );
      return false;
    }
    return true;
  };

  const handleCapturePhoto = async (type: 'antes' | 'despues' | 'adicional', jobIndex: number) => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    const currentExtras = trabajos[jobIndex]?.fotosAdicionales || [];
    if (type === 'adicional' && currentExtras.length >= 250) {
      Alert.alert('Límite alcanzado', 'Has alcanzado el límite máximo de 250 fotografías adicionales para este trabajo.');
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: Platform.OS !== 'web',
        quality: 0.4,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        setLoadingTitle('Procesando foto');
        setLoadingMessage('Optimizando imagen...');
        setLoadingCurrent(1);
        setLoadingTotal(1);
        setLoadingModalVisible(true);

        try {
          const optimized = await optimizeImage(result.assets[0].uri);
          if (type === 'antes') {
            setTrabajos(prev => prev.map((t, i) => i === jobIndex ? { ...t, antesImg: { uri: optimized.uri, base64: optimized.base64 || null } } : t));
          } else if (type === 'despues') {
            setTrabajos(prev => prev.map((t, i) => i === jobIndex ? { ...t, despuesImg: { uri: optimized.uri, base64: optimized.base64 || null } } : t));
          } else if (type === 'adicional') {
            setTrabajos(prev => prev.map((t, i) => {
              if (i === jobIndex) {
                const updated = [...(t.fotosAdicionales || []), { uri: optimized.uri, base64: optimized.base64 || null }];
                return { ...t, fotosAdicionales: updated.slice(0, 250) };
              }
              return t;
            }));
          }
        } finally {
          setLoadingModalVisible(false);
        }
      }
    } catch (err) {
      console.error('Camera capture error:', err);
      setLoadingModalVisible(false);
      if (Platform.OS === 'web') {
        await handleSelectGallery(type, jobIndex);
      } else {
        Alert.alert('Error', 'No se pudo abrir la cámara.');
      }
    }
  };

  const handleSelectGallery = async (type: 'antes' | 'despues' | 'adicional', jobIndex: number) => {
    const hasPermission = await requestLibraryPermission();
    if (!hasPermission) return;

    const currentExtras = trabajos[jobIndex]?.fotosAdicionales || [];
    if (type === 'adicional' && currentExtras.length >= 250) {
      Alert.alert('Límite alcanzado', 'Has alcanzado el límite máximo de 250 fotografías adicionales para este trabajo.');
      return;
    }

    const remainingSlots = type === 'adicional' 
      ? Math.max(1, 250 - currentExtras.length)
      : 1;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: type === 'adicional',
        allowsEditing: type !== 'adicional',
        selectionLimit: remainingSlots,
        quality: 0.4,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        if (type === 'antes') {
          setLoadingTitle('Optimizando foto');
          setLoadingMessage('Comprimiendo imagen...');
          setLoadingCurrent(1);
          setLoadingTotal(1);
          setLoadingModalVisible(true);
          try {
            const opt = await optimizeImage(result.assets[0].uri);
            setTrabajos(prev => prev.map((t, i) => i === jobIndex ? { ...t, antesImg: { uri: opt.uri, base64: opt.base64 || null } } : t));
          } finally {
            setLoadingModalVisible(false);
          }
        } else if (type === 'despues') {
          setLoadingTitle('Optimizando foto');
          setLoadingMessage('Comprimiendo imagen...');
          setLoadingCurrent(1);
          setLoadingTotal(1);
          setLoadingModalVisible(true);
          try {
            const opt = await optimizeImage(result.assets[0].uri);
            setTrabajos(prev => prev.map((t, i) => i === jobIndex ? { ...t, despuesImg: { uri: opt.uri, base64: opt.base64 || null } } : t));
          } finally {
            setLoadingModalVisible(false);
          }
        } else if (type === 'adicional') {
          const totalToProcess = result.assets.length;
          setLoadingTitle('Procesando fotografías');
          setLoadingMessage(`Optimizando 0 de ${totalToProcess} fotos...`);
          setLoadingCurrent(0);
          setLoadingTotal(totalToProcess);
          setLoadingModalVisible(true);

          const mappedPhotos: { uri: string; base64: string | null }[] = [];
          const BATCH_SIZE = 5;

          try {
            for (let i = 0; i < totalToProcess; i += BATCH_SIZE) {
              const chunk = result.assets.slice(i, i + BATCH_SIZE);
              const processedChunk = await Promise.all(
                chunk.map(async (asset) => {
                  try {
                    const opt = await optimizeImage(asset.uri);
                    return { uri: opt.uri, base64: opt.base64 || null };
                  } catch (e) {
                    console.warn('Error optimizing photo:', e);
                    return { uri: asset.uri, base64: asset.base64 || null };
                  }
                })
              );
              mappedPhotos.push(...processedChunk);
              const currentDone = Math.min(i + chunk.length, totalToProcess);
              setLoadingCurrent(currentDone);
              setLoadingMessage(`Optimizando ${currentDone} de ${totalToProcess} fotos (${Math.round((currentDone / totalToProcess) * 100)}%)...`);
            }

            setTrabajos(prev => prev.map((t, i) => {
              if (i === jobIndex) {
                const combined = [...(t.fotosAdicionales || []), ...mappedPhotos];
                return { ...t, fotosAdicionales: combined.slice(0, 250) };
              }
              return t;
            }));
          } finally {
            setLoadingModalVisible(false);
          }
        }
      }
    } catch (err) {
      console.error('Gallery select error:', err);
      setLoadingModalVisible(false);
      Alert.alert('Error', 'No se pudo abrir la galería o procesar las fotos.');
    }
  };

  const handleExportPDF = async () => {
    console.log("handleExportPDF called");
    if (!selectedCliente) {
      Alert.alert('Validación', 'Por favor llena el nombre del cliente.');
      return;
    }
    const hasEmptyFields = trabajos.some(t => !t.descripcion.trim() || !t.solucion.trim() || !t.materiales.trim());
    if (hasEmptyFields) {
      Alert.alert('Validación', 'Por favor llena la situación, los materiales y la solución para todos los trabajos.');
      return;
    }

    const totalFotosAdicionales = trabajos.reduce((acc, t) => acc + (t.fotosAdicionales?.length || 0), 0);

    setLoadingTitle('Generando reporte PDF');
    setLoadingMessage('Compilando evidencias y anexos fotográficos...');
    setLoadingCurrent(0);
    setLoadingTotal(totalFotosAdicionales);
    setLoadingModalVisible(true);

    try {
      const allMateriales = trabajos
        .map(t => t.materiales.trim())
        .filter(Boolean)
        .join(', ');
      
      const allSoluciones = trabajos
        .map((t, i) => t.solucion.trim() ? `Trabajo #${i + 1}: ${t.solucion.trim()}` : '')
        .filter(Boolean)
        .join('\n');

      const clienteObj = clientes.find(c => c.id === selectedCliente);
      const sucObj = sucursalesCliente.find(s => s.id === selectedSucursal);
      const clienteStr = clienteObj ? (clienteObj.nombre + (sucObj ? ' - ' + sucObj.nombre : '')) : '';

      const evData = {
        empleado_id: currentUser?.id || '',
        cliente: clienteStr,
        descripcion_trabajo: JSON.stringify(trabajos.map(t => ({
          descripcion: t.descripcion.trim(),
          materiales: t.materiales.trim() || null,
          materiales_usados: t.materiales_usados || [],
          solucion: t.solucion.trim() || null,
          antesImg: t.antesImg?.uri || (t.antesImg?.base64 ? `data:image/jpeg;base64,${t.antesImg.base64}` : null),
          despuesImg: t.despuesImg?.uri || (t.despuesImg?.base64 ? `data:image/jpeg;base64,${t.despuesImg.base64}` : null),
          fotosAdicionales: (t.fotosAdicionales || []).map(f => f.uri || (f.base64 ? `data:image/jpeg;base64,${f.base64}` : '')).filter(Boolean),
        }))),
        materiales_usados: allMateriales || null,
        observaciones: allSoluciones || null,
      };

      await EvidenceReportGenerator.exportToPDF(
        evData,
        currentUser?.nombre || 'Técnico Autorizado'
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo exportar el PDF.');
    } finally {
      setLoadingModalVisible(false);
    }
  };

  const handleSaveToDatabase = async () => {
    console.log("handleSaveToDatabase called");
    if (!currentUser) return;
    
    if (!selectedCliente) {
      Alert.alert('Validación', 'Por favor llena el nombre del cliente.');
      return;
    }
    const hasEmptyFields = trabajos.some(t => !t.descripcion.trim() || !t.solucion.trim() || !t.materiales.trim());
    if (hasEmptyFields) {
      Alert.alert('Validación', 'Por favor llena la situación, los materiales y la solución para todos los trabajos.');
      return;
    }

    setIsSubmitting(true);

    // Contabilizar total de fotos a subir en todos los trabajos
    let totalPhotosToUpload = 0;
    trabajos.forEach(t => {
      if (t.antesImg?.base64) totalPhotosToUpload++;
      if (t.despuesImg?.base64) totalPhotosToUpload++;
      (t.fotosAdicionales || []).forEach(extra => {
        if (extra.base64) totalPhotosToUpload++;
      });
    });

    setLoadingTitle('Guardando en el servidor');
    setLoadingMessage('Iniciando subida de evidencias...');
    setLoadingCurrent(0);
    setLoadingTotal(totalPhotosToUpload);
    setLoadingModalVisible(true);

    try {
      let uploadedCount = 0;

      // Helper to convert base64 to arraybuffer and upload
      const uploadPhoto = async (base64Data: string, prefix: string) => {
        const arrayBuffer = base64ToArrayBuffer(base64Data);
        const randId = Math.random().toString(36).substring(2, 7);
        const fileName = `${currentUser.id}/evidencia_${prefix}_${Date.now()}_${randId}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('tickets')
          .upload(fileName, arrayBuffer, { contentType: 'image/jpeg', upsert: true });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('tickets').getPublicUrl(fileName);
        uploadedCount++;
        setLoadingCurrent(uploadedCount);
        setLoadingMessage(`Subiendo foto ${uploadedCount} de ${totalPhotosToUpload} (${Math.round((uploadedCount / Math.max(1, totalPhotosToUpload)) * 100)}%)...`);
        return urlData.publicUrl;
      };

      let fotoAntesUrl = null;
      let fotoDespuesUrl = null;
      const allFotosAdicionalesUrls: string[] = [];

      // Subir fotos de cada trabajo (antes, despues y fotos adicionales de cada trabajo)
      const trabajosPayload = [];
      for (let i = 0; i < trabajos.length; i++) {
        const t = trabajos[i];
        let antesUrl: string | null = null;
        let despuesUrl: string | null = null;

        if (t.antesImg?.base64) {
          antesUrl = await uploadPhoto(t.antesImg.base64, `t${i}_antes`);
          if (i === 0) fotoAntesUrl = antesUrl;
        }
        if (t.despuesImg?.base64) {
          despuesUrl = await uploadPhoto(t.despuesImg.base64, `t${i}_despues`);
          if (i === 0) fotoDespuesUrl = despuesUrl;
        }

        // Subir fotos adicionales de este trabajo con concurrencia de 4
        const jobExtrasUrls: string[] = [];
        const extras = t.fotosAdicionales || [];
        if (extras.length > 0) {
          const CONCURRENCY = 4;
          for (let j = 0; j < extras.length; j += CONCURRENCY) {
            const chunk = extras.slice(j, j + CONCURRENCY);
            const urls = await Promise.all(
              chunk.map(async (extra, chunkIdx) => {
                if (extra.base64) {
                  return await uploadPhoto(extra.base64, `t${i}_extra_${j + chunkIdx}`);
                }
                return extra.uri || null;
              })
            );
            urls.forEach(u => {
              if (u) {
                jobExtrasUrls.push(u);
                allFotosAdicionalesUrls.push(u);
              }
            });
          }
        }

        trabajosPayload.push({
          descripcion: t.descripcion.trim(),
          materiales: t.materiales.trim() || null,
          materiales_usados: t.materiales_usados || [],
          solucion: t.solucion.trim() || null,
          antesImg: antesUrl || t.antesImg?.uri || null,
          despuesImg: despuesUrl || t.despuesImg?.uri || null,
          fotosAdicionales: jobExtrasUrls,
        });
      }

      setLoadingMessage('Registrando evidencia en la base de datos...');

      const allMateriales = trabajos
        .map(t => t.materiales.trim())
        .filter(Boolean)
        .join(', ');
      
      const allSoluciones = trabajos
        .map((t, i) => t.solucion.trim() ? `Trabajo #${i + 1}: ${t.solucion.trim()}` : '')
        .filter(Boolean)
        .join('\n');

      const clienteObj = clientes.find(c => c.id === selectedCliente);
      const sucObj = sucursalesCliente.find(s => s.id === selectedSucursal);
      const clienteStr = clienteObj ? (clienteObj.nombre + (sucObj ? ' - ' + sucObj.nombre : '')) : '';

      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/evidencias`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          cliente: clienteStr,
          descripcion_trabajo: JSON.stringify(trabajosPayload),
          materiales_usados: allMateriales || null,
          observaciones: allSoluciones || null,
          foto_antes_url: fotoAntesUrl,
          foto_despues_url: fotoDespuesUrl,
          fotos_adicionales_urls: allFotosAdicionalesUrls.length > 0 ? allFotosAdicionalesUrls : null,
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error al guardar evidencia en el servidor');
      }

      setLoadingModalVisible(false);
      Alert.alert('Éxito', 'Evidencia y reporte guardados correctamente en el servidor.');
      router.replace('/(empleado)/gastos');
    } catch (err: any) {
      console.error('Error saving evidence:', err);
      setLoadingModalVisible(false);
      Alert.alert(
        'Guardado Parcial',
        `${err.message}\n\nEl reporte no se pudo guardar en el servidor, pero puedes exportar el PDF con el botón correspondiente.`
      );
    } finally {
      setIsSubmitting(false);
      setLoadingModalVisible(false);
    }
  };

  const nextStep = () => {
    if (currentStep === 1) {
      if (!selectedCliente) {
        Alert.alert('Validación', 'Por favor selecciona el cliente.');
        return;
      }
      const hasEmptyFields = trabajos.some(t => !t.descripcion.trim() || !t.solucion.trim() || !t.materiales.trim());
      if (hasEmptyFields) {
        Alert.alert('Validación', 'Por favor llena la situación, los materiales y la solución para todos los trabajos.');
        return;
      }
      setCurrentStep(2);
    }
  };

  const prevStep = () => {
    setCurrentStep((prev) => prev - 1);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.backBtn} />
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Evidencias de Trabajo</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Switch de Empresa */}
      <View style={{
        flexDirection: 'row',
        backgroundColor: scheme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
        borderRadius: 20,
        padding: 2,
        alignItems: 'center',
        width: 200,
        alignSelf: 'center',
        marginBottom: 10,
        marginTop: 5,
      }}>
        <TouchableOpacity
          onPress={() => company !== 'inttec' && changeCompany && changeCompany('inttec')}
          style={{
            flex: 1,
            paddingVertical: 8,
            borderRadius: 18,
            backgroundColor: company === 'inttec' ? themeColors.accent : 'transparent',
            alignItems: 'center'
          }}
        >
          <Text style={{
            fontSize: 12,
            fontWeight: '700',
            color: company === 'inttec' ? '#ffffff' : themeColors.textSecondary,
          }}>
            INTTEC
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => company !== 'daravisa' && changeCompany && changeCompany('daravisa')}
          style={{
            flex: 1,
            paddingVertical: 8,
            borderRadius: 18,
            backgroundColor: company === 'daravisa' ? themeColors.accent : 'transparent',
            alignItems: 'center'
          }}
        >
          <Text style={{
            fontSize: 12,
            fontWeight: '700',
            color: company === 'daravisa' ? '#ffffff' : themeColors.textSecondary,
          }}>
            DARAVISA
          </Text>
        </TouchableOpacity>
      </View>


      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid={true}
        extraScrollHeight={100}
      >
          <StepIndicator
            currentStep={currentStep}
            steps={['Información y Evidencias', 'Revisión y Finalizar']}
          />

          {/* PASO 2: Revisión y Finalizar */}
          {currentStep === 2 && (
            <View style={styles.stepContainer}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                2. Revisión y Finalizar Reporte
              </Text>
              <Text style={[styles.subtitleText, { color: themeColors.textSecondary }]}>
                Revisa los datos de la intervención antes de exportar el reporte o guardarlo en el servidor.
              </Text>

              {/* Tarjeta de Resumen */}
              <View style={{
                backgroundColor: themeColors.backgroundElement,
                borderColor: themeColors.border,
                borderWidth: 1,
                borderRadius: BorderRadius.medium,
                padding: Spacing.three,
                marginBottom: Spacing.four
              }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: themeColors.text, marginBottom: Spacing.two }}>
                  Resumen de la Evidencia
                </Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.one }}>
                  <Ionicons name="business-outline" size={18} color={themeColors.primary} style={{ marginRight: 8 }} />
                  <Text style={{ fontSize: 14, color: themeColors.text, fontWeight: '600' }}>
                    Cliente: <Text style={{ fontWeight: '400', color: themeColors.textSecondary }}>{clientes.find(c => c.id === selectedCliente)?.nombre || 'No seleccionado'}</Text>
                  </Text>
                </View>

                {selectedSucursal ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.one }}>
                    <Ionicons name="storefront-outline" size={18} color={themeColors.primary} style={{ marginRight: 8 }} />
                    <Text style={{ fontSize: 14, color: themeColors.text, fontWeight: '600' }}>
                      Sucursal: <Text style={{ fontWeight: '400', color: themeColors.textSecondary }}>{sucursalesCliente.find(s => s.id === selectedSucursal)?.nombre || 'General'}</Text>
                    </Text>
                  </View>
                ) : null}

                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.one }}>
                  <Ionicons name="construct-outline" size={18} color={themeColors.accent} style={{ marginRight: 8 }} />
                  <Text style={{ fontSize: 14, color: themeColors.text, fontWeight: '600' }}>
                    Trabajos Registrados: <Text style={{ fontWeight: '400', color: themeColors.textSecondary }}>{trabajos.length} {trabajos.length === 1 ? 'trabajo' : 'trabajos'}</Text>
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.one }}>
                  <Ionicons name="camera-outline" size={18} color={themeColors.success} style={{ marginRight: 8 }} />
                  <Text style={{ fontSize: 14, color: themeColors.text, fontWeight: '600' }}>
                    Evidencias Antes / Después: <Text style={{ fontWeight: '400', color: themeColors.textSecondary }}>{trabajos.filter(t => t.antesImg).length} Antes, {trabajos.filter(t => t.despuesImg).length} Después</Text>
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="images-outline" size={18} color={themeColors.accent} style={{ marginRight: 8 }} />
                  <Text style={{ fontSize: 14, color: themeColors.text, fontWeight: '600' }}>
                    Fotos Adicionales: <Text style={{ fontWeight: '400', color: themeColors.textSecondary }}>{trabajos.reduce((acc, t) => acc + (t.fotosAdicionales?.length || 0), 0)} fotos en total</Text>
                  </Text>
                </View>
              </View>

              <View style={styles.actionColumn}>
                <CustomButton
                  title="EXPORTAR REPORTE A PDF"
                  onPress={handleExportPDF}
                  variant="primary"
                  icon={<Ionicons name="document-text-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />}
                />

                <CustomButton
                  title="GUARDAR EN EL SERVIDOR"
                  onPress={handleSaveToDatabase}
                  loading={isSubmitting}
                  variant="success"
                  style={{ marginTop: Spacing.two }}
                  icon={<Ionicons name="cloud-upload-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />}
                />
              </View>

              <View style={styles.footerNav}>
                <CustomButton title="Atrás" onPress={prevStep} variant="secondary" style={styles.navBtn} />
                <View style={{ flex: 1 }} />
              </View>
            </View>
          )}

          {/* PASO 1: Información del Servicio */}
          {currentStep === 1 && (
            <View style={styles.stepContainer}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                1. Detalles de la Intervención
              </Text>
              <Text style={[styles.subtitleText, { color: themeColors.textSecondary }]}>
                Proporciona los datos del cliente, describe los trabajos realizados y añade las fotografías correspondientes.
              </Text>

              
              {/* Selector de Cliente */}
              <View style={[styles.customDropdownContainer, { marginBottom: Spacing.four, zIndex: 100 }]}>
                <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Cliente Relacionado *</Text>
                <TouchableOpacity
                  style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, padding: 12, borderRadius: 8, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                  onPress={() => {
                    setShowCliDropdown(!showCliDropdown);
                    setShowSucursalDropdown(false);
                  }}
                >
                  <Text style={{ color: selectedCliente ? themeColors.text : themeColors.textSecondary }}>
                    {clientes.find(c => c.id === selectedCliente)?.nombre || selectedCliente || 'Selecciona un cliente'}
                  </Text>
                  <Ionicons name={showCliDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                </TouchableOpacity>
                {showCliDropdown && (
                  <View style={{ width: '100%', zIndex: 100 }}>
                    <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, borderWidth: 1, borderRadius: 8, marginTop: 4 }]}>
                      <CustomInput
                        placeholder="Buscar cliente..."
                        value={clienteSearch}
                        onChangeText={setClienteSearch}
                        iconName="search-outline"
                        style={{ margin: Spacing.one, height: 40 }}
                      />
                      <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                        {clientes
                          .filter(cli => cli.nombre && cli.nombre.toLowerCase().includes(clienteSearch.toLowerCase()))
                          .map((cli, index, array) => (
                            <TouchableOpacity
                              key={cli.id}
                              style={[
                                styles.dropdownItem,
                                index === array.length - 1 && { borderBottomWidth: 0 },
                                { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: themeColors.border }
                              ]}
                              onPress={() => {
                                setSelectedCliente(cli.id);
                                setSelectedSucursal(''); // reset
                                setShowCliDropdown(false);
                                setClienteSearch('');
                              }}
                            >
                              <Ionicons name="business-outline" size={24} color={themeColors.primary} />
                              <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 14 }}>{cli.nombre}</Text>
                            </TouchableOpacity>
                          ))}
                      </ScrollView>
                    </View>
                  </View>
                )}
              </View>

              {/* Selector de Sucursal */}
              {selectedCliente !== '' && (
                <View style={[styles.customDropdownContainer, { marginBottom: Spacing.four, zIndex: 90 }]}>
                  <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Sucursal</Text>
                  <TouchableOpacity
                    style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, padding: 12, borderRadius: 8, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                    onPress={() => {
                      setShowSucursalDropdown(!showSucursalDropdown);
                      setShowCliDropdown(false);
                    }}
                  >
                    <Text style={{ color: selectedSucursal ? themeColors.text : themeColors.textSecondary }}>
                      {sucursalesCliente.find(s => s.id === selectedSucursal)?.nombre || selectedSucursal || 'Selecciona una sucursal'}
                    </Text>
                    <Ionicons name={showSucursalDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                  </TouchableOpacity>
                  {showSucursalDropdown && (
                    <View style={{ width: '100%', zIndex: 90 }}>
                      <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, borderWidth: 1, borderRadius: 8, marginTop: 4 }]}>
                        <CustomInput
                          placeholder="Buscar sucursal..."
                          value={sucursalSearch}
                          onChangeText={setSucursalSearch}
                          iconName="search-outline"
                          style={{ margin: Spacing.one, height: 40 }}
                        />
                        <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                          {sucursalesCliente
                            .filter(suc => suc.cliente_id === selectedCliente)
                            .filter(suc => suc.nombre && suc.nombre.toLowerCase().includes(sucursalSearch.toLowerCase()))
                            .map((suc, index, array) => (
                              <TouchableOpacity
                                key={suc.id}
                                style={[
                                  styles.dropdownItem,
                                  index === array.length - 1 && { borderBottomWidth: 0 },
                                  { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: themeColors.border }
                                ]}
                                onPress={() => {
                                  setSelectedSucursal(suc.id);
                                  setShowSucursalDropdown(false);
                                  setSucursalSearch('');
                                }}
                              >
                                <Ionicons name="storefront-outline" size={24} color={themeColors.primary} />
                                <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 14 }}>{suc.nombre}</Text>
                              </TouchableOpacity>
                            ))}
                          {sucursalesCliente.filter(suc => suc.cliente_id === selectedCliente).length === 0 && (
                            <Text style={{ padding: Spacing.two, color: themeColors.textSecondary, textAlign: 'center' }}>
                              No hay sucursales registradas para este cliente.
                            </Text>
                          )}
                        </ScrollView>
                      </View>
                    </View>
                  )}
                </View>
              )}


              {trabajos.map((trabajo, index) => (
                <View key={index} style={{ marginBottom: Spacing.four, borderLeftWidth: 3, borderLeftColor: themeColors.accent, paddingLeft: Spacing.two }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.two }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: themeColors.text }}>Trabajo / Arreglo #{index + 1}</Text>
                    {trabajos.length > 1 && (
                      <TouchableOpacity
                        onPress={() => {
                          setTrabajos(prev => prev.filter((_, i) => i !== index));
                        }}
                        style={{ padding: 4 }}
                      >
                        <Ionicons name="trash-outline" size={20} color={Colors.light.danger} />
                      </TouchableOpacity>
                    )}
                  </View>

                  <CustomInput
                    label="Situación encontrada (Descripción del problema) *"
                    placeholder="Ej. Cambio de cableado eléctrico, mantenimiento de bomba, etc."
                    value={trabajo.descripcion}
                    onChangeText={(val) => {
                      setTrabajos(prev => prev.map((t, i) => i === index ? { ...t, descripcion: val } : t));
                    }}
                    multiline
                    numberOfLines={3}
                    style={{ minHeight: 70 }}
                    iconName="construct-outline"
                  />

                  {/* Selector de Materiales Estructurado */}
                  <MaterialesSelector
                    productos={productos}
                    materiales={trabajo.materiales_usados || []}
                    onChange={(nuevosMateriales) => {
                      const textoMateriales = nuevosMateriales.map(m => `৹ ${m.usado}x ${m.nombre} (Sobrante: ${m.sobrante})`).join('\n');
                      setTrabajos(prev => prev.map((t, i) => i === index ? { ...t, materiales_usados: nuevosMateriales, materiales: textoMateriales } : t));
                    }}
                  />

                  <CustomInput
                    label="Solución (Qué se hizo para solucionar el problema) *"
                    placeholder="Ej. Se reemplazó el fusible dañado y se aisló el cableado..."
                    value={trabajo.solucion}
                    onChangeText={(val) => {
                      setTrabajos(prev => prev.map((t, i) => i === index ? { ...t, solucion: val } : t));
                    }}
                    multiline
                    numberOfLines={2}
                    style={{ minHeight: 60 }}
                    iconName="checkmark-circle-outline"
                  />

                  {/* Evidencias Fotográficas de este Trabajo */}
                  <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.text, marginTop: Spacing.three, marginBottom: Spacing.two }}>
                    Evidencia Fotográfica
                  </Text>
                  
                  <View style={{ flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.two }}>
                    {/* Foto Antes */}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.photoLabel, { fontSize: 12, color: themeColors.textSecondary }]}>Antes</Text>
                      <View style={[styles.imageCard, { height: 120, backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                        {trabajo.antesImg?.uri ? (
                          <View style={styles.previewContainer}>
                            <TouchableOpacity
                              activeOpacity={0.9}
                              onPress={() => handleOpenPhoto(trabajo.antesImg?.uri || null)}
                              style={{ flex: 1 }}
                            >
                              <Image source={{ uri: trabajo.antesImg.uri }} style={styles.previewImage} resizeMode="contain" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.removeImageBtn, { width: 28, height: 28, top: 4, right: 4 }]}
                              onPress={() => {
                                setTrabajos(prev => prev.map((t, i) => i === index ? { ...t, antesImg: undefined } : t));
                              }}
                            >
                              <Ionicons name="trash" size={16} color="#ffffff" />
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <View style={styles.uploadPlaceholder}>
                            <Ionicons name="camera-outline" size={24} color={themeColors.textSecondary} />
                            <Text style={[styles.placeholderText, { color: themeColors.textSecondary, fontSize: 11 }]}>Sin foto</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
                        <TouchableOpacity onPress={() => handleCapturePhoto('antes', index)} style={[styles.actionBtn, { flex: 1, paddingVertical: 4, backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                          <Ionicons name="camera" size={14} color={themeColors.accent} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleSelectGallery('antes', index)} style={[styles.actionBtn, { flex: 1, paddingVertical: 4, backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                          <Ionicons name="images" size={14} color={themeColors.accent} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Foto Después */}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.photoLabel, { fontSize: 12, color: themeColors.textSecondary }]}>Después</Text>
                      <View style={[styles.imageCard, { height: 120, backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                        {trabajo.despuesImg?.uri ? (
                          <View style={styles.previewContainer}>
                            <TouchableOpacity
                              activeOpacity={0.9}
                              onPress={() => handleOpenPhoto(trabajo.despuesImg?.uri || null)}
                              style={{ flex: 1 }}
                            >
                              <Image source={{ uri: trabajo.despuesImg.uri }} style={styles.previewImage} resizeMode="contain" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.removeImageBtn, { width: 28, height: 28, top: 4, right: 4 }]}
                              onPress={() => {
                                setTrabajos(prev => prev.map((t, i) => i === index ? { ...t, despuesImg: undefined } : t));
                              }}
                            >
                              <Ionicons name="trash" size={16} color="#ffffff" />
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <View style={styles.uploadPlaceholder}>
                            <Ionicons name="checkmark-circle-outline" size={24} color={themeColors.textSecondary} />
                            <Text style={[styles.placeholderText, { color: themeColors.textSecondary, fontSize: 11 }]}>Sin foto</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
                        <TouchableOpacity onPress={() => handleCapturePhoto('despues', index)} style={[styles.actionBtn, { flex: 1, paddingVertical: 4, backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                          <Ionicons name="camera" size={14} color={themeColors.success} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleSelectGallery('despues', index)} style={[styles.actionBtn, { flex: 1, paddingVertical: 4, backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                          <Ionicons name="images" size={14} color={themeColors.success} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* Fotografías Adicionales de este Trabajo (Hasta 250 fotos) */}
                  <View style={{
                    marginTop: Spacing.three,
                    backgroundColor: themeColors.background,
                    borderColor: themeColors.border,
                    borderWidth: 1,
                    borderRadius: BorderRadius.medium,
                    padding: Spacing.two,
                  }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <Text style={{ color: themeColors.text, fontSize: 13, fontWeight: '700' }}>
                        Fotos Adicionales (Trabajo #{index + 1})
                      </Text>
                      <View style={{ 
                        paddingHorizontal: 6, 
                        paddingVertical: 2, 
                        borderRadius: 10, 
                        backgroundColor: (trabajo.fotosAdicionales?.length || 0) >= 250 ? '#EF444420' : themeColors.primary + '20',
                        borderWidth: 1,
                        borderColor: (trabajo.fotosAdicionales?.length || 0) >= 250 ? '#EF4444' : themeColors.primary
                      }}>
                        <Text style={{ 
                          fontSize: 11, 
                          fontWeight: '700', 
                          color: (trabajo.fotosAdicionales?.length || 0) >= 250 ? '#EF4444' : themeColors.primary 
                        }}>
                          {trabajo.fotosAdicionales?.length || 0} / 250 máx
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginBottom: Spacing.one }}>
                      Adjunta fotos adicionales específicas de este trabajo (hasta 250 fotos).
                    </Text>

                    {(trabajo.fotosAdicionales && trabajo.fotosAdicionales.length > 0) ? (
                      <View style={{ marginBottom: Spacing.two }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 4 }}>
                          <TouchableOpacity
                            onPress={() => {
                              Alert.alert(
                                'Eliminar fotos',
                                `¿Estás seguro de que deseas eliminar todas las fotos adicionales del Trabajo #${index + 1}?`,
                                [
                                  { text: 'Cancelar', style: 'cancel' },
                                  {
                                    text: 'Eliminar todas',
                                    style: 'destructive',
                                    onPress: () => {
                                      setTrabajos(prev => prev.map((t, i) => i === index ? { ...t, fotosAdicionales: [] } : t));
                                    }
                                  }
                                ]
                              );
                            }}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2, paddingHorizontal: 4 }}
                          >
                            <Ionicons name="trash-outline" size={13} color={Colors.light.danger} />
                            <Text style={{ fontSize: 11, color: Colors.light.danger, fontWeight: '600' }}>Limpiar ({trabajo.fotosAdicionales.length})</Text>
                          </TouchableOpacity>
                        </View>

                        <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.adicionalesList}>
                          {trabajo.fotosAdicionales.map((item, photoIdx) => (
                            <View key={photoIdx} style={[styles.adicionalCard, { borderColor: themeColors.border }]}>
                              <TouchableOpacity
                                activeOpacity={0.9}
                                onPress={() => handleOpenPhoto(item.uri)}
                                style={{ width: '100%', height: '100%' }}
                              >
                                <Image source={{ uri: item.uri }} style={styles.adicionalImage} />
                              </TouchableOpacity>
                              <View style={styles.adicionalIndexBadge}>
                                <Text style={styles.adicionalIndexText}>#{photoIdx + 1}</Text>
                              </View>
                              <TouchableOpacity
                                style={styles.removeAdicionalBtn}
                                onPress={() => {
                                  setTrabajos(prev => prev.map((t, i) => {
                                    if (i === index) {
                                      return {
                                        ...t,
                                        fotosAdicionales: (t.fotosAdicionales || []).filter((_, pI) => pI !== photoIdx)
                                      };
                                    }
                                    return t;
                                  }));
                                }}
                              >
                                <Ionicons name="trash" size={14} color="#ffffff" />
                              </TouchableOpacity>
                            </View>
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}

                    <View style={styles.actionGrid}>
                      <TouchableOpacity
                        onPress={() => handleCapturePhoto('adicional', index)}
                        disabled={(trabajo.fotosAdicionales?.length || 0) >= 250}
                        style={[
                          styles.actionBtn, 
                          { 
                            backgroundColor: themeColors.backgroundElement, 
                            borderColor: themeColors.border,
                            opacity: (trabajo.fotosAdicionales?.length || 0) >= 250 ? 0.5 : 1
                          }
                        ]}
                      >
                        <Ionicons name="camera" size={16} color={themeColors.accent} />
                        <Text style={[styles.actionBtnText, { color: themeColors.text, fontSize: 12 }]}>Tomar Foto</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleSelectGallery('adicional', index)}
                        disabled={(trabajo.fotosAdicionales?.length || 0) >= 250}
                        style={[
                          styles.actionBtn, 
                          { 
                            backgroundColor: themeColors.backgroundElement, 
                            borderColor: themeColors.border,
                            opacity: (trabajo.fotosAdicionales?.length || 0) >= 250 ? 0.5 : 1
                          }
                        ]}
                      >
                        <Ionicons name="images" size={16} color={themeColors.accent} />
                        <Text style={[styles.actionBtnText, { color: themeColors.text, fontSize: 12 }]}>Galería</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}

              <TouchableOpacity
                onPress={() => {
                  setTrabajos(prev => [...prev, { descripcion: '', materiales: '', solucion: '', fotosAdicionales: [] }]);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: Spacing.two,
                  borderWidth: 1,
                  borderColor: themeColors.accent,
                  borderRadius: BorderRadius.medium,
                  borderStyle: 'dashed',
                  marginBottom: Spacing.four,
                  gap: Spacing.one
                }}
              >
                <Ionicons name="add-circle-outline" size={20} color={themeColors.accent} />
                <Text style={{ color: themeColors.accent, fontWeight: '700', fontSize: 14 }}>Agregar Otro Trabajo</Text>
              </TouchableOpacity>

              <View style={styles.footerNav}>
                <View style={{ flex: 1 }} />
                <CustomButton title="Siguiente" onPress={nextStep} style={styles.navBtn} />
              </View>
            </View>
          )}
      </KeyboardAwareScrollView>

      <ImageViewerModal
        visible={viewerVisible}
        imageUrl={selectedPhoto}
        onClose={() => setViewerVisible(false)}
      />

      {/* Modal de Carga y Progreso (Ruedita de Carga) */}
      <Modal
        visible={loadingModalVisible}
        transparent={true}
        animationType="fade"
        statusBarTranslucent={true}
      >
        <View style={styles.loadingModalBackdrop}>
          <View style={[styles.loadingModalCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <View style={[styles.loadingSpinnerContainer, { backgroundColor: themeColors.primary + '15' }]}>
              <ActivityIndicator size="large" color={themeColors.primary} />
            </View>
            
            <Text style={[styles.loadingModalTitle, { color: themeColors.text }]}>
              {loadingTitle}
            </Text>
            
            <Text style={[styles.loadingModalSubtitle, { color: themeColors.textSecondary }]}>
              {loadingMessage || 'Por favor espera un momento...'}
            </Text>

            {loadingTotal > 0 && (
              <View style={[styles.counterBoxContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                {/* Gran Contador Numérico de Fotos Subidas */}
                <View style={styles.counterStatsRow}>
                  <View style={styles.counterStatCol}>
                    <Text style={[styles.counterBigNumber, { color: themeColors.primary }]}>
                      {loadingCurrent}
                    </Text>
                    <Text style={[styles.counterStatLabel, { color: themeColors.textSecondary }]}>
                      SUBIDAS
                    </Text>
                  </View>

                  <View style={[styles.counterStatDivider, { backgroundColor: themeColors.border }]} />

                  <View style={styles.counterStatCol}>
                    <Text style={[styles.counterBigNumber, { color: themeColors.text }]}>
                      {loadingTotal}
                    </Text>
                    <Text style={[styles.counterStatLabel, { color: themeColors.textSecondary }]}>
                      TOTAL
                    </Text>
                  </View>

                  <View style={[styles.counterStatDivider, { backgroundColor: themeColors.border }]} />

                  <View style={styles.counterStatCol}>
                    <Text style={[styles.counterBigNumber, { color: '#10B981' }]}>
                      {Math.min(100, Math.max(0, Math.round((loadingCurrent / loadingTotal) * 100)))}%
                    </Text>
                    <Text style={[styles.counterStatLabel, { color: themeColors.textSecondary }]}>
                      AVANCE
                    </Text>
                  </View>
                </View>

                {/* Barra de Progreso */}
                <View style={styles.progressContainer}>
                  <View style={[styles.progressBarBg, { backgroundColor: themeColors.border }]}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          backgroundColor: themeColors.primary,
                          width: `${Math.min(100, Math.max(0, Math.round((loadingCurrent / loadingTotal) * 100)))}%`
                        }
                      ]}
                    />
                  </View>
                </View>

                <Text style={[styles.counterRemainingText, { color: themeColors.textSecondary }]}>
                  {loadingCurrent >= loadingTotal
                    ? '✓ ¡Todas las fotos se han procesado!'
                    : `Quedan ${loadingTotal - loadingCurrent} fotos pendientes de subir`}
                </Text>
              </View>
            )}

            <Text style={[styles.loadingNote, { color: themeColors.textSecondary }]}>
              {loadingTitle.includes('Subiendo') || loadingTitle.includes('Guardando')
                ? 'Subiendo fotos a la nube. Por favor mantén la app abierta.' 
                : 'Optimizando imágenes para un rendimiento óptimo.'}
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  backBtn: {
    padding: Spacing.one,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
  stepContainer: {
    marginTop: Spacing.two,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: Spacing.one,
  },
  subtitleText: {
    fontSize: 13,
    marginBottom: Spacing.four,
    lineHeight: 18,
  },
  photoLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: Spacing.one,
  },
  imageCard: {
    width: '100%',
    height: 180,
    borderRadius: BorderRadius.medium,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  uploadPlaceholder: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  placeholderText: {
    fontSize: 13,
    fontWeight: '500',
  },
  previewContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  removeImageBtn: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionGrid: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: Spacing.one,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    gap: Spacing.one,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  footerNav: {
    flexDirection: 'row',
    marginTop: Spacing.five,
  },
  navBtn: {
    width: 120,
  },
  analyzingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.four,
    gap: Spacing.two,
    padding: Spacing.three,
  },
  analyzingText: {
    fontSize: 13,
    fontWeight: '600',
  },
  reportPreviewCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    padding: Spacing.three,
    marginBottom: Spacing.four,
  },
  reportPreviewText: {
    fontSize: 13,
    lineHeight: 20,
  },
  adicionalesList: {
    flexDirection: 'row',
    marginBottom: Spacing.two,
  },
  adicionalCard: {
    width: 100,
    height: 100,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    overflow: 'hidden',
    marginRight: Spacing.two,
    position: 'relative',
    backgroundColor: '#000',
  },
  adicionalImage: {
    width: '100%',
    height: '100%',
  },
  removeAdicionalBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  actionColumn: {
    marginTop: Spacing.two,
    marginBottom: Spacing.two,
  },
  customDropdownContainer: {
    width: '100%',
  },
  dropdownLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: Spacing.one,
  },
  dropdownTrigger: {
    // inline styled mostly
  },
  dropdownList: {
    // inline styled mostly
  },
  dropdownItem: {
    // inline styled mostly
  },
  adicionalIndexBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  adicionalIndexText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  loadingModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  loadingModalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    padding: Spacing.five,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  loadingSpinnerContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  loadingModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: Spacing.one,
  },
  loadingModalSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: Spacing.three,
    lineHeight: 18,
  },
  counterBoxContainer: {
    width: '100%',
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    padding: Spacing.three,
    marginBottom: Spacing.three,
    alignItems: 'center',
  },
  counterStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: Spacing.three,
  },
  counterStatCol: {
    alignItems: 'center',
    flex: 1,
  },
  counterBigNumber: {
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 2,
  },
  counterStatLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  counterStatDivider: {
    width: 1,
    height: 28,
  },
  counterRemainingText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: Spacing.one,
  },
  progressContainer: {
    width: '100%',
    marginBottom: Spacing.one,
  },
  progressBarBg: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: Spacing.one,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressCountText: {
    fontSize: 12,
    fontWeight: '500',
  },
  progressPercentText: {
    fontSize: 12,
    fontWeight: '700',
  },
  loadingNote: {
    fontSize: 11,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: Spacing.one,
  },
});
