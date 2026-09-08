import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { BackButton } from '@/components/BackButton';
import { OutfitCard } from '@/components/OutfitCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { colors, spacing, typography } from '@/constants/theme';
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
      setError(err instanceof Error ? err.message : "Couldn't open that fit.");
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
        <ActivityIndicator color={colors.text} />
      </Screen>
    );
  }

  if (error || !detail) {
    return (
      <Screen
        contentStyle={styles.content}
        footer={
          <PrimaryButton label="Back to Saved" onPress={() => router.replace('/saved')} />
        }
      >
        <BackButton fallbackHref="/saved" />
        <Text style={styles.error}>{error ?? "Couldn't open that fit."}</Text>
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
                          err instanceof Error
                            ? err.message
                            : 'Try again in a moment.',
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
      <OutfitCard outfit={savedDetailToOutfit(detail)} />
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
  error: {
    ...typography.body,
    color: colors.danger,
  },
});
