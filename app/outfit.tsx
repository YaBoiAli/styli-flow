import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/BackButton';
import { OutfitCard } from '@/components/OutfitCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { colors, spacing, typography } from '@/constants/theme';
import { saveGeneratedOutfit } from '@/lib/savedOutfits';
import { updateProfilePreferences } from '@/lib/profile';

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
  const [saving, setSaving] = useState(false);

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

  if (generationError || !generatedOutfit) {
    return (
      <Screen
        contentStyle={styles.content}
        footer={
          <View style={styles.actions}>
            <PrimaryButton
              label="Try again"
              onPress={() => {
                prepareRebuild();
                router.replace('/generation');
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
        <Text style={styles.errorTitle}>Couldn&apos;t lock the fit</Text>
        <Text style={styles.errorBody}>
          {generationError ??
            "Your stylist couldn't find the right fit. Try again."}
        </Text>
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

    setSaving(true);
    try {
      await saveGeneratedOutfit({
        outfit: generatedOutfit,
        style: selectedStyle,
        occasion: selectedOccasion,
        budget: selectedBudget,
        userId: user.id,
      });
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
        err instanceof Error ? err.message : 'Try again in a moment.',
      );
    } finally {
      setSaving(false);
    }
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
            loading={saving}
            onPress={() => void handleSave()}
          />
          <PrimaryButton
            label="Rebuild"
            variant="ghost"
            onPress={() => {
              prepareRebuild();
              router.replace('/generation');
            }}
          />
        </View>
      }
    >
      <BackButton fallbackHref="/budget" />
      <OutfitCard outfit={generatedOutfit} />
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
  errorTitle: {
    ...typography.title,
    color: colors.text,
  },
  errorBody: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
