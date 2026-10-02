import type { ProductCategory, ProductGender } from '../types.ts';
import {
  MAX_STYLE_QUERY_CONCEPTS,
  occasionRetrievalConcepts,
  reservedOccasionQuerySlots,
  styleRetrievalConcepts,
} from '../styleOccasionContract.ts';
import type { SearchIntent, SearchQuery } from './types.ts';
import {
  CATEGORY_TERMS,
  OCCASION_CONCEPTS,
  STYLE_CONCEPTS,
  conceptAllowed,
  normalizeIntentKey,
  type QueryConcept,
} from './vocabulary.ts';

export { MAX_STYLE_QUERY_CONCEPTS, RESERVED_OCCASION_QUERY_SLOTS } from '../styleOccasionContract.ts';

export function generateSearchQueries(
  intent: SearchIntent,
  maxQueries = 12,
): SearchQuery[] {
  const styleKey = normalizeIntentKey(intent.style);
  const occasionKey = normalizeIntentKey(intent.occasion);
  const category = intent.category;
  const gender = intent.gender;
  const limit = Math.max(1, maxQueries);

  const stylePool = styleRetrievalConcepts(intent.style);
  const fallbackStylePool = stylePool.length ? stylePool : (STYLE_CONCEPTS[styleKey] ?? []);
  const occasionPool = occasionRetrievalConcepts(intent.occasion);
  const fallbackOccasionPool = occasionPool.length ? occasionPool : (OCCASION_CONCEPTS[occasionKey] ?? []);

  const occasionOverlap = Boolean(styleKey) && styleKey === occasionKey;
  const reservedSlots = occasionOverlap ? 0 : Math.min(reservedOccasionQuerySlots(intent.occasion), limit);
  const occasionConcepts = occasionOverlap
    ? []
    : pickConcepts(fallbackOccasionPool, category, gender, reservedSlots);
  const styleLimit = Math.min(MAX_STYLE_QUERY_CONCEPTS, Math.max(0, limit - occasionConcepts.length));
  const styleConcepts = pickConcepts(fallbackStylePool, category, gender, styleLimit);

  const base: SearchQuery[] = [
    ...occasionConcepts.map((concept) => toQuery(concept, gender, 'occasion')),
    ...styleConcepts.map((concept) => toQuery(concept, gender, 'style')),
  ];

  if (!base.length && category) {
    const fallback = (CATEGORY_TERMS[category] ?? []).slice(0, 3).map((term) => ({
      text: withGender(`${intent.style ? `${intent.style} ${term}` : term}`, gender),
      category,
      source: 'category' as const,
    }));
    base.push(...fallback);
  }

  const unique = dedupeQueries(base).slice(0, limit);
  const brands = (intent.brands ?? []).map((brand) => brand.trim()).filter(Boolean);
  if (!brands.length) return unique;

  const perBrand = Math.max(1, Math.floor(limit / brands.length));
  const expanded: SearchQuery[] = [];
  for (const brand of brands) {
    for (const query of unique.slice(0, perBrand)) {
      expanded.push({ ...query, brand });
      if (expanded.length >= limit) return expanded;
    }
  }
  return expanded;
}

function pickConcepts(
  concepts: QueryConcept[],
  category: ProductCategory | undefined,
  gender: ProductGender | undefined,
  limit: number,
): QueryConcept[] {
  if (limit <= 0) return [];
  return concepts.filter((concept) => conceptAllowed(concept, category, gender)).slice(0, limit);
}

function toQuery(
  concept: QueryConcept,
  gender: ProductGender | undefined,
  source: SearchQuery['source'],
): SearchQuery {
  return {
    text: withGender(concept.phrase, gender),
    category: concept.categories[0],
    source,
  };
}

export function withGender(phrase: string, gender?: ProductGender): string {
  const text = phrase.trim();
  if (!gender || gender === 'unisex') return text;
  if (gender === 'men' && !/\bmen(?:['’]?s)?\b/i.test(text)) return `${text} men`;
  if (gender === 'women' && !/\bwomen(?:['’]?s)?\b/i.test(text)) return `${text} women`;
  return text;
}

function dedupeQueries(queries: SearchQuery[]): SearchQuery[] {
  const seen = new Set<string>();
  const out: SearchQuery[] = [];
  for (const query of queries) {
    const key = `${query.brand ?? ''}|${query.text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(query);
  }
  return out;
}
