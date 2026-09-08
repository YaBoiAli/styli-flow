import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/BackButton';
import { BudgetSelector } from '@/components/BudgetSelector';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { usePreferences } from '@/context/PreferencesContext';
import { useSubscription } from '@/context/SubscriptionContext';
import { FREE_GENERATION_LIMIT } from '@/constants/subscriptions';
import { colors, spacing, typography } from '@/constants/theme';

export default function BudgetScreen() {
  const router = useRouter();
  const {
    selectedStyle,
    selectedOccasion,
    selectedBudget,
    setBudget,
  } = usePreferences();
  const { isPremium, checkCanGenerate, generationsRemaining } = useSubscription();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!selectedStyle) {
      router.replace('/style');
      return;
    }
    if (!selectedOccasion) {
      router.replace('/occasion');
    }
  }, [selectedStyle, selectedOccasion, router]);

  async function handleBuild() {
    setChecking(true);
    try {
      const allowed = await checkCanGenerate();
      if (!allowed) {
        router.push('/paywall?redirect=/generation');
        return;
      }
      router.push('/generation');
    } finally {
      setChecking(false);
    }
  }

  return (
    <Screen
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          {!isPremium ? (
            <Text style={styles.quota} testID="generation-quota">
              {generationsRemaining === Number.POSITIVE_INFINITY
                ? 'Unlimited AI fits'
                : `${Math.min(generationsRemaining, FREE_GENERATION_LIMIT)} of ${FREE_GENERATION_LIMIT} free fits left`}
            </Text>
          ) : (
            <Text style={styles.quota}>Unlimited AI fits with Vibe Pro</Text>
          )}
          <PrimaryButton
            label="Build my fit"
            testID="btn-build-fit"
            loading={checking}
            disabled={!selectedBudget || selectedBudget <= 0}
            onPress={() => void handleBuild()}
          />
        </View>
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
  footer: {
    gap: spacing.sm,
  },
  quota: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
