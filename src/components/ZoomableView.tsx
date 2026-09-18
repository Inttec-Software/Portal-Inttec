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

  // Spring animation helper
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

  // ==========================================
  // WEB MOUSE & TRACKPAD EVENT HANDLERS
  // ==========================================
  const dragStartRef = useRef<{ startX: number; startY: number; initTx: number; initTy: number } | null>(null);
  const lastClickTime = useRef(0);

  const handleMouseDownWeb = (e: any) => {
    if (Platform.OS !== 'web') return;
    if (e.button !== 0) return; // Only left click

    // Double click detection on web
    const now = Date.now();
    if (now - lastClickTime.current < 300) {
      if (currentScale.current > 1.2) {
        animateTo(1, 0, 0);
      } else {
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

    // Trackpad 2-finger pan
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

    const scaleRatio = nextScale / currentScale.current;
    const nextTx = cursorX - (cursorX - currentTranslateX.current) * scaleRatio;
    const nextTy = cursorY - (cursorY - currentTranslateY.current) * scaleRatio;

    scale.setValue(nextScale);
    translateX.setValue(nextTx);
    translateY.setValue(nextTy);
  };

  // ==========================================
  // MOBILE MULTI-TOUCH DYNAMIC PINCH-TO-ZOOM ENGINE
  // ==========================================
  const isPinching = useRef(false);
  const initialPinchDistance = useRef(1);
  const initialPinchScale = useRef(1);
  const initialPinchMidpoint = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const initialPinchTranslate = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const isPanning = useRef(false);
  const panStartTouch = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartTranslate = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Tap tracking (strictly for double tap detection on release, never on grant)
  const touchStartTime = useRef(0);
  const touchStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hadMultipleTouches = useRef(false);
  const lastCompletedTapTime = useRef(0);
  const lastCompletedTapPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const calcDistance = (t0: any, t1: any) => {
    const dx = t0.pageX - t1.pageX;
    const dy = t0.pageY - t1.pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const calcMidpoint = (t0: any, t1: any) => {
    return {
      x: (t0.pageX + t1.pageX) / 2,
      y: (t0.pageY + t1.pageY) / 2,
    };
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: (evt) => evt.nativeEvent.touches.length >= 2,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return (
          evt.nativeEvent.touches.length >= 2 ||
          currentScale.current > 1.05 ||
          Math.abs(gestureState.dx) > 3 ||
          Math.abs(gestureState.dy) > 3
        );
      },
      onMoveShouldSetPanResponderCapture: (evt) => evt.nativeEvent.touches.length >= 2,
      onPanResponderTerminationRequest: () => false,

      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        touchStartTime.current = Date.now();

        if (touches.length >= 2) {
          hadMultipleTouches.current = true;
          isPinching.current = true;
          isPanning.current = false;
          initialPinchDistance.current = calcDistance(touches[0], touches[1]) || 1;
          initialPinchScale.current = currentScale.current;
          initialPinchMidpoint.current = calcMidpoint(touches[0], touches[1]);
          initialPinchTranslate.current = {
            x: currentTranslateX.current,
            y: currentTranslateY.current,
          };
        } else if (touches.length === 1) {
          hadMultipleTouches.current = false;
          isPinching.current = false;
          isPanning.current = true;
          touchStartPos.current = { x: touches[0].pageX, y: touches[0].pageY };
          panStartTouch.current = { x: touches[0].pageX, y: touches[0].pageY };
          panStartTranslate.current = {
            x: currentTranslateX.current,
            y: currentTranslateY.current,
          };
        }
      },

      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches;

        if (touches.length >= 2) {
          hadMultipleTouches.current = true;
          const dist = calcDistance(touches[0], touches[1]);
          const mid = calcMidpoint(touches[0], touches[1]);

          if (!isPinching.current) {
            // Smooth start of pinch gesture
            isPinching.current = true;
            isPanning.current = false;
            initialPinchDistance.current = dist || 1;
            initialPinchScale.current = currentScale.current;
            initialPinchMidpoint.current = mid;
            initialPinchTranslate.current = {
              x: currentTranslateX.current,
              y: currentTranslateY.current,
            };
            return;
          }

          // Dynamic continuous scale factor (pinch out to zoom in, pinch in to zoom out)
          const scaleFactor = dist / (initialPinchDistance.current || 1);
          let newScale = initialPinchScale.current * scaleFactor;
          // Clamp within limits (with slight resistance rubber-band range)
          newScale = Math.min(Math.max(minScale * 0.75, newScale), maxScale * 1.25);

          // Pan translation with midpoint movement
          const dxMid = mid.x - initialPinchMidpoint.current.x;
          const dyMid = mid.y - initialPinchMidpoint.current.y;

          const newTx = initialPinchTranslate.current.x + dxMid;
          const newTy = initialPinchTranslate.current.y + dyMid;

          scale.setValue(newScale);
          translateX.setValue(newTx);
          translateY.setValue(newTy);

        } else if (touches.length === 1) {
          if (isPinching.current) {
            // One finger lifted: seamless transition to single-finger pan
            isPinching.current = false;
            isPanning.current = true;
            panStartTouch.current = { x: touches[0].pageX, y: touches[0].pageY };
            panStartTranslate.current = {
              x: currentTranslateX.current,
              y: currentTranslateY.current,
            };
            return;
          }

          if (isPanning.current && currentScale.current > 1.05) {
            const dx = touches[0].pageX - panStartTouch.current.x;
            const dy = touches[0].pageY - panStartTouch.current.y;

            translateX.setValue(panStartTranslate.current.x + dx);
            translateY.setValue(panStartTranslate.current.y + dy);
          }
        }
      },

      onPanResponderRelease: (evt, gestureState) => {
        const touchDuration = Date.now() - touchStartTime.current;
        const totalMoved = Math.hypot(gestureState.dx, gestureState.dy);
        const isSingleTap = !hadMultipleTouches.current && touchDuration < 280 && totalMoved < 10;

        // Double tap toggle check (only on genuine double taps)
        if (isSingleTap) {
          const now = Date.now();
          const tapX = touchStartPos.current.x;
          const tapY = touchStartPos.current.y;
          const distFromLastTap = Math.hypot(
            tapX - lastCompletedTapPos.current.x,
            tapY - lastCompletedTapPos.current.y
          );

          if (now - lastCompletedTapTime.current < 320 && distFromLastTap < 45) {
            // Genuine double tap!
            if (currentScale.current > 1.2) {
              animateTo(1, 0, 0);
            } else {
              const screenW = Dimensions.get('window').width;
              const screenH = Dimensions.get('window').height;
              const relX = tapX - screenW / 2;
              const relY = tapY - screenH / 2;
              const targetScale = 2.5;
              const targetTx = -relX * 1.5;
              const targetTy = -relY * 1.5;
              animateTo(targetScale, targetTx, targetTy);
            }
            lastCompletedTapTime.current = 0;
            isPinching.current = false;
            isPanning.current = false;
            return;
          }

          lastCompletedTapTime.current = now;
          lastCompletedTapPos.current = { x: tapX, y: tapY };
        }

        isPinching.current = false;
        isPanning.current = false;

        // Natural release behavior preserving user's dynamic pinch zoom level
        if (currentScale.current < minScale || currentScale.current <= 1.05) {
          // If zoomed all the way out, smoothly center
          animateTo(1, 0, 0);
        } else if (currentScale.current > maxScale) {
          // If over-pinched past max, spring back to maxScale
          animateTo(maxScale, currentTranslateX.current, currentTranslateY.current);
        } else {
          // Keep user's chosen scale! Just keep image within boundaries
          const screenW = Dimensions.get('window').width;
          const screenH = Dimensions.get('window').height;
          const maxTx = Math.max(0, (screenW * (currentScale.current - 1)) / 2);
          const maxTy = Math.max(0, (screenH * (currentScale.current - 1)) / 2);

          const boundedTx = Math.min(Math.max(-maxTx, currentTranslateX.current), maxTx);
          const boundedTy = Math.min(Math.max(-maxTy, currentTranslateY.current), maxTy);

          if (boundedTx !== currentTranslateX.current || boundedTy !== currentTranslateY.current) {
            animateTo(currentScale.current, boundedTx, boundedTy);
          }
        }
      },

      onPanResponderTerminate: () => {
        isPinching.current = false;
        isPanning.current = false;
        if (currentScale.current <= 1.05) {
          animateTo(1, 0, 0);
        }
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
            pointerEvents: 'none',
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
