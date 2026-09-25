import { dedupeNormalizedProducts } from '../ingest.ts';
import { isValidProduct } from '../normalize.ts';
import type { NormalizedProduct, ProductGender } from '../types.ts';
import { categoryPriceCeiling, hasUsablePrice, rescuePriceCeiling } from './budget.ts';
import { generateSearchQueries } from './queries.ts';
import { scoreCatalogRelevance } from './score.ts';
import { NIGHT_OUT_HARD_EXCLUDE, isNightOutIntent } from './vocabulary.ts';
import {
  DEFAULT_STRATEGY_LIMITS,
  type CatalogCandidate,
  type SearchIntent,
  type SearchStrategyLimits,
  type SearchStrategyResult,
  type StrategySearchBackend,
} from './types.ts';

export async function runSearchStrategy(
  intent: SearchIntent,
  backend: StrategySearchBackend,
  limits: Partial<SearchStrategyLimits> = {},
): Promise<SearchStrategyResult> {
  const resolvedLimits = { ...DEFAULT_STRATEGY_LIMITS, ...limits };
  const queries = generateSearchQueries(intent, resolvedLimits.maxQueries);
  const unresolvedBrands: string[] = [];
  const resolvedBrands: Array<{ name: string; id: string }> = [];
  const brandIds = new Map<string, string>();

  for (const name of new Set(queries.map((query) => query.brand).filter((name): name is string => Boolean(name)))) {
    const match = await backend.resolveBrand(name);
    if (!match) {
      unresolvedBrands.push(name);
      console.log(`[CATALOG_STRATEGY] ${JSON.stringify({ skipped_brand: name, reason: 'unresolved' })}`);
      continue;
    }
    brandIds.set(name.toLowerCase(), match.id);
    resolvedBrands.push({ name, id: match.id });
  }

  const runnable = queries.filter((query) => !query.brand || brandIds.has(query.brand.toLowerCase()));
  const rawRows: Array<{ product: NormalizedProduct; matchedQuery: string }> = [];
  let fetched = 0;
  const filterReasons: Record<string, number> = {};

  for (const query of runnable) {
    const brandId = query.brand ? brandIds.get(query.brand.toLowerCase()) : undefined;
    let fetchedItems: Awaited<ReturnType<StrategySearchBackend['search']>> = [];
    try {
      fetchedItems = await backend.search({
        query: query.text,
        brandId,
        brandName: query.brand,
        websites: intent.websites,
        limit: resolvedLimits.perQueryLimit,
      });
    } catch (err) {
      console.log(
        `[CATALOG_STRATEGY] ${JSON.stringify({
          query: query.text,
          brand: query.brand ?? null,
          reason: err instanceof Error ? err.message.slice(0, 120) : 'search_failed',
        })}`,
      );
      continue;
    }
    fetched += fetchedItems.length;
    for (const item of fetchedItems) {
      if (!item.ok) {
        bump(filterReasons, item.reason);
        continue;
      }
      rawRows.push({ product: item.product, matchedQuery: query.text });
    }
  }

  const beforeDedupe = rawRows.length;
  const uniqueProducts = dedupeNormalizedProducts(rawRows.map((row) => row.product));
  const byId = new Map(rawRows.map((row) => [`${row.product.source}|${row.product.source_product_id}`, row]));
  const uniqueRows = uniqueProducts.map((product) => byId.get(`${product.source}|${product.source_product_id}`)!);
  const duplicatesRemoved = beforeDedupe - uniqueRows.length;

  const kept: CatalogCandidate[] = [];
  const overBudget: typeof uniqueRows = [];
  for (const row of uniqueRows) {
    const reason = hardFilterReason(row.product, intent);
    if (reason === 'over_budget') {
      overBudget.push(row);
      bump(filterReasons, reason);
      continue;
    }
    if (reason) {
      bump(filterReasons, reason);
      continue;
    }
    kept.push(toCandidate(row.product, intent, row.matchedQuery));
  }

  if (kept.length < 4 && overBudget.length) {
    const cap = categoryPriceCeiling({
      category: intent.category ?? overBudget[0]?.product.category,
      budget: intent.budget,
      shoeBudget: intent.shoeBudget,
    });
    const rescueCap = cap !== null ? rescuePriceCeiling(cap) : null;
    for (const row of overBudget) {
      if (rescueCap === null || !hasUsablePrice(row.product.price) || row.product.price > rescueCap) continue;
      kept.push(toCandidate(row.product, intent, row.matchedQuery));
      if (kept.length >= 6) break;
    }
  }

  kept.sort((left, right) => right.score - left.score || left.product.price - right.product.price);
  const pool = kept.slice(0, resolvedLimits.candidatePool);
  const candidates = diversifyCandidates(pool, resolvedLimits.finalCandidates);

  console.log(
    `[CATALOG_STRATEGY] ${JSON.stringify({
      style: intent.style ?? null,
      category: intent.category ?? null,
      occasion: intent.occasion ?? null,
      queries: runnable.map((query) => query.text),
      fetched,
      duplicatesRemoved,
      hardFiltered: Object.values(filterReasons).reduce((sum, count) => sum + count, 0),
      final: candidates.length,
      top: candidates.slice(0, 5).map((candidate) => ({
        name: candidate.product.product_name,
        brand: candidate.product.brand,
        score: candidate.score,
        breakdown: candidate.breakdown,
      })),
    })}`,
  );

  return {
    intent,
    queries: runnable,
    unresolvedBrands,
    resolvedBrands,
    fetched,
    duplicatesRemoved,
    hardFiltered: Object.values(filterReasons).reduce((sum, count) => sum + count, 0),
    filterReasons,
    candidates,
  };
}

export function hardFilterReason(product: NormalizedProduct, intent: SearchIntent): string | null {
  if (!isValidProduct(product)) return 'invalid_product';
  if (product.availability !== 'in_stock') return 'unavailable';
  if (!/^https?:\/\//.test(product.image_url)) return 'missing_image';
  if (product.currency !== 'USD') return 'unsupported_currency';
  if (intent.category && product.category !== intent.category) return 'wrong_category';
  if (genderConflict(product.gender, intent.gender)) return 'wrong_gender';
  if (isNightOutIntent(intent.style, intent.occasion) && nightOutHardExclude(product)) {
    return 'night_out_exclude';
  }
  const cap = categoryPriceCeiling({
    category: product.category,
    budget: intent.budget,
    shoeBudget: intent.shoeBudget,
  });
  if (cap !== null && hasUsablePrice(product.price) && product.price > cap) return 'over_budget';
  return null;
}

function nightOutHardExclude(product: NormalizedProduct): boolean {
  const text = `${product.product_name} ${product.description ?? ''} ${product.subcategory ?? ''}`;
  return NIGHT_OUT_HARD_EXCLUDE.test(text);
}

function toCandidate(product: NormalizedProduct, intent: SearchIntent, matchedQuery: string): CatalogCandidate {
  const scored = scoreCatalogRelevance(product, intent, matchedQuery);
  return {
    product,
    score: scored.score,
    breakdown: scored.breakdown,
    matchedQuery,
  };
}

function genderConflict(
  productGender: ProductGender | null,
  intentGender?: ProductGender,
): boolean {
  if (!intentGender || intentGender === 'unisex') return false;
  if (!productGender || productGender === 'unisex') return false;
  return productGender !== intentGender;
}

export function diversifyCandidates(ranked: CatalogCandidate[], limit: number): CatalogCandidate[] {
  if (ranked.length <= limit) return ranked;
  const byBrand = new Map<string, CatalogCandidate[]>();
  for (const candidate of ranked) {
    const key = candidate.product.brand.toLowerCase();
    byBrand.set(key, [...(byBrand.get(key) ?? []), candidate]);
  }
  const queues = [...byBrand.values()];
  const picked: CatalogCandidate[] = [];
  const seenNames = new Set<string>();
  const typeCounts = new Map<string, number>();
  const queryCounts = new Map<string, number>();
  const typeCap = Math.max(3, Math.ceil(limit * 0.45));
  const queryCap = Math.max(3, Math.ceil(limit * 0.4));

  const take = (strict: boolean) => {
    let progressed = true;
    while (picked.length < limit && progressed) {
      progressed = false;
      for (const queue of queues) {
        const index = queue.findIndex((candidate) => {
          const nameKey = `${candidate.product.brand.toLowerCase()}|${candidate.product.product_name.toLowerCase()}`;
          if (seenNames.has(nameKey)) return false;
          if (!strict) return true;
          const type = candidate.product.subcategory ?? candidate.product.category;
          return (typeCounts.get(type) ?? 0) < typeCap && (queryCounts.get(candidate.matchedQuery) ?? 0) < queryCap;
        });
        if (index < 0 || picked.length >= limit) continue;
        const next = queue.splice(index, 1)[0];
        const nameKey = `${next.product.brand.toLowerCase()}|${next.product.product_name.toLowerCase()}`;
        seenNames.add(nameKey);
        const type = next.product.subcategory ?? next.product.category;
        typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
        queryCounts.set(next.matchedQuery, (queryCounts.get(next.matchedQuery) ?? 0) + 1);
        picked.push(next);
        progressed = true;
      }
    }
  };

  take(true);
  take(false);
  return picked;
}

function bump(counts: Record<string, number>, reason: string): void {
  counts[reason] = (counts[reason] ?? 0) + 1;
}
