# Styli Outfit AI Audit

Foundation document for the upcoming fashion-reasoning / critic system.

**Status:** read-only inspection. No code, schema, or UI was changed.

**Inspected:** `supabase/functions/generate-outfit` (`index.ts`, `catalog.ts`), shared enrichment types (`types/index.ts`, `types/database.ts`, `supabase/functions/_shared/catalog/fashionAttributes.ts`, `enrichProduct.ts`), products schema (`supabase/migrations/*`), `app/generation.tsx`, `app/outfit.tsx`, plus the client request mapper (`lib/generateOutfit.ts`) and preference store (`context/PreferencesContext.tsx`).

---

## 1. Current generation flow

Onboarding writes preferences into in-memory `PreferencesContext`. Nothing is persisted until the user later saves an outfit. Generation is a single POST to the `generate-outfit` Edge Function. The client never scores products or outfits.

```
Home
  → /you            age
  → /measurements   gender, skin tone, height/weight, optional body metrics
  → /style          vibe (Style)
  → /occasion       Occasion
  → /budget         dollar cap + optional separate shoe budget
  → /inspiration    optional images (metadata only) and/or links (max used: 6)
  → /brands         selected approved brands and/or requested custom brands
  → /generation     quota check → POST generate-outfit → store result
  → /outfit         display name, tip, pieces, total; save / shop / rebuild
```

### 1.1 Client: `app/generation.tsx`

Gate: if style, occasion, or budget is missing, redirect home.

Then, once:

1. `checkCanGenerate()` — free-tier quota / paywall.
2. `generateOutfit({...})` with the full preference snapshot (see §2).
3. On success: `consumeGeneration()`, `setGeneratedOutfit(outfit)`, navigate to `/outfit`.
4. On failure: `setGenerationError(message, code)`, still navigate to `/outfit` (error UI).

Loading copy is cosmetic only (`Finding your vibe…` etc.). It does not reflect real pipeline stages.

### 1.2 Client request: `lib/generateOutfit.ts`

`POST {SUPABASE_URL}/functions/v1/generate-outfit`

Body:

| Field | Source | Notes |
|---|---|---|
| `style` | `selectedStyle` | Title Case UI value, e.g. `"Streetwear"` |
| `occasion` | `selectedOccasion` | e.g. `"Night Out"` |
| `budget` | `selectedBudget` | Outfit cap in USD. If shoes are separate, this excludes shoes. |
| `shoe_budget` | `shoeBudget` or `null` | `null` when `shoesInBudget` is true. |
| `exclude_product_ids` | `excludeProductIds` | Filled by Rebuild (`prepareRebuild`). |
| `measurements` | `bodyMeasurements` | Flattened to snake_case cm/kg. Null if skipped. |
| `inspiration` | `inspirationSources` | Images become file metadata only (no pixels). Links keep `url`. |
| `gender` | `gender ?? 'any'` | `'men' \| 'women' \| 'any'` |
| `skin_tone` | `skinTone` | `'fair' \| 'light' \| 'medium' \| 'tan' \| 'deep' \| 'rich'` or null |
| `age` | `age` | Integer years, or null |
| `brand_preference` | brands + requests | `{ mode, brands[], requested_brands[] }` |

The client does **not** send product images, catalog IDs, sizes, or any prior critic score.

### 1.3 Edge Function: `generate-outfit/index.ts` handler

```
parse + validate request
  → readStylingContext()          measurements, age, inspiration, brands
  → loadCatalog()                 live products for brand + gender + freshness
  → filterCandidates()            price, dress-shoe gate, relevance rank, trim
  → [rebuild soft-unexclude]      if core 3-piece outfit is impossible
  → candidatesForPrompt()         slim JSON for Gemini
  → loop attempt 1..3
        Gemini  (or heuristic fallback)
        reject identical rebuild
        validateAndBuild()        IDs, unique categories, core pieces, budget
        return JSON
  → mapped error (budget / ai / invalid_ai)
```

### 1.4 Client response mapping

`mapGenerateResponseToOutfit()` keeps only display fields:

- outfit: `id`, `name` (`outfit_name`), `style`, `occasion`, `products`, `total`, `explanation` (`styling_tip`), `itemReasons`
- each product: `id`, `name`, `price`, `imageUrl`, `category` (`shoes` → `footwear`), `reason`, `purchaseUrl`

**Dropped before UI:** brand, color, subcategory, style/occasion tags, source, currency, enriched attrs.

### 1.5 Display: `app/outfit.tsx` + `OutfitCard`

Success: title, “Why this works” (`styling_tip`), product cards (image, category, name, price, per-item reason), total vs budget pill.

Actions: Shop (first `purchaseUrl`), Save (`outfits` + `outfit_items` rows), Rebuild (`prepareRebuild` → `/generation`).

Error: Try again / Change brands / Adjust budget. No AI critique is shown because none is produced.

Save persists `outfit_name`, `style`, `occasion`, `budget`, `total_price`, `styling_tip`, and per-item `product_id` + `reason`. No score, no critic notes.

---

## 2. Inputs the user actually provides

| Onboarding step | Fields | Used by generation? | How |
|---|---|---|---|
| You | `age` | Weakly | Folded into `measurements.age`. Prompt says favor flattering cuts; no age scorer. |
| Measurements | `gender` | Yes | SQL gender filter + `inferProductGender` + prompt rule. |
| Measurements | `skinTone` | Yes | Additive color keyword score + prompt rule. |
| Measurements | height, weight | Weakly | JSON in prompt only. |
| Measurements | shoulders, chest, waist, hips, thigh, inseam | Weakly | JSON in prompt only. Optional; often empty. |
| Style | 14 vibes | Yes | Alias tags, keyword lists, fit/silhouette affinity, prompt. |
| Occasion | 8 occasions | Yes | Tags, keywords, formality map, classy-look gate, prompt. |
| Budget | outfit $ + optional shoe $ | Yes | Hard filter + validation. |
| Inspiration | images / URLs | Weakly | Max 6. Images = filename/mime/size. URLs not fetched. Prompt: “style direction only.” |
| Brands | selected names / requested sites | Yes | Catalog scope. Unsupported requests become `unavailable_brands`. |
| Rebuild | previous product IDs | Yes | Soft-exclude from candidates; Gemini told to pick a different set. |

UI styles (Title Case) vs catalog enums (snake_case) are bridged by `normalizeTag` / `attrKey` (`Old Money` → `old money` / `old_money`).

---

## 3. Products database schema

### 3.1 Source / catalog columns

From `20260322000000_init_styli_schema.sql` + `20260924000000_catalog_sources.sql`:

| Column | Type | Role today |
|---|---|---|
| `id` | uuid | Candidate + AI `product_id` |
| `name` | text | Prompt, gender inference, keyword score, UI |
| `brand` | text | Prompt, brand spread, dress-shoe brand gate |
| `brand_id` | uuid? | Catalog scope + brand-spread key |
| `category` | top/bottom/shoes/outerwear/accessory | Required structure |
| `subcategory` | text? | Prompt + gender (skirt/heels) + dress-shoe gate |
| `price` | numeric | Hard budget filter |
| `currency` | text | Live load requires `USD` |
| `color` | text | Fallback color in prompt; skin-tone keywords |
| `colors` | text[] | Prompt (up to 4); skin-tone keywords |
| `sizes` | text[] | **Unused** by generate-outfit |
| `material` | text? | Prompt (80 chars); keyword text |
| `description` | text? | Prompt (160 chars); gender extra text |
| `gender` | men/women/unisex/unknown/null | SQL prefilter + inference |
| `availability` | enum | Live load requires `in_stock` |
| `image_url` | text | **Not sent to generate-outfit Gemini.** UI only. |
| `purchase_url` | text | Gender/URL heuristics; shop links |
| `style_tags` | text[] | Relevance + (demo-only) hard style filter |
| `occasion_tags` | text[] | Relevance |
| `source` | demo \| ingest types | Demo excluded in production |
| `source_product_id` | text? | Unused at generate time |
| `last_checked` | timestamptz | Freshness: last 7 days |
| `created_at` / `updated_at` | timestamptz | Unused at generate time |

### 3.2 Enrichment columns

From `20260924180607_product_enrichment.sql` + `fashionAttributes.ts` (`ENRICHMENT_VERSION = 1`):

| Column | Enum / type | Loaded into catalog? | Sent to Gemini? | Used in scoring? |
|---|---|---|---|---|
| `fit` | slim, regular, relaxed, oversized, fitted, loose, unknown | Yes | Yes if set | Yes (`STYLE_FIT`) |
| `silhouette` | skinny, straight, wide_leg, baggy, cropped, boxy, a_line, bodycon, oversized, regular, unknown | Yes | Yes if set | Yes (`STYLE_SILHOUETTE`) |
| `pattern` | solid, stripe, plaid, check, floral, graphic, logo, camo, animal, colorblock, ribbed, textured, unknown | Yes | Yes if set | Keyword text only |
| `aesthetic_tags` | streetwear, y2k, old_money, … | Yes | Yes if non-empty | +4 if match |
| `season_tags` | spring, summer, fall, winter, all_season | Yes | Yes if non-empty | +2 if current / all_season |
| `formality` | casual, smart_casual, formal, athletic, unknown | Yes | Yes if set | +2 if occasion map matches |
| `fit_confidence` | 0–1 | **No** | No | No |
| `silhouette_confidence` | 0–1 | **No** | No | No |
| `gender_confidence` | 0–1 | **No** | No | No |
| `style_confidence` | 0–1 | **No** | No | No |
| `ai_enriched` | bool | No | No | No (not a generate filter) |
| `ai_enriched_at` | timestamptz | No | No | No |
| `enrichment_version` | int | No | No | No |
| `enrichment_input_hash` | text | No | No | No |
| `enrichment_error` | text | No | No | No |
| `content_fingerprint` | generated md5 | No | No | Re-enrich trigger only |

Enrichment is a **separate** Gemini pass (`enrich-product` / `enrich-catalog`). It classifies one product from name/brand/category/description **plus the product image**. Generate-outfit never sees that image.

---

## 4. Exact product fields available to the generation AI

`loadCatalog` selects:

```
id, name, brand, brand_id, category, subcategory, price, currency, color, colors,
material, description, gender, image_url, purchase_url, style_tags, occasion_tags,
aesthetic_tags, season_tags, fit, silhouette, pattern, formality, source
```

`candidatesForPrompt()` then emits **only**:

```json
{
  "id": "uuid",
  "name": "…",
  "brand": "…",
  "category": "top | bottom | shoes | outerwear | accessory",
  "gender": "men | women | unisex",
  "subcategory": "optional",
  "price": 0,
  "colors": ["…"],
  "material": "optional, ≤80 chars",
  "fit": "optional",
  "silhouette": "optional",
  "pattern": "optional",
  "formality": "optional",
  "description": "optional, ≤160 chars",
  "style_tags": ["…"],
  "aesthetic_tags": ["…"],
  "occasion_tags": ["…"],
  "season_tags": ["…"]
}
```

`gender` here is **inferred** (`inferProductGender`), not the raw DB value.

**Never sent to Gemini at generate time:** `image_url`, `purchase_url`, `sizes`, `availability`, `currency`, `source`, `brand_id`, `style_tags` empty arrays (omitted), all confidence columns, enrichment metadata.

Typical prompt set: up to **10 products per category** (7 relevance-spread + 3 cheapest) × 5 categories = **≤50 candidates**.

---

## 5. Current prompts

### 5.1 Generate-outfit system prompt

From `callGemini()` in `supabase/functions/generate-outfit/index.ts`. Verbatim:

```
You are Styli, an expert fashion stylist.
The candidates are real products retrieved from the user's chosen stores.
Your job is only to choose and rank among them: choose a complete outfit ONLY from the provided candidate products.
Return product_id values from that list only.
Never invent products, IDs, names, prices, images, brands, or links.
Return ONLY valid JSON with this shape:
{
  "outfit_name": string,
  "items": [{ "product_id": string, "reason": string }],
  "styling_tip": string
}
Rules:
- Include exactly one top, one bottom, and one shoes item.
- Optionally include one outerwear and/or one accessory ONLY if the outfit still stays within budget.
- Every product_id must come from the candidate list.
- Shop for ${shopFor}. Never pick women's-coded pieces (skirts, dresses, heels, baby tees, crop tops, Mary Janes, blouses) when shopping for men. Never pick men's-only pieces when shopping for women.
- Strongly match the requested vibe. A Streetwear fit must not look like Old Money or Y2K.
- Prefer cohesive color/style for the requested vibe and occasion.
- If exclude_product_ids is non-empty, build a different fit — do not reuse those products.
- If shoe_budget is null, keep the total of all selected candidate prices <= budget.
- If shoe_budget is a number, shoes are budgeted separately: the shoes item must cost <= shoe_budget, and all other selected items together must cost <= budget.
- Do not include duplicate categories.
- If body measurements are provided, favor cuts and silhouettes that flatter them.
- If skin_tone is set, prefer candidate colors that flatter that complexion. Do not invent colors or products.
- Dress shoes (loafers, oxfords, Marc Nolan) are only in the list for date, work, event, night out, or classy vibes. Do not force them into street or school fits.
- If inspiration links are provided, use them only as style direction; you cannot open them.
- Candidates are already limited to the user's brands and fit preference; judge them on style, color and occasion.
```

`${shopFor}` is `"men"`, `"women"`, or `"any gender"`.

### 5.2 Generate-outfit user payload

JSON object (not free text):

```json
{
  "style": "Streetwear",
  "occasion": "Date",
  "shop_for": "men",
  "skin_tone": "medium",
  "budget": 150,
  "shoe_budget": null,
  "exclude_product_ids": [],
  "attempt": 1,
  "stricter": false,
  "instruction": "Build the best outfit within budget for this vibe.",
  "measurements": { "unit": "imperial", "height_cm": 180, "weight_kg": 75, "age": 24 },
  "inspiration": [],
  "candidates": [ "…see §4…" ]
}
```

`instruction` variants:

- first try: `Build the best outfit within budget for this vibe.`
- rebuild: `Build a different outfit than the excluded products, still matching the vibe.`
- retry (`attempt > 1`): `Previous attempt exceeded budget or was invalid. Choose cheaper compatible pieces and omit optional items if needed.`

### 5.3 Gemini call settings

- Models: `GEMINI_MODEL` or `gemini-3.8-flash`, then `GEMINI_FALLBACK_MODEL` or `gemini-3.5-flash`. 404/429/500/503 fall through.
- Temperature: `0.75` default, `0.95` on rebuild, `0.2` on stricter retry.
- `responseMimeType: application/json`
- No tools, no images, no structured-output schema beyond the text shape.
- Thought parts are stripped; remaining text is `parseAiJson()`.

### 5.4 Enrichment prompt (not used at generate time)

`enrichProduct.ts` classifies **one product** with the image. Schema from `classifySchemaPrompt()`: gender, subcategory, fit, silhouette, pattern, material, style/aesthetic/occasion/season tags, formality, four confidence floats. Temperature `0.1`. This is how enriched columns get filled; generate-outfit only **reads** the stored result.

---

## 6. Current filtering

Three layers. Later layers only see what earlier layers kept.

### 6.1 Catalog load (`loadCatalog`)

Brand scope:

- **No Preference:** every `brands.is_approved = true` **and** `status = 'supported'`.
- **Selected:** those names, if approved + supported. Never widened to other stores.
- **Requested custom brands:** included only if their domain is already `supported`.

Live product query (per category, limit 1000):

- `brand_id` in scoped IDs
- `source <> 'demo'`
- `availability = 'in_stock'`
- `currency = 'USD'`
- `last_checked >= now - 7 days`
- `price <= max(outfit budget, shoe budget)`
- SQL gender: men → `null | men | unisex | unknown`; women analogous. Null stays because many live rows are untagged.

Then `matchesGenderPreference()` using `inferProductGender()`:

1. Women's garment keywords / `skirt` / `heels` subcategory → women (title wins over `/mens/` URLs).
2. Title men/women cues.
3. Stored `gender` if men/women.
4. Description + purchase_url cues.
5. Else unisex.

Demo rows load only if `ALLOW_DEMO_CATALOG=true` or local Edge Function, **and** no live gendered products exist. Demo is never mixed with live.

Failure codes: `brands_unavailable`, `catalog_empty`, `network`.

### 6.2 Candidate trim (`filterCandidates`)

Keeps a product if:

1. Not in `exclude_product_ids`.
2. Price ≤ category cap (outfit budget, or shoe budget for shoes).
3. If `isDressFootwear` (Marc Nolan brand/URL, loafers/heels subcategory, loafer/oxford/derby/monk/dress-shoe name) → only when `isClassyLook(style, occasion)`.

Classy occasions: date, event, work, night out, party.  
Classy styles: formal, old money, quiet luxury, preppy, dark academia, runway.

Scoring (see §7.1). Per category:

- Rank by score desc, then price asc.
- Prefer items with score ≥ 2 or an explicit style-tag match; if none, use the full ranked list.
- Take 7 via `spreadAcrossBrands` (round-robin so Champion cannot fill the list).
- Plus 3 cheapest leftovers for budget room.

Demo rows are hard-filtered to matching `style_tags`. Live rows are **not** — comment in code: live rows rarely have style_tags, so Streetwear vs Old Money is mostly the relevance rank, not a hard pool split.

### 6.3 Rebuild softening

If required categories are empty or no 3-piece combo fits budget **and** excludes are set, `filterCandidates` is re-run with an empty exclude set. Overlap is allowed so Rebuild does not dead-end. Gemini is still asked for a different set; identical ID sets are rejected.

### 6.4 Structural validation (`validateAndBuild`)

After the model returns:

- Every `product_id` must exist in the candidate map.
- Categories unique.
- Must include top, bottom, shoes.
- Optional only: outerwear, accessory.
- `fitsBudget` (split shoe budget if set).

No fashion quality check. A matching-ID, on-budget, 3-category set is accepted.

---

## 7. Current outfit-selection logic

There is **no outfit-level scorer**. Selection is (a) per-item relevance to shrink the list, then (b) one Gemini (or heuristic) pick, then (c) structural validation.

### 7.1 Per-item `relevanceScore`

```
+6  style_tags ∩ requested style aliases
+4  aesthetic_tags ∩ style aliases
+3  occasion_tags match
+2  season_tags include current UTC season or all_season
+2  formality ∈ occasionFormality(occasion)
+2  fit ∈ STYLE_FIT[style]           (per alias)
+2  silhouette ∈ STYLE_SILHOUETTE[style]
+2× keyword hits for primary style in name/sub/material/colors/pattern/fit/silhouette/description
+1× keyword hits for alias styles
+N  occasion keyword hits
+5  dress footwear on a classy look
```

Style aliases (`styleAliasTags`):

| UI style | Extra catalog tags |
|---|---|
| Runway | formal, old money, y2k |
| Quiet Luxury | old money, minimalist |
| Dark Academia | preppy, grunge, formal |
| Elevated Streetwear | streetwear, athleisure, minimalist |
| others | self only |

`occasionFormality`:

| Occasion | Accepted formality |
|---|---|
| work, event | smart_casual, formal |
| party, night out, date | smart_casual, casual |
| vacation | casual, athletic |
| everyday, school, default | casual, athletic, smart_casual |

`STYLE_FIT` / `STYLE_SILHOUETTE` cover streetwear, y2k, old money, minimalist, preppy, athleisure (fit only), formal, grunge, quiet luxury. **Missing maps:** Clean Girl, Dark Academia, Elevated Streetwear, Runway, Casual (silhouette).

### 7.2 Per-item `skinToneColorScore`

Keyword hits on `color + colors + name`:

`prefer_hits * 2 - avoid_hits`

| Tone | Prefer | Avoid |
|---|---|---|
| fair | navy, burgundy, forest, emerald, charcoal, black, cobalt, wine, plum, ivory, white | beige, nude, orange, peach, yellow, camel |
| light | olive, camel, navy, rust, cream, forest, burgundy, rose, white, ivory | neon, yellow, orange |
| medium | gold, rust, olive, cream, terracotta, teal, white, camel, burgundy, navy | muddy, grey |
| tan | white, cream, gold, coral, olive, cobalt, emerald, ivory, navy | brown, khaki, tan, beige |
| deep | white, ivory, gold, emerald, cobalt, red, royal, yellow, fuchsia | brown, beige, khaki, olive |
| rich | white, gold, emerald, cobalt, red, fuchsia, royal, cream, silver | brown, beige, khaki, tan |

This scores **each item alone**. It does not score the outfit palette.

### 7.3 Gemini selection

One-shot choose-from-list. Reasons and `styling_tip` are unconstrained prose. Up to 3 attempts if parse/budget/invalid/identical-rebuild fails.

### 7.4 Heuristic fallback (`heuristicOutfit`)

Used only when `GEMINI_API_KEY` is missing **or** Gemini throws, **and** `ALLOW_HEURISTIC_FALLBACK=true` or local Edge Function.

1. Rank top 10 tops / bottoms / shoes by item score.
2. Enumerate budget-legal triples.
3. Sort by exclude-overlap, then **sum of item scores**, then cheapest total.
4. Among the top score band (±1), pick `(vibeSeed(style, occasion) + attempt) % band`.
5. Greedily add cheapest remaining outerwear/accessory.

Template copy, not fashion reasoning:

- name: `{style} {occasion} Edit`
- reasons: “Anchors the {style} vibe…”, “Balances the fit…”, “Grounds the outfit…”
- tip: “Keep the silhouette clean…”

### 7.5 What is **not** selected on

- Color harmony across pieces
- Pattern clash / print scale
- Layering (weight, length, season stacking)
- Proportion (crop + low-rise, oversized + baggy, etc.)
- Measurement-based size or silhouette
- Age-appropriate dressing
- Brand mix as a style choice (spread is anti-monopoly, not styling)
- Visual check of product photos
- Confidence-weighted tags
- Outfit diversity beyond exclude-IDs + temperature

---

## 8. Fashion rules that already exist

These are the real rules, not the prompt’s aspirations.

| Rule | Where | Strength |
|---|---|---|
| Exactly 1 top, 1 bottom, 1 shoes | Prompt + `validateAndBuild` | Hard |
| ≤1 outerwear, ≤1 accessory | Prompt + validator | Hard |
| Stay in (split) budget | Filter + validator | Hard |
| IDs from candidate list only | Prompt + validator | Hard |
| In-stock, fresh (7d), USD | `loadCatalog` | Hard |
| Gender shop-for | SQL + title/URL inference + prompt | Hard-ish (unisex leak; inference heuristics) |
| Women’s garments never for men | Title/subcategory regex | Hard |
| Dress shoes only on classy looks | `isDressFootwear` + `isClassyLook` | Hard filter |
| Brand scope not widened | `scopeBrands` | Hard |
| Rebuild not identical set | ID-set compare | Hard |
| Brand spread in shortlist | `spreadAcrossBrands` | Soft |
| Vibe via tags/keywords/fit/silhouette | `relevanceScore` | Soft rank |
| Skin-tone color keywords | `skinToneColorScore` | Soft rank |
| Current season | +2 if tagged | Soft |
| Formality vs occasion | +2 if mapped | Soft |
| “Cohesive color/style” | Prompt sentence only | Unenforced |
| “Favor cuts that flatter measurements” | Prompt sentence only | Unenforced |
| “Streetwear must not look like Old Money” | Prompt + rank, live pool still mixed | Unenforced as hard rule |
| Inspiration as direction | Prompt; URLs unread, images not sent | Unenforced |

---

## 9. What information is missing

### 9.1 Collected from the user but unused or underused

- **Measurements** — sent as JSON; no size table, no “this silhouette flatters this body,” no inseam/rise logic.
- **Age** — stuffed into measurements; no age-appropriate rule.
- **Inspiration images** — pixels never leave the device (`lib/generateOutfit.ts`: “Local image URIs can't leave the device yet”).
- **Inspiration URLs** — not fetched, not embedded, not summarized.

### 9.2 On the product row but unused at generate time

- `sizes` — cannot check whether a piece exists in the user’s size.
- `image_url` — generate Gemini is text-only, so it cannot see color/cut/vibe.
- Enrichment **confidence** — low-confidence tags are treated as fact.
- `ai_enriched` — unenriched live rows still enter the pool; ranking then falls back to name keywords.
- `availability` beyond the in_stock filter (no size-level stock).

### 9.3 Not modeled at all

- Color family / hex / contrast role (base / accent / neutral). Only free-text color names.
- Pattern scale, print vs solid pairing.
- Layering graph (what goes over what; season weight).
- Proportion / volume rules (one fitted + one relaxed, etc.).
- Footwear–hem rules (bootcut + boots, cropped + sneakers).
- Dress vs separates (no dress category; “one top + one bottom” is assumed).
- Accessories as optional punctuation, not random cheap add-ons (heuristic adds them if they fit).
- Weather / city / date of wear (only UTC season from `currentSeason()`).
- User closet / already-owned items / previous likes except Rebuild excludes.
- Outfit-level score, critique, or alternative ranking.
- Visual embedding / similarity to inspiration.

### 9.4 Catalog / data-quality gaps the critic will inherit

- Live `style_tags` are often empty, so vibe separation is keyword-fragile.
- Catalog composition is skewed (historically Champion-heavy); brand spread helps the shortlist, not the underlying inventory.
- Gender on many rows is null/unknown; inference is regex.
- 1000-row cap per category can hide better items that are older in `last_checked` order.

### 9.5 UI cannot show a critic result yet

`Outfit` / `Product` UI types have no score, no critique, no rejected-alternatives list. `styling_tip` and per-item `reason` are the only prose slots. A critic can reuse those today, or types must grow later.

---

## 10. Where an outfit scoring / critic system should be inserted

Do **not** put fashion reasoning in `generation.tsx` or `outfit.tsx`. Those screens only fire the request and render the result.

Recommended seams, in order:

### Insertion A — primary: post-assembly critic (inside the existing attempt loop)

**File:** `supabase/functions/generate-outfit/index.ts`  
**Where:** after `validateAndBuild(...)` succeeds, **before** `jsonResponse(...)`.

At that moment the system has:

- a structurally valid outfit (IDs, categories, budget)
- full `CatalogProduct` rows (colors, fit, silhouette, tags, material — more than the UI)
- the original `StylingContext` (measurements, age, inspiration, gender, skin tone, style, occasion)

A critic here can:

1. Score the **combination** (color harmony, vibe coherence, proportion, formality, skin-tone palette, measurement fit).
2. Reject below a threshold → `throw` → existing `MAX_ATTEMPTS` retry (already raises temperature down / stricter instruction).
3. Optionally rewrite `styling_tip` / item `reason` from the critique.
4. Attach `score` / `critique` on the JSON later without changing the DB.

This is the right default: Gemini (or heuristic) proposes; critic judges.

```
filterCandidates
  → Gemini / heuristic propose items
  → validateAndBuild          (keep: structure + budget)
  → ★ criticScore(outfit)     ← insert here
  → if reject: retry attempt
  → jsonResponse
```

### Insertion B — heuristic combo rank (deterministic path)

**File:** same, `heuristicOutfit()`.  
**Where:** the `combos.sort` that currently uses `overlap`, **sum of item scores**, then price.

Replace or augment `styleScore` with the same outfit-level critic so local fallback and Gemini are judged by one function.

### Insertion C — optional pre-critic of candidate pairs (later)

**File:** `filterCandidates` / new helper.  
**When:** if Gemini keeps pairing clashy items because the shortlist is clashy.

Use after A is working. Do not move all fashion logic into the shortlist — the shortlist should stay a **recall** step (diverse, on-budget, gendered). The critic is the **precision** step.

### Insertion D — do not use

| Place | Why not |
|---|---|
| `app/generation.tsx` / `app/outfit.tsx` | No catalog fields left; would add a second network hop; cannot enforce budget/IDs. |
| `enrich-product` | Classifies one SKU. Wrong grain for outfit rules. Keep it as attribute factory. |
| `validateAndBuild` rewrite | Keep this function structural. Mix-in fashion scores makes retries and errors harder to read. |
| Client `PreferencesContext` | Preferences are inputs, not judges. |

### Suggested critic inputs (already in memory at Insertion A)

```
user: { style, occasion, gender, skinTone, age, measurements, inspiration, budget }
items: CatalogProduct[]   // full rows, not prompt-slim objects
```

Suggested first signals that do **not** need new DB columns:

- shared / clashing color tokens (`colors` + `color` + skin-tone prefer/avoid)
- formality spread (casual hoodie + dress loafers)
- vibe tag overlap vs contradiction (streetwear hoodie + old-money loafer on Everyday)
- volume clash (`oversized` + `baggy` + `wide_leg` stacked)
- season vs `currentSeason()`
- measurement heuristics using existing `fit` / `silhouette` (e.g. prefer `straight`/`regular` when only height/weight exist)
- confidence gates once those columns are added to `PRODUCT_COLUMNS`

### Suggested critic outputs

Minimum (fits current API): accept / reject + optional better `styling_tip`.

Later (additive JSON, no migration required to start):

```json
{
  "fashion_score": 0.0,
  "fashion_notes": ["…"],
  "violations": ["proportion", "formality"]
}
```

UI can ignore unknown fields until a later screen wants them.

---

## 11. Implementation notes for the next phase

1. Treat this file as the contract of **what exists**. Do not assume Gemini is already a stylist; it is a constrained picker on a pre-ranked list.
2. Keep `validateAndBuild` as the legality layer. Add critic as a quality layer.
3. Share one scoring function between Gemini retries and `heuristicOutfit`.
4. Enrichment quality bounds critic quality. Empty `style_tags` / `fit` means the critic must still read names and colors.
5. Do not change products schema, generate-outfit behavior, or UI until the critic design is agreed from this audit.

---

## 12. File map

| Path | Role |
|---|---|
| `app/you.tsx` | Age |
| `app/measurements.tsx` | Gender, skin tone, body metrics |
| `app/style.tsx` / `occasion.tsx` / `budget.tsx` / `inspiration.tsx` / `brands.tsx` | Remaining onboarding |
| `app/generation.tsx` | Quota + `generateOutfit()` + loading |
| `app/outfit.tsx` | Result / error / save / rebuild |
| `context/PreferencesContext.tsx` | In-memory prefs + `excludeProductIds` |
| `lib/generateOutfit.ts` | Request/response DTO |
| `lib/savedOutfits.ts` | Persist name/tip/items only |
| `types/index.ts` | UI Style, Occasion, Outfit, measurements |
| `types/database.ts` | Full `products` row including unused enrichment |
| `supabase/functions/generate-outfit/index.ts` | Prompt, filter, Gemini, heuristic, validate |
| `supabase/functions/generate-outfit/catalog.ts` | Load, gender, relevance, skin tone, classy shoes |
| `supabase/functions/_shared/catalog/fashionAttributes.ts` | Enums, season, formality map, enrich schema |
| `supabase/functions/_shared/catalog/enrichProduct.ts` | Per-SKU Gemini classify (image + text) |
| `supabase/migrations/20260322000000_init_styli_schema.sql` | Base products |
| `supabase/migrations/20260924000000_catalog_sources.sql` | Brands + source fields |
| `supabase/migrations/20260924180607_product_enrichment.sql` | Fit/silhouette/tags/confidence |
