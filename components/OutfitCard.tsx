import { StyleSheet, Text, View } from 'react-native';

import { ProductCard } from '@/components/ProductCard';
import { colors, radii, spacing, typography } from '@/constants/theme';
import type { Outfit } from '@/types';

type OutfitCardProps = {
  outfit: Outfit;
};

export function OutfitCard({ outfit }: OutfitCardProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Your fit</Text>
        <Text style={styles.title}>{outfit.name}</Text>
        <Text style={styles.meta}>
          {outfit.style} · {outfit.occasion}
        </Text>
      </View>

      <View style={styles.products}>
        {outfit.products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>${outfit.total.toFixed(2)}</Text>
      </View>

      <View style={styles.explanation}>
        <Text style={styles.explanationLabel}>Styling tip</Text>
        <Text style={styles.explanationText}>{outfit.explanation}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
  },
  header: {
    gap: spacing.sm,
  },
  kicker: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  meta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  products: {
    gap: spacing.sm,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  totalLabel: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  totalValue: {
    ...typography.total,
    color: colors.text,
  },
  explanation: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  explanationLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  explanationText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
