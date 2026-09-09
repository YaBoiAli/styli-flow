import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { colors, spacing, typography } from '@/constants/theme';
import { trackEvent } from '@/lib/analytics';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <Screen
      scroll={false}
      contentStyle={styles.content}
      footer={
        <PrimaryButton
          label="Get Started"
          testID="btn-get-started"
          onPress={() => {
            trackEvent('onboarding_started');
            router.push('/style');
          }}
        />
      }
    >
      <View style={styles.hero}>
        <Animated.Text entering={FadeInDown.duration(700)} style={styles.brand}>
          Styli
        </Animated.Text>
        <Animated.Text
          entering={FadeInUp.delay(180).duration(700)}
          style={styles.tagline}
        >
          Your AI stylist,{'\n'}in your pocket.
        </Animated.Text>
        <Animated.Text
          entering={FadeInUp.delay(320).duration(700)}
          style={styles.support}
        >
          Pick a vibe. Set a budget. Get a fit that feels like you.
        </Animated.Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    justifyContent: 'center',
  },
  hero: {
    gap: spacing.lg,
    paddingTop: spacing.xxl,
  },
  brand: {
    ...typography.brand,
    color: colors.text,
  },
  tagline: {
    ...typography.hero,
    color: colors.text,
  },
  support: {
    ...typography.subtitle,
    color: colors.textSecondary,
    maxWidth: 300,
  },
});
