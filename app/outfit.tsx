import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { BackButton } from '@/components/BackButton';
import { OutfitCard } from '@/components/OutfitCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { usePreferences } from '@/context/PreferencesContext';
import { buildMockOutfit } from '@/data/mockOutfits';
import { spacing } from '@/constants/theme';

export default function OutfitScreen() {
  const router = useRouter();
  const {
    selectedStyle,
    selectedOccasion,
    selectedBudget,
    resetPreferences,
  } = usePreferences();

  const outfit = useMemo(() => {
    if (!selectedStyle || !selectedOccasion || !selectedBudget) {
      return null;
    }
    return buildMockOutfit(selectedStyle, selectedOccasion, selectedBudget);
  }, [selectedStyle, selectedOccasion, selectedBudget]);

  if (!outfit) {
    return (
      <Screen contentStyle={styles.content}>
        <BackButton fallbackHref="/" />
        <PrimaryButton label="Start over" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.content}>
      <BackButton fallbackHref="/budget" />
      <OutfitCard outfit={outfit} />

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
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
  },
  actions: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
});
