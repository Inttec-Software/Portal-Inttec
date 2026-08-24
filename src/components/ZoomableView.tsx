import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { Animated, PanResponder, View, Platform, StyleSheet, Dimensions } from 'react-native';

export interface ZoomableViewRef {
  zoomIn: (step?: number) => void;
  zoomOut: (step?: number) => void;
  reset: () => void;
  rotate: (degrees?: number) => void;
  getScale: () => number;
  getRotation: () => number;
}

interface Props {
  children: React.ReactNode;
  onScaleChange?: (scale: number) => void;
  onRotationChange?: (rotation: number) => void;
  minScale?: number;
  maxScale?: number;
  initialRotation?: number;
}

const ZoomableView = forwardRef<ZoomableViewRef, Props>(({
  children,
  onScaleChange,
  onRotationChange,
  minScale = 1,
  maxScale = 8,
  initialRotation = 0,
}, ref) => {
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(initialRotation)).current;

  const currentScale = useRef(1);
  const currentTranslateX = useRef(0);
  const currentTranslateY = useRef(0);
  const currentRotation = useRef(initialRotation);

  const containerRef = useRef<View>(null);
  const [isDraggingWeb, setIsDraggingWeb] = useState(false);

  // Sync state values with Animated listeners
  useEffect(() => {
    const scaleSub = scale.addListener(({ value }) => {
      currentScale.current = value;
      onScaleChange?.(value);
    });
    const txSub = translateX.addListener(({ value }) => {
      currentTranslateX.current = value;
    });
    const tySub = translateY.addListener(({ value }) => {
      currentTranslateY.current = value;
    });
    const rotSub = rotateAnim.addListener(({ value }) => {
      currentRotation.current = value;
      onRotationChange?.(value);
    });

    return () => {
      scale.removeListener(scaleSub);
      translateX.removeListener(txSub);
      translateY.removeListener(tySub);
      rotateAnim.removeListener(rotSub);
    };
  }, [scale, translateX, translateY, rotateAnim, onScaleChange, onRotationChange]);

  // Imperative ref methods
  useImperativeHandle(ref, () => ({
    zoomIn: (step = 0.5) => {
      const nextScale = Math.min(currentScale.current + step, maxScale);
      animateTo(nextScale, currentTranslateX.current, currentTranslateY.current);
    },
    zoomOut: (step = 0.5) => {
      const nextScale = Math.max(currentScale.current - step, minScale);
      if (nextScale <= minScale) {
        animateTo(minScale, 0, 0);
      } else {
        animateTo(nextScale, currentTranslateX.current, currentTranslateY.current);
      }
    },
    reset: () => {
      animateTo(1, 0, 0);
      animateRotationTo(0);
    },
    rotate: (degrees = 90) => {
      const nextRotation = (currentRotation.current + degrees) % 360;
      animateRotationTo(nextRotation);
    },
    getScale: () => currentScale.current,
    getRotation: () => currentRotation.current,
  }));

  const animateTo = (targetScale: number, targetTx: number, targetTy: number) => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: targetScale,
        friction: 8,
        tension: 50,
        useNativeDriver: false,
      }),
      Animated.spring(translateX, {
        toValue: targetTx,
        friction: 8,
        tension: 50,
        useNativeDriver: false,
      }),
      Animated.spring(translateY, {
        toValue: targetTy,
        friction: 8,
        tension: 50,
        useNativeDriver: false,
      }),
    ]).start();
  };

  const animateRotationTo = (targetRot: number) => {
    Animated.spring(rotateAnim, {
      toValue: targetRot,
      friction: 8,
      tension: 50,
      useNativeDriver: false,
    }).start();
  };

  // ==========================================
  // WEB MOUSE & TRACKPAD EVENT HANDLERS
  // ==========================================
  const dragStartRef = useRef<{ startX: number; startY: number; initTx: number; initTy: number } | null>(null);
  const lastClickTime = useRef(0);

  const handleMouseDownWeb = (e: any) => {
    if (Platform.OS !== 'web') return;
    if (e.button !== 0) return; // Only left click

    // Double click detection to toggle zoom
    const now = Date.now();
    if (now - lastClickTime.current < 300) {
      // Double click!
      if (currentScale.current > 1.2) {
        animateTo(1, 0, 0);
      } else {
        // Zoom in centered on click position
        const rect = e.currentTarget?.getBoundingClientRect?.() || { left: 0, top: 0, width: Dimensions.get('window').width, height: Dimensions.get('window').height };
        const cursorX = e.clientX - (rect.left + rect.width / 2);
        const cursorY = e.clientY - (rect.top + rect.height / 2);
        const targetScale = 2.5;
        const targetTx = -cursorX * 1.5;
        const targetTy = -cursorY * 1.5;
        animateTo(targetScale, targetTx, targetTy);
      }
      lastClickTime.current = 0;
      return;
    }
    lastClickTime.current = now;

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initTx: currentTranslateX.current,
      initTy: currentTranslateY.current,
    };
    setIsDraggingWeb(true);

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = moveEvent.clientX - dragStartRef.current.startX;
      const dy = moveEvent.clientY - dragStartRef.current.startY;
      translateX.setValue(dragStartRef.current.initTx + dx);
      translateY.setValue(dragStartRef.current.initTy + dy);
    };

    const onMouseUp = () => {
      dragStartRef.current = null;
      setIsDraggingWeb(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleWheelWeb = (e: any) => {
    if (Platform.OS !== 'web') return;
    try {
      e.preventDefault();
      e.stopPropagation();
    } catch {}

    const rect = e.currentTarget?.getBoundingClientRect?.() || { left: 0, top: 0, width: Dimensions.get('window').width, height: Dimensions.get('window').height };
    const cursorX = e.clientX - (rect.left + rect.width / 2);
    const cursorY = e.clientY - (rect.top + rect.height / 2);

    // Trackpad 2-finger pan (when ctrlKey is false and already zoomed in)
    if (!e.ctrlKey && currentScale.current > 1.05 && Math.abs(e.deltaX) > 0 && Math.abs(e.deltaY) < 40) {
      translateX.setValue(currentTranslateX.current - e.deltaX);
      translateY.setValue(currentTranslateY.current - e.deltaY);
      return;
    }

    // Zooming with Wheel or Trackpad Pinch
    const zoomSensitivity = e.ctrlKey ? 0.01 : 0.0025;
    const delta = -e.deltaY * zoomSensitivity;
    let nextScale = currentScale.current * (1 + delta);
    nextScale = Math.min(Math.max(minScale, nextScale), maxScale);

    if (nextScale <= minScale) {
      animateTo(minScale, 0, 0);
      return;
    }

    // Zoom centered at cursor
    const scaleRatio = nextScale / currentScale.current;
    const nextTx = cursorX - (cursorX - currentTranslateX.current) * scaleRatio;
    const nextTy = cursorY - (cursorY - currentTranslateY.current) * scaleRatio;

    scale.setValue(nextScale);
    translateX.setValue(nextTx);
    translateY.setValue(nextTy);
  };

  // ==========================================
  // MOBILE TOUCH & PANRESPONDER HANDLERS
  // ==========================================
  const initialDistance = useRef<number | null>(null);
  const initialScaleOnPinch = useRef<number>(1);
  const lastTouchTime = useRef(0);

  const calcDistance = (touches: any[]) => {
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        translateX.setOffset(currentTranslateX.current);
        translateY.setOffset(currentTranslateY.current);
        translateX.setValue(0);
        translateY.setValue(0);
        initialDistance.current = null;

        // Double tap on mobile
        const now = Date.now();
        if (evt.nativeEvent.touches.length === 1) {
          if (now - lastTouchTime.current < 300) {
            if (currentScale.current > 1.2) {
              animateTo(1, 0, 0);
            } else {
              animateTo(2.5, 0, 0);
            }
            lastTouchTime.current = 0;
            return;
          }
          lastTouchTime.current = now;
        }
      },
      onPanResponderMove: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;
        if (touches && touches.length === 2) {
          // Pinch Zoom
          const distance = calcDistance(touches);
          if (initialDistance.current === null) {
            initialDistance.current = distance;
            initialScaleOnPinch.current = currentScale.current;
          } else {
            const scaleFactor = distance / initialDistance.current;
            let newScale = initialScaleOnPinch.current * scaleFactor;
            newScale = Math.min(Math.max(minScale, newScale), maxScale);
            scale.setValue(newScale);
          }
        } else if (touches && touches.length === 1) {
          // 1 Finger Drag / Pan (allowed when zoomed in or dragging)
          if (currentScale.current > 1.05) {
            translateX.setValue(gestureState.dx);
            translateY.setValue(gestureState.dy);
          }
        }
      },
      onPanResponderRelease: () => {
        translateX.flattenOffset();
        translateY.flattenOffset();

        if (currentScale.current <= 1.05) {
          animateTo(1, 0, 0);
        }
      },
      onPanResponderTerminate: () => {
        translateX.flattenOffset();
        translateY.flattenOffset();
      },
    })
  ).current;

  // Rotation string for transform
  const rotateInterpolated = rotateAnim.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  const webCursor = isDraggingWeb
    ? 'grabbing'
    : currentScale.current > 1.05
    ? 'grab'
    : 'zoom-in';

  return (
    <View
      ref={containerRef}
      style={[
        styles.container,
        Platform.OS === 'web' && ({
          cursor: webCursor,
          userSelect: 'none',
          touchAction: 'none',
        } as any),
      ]}
      {...(Platform.OS !== 'web' ? panResponder.panHandlers : {})}
      // @ts-ignore
      onMouseDown={Platform.OS === 'web' ? handleMouseDownWeb : undefined}
      // @ts-ignore
      onWheel={Platform.OS === 'web' ? handleWheelWeb : undefined}
    >
      <Animated.View
        style={[
          styles.content,
          Platform.OS === 'web' && ({
            pointerEvents: 'none', // Allows drag events to stay on container smoothly
          } as any),
          {
            transform: [
              { translateX },
              { translateY },
              { scale },
              { rotate: rotateInterpolated },
            ],
          },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
});

export default ZoomableView;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
