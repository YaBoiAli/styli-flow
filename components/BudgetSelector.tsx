import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { colors, radii, spacing, typography } from '@/constants/theme';
import { BUDGET_PRESETS } from '@/types';

type BudgetSelectorProps = {
  value: number | null;
  onChange: (budget: number) => void;
  presets?: readonly number[];
  displayLabel?: string;
  /** Hides the large amount display for secondary budgets. */
  compact?: boolean;
  customLabel?: string;
  testIDPrefix?: string;
};

export function BudgetSelector({
  value,
  onChange,
  presets = BUDGET_PRESETS,
  displayLabel = 'Selected budget',
  compact = false,
  customLabel = 'Custom budget',
  testIDPrefix = 'budget',
}: BudgetSelectorProps) {
  const [customText, setCustomText] = useState(
    value && !presets.includes(value) ? String(value) : '',
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
    <View style={[styles.container, compact && styles.containerCompact]}>
      {compact ? null : (
        <View style={styles.display}>
          <Text style={styles.displayLabel}>{displayLabel}</Text>
          <Text style={styles.displayValue} testID={`${testIDPrefix}-display`}>
            {value ? `$${value}` : '—'}
          </Text>
        </View>
      )}

      <View style={styles.presets}>
        {presets.map((preset) => {
          const selected = value === preset && customText.length === 0;
          return (
            <TouchableOpacity
              key={preset}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              activeOpacity={0.9}
              onPress={() => {
                setCustomText('');
                onChange(preset);
              }}
              style={[styles.preset, selected && styles.presetSelected]}
              testID={`${testIDPrefix}-preset-${preset}`}
            >
              <Text
                style={[styles.presetLabel, selected && styles.presetLabelSelected]}
              >
                ${preset}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.customWrap}>
        <Text style={styles.customLabel}>{customLabel}</Text>
        <View style={styles.customRow}>
          <Text style={styles.dollar}>$</Text>
          <TextInput
            value={customText}
            onChangeText={handleCustomChange}
            keyboardType="number-pad"
            placeholder="Enter amount"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            testID={`${testIDPrefix}-custom-input`}
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
  containerCompact: {
    gap: spacing.md,
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
    fontFamily: typography.label.fontFamily,
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
