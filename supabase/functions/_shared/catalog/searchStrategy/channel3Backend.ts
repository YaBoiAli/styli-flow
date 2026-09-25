import { Channel3Client } from '../channel3/client.ts';
import { normalizeChannel3Product, pickBrandMatch } from '../channel3/normalize.ts';
import { buildChannel3Filters } from '../channel3/query.ts';
import type { StrategySearchBackend } from './types.ts';

/** Adapter only. Styli vocabulary stays out of the Channel3 client. */
export function createChannel3SearchBackend(
  client: Channel3Client,
  options: { preferredWebsites?: string[] } = {},
): StrategySearchBackend {
  return {
    async resolveBrand(name) {
      const result = await client.searchBrands(name, 8);
      return pickBrandMatch(result.brands, name);
    },
    async search(input) {
      const { products } = await client.searchPages({
        query: input.query,
        filters: buildChannel3Filters({
          brandIds: input.brandId ? [input.brandId] : [],
          websites: input.websites,
        }),
        limit: input.limit,
        maxPages: 1,
      });
      const now = new Date().toISOString();
      return products.map((raw) => {
        const result = normalizeChannel3Product(raw, {
          now,
          preferredWebsites: input.websites ?? options.preferredWebsites,
          fallbackBrand: input.brandName,
        });
        return result.ok
          ? { ok: true as const, product: result.product, offerDomain: result.offerDomain }
          : { ok: false as const, reason: result.reason };
      });
    },
  };
}
