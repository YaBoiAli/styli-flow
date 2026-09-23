import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/BackButton';
import { OutfitCard } from '@/components/OutfitCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { useSubscription } from '@/context/SubscriptionContext';
import { FREE_SAVE_LIMIT } from '@/constants/subscriptions';
import { colors, spacing, typography } from '@/constants/theme';
import {
  countSavedOutfits,
  saveGeneratedOutfit,
} from '@/lib/savedOutfits';
import { updateProfilePreferences } from '@/lib/profile';
import {
  getBudgetRange,
  premiumStatusLabel,
  trackEvent,
} from '@/lib/analytics';
import { friendlyError } from '@/lib/errors';

export default function OutfitScreen() {
  const router = useRouter();
  const {
    selectedStyle,
    selectedOccasion,
    selectedBudget,
    generatedOutfit,
    generationError,
    prepareRebuild,
  } = usePreferences();
  const { isAuthenticated, user, setPendingSaveOutfit } = useAuth();
  const { isPremium, checkCanGenerate } = useSubscription();
  const [saving, setSaving] = useState(false);

  const analyticsBase = {
    style: selectedStyle ?? undefined,
    occasion: selectedOccasion ?? undefined,
    budget: selectedBudget ?? undefined,
    budget_range: selectedBudget ? getBudgetRange(selectedBudget) : undefined,
    premium_status: premiumStatusLabel(isPremium),
    outfit_total: generatedOutfit?.total,
  };

  // Ask once after the user has seen a successful fit — not on cold launch.
  useEffect(() => {
    if (!generatedOutfit || generationError || notificationPromptedRef.current) {
      return;
    }
    notificationPromptedRef.current = true;
    const timer = setTimeout(() => {
      void maybeAskNotificationPermission();
    }, 1400);
    return () => clearTimeout(timer);
  }, [generatedOutfit, generationError]);

  if (!selectedStyle || !selectedOccasion || !selectedBudget) {
    return (
      <Screen
        contentStyle={styles.content}
        footer={
          <PrimaryButton label="Start over" onPress={() => router.replace('/')} />
        }
      >
        <BackButton fallbackHref="/" />
        <Text style={styles.errorTitle}>Let&apos;s start fresh</Text>
        <Text style={styles.errorBody}>
          Pick a vibe, occasion, and budget to build your next fit.
        </Text>
      </Screen>
    );
  }

  if (generationError || !generatedOutfit) {
    return (
      <Screen
        contentStyle={styles.content}
        footer={
          <View style={styles.actions}>
            <PrimaryButton
              label="Try again"
              onPress={() => {
                void (async () => {
                  const allowed = await checkCanGenerate();
                  if (!allowed) {
                    router.push('/paywall?redirect=/generation');
                    return;
                  }
                  prepareRebuild();
                  router.replace('/generation');
                })();
              }}
            />
            <PrimaryButton
              label="Adjust budget"
              variant="secondary"
              onPress={() => router.replace('/budget')}
            />
          </View>
        }
      >
        <BackButton fallbackHref="/budget" />
        <View style={styles.errorBlock}>
          <Text style={styles.errorEyebrow}>Almost</Text>
          <Text style={styles.errorTitle}>Couldn&apos;t lock the fit</Text>
          <Text style={styles.errorBody}>
            {friendlyError(
              generationError,
              "Your stylist couldn't find the right fit. Try again.",
            )}
          </Text>
        </View>
      </Screen>
    );
  }

  async function handleSave() {
    if (!generatedOutfit || !selectedStyle || !selectedOccasion || !selectedBudget) {
      return;
    }

    if (!isAuthenticated || !user) {
      setPendingSaveOutfit(generatedOutfit);
      Alert.alert(
        'Save this fit?',
        'Sign in to keep it in your Styli closet.',
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Sign in',
            onPress: () => router.push('/auth?mode=signin&redirect=/saved'),
          },
        ],
      );
      return;
    }

    if (!isPremium) {
      try {
        const savedCount = await countSavedOutfits();
        if (savedCount >= FREE_SAVE_LIMIT) {
          Alert.alert(
            'Free save limit reached',
            `Free Plan includes ${FREE_SAVE_LIMIT} saved outfits. Upgrade for unlimited saves.`,
            [
              { text: 'Not now', style: 'cancel' },
              {
                text: 'Upgrade',
                onPress: () => router.push('/paywall?redirect=/outfit'),
              },
            ],
          );
          return;
        }
      } catch {
        // If count fails, still attempt save and let backend enforce later.
      }
    }

    setSaving(true);
    try {
      await saveGeneratedOutfit({
        outfit: generatedOutfit,
        style: selectedStyle,
        occasion: selectedOccasion,
        budget: selectedBudget,
        userId: user.id,
      });
      trackEvent('outfit_saved', analyticsBase);
      try {
        await updateProfilePreferences({
          preferredStyles: [selectedStyle],
          preferredOccasions: [selectedOccasion],
          onboardingCompleted: true,
        });
      } catch {
        // Preferences sync is best-effort.
      }
      Alert.alert('Saved', 'This fit is in your closet.', [
        { text: 'View saved', onPress: () => router.push('/saved') },
        { text: 'Nice', style: 'cancel' },
      ]);
    } catch (err) {
      Alert.alert(
        'Couldn’t save',
        friendlyError(err, 'Try again in a moment.'),
      );
    } finally {
      setSaving(false);
    }
  }

  function handleShop() {
    if (!generatedOutfit) return;
    const firstShopUrl = generatedOutfit.products.find(
      (product) => product.purchaseUrl,
    )?.purchaseUrl;
    if (firstShopUrl) {
      void Linking.openURL(firstShopUrl).catch(() => {
        Alert.alert(
          'Couldn’t open shop',
          'Try tapping a piece below, or check back in a moment.',
        );
      });
      return;
    }
    Alert.alert(
      'Shop the pieces',
      'Tap any item in the fit to open its shopping link.',
    );
  }

  return (
    <Screen
      contentStyle={styles.content}
      footer={
        <View style={styles.actions}>
          <PrimaryButton label="Shop this fit" onPress={handleShop} />
          <PrimaryButton
            label="♡ Save"
            variant="secondary"
            loading={saving}
            onPress={() => void handleSave()}
          />
          <PrimaryButton
            label="Rebuild"
            variant="ghost"
            onPress={() => {
              if (!isPremium) {
                router.push('/paywall?redirect=/outfit');
                return;
              }
              void (async () => {
                const allowed = await checkCanGenerate();
                if (!allowed) {
                  router.push('/paywall?redirect=/generation');
                  return;
                }
                trackEvent('outfit_rebuilt', analyticsBase);
                prepareRebuild();
                router.replace('/generation');
              })();
            }}
          />
        </View>
      }
    >
      <BackButton fallbackHref="/budget" />
      <OutfitCard outfit={generatedOutfit} budget={selectedBudget} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
  },
  actions: {
    gap: spacing.sm,
  },
  errorBlock: {
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  errorEyebrow: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  errorTitle: {
    ...typography.title,
    color: colors.text,
  },
  errorBody: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
