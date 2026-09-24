import { useRouter } from 'expo-router';
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { colors, spacing, typography } from '@/constants/theme';
import { trackEvent } from '@/lib/analytics';

const wallpaper = require('../../assets/images/get-started-wall.jpg');

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const ctaWidth = Math.max(width * 0.5, 280);

  return (
    <View style={styles.root}>
      <Image
        source={wallpaper}
        resizeMode="cover"
        style={styles.wallpaper}
        accessibilityIgnoresInvertColors
      />
      <Screen scroll={false} transparent contentStyle={styles.content}>
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
          <PrimaryButton
            label="Get Started"
            testID="btn-get-started"
            style={[styles.cta, { width: ctaWidth }]}
            onPress={() => {
              trackEvent('onboarding_started');
              router.push('/you');
            }}
          />
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  wallpaper: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  content: {
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  cta: {
    marginTop: spacing.lg,
    alignSelf: 'center',
  },
  hero: {
    width: '100%',
  },
  brand: {
    ...typography.brand,
    fontFamily: 'BodoniModa_700Bold',
    lineHeight: 60,
    color: colors.text,
    marginBottom: spacing.md,
  },
  tagline: {
    ...typography.hero,
    fontFamily: 'BodoniModa_700Bold',
    lineHeight: 48,
    color: colors.text,
    marginBottom: spacing.md,
  },
  support: {
    ...typography.subtitle,
    fontFamily: 'BodoniModa_400Regular',
    color: '#1F1D1B',
    maxWidth: 360,
  },
});
