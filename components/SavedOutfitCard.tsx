import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '@/constants/theme';
import type { SavedOutfitSummary } from '@/lib/savedOutfits';

type SavedOutfitCardProps = {
  outfit: SavedOutfitSummary;
  onPress: () => void;
};

export function SavedOutfitCard({ outfit, onPress }: SavedOutfitCardProps) {
  const images = outfit.previewImages.slice(0, 3);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.images}>
        {images.length ? (
          images.map((uri) => (
            <Image key={uri} source={{ uri }} style={styles.image} />
          ))
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]} />
        )}
      </View>
      <View style={styles.meta}>
        <Text style={styles.name} numberOfLines={1}>
          {outfit.outfitName}
        </Text>
        <Text style={styles.style}>{outfit.style}</Text>
        <Text style={styles.price}>${outfit.totalPrice.toFixed(2)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  pressed: {
    opacity: 0.9,
  },
  images: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  image: {
    width: 72,
    height: 72,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
  },
  imagePlaceholder: {
    width: 72,
  },
  meta: {
    gap: spacing.xs,
  },
  name: {
    ...typography.label,
    fontSize: 17,
    color: colors.text,
  },
  style: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  price: {
    ...typography.price,
    color: colors.text,
  },
});
