import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, radii, spacing, typography } from '@/constants/theme';
import { BUDGET_PRESETS } from '@/types';

type BudgetSelectorProps = {
  value: number | null;
  onChange: (budget: number) => void;
};

export function BudgetSelector({ value, onChange }: BudgetSelectorProps) {
  const [customText, setCustomText] = useState(
    value && !BUDGET_PRESETS.includes(value) ? String(value) : '',
  );

  const handleCustomChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    setCustomText(cleaned);
    const parsed = Number(cleaned);
    if (cleaned.length > 0 && parsed > 0) {
      onChange(parsed);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.display}>
        <Text style={styles.displayLabel}>Selected budget</Text>
        <Text style={styles.displayValue}>
          {value ? `$${value}` : '—'}
        </Text>
      </View>

      <View style={styles.presets}>
        {BUDGET_PRESETS.map((preset) => {
          const selected = value === preset && customText.length === 0;
          return (
            <Pressable
              key={preset}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => {
                setCustomText('');
                onChange(preset);
              }}
              style={({ pressed }) => [
                styles.preset,
                selected && styles.presetSelected,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[styles.presetLabel, selected && styles.presetLabelSelected]}
              >
                ${preset}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.customWrap}>
        <Text style={styles.customLabel}>Custom budget</Text>
        <View style={styles.customRow}>
          <Text style={styles.dollar}>$</Text>
          <TextInput
            value={customText}
            onChangeText={handleCustomChange}
            keyboardType="number-pad"
            placeholder="Enter amount"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
  },
  display: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  displayLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  displayValue: {
    ...typography.hero,
    color: colors.text,
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  preset: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.full,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  presetSelected: {
    borderColor: colors.borderSelected,
    backgroundColor: colors.surfaceMuted,
  },
  presetLabel: {
    ...typography.label,
    color: colors.text,
  },
  presetLabelSelected: {
    fontFamily: 'DMSans_500Medium',
  },
  pressed: {
    opacity: 0.9,
  },
  customWrap: {
    gap: spacing.sm,
  },
  customLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    minHeight: 56,
    gap: spacing.xs,
  },
  dollar: {
    ...typography.title,
    fontSize: 22,
    color: colors.textSecondary,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    paddingVertical: spacing.md,
  },
});
