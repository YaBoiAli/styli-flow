/**
 * Phase 5C: canonical STYLE_CONTRACT / OCCASION_CONTRACT in critic + revision prompts.
 * Generation prompts stay in generate-outfit/geminiOutfitPrompt.ts (Phase 5A).
 */
import {
  occasionContractFor,
  styleContractFor,
} from '../catalog/styleOccasionContract.ts';
import type { FashionCriticInput, FashionRevisionInput } from './types.ts';

export type CriticStyleContractPayload = {
  label: string;
  critic_interpretation: string | null;
};

export type CriticOccasionContractPayload = {
  label: string;
  rules: string;
  accepted_formality: string[];
  classy_footwear: boolean;
};

export type CriticContractContext = {
  requested_style: string;
  requested_occasion: string;
  style: CriticStyleContractPayload | null;
  occasion: CriticOccasionContractPayload | null;
};

export function buildCriticContractContext(
  style: string,
  occasion: string,
): CriticContractContext {
  const styleContract = styleContractFor(style);
  const occasionContract = occasionContractFor(occasion);
  const criticInterpretation = styleContract?.criticInterpretation.trim() || null;
  return {
    requested_style: style,
    requested_occasion: occasion,
    style: styleContract
      ? {
          label: styleContract.label,
          critic_interpretation: criticInterpretation,
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

export function formatCriticContractSection(context: CriticContractContext): string {
  const styleJson = JSON.stringify(context.style, null, 2);
  const occasionJson = JSON.stringify(context.occasion, null, 2);
  return `Treat the supplied style and occasion as canonical. Judge the outfit against the STYLE CONTRACT and OCCASION CONTRACT below. Do not reinterpret the requested vibe as a different style or occasion.
Evaluate whether this actual outfit visually expresses the requested canonical style and occasion. Identify concrete visual mismatches.
Do not invent products. Do not override hard server constraints (budget, gender, brands, footwear preference, excluded product IDs).
The critic is advisory. Deterministic server validation and scoring remain authoritative.

STYLE CONTRACT
${styleJson}

OCCASION CONTRACT
${occasionJson}`;
}

export function buildCriticPrompt(input: FashionCriticInput): string {
  const contract = formatCriticContractSection(
    buildCriticContractContext(input.style, input.occasion),
  );
  const footwearNote =
    input.footwearPreference === 'none'
      ? `
Footwear was intentionally excluded. Do not treat the absence of shoes, sneakers, boots, sandals, heels, or any footwear as an issue or as incompleteness. Never recommend adding footwear. If you notice a footwear gap, treat it as irrelevant.`
      : '';
  const complexionNote =
    input.colorPreference === 'complexion'
      ? `
Color preference is complexion-first: judge whether clothing colors complement the user's complexion, especially on tops and outerwear. This is one factor, not the only one.`
      : `
Color preference is style-first: do not force complexion matching. Judge color as part of style, occasion, and outfit cohesion.`;
  return `You are an experienced personal stylist reviewing ONE complete outfit from product photos and metadata.
Evaluate the COMPLETE outfit as a composition. Do not pick a different outfit. Do not invent or replace products.
Do not infer sensitive personal attributes. Complexion, if provided, is only for clothing color compatibility.

${contract}${footwearNote}${complexionNote}
Return ONLY JSON:
{
  "overall_assessment": "strong" | "acceptable" | "weak",
  "style_match": 1-10,
  "color_harmony": 1-10,
  "proportion": 1-10,
  "occasion_match": 1-10,
  "cohesion": 1-10,
  "strengths": [string],
  "issues": [{ "type": "color"|"style"|"proportion"|"occasion"|"cohesion"|"other", "severity": "minor"|"moderate"|"major", "product_id": string? }],
  "recommendations": [string]
}
Use a selected product_id only when a specific piece is at fault. Scores are integers 1-10.
Do not call an outfit strong just because the pieces are individually fashionable.
Judge:
- Would these pieces realistically be worn together?
- Is there a clear visual hierarchy (a main piece and supporting pieces)?
- Do the silhouettes and proportions make sense together?
- Does the outfit actually communicate the requested style, not just share a keyword?
- Are any individual pieces dragging the outfit down?
- Does it look generic or random rather than styled?
- Would a stylist realistically recommend this combination?
Also judge color harmony (including saturation, brightness, and where color sits on the body), proportion, pattern interaction, visual weight, aesthetic cohesion, and occasion.
When a product includes a visual object, treat those attributes as observed. Do not invent conflicting colors, fits, patterns, or silhouettes.`;
}

export function buildRevisionPrompt(input: FashionRevisionInput): string {
  const contract = formatCriticContractSection(
    buildCriticContractContext(input.style, input.occasion),
  );
  const includeShoes = input.footwearPreference !== 'none';
  const coreSlots = includeShoes
    ? 'Include exactly one top, one bottom, and one shoes. Optional outerwear/accessory only if they stay valid.'
    : 'Include exactly one top and one bottom. Footwear was intentionally excluded — do not add shoes, sneakers, boots, sandals, heels, or any footwear, even if the critic mentions it. Set shoes_id to null. If the critic mentions footwear, treat it as irrelevant. Optional outerwear/accessory only if they stay valid.';
  const complexion =
    input.colorPreference === 'complexion'
      ? 'If the critic says a color does not complement the user\'s complexion, replace that piece (usually the top or outerwear). Complexion is one factor, not the only one.'
      : 'Do not change pieces only to force complexion matching.';
  return `You are revising ONE existing outfit. Preserve as much of the current outfit as possible. Change only the pieces necessary to address the critic's problems.
Improve the current outfit while preserving the requested canonical style and occasion. Only change products when the critic identifies a concrete weakness.

${contract}

If the critic names a weak piece, replace that piece from the catalog. You may replace more than one piece if needed to restore cohesion, but prefer the smallest change.
If color is the problem, change the conflicting piece. If proportion, silhouette, or visual weight is the problem, change that silhouette. If two pieces both have high visual intensity, swap one for a quieter alternative from the catalog. If occasion is the problem, replace the formality mismatch. If the pants make the outfit feel disconnected, replace the pants.
${complexion}
Use only product_id values from the provided candidate catalog. Never invent products or IDs. Never reintroduce excluded product IDs.
When products include a visual object, use those attributes. Do not invent conflicting colors, fits, patterns, or silhouettes.
Prefer catalog rows that include a visual object when swapping. Do not swap to a product that lacks visual evidence when a visually analyzed alternative exists.
Ignore any critic recommendation to add footwear when footwear was intentionally excluded.
Never violate budget, gender, category requirements, availability, brand restrictions, or footwear preference.
Return ONLY JSON:
{
  "items": [{ "product_id": string, "reason": string }],
  "outfit_name": string,
  "styling_tip": string
}
${coreSlots}`;
}

export function buildCriticUserPayload(input: FashionCriticInput) {
  const contract = buildCriticContractContext(input.style, input.occasion);
  return {
    style: input.style,
    occasion: input.occasion,
    style_contract: contract.style,
    occasion_contract: contract.occasion,
    ...(input.skinTone ? { skin_tone: input.skinTone } : {}),
    ...(input.colorPreference ? { color_preference: input.colorPreference } : {}),
    ...(input.measurements ? { measurements: input.measurements } : {}),
    ...(input.season ? { season: input.season } : {}),
    ...(input.footwearPreference ? { footwear_preference: input.footwearPreference } : {}),
    products: input.products.map((product) => ({
      product_id: product.product_id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      subcategory: product.subcategory,
      color: product.color,
      colors: product.colors,
      material: product.material,
      fit: product.fit,
      silhouette: product.silhouette,
      style_tags: product.style_tags,
      aesthetic_tags: product.aesthetic_tags,
      occasion_tags: product.occasion_tags,
      image_available: product.image_available,
      ...(product.visual ? { visual: product.visual } : {}),
    })),
  };
}

export function buildRevisionUserPayload(input: FashionRevisionInput) {
  const contract = buildCriticContractContext(input.style, input.occasion);
  return {
    style: input.style,
    occasion: input.occasion,
    style_contract: contract.style,
    occasion_contract: contract.occasion,
    ...(input.skinTone ? { skin_tone: input.skinTone } : {}),
    ...(input.colorPreference ? { color_preference: input.colorPreference } : {}),
    ...(input.measurements ? { measurements: input.measurements } : {}),
    ...(input.season ? { season: input.season } : {}),
    ...(input.footwearPreference ? { footwear_preference: input.footwearPreference } : {}),
    current_outfit: input.currentOutfit.map((product) => ({
      product_id: product.product_id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      subcategory: product.subcategory,
      color: product.color,
      colors: product.colors,
      material: product.material,
      fit: product.fit,
      silhouette: product.silhouette,
      style_tags: product.style_tags,
      aesthetic_tags: product.aesthetic_tags,
      occasion_tags: product.occasion_tags,
      image_available: product.image_available,
      ...(product.visual ? { visual: product.visual } : {}),
    })),
    critic: input.critic,
    catalog: input.catalog,
    instruction:
      'Preserve as much of the current outfit as possible. Change only the pieces necessary to address the critic\'s problems. Do not reinterpret the requested canonical style or occasion.',
  };
}
