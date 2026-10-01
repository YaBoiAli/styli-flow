/**
 * Shared Gemini REST helpers used by visual analysis, outfit generation, and critic.
 * Same generateContent protocol already used in generate-outfit — not a new API.
 */

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
export const FALLBACK_GEMINI_MODEL = 'gemini-3.5-flash';
export const GEMINI_GENERATE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models';

const RETRY_STATUSES = new Set([404, 429, 500, 503]);

export type GeminiTextExtract = {
  text: string;
  finishReason: string | null;
  blockReason: string | null;
  thoughtParts: number;
  textParts: number;
  candidateCount: number;
};

export type GeminiStage =
  | 'request'
  | 'response'
  | 'parse'
  | 'schema'
  | 'candidate_validation';

export class GeminiGenerationError extends Error {
  readonly stage: GeminiStage;
  readonly error_type: string;
  readonly status_code?: number;
  readonly candidate_count?: number;
  readonly finish_reason?: string;

  constructor(
    stage: GeminiStage,
    errorType: string,
    options: {
      message?: string;
      status_code?: number;
      candidate_count?: number;
      finish_reason?: string;
    } = {},
  ) {
    super(options.message ?? errorType);
    this.name = 'GeminiGenerationError';
    this.stage = stage;
    this.error_type = errorType;
    this.status_code = options.status_code;
    this.candidate_count = options.candidate_count;
    this.finish_reason = options.finish_reason;
  }
}

export function geminiModelsFromEnv(env: { get(name: string): string | undefined }): string[] {
  const primary = env.get('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;
  const fallback = env.get('GEMINI_FALLBACK_MODEL') || FALLBACK_GEMINI_MODEL;
  return [...new Set([primary, fallback])];
}

export function geminiJsonGenerationConfig(
  temperature: number,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    temperature,
    responseMimeType: 'application/json',
    thinkingConfig: { thinkingBudget: 0 },
    ...extra,
  };
}

export function httpErrorType(status: number): string {
  return `HTTP_${status}`;
}

export function normalizeImageMimeType(contentType: string, urlPath = ''): string | null {
  const raw = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (raw === 'image/jpg' || raw === 'image/pjpeg') return 'image/jpeg';
  if (raw.startsWith('image/') && raw.length > 'image/'.length) return raw;
  const path = urlPath.split('?')[0]?.toLowerCase() ?? '';
  if (raw === 'application/octet-stream' || raw === 'binary/octet-stream' || !raw) {
    if (path.endsWith('.png')) return 'image/png';
    if (path.endsWith('.webp')) return 'image/webp';
    if (path.endsWith('.gif')) return 'image/gif';
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  }
  return null;
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('```');
}

/**
 * Gemini 3 thinking models often put JSON in thought parts.
 * Prefer visible text; fall back to thought text when the visible part is empty.
 */
export function inspectGeminiPayload(payload: unknown): GeminiTextExtract {
  const root = payload as {
    promptFeedback?: { blockReason?: unknown };
    candidates?: Array<{
      finishReason?: unknown;
      content?: { parts?: Array<{ text?: unknown; thought?: unknown }> };
    }>;
  };
  const candidates = Array.isArray(root?.candidates) ? root.candidates : [];
  const parts = candidates[0]?.content?.parts ?? [];
  const finishReason =
    typeof candidates[0]?.finishReason === 'string' ? candidates[0].finishReason : null;
  const blockReason =
    typeof root?.promptFeedback?.blockReason === 'string'
      ? root.promptFeedback.blockReason
      : null;

  let thoughtParts = 0;
  let textParts = 0;
  const visible: string[] = [];
  const thoughts: string[] = [];
  for (const part of parts) {
    if (typeof part.text !== 'string') continue;
    if (part.thought) {
      thoughtParts += 1;
      thoughts.push(part.text);
      continue;
    }
    textParts += 1;
    visible.push(part.text);
  }

  const visibleText = visible.join('');
  const thoughtText = thoughts.join('');
  const text = visibleText.trim()
    ? visibleText
    : looksLikeJson(thoughtText)
      ? thoughtText
      : thoughtText.trim()
        ? thoughtText
        : '';

  return {
    text,
    finishReason,
    blockReason,
    thoughtParts,
    textParts,
    candidateCount: candidates.length,
  };
}

export function readGeminiText(payload: unknown): string {
  return inspectGeminiPayload(payload).text;
}

export type GeminiHttpResult =
  | { ok: true; payload: unknown; status: number; model: string }
  | { ok: false; status: number; error_type: string; model: string | null };

function withoutThinkingConfig(config: Record<string, unknown>): Record<string, unknown> {
  const next = { ...config };
  delete next.thinkingConfig;
  return next;
}

async function postGenerateContent(
  apiKey: string,
  model: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return await fetch(
    `${GEMINI_GENERATE_URL}/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
}

/**
 * POST generateContent across models. On HTTP 400, retry the same model
 * without thinkingConfig (older models reject the field).
 */
export async function generateGeminiContent(options: {
  apiKey: string;
  models: string[];
  systemInstruction?: unknown;
  contents: unknown;
  generationConfig: Record<string, unknown>;
}): Promise<GeminiHttpResult> {
  let lastStatus = 0;
  let lastModel: string | null = null;
  for (const model of options.models) {
    lastModel = model;
    const base: Record<string, unknown> = {
      contents: options.contents,
      generationConfig: options.generationConfig,
    };
    if (options.systemInstruction) base.systemInstruction = options.systemInstruction;

    let response = await postGenerateContent(options.apiKey, model, base);
    if (response.status === 400 && options.generationConfig.thinkingConfig) {
      await response.body?.cancel();
      response = await postGenerateContent(options.apiKey, model, {
        ...base,
        generationConfig: withoutThinkingConfig(options.generationConfig),
      });
    }
    lastStatus = response.status;
    if (RETRY_STATUSES.has(response.status)) {
      await response.body?.cancel();
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      return {
        ok: false,
        status: response.status,
        error_type: httpErrorType(response.status),
        model,
      };
    }
    return { ok: true, payload: await response.json(), status: response.status, model };
  }
  return {
    ok: false,
    status: lastStatus || 503,
    error_type: httpErrorType(lastStatus || 503),
    model: lastModel,
  };
}
