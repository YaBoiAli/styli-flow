import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/BackButton';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { OutfitCard } from '@/components/OutfitCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { colors, spacing, typography } from '@/constants/theme';
import { friendlyError } from '@/lib/errors';
import {
  deleteSavedOutfit,
  fetchSavedOutfit,
  savedDetailToOutfit,
  type SavedOutfitDetail,
} from '@/lib/savedOutfits';

export default function SavedOutfitDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<SavedOutfitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchSavedOutfit(id);
      setDetail(next);
    } catch (err) {
      setError(friendlyError(err, "Couldn't open that fit."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Screen scroll={false} contentStyle={styles.centered}>
        <LoadingAnimation message="Opening your fit..." stepIndex={1} stepCount={3} />
      </Screen>
    );
  }

  if (error || !detail) {
    return (
      <Screen
        contentStyle={styles.content}
        footer={
          <PrimaryButton
            label="Back to Saved"
            onPress={() => router.replace('/saved')}
          />
        }
      >
        <BackButton fallbackHref="/saved" />
        <Text style={styles.errorTitle}>Couldn&apos;t open that fit</Text>
        <Text style={styles.errorBody}>
          {error ?? 'Try again from your saved closet.'}
        </Text>
      </Screen>
    );
  }

  return (
    <Screen
      contentStyle={styles.content}
      footer={
        <PrimaryButton
          label="Delete outfit"
          variant="secondary"
          onPress={() => {
            Alert.alert(
              'Delete this fit?',
              'This removes it from your saved closet.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => {
                    void (async () => {
                      try {
                        await deleteSavedOutfit(detail.id);
                        router.replace('/saved');
                      } catch (err) {
                        Alert.alert(
                          'Couldn’t delete',
                          friendlyError(err, 'Try again in a moment.'),
                        );
                      }
                    })();
                  },
                },
              ],
            );
          }}
        />
      }
    >
      <BackButton fallbackHref="/saved" />
      <OutfitCard
        outfit={savedDetailToOutfit(detail)}
        budget={detail.budget}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
