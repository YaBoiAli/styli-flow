/**
 * Gemini outfit-generation prompt: canonical STYLE_CONTRACT / OCCASION_CONTRACT
 * interpretation. Retrieval keywords stay out of this prompt.
 */
import {
  OCCASION_CONTRACT,
  occasionContractFor,
  styleContractFor,
} from '../_shared/catalog/styleOccasionContract.ts';
import {
  candidateInterpretationGuide,
  REBUILD_OUTFIT_INSTRUCTION,
} from './outfitDiversity.ts';

/** Canonical occasion keys whose contract allows dress/classy footwear. */
export function classyFootwearOccasionLabels(): string[] {
  return Object.values(OCCASION_CONTRACT)
    .filter((record) => record.classyFootwear)
    .map((record) => record.key);
}

export type GeminiStyleContractPayload = {
  label: string;
  interpretation: string;
  fit_priors: string[];
  silhouette_priors: string[];
  volume_friendly: boolean;
  intensity_friendly: boolean;
};

export type GeminiOccasionContractPayload = {
  label: string;
  rules: string;
  accepted_formality: string[];
  classy_footwear: boolean;
};

export type GeminiContractContext = {
  requested_style: string;
  requested_occasion: string;
  style: GeminiStyleContractPayload | null;
  occasion: GeminiOccasionContractPayload | null;
};

export function buildGeminiContractContext(
  style: string,
  occasion: string,
): GeminiContractContext {
  const styleContract = styleContractFor(style);
  const occasionContract = occasionContractFor(occasion);
  return {
    requested_style: style,
    requested_occasion: occasion,
    style: styleContract
      ? {
          label: styleContract.label,
          interpretation: styleContract.geminiInterpretation,
          fit_priors: [...styleContract.fitPriors],
          silhouette_priors: [...styleContract.silhouettePriors],
          volume_friendly: styleContract.volumeFriendly,
          intensity_friendly: styleContract.intensityFriendly,
        }
      : null,
    occasion: occasionContract
      ? {
          label: occasionContract.label,
          rules: occasionContract.geminiRules,
          accepted_formality: [...occasionContract.acceptedFormality],
          classy_footwear: occasionContract.classyFootwear,
        }
      : null,
  };
}

export function formatGeminiContractSection(context: GeminiContractContext): string {
  const styleJson = JSON.stringify(context.style, null, 2);
  const occasionJson = JSON.stringify(context.occasion, null, 2);
  return `The selected style and occasion are canonical. Interpret the outfit using the STYLE CONTRACT and OCCASION CONTRACT below. Do not reinterpret them as a different style or occasion. Do not invent a different style or occasion.
The contract guides how to select and coordinate the supplied catalog products. It is not permission to invent products, IDs, or attributes. Deterministic server validation and scoring remain authoritative after generation.
Footwear preference, gender, budget, brands, and product IDs remain hard constraints.

STYLE CONTRACT
${styleJson}

OCCASION CONTRACT
${occasionJson}`;
}

export function stylistSystemPrompt(params: {
  shopFor: string;
  includeShoes: boolean;
  complexion: boolean;
  rebuild: boolean;
  style: string;
  occasion: string;
}): string {
  const contract = buildGeminiContractContext(params.style, params.occasion);
  const slots = params.includeShoes
    ? `- Each candidate must include exactly one top, one bottom, and one shoes item.`
    : `- Each candidate must include exactly one top and one bottom.
- Footwear was intentionally excluded. Never include shoes, sneakers, boots, sandals, heels, loafers, or any footwear. Set shoes_id to null. A candidate with footwear is invalid.`;
  const classyOccasions = classyFootwearOccasionLabels().join(', ');
  const shoesBudget = params.includeShoes
    ? `- If shoe_budget is null, keep the total of all selected candidate prices <= budget.
- If shoe_budget is a number, shoes are budgeted separately: the shoes item must cost <= shoe_budget, and all other selected items together must cost <= budget.
- Dress shoes (loafers, oxfords, Marc Nolan) are only in the list for ${classyOccasions}, or classy vibes. Do not force them into street or school fits.`
    : `- Keep the total of all selected candidate prices <= budget.`;
  const complexion = params.complexion
    ? `- Color preference is complexion-first: use the user's complexion as one guide for clothing colors, especially on tops and outerwear. Bottoms and shoes matter less. Do not let complexion override style, occasion, gender, or budget. Do not invent colors.`
    : `- Color preference is style-first: let the requested style and occasion drive color. Do not force complexion matching.`;
  const shoesJson = params.includeShoes ? '"shoes_id": string,' : '"shoes_id": null,';

  return `You are Styli, a professional personal stylist selecting a complete look from real inventory.
You are not filling category slots. You are building outfits a person would actually want to wear and buy.

Objective: from the provided products only, compose the strongest complete outfits for this user.

${formatGeminiContractSection(contract)}

The candidates are real products retrieved from the user's chosen stores.
Return product_id values from that list only.
Never invent products, IDs, names, prices, images, brands, links, or product attributes.
Return ONLY valid JSON with this shape:
{
  "outfit_name": string,
  "styling_tip": string,
  "candidates": [
    {
      "top_id": string,
      "bottom_id": string,
      ${shoesJson}
      "outerwear_id": string | null,
      "accessory_id": string | null,
      "reason": string
    }
  ]
}
Rules:
- Return up to 5 candidates. Return fewer if the catalog cannot support more looks you would actually recommend. Do not pad with weak combinations.
${slots}
- Optionally include one outerwear and/or one accessory ONLY if it improves the outfit and stays within budget. Skip extras that do not earn their place.
- Every id must come from the candidate list. Do not reuse the same product twice in one candidate.
- Shop for ${params.shopFor}. Never pick women's-coded pieces (skirts, dresses, heels, baby tees, crop tops, Mary Janes, blouses) when shopping for men. Never pick men's-only pieces when shopping for women.
- Do not select an item merely because it matches a keyword or style tag.
- Do not force a weak product into an outfit to fill a category if a stronger relationship exists among other pieces.
- Prefer products that create a clear relationship with the other selected pieces: silhouette, color, visual weight, and occasion.
- Each outfit needs a main piece and supporting pieces. Avoid random combinations of individually fine items.
- Prefer realistic wearability and purchase-worthiness over novelty.
- Use the requested style as an aesthetic direction, not a keyword filter. Follow the STYLE CONTRACT interpretation — do not default to a generic look that contradicts it.
- Respect budget, gender, occasion, and brand constraints.
${complexion}
- Explore meaningful variation when the catalog allows: different colors, silhouettes, or layering. Do not invent variety the catalog cannot support.
${candidateInterpretationGuide(params.style)}
${params.rebuild ? `- PREVIOUS OUTFIT is provided. ${REBUILD_OUTFIT_INSTRUCTION}` : ''}
${shoesBudget}
- Do not include duplicate categories.
- If body measurements are provided, favor cuts and silhouettes that flatter them.
- When a candidate includes a visual object, treat those attributes as observed. Do not invent colors, fits, patterns, or silhouettes that conflict with them.
- If inspiration links are provided, use them only as style direction; you cannot open them.
- Candidates are already limited to the user's brands and fit preference; judge them as a complete outfit, not as isolated products.`;
}
