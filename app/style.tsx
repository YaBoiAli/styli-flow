import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/BackButton';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { StyleCard } from '@/components/StyleCard';
import { usePreferences } from '@/context/PreferencesContext';
import { colors, spacing, typography } from '@/constants/theme';
import { STYLES } from '@/types';

export default function StyleScreen() {
  const router = useRouter();
  const { selectedStyle, setStyle } = usePreferences();

  return (
    <Screen contentStyle={styles.content}>
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
              onPress={() => setStyle(styleName)}
            />
          </View>
        ))}
      </View>

      <PrimaryButton
        label="Continue"
        disabled={!selectedStyle}
        onPress={() => router.push('/occasion')}
      />
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
