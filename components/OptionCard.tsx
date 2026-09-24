import { StyleSheet, Text, TouchableOpacity } from 'react-native';

import { colors, radii, spacing, typography } from '@/constants/theme';

type OptionCardProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

export function OptionCard({ label, selected, onPress }: OptionCardProps) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ selected }}
      activeOpacity={0.9}
      onPress={onPress}
      style={[styles.card, selected && styles.cardSelected]}
      testID={`option-card-${label}`}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 64,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  cardSelected: {
    borderColor: colors.borderSelected,
    backgroundColor: colors.surfaceMuted,
  },
  label: {
    ...typography.label,
    fontSize: 16,
    color: colors.text,
  },
  labelSelected: {
    fontFamily: typography.label.fontFamily,
  },
});
