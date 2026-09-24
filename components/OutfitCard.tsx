import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ProductCard } from '@/components/ProductCard';
import { colors, motion, radii, spacing, typography } from '@/constants/theme';
import type { Outfit } from '@/types';

type OutfitCardProps = {
  outfit: Outfit;
  budget?: number | null;
};

export function OutfitCard({ outfit, budget }: OutfitCardProps) {
  const underBudget =
    typeof budget === 'number' && budget > 0 ? outfit.total <= budget : null;
  const remaining =
    typeof budget === 'number' && underBudget
      ? Math.max(0, budget - outfit.total)
      : null;

  return (
    <View style={styles.container}>
      <Animated.View
        entering={FadeInDown.duration(motion.slow)}
        style={styles.header}
      >
        <Text style={styles.kicker}>Your fit</Text>
        <Text style={styles.title}>{outfit.name}</Text>
        <Text style={styles.meta}>
          {outfit.style} · {outfit.occasion}
        </Text>
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(80).duration(motion.slow)}
        style={styles.explanation}
      >
        <Text style={styles.explanationLabel}>Why this works</Text>
        <Text style={styles.explanationText}>{outfit.explanation}</Text>
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(140).duration(motion.slow)}
        style={styles.products}
      >
        <Text style={styles.sectionLabel}>The pieces</Text>
        {outfit.products.map((product, index) => (
          <Animated.View
            key={product.id}
            entering={FadeInDown.delay(180 + index * 70).duration(motion.base)}
          >
            <ProductCard product={product} />
          </Animated.View>
        ))}
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(260).duration(motion.slow)}
        style={styles.totalCard}
      >
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Outfit total</Text>
          <Text style={styles.totalValue} testID="outfit-total">
            ${outfit.total.toFixed(2)}
          </Text>
        </View>
        {typeof budget === 'number' && budget > 0 ? (
          <View
            style={[
              styles.budgetPill,
              underBudget ? styles.budgetPillOk : styles.budgetPillOver,
            ]}
            testID="budget-fit"
          >
            <Text
              style={[
                styles.budgetPillText,
                underBudget ? styles.budgetPillTextOk : styles.budgetPillTextOver,
              ]}
            >
              {underBudget
                ? remaining && remaining > 0
                  ? `Under budget · $${remaining.toFixed(0)} left of $${budget}`
                  : `Right on your $${budget} budget`
                : `Over your $${budget} budget`}
            </Text>
          </View>
        ) : null}
        <Text style={styles.shopNote}>
          Tap any piece to shop. Save it to your closet or rebuild for a fresh take.
        </Text>
      </Animated.View>
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
    fontSize: 30,
    lineHeight: 36,
    color: colors.text,
  },
  meta: {
    ...typography.body,
    color: colors.textSecondary,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginBottom: spacing.xs,
  },
  products: {
    gap: spacing.sm,
  },
  totalCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
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
  budgetPill: {
    alignSelf: 'flex-start',
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  budgetPillOk: {
    backgroundColor: colors.successSoft,
  },
  budgetPillOver: {
    backgroundColor: '#F6E6E6',
  },
  budgetPillText: {
    ...typography.caption,
    fontFamily: typography.label.fontFamily,
  },
  budgetPillTextOk: {
    color: colors.success,
  },
  budgetPillTextOver: {
    color: colors.danger,
  },
  shopNote: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  explanation: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
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
    color: colors.text,
    lineHeight: 25,
  },
});
