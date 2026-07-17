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
import { supabase, AuthService, Usuario } from '@/services/supabase';
import { GeminiService } from '@/services/gemini';
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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Paso 1: Evidencia Fotográfica
  const [imageUriAntes, setImageUriAntes] = useState<string | null>(null);
  const [imageBase64Antes, setImageBase64Antes] = useState<string | null>(null);
  const [imageUriDespues, setImageUriDespues] = useState<string | null>(null);
  const [imageBase64Despues, setImageBase64Despues] = useState<string | null>(null);
  const [fotosAdicionales, setFotosAdicionales] = useState<{ uri: string; base64: string | null }[]>([]);

  // Paso 2: Detalles del Trabajo
  const [cliente, setCliente] = useState('');
  const [trabajos, setTrabajos] = useState<{ descripcion: string; materiales: string; solucion: string }[]>([
    { descripcion: '', materiales: '', solucion: '' }
  ]);

  // Paso 3: Reporte IA y Exportación
  const [resumenIA, setResumenIA] = useState<string | null>(null);

  // Modal de imagen a pantalla completa
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [viewerVisible, setViewerVisible] = useState(false);

  const handleOpenPhoto = (uri: string | null) => {
    if (uri) {
      setSelectedPhoto(uri);
      setViewerVisible(true);
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

  const handleCapturePhoto = async (type: 'antes' | 'despues' | 'adicional') => {
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
        if (type === 'antes') {
          setImageUriAntes(result.assets[0].uri);
          setImageBase64Antes(result.assets[0].base64 || null);
        } else if (type === 'despues') {
          setImageUriDespues(result.assets[0].uri);
          setImageBase64Despues(result.assets[0].base64 || null);
        } else if (type === 'adicional') {
          setFotosAdicionales((prev) => [
            ...prev,
            { uri: result.assets[0].uri, base64: result.assets[0].base64 || null },
          ]);
        }
      }
    } catch (err) {
      console.error('Camera capture error:', err);
      if (Platform.OS === 'web') {
        await handleSelectGallery(type);
      } else {
        Alert.alert('Error', 'No se pudo abrir la cámara.');
      }
    }
  };

  const handleSelectGallery = async (type: 'antes' | 'despues' | 'adicional') => {
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
        if (type === 'antes') {
          setImageUriAntes(result.assets[0].uri);
          setImageBase64Antes(result.assets[0].base64 || null);
        } else if (type === 'despues') {
          setImageUriDespues(result.assets[0].uri);
          setImageBase64Despues(result.assets[0].base64 || null);
        } else if (type === 'adicional') {
          const newPhotos = result.assets.map((asset) => ({
            uri: asset.uri,
            base64: asset.base64 || null,
          }));
          setFotosAdicionales((prev) => [...prev, ...newPhotos]);
        }
      }
    } catch (err) {
      console.error('Gallery select error:', err);
      Alert.alert('Error', 'No se pudo abrir la galería.');
    }
  };

  const generateAIAnalysis = async () => {
    if (!cliente.trim()) {
      Alert.alert('Validación', 'Por favor llena el nombre del cliente.');
      return;
    }

    const hasEmptyFields = trabajos.some(t => !t.descripcion.trim() || !t.solucion.trim());
    if (hasEmptyFields) {
      Alert.alert('Validación', 'Por favor llena la descripción y la solución para todos los trabajos.');
      return;
    }

    setIsAnalyzing(true);
    try {
      const responseText = await GeminiService.generateTechnicalSummary(
        imageBase64Antes,
        imageBase64Despues,
        {
          cliente: cliente.trim(),
          descripcion_trabajo: '',
          trabajos: trabajos.map(t => ({
            descripcion: t.descripcion.trim(),
            materiales: t.materiales.trim() || null,
            solucion: t.solucion.trim() || null,
          }))
        }
      );
      setResumenIA(responseText);
      setCurrentStep(3);
    } catch (err: any) {
      Alert.alert('Error de IA', err.message || 'No se pudo generar el análisis formal.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleExportPDF = async () => {
    if (!resumenIA) return;
    try {
      const allMateriales = trabajos
        .map(t => t.materiales.trim())
        .filter(Boolean)
        .join(', ');
      
      const allSoluciones = trabajos
        .map((t, i) => t.solucion.trim() ? `Trabajo #${i + 1}: ${t.solucion.trim()}` : '')
        .filter(Boolean)
        .join('\n');

      const evData = {
        empleado_id: currentUser?.id || '',
        cliente: cliente.trim(),
        descripcion_trabajo: JSON.stringify(trabajos.map(t => ({
          descripcion: t.descripcion.trim(),
          materiales: t.materiales.trim() || null,
          solucion: t.solucion.trim() || null,
        }))),
        materiales_usados: allMateriales || null,
        observaciones: allSoluciones || null,
        resumen_ia: resumenIA,
      };

      const extraPhotos = fotosAdicionales.map((f) => f.base64 || f.uri);

      await EvidenceReportGenerator.exportToPDF(
        evData,
        imageBase64Antes,
        imageBase64Despues,
        currentUser?.nombre || 'Técnico Autorizado',
        extraPhotos
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo exportar el PDF.');
    }
  };

  const handleSaveToDatabase = async () => {
    if (!currentUser) return;
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

      if (imageBase64Antes) {
        fotoAntesUrl = await uploadPhoto(imageBase64Antes, 'antes');
      }
      if (imageBase64Despues) {
        fotoDespuesUrl = await uploadPhoto(imageBase64Despues, 'despues');
      }

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

      const { error: dbError } = await supabase.from('evidencias').insert([
        {
          empleado_id: currentUser.id,
          empleado_nombre: currentUser.nombre,
          cliente: cliente.trim(),
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
          resumen_ia: resumenIA,
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
      if (!imageUriAntes && !imageUriDespues) {
        Alert.alert('Evidencia requerida', 'Por favor proporciona al menos una foto (antes o después).');
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
            steps={['Fotos', 'Información', 'Reporte IA']}
          />

          {/* PASO 1: Captura de Fotos */}
          {currentStep === 1 && (
            <View style={styles.stepContainer}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                1. Captura de Fotografías
              </Text>
              <Text style={[styles.subtitleText, { color: themeColors.textSecondary }]}>
                Sube una foto del estado inicial (antes) y otra del estado final (después).
              </Text>

              {/* Foto Antes */}
              <Text style={[styles.photoLabel, { color: themeColors.text }]}>Estado Inicial (Antes)</Text>
              <View style={[styles.imageCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                {imageUriAntes ? (
                  <View style={styles.previewContainer}>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => handleOpenPhoto(imageUriAntes)}
                      style={{ flex: 1 }}
                    >
                      <Image source={{ uri: imageUriAntes }} style={styles.previewImage} resizeMode="contain" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.removeImageBtn}
                      onPress={() => {
                        setImageUriAntes(null);
                        setImageBase64Antes(null);
                      }}
                    >
                      <Ionicons name="trash" size={20} color="#ffffff" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.uploadPlaceholder}>
                    <Ionicons name="camera-outline" size={48} color={themeColors.textSecondary} />
                    <Text style={[styles.placeholderText, { color: themeColors.textSecondary }]}>
                      Sin foto del antes
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.actionGrid}>
                <TouchableOpacity
                  onPress={() => handleCapturePhoto('antes')}
                  style={[styles.actionBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                >
                  <Ionicons name="camera" size={20} color={themeColors.accent} />
                  <Text style={[styles.actionBtnText, { color: themeColors.text }]}>Cámara</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleSelectGallery('antes')}
                  style={[styles.actionBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                >
                  <Ionicons name="images" size={20} color={themeColors.accent} />
                  <Text style={[styles.actionBtnText, { color: themeColors.text }]}>Galería</Text>
                </TouchableOpacity>
              </View>

              {/* Foto Después */}
              <Text style={[styles.photoLabel, { color: themeColors.text, marginTop: Spacing.four }]}>Estado Final (Después)</Text>
              <View style={[styles.imageCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                {imageUriDespues ? (
                  <View style={styles.previewContainer}>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => handleOpenPhoto(imageUriDespues)}
                      style={{ flex: 1 }}
                    >
                      <Image source={{ uri: imageUriDespues }} style={styles.previewImage} resizeMode="contain" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.removeImageBtn}
                      onPress={() => {
                        setImageUriDespues(null);
                        setImageBase64Despues(null);
                      }}
                    >
                      <Ionicons name="trash" size={20} color="#ffffff" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.uploadPlaceholder}>
                    <Ionicons name="checkmark-circle-outline" size={48} color={themeColors.textSecondary} />
                    <Text style={[styles.placeholderText, { color: themeColors.textSecondary }]}>
                      Sin foto del después
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.actionGrid}>
                <TouchableOpacity
                  onPress={() => handleCapturePhoto('despues')}
                  style={[styles.actionBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                >
                  <Ionicons name="camera" size={20} color={themeColors.success} />
                  <Text style={[styles.actionBtnText, { color: themeColors.text }]}>Cámara</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleSelectGallery('despues')}
                  style={[styles.actionBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                >
                  <Ionicons name="images" size={20} color={themeColors.success} />
                  <Text style={[styles.actionBtnText, { color: themeColors.text }]}>Galería</Text>
                </TouchableOpacity>
              </View>

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

              <View style={styles.footerNav}>
                <View style={{ flex: 1 }} />
                <CustomButton title="Siguiente" onPress={nextStep} style={styles.navBtn} />
              </View>
            </View>
          )}

          {/* PASO 2: Información del Servicio */}
          {currentStep === 2 && (
            <View style={styles.stepContainer}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                2. Detalles de la Intervención
              </Text>
              <Text style={[styles.subtitleText, { color: themeColors.textSecondary }]}>
                Proporciona los datos del cliente y describe los trabajos o arreglos que realizaste.
              </Text>

              <CustomInput
                label="Cliente / Ubicación *"
                placeholder="Nombre del cliente o sucursal"
                value={cliente}
                onChangeText={setCliente}
                iconName="business-outline"
              />

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
                    label="Descripción del Trabajo *"
                    placeholder="Ej. Cambio de cableado eléctrico, mantenimiento de bomba, etc."
                    value={trabajo.descripcion}
                    onChangeText={(val) => {
                      setTrabajos(prev => prev.map((t, i) => i === index ? { ...t, descripcion: val } : t));
                    }}
                    multiline
                    numberOfLines={3}
                    style={{ height: 70 }}
                    iconName="construct-outline"
                  />

                  <CustomInput
                    label="Materiales Utilizados"
                    placeholder="Ej. 2 metros cable UTP, 4 conectores RJ45..."
                    value={trabajo.materiales}
                    onChangeText={(val) => {
                      setTrabajos(prev => prev.map((t, i) => i === index ? { ...t, materiales: val } : t));
                    }}
                    multiline
                    numberOfLines={2}
                    style={{ height: 50 }}
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
                    style={{ height: 50 }}
                    iconName="checkmark-circle-outline"
                  />
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

              {isAnalyzing ? (
                <View style={styles.analyzingContainer}>
                  <ActivityIndicator size="small" color={themeColors.accent} />
                  <Text style={[styles.analyzingText, { color: themeColors.text }]}>
                    Gemini AI analizando fotos y redactando reporte...
                  </Text>
                </View>
              ) : (
                <CustomButton
                  title="GENERAR REPORTE CON IA"
                  onPress={generateAIAnalysis}
                  variant="success"
                  style={{ marginTop: Spacing.four }}
                />
              )}

              <View style={styles.footerNav}>
                <CustomButton title="Atrás" onPress={prevStep} variant="secondary" style={styles.navBtn} />
                <View style={{ flex: 1 }} />
              </View>
            </View>
          )}

          {/* PASO 3: Visualización del Reporte y Exportar */}
          {currentStep === 3 && (
            <View style={styles.stepContainer}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                3. Reporte Técnico de la IA
              </Text>
              <Text style={[styles.subtitleText, { color: themeColors.textSecondary }]}>
                Este reporte formal fue redactado por Gemini AI analizando las fotos del antes/después y los detalles.
              </Text>

              <View style={[styles.reportPreviewCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                <ScrollView nestedScrollEnabled style={{ maxHeight: 300 }}>
                  <Text style={[styles.reportPreviewText, { color: themeColors.text }]}>
                    {resumenIA}
                  </Text>
                </ScrollView>
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
});
