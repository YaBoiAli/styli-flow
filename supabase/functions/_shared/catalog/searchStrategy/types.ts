import type { NormalizedProduct, ProductCategory, ProductGender } from '../types.ts';

export type SearchStyle =
  | 'Y2K'
  | 'Streetwear'
  | 'Night Out'
  | 'Old Money'
  | 'Minimalist'
  | 'Casual'
  | 'Athleisure'
  | 'Grunge'
  | 'Preppy'
  | 'Formal'
  | 'Business Casual'
  | 'Runway'
  | 'Vintage'
  | 'Cottagecore'
  | 'Goth'
  | 'Coquette'
  | 'Clean Girl';

export type SearchOccasion =
  | 'Everyday'
  | 'Night Out'
  | 'Date'
  | 'Work'
  | 'School'
  | 'Formal Event'
  | 'Party'
  | 'Vacation'
  | 'Workout';

export type SearchIntent = {
  style?: string;
  category?: ProductCategory;
  occasion?: string;
  gender?: ProductGender;
  /** Outfit budget in USD. Per-item ceiling follows generate-outfit priceCap. */
  budget?: number;
  /** Separate shoe budget, same meaning as generate-outfit `shoe_budget`. */
  shoeBudget?: number | null;
  brands?: string[];
  websites?: string[];
  season?: string;
};

export type SearchQuery = {
  text: string;
  brand?: string;
  category?: ProductCategory;
  source: 'style' | 'occasion' | 'category';
};

export type CatalogRelevanceBreakdown = {
  style: number;
  category: number;
  occasion: number;
  brand: number;
  budget: number;
  gender: number;
  quality: number;
  query_relevance: number;
  product_relevance: number;
  budget_fit: number;
  gender_fit: number;
  source_quality: number;
};

export type CatalogCandidate = {
  product: NormalizedProduct;
  score: number;
  breakdown: CatalogRelevanceBreakdown;
  matchedQuery: string;
};

export type SearchStrategyLimits = {
  perQueryLimit: number;
  maxQueries: number;
  candidatePool: number;
  finalCandidates: number;
};

export const DEFAULT_STRATEGY_LIMITS: SearchStrategyLimits = {
  perQueryLimit: 12,
  maxQueries: 12,
  candidatePool: 80,
  finalCandidates: 24,
};

export type SearchStrategyResult = {
  intent: SearchIntent;
  queries: SearchQuery[];
  unresolvedBrands: string[];
  resolvedBrands: Array<{ name: string; id: string }>;
  fetched: number;
  duplicatesRemoved: number;
  hardFiltered: number;
  filterReasons: Record<string, number>;
  candidates: CatalogCandidate[];
};

export type StrategyFetchedItem =
  | { ok: true; product: NormalizedProduct; offerDomain?: string }
  | { ok: false; reason: string };

export type StrategySearchBackend = {
  resolveBrand(name: string): Promise<{ id: string; name: string } | null>;
  search(input: {
    query: string;
    brandId?: string;
    brandName?: string;
    websites?: string[];
    limit: number;
  }): Promise<StrategyFetchedItem[]>;
};
