import { parseFashionCriticResult } from './parseFashionCritic.ts';
import { parseFashionRevisionResult } from './parseFashionRevision.ts';
import {
  buildCriticPrompt,
  buildCriticUserPayload,
  buildRevisionPrompt,
  buildRevisionUserPayload,
} from './criticContractPrompt.ts';
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
      systemInstruction: { parts: [{ text: buildCriticPrompt(input) }] },
      contents: [
        {
          role: 'user',
          parts: [{ text: JSON.stringify(buildCriticUserPayload(input)) }, ...images],
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
      systemInstruction: { parts: [{ text: buildRevisionPrompt(input) }] },
      contents: [
        {
          role: 'user',
          parts: [{ text: JSON.stringify(buildRevisionUserPayload(input)) }, ...images],
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
