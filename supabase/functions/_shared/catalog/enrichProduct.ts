import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import {
  type EnrichedAttributes,
  ENRICHMENT_VERSION,
  classifySchemaPrompt,
  parseEnrichedAttributes,
} from './fashionAttributes.ts';

export const PRODUCT_ENRICH_COLUMNS =
  'id, name, brand, description, category, subcategory, material, gender, image_url, ' +
  'style_tags, occasion_tags, source, ai_enriched, enrichment_version, enrichment_input_hash, ' +
  'content_fingerprint';

export type EnrichableProduct = {
  id: string;
  name: string;
  brand: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  material: string | null;
  gender: 'men' | 'women' | 'unisex' | 'unknown' | null;
  image_url: string;
  style_tags: string[];
  occasion_tags: string[];
  source: string;
  ai_enriched: boolean;
  enrichment_version: number | null;
  enrichment_input_hash: string | null;
  content_fingerprint: string;
};

export type EnrichOutcome =
  | { ok: true; product_id: string; used_image: boolean; attributes: EnrichedAttributes }
  | { ok: false; product_id: string; error: string; retryable: boolean };

const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
const FALLBACK_GEMINI_MODEL = 'gemini-3.5-flash';
const IMAGE_TIMEOUT_MS = 8_000;
const IMAGE_MAX_BYTES = 4_000_000;

class RetryableError extends Error {
  override name = 'RetryableError';
}

function geminiModels(): string[] {
  const primary = Deno.env.get('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;
  const fallback = Deno.env.get('GEMINI_FALLBACK_MODEL') || FALLBACK_GEMINI_MODEL;
  return [...new Set([primary, fallback])];
}

function uniqueTags(existing: string[], next: string[]): string[] {
  const seen = new Set(existing.map((tag) => tag.toLowerCase()));
  const merged = [...existing];
  for (const tag of next) {
    if (seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    merged.push(tag);
  }
  return merged.slice(0, 8);
}

async function fetchProductImage(
  imageUrl: string,
): Promise<{ mimeType: string; data: string } | null> {
  if (!imageUrl.startsWith('https://') && !imageUrl.startsWith('http://')) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    const response = await fetch(imageUrl, {
      signal: controller.signal,
      headers: { Accept: 'image/*' },
    });
    if (!response.ok) return null;
    const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
    if (!mimeType.startsWith('image/')) return null;
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (!buffer.byteLength || buffer.byteLength > IMAGE_MAX_BYTES) return null;
    let binary = '';
    for (const byte of buffer) binary += String.fromCharCode(byte);
    return { mimeType, data: btoa(binary) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseModelJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(fenced ? fenced[1].trim() : trimmed);
}

async function classifyWithGemini(
  product: EnrichableProduct,
  image: { mimeType: string; data: string } | null,
): Promise<EnrichedAttributes> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('ai_missing');

  const system = `You classify one existing fashion product for Styli.
You do not invent products, names, prices, images, brands, or URLs.
You only assign standardized attributes for the product described below.
If the image is missing or unclear, use text only.
If evidence is insufficient for a field, use "unknown" or [].
Never invent visual attributes you cannot see or read.
${classifySchemaPrompt()}`;

  const userText = JSON.stringify({
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
    image_provided: Boolean(image),
  });

  const parts: Array<Record<string, unknown>> = [{ text: userText }];
  if (image) {
    parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  }

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.1,
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

  if (!response) throw new RetryableError('ai');
  if ([429, 500, 503].includes(response.status)) {
    await response.body?.cancel();
    throw new RetryableError('ai_rate_limited');
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('ai');
  }

  const payload = await response.json();
  const modelParts: Array<{ text?: unknown; thought?: unknown }> =
    payload?.candidates?.[0]?.content?.parts ?? [];
  const content = modelParts
    .filter((part) => !part.thought && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('');
  if (!content.trim()) throw new Error('invalid_enrichment');
  return parseEnrichedAttributes(parseModelJson(content));
}

function enrichmentPatch(
  product: EnrichableProduct,
  attrs: EnrichedAttributes,
): Record<string, unknown> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    fit: attrs.fit,
    silhouette: attrs.silhouette,
    pattern: attrs.pattern,
    aesthetic_tags: attrs.aesthetic_tags,
    season_tags: attrs.season_tags,
    formality: attrs.formality,
    fit_confidence: attrs.fit_confidence,
    silhouette_confidence: attrs.silhouette_confidence,
    gender_confidence: attrs.gender_confidence,
    style_confidence: attrs.style_confidence,
    ai_enriched: true,
    ai_enriched_at: now,
    enrichment_version: ENRICHMENT_VERSION,
    enrichment_input_hash: product.content_fingerprint,
    enrichment_error: null,
  };

  // Source-owned columns are filled only when ingest left them empty.
  if (!product.gender || product.gender === 'unknown') {
    patch.gender = attrs.gender === 'unknown' ? null : attrs.gender;
  }
  if (!product.subcategory && attrs.subcategory !== 'unknown') {
    patch.subcategory = attrs.subcategory;
  }
  if (!product.material && attrs.material !== 'unknown') {
    patch.material = attrs.material;
  }
  patch.style_tags = uniqueTags(product.style_tags ?? [], attrs.style_tags);
  patch.occasion_tags = uniqueTags(product.occasion_tags ?? [], attrs.occasion_tags);
  return patch;
}

export function isRetryableEnrichError(error: unknown): boolean {
  return error instanceof RetryableError;
}

export async function loadEnrichableProduct(
  supabase: SupabaseClient,
  productId: string,
): Promise<EnrichableProduct | null> {
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_ENRICH_COLUMNS)
    .eq('id', productId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as EnrichableProduct;
  return {
    ...row,
    style_tags: Array.isArray(row.style_tags) ? row.style_tags : [],
    occasion_tags: Array.isArray(row.occasion_tags) ? row.occasion_tags : [],
  };
}

export async function enrichProductRow(
  supabase: SupabaseClient,
  product: EnrichableProduct,
): Promise<EnrichOutcome> {
  try {
    const image = await fetchProductImage(product.image_url);
    const attributes = await classifyWithGemini(product, image);
    const { error } = await supabase
      .from('products')
      .update(enrichmentPatch(product, attributes))
      .eq('id', product.id);
    if (error) {
      return { ok: false, product_id: product.id, error: error.message, retryable: false };
    }
    return { ok: true, product_id: product.id, used_image: Boolean(image), attributes };
  } catch (err) {
    const retryable = isRetryableEnrichError(err);
    const message = err instanceof Error ? err.message : 'unknown';
    if (!retryable) {
      await supabase
        .from('products')
        .update({
          enrichment_error: message.slice(0, 300),
          enrichment_version: ENRICHMENT_VERSION,
          enrichment_input_hash: product.content_fingerprint,
          ai_enriched: false,
        })
        .eq('id', product.id);
    }
    return { ok: false, product_id: product.id, error: message, retryable };
  }
}

export async function enrichProductById(
  supabase: SupabaseClient,
  productId: string,
): Promise<EnrichOutcome> {
  const product = await loadEnrichableProduct(supabase, productId);
  if (!product) {
    return { ok: false, product_id: productId, error: 'not_found', retryable: false };
  }
  return enrichProductRow(supabase, product);
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function enrichProductRowWithRetry(
  supabase: SupabaseClient,
  product: EnrichableProduct,
  options: { retries?: number; baseMs?: number } = {},
): Promise<EnrichOutcome> {
  const retries = options.retries ?? 3;
  const baseMs = options.baseMs ?? 800;
  let last: EnrichOutcome | null = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    last = await enrichProductRow(supabase, product);
    if (last.ok || !last.retryable || attempt === retries) return last;
    await sleep(baseMs * 2 ** attempt);
  }
  return last ?? { ok: false, product_id: product.id, error: 'unknown', retryable: true };
}
