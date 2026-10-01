import type { ProductCategory } from './catalog.ts';
import type { FashionCriticResult } from '../_shared/fashionAI/types.ts';

export type FootwearPreference = 'include' | 'none';

const OPTIONAL_CATEGORIES: ProductCategory[] = ['outerwear', 'accessory'];

export function parseFootwearPreference(value: unknown): FootwearPreference {
  return value === 'none' ? 'none' : 'include';
}

export type ColorPreference = 'complexion' | 'style_first';

export function parseColorPreference(value: unknown): ColorPreference {
  return value === 'complexion' ? 'complexion' : 'style_first';
}

const FOOTWEAR_SUBCATEGORIES = new Set([
  'sneakers',
  'boots',
  'loafers',
  'sandals',
  'heels',
  'shoes',
]);

const FOOTWEAR_NAME =
  /\b(sneakers?|shoes?|boots?|sandals?|heels?|loafers?|slides?|mules?|trainers?|footwear|oxfords|derbys)\b/i;

export function isFootwearProduct(product: {
  category?: string | null;
  name?: string | null;
  subcategory?: string | null;
}): boolean {
  const category = (product.category ?? '').toLowerCase();
  if (category === 'shoes' || category === 'footwear') return true;
  const sub = (product.subcategory ?? '').toLowerCase();
  if (FOOTWEAR_SUBCATEGORIES.has(sub)) return true;
  return FOOTWEAR_NAME.test(product.name ?? '');
}

export function requiredOutfitCategories(
  preference: FootwearPreference,
): ProductCategory[] {
  return preference === 'none' ? ['top', 'bottom'] : ['top', 'bottom', 'shoes'];
}

export function liveRetrievalCategories(
  preference: FootwearPreference,
): ProductCategory[] {
  return requiredOutfitCategories(preference);
}

export function excludeFootwear<T extends {
  category: string;
  name?: string | null;
  subcategory?: string | null;
}>(
  products: T[],
  preference: FootwearPreference,
): T[] {
  if (preference !== 'none') return products;
  return products.filter((product) => !isFootwearProduct(product));
}

export function assertNoForbiddenFootwear(
  products: Array<{
    category?: string | null;
    name?: string | null;
    subcategory?: string | null;
  }>,
  preference: FootwearPreference,
): void {
  if (preference !== 'none') return;
  if (products.some(isFootwearProduct)) {
    throw new Error('invalid_ai');
  }
}

export function assertValidOutfitCategories(
  seen: Iterable<ProductCategory>,
  preference: FootwearPreference,
): void {
  const seenSet = seen instanceof Set ? seen : new Set(seen);
  if (preference === 'none' && seenSet.has('shoes')) {
    throw new Error('invalid_ai');
  }
  for (const required of requiredOutfitCategories(preference)) {
    if (!seenSet.has(required)) {
      throw new Error('invalid_ai');
    }
  }
  const allowed = new Set<ProductCategory>([
    ...requiredOutfitCategories(preference),
    ...OPTIONAL_CATEGORIES,
  ]);
  for (const category of seenSet) {
    if (!allowed.has(category)) {
      throw new Error('invalid_ai');
    }
  }
}

const MISSING_FOOTWEAR =
  /\b(missing|without|incomplete|add|need[s]?|include|no)\b[\s\w,'-]{0,48}\b(shoes?|footwear|sneakers?|boots?|sandals?|heels?)\b|\b(shoes?|footwear)\b[\s\w,'-]{0,48}\b(missing|incomplete|required)\b/i;

export function mentionsMissingFootwear(text: string): boolean {
  return MISSING_FOOTWEAR.test(text);
}

export function filterMissingFootwearCopy(values: string[]): string[] {
  return values.filter((value) => !mentionsMissingFootwear(value));
}

export function sanitizeCriticForFootwear(
  result: FashionCriticResult,
  preference: FootwearPreference,
): FashionCriticResult {
  if (preference !== 'none') return result;
  return {
    ...result,
    strengths: filterMissingFootwearCopy(result.strengths),
    recommendations: filterMissingFootwearCopy(result.recommendations),
    issues: result.issues.filter((issue) => issue.product_id || issue.type !== 'other'),
  };
}
