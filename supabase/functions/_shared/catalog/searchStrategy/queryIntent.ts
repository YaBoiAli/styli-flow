import type { NormalizedProduct } from '../types.ts';
import type { SearchIntent } from './types.ts';
import { CATEGORY_TERMS, QUERY_SYNONYMS, normalizeIntentKey } from './vocabulary.ts';

const STOP = new Set(['the', 'and', 'for', 'with', 'men', 'women', 'mens', "men's", 'womens', "women's"]);

export type StructuredQueryIntent = {
  text: string;
  tokens: string[];
};

export function parseQueryIntent(text: string): StructuredQueryIntent {
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP.has(token));
  return { text, tokens };
}

export function expandToken(token: string): string[] {
  return QUERY_SYNONYMS[token] ?? QUERY_SYNONYMS[normalizeIntentKey(token)] ?? [token];
}

/**
 * How well the product matches the specific query that retrieved it.
 * The query string is evidence of intent; it is not copied onto product metadata.
 */
export function scoreQueryRelevance(
  product: NormalizedProduct,
  query: StructuredQueryIntent,
  intent: SearchIntent,
): number {
  const productText = [
    product.product_name,
    product.subcategory ?? '',
    product.description ?? '',
    product.material ?? '',
  ]
    .join(' ')
    .toLowerCase();

  const tokens = query.tokens.length ? query.tokens : parseQueryIntent(query.text).tokens;
  const styleKey = normalizeIntentKey(intent.style);
  const extra = styleKey && !tokens.includes(styleKey.split(' ')[0]) ? styleKey.split(' ').filter(Boolean) : [];
  const concepts = unique([...tokens, ...extra]);
  if (!concepts.length) return 55;

  let hits = 0;
  for (const token of concepts) {
    if (expandToken(token).some((synonym) => includesTerm(productText, synonym))) hits += 1;
  }

  const categoryBonus = intent.category && product.category === intent.category ? 15 : 0;
  const termBonus = intent.category
    ? (CATEGORY_TERMS[intent.category] ?? []).some((term) => includesTerm(productText, term))
      ? 8
      : 0
    : 0;

  return clamp(25 + (hits / concepts.length) * 52 + categoryBonus + termBonus);
}

function includesTerm(text: string, term: string): boolean {
  const needle = term.toLowerCase().trim();
  if (needle.length < 2) return false;
  if (needle.includes(' ')) return text.includes(needle);
  return new RegExp(`\\b${escapeRegExp(needle)}s?\\b`).test(text);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
