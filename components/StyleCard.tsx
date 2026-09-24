import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

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
  Runway: 'Editorial, dramatic',
  'Quiet Luxury': 'Soft power neutrals',
  'Dark Academia': 'Scholarly, moody layers',
  'Elevated Streetwear': 'Polished urban edge',
};

const styleIcons: Record<Style, ComponentProps<typeof Ionicons>['name']> = {
  Streetwear: 'flame-outline',
  Y2K: 'disc-outline',
  'Old Money': 'diamond-outline',
  Minimalist: 'remove-outline',
  Preppy: 'school-outline',
  Athleisure: 'barbell-outline',
  Casual: 'cafe-outline',
  Formal: 'briefcase-outline',
  'Clean Girl': 'water-outline',
  Grunge: 'musical-notes-outline',
  Runway: 'aperture-outline',
  'Quiet Luxury': 'wine-outline',
  'Dark Academia': 'book-outline',
  'Elevated Streetwear': 'footsteps-outline',
};

export function StyleCard({ styleName, selected, onPress }: StyleCardProps) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ selected }}
      activeOpacity={0.9}
      onPress={onPress}
      style={[styles.card, selected && styles.cardSelected]}
      testID={`style-card-${styleName}`}
    >
      <View style={[styles.swatch, selected && styles.swatchSelected]}>
        <Ionicons
          name={styleIcons[styleName]}
          size={22}
          color={selected ? colors.background : colors.text}
        />
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
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  cardSelected: {
    borderColor: colors.borderSelected,
    backgroundColor: colors.surfaceMuted,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: radii.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  swatchSelected: {
    backgroundColor: colors.accent,
  },
  title: {
    ...typography.label,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
  },
  titleSelected: {
    fontFamily: typography.label.fontFamily,
  },
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
