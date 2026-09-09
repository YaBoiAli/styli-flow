import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LoadingAnimation } from '@/components/LoadingAnimation';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { useSubscription } from '@/context/SubscriptionContext';
import { motion, spacing } from '@/constants/theme';
import {
  getBudgetRange,
  premiumStatusLabel,
  trackEvent,
} from '@/lib/analytics';
import { friendlyError } from '@/lib/errors';
import {
  generateOutfit,
  OutfitGenerationError,
} from '@/lib/generateOutfit';

const LOADING_MESSAGES = [
  'Finding your vibe...',
  'Matching pieces...',
  'Balancing your budget...',
  'Styling your outfit...',
  'Finalizing your fit...',
] as const;

export default function GenerationScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    selectedStyle,
    selectedOccasion,
    selectedBudget,
    excludeProductIds,
    setGeneratedOutfit,
    setGenerationError,
    clearGeneration,
  } = usePreferences();
  const { checkCanGenerate, consumeGeneration, isPremium } = useSubscription();
  const [messageIndex, setMessageIndex] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!selectedStyle || !selectedOccasion || !selectedBudget) {
      router.replace('/');
    }
  }, [selectedStyle, selectedOccasion, selectedBudget, router]);

  useEffect(() => {
    if (messageIndex >= LOADING_MESSAGES.length - 1) return;
    const timeout = setTimeout(() => {
      setMessageIndex((current) =>
        Math.min(current + 1, LOADING_MESSAGES.length - 1),
      );
    }, motion.step);
    return () => clearTimeout(timeout);
  }, [messageIndex]);

  useEffect(() => {
    if (!selectedStyle || !selectedOccasion || !selectedBudget) {
      return;
    }
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;

    let cancelled = false;

    async function run() {
      clearGeneration();
      const baseProps = {
        style: selectedStyle!,
        occasion: selectedOccasion!,
        budget: selectedBudget!,
        budget_range: getBudgetRange(selectedBudget!),
        premium_status: premiumStatusLabel(isPremium),
      };

      try {
        const allowed = await checkCanGenerate();
        if (!allowed) {
          if (!cancelled) {
            router.replace('/paywall?redirect=/generation');
          }
          return;
        }

        trackEvent('outfit_generation_started', baseProps);

        const outfit = await generateOutfit({
          style: selectedStyle!,
          occasion: selectedOccasion!,
          budget: selectedBudget!,
          excludeProductIds,
        });
        if (cancelled) return;

        await consumeGeneration();
        setGeneratedOutfit(outfit);
        setGenerationError(null);
        trackEvent('outfit_generated', {
          ...baseProps,
          outfit_total: outfit.total,
          product_count: outfit.products.length,
        });
        // Land on the last styling beat before revealing results.
        setMessageIndex(LOADING_MESSAGES.length - 1);
        setTimeout(() => {
          if (!cancelled) router.replace('/outfit');
        }, 420);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof OutfitGenerationError
            ? friendlyError(err, err.message)
            : friendlyError(
                err,
                "Your stylist couldn't find the right fit. Try again.",
              );
        trackEvent('outfit_generation_failed', {
          ...baseProps,
          error_code:
            err instanceof OutfitGenerationError ? err.code ?? 'unknown' : 'unknown',
        });
        setGeneratedOutfit(null);
        setGenerationError(message);
        router.replace('/outfit');
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    selectedStyle,
    selectedOccasion,
    selectedBudget,
    excludeProductIds,
    clearGeneration,
    setGeneratedOutfit,
    setGenerationError,
    router,
    checkCanGenerate,
    consumeGeneration,
    user?.id,
    isPremium,
  ]);

  return (
    <Screen scroll={false} contentStyle={styles.content}>
      <View style={styles.center}>
        <LoadingAnimation
          message={LOADING_MESSAGES[messageIndex]}
          stepIndex={messageIndex}
          stepCount={LOADING_MESSAGES.length}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    justifyContent: 'center',
    paddingBottom: spacing.xxl,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
  },
});
