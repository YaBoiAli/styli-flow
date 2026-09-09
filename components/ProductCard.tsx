import { Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors, radii, spacing, typography } from '@/constants/theme';
import { trackEvent } from '@/lib/analytics';
import type { Product } from '@/types';

type ProductCardProps = {
  product: Product;
};

const CATEGORY_LABEL: Record<Product['category'], string> = {
  top: 'Top',
  bottom: 'Bottom',
  footwear: 'Shoes',
  outerwear: 'Outerwear',
  accessory: 'Accessory',
};

export function ProductCard({ product }: ProductCardProps) {
  const canShop = Boolean(product.purchaseUrl);

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityHint={canShop ? 'Opens shopping link' : undefined}
      activeOpacity={0.9}
      onPress={() => {
        trackEvent('product_clicked', {
          product_id: product.id,
          product_category: product.category,
          product_price: product.price,
        });
        if (product.purchaseUrl) {
          void Linking.openURL(product.purchaseUrl).catch(() => {
            // Silent — shopping links are best-effort.
          });
        }
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
        <Text style={styles.category}>{CATEGORY_LABEL[product.category]}</Text>
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>
        <Text style={styles.price}>${product.price.toFixed(2)}</Text>
        {product.reason ? (
          <Text style={styles.reason} numberOfLines={2}>
            {product.reason}
          </Text>
        ) : null}
        {canShop ? <Text style={styles.shopHint}>Tap to shop</Text> : null}
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
    padding: spacing.md,
    alignItems: 'center',
  },
  image: {
    width: 96,
    height: 96,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
  },
  meta: {
    flex: 1,
    gap: 3,
    paddingRight: spacing.xs,
  },
  category: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  name: {
    ...typography.label,
    fontSize: 16,
    color: colors.text,
  },
  price: {
    ...typography.price,
    color: colors.text,
    marginTop: 2,
  },
  reason: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  shopHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
  },
});
