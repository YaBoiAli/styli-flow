import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors, radii, spacing, typography } from '@/constants/theme';
import { isPremiumStyle } from '@/constants/subscriptions';
import type { Style } from '@/types';

type StyleCardProps = {
  styleName: Style;
  selected: boolean;
  onPress: () => void;
};

const styleHints: Record<Style, string> = {
  Streetwear: 'Baggy, bold, urban',
  Y2K: 'Nostalgic, playful, shiny',
  'Old Money': 'Quiet, refined, classic',
  Minimalist: 'Clean, calm, essential',
  Preppy: 'Polished, collegiate',
  Athleisure: 'Sporty, soft, mobile',
  Casual: 'Easy, lived-in',
  Formal: 'Sharp, elevated',
  'Clean Girl': 'Fresh, soft, sleek',
  Grunge: 'Raw, dark, textured',
  Runway: 'Editorial, dramatic',
  'Quiet Luxury': 'Soft power neutrals',
  'Dark Academia': 'Scholarly, moody layers',
  'Elevated Streetwear': 'Polished urban edge',
};

export function StyleCard({ styleName, selected, onPress }: StyleCardProps) {
  const premium = isPremiumStyle(styleName);

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ selected }}
      activeOpacity={0.9}
      onPress={onPress}
      style={[styles.card, selected && styles.cardSelected]}
      testID={`style-card-${styleName}`}
    >
      <View style={styles.topRow}>
        <View style={[styles.swatch, selected && styles.swatchSelected]} />
        {premium ? (
          <Text style={styles.premiumBadge} testID={`premium-badge-${styleName}`}>
            Pro
          </Text>
        ) : null}
      </View>
      <Text style={[styles.title, selected && styles.titleSelected]}>
        {styleName}
      </Text>
      <Text style={styles.hint}>{styleHints[styleName]}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 124,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    justifyContent: 'flex-end',
    gap: 4,
  },
  cardSelected: {
    borderColor: colors.borderSelected,
    backgroundColor: colors.surfaceMuted,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: radii.sm,
    backgroundColor: colors.accentSoft,
  },
  swatchSelected: {
    backgroundColor: colors.accent,
  },
  premiumBadge: {
    ...typography.caption,
    color: colors.background,
    backgroundColor: colors.accent,
    overflow: 'hidden',
    borderRadius: radii.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontFamily: 'DMSans_500Medium',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  title: {
    ...typography.label,
    fontSize: 16,
    color: colors.text,
  },
  titleSelected: {
    fontFamily: 'DMSans_500Medium',
  },
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
