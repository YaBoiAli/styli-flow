import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/BackButton';
import { BudgetSelector } from '@/components/BudgetSelector';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { OptionCard } from '@/components/OptionCard';
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

const SHOE_BUDGET_PRESETS = [40, 60, 80, 100, 150] as const;

export default function BudgetScreen() {
  const router = useRouter();
  const {
    selectedStyle,
    selectedOccasion,
    selectedBudget,
    shoesInBudget,
    shoeBudget,
    setBudget,
    setShoesInBudget,
    setShoeBudget,
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

  const hasOutfitBudget = Boolean(selectedBudget && selectedBudget > 0);
  const hasShoeBudget = shoesInBudget || Boolean(shoeBudget && shoeBudget > 0);

  return (
    <Screen
      contentStyle={styles.content}
      footer={
        <PrimaryButton
          label="Continue"
          testID="btn-continue-budget"
          disabled={!hasOutfitBudget || !hasShoeBudget}
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

      <BudgetSelector
        value={selectedBudget}
        onChange={handleBudgetChange}
        displayLabel={shoesInBudget ? 'Selected budget' : 'Outfit budget · no shoes'}
      />

      <View style={styles.shoes}>
        <View style={styles.shoesHeader}>
          <Text style={styles.sectionTitle}>Include shoes in this budget?</Text>
          <Text style={styles.sectionHint}>
            Choose No to give shoes a separate budget.
          </Text>
        </View>
        <View style={styles.toggleRow}>
          <View style={styles.toggleItem}>
            <OptionCard
              label="Yes"
              selected={shoesInBudget}
              onPress={() => setShoesInBudget(true)}
            />
          </View>
          <View style={styles.toggleItem}>
            <OptionCard
              label="No"
              selected={!shoesInBudget}
              onPress={() => setShoesInBudget(false)}
            />
          </View>
        </View>

        {!shoesInBudget ? (
          <View style={styles.shoeBudget} testID="shoe-budget-section">
            <Text style={styles.sectionTitle}>
              Shoe budget{shoeBudget ? ` · $${shoeBudget}` : ''}
            </Text>
            <BudgetSelector
              compact
              value={shoeBudget}
              onChange={setShoeBudget}
              presets={SHOE_BUDGET_PRESETS}
              customLabel="Custom shoe budget"
              testIDPrefix="shoe-budget"
            />
          </View>
        ) : null}
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
  shoes: {
    gap: spacing.md,
  },
  shoesHeader: {
    gap: spacing.xs,
  },
  sectionTitle: {
    ...typography.label,
    fontSize: 16,
    color: colors.text,
  },
  sectionHint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  toggleItem: {
    flex: 1,
  },
  shoeBudget: {
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
});
