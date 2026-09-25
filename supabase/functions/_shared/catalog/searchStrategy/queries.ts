import type { ProductCategory, ProductGender } from '../types.ts';
import type { SearchIntent, SearchQuery } from './types.ts';
import {
  CATEGORY_TERMS,
  OCCASION_CONCEPTS,
  STYLE_CONCEPTS,
  conceptAllowed,
  normalizeIntentKey,
  type QueryConcept,
} from './vocabulary.ts';

const DEFAULT_STYLE_CONCEPTS = 5;
const DEFAULT_OCCASION_CONCEPTS = 2;

export function generateSearchQueries(
  intent: SearchIntent,
  maxQueries = 12,
): SearchQuery[] {
  const styleKey = normalizeIntentKey(intent.style);
  const occasionKey = normalizeIntentKey(intent.occasion);
  const category = intent.category;
  const gender = intent.gender;

  const styleConcepts = pickConcepts(STYLE_CONCEPTS[styleKey] ?? [], category, gender, DEFAULT_STYLE_CONCEPTS);
  const occasionOverlap = styleKey === occasionKey;
  const occasionConcepts = occasionOverlap
    ? []
    : pickConcepts(OCCASION_CONCEPTS[occasionKey] ?? [], category, gender, DEFAULT_OCCASION_CONCEPTS);

  const base: SearchQuery[] = [
    ...styleConcepts.map((concept) => toQuery(concept, gender, 'style')),
    ...occasionConcepts.map((concept) => toQuery(concept, gender, 'occasion')),
  ];

  if (!base.length && category) {
    const fallback = (CATEGORY_TERMS[category] ?? []).slice(0, 3).map((term) => ({
      text: withGender(`${intent.style ? `${intent.style} ${term}` : term}`, gender),
      category,
      source: 'category' as const,
    }));
    base.push(...fallback);
  }

  const unique = dedupeQueries(base).slice(0, Math.max(1, maxQueries));
  const brands = (intent.brands ?? []).map((brand) => brand.trim()).filter(Boolean);
  if (!brands.length) return unique.slice(0, maxQueries);

  const perBrand = Math.max(1, Math.floor(maxQueries / brands.length));
  const expanded: SearchQuery[] = [];
  for (const brand of brands) {
    for (const query of unique.slice(0, perBrand)) {
      expanded.push({ ...query, brand });
      if (expanded.length >= maxQueries) return expanded;
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
