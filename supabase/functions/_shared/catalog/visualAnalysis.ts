/**
 * Gemini visual analysis for a shortlist of already-ranked catalog products.
 * Fail-safe: missing images, missing keys, and malformed JSON never break generation.
 * Live Channel3 products are analyzed in memory only — no Supabase writes.
 */
import {
  applyVisualRecords,
  hasUsableImageUrl,
  interpretVisualGeminiPayload,
  logVisualEnrichment,
  MAX_VISUAL_ANALYSIS_PRODUCTS,
  selectVisualAnalysisTargets,
  VISUAL_ANALYSIS_BATCH_SIZE,
  visualCacheKey,
  visualSchemaPrompt,
  type VisualAnalysisRecord,
  type VisualTarget,
} from './visualAttributes.ts';
import {
  generateGeminiContent,
  geminiJsonGenerationConfig,
  geminiModelsFromEnv,
  httpErrorType,
  normalizeImageMimeType,
} from '../geminiResponse.ts';
import { logPerf, perfNow } from '../perfLog.ts';

const IMAGE_TIMEOUT_MS = 8_000;
const IMAGE_MAX_BYTES = 4_000_000;

export type VisualFailureStage =
  | 'image_fetch'
  | 'encoding'
  | 'gemini_request'
  | 'gemini_response'
  | 'json_parse'
  | 'schema_parse';

export type VisualFailure = {
  product_id: string;
  stage: VisualFailureStage;
  error_type: string;
  status_code?: number;
  message?: string;
};

export type VisualFailureHandler = (failure: VisualFailure) => void;

type ImageFetchOk = { ok: true; mimeType: string; data: string };
type ImageFetchFail = {
  ok: false;
  stage: 'image_fetch' | 'encoding';
  error_type: string;
  status_code?: number;
  message?: string;
};

async function fetchProductImage(imageUrl: string): Promise<ImageFetchOk | ImageFetchFail> {
  if (!hasUsableImageUrl(imageUrl)) {
    return { ok: false, stage: 'image_fetch', error_type: 'INVALID_URL' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    const response = await fetch(imageUrl, {
      signal: controller.signal,
      headers: { Accept: 'image/*' },
    });
    if (!response.ok) {
      return {
        ok: false,
        stage: 'image_fetch',
        error_type: httpErrorType(response.status),
        status_code: response.status,
      };
    }
    const header = response.headers.get('content-type') ?? '';
    const mimeType = normalizeImageMimeType(header, imageUrl);
    if (!mimeType) {
      return {
        ok: false,
        stage: 'image_fetch',
        error_type: 'INVALID_MIME',
        message: header.split(';')[0]?.trim().slice(0, 32) || 'missing',
      };
    }
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (!buffer.byteLength) {
      return { ok: false, stage: 'image_fetch', error_type: 'EMPTY_BODY' };
    }
    if (buffer.byteLength > IMAGE_MAX_BYTES) {
      return { ok: false, stage: 'image_fetch', error_type: 'TOO_LARGE' };
    }
    try {
      let binary = '';
      for (const byte of buffer) binary += String.fromCharCode(byte);
      return { ok: true, mimeType, data: btoa(binary) };
    } catch (err) {
      return {
        ok: false,
        stage: 'encoding',
        error_type: 'ENCODE_FAILED',
        message: err instanceof Error ? err.name : 'encode_error',
      };
    }
  } catch (err) {
    const name = err instanceof Error ? err.name : 'Error';
    return {
      ok: false,
      stage: 'image_fetch',
      error_type: name === 'AbortError' ? 'TIMEOUT' : 'NETWORK',
      message: name,
    };
  } finally {
    clearTimeout(timer);
  }
}

type Analyzable = VisualTarget & {
  subcategory?: string | null;
  style_tags?: string[];
};

function metadataForProduct(product: Analyzable): Record<string, unknown> {
  return {
    product_id: product.id,
    name: product.name,
    brand: product.brand,
    category: product.category,
    ...(product.subcategory ? { subcategory: product.subcategory } : {}),
    color: product.color ?? null,
    colors: product.colors ?? [],
    ...(product.material ? { material: product.material } : {}),
    ...(product.fit ? { catalog_fit: product.fit } : {}),
    ...(product.silhouette ? { catalog_silhouette: product.silhouette } : {}),
    ...(product.pattern ? { catalog_pattern: product.pattern } : {}),
    ...(product.formality ? { catalog_formality: product.formality } : {}),
    ...(product.style_tags?.length ? { style_tags: product.style_tags } : {}),
  };
}

function emitFailures(
  onFailure: VisualFailureHandler | undefined,
  productIds: string[],
  failure: Omit<VisualFailure, 'product_id'>,
): void {
  if (!onFailure) return;
  for (const product_id of productIds) {
    onFailure({ ...failure, product_id });
  }
}

async function classifyBatchWithGemini(
  batch: Array<{ product: Analyzable; image: { mimeType: string; data: string } }>,
  onFailure?: VisualFailureHandler,
): Promise<VisualAnalysisRecord[]> {
  const ids = batch.map(({ product }) => product.id);
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey || !batch.length) {
    emitFailures(onFailure, ids, {
      stage: 'gemini_request',
      error_type: apiKey ? 'EMPTY_BATCH' : 'MISSING_API_KEY',
    });
    return [];
  }

  const system = `You analyze fashion product photos for Styli.
You do not pick outfits. You do not invent products.
Assign structured visual attributes from the image, using metadata only as a hint.
If the image is unclear, use null. Do not overwrite obvious catalog facts with guesses.
Do not claim exact dye formulas; hex is a rough approximation or null.
${visualSchemaPrompt()}`;

  const parts: Array<Record<string, unknown>> = [
    {
      text: JSON.stringify({
        products: batch.map(({ product }) => metadataForProduct(product)),
      }),
    },
  ];
  for (const { product, image } of batch) {
    parts.push({ text: `Image for product_id=${product.id} (${product.category})` });
    parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  }

  let http;
  try {
    http = await generateGeminiContent({
      apiKey,
      models: geminiModelsFromEnv(Deno.env),
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: geminiJsonGenerationConfig(0.1),
    });
  } catch (err) {
    emitFailures(onFailure, ids, {
      stage: 'gemini_request',
      error_type: 'NETWORK',
      message: err instanceof Error ? err.name : 'request_error',
    });
    return [];
  }

  if (!http.ok) {
    emitFailures(onFailure, ids, {
      stage: 'gemini_request',
      error_type: http.error_type,
      status_code: http.status,
    });
    return [];
  }

  const allowed = new Set(ids);
  const interpreted = interpretVisualGeminiPayload(http.payload, allowed);
  if (!interpreted.ok) {
    emitFailures(onFailure, ids, {
      stage: interpreted.stage,
      error_type: interpreted.error_type,
      message: interpreted.message,
    });
    return [];
  }

  const byId = new Set(interpreted.records.map((record) => record.product_id));
  const missing = ids.filter((id) => !byId.has(id));
  emitFailures(onFailure, missing, {
    stage: 'schema_parse',
    error_type: 'missing_product_record',
  });
  return interpreted.records;
}

export type VisualEnrichmentOptions = {
  footwearPreference?: 'include' | 'none';
  max?: number;
  onFailure?: VisualFailureHandler;
};

export type VisualEnrichmentResult<T> = {
  products: T[];
  attempted: number;
  successful: number;
  failed: number;
};

function visualStats<T>(
  products: T[],
  attempted: number,
  successful: number,
): VisualEnrichmentResult<T> {
  return {
    products,
    attempted,
    successful,
    failed: Math.max(0, attempted - successful),
  };
}

/**
 * Analyze a ranked shortlist and attach visual_attributes in memory.
 * Failures keep the product and existing catalog metadata. Never throws. Never writes to Supabase.
 */
export async function enrichProductsWithVisualAttributes<T extends Analyzable>(
  products: T[],
  options: VisualEnrichmentOptions = {},
): Promise<VisualEnrichmentResult<T>> {
  const attemptedIds = new Set<string>();
  const successfulIds = new Set<string>();
  let loggedDownload = false;
  let loggedAnalysis = false;
  const onFailure = options.onFailure;
  try {
    if (!Deno.env.get('GEMINI_API_KEY')) {
      logPerf('visual_image_download', 'SKIPPED');
      logPerf('visual_analysis', 'SKIPPED');
      logVisualEnrichment({ attempted: 0, successful: 0, failed: 0 });
      return visualStats(products, 0, 0);
    }

    const targets = selectVisualAnalysisTargets(products, {
      footwearPreference: options.footwearPreference,
      max: options.max ?? MAX_VISUAL_ANALYSIS_PRODUCTS,
    });
    if (!targets.length) {
      logPerf('visual_image_download', 'SKIPPED');
      logPerf('visual_analysis', 'SKIPPED');
      logVisualEnrichment({ attempted: 0, successful: 0, failed: 0 });
      return visualStats(products, 0, 0);
    }

    const cache = new Map<string, VisualAnalysisRecord>();
    const records: VisualAnalysisRecord[] = [];
    const ready: Array<{ product: T; image: { mimeType: string; data: string } }> = [];

    const downloadStarted = perfNow();
    for (const product of targets) {
      attemptedIds.add(product.id);
      const key = visualCacheKey(product);
      const cached = cache.get(key);
      if (cached) {
        records.push({ ...cached, product_id: product.id });
        successfulIds.add(product.id);
        continue;
      }
      if (!product.image_url) {
        onFailure?.({
          product_id: product.id,
          stage: 'image_fetch',
          error_type: 'MISSING_URL',
        });
        continue;
      }
      const image = await fetchProductImage(product.image_url);
      if (!image.ok) {
        onFailure?.({
          product_id: product.id,
          stage: image.stage,
          error_type: image.error_type,
          status_code: image.status_code,
          message: image.message,
        });
        continue;
      }
      ready.push({ product, image });
    }
    logPerf('visual_image_download', perfNow() - downloadStarted);
    loggedDownload = true;

    if (!ready.length) {
      logPerf('visual_analysis', 'SKIPPED');
      loggedAnalysis = true;
      logVisualEnrichment({
        attempted: attemptedIds.size,
        successful: successfulIds.size,
        failed: Math.max(0, attemptedIds.size - successfulIds.size),
      });
      return visualStats(applyVisualRecords(products, records), attemptedIds.size, successfulIds.size);
    }

    const analysisStarted = perfNow();
    for (let i = 0; i < ready.length; i += VISUAL_ANALYSIS_BATCH_SIZE) {
      const batch = ready.slice(i, i + VISUAL_ANALYSIS_BATCH_SIZE);
      let batchRecords: VisualAnalysisRecord[] = [];
      try {
        batchRecords = await classifyBatchWithGemini(batch, onFailure);
      } catch (err) {
        emitFailures(onFailure, batch.map(({ product }) => product.id), {
          stage: 'gemini_request',
          error_type: 'UNHANDLED',
          message: err instanceof Error ? err.name : 'error',
        });
        batchRecords = [];
      }
      const byId = new Map(batchRecords.map((record) => [record.product_id, record]));
      for (const { product } of batch) {
        const record = byId.get(product.id);
        if (!record) continue;
        successfulIds.add(product.id);
        records.push(record);
        cache.set(visualCacheKey(product), record);
      }
    }
    logPerf('visual_analysis', perfNow() - analysisStarted);
    loggedAnalysis = true;

    logVisualEnrichment({
      attempted: attemptedIds.size,
      successful: successfulIds.size,
      failed: Math.max(0, attemptedIds.size - successfulIds.size),
    });
    return visualStats(applyVisualRecords(products, records), attemptedIds.size, successfulIds.size);
  } catch {
    if (!loggedDownload) logPerf('visual_image_download', 'SKIPPED');
    if (!loggedAnalysis) logPerf('visual_analysis', 'SKIPPED');
    logVisualEnrichment({
      attempted: attemptedIds.size,
      successful: successfulIds.size,
      failed: Math.max(0, attemptedIds.size - successfulIds.size),
    });
    return visualStats(products, attemptedIds.size, successfulIds.size);
  }
}
