import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/BackButton';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { StyleCard } from '@/components/StyleCard';
import { usePreferences } from '@/context/PreferencesContext';
import { useSubscription } from '@/context/SubscriptionContext';
import { isPremiumStyle } from '@/constants/subscriptions';
import { colors, spacing, typography } from '@/constants/theme';
import { premiumStatusLabel, trackEvent } from '@/lib/analytics';
import { STYLES, type Style } from '@/types';

export default function StyleScreen() {
  const router = useRouter();
  const { selectedStyle, setStyle } = usePreferences();
  const { isPremium } = useSubscription();

  function handleStylePress(styleName: Style) {
    if (isPremiumStyle(styleName) && !isPremium) {
      router.push('/paywall?redirect=/style');
      return;
    }
    setStyle(styleName);
    trackEvent('style_selected', {
      style: styleName,
      premium_status: premiumStatusLabel(isPremium),
    });
  }

  return (
    <Screen
      contentStyle={styles.content}
      footer={
        <PrimaryButton
          label="Continue"
          testID="btn-continue-style"
          disabled={!selectedStyle}
          onPress={() => router.push('/occasion')}
        />
      }
    >
      <View style={styles.top}>
        <BackButton />
        <Text style={styles.title}>What&apos;s your vibe?</Text>
        <Text style={styles.subtitle}>Choose one style to start shaping your fit.</Text>
      </View>

      <View style={styles.grid}>
        {STYLES.map((styleName) => (
          <View key={styleName} style={styles.gridItem}>
            <StyleCard
              styleName={styleName}
              selected={selectedStyle === styleName}
              onPress={() => handleStylePress(styleName)}
            />
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
  },
  top: {
    gap: spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  subtitle: {
    ...typography.subtitle,
    color: colors.textSecondary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  gridItem: {
    width: '48%',
    flexGrow: 1,
  },
});
