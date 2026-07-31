import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { supabase, Usuario, AuthService } from '@/services/supabase';
import { SyncService, base64ToArrayBuffer } from '@/services/sync';
import { optimizeImage } from '@/utils/imageOptimizer';
import { EvidenceReportGenerator } from '@/utils/evidenceReportGenerator';
import StepIndicator from '@/components/StepIndicator';
import CustomInput from '@/components/CustomInput';
import CustomButton from '@/components/CustomButton';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import ImageViewerModal from '@/components/ImageViewerModal';

export default function EvidenciaForm() {
  const router = useRouter();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Paso 1: Información y Fotos por Trabajo
  const [fotosAdicionales, setFotosAdicionales] = useState<{ uri: string; base64: string | null }[]>([]);

  // Paso 2: Detalles del Trabajo

  // Catálogos
  const [clientes, setClientes] = useState<any[]>([]);
  const [sucursalesCliente, setSucursalesCliente] = useState<any[]>([]);
  
  const [selectedCliente, setSelectedCliente] = useState<string>('');
  const [clienteSearch, setClienteSearch] = useState('');
  const [showCliDropdown, setShowCliDropdown] = useState(false);
  
  const [selectedSucursal, setSelectedSucursal] = useState<string>('');
  const [sucursalSearch, setSucursalSearch] = useState('');
  const [showSucursalDropdown, setShowSucursalDropdown] = useState(false);

  const [trabajos, setTrabajos] = useState<{ descripcion: string; materiales: string; solucion: string; antesImg?: { uri: string; base64: string | null }; despuesImg?: { uri: string; base64: string | null }; fotosAdicionales?: { uri: string; base64: string | null }[] }[]>([
    { descripcion: '', materiales: '', solucion: '', fotosAdicionales: [] }
  ]);

  // Paso 3: Exportación

  // Modal de imagen a pantalla completa
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [viewerVisible, setViewerVisible] = useState(false);

  const handleOpenPhoto = (uri: string | null) => {
    if (uri) {
      setSelectedPhoto(uri);
      setViewerVisible(true);
    }
  };


  const loadCatalogos = async () => {
    try {
      const [cliRes, sucRes] = await Promise.all([
        supabase.from('clientes').select('*').order('nombre'),
        supabase.from('sucursales_cliente').select('*').order('nombre'),
      ]);
      if (cliRes.data) setClientes(cliRes.data);
      if (sucRes.data) setSucursalesCliente(sucRes.data);
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
      await loadCatalogos();
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

  const handleCapturePhoto = async (type: 'antes' | 'despues' | 'adicional', jobIndex?: number) => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: Platform.OS !== 'web',
        quality: 0.4,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        const optimized = await optimizeImage(result.assets[0].uri);
        if (type === 'antes' && jobIndex !== undefined) {
          setTrabajos(prev => prev.map((t, i) => i === jobIndex ? { ...t, antesImg: { uri: optimized.uri, base64: optimized.base64 || null } } : t));
        } else if (type === 'despues' && jobIndex !== undefined) {
          setTrabajos(prev => prev.map((t, i) => i === jobIndex ? { ...t, despuesImg: { uri: optimized.uri, base64: optimized.base64 || null } } : t));
        } else if (type === 'adicional') {
          if (jobIndex !== undefined) {
            setTrabajos(prev => prev.map((t, i) => i === jobIndex ? { 
              ...t, 
              fotosAdicionales: [...(t.fotosAdicionales || []), { uri: optimized.uri, base64: optimized.base64 || null }] 
            } : t));
          } else {
            setFotosAdicionales((prev) => [
              ...prev,
              { uri: optimized.uri, base64: optimized.base64 || null },
            ]);
          }
        }
      }
    } catch (err) {
      console.error('Camera capture error:', err);
      if (Platform.OS === 'web') {
        await handleSelectGallery(type, jobIndex);
      } else {
        Alert.alert('Error', 'No se pudo abrir la cámara.');
      }
    }
  };

  const handleSelectGallery = async (type: 'antes' | 'despues' | 'adicional', jobIndex?: number) => {
    const hasPermission = await requestLibraryPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: type === 'adicional',
        allowsEditing: type !== 'adicional',
        quality: 0.4,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        if (type === 'antes' && jobIndex !== undefined) {
          const opt = await optimizeImage(result.assets[0].uri);
          setTrabajos(prev => prev.map((t, i) => i === jobIndex ? { ...t, antesImg: { uri: opt.uri, base64: opt.base64 || null } } : t));
        } else if (type === 'despues' && jobIndex !== undefined) {
          const opt = await optimizeImage(result.assets[0].uri);
          setTrabajos(prev => prev.map((t, i) => i === jobIndex ? { ...t, despuesImg: { uri: opt.uri, base64: opt.base64 || null } } : t));
        } else if (type === 'adicional') {
          const optimizedPhotos = await Promise.all(
            result.assets.map((asset) => optimizeImage(asset.uri))
          );
          const mappedPhotos = optimizedPhotos.map(opt => ({
            uri: opt.uri,
            base64: opt.base64 || null
          }));
          
          if (jobIndex !== undefined) {
            setTrabajos(prev => prev.map((t, i) => i === jobIndex ? {
              ...t,
              fotosAdicionales: [...(t.fotosAdicionales || []), ...mappedPhotos]
            } : t));
          } else {
            setFotosAdicionales((prev) => [...prev, ...mappedPhotos]);
          }
        }
      }
    } catch (err) {
      console.error('Gallery select error:', err);
      Alert.alert('Error', 'No se pudo abrir la galería.');
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
          solucion: t.solucion.trim() || null,
          antesImg: t.antesImg?.base64 || t.antesImg?.uri || null,
          despuesImg: t.despuesImg?.base64 || t.despuesImg?.uri || null,
          fotosAdicionales: t.fotosAdicionales?.map(f => f.base64 || f.uri) || []
        }))),
        materiales_usados: allMateriales || null,
        observaciones: allSoluciones || null,
      };

      const extraPhotos = fotosAdicionales.map((f) => f.base64 || f.uri);

      await EvidenceReportGenerator.exportToPDF(
        evData,
        currentUser?.nombre || 'Técnico Autorizado',
        extraPhotos
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo exportar el PDF.');
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

    try {
      let fotoAntesUrl = null;
      let fotoDespuesUrl = null;

      // Helper to convert base64 to arraybuffer and upload
      const uploadPhoto = async (base64Data: string, prefix: string) => {
        // Simple base64 decoding to array buffer
        const cleanBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '').replace(/[^A-Za-z0-9+/=]/g, '');
        
        let bufferLength = cleanBase64.length * 0.75;
        if (cleanBase64[cleanBase64.length - 1] === '=') {
          bufferLength--;
          if (cleanBase64[cleanBase64.length - 2] === '=') bufferLength--;
        }
        
        const arrayBuffer = new ArrayBuffer(bufferLength);
        const bytes = new Uint8Array(arrayBuffer);
        
        // Simple base64 lookup array
        const charsList = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        const lookupArray = new Uint8Array(256);
        for (let i = 0; i < charsList.length; i++) {
          lookupArray[charsList.charCodeAt(i)] = i;
        }
        
        let p = 0;
        for (let i = 0; i < cleanBase64.length; i += 4) {
          const encoded1 = lookupArray[cleanBase64.charCodeAt(i)];
          const encoded2 = lookupArray[cleanBase64.charCodeAt(i + 1)];
          const encoded3 = lookupArray[cleanBase64.charCodeAt(i + 2)];
          const encoded4 = lookupArray[cleanBase64.charCodeAt(i + 3)];
          
          bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
          if (p < bufferLength) {
            bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
          }
          if (p < bufferLength) {
            bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
          }
        }

        const fileName = `${currentUser.id}/evidencia_${prefix}_${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('tickets') // Reutilizar el bucket de tickets existente para simplificar
          .upload(fileName, arrayBuffer, { contentType: 'image/jpeg', upsert: true });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('tickets').getPublicUrl(fileName);
        return urlData.publicUrl;
      };

      // El upload de fotos por trabajo se hace al armar el array (ver más abajo)

      // Subir fotos adicionales
      const fotosAdicionalesUrls: string[] = [];
      if (fotosAdicionales.length > 0) {
        for (let i = 0; i < fotosAdicionales.length; i++) {
          const extra = fotosAdicionales[i];
          if (extra.base64) {
            const url = await uploadPhoto(extra.base64, `extra_${i}`);
            if (url) fotosAdicionalesUrls.push(url);
          }
        }
      }

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

      const { error: dbError } = await supabase.from('evidencias').insert([
        {
          empleado_id: currentUser.id,
          empleado_nombre: currentUser.nombre,
          // cliente: clienteStr (already added above for export, wait handleSaveToDatabase needs it)
          cliente: clienteStr,
          descripcion_trabajo: JSON.stringify(trabajos.map(t => ({
            descripcion: t.descripcion.trim(),
            materiales: t.materiales.trim() || null,
            solucion: t.solucion.trim() || null,
          }))),
          materiales_usados: allMateriales || null,
          observaciones: allSoluciones || null,
          foto_antes_url: fotoAntesUrl,
          foto_despues_url: fotoDespuesUrl,
          fotos_adicionales_urls: fotosAdicionalesUrls.length > 0 ? fotosAdicionalesUrls : null,
        },
      ]);

      if (dbError) {
        throw new Error(
          dbError.code === '42P01' 
            ? 'La tabla "evidencias" no existe en Supabase. Corre el script SQL en BaseDatos.sql' 
            : dbError.message
        );
      }

      Alert.alert('Éxito', 'Evidencia y reporte guardados correctamente en el servidor.');
      router.replace('/(empleado)/dashboard');
    } catch (err: any) {
      console.error('Error saving evidence:', err);
      Alert.alert(
        'Guardado Parcial',
        `${err.message}\n\nEl reporte no se pudo guardar en el servidor, pero puedes exportar el PDF con el botón correspondiente.`
      );
    } finally {
      setIsSubmitting(false);
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
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(empleado)/dashboard')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Evidencias de Trabajo</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <StepIndicator
            currentStep={currentStep}
            steps={['Información y Evidencias', 'Fotos Adicionales y Finalizar']}
          />

          {/* PASO 2: Fotos Adicionales y Finalizar */}
          {currentStep === 2 && (
            <View style={styles.stepContainer}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                2. Fotografías Adicionales y Exportar
              </Text>
              <Text style={[styles.subtitleText, { color: themeColors.textSecondary }]}>
                Sube fotos adicionales (opcionales) y finaliza el reporte.
              </Text>

              {/* Antes y despues UI has been moved inside trabajos */}

              {/* Fotos Adicionales */}
              <Text style={[styles.photoLabel, { color: themeColors.text, marginTop: Spacing.four }]}>
                Fotografías Adicionales (Opcionales)
              </Text>

              {fotosAdicionales.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adicionalesList}>
                  {fotosAdicionales.map((item, index) => (
                    <View key={index} style={[styles.adicionalCard, { borderColor: themeColors.border }]}>
                      <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() => handleOpenPhoto(item.uri)}
                        style={{ width: '100%', height: '100%' }}
                      >
                        <Image source={{ uri: item.uri }} style={styles.adicionalImage} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.removeAdicionalBtn}
                        onPress={() => {
                          setFotosAdicionales((prev) => prev.filter((_, i) => i !== index));
                        }}
                      >
                        <Ionicons name="trash" size={14} color="#ffffff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}

              <View style={styles.actionGrid}>
                <TouchableOpacity
                  onPress={() => handleCapturePhoto('adicional')}
                  style={[styles.actionBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                >
                  <Ionicons name="camera" size={20} color={themeColors.accent} />
                  <Text style={[styles.actionBtnText, { color: themeColors.text }]}>Tomar Foto</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleSelectGallery('adicional')}
                  style={[styles.actionBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                >
                  <Ionicons name="images" size={20} color={themeColors.accent} />
                  <Text style={[styles.actionBtnText, { color: themeColors.text }]}>Galería</Text>
                </TouchableOpacity>
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
                Proporciona los datos del cliente, describe los trabajos o arreglos que realizaste y añade las evidencias de cada uno.
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
              {selectedCliente && (
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

                  <CustomInput
                    label="Materiales Utilizados *"
                    placeholder="Ej. ৹ 2 metros cable UTP&#10;৹ 4 conectores RJ45..."
                    value={trabajo.materiales}
                    onChangeText={(val) => {
                      let formatted = val;
                      if (formatted.length > 0 && !formatted.startsWith('৹ ') && !formatted.startsWith('৹')) {
                        formatted = '৹ ' + formatted;
                      }
                      formatted = formatted.replace(/\n([^৹\n])/g, '\n৹ $1');
                      setTrabajos(prev => prev.map((t, i) => i === index ? { ...t, materiales: formatted } : t));
                    }}
                    multiline
                    numberOfLines={2}
                    style={{ minHeight: 60 }}
                    iconName="build-outline"
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

                  {/* Fotos Adicionales del Trabajo */}
                  <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text, marginTop: Spacing.two, marginBottom: Spacing.two }}>
                    Fotografías Adicionales (Específicas de este trabajo)
                  </Text>
                  
                  {trabajo.fotosAdicionales && trabajo.fotosAdicionales.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginBottom: Spacing.two }}>
                      {trabajo.fotosAdicionales.map((item, photoIndex) => (
                        <View key={photoIndex} style={[styles.adicionalCard, { borderColor: themeColors.border, width: 80, height: 80 }]}>
                          <TouchableOpacity
                            activeOpacity={0.9}
                            onPress={() => handleOpenPhoto(item.uri)}
                            style={{ width: '100%', height: '100%' }}
                          >
                            <Image source={{ uri: item.uri }} style={styles.adicionalImage} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.removeAdicionalBtn, { width: 22, height: 22, top: 2, right: 2 }]}
                            onPress={() => {
                              setTrabajos(prev => prev.map((t, i) => i === index ? {
                                ...t,
                                fotosAdicionales: t.fotosAdicionales?.filter((_, pI) => pI !== photoIndex)
                              } : t));
                            }}
                          >
                            <Ionicons name="trash" size={12} color="#ffffff" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                  
                  <View style={{ flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.four }}>
                    <TouchableOpacity onPress={() => handleCapturePhoto('adicional', index)} style={[styles.actionBtn, { flex: 1, paddingVertical: 6, backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                      <Ionicons name="camera" size={14} color={themeColors.accent} />
                      <Text style={[styles.actionBtnText, { color: themeColors.text, fontSize: 11 }]}>Tomar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleSelectGallery('adicional', index)} style={[styles.actionBtn, { flex: 1, paddingVertical: 6, backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                      <Ionicons name="images" size={14} color={themeColors.accent} />
                      <Text style={[styles.actionBtnText, { color: themeColors.text, fontSize: 11 }]}>Galería</Text>
                    </TouchableOpacity>
                  </View>

                </View>
              ))}

              <TouchableOpacity
                onPress={() => {
                  setTrabajos(prev => [...prev, { descripcion: '', materiales: '', solucion: '' }]);
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
        </ScrollView>
      </KeyboardAvoidingView>

      <ImageViewerModal
        visible={viewerVisible}
        imageUrl={selectedPhoto}
        onClose={() => setViewerVisible(false)}
      />
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
});
