import React, { useEffect, useRef } from 'react';
import {
  Animated,
  DimensionValue,
  Easing,
  Platform,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 20,
  borderRadius = 6,
  style,
  children,
}) => {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.95,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  const baseColor = isDark ? '#22384f' : '#e2e8f0';

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: baseColor,
          opacity: pulseAnim,
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
};

export interface SkeletonCircleProps {
  size: number;
  style?: StyleProp<ViewStyle>;
}

export const SkeletonCircle: React.FC<SkeletonCircleProps> = ({ size, style }) => {
  return <Skeleton width={size} height={size} borderRadius={size / 2} style={style} />;
};

export interface SkeletonTextProps {
  width?: DimensionValue;
  height?: number;
  lines?: number;
  spacing?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export const SkeletonText: React.FC<SkeletonTextProps> = ({
  width = '100%',
  height = 14,
  lines = 1,
  spacing = 6,
  borderRadius = 4,
  style,
}) => {
  if (lines === 1) {
    return <Skeleton width={width} height={height} borderRadius={borderRadius} style={style} />;
  }

  return (
    <View style={style}>
      {Array.from({ length: lines }).map((_, i) => {
        // La última línea se dibuja un poco más corta para emular párrafos naturales
        const lineWidth: DimensionValue =
          i === lines - 1 && typeof width === 'string' && width.includes('%')
            ? '70%'
            : width;

        return (
          <Skeleton
            key={i}
            width={lineWidth}
            height={height}
            borderRadius={borderRadius}
            style={i > 0 ? { marginTop: spacing } : undefined}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({});
