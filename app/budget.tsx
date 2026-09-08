import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/BackButton';
import { BudgetSelector } from '@/components/BudgetSelector';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { usePreferences } from '@/context/PreferencesContext';
import { colors, spacing, typography } from '@/constants/theme';

export default function BudgetScreen() {
  const router = useRouter();
  const {
    selectedStyle,
    selectedOccasion,
    selectedBudget,
    setBudget,
  } = usePreferences();

  useEffect(() => {
    if (!selectedStyle) {
      router.replace('/style');
      return;
    }
    if (!selectedOccasion) {
      router.replace('/occasion');
    }
  }, [selectedStyle, selectedOccasion, router]);

  return (
    <Screen
      contentStyle={styles.content}
      footer={
        <PrimaryButton
          label="Build my fit"
          disabled={!selectedBudget || selectedBudget <= 0}
          onPress={() => router.push('/generation')}
        />
      }
    >
      <View style={styles.top}>
        <BackButton fallbackHref="/occasion" />
        <Text style={styles.title}>What&apos;s your budget?</Text>
        <Text style={styles.subtitle}>
          Stay on budget without watering down the look.
        </Text>
      </View>

      <BudgetSelector value={selectedBudget} onChange={setBudget} />
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
});
