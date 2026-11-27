import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Image,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ImageViewer from 'react-native-image-zoom-viewer';

interface Props {
  visible: boolean;
  imageUrl: string | null;
  title?: string;
  description?: string;
  onClose: () => void;
}

export default function DiagramZoomModal({
  visible,
  imageUrl,
  title,
  description,
  onClose,
}: Props) {
  const { width, height } = useWindowDimensions();
  const [webScale, setWebScale] = useState(1);

  const handleClose = () => {
    setWebScale(1);
    onClose();
  };

  if (!visible || !imageUrl) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        {/* Header superior */}
        <View style={styles.topBar}>
          <View style={styles.titleArea}>
            {Boolean(title) && (
              <Text style={styles.titleText} numberOfLines={1}>
                {title}
              </Text>
            )}
            {Boolean(description) && (
              <Text style={styles.descText} numberOfLines={2}>
                {description}
              </Text>
            )}
          </View>

          {Platform.OS === 'web' && (
            <View style={styles.webZoomBar}>
              <TouchableOpacity
                onPress={() => setWebScale((s) => Math.max(0.5, Number((s - 0.25).toFixed(2))))}
                style={styles.zoomBtn}
              >
                <Ionicons name="remove" size={18} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.zoomPct}>{Math.round(webScale * 100)}%</Text>
              <TouchableOpacity
                onPress={() => setWebScale((s) => Math.min(3, Number((s + 0.25).toFixed(2))))}
                style={styles.zoomBtn}
              >
                <Ionicons name="add" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* Contenido */}
        <View style={styles.viewerContainer}>
          {Platform.OS === 'web' ? (
            <ScrollView
              style={{ flex: 1, width: '100%' }}
              contentContainerStyle={styles.webScrollContent}
              maximumZoomScale={3}
              minimumZoomScale={1}
            >
              <ScrollView horizontal contentContainerStyle={styles.webScrollContent}>
                <Image
                  source={{ uri: imageUrl }}
                  style={{
                    width: Math.min(width - 48, 1100) * webScale,
                    height: Math.min(height - 140, 760) * webScale,
                  }}
                  resizeMode="contain"
                />
              </ScrollView>
            </ScrollView>
          ) : (
            <ImageViewer
              imageUrls={[{ url: imageUrl }]}
              enableSwipeDown
              onSwipeDown={handleClose}
              onCancel={handleClose}
              saveToLocalByLongPress={false}
              backgroundColor="#0b1120"
              renderIndicator={() => <View />}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#0b1120',
  },
  topBar: {
    paddingTop: Platform.OS === 'ios' ? 50 : 16,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    zIndex: 10,
    gap: 12,
  },
  titleArea: {
    flex: 1,
    gap: 2,
  },
  titleText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  descText: {
    color: '#cbd5e1',
    fontSize: 12,
  },
  webZoomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  zoomBtn: {
    padding: 4,
  },
  zoomPct: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    minWidth: 42,
    textAlign: 'center',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerContainer: {
    flex: 1,
  },
  webScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
});
