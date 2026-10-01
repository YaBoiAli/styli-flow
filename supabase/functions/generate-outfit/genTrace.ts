/**
 * Request-scoped generation tracing. Logs are concise and never include
 * API keys, prompts, measurements, skin tone, or image URLs.
 */

export type Channel3Reason =
  | 'no_api_key'
  | 'request_timeout'
  | 'request_error'
  | 'empty_results'
  | 'normalization_failed'
  | 'insufficient_categories'
  | 'partial_results'
  | 'successful'
  | 'unknown_error';

const TRACE_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function createGenerationTraceId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => TRACE_ALPHABET[byte % TRACE_ALPHABET.length]).join('');
}

export function formatGenFields(fields: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      parts.push(`${key}=${value.join(',')}`);
      continue;
    }
    if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
      parts.push(`${key}=${value}`);
      continue;
    }
    if (value === null) {
      parts.push(`${key}=null`);
      continue;
    }
    parts.push(`${key}=${JSON.stringify(value)}`);
  }
  return parts.join(' ');
}

export function genLog(tag: string, id: string, fields: Record<string, unknown> = {}): void {
  const extra = formatGenFields(fields);
  console.log(extra ? `[${tag}] id=${id} ${extra}` : `[${tag}] id=${id}`);
}

export type GeminiPoolRow = {
  product_id: string;
  category: string;
  brand: string;
  price: number;
  relevance_score: number;
  style_score: number;
  occasion_score: number;
  visual_confidence: number | null;
  shortlist_rank: number;
};

export function logGeminiPool(id: string, category: string, rows: GeminiPoolRow[]): void {
  genLog('GEN_GEMINI_POOL', id, { category, count: rows.length });
  for (const row of rows) {
    console.log(
      `[GEN_GEMINI_POOL] id=${id} category=${category} ${row.shortlist_rank}. ` +
        formatGenFields({
          product_id: row.product_id,
          brand: row.brand,
          price: row.price,
          relevance: row.relevance_score,
          style: row.style_score,
          occasion: row.occasion_score,
          visual_confidence: row.visual_confidence ?? 'none',
        }),
    );
  }
}

export type ScoredCandidateTrace = {
  index: number;
  valid: boolean;
  score?: number;
};

export function logCandidateScores(
  id: string,
  candidates: ScoredCandidateTrace[],
  winnerIndex: number | null,
): void {
  const validScores = candidates
    .filter((candidate) => candidate.valid && typeof candidate.score === 'number')
    .map((candidate) => candidate.score as number);
  genLog('GEN_SCORE', id, {
    scores: validScores,
    winner: winnerIndex == null ? 'none' : validScores.length ? candidates.find((row) => row.index === winnerIndex)?.score ?? 'none' : 'none',
  });
  for (const candidate of candidates) {
    if (!candidate.valid || candidate.score == null) continue;
    genLog('GEN_SCORE', id, { candidate: candidate.index, score: candidate.score });
  }
  if (winnerIndex != null) genLog('GEN_SCORE', id, { winner: winnerIndex });
}

export type GenerationMode = 'gemini' | 'heuristic_fallback';

export function generationModeForResponse(usedHeuristicFallback: boolean): GenerationMode {
  return usedHeuristicFallback ? 'heuristic_fallback' : 'gemini';
}

export function fallbackReasonForGemini(input: {
  geminiOutfits: { length: number } | null;
  requestFailed: boolean;
}): 'gemini_request_failed' | 'gemini_no_candidates' | 'gemini_no_valid_candidates' {
  if (input.requestFailed && (input.geminiOutfits == null || input.geminiOutfits.length === 0)) {
    return 'gemini_request_failed';
  }
  if (input.geminiOutfits == null || input.geminiOutfits.length === 0) {
    return 'gemini_no_candidates';
  }
  return 'gemini_no_valid_candidates';
}

export type FinalItemTrace = {
  category: string;
  product_id: string;
  brand: string;
  price: number;
};

export function logFinalOutfit(
  id: string,
  fields: {
    source: string;
    items: number;
    score: number;
    revision_attempted: boolean;
    revision_accepted: boolean;
    generation_mode: GenerationMode;
  },
  products: FinalItemTrace[],
): void {
  genLog('GEN_FINAL', id, fields);
  for (const product of products) {
    genLog('GEN_FINAL', id, {
      category: product.category,
      product_id: product.product_id,
      brand: product.brand,
      price: product.price,
    });
  }
}

export type MetadataPreservationStats = {
  incoming_style_tags: number;
  preserved_style_tags: number;
  incoming_colors: number;
  preserved_colors: number;
  incoming_sizes: number;
  preserved_sizes: number;
};

export function emptyMetadataStats(): MetadataPreservationStats {
  return {
    incoming_style_tags: 0,
    preserved_style_tags: 0,
    incoming_colors: 0,
    preserved_colors: 0,
    incoming_sizes: 0,
    preserved_sizes: 0,
  };
}

export function logMetadataPreservation(id: string, stats: MetadataPreservationStats): void {
  console.log(
    `[GEN_CHANNEL3] id=${id} metadata: ` +
      formatGenFields({
        incoming_style_tags: stats.incoming_style_tags,
        preserved_style_tags: stats.preserved_style_tags,
        incoming_colors: stats.incoming_colors,
        preserved_colors: stats.preserved_colors,
        incoming_sizes: stats.incoming_sizes,
        preserved_sizes: stats.preserved_sizes,
      }),
  );
}

export function mapLegacyChannel3Reason(reason: string | null | undefined): Channel3Reason {
  switch (reason) {
    case 'missing_api_key':
    case 'no_api_key':
      return 'no_api_key';
    case 'timeout':
    case 'request_timeout':
      return 'request_timeout';
    case 'error':
    case 'request_error':
      return 'request_error';
    case 'empty':
    case 'empty_results':
      return 'empty_results';
    case 'normalization_failed':
      return 'normalization_failed';
    case 'insufficient_categories':
      return 'insufficient_categories';
    case 'partial_results':
      return 'partial_results';
    case 'successful':
      return 'successful';
    default:
      return 'unknown_error';
  }
}
