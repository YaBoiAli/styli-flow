import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '@/constants/theme';

const STEPS = [
  'You',
  'Fit',
  'Vibe',
  'Occasion',
  'Budget',
  'Inspiration',
  'Brands',
] as const;

export type OnboardingStep = (typeof STEPS)[number];

type OnboardingProgressProps = {
  step: OnboardingStep;
};

export function OnboardingProgress({ step }: OnboardingProgressProps) {
  const index = STEPS.indexOf(step);

  return (
    <View
      style={styles.container}
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${index + 1} of ${STEPS.length}: ${step}`}
      accessibilityValue={{ min: 1, max: STEPS.length, now: index + 1 }}
    >
      <Text style={styles.label}>
        Step {index + 1} of {STEPS.length} · {step}
      </Text>
      <View style={styles.track}>
        {STEPS.map((name, i) => (
          <View
            key={name}
            style={[styles.segment, i <= index && styles.segmentActive]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  track: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: radii.full,
    backgroundColor: colors.accentSoft,
  },
  segmentActive: {
    backgroundColor: colors.accent,
  },
});
