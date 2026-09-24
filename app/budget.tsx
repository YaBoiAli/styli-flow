import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/BackButton';
import { BudgetSelector } from '@/components/BudgetSelector';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { usePreferences } from '@/context/PreferencesContext';
import { useSubscription } from '@/context/SubscriptionContext';
import { colors, spacing, typography } from '@/constants/theme';
import {
  getBudgetRange,
  premiumStatusLabel,
  trackEvent,
} from '@/lib/analytics';

export default function BudgetScreen() {
  const router = useRouter();
  const {
    selectedStyle,
    selectedOccasion,
    selectedBudget,
    setBudget,
  } = usePreferences();
  const { isPremium } = useSubscription();

  useEffect(() => {
    if (!selectedStyle) {
      router.replace('/style');
      return;
    }
    if (!selectedOccasion) {
      router.replace('/occasion');
    }
  }, [selectedStyle, selectedOccasion, router]);

  function handleBudgetChange(budget: number) {
    setBudget(budget);
    trackEvent('budget_selected', {
      budget,
      budget_range: getBudgetRange(budget),
      style: selectedStyle ?? undefined,
      occasion: selectedOccasion ?? undefined,
      premium_status: premiumStatusLabel(isPremium),
    });
  }

  return (
    <Screen
      contentStyle={styles.content}
      footer={
        <PrimaryButton
          label="Continue"
          testID="btn-continue-budget"
          disabled={!selectedBudget || selectedBudget <= 0}
          onPress={() => router.push('/inspiration')}
        />
      }
    >
      <View style={styles.top}>
        <BackButton fallbackHref="/occasion" />
        <OnboardingProgress step="Budget" />
        <Text style={styles.title}>What&apos;s your budget?</Text>
        <Text style={styles.subtitle}>
          Stay on budget without watering down the look.
        </Text>
      </View>

      <BudgetSelector value={selectedBudget} onChange={handleBudgetChange} />
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
