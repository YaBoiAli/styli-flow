import type { NormalizedProduct, ProductCategory } from '../types.ts';
import type { SearchIntent } from './types.ts';

/**
 * Mirrors generate-outfit `priceCap`: shoes may have a separate ceiling;
 * every other item is capped at the outfit budget, not 1/N of it.
 */
export function categoryPriceCeiling(input: {
  category?: ProductCategory;
  budget?: number;
  shoeBudget?: number | null;
}): number | null {
  if (input.category === 'shoes' && typeof input.shoeBudget === 'number' && input.shoeBudget > 0) {
    return input.shoeBudget;
  }
  if (typeof input.budget === 'number' && input.budget > 0) return input.budget;
  return null;
}

export function hasUsablePrice(price: number): boolean {
  return Number.isFinite(price) && price > 0;
}

/** Slightly-over items can be re-admitted when a tight budget would empty the pool. */
export function rescuePriceCeiling(cap: number): number {
  return Math.min(cap * 1.75, cap + 80);
}

export function budgetFitScore(product: Pick<NormalizedProduct, 'price' | 'category'>, intent: SearchIntent): number {
  if (!hasUsablePrice(product.price)) return 55;
  const cap = categoryPriceCeiling({
    category: product.category,
    budget: intent.budget,
    shoeBudget: intent.shoeBudget,
  });
  if (cap === null) {
    if (product.price <= 180) return 100;
    if (product.price <= 350) return 75;
    if (product.price <= 600) return 45;
    return 10;
  }
  if (product.price > cap) return 0;
  const ratio = product.price / cap;
  if (ratio <= 0.5) return 100;
  if (ratio <= 0.8) return 80;
  return 60;
}
