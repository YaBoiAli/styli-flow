import { parseFashionCriticResult } from './parseFashionCritic.ts';
import { parseFashionRevisionResult } from './parseFashionRevision.ts';
import type {
  FashionAIProvider,
  FashionCriticInput,
  FashionCriticProduct,
  FashionCriticResult,
  FashionRevisionInput,
  FashionRevisionResult,
} from './types.ts';

const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
const FALLBACK_GEMINI_MODEL = 'gemini-3.5-flash';

function geminiModels(): string[] {
  const primary = Deno.env.get('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;
  const fallback = Deno.env.get('GEMINI_FALLBACK_MODEL') || FALLBACK_GEMINI_MODEL;
  return [...new Set([primary, fallback])];
}

function mimeFromUrl(url: string): string {
  const path = url.split('?')[0].toLowerCase();
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function criticSystemPrompt(): string {
  return `You are an experienced personal stylist reviewing ONE complete outfit from product photos and metadata.
Evaluate the outfit as a whole. Do not pick a different outfit. Do not invent or replace products.
Do not infer sensitive personal attributes. Skin tone, if provided, is only for clothing color compatibility.
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
Judge: style match, color harmony, proportion/silhouette, occasion, cohesion, and specific weak points.`;
}

function metadataForPrompt(input: FashionCriticInput) {
  return {
    style: input.style,
    occasion: input.occasion,
    ...(input.skinTone ? { skin_tone: input.skinTone } : {}),
    ...(input.measurements ? { measurements: input.measurements } : {}),
    ...(input.season ? { season: input.season } : {}),
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
  const parts: Array<{ text?: unknown; thought?: unknown }> =
    (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown; thought?: unknown }> } }> })
      ?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((part) => !part.thought && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('');
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

    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: criticSystemPrompt() }] },
      contents: [
        {
          role: 'user',
          parts: [{ text: JSON.stringify(metadataForPrompt(input)) }, ...images],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    });

    let response: Response | null = null;
    for (const model of geminiModels()) {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'x-goog-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body,
        },
      );
      if (![404, 429, 500, 503].includes(response.status)) break;
      await response.body?.cancel();
    }

    if (!response?.ok) return null;
    const payload = await response.json();
    const content = readGeminiText(payload);
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
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: revisionSystemPrompt() }] },
      contents: [
        {
          role: 'user',
          parts: [{ text: JSON.stringify(revisionUserPayload(input)) }, ...images],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json',
      },
    });

    let response: Response | null = null;
    for (const model of geminiModels()) {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'x-goog-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body,
        },
      );
      if (![404, 429, 500, 503].includes(response.status)) break;
      await response.body?.cancel();
    }

    if (!response?.ok) return null;
    const payload = await response.json();
    const content = readGeminiText(payload);
    if (!content.trim()) return null;
    return parseFashionRevisionResult(content, allowedIds);
  }
}

function revisionSystemPrompt(): string {
  return `You are revising ONE existing outfit. Preserve as much of the current outfit as possible. Change only the pieces necessary to address the critic's problems.
Use only product_id values from the provided candidate catalog. Never invent products or IDs.
If color is the problem, change the conflicting piece. If proportion is the problem, change that silhouette. If occasion is the problem, replace the formality mismatch. Prefer the smallest change.
Return ONLY JSON:
{
  "items": [{ "product_id": string, "reason": string }],
  "outfit_name": string,
  "styling_tip": string
}
Include exactly one top, one bottom, and one shoes. Optional outerwear/accessory only if they stay valid.`;
}

function revisionUserPayload(input: FashionRevisionInput) {
  return {
    style: input.style,
    occasion: input.occasion,
    ...(input.skinTone ? { skin_tone: input.skinTone } : {}),
    ...(input.measurements ? { measurements: input.measurements } : {}),
    ...(input.season ? { season: input.season } : {}),
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
    })),
    critic: input.critic,
    catalog: input.catalog,
    instruction:
      'Preserve as much of the current outfit as possible. Change only the pieces necessary to address the critic\'s problems.',
  };
}
