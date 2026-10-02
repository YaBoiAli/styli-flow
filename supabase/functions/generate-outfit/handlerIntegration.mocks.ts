/**
 * In-memory doubles for handler integration tests. No network.
 */
import {
  buildCriticPrompt,
  buildCriticUserPayload,
  buildRevisionPrompt,
  buildRevisionUserPayload,
} from '../_shared/fashionAI/criticContractPrompt.ts';
import type {
  FashionAIProvider,
  FashionCriticInput,
  FashionCriticResult,
  FashionRevisionInput,
  FashionRevisionResult,
} from '../_shared/fashionAI/types.ts';
import type { CatalogProduct } from './catalog.ts';
import type { GenerateOutfitHandlerDeps, LiveRetrieveInput } from './generateHandler.ts';
import { geminiPayload, outfitCandidateJson, usableVisual } from './handlerIntegration.fixtures.ts';
import type { LiveRetrieval } from './liveRetrieval.ts';
import type { GeminiHttpResult } from '../_shared/geminiResponse.ts';
import { isFootwearProduct } from './footwearPreference.ts';

export type GeminiCall = {
  system: string;
  user: Record<string, unknown>;
};

export type HandlerHarness = {
  deps: GenerateOutfitHandlerDeps;
  liveCalls: LiveRetrieveInput[];
  stored: { calls: number };
  visualIds: string[];
  shortlists: Array<{ visualAware?: boolean; productIds: string[] }>;
  geminiCalls: GeminiCall[];
  criticInputs: FashionCriticInput[];
  criticPrompts: string[];
  revisionInputs: FashionRevisionInput[];
  revisionPrompts: string[];
  env: Map<string, string>;
};

function criticResult(partial: Partial<FashionCriticResult> = {}): FashionCriticResult {
  return {
    overall_assessment: 'acceptable',
    style_match: 8,
    color_harmony: 8,
    proportion: 8,
    occasion_match: 8,
    cohesion: 8,
    strengths: ['Balanced'],
    issues: [],
    recommendations: [],
    ...partial,
  };
}

export function createHandlerHarness(options: {
  live: (input: LiveRetrieveInput) => LiveRetrieval | Promise<LiveRetrieval>;
  stored?: CatalogProduct[];
  storedError?: 'network' | 'catalog_empty' | 'brands_unavailable';
  geminiText?: string | ((call: GeminiCall) => string);
  geminiError?: 'throw' | 'http';
  visual?: 'attach' | 'fail' | 'none';
  visualAttachIds?: string[];
  critic?: FashionCriticResult | null | 'throw';
  revision?: FashionRevisionResult | null | 'throw';
  env?: Record<string, string>;
  heuristic?: boolean;
}): HandlerHarness {
  const liveCalls: LiveRetrieveInput[] = [];
  const visualIds: string[] = [];
  const shortlists: HandlerHarness['shortlists'] = [];
  const geminiCalls: GeminiCall[] = [];
  const criticInputs: FashionCriticInput[] = [];
  const criticPrompts: string[] = [];
  const revisionInputs: FashionRevisionInput[] = [];
  const revisionPrompts: string[] = [];
  const stored = { calls: 0 };

  const envMap = new Map<string, string>(
    Object.entries({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon-key',
      GEMINI_API_KEY: 'test-gemini-key',
      ...(options.heuristic ? { ALLOW_HEURISTIC_FALLBACK: 'true' } : {}),
      ...options.env,
    }).filter(([, value]) => value !== ''),
  );

  const provider: FashionAIProvider = {
    name: 'mock',
    generateOutfits: async () => {
      throw new Error('not_implemented');
    },
    critiqueOutfit: async (input) => {
      criticInputs.push(input);
      criticPrompts.push(buildCriticPrompt(input));
      if (options.critic === 'throw') throw new Error('critic_failed');
      if (options.critic === null) return null;
      return options.critic ?? criticResult();
    },
    reviseOutfit: async (input) => {
      revisionInputs.push(input);
      revisionPrompts.push(buildRevisionPrompt(input));
      if (options.revision === 'throw') throw new Error('revision_failed');
      return options.revision ?? null;
    },
  };

  const deps: GenerateOutfitHandlerDeps = {
    env: { get: (name) => envMap.get(name) },
    retrieveLive: async (input) => {
      liveCalls.push(input);
      return options.live(input);
    },
    loadStored: async () => {
      stored.calls += 1;
      if (options.storedError) {
        return {
          ok: false,
          code: options.storedError,
          unavailableBrands: [],
        };
      }
      return {
        ok: true,
        products: options.stored ?? [],
        catalogSource: 'live',
        unavailableBrands: [],
      };
    },
    enrichVisual: async (products, enrichOptions) => {
      if (options.visual === 'none') {
        return { products, attempted: 0, successful: 0, failed: 0 };
      }
      if (options.visual === 'fail') {
        for (const product of products) {
          enrichOptions?.onFailure?.({
            product_id: product.id,
            stage: 'gemini_request',
            error_type: 'MOCK_VISION_FAIL',
          });
        }
        return { products, attempted: products.length, successful: 0, failed: products.length };
      }
      const next = products.map((product) => {
        const skipShoes = enrichOptions?.footwearPreference === 'none' && isFootwearProduct(product);
        if (skipShoes) return product;
        if (options.visualAttachIds && !options.visualAttachIds.includes(product.id)) return product;
        visualIds.push(product.id);
        return {
          ...product,
          visual_attributes: product.visual_attributes ?? usableVisual(),
        };
      });
      return {
        products: next,
        attempted: visualIds.length,
        successful: visualIds.length,
        failed: 0,
      };
    },
    generateGeminiContent: async (request) => {
      const system =
        typeof (request.systemInstruction as { parts?: Array<{ text?: string }> })?.parts?.[0]?.text ===
        'string'
          ? (request.systemInstruction as { parts: Array<{ text: string }> }).parts[0].text
          : '';
      const rawUser = (request.contents as Array<{ parts?: Array<{ text?: string }> }>)?.[0]?.parts?.[0]
        ?.text;
      const user = rawUser ? (JSON.parse(rawUser) as Record<string, unknown>) : {};
      const call = { system, user };
      geminiCalls.push(call);
      if (options.geminiError === 'throw') {
        throw new Error('NETWORK');
      }
      if (options.geminiError === 'http') {
        return { ok: false, status: 503, error_type: 'HTTP_503', model: 'mock' } satisfies GeminiHttpResult;
      }
      const text =
        typeof options.geminiText === 'function'
          ? options.geminiText(call)
          : (options.geminiText ??
            outfitCandidateJson({
              top: 'top-1',
              bottom: 'bottom-1',
              shoes: user.footwear_preference === 'none' ? null : 'shoes-1',
            }));
      return { ok: true, payload: geminiPayload(text), status: 200, model: 'mock' };
    },
    createFashionAI: () => provider,
    onShortlist: (input) => {
      shortlists.push({
        visualAware: input.visualAware,
        productIds: input.products.map((product) => product.id),
      });
    },
  };

  return {
    deps,
    liveCalls,
    stored,
    visualIds,
    shortlists,
    geminiCalls,
    criticInputs,
    criticPrompts,
    revisionInputs,
    revisionPrompts,
    env: envMap,
  };
}

export function request(body: Record<string, unknown>): Request {
  return new Request('http://localhost/generate-outfit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      style: 'Streetwear',
      occasion: 'Everyday',
      budget: 200,
      gender: 'men',
      ...body,
    }),
  });
}
