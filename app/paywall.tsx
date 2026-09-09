import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/BackButton';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useSubscription } from '@/context/SubscriptionContext';
import {
  PAYWALL_FEATURES,
} from '@/constants/subscriptions';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { premiumStatusLabel, trackEvent } from '@/lib/analytics';

export default function PaywallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ redirect?: string }>();
  const redirectTo =
    typeof params.redirect === 'string' ? params.redirect : '/style';
  const {
    purchaseMonthly,
    purchaseYearly,
    restore,
    monthlyPackage,
    yearlyPackage,
    configured,
    isPremium,
    refreshCustomerInfo,
  } = useSubscription();

  const [loading, setLoading] = useState<'monthly' | 'yearly' | 'restore' | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trackEvent('paywall_viewed', {
      premium_status: premiumStatusLabel(isPremium),
      redirect: redirectTo,
    });
  }, [isPremium, redirectTo]);

  async function finishSuccess() {
    await refreshCustomerInfo();
    router.replace(redirectTo as '/style');
  }

  async function handlePurchase(kind: 'monthly' | 'yearly') {
    setLoading(kind);
    setError(null);
    trackEvent('purchase_started', {
      plan: kind,
      premium_status: premiumStatusLabel(isPremium),
    });
    try {
      const ok =
        kind === 'monthly' ? await purchaseMonthly() : await purchaseYearly();
      if (!ok) {
        setError('Purchase completed, but premium is not active yet.');
        return;
      }
      trackEvent('purchase_completed', {
        plan: kind,
        premium_status: 'premium',
      });
      await finishSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Purchase failed.';
      if (message.toLowerCase().includes('cancel')) {
        setError(null);
      } else {
        setError("Couldn't complete the purchase. Try again.");
      }
    } finally {
      setLoading(null);
    }
  }

  async function handleRestore() {
    setLoading('restore');
    setError(null);
    try {
      const ok = await restore();
      if (!ok) {
        setError('No active premium purchases found.');
        return;
      }
      trackEvent('subscription_restored', {
        premium_status: 'premium',
      });
      await finishSuccess();
    } catch {
      setError("Couldn't restore purchases.");
    } finally {
      setLoading(null);
    }
  }

  const monthlyPrice =
    monthlyPackage?.product.priceString ?? 'Monthly Premium';
  const yearlyPrice = yearlyPackage?.product.priceString ?? 'Yearly Premium';

  return (
    <Screen
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          {!configured ? (
            <Text style={styles.error}>
              RevenueCat is not configured. Add EXPO_PUBLIC_REVENUECAT_API_KEY.
            </Text>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {monthlyPackage || yearlyPackage ? (
            <Text style={styles.priceHint}>
              {[
                monthlyPackage ? `Monthly ${monthlyPrice}` : null,
                yearlyPackage ? `Yearly ${yearlyPrice}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : configured ? (
            <Text style={styles.error}>
              No Premium packages found. Check RevenueCat offerings for{' '}
              vibe_premium_monthly / vibe_premium_yearly.
            </Text>
          ) : null}
          <PrimaryButton
            label={isPremium ? "You're on Vibe Pro" : 'Start Premium'}
            loading={loading === 'monthly' || loading === 'yearly'}
            disabled={
              !configured ||
              isPremium ||
              (!monthlyPackage && !yearlyPackage)
            }
            onPress={() =>
              void handlePurchase(monthlyPackage ? 'monthly' : 'yearly')
            }
            testID="btn-start-premium"
          />
          {yearlyPackage && monthlyPackage ? (
            <PrimaryButton
              label={`Yearly · ${yearlyPrice}`}
              variant="secondary"
              loading={loading === 'yearly'}
              disabled={!configured || isPremium}
              onPress={() => void handlePurchase('yearly')}
              testID="btn-start-premium-yearly"
            />
          ) : null}
          <PrimaryButton
            label="Restore Purchases"
            variant="ghost"
            loading={loading === 'restore'}
            disabled={!configured}
            onPress={() => void handleRestore()}
            testID="btn-restore-purchases"
          />
        </View>
      }
    >
      <BackButton fallbackHref="/" />
      <Text style={styles.kicker}>Vibe Premium</Text>
      <Text style={styles.headline}>Your closet just got smarter.</Text>
      <Text style={styles.support}>
        Unlock unlimited AI styling, premium trends, and rebuilds that keep up
        with you.
      </Text>

      <View style={styles.features}>
        {PAYWALL_FEATURES.map((feature) => (
          <View key={feature} style={styles.featureRow}>
            <View style={styles.dot} />
            <Text style={styles.featureText}>{feature}</Text>
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
  kicker: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  headline: {
    ...typography.hero,
    color: colors.text,
  },
  support: {
    ...typography.subtitle,
    color: colors.textSecondary,
  },
  features: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radii.full,
    backgroundColor: colors.accent,
  },
  featureText: {
    ...typography.label,
    fontSize: 16,
    color: colors.text,
  },
  footer: {
    gap: spacing.sm,
  },
  priceHint: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  error: {
    ...typography.caption,
    color: colors.danger,
    textAlign: 'center',
  },
});
