import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LoadingAnimation } from '@/components/LoadingAnimation';
import { Screen } from '@/components/Screen';
import { usePreferences } from '@/context/PreferencesContext';
import { spacing } from '@/constants/theme';

const LOADING_MESSAGES = [
  'Finding your vibe...',
  'Matching pieces...',
  'Balancing your budget...',
  'Styling your outfit...',
  'Finalizing your fit...',
] as const;

const STEP_MS = 900;

export default function GenerationScreen() {
  const router = useRouter();
  const { selectedStyle, selectedOccasion, selectedBudget } = usePreferences();
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (!selectedStyle || !selectedOccasion || !selectedBudget) {
      router.replace('/');
    }
  }, [selectedStyle, selectedOccasion, selectedBudget, router]);

  useEffect(() => {
    if (messageIndex >= LOADING_MESSAGES.length - 1) {
      const timeout = setTimeout(() => {
        router.replace('/outfit');
      }, STEP_MS);
      return () => clearTimeout(timeout);
    }

    const timeout = setTimeout(() => {
      setMessageIndex((current) => current + 1);
    }, STEP_MS);

    return () => clearTimeout(timeout);
  }, [messageIndex, router]);

  return (
    <Screen scroll={false} contentStyle={styles.content}>
      <View style={styles.center}>
        <LoadingAnimation message={LOADING_MESSAGES[messageIndex]} />
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
