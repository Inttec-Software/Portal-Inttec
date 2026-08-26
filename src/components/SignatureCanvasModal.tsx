import React, { useState, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  PanResponder,
  Platform,
} from 'react-native';
import ViewShot from 'react-native-view-shot';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface SignatureCanvasModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (signatureBase64: string) => void;
  titulo?: string;
}

interface Point {
  x: number;
  y: number;
}

interface Segment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  length: number;
  angle: number;
}

export default function SignatureCanvasModal({
  visible,
  onClose,
  onConfirm,
  titulo = 'Firma Autógrafa Digital',
}: SignatureCanvasModalProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [segments, setSegments] = useState<Segment[]>([]);
  const [hasSignature, setHasSignature] = useState(false);
  const viewShotRef = useRef<any>(null);
  const webCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const touchContainerRef = useRef<View>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<Point | null>(null);
  const containerOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const updateContainerOffset = () => {
    touchContainerRef.current?.measureInWindow((x, y) => {
      if (x !== undefined && y !== undefined) {
        containerOffset.current = { x, y };
      }
    });
  };

  // PanResponder para móvil (iOS / Android) usando coordenadas absolutas pageX/pageY
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const pageX = evt.nativeEvent.pageX;
        const pageY = evt.nativeEvent.pageY;
        const x = pageX - containerOffset.current.x;
        const y = pageY - containerOffset.current.y;
        lastPoint.current = { x, y };
        setHasSignature(true);
      },
      onPanResponderMove: (evt) => {
        if (!lastPoint.current) return;
        const pageX = evt.nativeEvent.pageX;
        const pageY = evt.nativeEvent.pageY;
        const x = pageX - containerOffset.current.x;
        const y = pageY - containerOffset.current.y;

        const x1 = lastPoint.current.x;
        const y1 = lastPoint.current.y;
        const x2 = x;
        const y2 = y;

        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length < 1) return;

        const angle = Math.atan2(dy, dx);
        const newSegment: Segment = {
          id: `${Date.now()}-${Math.random()}`,
          x1,
          y1,
          x2,
          y2,
          length,
          angle,
        };

        setSegments((prev) => [...prev, newSegment]);
        lastPoint.current = { x, y };
      },
      onPanResponderRelease: () => {
        lastPoint.current = null;
      },
      onPanResponderTerminate: () => {
        lastPoint.current = null;
      },
    })
  ).current;

  const handleClear = () => {
    setSegments([]);
    setHasSignature(false);
    lastPoint.current = null;
    if (Platform.OS === 'web' && webCanvasRef.current) {
      const ctx = webCanvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, webCanvasRef.current.width, webCanvasRef.current.height);
      }
    }
  };

  const handleConfirm = async () => {
    if (Platform.OS === 'web' && webCanvasRef.current) {
      if (!hasSignature) return;
      const dataUrl = webCanvasRef.current.toDataURL('image/png');
      onConfirm(dataUrl);
      handleClear();
      onClose();
      return;
    }

    if (!hasSignature && segments.length === 0) return;

    try {
      if (viewShotRef.current && viewShotRef.current.capture) {
        const base64 = await viewShotRef.current.capture();
        const formattedBase64 = base64.startsWith('data:image')
          ? base64
          : `data:image/png;base64,${base64}`;
        onConfirm(formattedBase64);
        handleClear();
        onClose();
      }
    } catch (error) {
      console.error('Error al capturar la firma:', error);
    }
  };

  // Handlers para Web HTML5 Canvas
  const handleWebMouseDown = (e: any) => {
    if (!webCanvasRef.current) return;
    isDrawing.current = true;
    setHasSignature(true);
    const rect = webCanvasRef.current.getBoundingClientRect();
    const ctx = webCanvasRef.current.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  };

  const handleWebMouseMove = (e: any) => {
    if (!isDrawing.current || !webCanvasRef.current) return;
    const rect = webCanvasRef.current.getBoundingClientRect();
    const ctx = webCanvasRef.current.getContext('2d');
    if (ctx) {
      ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
      ctx.stroke();
    }
  };

  const handleWebMouseUp = () => {
    isDrawing.current = false;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: themeColors.backgroundElement }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="create-outline" size={24} color={themeColors.accent} />
              <Text style={[styles.title, { color: themeColors.text }]}>{titulo}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close-outline" size={24} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.instructions, { color: themeColors.textSecondary }]}>
            Dibuja tu firma completa con el dedo o mouse sobre el espacio blanco libre:
          </Text>

          {/* Lienzo de Firma - Totalmente limpio y sin bordes/marcos */}
          <View style={styles.canvasWrapper}>
            {Platform.OS === 'web' ? (
              <canvas
                ref={webCanvasRef}
                width={500}
                height={220}
                style={{
                  width: '100%',
                  height: 220,
                  backgroundColor: '#ffffff',
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'crosshair',
                  touchAction: 'none',
                }}
                onMouseDown={handleWebMouseDown}
                onMouseMove={handleWebMouseMove}
                onMouseUp={handleWebMouseUp}
                onTouchStart={(e) => {
                  const touch = e.touches[0];
                  handleWebMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
                }}
                onTouchMove={(e) => {
                  const touch = e.touches[0];
                  handleWebMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
                }}
                onTouchEnd={handleWebMouseUp}
              />
            ) : (
              <ViewShot
                ref={viewShotRef}
                options={{ format: 'png', quality: 0.9, result: 'base64' }}
                style={styles.viewShotCanvas}
              >
                <View
                  ref={touchContainerRef}
                  onLayout={updateContainerOffset}
                  style={styles.touchArea}
                  {...panResponder.panHandlers}
                >
                  {/* Trazo continuo en móvil compuesto por segmentos vectoriales finos */}
                  {segments.map((seg) => (
                    <View
                      key={seg.id}
                      style={{
                        position: 'absolute',
                        left: seg.x1,
                        top: seg.y1 - 1.5,
                        width: seg.length,
                        height: 3,
                        backgroundColor: '#0f172a',
                        borderRadius: 1.5,
                        transformOrigin: '0% 50%',
                        transform: [{ rotate: `${seg.angle}rad` }],
                      }}
                    />
                  ))}
                </View>
              </ViewShot>
            )}
          </View>

          {/* Footer Botones */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
              <Text style={styles.clearText}>Limpiar Trazo</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
              <Ionicons name="checkmark-done-outline" size={20} color="#ffffff" />
              <Text style={styles.confirmText}>Confirmar Firma</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    width: '100%',
    maxWidth: 550,
    borderRadius: 16,
    padding: 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeBtn: {
    padding: 4,
  },
  instructions: {
    fontSize: 13,
    marginBottom: 12,
  },
  canvasWrapper: {
    height: 220,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  viewShotCanvas: {
    width: '100%',
    height: '100%',
    backgroundColor: '#ffffff',
  },
  touchArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    gap: 12,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  clearText: {
    color: '#ef4444',
    fontWeight: '600',
    fontSize: 14,
  },
  confirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#0284c7',
  },
  confirmText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 15,
  },
});
