import { parseFashionCriticResult } from './parseFashionCritic.ts';
import { parseFashionRevisionResult } from './parseFashionRevision.ts';
import {
  generateGeminiContent,
  geminiJsonGenerationConfig,
  geminiModelsFromEnv,
  inspectGeminiPayload,
  normalizeImageMimeType,
} from '../geminiResponse.ts';
import type {
  FashionAIProvider,
  FashionCriticInput,
  FashionCriticProduct,
  FashionCriticResult,
  FashionRevisionInput,
  FashionRevisionResult,
} from './types.ts';

function mimeFromUrl(url: string): string {
  return normalizeImageMimeType('', url) ?? 'image/jpeg';
}

function criticSystemPrompt(input: FashionCriticInput): string {
  const footwearNote =
    input.footwearPreference === 'none'
      ? `
Footwear was intentionally excluded. Do not treat the absence of shoes, sneakers, boots, sandals, heels, or any footwear as an issue or as incompleteness. Never recommend adding footwear.`
      : '';
  const complexionNote =
    input.colorPreference === 'complexion'
      ? `
Color preference is complexion-first: judge whether clothing colors complement the user's complexion, especially on tops and outerwear. This is one factor, not the only one.`
      : `
Color preference is style-first: do not force complexion matching. Judge color as part of style, occasion, and outfit cohesion.`;
  return `You are an experienced personal stylist reviewing ONE complete outfit from product photos and metadata.
Evaluate the COMPLETE outfit as a composition. Do not pick a different outfit. Do not invent or replace products.
Do not infer sensitive personal attributes. Complexion, if provided, is only for clothing color compatibility.${footwearNote}${complexionNote}
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

function metadataForPrompt(input: FashionCriticInput) {
  return {
    style: input.style,
    occasion: input.occasion,
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

function imageParts(products: FashionCriticProduct[]): Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = [];
  for (const product of products) {
    if (!product.image_available || !product.image_url) continue;
    parts.push({
      text: `Image for product_id=${product.product_id} (${product.category})`,
    });
    parts.push({
      fileData: {
        fileUri: product.image_url,
        mimeType: mimeFromUrl(product.image_url),
      },
    });
  }
  return parts;
}

function readGeminiText(payload: unknown): string {
  return inspectGeminiPayload(payload).text;
}

export class GeminiFashionAIProvider implements FashionAIProvider {
  readonly name = 'gemini';

  async generateOutfits(_input: unknown): Promise<unknown> {
    throw new Error('not_implemented');
  }

  async critiqueOutfit(input: FashionCriticInput): Promise<FashionCriticResult | null> {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) return null;

    const images = imageParts(input.products);
    if (!images.length) return null;

    const http = await generateGeminiContent({
      apiKey,
      models: geminiModelsFromEnv(Deno.env),
      systemInstruction: { parts: [{ text: criticSystemPrompt(input) }] },
      contents: [
        {
          role: 'user',
          parts: [{ text: JSON.stringify(metadataForPrompt(input)) }, ...images],
        },
      ],
      generationConfig: geminiJsonGenerationConfig(0.2),
    });

    if (!http.ok) return null;
    const content = readGeminiText(http.payload);
    if (!content.trim()) return null;
    return parseFashionCriticResult(
      content,
      input.products.map((product) => product.product_id),
    );
  }

  async reviseOutfit(input: FashionRevisionInput): Promise<FashionRevisionResult | null> {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) return null;

    const allowedIds = new Set(input.catalog.map((product) => product.product_id));
    const images = imageParts(input.currentOutfit);
    const http = await generateGeminiContent({
      apiKey,
      models: geminiModelsFromEnv(Deno.env),
      systemInstruction: { parts: [{ text: revisionSystemPrompt(input) }] },
      contents: [
        {
          role: 'user',
          parts: [{ text: JSON.stringify(revisionUserPayload(input)) }, ...images],
        },
      ],
      generationConfig: geminiJsonGenerationConfig(0.3),
    });

    if (!http.ok) return null;
    const content = readGeminiText(http.payload);
    if (!content.trim()) return null;
    return parseFashionRevisionResult(content, allowedIds, {
      requireShoes: input.footwearPreference !== 'none',
    });
  }
}

function revisionSystemPrompt(input: FashionRevisionInput): string {
  const includeShoes = input.footwearPreference !== 'none';
  const coreSlots = includeShoes
    ? 'Include exactly one top, one bottom, and one shoes. Optional outerwear/accessory only if they stay valid.'
    : 'Include exactly one top and one bottom. Footwear was intentionally excluded — do not add shoes, sneakers, boots, sandals, heels, or any footwear, even if the critic mentions it. Optional outerwear/accessory only if they stay valid.';
  const complexion =
    input.colorPreference === 'complexion'
      ? 'If the critic says a color does not complement the user\'s complexion, replace that piece (usually the top or outerwear). Complexion is one factor, not the only one.'
      : 'Do not change pieces only to force complexion matching.';
  return `You are revising ONE existing outfit. Preserve as much of the current outfit as possible. Change only the pieces necessary to address the critic's problems.
If the critic names a weak piece, replace that piece from the catalog. You may replace more than one piece if needed to restore cohesion, but prefer the smallest change.
If color is the problem, change the conflicting piece. If proportion, silhouette, or visual weight is the problem, change that silhouette. If two pieces both have high visual intensity, swap one for a quieter alternative from the catalog. If occasion is the problem, replace the formality mismatch. If the pants make the outfit feel disconnected, replace the pants.
${complexion}
Use only product_id values from the provided candidate catalog. Never invent products or IDs.
When products include a visual object, use those attributes. Do not invent conflicting colors, fits, patterns, or silhouettes.
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

function revisionUserPayload(input: FashionRevisionInput) {
  return {
    style: input.style,
    occasion: input.occasion,
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
      'Preserve as much of the current outfit as possible. Change only the pieces necessary to address the critic\'s problems.',
  };
}
