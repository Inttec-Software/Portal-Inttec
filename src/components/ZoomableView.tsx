import React, { useRef, useEffect } from 'react';
import { Animated, PanResponder, View, Platform, StyleSheet } from 'react-native';

interface Props {
  children: React.ReactNode;
}

export default function ZoomableView({ children }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  // For pinch zoom logic
  const currentScale = useRef(1);
  const initialDistance = useRef<number | null>(null);

  useEffect(() => {
    scale.addListener(({ value }) => {
      currentScale.current = value;
    });
    return () => scale.removeAllListeners();
  }, [scale]);

  const calcDistance = (touches: any[]) => {
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        translateX.setOffset((translateX as any)._value);
        translateY.setOffset((translateY as any)._value);
        translateX.setValue(0);
        translateY.setValue(0);
        initialDistance.current = null;
      },
      onPanResponderMove: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;
        
        if (touches && touches.length === 2) {
          // Pinch Zoom
          const distance = calcDistance(touches);
          if (initialDistance.current === null) {
            initialDistance.current = distance;
          } else {
            const scaleFactor = distance / initialDistance.current;
            let newScale = currentScale.current * scaleFactor;
            // Clamp scale between 1 and 4
            newScale = Math.min(Math.max(1, newScale), 4);
            Animated.spring(scale, {
              toValue: newScale,
              useNativeDriver: false,
              friction: 7,
              tension: 40,
            }).start();
            // reset initial distance for continuous smooth zooming
            initialDistance.current = distance;
          }
        } else {
          // Panning (only drag if scale > 1)
          if (currentScale.current > 1) {
            translateX.setValue(gestureState.dx);
            translateY.setValue(gestureState.dy);
          }
        }
      },
      onPanResponderRelease: () => {
        translateX.flattenOffset();
        translateY.flattenOffset();
        
        // If scaled out below 1, spring back to 1 and center
        if (currentScale.current <= 1) {
          Animated.parallel([
            Animated.spring(scale, { toValue: 1, useNativeDriver: false }),
            Animated.spring(translateX, { toValue: 0, useNativeDriver: false }),
            Animated.spring(translateY, { toValue: 0, useNativeDriver: false }),
          ]).start();
        }
      },
      onPanResponderTerminate: () => {
        translateX.flattenOffset();
        translateY.flattenOffset();
      }
    })
  ).current;

  // Web mouse wheel zoom
  const handleWheel = (e: any) => {
    if (Platform.OS !== 'web') return;
    
    // deltaY is positive on scroll down (zoom out), negative on scroll up (zoom in)
    const zoomSensitivity = 0.002;
    const delta = -e.deltaY * zoomSensitivity;
    
    let newScale = currentScale.current * (1 + delta);
    newScale = Math.min(Math.max(1, newScale), 5); // Allow max 5x zoom on web
    
    Animated.spring(scale, {
      toValue: newScale,
      useNativeDriver: false,
      friction: 7,
      tension: 40,
    }).start();

    // If scaled back to 1, reset translation
    if (newScale <= 1) {
      Animated.parallel([
        Animated.spring(translateX, { toValue: 0, useNativeDriver: false }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: false }),
      ]).start();
    }
  };

  return (
    <View 
      style={styles.container} 
      {...panResponder.panHandlers}
      // @ts-ignore - onWheel is a valid DOM event in React Native Web
      onWheel={Platform.OS === 'web' ? handleWheel : undefined}
    >
      <Animated.View
        style={[
          styles.content,
          {
            transform: [
              { translateX },
              { translateY },
              { scale },
            ]
          }
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    width: '100%', 
    height: '100%', 
    overflow: 'hidden',
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  content: { 
    flex: 1, 
    width: '100%', 
    height: '100%', 
    justifyContent: 'center', 
    alignItems: 'center' 
  }
});
