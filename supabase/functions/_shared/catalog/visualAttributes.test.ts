/**
 * Phase 4 visual attribute parsing, shortlist, and merge.
 * Run: npx tsx supabase/functions/_shared/catalog/visualAttributes.test.ts
 */
import {
  applyVisualRecord,
  applyVisualRecords,
  emptyVisualAttributes,
  parseModelJsonSafe,
  parseVisualAnalysisResponse,
  parseVisualAttributes,
  selectVisualAnalysisTargets,
  visualForPrompt,
  visualIsUsable,
  type VisualAttributes,
  type VisualTarget,
} from './visualAttributes.ts';

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

const valid: VisualAttributes = {
  primary_color: 'washed black',
  secondary_colors: ['white', 'gray'],
  color_family: 'black',
  saturation: 'low',
  brightness: 'dark',
  primary_hex: '#1a1a1a',
  fit: 'oversized',
  silhouette: 'boxy',
  length: 'regular',
  pattern: 'graphic',
  pattern_scale: 'large',
  pattern_intensity: 'high',
  visual_weight: 'heavy',
  visual_intensity: 8,
  material_appearance: 'heavy_cotton',
  aesthetics: ['streetwear'],
  formality: 0.2,
  season: ['all_season'],
  confidence: 0.84,
};

const parsed = parseVisualAttributes({
  ...valid,
  extra: 'ignored',
});
assert(parsed?.primary_color === 'washed black', '1: valid visual JSON parses');
assert(parsed?.fit === 'oversized' && parsed?.pattern === 'graphic', '1b: enums preserved');
assert(parsed?.primary_hex === '#1a1a1a', '1c: hex kept');
assert(parsed?.visual_intensity === 8, '1d: intensity kept');

assert(parseModelJsonSafe('{not-json') === null, '2: malformed JSON fails safely');
assert(parseVisualAnalysisResponse('{not-json').length === 0, '2b: batch malformed returns []');
assert(parseVisualAttributes('nope') === null, '2c: non-object returns null');

const unknowned = parseVisualAttributes({
  primary_color: 'unknown',
  fit: 'unknown',
  pattern: '',
  color_family: 'chartreuse',
  saturation: 'very-high',
  visual_weight: 'chunky',
  secondary_colors: ['White', 'unknown', 3],
});
assert(unknowned?.primary_color === null, '3: unknown color becomes null');
assert(unknowned?.fit === null, '3b: unknown enum becomes null');
assert(unknowned?.color_family === null, '4: invalid enum rejected');
assert(unknowned?.saturation === null, '4b: invalid saturation rejected');
assert(unknowned?.visual_weight === null, '4c: invalid weight rejected');
assert(
  unknowned?.secondary_colors.length === 1 && unknowned.secondary_colors[0] === 'white',
  '3c: invalid secondary values dropped',
);

assert(parseVisualAttributes({})?.confidence === null, '5: missing confidence is null');
assert(parseVisualAttributes({ confidence: 1.4 })?.confidence === 1, '5b: confidence clamped');
assert(parseVisualAttributes({ confidence: -2 })?.confidence === 0, '5c: negative confidence clamped');
assert(parseVisualAttributes({ visual_intensity: 0.8 })?.visual_intensity === 8, '5d: 0-1 intensity scaled');

const batch = parseVisualAnalysisResponse(
  JSON.stringify({
    products: [
      { product_id: 'top-1', confidence: 0.9, visual_attributes: valid },
      { product_id: 'ghost', confidence: 0.9, visual_attributes: valid },
      { product_id: 'bad', visual_attributes: 'nope' },
    ],
  }),
  new Set(['top-1', 'bad']),
);
assert(batch.length === 1 && batch[0].product_id === 'top-1', '5e: unknown ids skipped');

const product = {
  id: 'top-1',
  category: 'top',
  image_url: 'https://cdn.example.com/tee.jpg',
  fit: 'regular',
  silhouette: null,
  pattern: 'unknown',
};
const merged = applyVisualRecord(product, {
  product_id: 'top-1',
  confidence: 0.88,
  attributes: { ...emptyVisualAttributes(0.88), fit: 'oversized', silhouette: 'boxy', pattern: 'graphic' },
});
assert(merged.fit === 'regular', 'precedence: existing structured fit kept');
assert(merged.silhouette === 'boxy', 'precedence: empty silhouette filled from visual');
assert(merged.pattern === 'graphic', 'precedence: unknown pattern replaced');

const weak = applyVisualRecord(product, {
  product_id: 'top-1',
  confidence: 0.2,
  attributes: { ...emptyVisualAttributes(0.2), silhouette: 'oversized', pattern: 'plaid' },
});
assert(weak.silhouette == null, 'precedence: low-confidence visual does not fill');
assert(weak.pattern === 'unknown', 'precedence: low-confidence does not replace unknown');

const targets = selectVisualAnalysisTargets(
  [
    { id: 't1', category: 'top', image_url: 'https://cdn.example.com/t.jpg' },
    { id: 'b1', category: 'bottom', image_url: 'https://cdn.example.com/b.jpg' },
    { id: 's1', category: 'shoes', image_url: 'https://cdn.example.com/s.jpg' },
    { id: 't2', category: 'top', image_url: '' },
    { id: 't3', category: 'top', image_url: 'not-a-url' },
  ],
  { footwearPreference: 'none', max: 15 },
);
assert(
  targets.every((product) => product.category !== 'shoes'),
  '27: no-shoes does not select footwear for analysis',
);
const sneakerAccessoryTargets = selectVisualAnalysisTargets(
  [
    { id: 't1', category: 'top', name: 'Tee', image_url: 'https://cdn.example.com/t.jpg' },
    { id: 'acc', category: 'accessory', name: 'White Canvas Sneakers', image_url: 'https://cdn.example.com/s.jpg' },
  ],
  { footwearPreference: 'none', max: 15 },
);
assert(
  sneakerAccessoryTargets.every((product) => product.id !== 'acc'),
  '27b: no-shoes skips footwear even when miscategorized',
);
assert(
  targets.every((product) => product.id !== 't2' && product.id !== 't3'),
  '23: missing/invalid image is skipped',
);
assert(targets.some((product) => product.id === 't1'), '23b: usable image is selected');

const withoutVisual: VisualTarget[] = [{ id: 't1', category: 'top', image_url: '', fit: 'slim' }];
const untouched = applyVisualRecords(withoutVisual, []);
assert(untouched[0].fit === 'slim' && !untouched[0].visual_attributes, '24: missing visual leaves metadata');

const catalogWithFit: VisualTarget = {
  id: 't1',
  category: 'top',
  image_url: '',
  fit: 'slim',
  silhouette: 'straight',
  pattern: 'solid',
};
const keptCatalog = applyVisualRecord(catalogWithFit, {
  product_id: 't1',
  confidence: 0.92,
  attributes: {
    ...emptyVisualAttributes(0.92),
    fit: 'oversized',
    silhouette: 'boxy',
    pattern: 'graphic',
  },
});
assert(keptCatalog.fit === 'slim', '8: visual does not overwrite reliable catalog fit');
assert(keptCatalog.silhouette === 'straight', '8: visual does not overwrite reliable catalog silhouette');
assert(keptCatalog.pattern === 'solid', '8: visual does not overwrite reliable catalog pattern');
assert(keptCatalog.visual_attributes?.fit === 'oversized', '8b: visual attributes still attach in memory');

assert(!visualIsUsable({ visual_attributes: emptyVisualAttributes(0.2) }), '25: low confidence not usable');
assert(visualIsUsable({ visual_attributes: emptyVisualAttributes(0.7) }), '25b: high confidence usable');
assert(
  visualForPrompt(emptyVisualAttributes(0.2)) === undefined,
  '25c: low-confidence visual omitted from prompts',
);

if (failed) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\n${passed} passed`);
