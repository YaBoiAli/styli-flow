/**
 * Live Channel3 smoke test. Reads CHANNEL3_API_KEY, does not write to the database.
 *   npm run test:channel3
 *
 * Default: Styli search-strategy mode (multiple targeted queries).
 * Legacy single query: CHANNEL3_SMOKE_QUERY=shirts npm run test:channel3
 */
import { Channel3Client, readChannel3ApiKey } from '../supabase/functions/_shared/catalog/channel3/client.ts';
import { normalizeChannel3Product } from '../supabase/functions/_shared/catalog/channel3/normalize.ts';
import { buildChannel3Query } from '../supabase/functions/_shared/catalog/channel3/query.ts';
import { createChannel3SearchBackend } from '../supabase/functions/_shared/catalog/searchStrategy/channel3Backend.ts';
import { runSearchStrategy } from '../supabase/functions/_shared/catalog/searchStrategy/run.ts';
import type { SearchIntent } from '../supabase/functions/_shared/catalog/searchStrategy/types.ts';

function envGet(name: string): string | undefined {
  return process.env[name];
}

const CASES: SearchIntent[] = [
  { style: 'Y2K', category: 'top', budget: 150 },
  { style: 'Streetwear', category: 'top', budget: 150 },
  { style: 'Night Out', category: 'top', gender: 'men', budget: 150 },
  { style: 'Y2K', category: 'shoes', gender: 'men', budget: 150, shoeBudget: 120 },
  { style: 'Streetwear', category: 'bottom', budget: 150 },
  { style: 'Y2K', category: 'top', brands: ['H&M', 'Zara'], budget: 150 },
  { style: 'Streetwear', category: 'top', brands: ['Nike', 'Adidas'], budget: 150 },
];

async function legacySmoke(client: Channel3Client) {
  const query = buildChannel3Query({
    query: process.env.CHANNEL3_SMOKE_QUERY,
    style: process.env.CHANNEL3_SMOKE_STYLE,
    category: process.env.CHANNEL3_SMOKE_CATEGORY as 'top' | undefined,
  }) ?? 'shirts';
  const { products, pages } = await client.searchPages({ query, limit: 8, maxPages: 1 });
  const now = new Date().toISOString();
  const normalized = products.map((raw) => normalizeChannel3Product(raw, { now }));
  const ok = normalized.filter((row) => row.ok);
  console.log(
    JSON.stringify(
      {
        mode: 'legacy',
        query,
        fetched: products.length,
        pages,
        normalized: ok.length,
        skipped: normalized.length - ok.length,
        wrote_to_database: false,
        samples: ok.slice(0, 5).map((row) =>
          row.ok
            ? {
                source_product_id: row.product.source_product_id,
                brand: row.product.brand,
                name: row.product.product_name,
                category: row.product.category,
                price: row.product.price,
              }
            : null,
        ),
      },
      null,
      2,
    ),
  );
}

async function strategySmoke(client: Channel3Client) {
  const backend = createChannel3SearchBackend(client);
  const reports = [];
  for (const intent of CASES) {
    const result = await runSearchStrategy(intent, backend, {
      perQueryLimit: 8,
      maxQueries: 8,
      candidatePool: 40,
      finalCandidates: 12,
    });
    const prices = result.candidates.map((candidate) => candidate.product.price);
    reports.push({
      intent,
      generated_queries: result.queries.map((query) => ({
        text: query.text,
        brand: query.brand ?? null,
        source: query.source,
      })),
      unresolved_brands: result.unresolvedBrands,
      fetched: result.fetched,
      duplicates_removed: result.duplicatesRemoved,
      hard_filtered: result.hardFiltered,
      filter_reasons: result.filterReasons,
      final: result.candidates.length,
      brand_distribution: countBy(result.candidates.map((candidate) => candidate.product.brand)),
      category_distribution: countBy(result.candidates.map((candidate) => candidate.product.category)),
      price_range: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
      candidates: result.candidates.slice(0, 8).map((candidate) => ({
        name: candidate.product.product_name,
        brand: candidate.product.brand,
        category: candidate.product.category,
        price: candidate.product.price,
        score: candidate.score,
        breakdown: candidate.breakdown,
        query: candidate.matchedQuery,
      })),
    });
  }
  console.log(JSON.stringify({ mode: 'strategy', wrote_to_database: false, reports }, null, 2));
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

async function main() {
  const apiKey = readChannel3ApiKey({ get: envGet });
  if (!apiKey) {
    console.error('CHANNEL3_API_KEY is not set. Add it to the server environment (never EXPO_PUBLIC_*).');
    process.exit(1);
  }
  const client = new Channel3Client(apiKey);
  if (process.env.CHANNEL3_SMOKE_QUERY) {
    await legacySmoke(client);
    return;
  }
  await strategySmoke(client);
}

void main();
