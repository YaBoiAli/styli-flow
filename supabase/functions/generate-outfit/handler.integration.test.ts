/**
 * Phase 6A: handler-level integration tests for the real generate-outfit handler.
 * Mocks Channel3 / Gemini / vision / critic / revision. No network.
 * Run: npx tsx supabase/functions/generate-outfit/handler.integration.test.ts
 */
import { OCCASION_CONTRACT, STYLE_CONTRACT } from '../_shared/catalog/styleOccasionContract.ts';
import { scoreOutfit } from '../_shared/catalog/outfitScoring.ts';
import { nextRebuildSnapshot, snapshotOutfitForRebuild } from '../../../lib/rebuildExclusion.ts';
import { collectExcludeIds } from './outfitDiversity.ts';
import { isFootwearProduct } from './footwearPreference.ts';
import { handler } from './generateHandler.ts';
import {
  catalogProduct,
  coreCatalog,
  expensiveVisualTops,
  liveRetrievalOf,
  outfitCandidateJson,
} from './handlerIntegration.fixtures.ts';
import { createHandlerHarness, request } from './handlerIntegration.mocks.ts';
import { liveRetrievalFromError } from './liveRetrieval.ts';

declare const process: { exit(code?: number): void };

let failed = 0;
let passed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL: ${message}`);
}

async function invoke(
  harness: ReturnType<typeof createHandlerHarness>,
  body: Record<string, unknown> = {},
) {
  const response = await handler(request(body), harness.deps);
  const json = (await response.json()) as Record<string, unknown>;
  return { response, json };
}

function itemIds(json: Record<string, unknown>): string[] {
  const items = Array.isArray(json.items) ? json.items : [];
  return items.map((item) => String((item as { product_id?: string }).product_id ?? ''));
}

function itemCategories(json: Record<string, unknown>): string[] {
  const items = Array.isArray(json.items) ? json.items : [];
  return items.map((item) => {
    const product = (item as { product?: { category?: string } }).product;
    return product?.category ?? '';
  });
}

async function main() {
  const catalog = coreCatalog();

  // --- Normal generation ---
  const normal = createHandlerHarness({
    live: () => liveRetrievalOf(catalog),
    geminiText: outfitCandidateJson({ top: 'top-1', bottom: 'bottom-1', shoes: 'shoes-1' }),
  });
  const normalRun = await invoke(normal);
  assert(normalRun.response.status === 200, 'normal: HTTP 200');
  assert(normalRun.json.catalog_source === 'channel3_live', 'normal: catalog_source is channel3_live');
  assert(normalRun.json.generation_mode === 'gemini', 'normal: generation_mode is gemini');
  assert(typeof normalRun.json.fashion_score === 'number', 'normal: fashion_score present');
  assert(Boolean(normalRun.json.fashion_breakdown), 'normal: fashion_breakdown present');
  assert(itemIds(normalRun.json).includes('top-1'), 'normal: selected top-1');
  assert(itemIds(normalRun.json).includes('bottom-1'), 'normal: selected bottom-1');
  assert(itemIds(normalRun.json).includes('shoes-1'), 'normal: selected shoes-1');
  assert(normal.liveCalls.length === 1, 'normal: Channel3 retrieveLive invoked once');
  assert(normal.shortlists.some((row) => row.visualAware === true), 'normal: shortlistForGemini visualAware=true');
  assert(normal.geminiCalls.length >= 1, 'normal: Gemini generation invoked');
  assert(normal.geminiCalls[0].user.footwear_preference === 'include', 'normal: Gemini sees include shoes');
  assert(
    JSON.stringify(normal.geminiCalls[0].user.exclude_product_ids) === '[]',
    'normal: first generation has empty exclude ids',
  );
  assert(normal.criticInputs.length >= 1, 'normal: critic ran');

  // --- No Shoes ---
  const noShoesCatalog = catalog.filter((product) => product.category !== 'shoes');
  const noShoes = createHandlerHarness({
    live: () => liveRetrievalOf(noShoesCatalog),
    stored: catalog,
    geminiText: outfitCandidateJson({ top: 'top-1', bottom: 'bottom-1', shoes: null }),
  });
  const noShoesRun = await invoke(noShoes, {
    footwear_preference: 'none',
    shoe_budget: 80,
  });
  assert(noShoesRun.response.status === 200, 'no-shoes: HTTP 200');
  assert(
    noShoes.liveCalls[0].categories.join(',') === 'top,bottom',
    'no-shoes: Channel3 is not asked for shoes',
  );
  assert(
    noShoes.visualIds.every((id) => !id.startsWith('shoes-')),
    'no-shoes: visual enrichment does not process shoes',
  );
  assert(noShoes.geminiCalls[0].user.footwear_preference === 'none', 'no-shoes: Gemini requireShoes=false');
  assert(noShoes.geminiCalls[0].user.shoe_budget === null, 'no-shoes: shoe_budget is not applied');
  assert(noShoesRun.json.shoe_budget === null, 'no-shoes: response shoe_budget is null');
  assert(
    itemCategories(noShoesRun.json).every((category) => category !== 'shoes'),
    'no-shoes: response contains zero footwear categories',
  );
  assert(
    !itemIds(noShoesRun.json).some((id) => id.startsWith('shoes-')),
    'no-shoes: response contains zero shoe IDs',
  );
  assert(
    noShoes.revisionInputs.every((input) =>
      input.catalog.every((product) => !isFootwearProduct(product)),
    ) || noShoes.revisionInputs.length === 0,
    'no-shoes: revision catalog has no footwear when revision runs',
  );
  assert(
    noShoes.criticPrompts[0]?.includes('Footwear was intentionally excluded'),
    'no-shoes: critic prompt forbids footwear',
  );

  const badShoesFallback = createHandlerHarness({
    live: () => liveRetrievalOf(noShoesCatalog),
    geminiText: outfitCandidateJson({ top: 'top-1', bottom: 'bottom-1', shoes: 'shoes-1' }),
  });
  const badShoesFallbackRun = await invoke(badShoesFallback, { footwear_preference: 'none' });
  assert(badShoesFallbackRun.response.status === 200, 'no-shoes: invalid shoe candidate falls back rather than shipping shoes');
  assert(
    itemCategories(badShoesFallbackRun.json).every((category) => category !== 'shoes'),
    'no-shoes: fallback/final outfit still contains zero footwear',
  );

  const badShoes = createHandlerHarness({
    live: () => liveRetrievalOf(noShoesCatalog),
    geminiText: outfitCandidateJson({ top: 'top-1', bottom: 'bottom-1', shoes: 'shoes-1' }),
    env: { EDGE_FUNCTION_PORT: 'disabled' },
  });
  const badShoesRun = await invoke(badShoes, { footwear_preference: 'none' });
  assert(badShoesRun.response.status === 422, 'no-shoes: malicious shoes_id is rejected when heuristic is off');
  assert(badShoesRun.json.code === 'invalid_ai', 'no-shoes: malicious shoes_id is rejected as invalid_ai');

  // --- Rebuild / exclude IDs ---
  const rebuildCatalog = [
    ...catalog,
    catalogProduct('top-3', 'top', { name: 'Fresh Graphic Tee', style_tags: ['streetwear'] }),
    catalogProduct('bottom-3', 'bottom', { name: 'Fresh Cargo Pants', style_tags: ['streetwear', 'cargo'] }),
    catalogProduct('shoes-3', 'shoes', { name: 'Fresh Sneakers', style_tags: ['streetwear'] }),
  ];
  const excluded = ['top-1', 'bottom-1', 'shoes-1'];
  const rebuild = createHandlerHarness({
    live: () => liveRetrievalOf(rebuildCatalog),
    geminiText: (call) => {
      const candidates = call.user.candidates as Array<{ id: string }>;
      const ids = new Set(candidates.map((row) => row.id));
      assert(!excluded.some((id) => ids.has(id)), 'rebuild: Gemini catalog excludes previous IDs');
      return outfitCandidateJson({ top: 'top-3', bottom: 'bottom-3', shoes: 'shoes-3' });
    },
  });
  const expectedExclude = collectExcludeIds(excluded, [
    { product_id: 'top-1' },
    { product_id: 'bottom-1' },
    { product_id: 'shoes-1' },
  ]);
  assert(expectedExclude.size === 3, 'rebuild: collectExcludeIds unions previous IDs');
  const rebuildRun = await invoke(rebuild, {
    exclude_product_ids: excluded,
    previous_outfit: excluded.map((id) => ({ product_id: id })),
    previous_outfit_product_ids: excluded,
  });
  assert(rebuildRun.response.status === 200, 'rebuild: HTTP 200');
  assert(
    JSON.stringify([...(rebuild.geminiCalls[0].user.exclude_product_ids as string[])].sort()) ===
      JSON.stringify([...excluded].sort()),
    'rebuild: exclude ids reach Gemini',
  );
  assert(
    excluded.every((id) => !itemIds(rebuildRun.json).includes(id)),
    'rebuild: final response contains none of the excluded IDs',
  );
  assert(
    rebuild.revisionInputs.every((input) =>
      input.catalog.every((product) => !excluded.includes(product.product_id)),
    ),
    'rebuild: revision catalog cannot reintroduce excluded IDs',
  );

  const heuristicRebuild = createHandlerHarness({
    live: () => liveRetrievalOf(rebuildCatalog),
    heuristic: true,
    env: { GEMINI_API_KEY: '' },
  });
  const heuristicRun = await invoke(heuristicRebuild, {
    exclude_product_ids: excluded,
    previous_outfit: excluded.map((id) => ({ product_id: id })),
  });
  assert(heuristicRun.response.status === 200, 'rebuild heuristic: HTTP 200');
  assert(heuristicRun.json.generation_mode === 'heuristic_fallback', 'rebuild heuristic: uses fallback');
  assert(
    excluded.every((id) => !itemIds(heuristicRun.json).includes(id)),
    'rebuild heuristic: cannot reintroduce excluded IDs',
  );

  const lastSuccess = snapshotOutfitForRebuild({
    id: 'look-1',
    name: 'Look',
    style: 'Streetwear',
    occasion: 'Everyday',
    products: [
      { id: 'top-1', name: 'Tee', price: 40, imageUrl: 'https://cdn.example.com/t.jpg', category: 'top' },
      { id: 'bottom-1', name: 'Pants', price: 40, imageUrl: 'https://cdn.example.com/b.jpg', category: 'bottom' },
      { id: 'shoes-1', name: 'Sneakers', price: 40, imageUrl: 'https://cdn.example.com/s.jpg', category: 'footwear' },
    ],
    total: 120,
    explanation: 'Tip',
  });
  const retained = nextRebuildSnapshot(lastSuccess, null);
  assert(
    retained.map((item) => item.productId).join(',') === 'top-1,bottom-1,shoes-1',
    'rebuild snapshot: failed generation does not wipe last successful IDs',
  );

  // --- Hybrid catalog ---
  const livePartial = catalog.filter((product) => product.category !== 'shoes');
  const storedShoes = [
    catalogProduct('shoes-stored', 'shoes', { name: 'Stored Sneakers', style_tags: ['streetwear'] }),
    catalogProduct('top-1', 'top', { name: 'Stored Should Lose', style_tags: ['streetwear'], brand: 'Stored' }),
  ];
  const hybrid = createHandlerHarness({
    live: () => liveRetrievalOf(livePartial),
    stored: storedShoes,
    geminiText: outfitCandidateJson({ top: 'top-1', bottom: 'bottom-1', shoes: 'shoes-stored' }),
  });
  const hybridRun = await invoke(hybrid);
  assert(hybridRun.response.status === 200, 'hybrid: HTTP 200');
  assert(hybridRun.json.catalog_source === 'hybrid', 'hybrid: catalog_source is hybrid');
  assert(hybrid.stored.calls >= 1, 'hybrid: stored catalog was loaded');
  assert(itemIds(hybridRun.json).includes('shoes-stored'), 'hybrid: stored fills missing shoes');
  const hybridTop = (hybrid.geminiCalls[0].user.candidates as Array<{ id: string; brand?: string }>).find(
    (row) => row.id === 'top-1',
  );
  assert(hybridTop?.brand === 'Acme', 'hybrid: live product wins on ID collision');

  // --- Malformed Gemini ---
  const rejectEnv = { EDGE_FUNCTION_PORT: 'disabled' };
  const invalidId = createHandlerHarness({
    live: () => liveRetrievalOf(catalog),
    geminiText: outfitCandidateJson({ top: 'unknown-top', bottom: 'bottom-1', shoes: 'shoes-1' }),
    env: rejectEnv,
  });
  const invalidIdRun = await invoke(invalidId);
  assert(invalidIdRun.response.status === 422, 'malformed: unknown ID rejected');
  assert(invalidIdRun.json.code === 'invalid_ai', 'malformed: unknown ID is invalid_ai');

  const missingSlot = createHandlerHarness({
    live: () => liveRetrievalOf(catalog),
    geminiText: JSON.stringify({
      outfit_name: 'Broken',
      styling_tip: 'Tip',
      candidates: [{ top_id: 'top-1', bottom_id: null, shoes_id: 'shoes-1' }],
    }),
    env: rejectEnv,
  });
  const missingSlotRun = await invoke(missingSlot);
  assert(missingSlotRun.response.status === 422, 'malformed: missing category rejected');

  const duplicate = createHandlerHarness({
    live: () => liveRetrievalOf(catalog),
    geminiText: JSON.stringify({
      outfit_name: 'Dupes',
      styling_tip: 'Tip',
      items: [{ product_id: 'top-1' }, { product_id: 'top-2' }, { product_id: 'shoes-1' }],
    }),
    env: rejectEnv,
  });
  const duplicateRun = await invoke(duplicate);
  assert(duplicateRun.response.status === 422, 'malformed: duplicate category rejected');

  const malformedJson = createHandlerHarness({
    live: () => liveRetrievalOf(catalog),
    geminiText: '{not-json',
    env: rejectEnv,
  });
  const malformedJsonRun = await invoke(malformedJson);
  assert(malformedJsonRun.response.status === 422, 'malformed: invalid JSON rejected');

  const excludedIdGemini = createHandlerHarness({
    live: () => liveRetrievalOf(rebuildCatalog),
    geminiText: outfitCandidateJson({ top: 'top-1', bottom: 'bottom-3', shoes: 'shoes-3' }),
    env: rejectEnv,
  });
  const excludedIdRun = await invoke(excludedIdGemini, {
    exclude_product_ids: ['top-1'],
    previous_outfit: [{ product_id: 'top-1' }],
  });
  assert(excludedIdRun.response.status === 422, 'malformed: excluded product ID rejected');

  // --- Revision +2 ---
  const weakOriginal = [
    catalogProduct('top-1', 'top', { name: 'Plain Tee', style_tags: [] }),
    catalogProduct('bottom-weak', 'bottom', { name: 'Plain Pants', style_tags: [] }),
    catalogProduct('bottom-strong', 'bottom', {
      name: 'Streetwear Cargo Pants',
      style_tags: ['streetwear', 'cargo'],
      subcategory: 'cargo',
    }),
    catalogProduct('shoes-1', 'shoes', { name: 'Sneakers', style_tags: ['sneaker'] }),
  ];
  const originalScore = scoreOutfit(
    [weakOriginal[0], weakOriginal[1], weakOriginal[3]],
    { style: 'Streetwear', occasion: 'Everyday' },
  );
  const revisedScore = scoreOutfit(
    [weakOriginal[0], weakOriginal[2], weakOriginal[3]],
    { style: 'Streetwear', occasion: 'Everyday' },
  );
  assert(revisedScore.score >= originalScore.score + 2, 'revision fixtures: +2 is actually achievable');

  const revisionAccept = createHandlerHarness({
    live: () => liveRetrievalOf(weakOriginal),
    visual: 'none',
    geminiText: outfitCandidateJson({ top: 'top-1', bottom: 'bottom-weak', shoes: 'shoes-1' }),
    critic: {
      overall_assessment: 'weak',
      style_match: 3,
      color_harmony: 8,
      proportion: 8,
      occasion_match: 8,
      cohesion: 6,
      strengths: [],
      issues: [{ type: 'style', severity: 'major', product_id: 'bottom-weak' }],
      recommendations: ['Swap the bottom'],
    },
    revision: {
      items: [
        { product_id: 'top-1' },
        { product_id: 'bottom-strong' },
        { product_id: 'shoes-1' },
      ],
    },
  });
  const accepted = await invoke(revisionAccept);
  assert(accepted.response.status === 200, 'revision +2: HTTP 200');
  assert(accepted.json.fashion_revision_attempted === true, 'revision +2: attempted');
  assert(accepted.json.fashion_revision_accepted === true, 'revision +2: accepted');
  assert(itemIds(accepted.json).includes('bottom-strong'), 'revision +2: finalSelected is the revised outfit');
  assert(!itemIds(accepted.json).includes('bottom-weak'), 'revision +2: weak original bottom is gone');

  const revisionReject = createHandlerHarness({
    live: () => liveRetrievalOf(weakOriginal),
    visual: 'none',
    geminiText: outfitCandidateJson({ top: 'top-1', bottom: 'bottom-weak', shoes: 'shoes-1' }),
    critic: {
      overall_assessment: 'weak',
      style_match: 3,
      color_harmony: 8,
      proportion: 8,
      occasion_match: 8,
      cohesion: 6,
      strengths: [],
      issues: [{ type: 'style', severity: 'major', product_id: 'bottom-weak' }],
      recommendations: ['Swap the bottom'],
    },
    revision: {
      items: [
        { product_id: 'top-1' },
        { product_id: 'bottom-weak' },
        { product_id: 'shoes-1' },
      ],
    },
  });
  const rejected = await invoke(revisionReject);
  assert(rejected.response.status === 200, 'revision < +2: HTTP 200');
  assert(rejected.json.fashion_revision_attempted === true, 'revision < +2: attempted');
  assert(rejected.json.fashion_revision_accepted === false, 'revision < +2: rejected');
  assert(itemIds(rejected.json).includes('bottom-weak'), 'revision < +2: original outfit remains');

  const rebuildRevisionCatalog = [
    ...weakOriginal,
    catalogProduct('top-2', 'top', { name: 'Streetwear Heavyweight Tee', style_tags: ['streetwear'] }),
    catalogProduct('bottom-2', 'bottom', { name: 'Streetwear Baggy Jeans', style_tags: ['streetwear', 'baggy'] }),
    catalogProduct('shoes-2', 'shoes', { name: 'Everyday Court Sneakers', style_tags: ['streetwear'] }),
    catalogProduct('top-prev', 'top', { name: 'Previous Graphic Tee', style_tags: ['streetwear'] }),
    catalogProduct('bottom-prev', 'bottom', { name: 'Previous Cargo Pants', style_tags: ['streetwear', 'cargo'] }),
    catalogProduct('shoes-prev', 'shoes', { name: 'Previous Sneakers', style_tags: ['streetwear', 'sneaker'] }),
  ];
  const previousRebuildIds = ['top-prev', 'bottom-prev', 'shoes-prev'];
  const weakCritic = {
    overall_assessment: 'weak' as const,
    style_match: 3,
    color_harmony: 8,
    proportion: 8,
    occasion_match: 8,
    cohesion: 6,
    strengths: [],
    issues: [{ type: 'style', severity: 'major' as const, product_id: 'bottom-weak' }],
    recommendations: ['Swap the bottom'],
  };

  const rebuildWinnerScore = scoreOutfit(
    [rebuildRevisionCatalog.find((product) => product.id === 'top-2')!, weakOriginal[1], rebuildRevisionCatalog.find((product) => product.id === 'shoes-2')!],
    { style: 'Streetwear', occasion: 'Everyday' },
  );
  const rebuildDiverseScore = scoreOutfit(
    [rebuildRevisionCatalog.find((product) => product.id === 'top-2')!, weakOriginal[2], rebuildRevisionCatalog.find((product) => product.id === 'shoes-2')!],
    { style: 'Streetwear', occasion: 'Everyday' },
  );
  const rebuildNearCloneScore = scoreOutfit(
    [
      rebuildRevisionCatalog.find((product) => product.id === 'top-prev')!,
      rebuildRevisionCatalog.find((product) => product.id === 'bottom-prev')!,
      rebuildRevisionCatalog.find((product) => product.id === 'shoes-2')!,
    ],
    { style: 'Streetwear', occasion: 'Everyday' },
  );
  assert(
    rebuildDiverseScore.score >= rebuildWinnerScore.score + 2,
    'rebuild revision fixtures: diverse +2 is achievable',
  );
  assert(
    rebuildNearCloneScore.score >= rebuildWinnerScore.score + 2,
    'rebuild revision fixtures: near-clone +2 is achievable',
  );

  const rebuildNearClone = createHandlerHarness({
    live: () => liveRetrievalOf(rebuildRevisionCatalog),
    visual: 'none',
    geminiText: outfitCandidateJson({ top: 'top-2', bottom: 'bottom-weak', shoes: 'shoes-2' }),
    critic: weakCritic,
    revision: {
      items: [
        { product_id: 'top-prev' },
        { product_id: 'bottom-prev' },
        { product_id: 'shoes-2' },
      ],
    },
  });
  const rebuildNearCloneRun = await invoke(rebuildNearClone, {
    previous_outfit: previousRebuildIds.map((id) => ({ product_id: id })),
    exclude_product_ids: previousRebuildIds,
  });
  assert(rebuildNearCloneRun.response.status === 200, 'rebuild diversity reject: HTTP 200');
  assert(rebuildNearCloneRun.json.fashion_revision_attempted === true, 'rebuild diversity reject: attempted');
  assert(rebuildNearCloneRun.json.fashion_revision_accepted === false, 'rebuild diversity reject: rejected');
  assert(
    rebuildNearCloneRun.json.fashion_revision_reason === 'rebuild_diversity' ||
      rebuildNearCloneRun.json.fashion_revision_reason === 'validation_failed',
    'rebuild diversity reject: near-clone of previous is not accepted',
  );
  assert(itemIds(rebuildNearCloneRun.json).includes('bottom-weak'), 'rebuild diversity reject: original winner remains');
  assert(!itemIds(rebuildNearCloneRun.json).includes('top-prev'), 'rebuild diversity reject: previous top is not accepted');

  const rebuildDiverse = createHandlerHarness({
    live: () => liveRetrievalOf(rebuildRevisionCatalog),
    visual: 'none',
    geminiText: outfitCandidateJson({ top: 'top-2', bottom: 'bottom-weak', shoes: 'shoes-2' }),
    critic: weakCritic,
    revision: {
      items: [
        { product_id: 'top-2' },
        { product_id: 'bottom-strong' },
        { product_id: 'shoes-2' },
      ],
    },
  });
  const rebuildDiverseRun = await invoke(rebuildDiverse, {
    previous_outfit: previousRebuildIds.map((id) => ({ product_id: id })),
    exclude_product_ids: previousRebuildIds,
  });
  assert(rebuildDiverseRun.response.status === 200, 'rebuild diversity accept: HTTP 200');
  assert(rebuildDiverseRun.json.fashion_revision_attempted === true, 'rebuild diversity accept: attempted');
  assert(rebuildDiverseRun.json.fashion_revision_accepted === true, 'rebuild diversity accept: accepted');
  assert(itemIds(rebuildDiverseRun.json).includes('bottom-strong'), 'rebuild diversity accept: revised bottom is kept');
  assert(!itemIds(rebuildDiverseRun.json).includes('bottom-weak'), 'rebuild diversity accept: weak original bottom is gone');

  const rebuildLowScore = createHandlerHarness({
    live: () => liveRetrievalOf(rebuildRevisionCatalog),
    visual: 'none',
    geminiText: outfitCandidateJson({ top: 'top-2', bottom: 'bottom-weak', shoes: 'shoes-2' }),
    critic: weakCritic,
    revision: {
      items: [
        { product_id: 'top-2' },
        { product_id: 'bottom-weak' },
        { product_id: 'shoes-2' },
      ],
    },
  });
  const rebuildLowScoreRun = await invoke(rebuildLowScore, {
    previous_outfit: previousRebuildIds.map((id) => ({ product_id: id })),
    exclude_product_ids: previousRebuildIds,
  });
  assert(rebuildLowScoreRun.response.status === 200, 'rebuild < +2: HTTP 200');
  assert(rebuildLowScoreRun.json.fashion_revision_attempted === true, 'rebuild < +2: attempted');
  assert(rebuildLowScoreRun.json.fashion_revision_accepted === false, 'rebuild < +2: rejected');
  assert(
    rebuildLowScoreRun.json.fashion_revision_reason === 'insufficient_improvement',
    'rebuild < +2: existing score reason is unchanged',
  );
  assert(itemIds(rebuildLowScoreRun.json).includes('bottom-weak'), 'rebuild < +2: original winner remains');

  const noShoesRebuildCatalog = rebuildRevisionCatalog.filter((product) => product.category !== 'shoes');
  const noShoesNearClone = createHandlerHarness({
    live: () => liveRetrievalOf(noShoesRebuildCatalog),
    stored: noShoesRebuildCatalog,
    visual: 'none',
    geminiText: outfitCandidateJson({ top: 'top-2', bottom: 'bottom-weak', shoes: null }),
    critic: weakCritic,
    revision: {
      items: [{ product_id: 'top-prev' }, { product_id: 'bottom-2' }],
    },
  });
  const noShoesNearCloneRun = await invoke(noShoesNearClone, {
    footwear_preference: 'none',
    previous_outfit: [{ product_id: 'top-prev' }, { product_id: 'bottom-prev' }],
    exclude_product_ids: ['top-prev', 'bottom-prev'],
  });
  assert(noShoesNearCloneRun.response.status === 200, 'no-shoes rebuild near-clone: HTTP 200');
  assert(noShoesNearCloneRun.json.fashion_revision_accepted === false, 'no-shoes rebuild near-clone: rejected');
  assert(
    itemCategories(noShoesNearCloneRun.json).every((category) => category !== 'shoes'),
    'no-shoes rebuild near-clone: still no footwear',
  );

  // --- Visual-aware shortlist wiring ---
  const visualPool = expensiveVisualTops();
  const visual = createHandlerHarness({
    live: () => liveRetrievalOf(visualPool),
    visualAttachIds: ['top-visual-star'],
    geminiText: (call) => {
      const ids = (call.user.candidates as Array<{ id: string }>).map((row) => row.id);
      assert(ids.includes('top-visual-star'), 'visual: expensive visually-strong top stayed in Gemini catalog');
      return outfitCandidateJson({ top: 'top-visual-star', bottom: 'bottom-1', shoes: 'shoes-1' });
    },
  });
  const visualRun = await invoke(visual);
  assert(visualRun.response.status === 200, 'visual: HTTP 200');
  assert(
    visual.shortlists.some((row) => row.visualAware === true),
    'visual: handler called shortlistForGemini({ visualAware: true })',
  );
  const visualCandidate = (visual.geminiCalls[0].user.candidates as Array<{ id: string; visual?: unknown }>).find(
    (row) => row.id === 'top-visual-star',
  );
  assert(Boolean(visualCandidate?.visual), 'visual: Gemini received visual attributes for the enriched product');

  // --- Critic / revision contract wiring ---
  const contract = createHandlerHarness({
    live: () => liveRetrievalOf(catalog),
    geminiText: outfitCandidateJson({ top: 'top-1', bottom: 'bottom-1', shoes: 'shoes-1' }),
    critic: {
      overall_assessment: 'weak',
      style_match: 4,
      color_harmony: 8,
      proportion: 8,
      occasion_match: 8,
      cohesion: 8,
      strengths: [],
      issues: [{ type: 'style', severity: 'major', product_id: 'bottom-1' }],
      recommendations: ['Swap'],
    },
    revision: {
      items: [
        { product_id: 'top-1' },
        { product_id: 'bottom-2' },
        { product_id: 'shoes-1' },
      ],
    },
  });
  const contractRun = await invoke(contract, { style: 'Y2K', occasion: 'Party' });
  assert(contractRun.response.status === 200, 'contract: HTTP 200');
  assert(
    contract.criticPrompts[0].includes(STYLE_CONTRACT.Y2K.criticInterpretation),
    'contract: critic receives STYLE_CONTRACT criticInterpretation',
  );
  assert(
    contract.criticPrompts[0].includes(OCCASION_CONTRACT.Party.geminiRules),
    'contract: critic receives OCCASION_CONTRACT rules',
  );
  assert(
    contract.revisionPrompts[0].includes(STYLE_CONTRACT.Y2K.criticInterpretation),
    'contract: revision receives the same style contract',
  );
  assert(
    contract.revisionPrompts[0].includes(OCCASION_CONTRACT.Party.geminiRules),
    'contract: revision receives the occasion contract',
  );
  assert(
    contract.revisionInputs[0].catalog.every((product) =>
      ['top-1', 'bottom-1', 'shoes-1', 'top-2', 'bottom-2', 'shoes-2'].includes(product.product_id),
    ),
    'contract: revision catalog only exposes allowed working candidates',
  );

  // --- Error paths ---
  const channel3Fail = createHandlerHarness({
    live: () => liveRetrievalFromError('request_error'),
    storedError: 'catalog_empty',
  });
  const channel3FailRun = await invoke(channel3Fail);
  assert(channel3FailRun.response.status === 404, 'errors: Channel3 failure + empty stored is 404');
  assert(channel3FailRun.json.code === 'catalog_empty', 'errors: empty catalog code');

  const emptyCatalog = createHandlerHarness({
    live: () => liveRetrievalOf([]),
    storedError: 'catalog_empty',
  });
  const emptyRun = await invoke(emptyCatalog);
  assert(emptyRun.response.status === 404, 'errors: empty catalog is 404');

  const geminiFailFallback = createHandlerHarness({
    live: () => liveRetrievalOf(catalog),
    geminiError: 'http',
  });
  const geminiFailFallbackRun = await invoke(geminiFailFallback);
  assert(geminiFailFallbackRun.response.status === 200, 'errors: Gemini HTTP failure uses existing heuristic fallback');
  assert(
    geminiFailFallbackRun.json.generation_mode === 'heuristic_fallback',
    'errors: Gemini HTTP failure reports heuristic_fallback',
  );

  const geminiFail = createHandlerHarness({
    live: () => liveRetrievalOf(catalog),
    geminiError: 'http',
    env: { EDGE_FUNCTION_PORT: 'disabled' },
  });
  const geminiFailRun = await invoke(geminiFail);
  assert(geminiFailRun.response.status === 502, 'errors: Gemini HTTP failure is 502 ai when heuristic is off');
  assert(geminiFailRun.json.code === 'ai', 'errors: Gemini failure code is ai');

  const visionFail = createHandlerHarness({
    live: () => liveRetrievalOf(catalog),
    visual: 'fail',
    geminiText: outfitCandidateJson({ top: 'top-1', bottom: 'bottom-1', shoes: 'shoes-1' }),
  });
  const visionFailRun = await invoke(visionFail);
  assert(visionFailRun.response.status === 200, 'errors: vision failure does not block generation');

  const criticFail = createHandlerHarness({
    live: () => liveRetrievalOf(catalog),
    geminiText: outfitCandidateJson({ top: 'top-1', bottom: 'bottom-1', shoes: 'shoes-1' }),
    critic: 'throw',
  });
  const criticFailRun = await invoke(criticFail);
  assert(criticFailRun.response.status === 200, 'errors: critic failure does not block generation');
  assert(criticFailRun.json.fashion_critic_available === false, 'errors: critic failure is reported');

  const revisionFail = createHandlerHarness({
    live: () => liveRetrievalOf(catalog),
    geminiText: outfitCandidateJson({ top: 'top-1', bottom: 'bottom-1', shoes: 'shoes-1' }),
    critic: {
      overall_assessment: 'weak',
      style_match: 3,
      color_harmony: 8,
      proportion: 8,
      occasion_match: 8,
      cohesion: 8,
      strengths: [],
      issues: [{ type: 'style', severity: 'major' }],
      recommendations: ['Swap'],
    },
    revision: 'throw',
  });
  const revisionFailRun = await invoke(revisionFail);
  assert(revisionFailRun.response.status === 200, 'errors: revision failure keeps the original outfit');
  assert(revisionFailRun.json.fashion_revision_accepted === false, 'errors: failed revision is not accepted');
  assert(itemIds(revisionFailRun.json).includes('bottom-1'), 'errors: original products remain after revision throw');

  const pricey = coreCatalog().map((product) => ({ ...product, price: 180 }));
  const budgetFail = createHandlerHarness({
    live: () => liveRetrievalOf(pricey),
  });
  const budgetFailRun = await invoke(budgetFail, { budget: 20 });
  assert(budgetFailRun.response.status === 404, 'errors: impossible budget is 404');
  assert(
    budgetFailRun.json.code === 'no_products' || budgetFailRun.json.code === 'brands_no_fit',
    'errors: impossible budget uses the existing no-fit code',
  );

  // --- Final gender validation ---
  const womensOnlyTop = catalogProduct('top-womens', 'top', {
    name: 'Satin Blouse',
    gender: 'women',
    style_tags: ['streetwear'],
  });
  const mensOnlyTop = catalogProduct('top-mens-only', 'top', {
    name: 'Oxford Shirt',
    gender: 'men',
    style_tags: ['streetwear'],
  });
  const womensBottom = catalogProduct('bottom-womens', 'bottom', {
    name: 'High Rise Jeans',
    gender: 'women',
    style_tags: ['streetwear'],
  });
  const womensShoes = catalogProduct('shoes-womens', 'shoes', {
    name: 'Court Sneakers',
    gender: 'women',
    style_tags: ['streetwear'],
  });
  const genderedCatalog = [...catalog, womensOnlyTop, mensOnlyTop, womensBottom, womensShoes];

  const menGetsWomens = createHandlerHarness({
    live: () => liveRetrievalOf(genderedCatalog),
    geminiText: outfitCandidateJson({ top: 'top-womens', bottom: 'bottom-1', shoes: 'shoes-1' }),
    env: rejectEnv,
  });
  const menGetsWomensRun = await invoke(menGetsWomens, { gender: 'men' });
  assert(menGetsWomensRun.response.status === 422, 'gender: men + women-only Gemini candidate is rejected');
  assert(menGetsWomensRun.json.code === 'invalid_ai', 'gender: men conflict uses existing invalid_ai response');
  assert(!itemIds(menGetsWomensRun.json).includes('top-womens'), 'gender: women-only product is not returned');

  const womenGetsMens = createHandlerHarness({
    live: () => liveRetrievalOf(genderedCatalog),
    geminiText: outfitCandidateJson({ top: 'top-mens-only', bottom: 'bottom-womens', shoes: 'shoes-womens' }),
    env: rejectEnv,
  });
  const womenGetsMensRun = await invoke(womenGetsMens, { gender: 'women' });
  assert(womenGetsMensRun.response.status === 422, 'gender: women + men-only Gemini candidate is rejected');
  assert(!itemIds(womenGetsMensRun.json).includes('top-mens-only'), 'gender: men-only product is not returned');

  const menValid = createHandlerHarness({
    live: () => liveRetrievalOf(genderedCatalog),
    geminiText: outfitCandidateJson({ top: 'top-1', bottom: 'bottom-1', shoes: 'shoes-1' }),
  });
  const menValidRun = await invoke(menValid, { gender: 'men' });
  assert(menValidRun.response.status === 200, 'gender: compatible men candidate succeeds');
  assert(itemIds(menValidRun.json).includes('top-1'), 'gender: compatible men top is returned');

  const anyPermissive = createHandlerHarness({
    live: () => liveRetrievalOf(genderedCatalog),
    geminiText: outfitCandidateJson({ top: 'top-womens', bottom: 'bottom-womens', shoes: 'shoes-womens' }),
  });
  const anyPermissiveRun = await invoke(anyPermissive, { gender: 'any' });
  assert(anyPermissiveRun.response.status === 200, 'gender: any remains permissive');
  assert(itemIds(anyPermissiveRun.json).includes('top-womens'), 'gender: any can return a women-coded product');

  const womenValid = createHandlerHarness({
    live: () => liveRetrievalOf(genderedCatalog),
    geminiText: outfitCandidateJson({ top: 'top-womens', bottom: 'bottom-womens', shoes: 'shoes-womens' }),
  });
  const womenValidRun = await invoke(womenValid, { gender: 'women' });
  assert(womenValidRun.response.status === 200, 'gender: compatible women candidate succeeds');
  assert(itemIds(womenValidRun.json).includes('top-womens'), 'gender: compatible women top is returned');

  const menRevisionGender = createHandlerHarness({
    live: () => liveRetrievalOf(genderedCatalog),
    visual: 'none',
    geminiText: outfitCandidateJson({ top: 'top-1', bottom: 'bottom-1', shoes: 'shoes-1' }),
    critic: {
      overall_assessment: 'weak',
      style_match: 3,
      color_harmony: 8,
      proportion: 8,
      occasion_match: 8,
      cohesion: 8,
      strengths: [],
      issues: [{ type: 'style', severity: 'major' }],
      recommendations: ['Swap'],
    },
    revision: {
      items: [
        { product_id: 'top-womens' },
        { product_id: 'bottom-1' },
        { product_id: 'shoes-1' },
      ],
    },
  });
  const menRevisionGenderRun = await invoke(menRevisionGender, { gender: 'men' });
  assert(menRevisionGenderRun.response.status === 200, 'gender revision: HTTP 200 keeps the original winner');
  assert(menRevisionGenderRun.json.fashion_revision_accepted === false, 'gender revision: women-only swap is rejected');
  assert(!itemIds(menRevisionGenderRun.json).includes('top-womens'), 'gender revision: cannot bypass the final gender gate');
  assert(itemIds(menRevisionGenderRun.json).includes('top-1'), 'gender revision: original men top remains');

  if (failed) {
    console.error(`\nhandler integration tests: ${failed} failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`handler integration tests: ${passed} passed`);
}

void main();
