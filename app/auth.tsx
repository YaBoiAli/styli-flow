import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BackButton } from '@/components/BackButton';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { updateProfilePreferences } from '@/lib/profile';
import { saveGeneratedOutfit } from '@/lib/savedOutfits';
import { getSupabase } from '@/lib/supabase';

export default function AuthScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    mode?: string;
    redirect?: string;
  }>();
  const initialMode = params.mode === 'signup' ? 'signup' : 'signin';
  const redirectTo = typeof params.redirect === 'string' ? params.redirect : '/saved';

  const { signIn, signUp, pendingSaveOutfit, setPendingSaveOutfit, user } =
    useAuth();
  const { selectedStyle, selectedOccasion, selectedBudget } = usePreferences();

  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(
    () => (mode === 'signup' ? 'Create your Styli account' : 'Welcome back'),
    [mode],
  );

  const subtitle = useMemo(
    () =>
      pendingSaveOutfit
        ? 'Sign in to save this fit to your closet.'
        : mode === 'signup'
          ? 'Save outfits and keep your vibe in sync.'
          : 'Sign in to access saved fits.',
    [mode, pendingSaveOutfit],
  );

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      if (mode === 'signup') {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }

      // Confirm session user after auth succeeds.
      const { data } = await getSupabase().auth.getUser();
      const userId = data.user?.id ?? user?.id;

      if (selectedStyle && selectedOccasion) {
        try {
          await updateProfilePreferences({
            preferredStyles: [selectedStyle],
            preferredOccasions: [selectedOccasion],
            onboardingCompleted: true,
          });
        } catch {
          // Non-blocking for auth success
        }
      }

      if (pendingSaveOutfit && userId && selectedStyle && selectedOccasion && selectedBudget) {
        await saveGeneratedOutfit({
          outfit: pendingSaveOutfit,
          style: selectedStyle,
          occasion: selectedOccasion,
          budget: selectedBudget,
          userId,
        });
        setPendingSaveOutfit(null);
        router.replace('/saved');
        return;
      }

      router.replace(redirectTo as '/saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          <PrimaryButton
            label={mode === 'signup' ? 'Create account' : 'Sign in'}
            loading={loading}
            onPress={() => void handleSubmit()}
          />
          <PrimaryButton
            label={
              mode === 'signup'
                ? 'Already have an account? Sign in'
                : 'Need an account? Create one'
            }
            variant="ghost"
            onPress={() =>
              setMode((current) => (current === 'signup' ? 'signin' : 'signup'))
            }
          />
        </View>
      }
    >
      <BackButton fallbackHref="/" />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      <View style={styles.fields}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="you@email.com"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={email}
          onChangeText={setEmail}
        />
        <Text style={styles.label}>Password</Text>
        <TextInput
          secureTextEntry
          autoComplete={mode === 'signup' ? 'new-password' : 'password'}
          placeholder="••••••••"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={password}
          onChangeText={setPassword}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  subtitle: {
    ...typography.subtitle,
    color: colors.textSecondary,
  },
  fields: {
    gap: spacing.sm,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  input: {
    minHeight: 52,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    ...typography.body,
    color: colors.text,
  },
  footer: {
    gap: spacing.sm,
  },
  error: {
    ...typography.body,
    color: colors.danger,
  },
});
