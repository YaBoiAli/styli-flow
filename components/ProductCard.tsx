import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors, radii, spacing, typography } from '@/constants/theme';
import { trackEvent } from '@/lib/analytics';
import type { Product } from '@/types';

type ProductCardProps = {
  product: Product;
};

export function ProductCard({ product }: ProductCardProps) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.9}
      onPress={() => {
        trackEvent('product_clicked', {
          product_id: product.id,
          product_category: product.category,
          product_price: product.price,
        });
      }}
      style={styles.card}
      testID={`product-card-${product.id}`}
    >
      <Image
        source={{ uri: product.imageUrl }}
        style={styles.image}
        resizeMode="cover"
        accessibilityLabel={product.name}
      />
      <View style={styles.meta}>
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>
        <Text style={styles.price}>${product.price.toFixed(2)}</Text>
        {product.reason ? (
          <Text style={styles.reason} numberOfLines={3}>
            {product.reason}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.sm,
    alignItems: 'center',
  },
  image: {
    width: 88,
    height: 88,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
  },
  meta: {
    flex: 1,
    gap: spacing.xs,
    paddingRight: spacing.sm,
  },
  name: {
    ...typography.label,
    fontSize: 16,
    color: colors.text,
  },
  price: {
    ...typography.price,
    color: colors.textSecondary,
  },
  reason: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
