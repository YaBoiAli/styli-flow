import { useRouter } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/BackButton';
import { OutfitCard } from '@/components/OutfitCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { usePreferences } from '@/context/PreferencesContext';
import { colors, spacing, typography } from '@/constants/theme';

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
