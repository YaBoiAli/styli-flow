/**
 * Dev tool: run the product-source resolver against live brand sites without touching the DB.
 *   deno run --allow-net --allow-env scripts/probe-brands.ts kith.com allbirds.com
 *   deno run --allow-net --allow-env scripts/probe-brands.ts --approved
 */
import { PoliteFetcher } from '../supabase/functions/_shared/catalog/politeFetch.ts';
import { resolveBrandProducts } from '../supabase/functions/_shared/catalog/resolver.ts';

const APPROVED = [
  'zara.com', 'hollisterco.com', 'oldnavy.com', 'gap.com', 'gapfactory.com', 'ae.com',
  'levi.com', 'factory.jcrew.com', 'bananarepublicfactory.com', 'abercrombie.com', 'hm.com',
  'uniqlo.com', 'nike.com', 'adidas.com', 'puma.com', 'champion.com', 'calvinklein.us',
  'tommy.com', 'ralphlauren.com', 'pacsun.com', 'forever21.com', 'urbanoutfitters.com',
  'asos.com', 'mango.com', 'express.com', 'reebok.com', 'newbalance.com',
  'carhartt.com', 'vans.com', 'converse.com', 'marcnolan.com',
];

const args = Deno.args.filter((arg) => !arg.startsWith('--'));
const domains = Deno.args.includes('--approved') ? APPROVED : args;
const limit = Number(Deno.env.get('PROBE_LIMIT') ?? '1000');
const maxRequests = Number(Deno.env.get('PROBE_REQUESTS') ?? '45');
const verbose = Deno.args.includes('--verbose');

const results = await Promise.all(
  domains.map(async (domain) => {
    const fetcher = new PoliteFetcher({ maxRequests });
    const started = Date.now();
    try {
      const origin = await fetcher.canonicalOrigin(domain);
      const result = await resolveBrandProducts({
        brand: { name: domain, domain, origin, sourceConfig: {} },
        fetcher,
        limit,
      });
      return { domain, origin, result, ms: Date.now() - started, requests: fetcher.requestsMade };
    } catch (err) {
      return { domain, origin: '', error: String(err), ms: Date.now() - started, requests: fetcher.requestsMade };
    }
  }),
);

for (const row of results) {
  if ('error' in row) {
    console.log(`${row.domain.padEnd(28)} ERROR ${row.error}`);
    continue;
  }
  const { result } = row;
  const summary =
    result.status === 'supported'
      ? `SUPPORTED via ${result.source}: ${result.listing.products.length} products`
      : `unsupported: ${result.reason}`;
  console.log(`${row.domain.padEnd(28)} ${summary}  (${row.requests} req, ${Math.round(row.ms / 1000)}s)`);
  console.log(`  ${result.attempts.map((a) => `${a.source}=${a.outcome}${a.outcome === 'unavailable' ? '' : ` (${a.detail})`}`).join('; ')}`);
  if (result.status === 'supported' && verbose) {
    for (const product of result.listing.products.slice(0, 6)) {
      console.log(
        `   - [${product.category}/${product.subcategory}] ${product.product_name} | ${product.brand} | ${product.price} ${product.currency} | ${product.gender ?? '-'} | ${product.availability} | colors ${product.colors.slice(0, 3).join('/')} | sizes ${product.sizes.length} | ${product.material ?? '-'}\n     ${product.product_url}\n     ${product.image_url.slice(0, 90)}`,
      );
    }
    const counts: Record<string, number> = {};
    for (const product of result.listing.products) counts[product.category] = (counts[product.category] ?? 0) + 1;
    console.log(`   categories: ${JSON.stringify(counts)}`);
  }
}
