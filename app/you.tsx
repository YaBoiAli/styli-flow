import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AgePicker, DEFAULT_AGE, MIN_SELECTABLE_AGE } from '@/components/AgePicker';
import { BackButton } from '@/components/BackButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { usePreferences } from '@/context/PreferencesContext';
import { colors, spacing, typography } from '@/constants/theme';

export default function YouScreen() {
  const router = useRouter();
  const { age, setAge } = usePreferences();

  useEffect(() => {
    if (age == null) setAge(DEFAULT_AGE);
  }, [age, setAge]);

  return (
    <Screen
      scroll={false}
      contentStyle={styles.content}
      footer={
        <PrimaryButton
          label="Continue"
          testID="btn-continue-you"
          disabled={(age ?? 0) < MIN_SELECTABLE_AGE}
          onPress={() => router.push('/measurements')}
        />
      }
    >
      <View style={styles.top}>
        <BackButton fallbackHref="/" />
        <OnboardingProgress step="You" />
        <Text style={styles.title}>How old are you?</Text>
        <Text style={styles.subtitle}>
          Scroll the wheel to your age so the fit can match.
        </Text>
      </View>

      <View style={styles.ageBlock}>
        <Text style={styles.sectionLabel}>Your age</Text>
        <AgePicker value={age ?? DEFAULT_AGE} onChange={setAge} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
  },
  top: {
    gap: spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  subtitle: {
    ...typography.subtitle,
    color: colors.textSecondary,
  },
  ageBlock: {
    flex: 1,
    minHeight: 0,
    gap: spacing.sm,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
});
