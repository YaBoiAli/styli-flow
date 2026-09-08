import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, radii, spacing, typography } from '@/constants/theme';

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  style?: StyleProp<ViewStyle>;
};

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  variant = 'primary',
  disabled = false,
  style,
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      // Keep receiving pointer events when visually disabled so web clicks
      // do not fall through to content behind sticky footers.
      disabled={false}
      onPress={() => {
        if (!isDisabled) {
          onPress();
        }
      }}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? colors.background : colors.text}
        />
      ) : (
        <Text
          style={[
            styles.label,
            variant === 'primary' && styles.labelPrimary,
            variant === 'secondary' && styles.labelSecondary,
            variant === 'ghost' && styles.labelGhost,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 56,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    },
  primary: {
    backgroundColor: colors.accent,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSelected,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  pressed: {
    opacity: 0.88,
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    ...typography.label,
    fontSize: 16,
  },
  labelPrimary: {
    color: colors.background,
  },
  labelSecondary: {
    color: colors.text,
  },
  labelGhost: {
    color: colors.text,
  },
});
