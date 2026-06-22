import React, { useRef } from 'react';
import {
  Modal,
  View,
  Image,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  Dimensions,
  Text,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

interface AsistenciaInfo {
  fecha: string;
  hora: string;
  direccion: string;
  lat: number;
  lng: number;
  empleadoNombre: string;
  tipo: 'Entrada' | 'Salida';
}

interface ImageViewerModalProps {
  visible: boolean;
  imageUrl: string | null;
  onClose: () => void;
  asistenciaInfo?: AsistenciaInfo | null;
}

const getStaticMapUrl = (lat: number, lng: number) => {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=16&size=200x200&maptype=mapnik&markers=${lat},${lng},red-pushpin`;
  }
  return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=16&size=200x200&markers=color:red%7C${lat},${lng}&key=${apiKey}`;
};

const formatFecha = (fechaStr: string) => {
  const parts = fechaStr.split('-');
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return fechaStr;
};

export default function ImageViewerModal({
  visible,
  imageUrl,
  onClose,
  asistenciaInfo,
}: ImageViewerModalProps) {
  const viewRef = useRef<View>(null);
  const [mapUrl, setMapUrl] = React.useState<string>('');

  React.useEffect(() => {
    if (asistenciaInfo) {
      setMapUrl(getStaticMapUrl(asistenciaInfo.lat, asistenciaInfo.lng));
    }
  }, [asistenciaInfo]);

  if (!imageUrl) return null;

  const handleShare = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Compartir', 'La función de compartir está disponible en dispositivos móviles.');
      return;
    }
    try {
      // Capturar el contenedor de la imagen + marca de agua
      const uri = await captureRef(viewRef, {
        format: 'jpg',
        quality: 0.9,
      });

      // Compartir el archivo generado
      await Sharing.shareAsync(uri, {
        dialogTitle: 'Compartir Registro de Asistencia',
        mimeType: 'image/jpeg',
      });
    } catch (err: any) {
      Alert.alert('Error', 'No se pudo generar la imagen con marca de agua: ' + err.message);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.overlay}>
        {/* Botón de cierre */}
        <TouchableOpacity 
          style={styles.closeButton} 
          onPress={onClose} 
          activeOpacity={0.7}
          testID="close-image-viewer"
        >
          <Ionicons name="close-circle" size={38} color="#ffffff" />
        </TouchableOpacity>

        {/* Botón de compartir con marca de agua */}
        {asistenciaInfo && (
          <TouchableOpacity 
            style={styles.shareButton} 
            onPress={handleShare} 
            activeOpacity={0.7}
          >
            <Ionicons name="share-social-outline" size={20} color="#000000" />
            <Text style={styles.shareButtonText}>Compartir con Marca</Text>
          </TouchableOpacity>
        )}

        {/* Imagen a pantalla completa */}
        <View style={styles.imageContainer}>
          {asistenciaInfo ? (
            <View 
              ref={viewRef} 
              style={styles.captureContainer}
              collapsable={false}
            >
              <Image
                source={{ uri: imageUrl }}
                style={styles.image}
                resizeMode="cover"
              />
              <View style={styles.watermarkOverlay}>
                {/* Info Izquierda */}
                <View style={styles.watermarkLeftCol}>
                  <View style={styles.watermarkTimeDateRow}>
                    <Text style={styles.watermarkTimeText}>
                      {asistenciaInfo.hora.substring(0, 5)}
                    </Text>
                    <View style={styles.watermarkVerticalLine} />
                    <View style={styles.watermarkDateCol}>
                      <Text style={styles.watermarkDateText}>
                        {formatFecha(asistenciaInfo.fecha)}
                      </Text>
                      <Text style={styles.watermarkDayText}>
                        {asistenciaInfo.tipo.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.watermarkAddressText} numberOfLines={3}>
                    {asistenciaInfo.direccion}
                  </Text>
                  <Text style={styles.watermarkEmployeeText}>
                    👤 {asistenciaInfo.empleadoNombre}
                  </Text>
                </View>

                {/* Mapa Derecha */}
                <View style={styles.watermarkMapContainer}>
                  <Image
                    source={{
                      uri: mapUrl,
                      headers: {
                        'User-Agent': 'PortalInttec/1.0 (soporte@inttec.net)',
                      },
                    }}
                    onError={() => {
                      if (asistenciaInfo) {
                        setMapUrl(`https://staticmap.openstreetmap.de/staticmap.php?center=${asistenciaInfo.lat},${asistenciaInfo.lng}&zoom=16&size=200x200&maptype=mapnik&markers=${asistenciaInfo.lat},${asistenciaInfo.lng},red-pushpin`);
                      }
                    }}
                    style={styles.watermarkMap}
                    resizeMode="cover"
                  />
                </View>
              </View>
            </View>
          ) : (
            <Image
              source={{ uri: imageUrl }}
              style={styles.fullImage}
              resizeMode="contain"
            />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
  },
  closeButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 25,
    left: 20,
    zIndex: 999,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
  },
  shareButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 25,
    right: 20,
    zIndex: 999,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffc107',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
  },
  shareButtonText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '800',
  },
  imageContainer: {
    width: '100%',
    height: '80%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureContainer: {
    width: width * 0.92,
    height: height * 0.72,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fullImage: {
    width: width,
    height: '100%',
    maxWidth: Platform.OS === 'web' ? 800 : undefined,
  },
  watermarkOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 8,
  },
  watermarkLeftCol: {
    flex: 1,
    gap: 4,
  },
  watermarkTimeDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  watermarkTimeText: {
    color: '#fff',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1,
  },
  watermarkVerticalLine: {
    width: 2,
    height: 32,
    backgroundColor: '#ffc107',
    marginHorizontal: 8,
  },
  watermarkDateCol: {
    justifyContent: 'center',
  },
  watermarkDateText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  watermarkDayText: {
    color: '#ffc107',
    fontSize: 10,
    fontWeight: '900',
  },
  watermarkAddressText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  watermarkEmployeeText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 1,
  },
  watermarkMapContainer: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#fff',
    backgroundColor: '#eee',
  },
  watermarkMap: {
    width: '100%',
    height: '100%',
  },
});
