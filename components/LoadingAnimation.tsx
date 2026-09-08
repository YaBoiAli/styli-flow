import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors, radii, spacing, typography } from '@/constants/theme';

type LoadingAnimationProps = {
  message: string;
};

export function LoadingAnimation({ message }: LoadingAnimationProps) {
  const pulse = useSharedValue(0.35);
  const rotate = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    rotate.value = withRepeat(
      withTiming(360, { duration: 2400, easing: Easing.linear }),
      -1,
      false,
    );
  }, [pulse, rotate]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ rotate: `${rotate.value}deg` }, { scale: 0.85 + pulse.value * 0.15 }],
  }));

  const dotStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + pulse.value * 0.6,
    transform: [{ scale: 0.9 + pulse.value * 0.2 }],
  }));

  return (
    <View style={styles.container}>
      <View style={styles.stage}>
        <Animated.View style={[styles.ring, ringStyle]} />
        <Animated.View style={[styles.dot, dotStyle]} />
      </View>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  stage: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 112,
    height: 112,
    borderRadius: radii.full,
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderTopColor: 'transparent',
    borderLeftColor: colors.accentSoft,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: radii.full,
    backgroundColor: colors.accent,
  },
  message: {
    ...typography.subtitle,
    color: colors.text,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
});
