import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { useSubscription } from '@/context/SubscriptionContext';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { fetchProfile } from '@/lib/profile';
import type { Profile } from '@/types/database';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading, signOut } = useAuth();
  const { selectedStyle, selectedOccasion, selectedBudget } = usePreferences();
  const { isPremium, loading: subLoading } = useSubscription();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await fetchProfile();
      setProfile(next);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't load profile.");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (authLoading || loading || subLoading) {
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
          <View style={styles.actions}>
            <PrimaryButton
              label="Create account"
              onPress={() => router.push('/auth?mode=signup&redirect=/profile')}
            />
            <PrimaryButton
              label="Sign in"
              variant="secondary"
              onPress={() => router.push('/auth?mode=signin&redirect=/profile')}
            />
          </View>
        }
      >
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.body}>
          Create a free Styli account to save fits and sync your vibe.
        </Text>
      </Screen>
    );
  }

  const preferredStyles =
    profile?.preferred_styles?.length
      ? profile.preferred_styles.join(', ')
      : selectedStyle ?? 'Not set yet';
  const preferredOccasions =
    profile?.preferred_occasions?.length
      ? profile.preferred_occasions.join(', ')
      : selectedOccasion ?? 'Not set yet';

  return (
    <Screen
      contentStyle={styles.content}
      footer={
        <PrimaryButton
          label="Sign out"
          variant="secondary"
          onPress={async () => {
            try {
              await signOut();
              router.replace('/profile');
            } catch (err) {
              setMessage(
                err instanceof Error ? err.message : "Couldn't sign out.",
              );
            }
          }}
        />
      }
    >
      <Text style={styles.title}>Profile</Text>
      {message ? <Text style={styles.error}>{message}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{user?.email ?? profile?.email ?? '—'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Selected preferences</Text>
        <Text style={styles.value}>Style: {preferredStyles}</Text>
        <Text style={styles.value}>Occasion: {preferredOccasions}</Text>
        <Text style={styles.value}>
          Budget: {selectedBudget ? `$${selectedBudget}` : 'Not set yet'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Plan</Text>
        <Text style={styles.value} testID="plan-status">
          {isPremium ? 'Vibe Pro' : 'Free Plan'}
        </Text>
        {!isPremium ? (
          <>
            <Text style={styles.hint}>
              Unlock unlimited AI fits, premium styles, and rebuilds.
            </Text>
            <PrimaryButton
              label="Upgrade to Vibe Pro"
              onPress={() => router.push('/paywall?redirect=/profile')}
            />
          </>
        ) : (
          <Text style={styles.hint}>Unlimited generations and premium styles.</Text>
        )}
      </View>
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  value: {
    ...typography.body,
    color: colors.text,
  },
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  actions: {
    gap: spacing.sm,
  },
  error: {
    ...typography.body,
    color: colors.danger,
  },
});
