import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { SavedOutfitCard } from '@/components/SavedOutfitCard';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/context/AuthContext';
import { colors, spacing, typography } from '@/constants/theme';
import {
  fetchSavedOutfits,
  type SavedOutfitSummary,
} from '@/lib/savedOutfits';

export default function SavedScreen() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [outfits, setOutfits] = useState<SavedOutfitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setOutfits([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const rows = await fetchSavedOutfits();
      setOutfits(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load saved fits.");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (authLoading || loading) {
    return (
      <Screen scroll={false} contentStyle={styles.centered}>
        <ActivityIndicator color={colors.text} />
      </Screen>
    );
  }

  if (!isAuthenticated) {
    return (
      <Screen
        contentStyle={styles.content}
        footer={
          <PrimaryButton
            label="Sign in to save fits"
            onPress={() => router.push('/auth?mode=signin&redirect=/saved')}
          />
        }
      >
        <Text style={styles.title}>Saved</Text>
        <Text style={styles.body}>
          Sign in to keep your favorite outfits and reopen them anytime.
        </Text>
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.content}>
      <Text style={styles.title}>Saved</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!error && outfits.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.body}>No saved fits yet.</Text>
          <PrimaryButton
            label="Build a fit"
            onPress={() => router.push('/style')}
          />
        </View>
      ) : (
        <View style={styles.list}>
          {outfits.map((outfit) => (
            <SavedOutfitCard
              key={outfit.id}
              outfit={outfit}
              onPress={() => router.push(`/saved/${outfit.id}`)}
            />
          ))}
        </View>
      )}
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
  title: {
    ...typography.title,
    color: colors.text,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
  },
  error: {
    ...typography.body,
    color: colors.danger,
  },
  empty: {
    gap: spacing.md,
  },
  list: {
    gap: spacing.md,
  },
});
