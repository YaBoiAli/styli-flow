import { keywordHits, OCCASION_KEYWORDS, STYLE_KEYWORDS } from '../fashionSignals.ts';
import type { NormalizedProduct } from '../types.ts';
import { budgetFitScore } from './budget.ts';
import { parseQueryIntent, scoreQueryRelevance } from './queryIntent.ts';
import type { CatalogRelevanceBreakdown, SearchIntent } from './types.ts';
import {
  CATEGORY_TERMS,
  MARKETPLACE_BRANDS,
  NIGHT_OUT_SOFT_EXCLUDE,
  isNightOutIntent,
  normalizeIntentKey,
} from './vocabulary.ts';

/**
 * Catalog relevance weights (not the outfit score).
 * query_relevance 0.28 — product vs the specific search that fetched it
 * product_relevance 0.22 — style / category / occasion metadata
 * budget_fit 0.15
 * brand 0.10
 * gender_fit 0.10
 * source_quality 0.10
 * quality 0.05
 */
const WEIGHTS = {
  query_relevance: 0.28,
  product_relevance: 0.22,
  budget_fit: 0.15,
  brand: 0.1,
  gender_fit: 0.1,
  source_quality: 0.1,
  quality: 0.05,
};

export function scoreCatalogRelevance(
  product: NormalizedProduct,
  intent: SearchIntent,
  matchedQuery: string,
): { score: number; breakdown: CatalogRelevanceBreakdown } {
  const productText = `${product.product_name} ${product.subcategory ?? ''} ${product.description ?? ''} ${product.material ?? ''}`
    .toLowerCase();
  const styleKey = normalizeIntentKey(intent.style);
  const occasionKey = normalizeIntentKey(intent.occasion);
  const styleWords = STYLE_KEYWORDS[styleKey] ?? STYLE_KEYWORDS[styleKey.replace(/ /g, '_')] ?? [];
  const occasionWords = OCCASION_KEYWORDS[occasionKey] ?? OCCASION_KEYWORDS[occasionKey.replace(/ /g, '_')] ?? [];

  const style = clamp(keywordScore(productText, styleWords) + phraseBonus(productText, styleKey));
  const category = categoryScore(product, intent);
  const occasion = occasionScore(productText, occasionKey, occasionWords, intent);
  const brand = brandScore(product.brand, intent.brands);
  const budget = budgetFitScore(product, intent);
  const gender = genderScore(product, intent);
  const quality = qualityScore(product);
  const query = parseQueryIntent(matchedQuery);
  const queryRelevance = applyNightOutSoftPenalty(
    scoreQueryRelevance(product, query, intent),
    productText,
    intent,
  );
  const productRelevance = clamp((style + category + occasion) / 3);
  const sourceQuality = sourceQualityScore(product, intent);

  const breakdown: CatalogRelevanceBreakdown = {
    style,
    category,
    occasion,
    brand,
    budget,
    gender,
    quality,
    query_relevance: queryRelevance,
    product_relevance: productRelevance,
    budget_fit: budget,
    gender_fit: gender,
    source_quality: sourceQuality,
  };

  const score = Math.round(
    breakdown.query_relevance * WEIGHTS.query_relevance +
      breakdown.product_relevance * WEIGHTS.product_relevance +
      breakdown.budget_fit * WEIGHTS.budget_fit +
      breakdown.brand * WEIGHTS.brand +
      breakdown.gender_fit * WEIGHTS.gender_fit +
      breakdown.source_quality * WEIGHTS.source_quality +
      breakdown.quality * WEIGHTS.quality,
  );
  return { score: clamp(score), breakdown };
}

function occasionScore(
  productText: string,
  occasionKey: string,
  occasionWords: string[],
  intent: SearchIntent,
): number {
  if (!occasionKey && !isNightOutIntent(intent.style, intent.occasion)) return 70;
  const key = occasionKey || 'night out';
  const words = occasionWords.length ? occasionWords : OCCASION_KEYWORDS[key] ?? OCCASION_KEYWORDS.night_out ?? [];
  const base = clamp(keywordScore(productText, words) + phraseBonus(productText, key));
  return applyNightOutSoftPenalty(base, productText, intent);
}

function applyNightOutSoftPenalty(score: number, productText: string, intent: SearchIntent): number {
  if (!isNightOutIntent(intent.style, intent.occasion)) return score;
  if (NIGHT_OUT_SOFT_EXCLUDE.test(productText)) return clamp(score - 35);
  return score;
}

function keywordScore(text: string, keywords: string[]): number {
  if (!keywords.length) return 55;
  const hits = keywordHits(text, keywords);
  return clamp(40 + hits * 18);
}

function phraseBonus(text: string, phrase: string): number {
  const tokens = phrase.toLowerCase().split(/\s+/).filter((token) => token.length > 2);
  if (!tokens.length) return 0;
  const hits = tokens.filter((token) => text.includes(token)).length;
  return Math.min(20, hits * 4);
}

function categoryScore(product: NormalizedProduct, intent: SearchIntent): number {
  if (!intent.category) return 80;
  if (product.category !== intent.category) return 0;
  const terms = CATEGORY_TERMS[intent.category] ?? [];
  const name = `${product.product_name} ${product.subcategory ?? ''}`.toLowerCase();
  return terms.some((term) => name.includes(term)) ? 100 : 85;
}

function brandScore(brand: string, preferred?: string[]): number {
  if (!preferred?.length) return 70;
  const needle = brand.trim().toLowerCase();
  return preferred.some((name) => name.trim().toLowerCase() === needle) ? 100 : 25;
}

function genderScore(product: NormalizedProduct, intent: SearchIntent): number {
  if (!intent.gender || intent.gender === 'unisex') return 70;
  if (!product.gender) return 60;
  if (product.gender === 'unisex') return 80;
  return product.gender === intent.gender ? 100 : 0;
}

function qualityScore(product: NormalizedProduct): number {
  let score = 20;
  if (product.image_url.startsWith('http')) score += 20;
  if (product.description) score += 20;
  if (product.colors.length) score += 15;
  if (product.material) score += 15;
  if (product.subcategory) score += 10;
  return clamp(score);
}

export function isMarketplaceRetailer(brand: string): boolean {
  const needle = brand.trim().toLowerCase();
  return MARKETPLACE_BRANDS.some((name) => needle === name || needle.startsWith(`${name} `));
}

export function sourceQualityScore(product: NormalizedProduct, intent: SearchIntent): number {
  const preferred = (intent.brands ?? []).map((name) => name.trim().toLowerCase()).filter(Boolean);
  const brand = product.brand.trim().toLowerCase();
  if (preferred.some((name) => name === brand)) return 100;
  const marketplace = isMarketplaceRetailer(product.brand);
  const fashionIntent = Boolean(intent.style || preferred.length);
  if (marketplace && fashionIntent) return 30;
  if (marketplace) return 55;
  return 80;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
