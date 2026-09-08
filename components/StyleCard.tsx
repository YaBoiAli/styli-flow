import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '@/constants/theme';
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
};

export function StyleCard({ styleName, selected, onPress }: StyleCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.swatch, selected && styles.swatchSelected]} />
      <Text style={[styles.title, selected && styles.titleSelected]}>
        {styleName}
      </Text>
      <Text style={styles.hint}>{styleHints[styleName]}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 118,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
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
  pressed: {
    opacity: 0.92,
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    backgroundColor: colors.accentSoft,
    marginBottom: spacing.sm,
  },
  swatchSelected: {
    backgroundColor: colors.accent,
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
