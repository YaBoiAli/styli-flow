# Channel3 catalog

Channel3 is a **generic, server-side catalog source** for Styli. It searches many fashion retailers through [Channel3's API](https://docs.trychannel3.com/) and writes normalized rows into the existing `products` table. Outfit generation never calls Channel3.

Styli-specific style vocabulary does **not** live in the Channel3 client. Channel3 stays a generic retrieval API. A Styli search strategy sits above it and turns user intent into multiple targeted searches.

During private development/testing, **generate-outfit retrieves Channel3 live, once per request**, then falls back to the existing Supabase catalog. Expo never calls Channel3. The Channel3 key stays server-side.

```
Expo
  → generate-outfit
  → Styli search strategy (once)
  → LIVE Channel3 (in memory, no product writes)
  → normalize / filter / rank
  → enough for top + bottom + shoes?
        YES → channel3_live
        PARTIAL → hybrid (fill gaps from Supabase catalog)
        NO / error / timeout → catalog_fallback
  → existing candidate generation, scoring, critic, revision
```

`sync-channel3` is still the persistence/ingest path. generate-outfit does **not** HTTP-call sync-channel3 and does **not** upsert live hits.

```
User intent (style / category / occasion / gender / budget / brands)
  → Styli search strategy (targeted queries)
  → multiple Channel3 searches (generic provider)
  → merge + deduplicate
  → hard catalog filters
  → Styli catalog relevance score
  → best candidates
  → existing normalize / upsert          (sync-channel3 only)
  → existing enrich-product             (sync-channel3 only)
  → products
```

A raw Channel3 query (`query: "shirts"`) still uses the generic single-search path. Styli intent (`style`, `category`, `occasion`) uses the strategy path.

Official docs: https://docs.trychannel3.com/

## Authentication

Requests use `x-api-key: $CHANNEL3_API_KEY` against `https://api.trychannel3.com`.

The key is server-only. Do not set `EXPO_PUBLIC_CHANNEL3_API_KEY`, do not put it in Expo/React Native, and do not commit it.

## Environment

| Variable | Where | Notes |
| --- | --- | --- |
| `CHANNEL3_API_KEY` | Edge Function / smoke script | Required for live Channel3 calls |

## Search intent

`sync-channel3` is invoked on purpose. It does not crawl the whole Channel3 catalog or run on the daily `sync-catalog` cron.

Pass any combination of:

| Field | Role |
| --- | --- |
| `query` | Free-text search (generic Channel3 path; skips strategy) |
| `style` | Styli style. Strategy expands this into targeted queries |
| `category` | Styli slot: `top` / `bottom` / `shoes` / `outerwear` / `accessory` |
| `occasion` | Styli occasion. Translated into product language, not sent as a raw phrase |
| `gender` | `men` / `women` / `unisex`. Used for query terms and hard filters |
| `budget` / `shoe_budget` | Outfit budget semantics (item ceiling, not 1/N). Shoes may use a separate cap |
| `brand` or `brands` | One Channel3 search per brand. Resolved live via `GET /v1/brands/search` (no hardcoded IDs) |
| `website` or `websites` | Channel3 `website_ids` (domains are accepted) and preferred offer site |
| `limit` | Max products this run (default 40, cap 50) |
| `page_token` | Channel3 opaque pagination token (generic path only) |
| `enrich` | Default true; uses the existing Gemini enricher |

Example body:

```json
{
  "style": "Streetwear",
  "category": "top",
  "brands": ["Nike", "Adidas"],
  "limit": 30
}
```

Changing which brands or categories we pull later is a parameter change, not a new integration.

## How styles become targeted searches

The strategy does not send one giant query like `Y2K tops shirts hoodies tanks sweaters`.

It expands Styli style + category + gender into several short, natural queries. Example, `style=Y2K`, `category=top`, `gender=men`:

- `Y2K 2000s graphic tee men`
- `Y2K oversized tee men`
- `Y2K vintage wash tee men`
- `Y2K zip hoodie men`
- `Y2K graphic shirt men`

Night Out is not searched as the phrase "Night Out". It becomes product language such as `going out shirt`, `party shirt`, `evening shirt`.

Vocabulary lives in `supabase/functions/_shared/catalog/searchStrategy/vocabulary.ts`.

## Brand handling

If the user selected brands, each brand gets its own searches. Brands are never concatenated into one query.

Unresolved brand names are logged and skipped. Other brands still search. Channel3 brand IDs are resolved at request time and never hardcoded.

## Hard filters

After Channel3 returns products, existing normalize rules run first (image, USD offer, mapped category, in-stock). Strategy then drops:

- unavailable / invalid products
- missing or non-http images
- wrong Styli category
- reliable opposite-gender products
- prices above the generate-outfit item ceiling (`priceCap`: item ≤ outfit budget; shoes may use `shoe_budget`)

There is no acceptance-score cutoff yet.

## Retrieval Quality

These rules live in `searchStrategy`, not in the Channel3 client.

**Budget.** When a budget is present, the generate-outfit item ceiling is reused: a product may cost up to the outfit budget (shoes may use `shoe_budget`). That is a hard filter for extreme over-budget items. Missing or non-finite prices are not treated as over-budget and do not crash ranking. When no budget is supplied, nothing is hard-filtered by price; extreme luxury is only ranked down so it does not dominate the final pool. If a tight budget would leave fewer than four items, slightly-over items (up to 1.75× the ceiling, capped at +$80) may be re-admitted.

**Gender.** Known men/women intent is applied to query generation and hard filters. Explicit opposite-gender products are dropped. Missing product gender is kept. Unspecified search gender does not over-filter. Men's queries never include women-only phrases such as heels or baby tees.

**Night Out.** Queries use nightlife language (`fitted going out shirt`, `camp collar`, `knit polo`, `satin`) rather than the raw phrase "Night Out". Channel3 has no exclude filter, so Styli applies conservative post-filters: pajama/sleepwear/hunting/fishing are hard-dropped; western/outdoor/workwear terms are ranked down only.

**Query-aware relevance.** The query that retrieved a product is structured intent, not a fake style tag. `query_relevance` matches product text to query tokens and synonyms (`Y2K` ↔ `2000s`, `baggy` ↔ `loose`/`carpenter`, `jeans` ↔ `denim`). A product is not penalized just because its metadata lacks the style name.

**Marketplace ranking.** Walmart, Amazon, Target, and eBay are deprioritized when the user has a style or brand fashion intent. They are not hard-filtered. If the user explicitly selected that retailer/brand, there is no penalty. Nike (or any selected brand) is not treated as a marketplace.

Hard vs soft:

| Signal | Hard filter | Rank only |
| --- | --- | --- |
| Opposite explicit gender | yes | — |
| Over item-budget (when budget set) | yes | luxury also ranked down if no budget |
| Non-USD / unavailable / bad image | yes | — |
| Night Out pajama/sleepwear | yes | — |
| Night Out western/outdoor | no | yes |
| Marketplace retailer | no | yes |
| Missing product gender | no | slight gender_fit discount |
| Missing price | no | neutral budget_fit |

## Relevance scoring

This is **not** the outfit score. It answers: how relevant is this single product to the catalog intent?

Deterministic 0–100 with an explainable breakdown:

| Dimension | Weight |
| --- | --- |
| query_relevance | 0.28 |
| product_relevance (style / category / occasion) | 0.22 |
| budget_fit | 0.15 |
| brand preference | 0.10 |
| gender_fit | 0.10 |
| source_quality | 0.10 |
| metadata quality | 0.05 |

Logs still include the older style/category/occasion fields plus `query_relevance`, `product_relevance`, `budget_fit`, `gender_fit`, and `source_quality`.

Gemini is not used for retrieval or ranking. Existing Gemini enrichment stays downstream.

## Live generate-outfit retrieval

`generate-outfit` calls the **same** search strategy directly (not `sync-channel3`).

| Rule | Behavior |
| --- | --- |
| Calls per generation | **One** retrieval phase at the start. Gemini retries and revision reuse that pool. |
| Persistence | None. Live products stay in memory as `CatalogProduct`s (`id` = `channel3:{id}`). |
| Enrichment | **Not** run on the live path. `enrich-product` needs a persisted row + a Gemini classify call per item, which is too expensive and would add extra Gemini usage. Live items use Channel3 title/category/price/image plus generate-outfit's existing untagged-row handling. |
| Sufficiency | Need usable top + bottom + shoes that can form a budget-valid core outfit. 50 tops and 0 shoes is not enough. |
| Hybrid | Keep live hits; fill missing required categories from the existing catalog. Brand / gender / budget filters still apply. |
| Brands | Preferred brand names go through existing Channel3 brand search. Unresolved brands are skipped, not replaced with other brands. |
| Failure | Timeout / 5xx / empty / missing key → catalog fallback. If the catalog also cannot build, existing `brands_no_fit` / `no_products` / `catalog_empty` codes apply. |
| Response | `catalog_source`: `channel3_live` \| `hybrid` \| `catalog_fallback`. `channel3_retrieval_attempted`: boolean. |

Do not run `npm run test:channel3` unless you explicitly want a live API smoke. Unit tests mock the Channel3 backend.

## Deduplication

Multiple targeted queries often return the same Channel3 product. Collapse on the existing identity: `source` + `source_product_id` (`external_search` + `channel3:{id}`). Different products are not merged just because titles look similar.

After ranking, a light diversity pass prefers brand / product-type / query variety. It does not force equal representation.

## How to add new style vocabulary

1. Add concepts to `STYLE_CONCEPTS` in `vocabulary.ts`.
2. Each concept is a short phrase plus allowed Styli categories.
3. Mark women-only or men-only terms with `women(...)` / `men(...)`. Do not put baby tees or heels on men's queries.
4. Add occasion phrases to `OCCASION_CONCEPTS` if the style is also an occasion (Night Out).
5. Do not change `channel3/client.ts` or put Styli slang in Channel3 filters.
6. Add a unit example in `searchStrategy.test.ts`.

## Endpoints used

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/v1/search` | Product search + `next_page_token` |
| `GET` | `/v1/brands/search` | Resolve a brand name to a Channel3 `brand_id` |

Search default filters: `availability: ["InStock"]`, `config.country: US`, `config.currency: USD`. Page size is Channel3's max of 30.

## Field mapping

| Channel3 | Styli `products` |
| --- | --- |
| `id` | `source_product_id` = `channel3:{id}` |
| `title` | `name` |
| `brands[].name` | `brand` |
| mapped category | `category` / `subcategory` |
| selected offer `price.price` / `currency` | `price` / `currency` |
| selected offer availability | `availability` |
| `structured_attributes.color` | `colors` |
| `description` | `description` |
| cleaned or main image URL | `image_url` |
| selected offer `url` | `purchase_url` |
| (logical source) | persisted `source` = `external_search` |

`source` is stored as `external_search` because the current `products.source` check constraint does not include `channel3` (no schema migration). The Channel3 identity is the `channel3:` prefix on `source_product_id`.

Unmapped Channel3 categories (furniture, gift cards, etc.) are skipped. Styli does not invent a slot.

## Offers

One Channel3 product → one Styli row. The chosen offer is:

1. Preferred website(s) from the sync request, if any match
2. In stock
3. USD (generation is USD-only; no FX conversion)
4. Lowest valid price among those

Out-of-stock or non-USD-only products are skipped so they never enter the generation pool.

## Images

Prefer `cleaned_url` on the main image, then `url`. Invalid URLs are skipped. Images stay as remote URLs; nothing is downloaded into Storage.

## Deduplication (persist)

Upsert on `(source, source_product_id)`. Re-running the same search updates the existing row.

## Enrichment

After ingest, the existing `enrichProductRowWithRetry` path classifies style / aesthetic / occasion / fit / silhouette. There is no Channel3-specific classifier.

## Tests

Unit tests (mocked, no network, no database writes):

```bash
npm run test:channel3-unit
npm run test:search-strategy
```

Live strategy smoke test (requires `CHANNEL3_API_KEY`, **does not write** to the database):

```bash
npm run test:channel3
```

Prints generated queries, raw fetch counts, duplicates removed, hard-filter reasons, ranked candidates with score breakdowns, brand/category distribution, and price range for:

- Y2K + top
- Streetwear + top
- Night Out + top
- Y2K + shoes
- Streetwear + bottom
- Y2K + H&M + Zara
- Streetwear + Nike + Adidas

Legacy single-query smoke:

```bash
CHANNEL3_SMOKE_QUERY=shirts npm run test:channel3
```

## Security

- Key stays on the server (`sync-channel3`, smoke script).
- Logs include query, brand names, counts, and HTTP status — never the API key or full Channel3 payloads.
- `generate-outfit` does not receive the key and does not call Channel3.
