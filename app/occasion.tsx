import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/BackButton';
import { OptionCard } from '@/components/OptionCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { usePreferences } from '@/context/PreferencesContext';
import { colors, spacing, typography } from '@/constants/theme';
import { trackEvent } from '@/lib/analytics';
import { OCCASIONS, type Occasion } from '@/types';

export default function OccasionScreen() {
  const router = useRouter();
  const { selectedStyle, selectedOccasion, setOccasion } = usePreferences();

  useEffect(() => {
    if (!selectedStyle) {
      router.replace('/style');
    }
  }, [selectedStyle, router]);

  function handleOccasionPress(occasion: Occasion) {
    setOccasion(occasion);
    trackEvent('occasion_selected', {
      occasion,
      style: selectedStyle ?? undefined,
    });
  }

  return (
    <Screen
      contentStyle={styles.content}
      footer={
        <PrimaryButton
          label="Continue"
          testID="btn-continue-occasion"
          disabled={!selectedOccasion}
          onPress={() => router.push('/budget')}
        />
      }
    >
      <View style={styles.top}>
        <BackButton fallbackHref="/style" />
        <Text style={styles.title}>What&apos;s the occasion?</Text>
        <Text style={styles.subtitle}>
          We&apos;ll tailor the outfit to where you&apos;re going.
        </Text>
      </View>

      <View style={styles.grid}>
        {OCCASIONS.map((occasion) => (
          <View key={occasion} style={styles.gridItem}>
            <OptionCard
              label={occasion}
              selected={selectedOccasion === occasion}
              onPress={() => handleOccasionPress(occasion)}
            />
          </View>
        ))}
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  gridItem: {
    width: '48%',
    flexGrow: 1,
  },
});
