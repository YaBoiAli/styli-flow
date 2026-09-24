import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { brandLogoUrl, type ApprovedBrand } from '@/constants/brands';
import { colors, radii, spacing, typography } from '@/constants/theme';

type BrandCardProps = {
  brand: ApprovedBrand;
  selected: boolean;
  onPress: () => void;
  /** The brand has no imported catalog yet, so it can't be shopped. */
  unavailable?: boolean;
};

export function BrandCard({ brand, selected, onPress, unavailable = false }: BrandCardProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  const showLogo = brand.sharpLogo !== false && !logoFailed;
  // A brand that was selected before it went unavailable stays pressable so it can be removed.
  const disabled = unavailable && !selected;

  return (
    <TouchableOpacity
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={unavailable ? `${brand.name}, not available yet` : brand.name}
      activeOpacity={0.9}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.card,
        selected && styles.cardSelected,
        unavailable && styles.cardUnavailable,
      ]}
      testID={`brand-card-${brand.name}`}
    >
      <View style={styles.topRow}>
        <View style={styles.logoTile}>
          {showLogo ? (
            <Image
              source={{ uri: brandLogoUrl(brand.domain) }}
              style={styles.logo}
              resizeMode="contain"
              onError={() => setLogoFailed(true)}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <Text style={styles.monogram}>{monogram(brand.name)}</Text>
          )}
        </View>
        <Ionicons
          name={selected ? 'checkmark-circle' : unavailable ? 'time-outline' : 'ellipse-outline'}
          size={22}
          color={selected ? colors.text : colors.textMuted}
        />
      </View>
      <Text
        style={[styles.title, selected && styles.titleSelected]}
        numberOfLines={2}
      >
        {brand.name}
      </Text>
      <Text style={styles.hint} numberOfLines={1}>
        {unavailable ? 'Not available yet' : brand.hint}
      </Text>
    </TouchableOpacity>
  );
}

function monogram(name: string): string {
  const words = name.replace(/[^A-Za-z0-9& ]/g, '').split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
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
  cardUnavailable: {
    opacity: 0.5,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  logoTile: {
    width: 44,
    height: 44,
    borderRadius: radii.sm,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: {
    width: 30,
    height: 30,
  },
  monogram: {
    ...typography.label,
    fontFamily: typography.label.fontFamily,
    fontSize: 13,
    letterSpacing: 0.6,
    color: colors.text,
  },
  title: {
    ...typography.label,
    fontSize: 16,
    color: colors.text,
  },
  titleSelected: {
    fontFamily: typography.label.fontFamily,
  },
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
