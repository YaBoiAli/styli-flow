# Outfit scoring (Phase 1)

Deterministic, outfit-level quality engine. It answers “does this combination look like a good outfit?” It does **not** decide legality (IDs, categories, budget). That stays in `validateAndBuild()`.

**Module:** `supabase/functions/_shared/catalog/outfitScoring.ts`  
**Wired in Phase 1.5 / 2A / 2B / 3:** Gemini proposes up to 5 outfits. `scoreOutfit()` picks the winner. A visual critic reviews **only that winner**. If the critic flags a meaningful problem, Gemini may propose **one** targeted revision from the existing candidate pool. The revision must pass `validateAndBuild()` and beat the original `fashion_score` by **at least 2**. Otherwise the original winner is kept. Critic scores are never mixed into `fashion_score`. The UI ignores `fashion_*` / `fashion_critic*` / `fashion_revision*` fields.

---

## API

```ts
scoreOutfit(items: OutfitScoreItem[], context: OutfitScoringContext): OutfitScore
```

`OutfitScoreItem` is the scoring view of `CatalogProduct` (same fields the catalog already has). Do not invent a second product model.

`OutfitScoringContext` is the generate-outfit `StylingContext` plus the fields scoring actually needs:

| Field | Required | Notes |
|---|---|---|
| `style` | yes | UI or catalog string (`Streetwear`, `old money`, …) |
| `occasion` | yes | `Everyday`, `Work`, … |
| `skinTone` | no | `fair` / `light` / `medium` / `tan` / `deep` / `rich` |
| `measurements` | no | snake_case cm/kg map from generate-outfit |
| `season` | no | Test override. Defaults to `currentSeason()`. |

Return:

```ts
{
  score: number,          // 0–100, integer
  breakdown: { style, color, proportion, skinTone, occasion, fit, season, cohesion },
  issues: string[],
  suggestions: string[]
}
```

Each breakdown value is 0–100. Missing user data (no skin tone, no measurements, no color tokens) yields a **neutral 70** on that dimension instead of a guess.

---

## Formula

```
score =
  style      * 0.20 +
  color      * 0.20 +
  proportion * 0.20 +
  skinTone   * 0.10 +
  occasion   * 0.10 +
  fit        * 0.10 +
  season     * 0.05 +
  cohesion   * 0.05
```

Rounded to an integer. Constants live in `OUTFIT_SCORE_WEIGHTS`.

This is a **quality scorer**, not a validator. Unusual colors, mixed aesthetics, and uncommon silhouettes get penalties, not hard failures.

---

## Categories

### Style — 20%

Soft match of the **set** against the requested vibe.

Uses existing `styleAliasTags`, `STYLE_FIT`, `STYLE_SILHOUETTE`, `STYLE_KEYWORDS`, plus `style_tags` / `aesthetic_tags`. Name/description keywords are a fallback when tags are empty.

One strong anchor can carry weakly tagged pieces. Street-vs-prep cluster mixes are penalized unless the requested style is Runway (which already aliases both).

Does **not** require every item to carry the requested style tag.

### Color — 20%

Judges the **palette**, not each SKU alone.

Tokens come from `colors[]`, `color`, name, and a short description slice. Classification:

**Neutrals:** black, white, cream, ivory, gray, charcoal, beige, camel, brown, navy  
**Families:** red, orange, yellow, green, blue, purple, pink  

Variants map into those families (burgundy → red, olive → green, cobalt → blue, rust → orange, etc.). Navy is a neutral, matching the existing catalog palette.

High: all neutrals; one family + neutrals; complementary or analogous pair.  
Low: three or more competing saturated hues (bright orange + neon green + cobalt).  
Bold palettes are penalized less for Y2K / runway / streetwear, still not free.

### Skin tone — 10%

Reuses `SKIN_TONE_COLORS` from `fashionSignals.ts` (the same prefer/avoid lists `skinToneColorScore` uses).

Evaluates the **combined** labels. cream + olive + brown on medium is a palette (mostly preferred), not `cream +X, olive +X, brown −X`. Soft preference only. No undertones, no vision.

Unset skin tone → 70.

### Proportion — 20%

Volume from `fit` + `silhouette` (+ name fallback):

skinny < slim/fitted < regular/straight < relaxed < oversized/boxy < baggy/wide-leg

Heuristics, not laws:

- oversized + baggy: penalty unless streetwear / Y2K / grunge
- oversized + straight, or fitted + wide-leg: treated as balanced
- cropped top + high-volume bottom: slight bonus
- skinny + skinny: penalty unless old money / formal / minimalist

### Occasion / formality — 10%

Uses `occasionFormality()` and inferred formality when the column is missing.

Scores the **range** across the outfit. casual hoodie + jeans + sneakers is tight; formal trousers + graphic tee + running shoes is a wide spread.

Dress loafers on a casual remainder are a quality penalty when the look is not classy. This does **not** replace the existing dress-shoe hard filter in `filterCandidates`.

### Measurement / fit — 10%

No size claims. No “this SKU fits you.”

| Data | Behavior |
|---|---|
| none | 70 |
| height + weight only | conservative, stays near neutral |
| short height + stacked volume | small penalty |
| tall height + cropped top | small penalty |
| inseam vs cropped / wide-leg | small nudge |

### Season — 5%

`currentSeason()` plus `season_tags`, then material/category hints (wool/puffer → winter, linen/sandals → summer). Opposite-season stacks are penalized. No weather API.

### Cohesion — 5%

Whether the set looks intentional: shared aesthetics, color repetition, material clash (fleece + wool), two loud patterns, footwear that reinforces the vibe, optional outerwear/accessory that actually helps.

Not the same as style score. A streetwear graphic tee + formal wool trousers + loafers can each be “valid” items and still look accidental together.

---

## Issues and suggestions

Emitted only when the total is under 78. Strong outfits return `[]` / `[]`.

Issues are specific (“Top and bottom create excessive volume.”), not filler. Suggestions are actionable (“Replace the dress shoe with a casual sneaker.”).

---

## Hard vs soft

| Concern | Owner | Soft / hard |
|---|---|---|
| Valid IDs, unique categories, core pieces, budget | `validateAndBuild` | Hard |
| In-stock, fresh, USD, brand scope, gender | `loadCatalog` / `filterCandidates` | Hard |
| Dress shoes only on classy looks | `filterCandidates` | Hard (unchanged) |
| Style / color / proportion / skin / formality / season / cohesion | `scoreOutfit` | Soft |

---

## Examples

| Outfit | Typical read |
|---|---|
| Black tee + blue jeans + white sneakers | High color, high cohesion, solid casual |
| Cream sweater + olive pants + brown shoes | High palette; medium skin prefers this more than tan (brown is avoided on tan) |
| Oversized tee + baggy pants + runners | Fine for Streetwear; weaker for Old Money |
| Oversized tee + straight pants + sneakers | More balanced volume |
| Graphic tee + formal trousers + loafers | Low cohesion / formality spread |
| Burgundy + black + white | Strong accent palette |
| Bright orange + neon green + cobalt | Color penalty |
| Oxford shirt + chinos + loafers | High for Old Money / Work |

---

## What is reused

From `fashionSignals.ts` / `fashionAttributes.ts` (extracted so generate-outfit and the scorer share one source):

- `styleAliasTags`
- `STYLE_FIT`, `STYLE_SILHOUETTE`, `STYLE_KEYWORDS`
- `SKIN_TONE_COLORS`, `parseSkinTone`
- `isClassyLook`, `looksLikeDressFootwear`
- `occasionFormality`, `currentSeason`, `attrKey`

`relevanceScore` / `skinToneColorScore` still score **items**. This module scores **outfits**.

---

## Known limitations

- No product photos. Color is text tokens only; “navy” in a name without a color field still counts.
- Live `style_tags` / `fit` / `silhouette` are often empty; keywords then carry the style score.
- No hex, no contrast-role model, no real size table.
- Season is UTC month, not the wearer’s city or weather.
- Inspiration images/URLs are ignored (they never reach this function).
- Accessories/outerwear are optional extras; they can help or hurt cohesion but never make an outfit legal.
- Phase 2A selects the highest-scoring valid candidate. Phase 2B critiques the winner visually.
- Phase 3 may attempt **one** revision when the critic is weak, has a major issue, has multiple moderate issues, or a core critic dimension is ≤ 5. Minor notes and 7–8s do not revise.
- Revision uses only the existing filtered catalog. It must pass `validateAndBuild()`.
- Accept the revision only if `revised.score >= original.score + 2` (`MIN_REVISION_IMPROVEMENT`). Equal or worse scores keep the original.
- The critic never sets `fashion_score`. The final `fashion_critic` describes the **returned** outfit (re-run only if a revision is accepted). Failures keep the original winner.

---

## Tests

```bash
npm run test:outfit-score
```

Compares coherent vs conflicting sets. Does not freeze exact integers.
