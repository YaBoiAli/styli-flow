import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/BackButton';
import { OutfitCard } from '@/components/OutfitCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { usePreferences } from '@/context/PreferencesContext';
import { colors, spacing, typography } from '@/constants/theme';
import { buildOutfitFromCatalog } from '@/lib/products';
import type { Outfit } from '@/types';

export default function OutfitScreen() {
  const router = useRouter();
  const {
    selectedStyle,
    selectedOccasion,
    selectedBudget,
    resetPreferences,
  } = usePreferences();

  const [outfit, setOutfit] = useState<Outfit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!selectedStyle || !selectedOccasion || !selectedBudget) {
        setOutfit(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const next = await buildOutfitFromCatalog({
          style: selectedStyle,
          occasion: selectedOccasion,
          budget: selectedBudget,
        });
        if (!cancelled) {
          setOutfit(next);
        }
      } catch (err) {
        if (!cancelled) {
          setOutfit(null);
          setError(err instanceof Error ? err.message : 'Failed to load products');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [selectedStyle, selectedOccasion, selectedBudget]);

  if (!selectedStyle || !selectedOccasion || !selectedBudget) {
    return (
      <Screen
        contentStyle={styles.content}
        footer={
          <PrimaryButton label="Start over" onPress={() => router.replace('/')} />
        }
      >
        <BackButton fallbackHref="/" />
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen scroll={false} contentStyle={styles.centered}>
        <ActivityIndicator color={colors.text} />
        <Text style={styles.status}>Loading products…</Text>
      </Screen>
    );
  }

  if (error || !outfit) {
    return (
      <Screen
        contentStyle={styles.content}
        footer={
          <PrimaryButton label="Start over" onPress={() => router.replace('/')} />
        }
      >
        <BackButton fallbackHref="/budget" />
        <Text style={styles.errorTitle}>Couldn’t load your fit</Text>
        <Text style={styles.errorBody}>
          {error ?? 'No products matched this vibe yet.'}
        </Text>
      </Screen>
    );
  }

  return (
    <Screen
      contentStyle={styles.content}
      footer={
        <View style={styles.actions}>
          <PrimaryButton
            label="Shop this fit"
            onPress={() =>
              Alert.alert('Coming soon', 'Shopping links land in a later stage.')
            }
          />
          <PrimaryButton
            label="♡ Save"
            variant="secondary"
            onPress={() =>
              Alert.alert('Saved', 'Outfit saved locally for now (placeholder).')
            }
          />
          <PrimaryButton
            label="Rebuild"
            variant="ghost"
            onPress={() => {
              resetPreferences();
              router.replace('/style');
            }}
          />
        </View>
      }
    >
      <BackButton fallbackHref="/budget" />
      <OutfitCard outfit={outfit} />
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  status: {
    ...typography.body,
    color: colors.textSecondary,
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
