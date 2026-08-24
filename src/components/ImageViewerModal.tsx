import React, { useRef, useState, useEffect } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  Dimensions,
  Text,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import ZoomableView, { ZoomableViewRef } from './ZoomableView';

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
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyDgvQcdXQYx8uSGNJJ4wENAGkIVbDIaUXc";
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
  const zoomRef = useRef<ZoomableViewRef>(null);

  const [currentZoomScale, setCurrentZoomScale] = useState(1);
  const [currentRotation, setCurrentRotation] = useState(0);

  const [prevAsistenciaInfo, setPrevAsistenciaInfo] = useState(asistenciaInfo);
  const [mapUrl, setMapUrl] = useState<string>(() =>
    asistenciaInfo ? getStaticMapUrl(asistenciaInfo.lat, asistenciaInfo.lng) : ''
  );

  if (asistenciaInfo !== prevAsistenciaInfo) {
    setPrevAsistenciaInfo(asistenciaInfo);
    setMapUrl(asistenciaInfo ? getStaticMapUrl(asistenciaInfo.lat, asistenciaInfo.lng) : '');
  }

  // Reset zoom on open/close
  useEffect(() => {
    if (visible) {
      setCurrentZoomScale(1);
      setCurrentRotation(0);
      zoomRef.current?.reset();
    }
  }, [visible, imageUrl]);

  // Keyboard shortcuts for web
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        zoomRef.current?.zoomIn(0.5);
      } else if (e.key === '-' || e.key === '_') {
        zoomRef.current?.zoomOut(0.5);
      } else if (e.key === '0') {
        zoomRef.current?.reset();
      } else if (e.key === 'r' || e.key === 'R') {
        zoomRef.current?.rotate(90);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, onClose]);

  if (!imageUrl) return null;

  const handleOpenOriginal = () => {
    if (Platform.OS === 'web') {
      window.open(imageUrl, '_blank');
    } else {
      Linking.openURL(imageUrl).catch(() => {
        Alert.alert('Error', 'No se pudo abrir el enlace de la imagen.');
      });
    }
  };

  const handleShare = async () => {
    if (Platform.OS === 'web') {
      if (!asistenciaInfo) return;
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('No se pudo crear el contexto del canvas');

        const mainImg = new window.Image();
        if (imageUrl.startsWith('http')) {
          mainImg.crossOrigin = 'anonymous';
          mainImg.src = imageUrl + (imageUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
        } else {
          mainImg.src = imageUrl;
        }

        await new Promise((resolve, reject) => {
          mainImg.onload = resolve;
          mainImg.onerror = () => reject(new Error('No se pudo cargar la imagen de la selfie.'));
        });

        canvas.width = 1080;
        canvas.height = 1440;

        const imgRatio = mainImg.width / mainImg.height;
        const canvasRatio = canvas.width / canvas.height;
        let drawWidth, drawHeight, drawX, drawY;

        if (imgRatio > canvasRatio) {
          drawHeight = canvas.height;
          drawWidth = canvas.height * imgRatio;
          drawX = (canvas.width - drawWidth) / 2;
          drawY = 0;
        } else {
          drawWidth = canvas.width;
          drawHeight = canvas.width / imgRatio;
          drawX = 0;
          drawY = (canvas.height - drawHeight) / 2;
        }

        ctx.drawImage(mainImg, drawX, drawY, drawWidth, drawHeight);

        const overlayHeight = 280;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, canvas.height - overlayHeight, canvas.width, overlayHeight);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 90px sans-serif';
        const horaStr = asistenciaInfo.hora.substring(0, 5);
        ctx.fillText(horaStr, 40, canvas.height - overlayHeight + 110);
        const timeWidth = ctx.measureText(horaStr).width;

        const lineX = 40 + timeWidth + 15;
        ctx.fillStyle = '#ffc107';
        ctx.fillRect(lineX, canvas.height - overlayHeight + 35, 6, 90);

        const textX = lineX + 20;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText(formatFecha(asistenciaInfo.fecha), textX, canvas.height - overlayHeight + 70);
        ctx.fillStyle = '#ffc107';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText(asistenciaInfo.tipo.toUpperCase(), textX, canvas.height - overlayHeight + 110);

        const wrapText = (context: CanvasRenderingContext2D, text: string, x: number, startY: number, maxWidth: number, lineHeight: number): number => {
          const words = text.split(' ');
          let line = '';
          let currentY = startY;
          for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = context.measureText(testLine);
            const testWidth = metrics.width;
            if (testWidth > maxWidth && n > 0) {
              context.fillText(line, x, currentY);
              line = words[n] + ' ';
              currentY += lineHeight;
            } else {
              line = testLine;
            }
          }
          context.fillText(line, x, currentY);
          return currentY + lineHeight;
        };

        const nextY = wrapText(ctx, asistenciaInfo.direccion, 40, canvas.height - overlayHeight + 175, 750, 32);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText(`👤 ${asistenciaInfo.empleadoNombre}`, 40, Math.min(nextY, canvas.height - 35));

        const canvasMapUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${asistenciaInfo.lat},${asistenciaInfo.lng}&zoom=16&size=200x200&maptype=mapnik&markers=${asistenciaInfo.lat},${asistenciaInfo.lng},red-pushpin`;

        const mapImg = new window.Image();
        mapImg.crossOrigin = 'anonymous';
        try {
          await new Promise((resolve, reject) => {
            mapImg.onload = resolve;
            mapImg.onerror = () => reject(new Error('No se pudo cargar la imagen del mapa para compartir.'));
            mapImg.src = canvasMapUrl + '&t=' + Date.now();
          });

          const mapSize = 200;
          const mapX = canvas.width - mapSize - 40;
          const mapY = canvas.height - mapSize - 40;

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 6;
          ctx.strokeRect(mapX - 3, mapY - 3, mapSize + 6, mapSize + 6);
          ctx.drawImage(mapImg, mapX, mapY, mapSize, mapSize);
        } catch (mapErr) {
          console.error('Error al dibujar mapa en canvas de web:', mapErr);
        }

        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        const link = document.createElement('a');
        link.download = `asistencia_${asistenciaInfo.empleadoNombre.replace(/\s+/g, '_')}_${asistenciaInfo.fecha}.jpg`;
        link.href = dataUrl;
        link.click();
      } catch (err: any) {
        console.error('Error generando descarga de marca de agua en web:', err);
        window.alert('No se pudo generar la imagen con marca de agua en la versión web: ' + err.message);
      }
      return;
    }
    try {
      const uri = await captureRef(viewRef, {
        format: 'jpg',
        quality: 0.9,
      });

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

        {/* Botón de compartir con marca de agua (cuando aplica) */}
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

        {/* Imagen a pantalla completa con Zoom & Pan */}
        <View style={styles.imageContainer}>
          <ZoomableView
            ref={zoomRef}
            onScaleChange={setCurrentZoomScale}
            onRotationChange={setCurrentRotation}
            minScale={1}
            maxScale={8}
          >
            {asistenciaInfo ? (
              <View
                ref={viewRef}
                style={styles.captureContainer}
                collapsable={false}
              >
                <Image
                  source={{ uri: imageUrl }}
                  style={styles.image}
                  contentFit="cover"
                />
                <View style={styles.watermarkOverlay}>
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

                  <View style={styles.watermarkMapContainer}>
                    {mapUrl ? (
                      <Image
                        source={{ uri: mapUrl }}
                        onError={() => {
                          if (asistenciaInfo && !mapUrl.includes('openstreetmap.de')) {
                            setMapUrl(`https://staticmap.openstreetmap.de/staticmap.php?center=${asistenciaInfo.lat},${asistenciaInfo.lng}&zoom=16&size=200x200&maptype=mapnik&markers=${asistenciaInfo.lat},${asistenciaInfo.lng},red-pushpin`);
                          }
                        }}
                        style={styles.watermarkMap}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#333' }}>
                        <ActivityIndicator size="small" color="#fff" />
                      </View>
                    )}
                  </View>
                </View>
              </View>
            ) : (
              <Image
                source={{ uri: imageUrl }}
                style={styles.fullImage}
                contentFit="contain"
              />
            )}
          </ZoomableView>
        </View>

        {/* Barra Flotante de Herramientas de Visualización */}
        <View style={styles.floatingToolbar}>
          {/* Zoom Out */}
          <TouchableOpacity
            style={styles.toolbarBtn}
            onPress={() => zoomRef.current?.zoomOut(0.5)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="remove" size={20} color="#ffffff" />
          </TouchableOpacity>

          {/* Porcentaje Zoom */}
          <TouchableOpacity
            style={styles.toolbarScaleBtn}
            onPress={() => zoomRef.current?.reset()}
            activeOpacity={0.7}
          >
            <Text style={styles.toolbarScaleText}>
              {Math.round(currentZoomScale * 100)}%
            </Text>
          </TouchableOpacity>

          {/* Zoom In */}
          <TouchableOpacity
            style={styles.toolbarBtn}
            onPress={() => zoomRef.current?.zoomIn(0.5)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="add" size={20} color="#ffffff" />
          </TouchableOpacity>

          <View style={styles.toolbarDivider} />

          {/* Rotar 90° */}
          <TouchableOpacity
            style={styles.toolbarBtn}
            onPress={() => zoomRef.current?.rotate(90)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="reload-outline" size={18} color="#ffffff" />
          </TouchableOpacity>

          {/* Reset / Centrar */}
          <TouchableOpacity
            style={styles.toolbarBtn}
            onPress={() => zoomRef.current?.reset()}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="scan-outline" size={18} color="#ffffff" />
          </TouchableOpacity>

          {/* Abrir original en nueva pestaña / navegador */}
          <TouchableOpacity
            style={styles.toolbarBtn}
            onPress={handleOpenOriginal}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="open-outline" size={18} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* Tip explicativo en Desktop */}
        {Platform.OS === 'web' && (
          <View style={styles.helpHint}>
            <Text style={styles.helpHintText}>
              💡 Rueda del mouse para zoom hacia el cursor • Clic y arrastrar para mover • Doble clic para zoom rápido
            </Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.96)',
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
    flex: 1,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureContainer: {
    width: Platform.OS === 'web' ? 420 : width * 0.92,
    height: Platform.OS === 'web' ? 580 : height * 0.72,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  floatingToolbar: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 25,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(28, 28, 30, 0.88)',
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderRadius: 30,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 10,
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(16px)',
      },
    }),
  },
  toolbarBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolbarScaleBtn: {
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 44,
  },
  toolbarScaleText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  toolbarDivider: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  helpHint: {
    position: 'absolute',
    top: 30,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    pointerEvents: 'none',
  },
  helpHintText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 11,
    fontWeight: '500',
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
