import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { colors, motion, radii, spacing, typography } from '@/constants/theme';

type LoadingAnimationProps = {
  message: string;
  stepIndex?: number;
  stepCount?: number;
};

export function LoadingAnimation({
  message,
  stepIndex = 0,
  stepCount = 5,
}: LoadingAnimationProps) {
  const pulse = useSharedValue(0.35);
  const rotate = useSharedValue(0);
  const orbit = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    rotate.value = withRepeat(
      withTiming(360, { duration: 2800, easing: Easing.linear }),
      -1,
      false,
    );
    orbit.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
        withDelay(120, withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.quad) })),
      ),
      -1,
      false,
    );
  }, [pulse, rotate, orbit]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + pulse.value * 0.45,
    transform: [
      { rotate: `${rotate.value}deg` },
      { scale: 0.88 + pulse.value * 0.14 },
    ],
  }));

  const innerRingStyle = useAnimatedStyle(() => ({
    opacity: 0.25 + (1 - pulse.value) * 0.4,
    transform: [
      { rotate: `${-rotate.value * 0.7}deg` },
      { scale: 0.92 + (1 - pulse.value) * 0.08 },
    ],
  }));

  const dotStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + pulse.value * 0.45,
    transform: [
      { scale: 0.85 + pulse.value * 0.25 },
      { translateY: -4 + orbit.value * 8 },
    ],
  }));

  const progress = Math.min(1, (stepIndex + 1) / Math.max(stepCount, 1));

  return (
    <View style={styles.container}>
      <View style={styles.stage}>
        <Animated.View style={[styles.ringOuter, ringStyle]} />
        <Animated.View style={[styles.ringInner, innerRingStyle]} />
        <Animated.View style={[styles.dot, dotStyle]} />
      </View>

      <Animated.View
        key={message}
        entering={FadeIn.duration(motion.base)}
        exiting={FadeOut.duration(motion.fast)}
        style={styles.messageWrap}
      >
        <Text style={styles.kicker}>Vibe is styling</Text>
        <Text style={styles.message}>{message}</Text>
      </Animated.View>

      <View style={styles.progressTrack} accessibilityRole="progressbar">
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <View style={styles.steps}>
        {Array.from({ length: stepCount }).map((_, index) => (
          <View
            key={index}
            style={[styles.stepDot, index <= stepIndex && styles.stepDotActive]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  stage: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringOuter: {
    position: 'absolute',
    width: 124,
    height: 124,
    borderRadius: radii.full,
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderTopColor: 'transparent',
    borderLeftColor: colors.accentSoft,
  },
  ringInner: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.accentSoft,
    borderBottomColor: 'transparent',
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: radii.full,
    backgroundColor: colors.accent,
  },
  messageWrap: {
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 78,
  },
  kicker: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
  },
  message: {
    ...typography.subtitle,
    fontSize: 20,
    lineHeight: 28,
    color: colors.text,
    textAlign: 'center',
    fontFamily: typography.label.fontFamily,
  },
  progressTrack: {
    width: '72%',
    maxWidth: 280,
    height: 3,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: radii.full,
  },
  steps: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stepDot: {
    width: 6,
    height: 6,
    borderRadius: radii.full,
    backgroundColor: colors.accentSoft,
  },
  stepDotActive: {
    backgroundColor: colors.accent,
    width: 16,
  },
});
