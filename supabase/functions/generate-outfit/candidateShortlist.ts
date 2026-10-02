/**
 * Quality-aware candidate ranking and Gemini shortlisting.
 * Hard constraints stay in the caller (No Shoes, budget cap, brand exclusive).
 */
import {
  type CatalogProduct,
  type ProductCategory,
  isDressFootwear,
  isClassyLook,
  productOccasionScore,
  productStyleScore,
  relevanceScore,
  skinToneColorScore,
  type SkinTonePreference,
} from './catalog.ts';
import { styleAliasTags } from '../_shared/catalog/fashionSignals.ts';
import {
  IDENTITY_REUSE_PENALTY,
  type PreviousOutfitItem,
  productGroupKey,
  reusePenalty,
  spreadAcrossGroups,
} from './outfitDiversity.ts';
import {
  type ColorPreference,
  type FootwearPreference,
  isFootwearProduct,
} from './footwearPreference.ts';
import { scoreVisualCandidateRelevance } from './visualCandidateRanking.ts';

export type BudgetPlan = {
  outfit: number;
  /** null means shoes share the outfit budget. */
  shoes: number | null;
};

export const TOP_PICKS_PER_CATEGORY = 7;
/** Broader text pool (final shortlist × 2) fed to visual analysis. */
export const VISUAL_POOL_MULTIPLIER = 2;
export const VISUAL_RANK_PER_CATEGORY = TOP_PICKS_PER_CATEGORY * VISUAL_POOL_MULTIPLIER;
const OPTIONAL_CATEGORIES: ProductCategory[] = ['outerwear', 'accessory'];
const MIN_STYLE_SCORE = 2;
/** After min-style focus, do not re-cut on keyword-score gaps (missing tags ≠ low quality). */
const FOCUSED_QUALITY_BAND = Number.POSITIVE_INFINITY;

export type FilterDropReason =
  | 'excluded_id'
  | 'over_budget'
  | 'dress_footwear_not_classy'
  | 'footwear_disabled'
  | 'demo_untagged'
  | 'below_min_relevance'
  | 'below_min_style_score'
  | 'quality_band'
  | 'diversity_cap';

export type FilterDrop = {
  category: ProductCategory;
  product_id: string;
  brand: string;
  reason: FilterDropReason;
  score: number | null;
};

function asDrop(
  product: CatalogProduct,
  reason: FilterDropReason,
  score: number | null,
): FilterDrop {
  return {
    category: product.category,
    product_id: product.id,
    brand: product.brand,
    reason,
    score,
  };
}

export function asNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function isSeparateShoe(plan: BudgetPlan, product: CatalogProduct): boolean {
  return plan.shoes !== null && product.category === 'shoes';
}

export function priceCap(plan: BudgetPlan, product: CatalogProduct): number {
  return isSeparateShoe(plan, product) ? plan.shoes! : plan.outfit;
}

export function outfitSpend(plan: BudgetPlan, products: CatalogProduct[]): number {
  return products
    .filter((product) => !isSeparateShoe(plan, product))
    .reduce((sum, product) => sum + asNumber(product.price), 0);
}

export function fitsBudget(plan: BudgetPlan, products: CatalogProduct[]): boolean {
  const shoeSpend = products
    .filter((product) => isSeparateShoe(plan, product))
    .reduce((sum, product) => sum + asNumber(product.price), 0);
  return (
    outfitSpend(plan, products) <= plan.outfit &&
    (plan.shoes === null || shoeSpend <= plan.shoes)
  );
}

export function groupByCategory(products: CatalogProduct[]): Record<ProductCategory, CatalogProduct[]> {
  const groups: Record<ProductCategory, CatalogProduct[]> = {
    top: [],
    bottom: [],
    shoes: [],
    outerwear: [],
    accessory: [],
  };
  for (const product of products) {
    if (groups[product.category]) groups[product.category].push(product);
  }
  return groups;
}

export function categoryList(footwearPreference: FootwearPreference): ProductCategory[] {
  return footwearPreference === 'none'
    ? ['top', 'bottom', ...OPTIONAL_CATEGORIES]
    : ['top', 'bottom', 'shoes', ...OPTIONAL_CATEGORIES];
}

export function candidateScore(
  product: CatalogProduct,
  styleTags: string[],
  occasion: string,
  skinTone: SkinTonePreference | null,
  colorPreference: ColorPreference,
  previousOutfit: PreviousOutfitItem[],
): number {
  return (
    relevanceScore(product, styleTags, occasion) +
    skinToneColorScore(product, skinTone, colorPreference) -
    reusePenalty(product, previousOutfit)
  );
}

function rankingScore(
  product: CatalogProduct,
  style: string,
  styleTags: string[],
  occasion: string,
  skinTone: SkinTonePreference | null,
  colorPreference: ColorPreference,
  previousOutfit: PreviousOutfitItem[],
  visualAware: boolean,
): number {
  const text = candidateScore(
    product,
    styleTags,
    occasion,
    skinTone,
    colorPreference,
    previousOutfit,
  );
  if (!visualAware) return text;
  return text + scoreVisualCandidateRelevance(product, style, occasion);
}

function hardFilteredPool(
  products: CatalogProduct[],
  style: string,
  occasion: string,
  budget: BudgetPlan,
  excludeIds: Set<string>,
  skinTone: SkinTonePreference | null,
  footwearPreference: FootwearPreference,
  colorPreference: ColorPreference,
): {
  styleTags: string[];
  scores: Map<string, number>;
  grouped: Record<ProductCategory, CatalogProduct[]>;
  tagged: CatalogProduct[];
  drops: FilterDrop[];
} {
  const styleTags = styleAliasTags(style);
  const classy = isClassyLook(style, occasion);
  const drops: FilterDrop[] = [];
  const affordable: CatalogProduct[] = [];
  for (const product of products) {
    if (excludeIds.has(product.id)) {
      drops.push(asDrop(product, 'excluded_id', null));
      continue;
    }
    if (asNumber(product.price) > priceCap(budget, product)) {
      drops.push(asDrop(product, 'over_budget', null));
      continue;
    }
    if (isDressFootwear(product) && !classy) {
      drops.push(asDrop(product, 'dress_footwear_not_classy', null));
      continue;
    }
    if (footwearPreference === 'none' && isFootwearProduct(product)) {
      drops.push(asDrop(product, 'footwear_disabled', null));
      continue;
    }
    affordable.push(product);
  }
  const rawScores = new Map(
    affordable.map((product) => [
      product.id,
      relevanceScore(product, styleTags, occasion) +
        skinToneColorScore(product, skinTone, colorPreference),
    ]),
  );
  const tagged = affordable.filter((product) =>
    product.style_tags.some((tag) => styleTags.includes(tag.trim().toLowerCase())),
  );
  const pool = affordable.filter((product) => {
    if (product.source === 'demo') {
      return product.style_tags.some((tag) => styleTags.includes(tag.trim().toLowerCase()));
    }
    const score = rawScores.get(product.id) ?? 0;
    return score >= 1 || tagged.some((row) => row.id === product.id);
  });
  if (pool.length) {
    for (const product of affordable) {
      if (pool.some((row) => row.id === product.id)) continue;
      const score = rawScores.get(product.id) ?? 0;
      const reason: FilterDropReason =
        product.source === 'demo' ? 'demo_untagged' : 'below_min_relevance';
      drops.push(asDrop(product, reason, score));
    }
  }
  return {
    styleTags,
    scores: rawScores,
    grouped: groupByCategory(pool.length ? pool : affordable),
    tagged,
    drops,
  };
}

function focusedForCategory(
  ranked: CatalogProduct[],
  scores: Map<string, number>,
  tagged: CatalogProduct[],
): CatalogProduct[] {
  const stylish = ranked.filter(
    (product) =>
      (scores.get(product.id) ?? 0) >= MIN_STYLE_SCORE ||
      tagged.some((row) => row.id === product.id),
  );
  return stylish.length ? stylish : ranked;
}

export type RankWorkingPoolInput = {
  products: CatalogProduct[];
  style: string;
  occasion: string;
  budget: BudgetPlan;
  excludeIds: Set<string>;
  skinTone: SkinTonePreference | null;
  footwearPreference: FootwearPreference;
  colorPreference: ColorPreference;
  previousOutfit?: PreviousOutfitItem[];
  perCategory?: number;
  /** After visual enrichment only. Never used to build the pre-visual text pool. */
  visualAware?: boolean;
};

/**
 * Hard-filter and quality-rank a visual-analysis pool.
 * Does not inject cheap filler. Previous identities are de-prioritized, not dropped.
 * Missing style_tags is uncertainty, not a quality-band rejection.
 */
export function rankWorkingPoolDetailed(input: RankWorkingPoolInput): {
  products: CatalogProduct[];
  drops: FilterDrop[];
} {
  const previousOutfit = input.previousOutfit ?? [];
  const perCategory = input.perCategory ?? VISUAL_RANK_PER_CATEGORY;
  const { styleTags, scores, grouped, tagged, drops } = hardFilteredPool(
    input.products,
    input.style,
    input.occasion,
    input.budget,
    input.excludeIds,
    input.skinTone,
    input.footwearPreference,
    input.colorPreference,
  );
  const trimmed: CatalogProduct[] = [];
  for (const category of categoryList(input.footwearPreference)) {
    const ranked = [...grouped[category]].sort(
      (a, b) =>
        candidateScore(b, styleTags, input.occasion, input.skinTone, input.colorPreference, previousOutfit) -
          candidateScore(a, styleTags, input.occasion, input.skinTone, input.colorPreference, previousOutfit) ||
        asNumber(a.price) - asNumber(b.price),
    );
    const focused = focusedForCategory(ranked, scores, tagged);
    if (focused.length && focused.length < ranked.length) {
      const kept = new Set(focused.map((product) => product.id));
      for (const product of ranked) {
        if (kept.has(product.id)) continue;
        drops.push(asDrop(product, 'below_min_style_score', scores.get(product.id) ?? 0));
      }
    }
    const scoreOf = (product: CatalogProduct) =>
      candidateScore(
        product,
        styleTags,
        input.occasion,
        input.skinTone,
        input.colorPreference,
        previousOutfit,
      );
    const selected = spreadAcrossGroups(focused, scoreOf, perCategory, FOCUSED_QUALITY_BAND);
    const selectedIds = new Set(selected.map((product) => product.id));
    const best = focused.length ? scoreOf(focused[0]) : 0;
    for (const product of focused) {
      if (selectedIds.has(product.id)) continue;
      const score = scoreOf(product);
      const reason: FilterDropReason =
        Number.isFinite(FOCUSED_QUALITY_BAND) && score < best - FOCUSED_QUALITY_BAND
          ? 'quality_band'
          : 'diversity_cap';
      drops.push(asDrop(product, reason, score));
    }
    trimmed.push(...selected);
  }
  return { products: trimmed, drops };
}

export function rankWorkingPool(input: RankWorkingPoolInput): CatalogProduct[] {
  return rankWorkingPoolDetailed(input).products;
}

export type ShortlistInput = RankWorkingPoolInput;

/**
 * Final Gemini pool: quality first, then diversity among similarly strong options.
 * Rebuild previous products are kept out of the top tier when alternatives exist.
 * When visualAware, text relevance stays primary and a bounded visual adjustment may reorder close products.
 */
export function shortlistForGemini(input: ShortlistInput): CatalogProduct[] {
  const previousOutfit = input.previousOutfit ?? [];
  const visualAware = Boolean(input.visualAware);
  const { styleTags, scores, grouped, tagged } = hardFilteredPool(
    input.products,
    input.style,
    input.occasion,
    input.budget,
    input.excludeIds,
    input.skinTone,
    input.footwearPreference,
    input.colorPreference,
  );
  const scoreOf = (product: CatalogProduct) =>
    rankingScore(
      product,
      input.style,
      styleTags,
      input.occasion,
      input.skinTone,
      input.colorPreference,
      previousOutfit,
      visualAware,
    );
  const trimmed: CatalogProduct[] = [];
  for (const category of categoryList(input.footwearPreference)) {
    const ranked = [...grouped[category]].sort(
      (a, b) => scoreOf(b) - scoreOf(a) || asNumber(a.price) - asNumber(b.price),
    );
    const focused = focusedForCategory(ranked, scores, tagged);
    trimmed.push(
      ...spreadAcrossGroups(
        focused,
        scoreOf,
        TOP_PICKS_PER_CATEGORY,
        FOCUSED_QUALITY_BAND,
        previousOutfit.length
          ? {
              defer: (product) => reusePenalty(product, previousOutfit) >= IDENTITY_REUSE_PENALTY,
            }
          : undefined,
      ),
    );
  }
  return trimmed;
}

export function poolSnapshotRows(
  products: CatalogProduct[],
  style: string,
  occasion: string,
  previousOutfit: PreviousOutfitItem[],
): Array<{
  category: ProductCategory;
  rows: Array<{
    product_id: string;
    category: string;
    brand: string;
    price: number;
    relevance_score: number;
    style_score: number;
    occasion_score: number;
    visual_confidence: number | null;
    shortlist_rank: number;
    group: string;
  }>;
}> {
  const styleTags = styleAliasTags(style);
  const categories = [...new Set(products.map((product) => product.category))];
  return categories.map((category) => {
    const rows = products
      .filter((product) => product.category === category)
      .map((product, index) => {
        const relevance = relevanceScore(product, styleTags, occasion);
        return {
          product_id: product.id,
          category,
          brand: product.brand,
          price: asNumber(product.price),
          relevance_score: relevance,
          style_score: productStyleScore(product, styleTags),
          occasion_score: productOccasionScore(product, occasion),
          visual_confidence: product.visual_attributes?.confidence ?? null,
          shortlist_rank: index + 1,
          group: productGroupKey(product),
          final_shortlist_score: relevance - reusePenalty(product, previousOutfit),
        };
      })
      .sort((a, b) => b.final_shortlist_score - a.final_shortlist_score)
      .map((row, index) => ({ ...row, shortlist_rank: index + 1 }));
    return { category, rows };
  });
}

export { OPTIONAL_CATEGORIES };
