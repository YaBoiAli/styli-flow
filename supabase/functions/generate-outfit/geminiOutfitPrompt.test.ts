/**
 * Phase 5A: canonical STYLE_CONTRACT / OCCASION_CONTRACT in Gemini generation prompts.
 * Run: npx tsx supabase/functions/generate-outfit/geminiOutfitPrompt.test.ts
 */
import { OCCASIONS, STYLES } from '../../../types/index.ts';
import { isClassyLook } from '../_shared/catalog/fashionSignals.ts';
import {
  OCCASION_CONTRACT,
  STYLE_CONTRACT,
  occasionContractFor,
  styleContractFor,
} from '../_shared/catalog/styleOccasionContract.ts';
import {
  buildGeminiContractContext,
  classyFootwearOccasionLabels,
  stylistSystemPrompt,
} from './geminiOutfitPrompt.ts';
import { candidateInterpretationOptions } from './outfitDiversity.ts';

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

function prompt(style: string, occasion: string, includeShoes = true): string {
  return stylistSystemPrompt({
    shopFor: 'men',
    includeShoes,
    complexion: false,
    rebuild: false,
    style,
    occasion,
  });
}

for (const style of STYLES) {
  const context = buildGeminiContractContext(style, 'Everyday');
  assert(context.style !== null, `${style}: Gemini contract context resolves`);
  assert(
    context.style?.interpretation === STYLE_CONTRACT[style].geminiInterpretation,
    `${style}: interpretation comes from STYLE_CONTRACT.geminiInterpretation`,
  );
  assert(context.style?.label === STYLE_CONTRACT[style].label, `${style}: canonical label`);
  assert(
    JSON.stringify(context.style?.fit_priors) === JSON.stringify(STYLE_CONTRACT[style].fitPriors),
    `${style}: fit_priors come from STYLE_CONTRACT`,
  );
  assert(
    JSON.stringify(context.style?.silhouette_priors) ===
      JSON.stringify(STYLE_CONTRACT[style].silhouettePriors),
    `${style}: silhouette_priors come from STYLE_CONTRACT`,
  );
  assert(
    context.style?.volume_friendly === STYLE_CONTRACT[style].volumeFriendly,
    `${style}: volume_friendly comes from STYLE_CONTRACT`,
  );
  assert(
    context.style?.intensity_friendly === STYLE_CONTRACT[style].intensityFriendly,
    `${style}: intensity_friendly comes from STYLE_CONTRACT`,
  );
}

for (const occasion of OCCASIONS) {
  const context = buildGeminiContractContext('Streetwear', occasion);
  assert(context.occasion !== null, `${occasion}: Gemini contract context resolves`);
  assert(
    context.occasion?.rules === OCCASION_CONTRACT[occasion].geminiRules,
    `${occasion}: rules come from OCCASION_CONTRACT.geminiRules`,
  );
  assert(context.occasion?.label === OCCASION_CONTRACT[occasion].label, `${occasion}: canonical label`);
  assert(
    context.occasion?.classy_footwear === OCCASION_CONTRACT[occasion].classyFootwear,
    `${occasion}: classy_footwear comes from OCCASION_CONTRACT`,
  );
  assert(
    JSON.stringify(context.occasion?.accepted_formality) ===
      JSON.stringify(OCCASION_CONTRACT[occasion].acceptedFormality),
    `${occasion}: accepted_formality comes from OCCASION_CONTRACT`,
  );
}

const y2kParty = prompt('Y2K', 'Party');
assert(y2kParty.includes(STYLE_CONTRACT.Y2K.geminiInterpretation), 'prompt includes Y2K STYLE_CONTRACT interpretation');
assert(y2kParty.includes(OCCASION_CONTRACT.Party.geminiRules), 'prompt includes Party OCCASION_CONTRACT rules');
assert(y2kParty.includes('STYLE CONTRACT'), 'prompt has STYLE CONTRACT section');
assert(y2kParty.includes('OCCASION CONTRACT'), 'prompt has OCCASION CONTRACT section');
assert(
  y2kParty.includes('The selected style and occasion are canonical'),
  'prompt states the contract is authoritative',
);
assert(
  y2kParty.includes('Do not reinterpret them as a different style or occasion'),
  'prompt forbids reinterpreting style/occasion',
);
assert(
  y2kParty.includes('Deterministic server validation and scoring remain authoritative'),
  'prompt keeps server scoring authoritative',
);
assert(
  !y2kParty.includes('Y2K 2000s graphic tee'),
  'prompt does not dump retrievalConcepts into Gemini guidance',
);
assert(
  styleContractFor('Y2K')?.geminiInterpretation === STYLE_CONTRACT.Y2K.geminiInterpretation,
  'Gemini interpretation is the canonical contract, not a second vocabulary',
);

const quietLuxury = prompt('Quiet Luxury', 'Everyday');
assert(
  quietLuxury.includes(STYLE_CONTRACT['Quiet Luxury'].geminiInterpretation),
  'Quiet Luxury prompt uses STYLE_CONTRACT interpretation',
);
assert(
  quietLuxury.includes(OCCASION_CONTRACT.Everyday.geminiRules),
  'Everyday prompt uses OCCASION_CONTRACT rules',
);

const darkAcademia = prompt('Dark Academia', 'School');
assert(
  darkAcademia.includes(STYLE_CONTRACT['Dark Academia'].geminiInterpretation),
  'Dark Academia prompt uses STYLE_CONTRACT interpretation',
);

const elevated = prompt('Elevated Streetwear', 'Work');
assert(
  elevated.includes(STYLE_CONTRACT['Elevated Streetwear'].geminiInterpretation),
  'Elevated Streetwear prompt uses STYLE_CONTRACT interpretation',
);
assert(elevated.includes(OCCASION_CONTRACT.Work.geminiRules), 'Work prompt uses OCCASION_CONTRACT rules');

const eventFromAlias = buildGeminiContractContext('Formal', 'formal event');
assert(eventFromAlias.occasion !== null, 'formal event alias resolves');
assert(eventFromAlias.occasion?.label === 'Event', 'formal event alias uses canonical Event contract');
assert(
  eventFromAlias.occasion?.rules === OCCASION_CONTRACT.Event.geminiRules,
  'formal event alias uses Event geminiRules',
);
assert(
  occasionContractFor('Event') === occasionContractFor('formal event'),
  'Event and formal event are the same contract record',
);
const eventPrompt = prompt('Formal', 'Event');
assert(eventPrompt.includes(OCCASION_CONTRACT.Event.geminiRules), 'Event prompt uses canonical Event rules');
assert(eventPrompt.includes(STYLE_CONTRACT.Formal.geminiInterpretation), 'Formal+Event keeps Formal style contract');

const nightOut = buildGeminiContractContext('Streetwear', 'Night Out');
assert(nightOut.style?.label === 'Streetwear', 'Night Out does not replace the requested style');
assert(nightOut.occasion?.label === 'Night Out', 'Night Out is treated as an occasion');
assert(styleContractFor('Night Out') === null, 'Night Out is not a style contract key');
assert(occasionContractFor('Night Out') !== null, 'Night Out resolves as an occasion');
const nightOutPrompt = prompt('Streetwear', 'Night Out');
assert(
  nightOutPrompt.includes(OCCASION_CONTRACT['Night Out'].geminiRules),
  'Night Out prompt uses Night Out occasion contract',
);

const noShoes = prompt('Minimalist', 'Everyday', false);
assert(noShoes.includes('Footwear was intentionally excluded'), 'no-shoes prompt forbids footwear');
assert(noShoes.includes('"shoes_id": null'), 'no-shoes schema keeps shoes_id null');
assert(
  !noShoes.includes('Each candidate must include exactly one top, one bottom, and one shoes item'),
  'no-shoes prompt does not require a shoes item',
);
assert(
  noShoes.includes('Never include shoes, sneakers, boots, sandals, heels, loafers, or any footwear'),
  'no-shoes remains no-shoes after contract integration',
);

let threw = false;
try {
  const missing = buildGeminiContractContext('NotAStyle', 'NotAnOccasion');
  assert(missing.style === null, 'missing style does not substitute another style');
  assert(missing.occasion === null, 'missing occasion does not substitute another occasion');
  assert(missing.requested_style === 'NotAStyle', 'missing style keeps the requested label');
  assert(missing.requested_occasion === 'NotAnOccasion', 'missing occasion keeps the requested label');
  const missingPrompt = prompt('NotAStyle', 'NotAnOccasion');
  assert(missingPrompt.includes('STYLE CONTRACT'), 'missing keys still build a prompt');
  assert(missingPrompt.includes('null'), 'unresolved contract is emitted as null, not a fallback style');
  assert(!missingPrompt.includes(STYLE_CONTRACT.Streetwear.geminiInterpretation), 'missing style does not silently use Streetwear');
} catch {
  threw = true;
}
assert(!threw, 'missing contract keys do not crash prompt construction');

const rebuildPrompt = stylistSystemPrompt({
  shopFor: 'women',
  includeShoes: true,
  complexion: false,
  rebuild: true,
  style: 'Y2K',
  occasion: 'Party',
});
assert(rebuildPrompt.includes(STYLE_CONTRACT.Y2K.geminiInterpretation), 'rebuild attempt still includes style contract');
assert(rebuildPrompt.includes(OCCASION_CONTRACT.Party.geminiRules), 'rebuild attempt still includes occasion contract');

const attemptShape = buildGeminiContractContext('Y2K', 'Party');
assert(
  JSON.stringify(attemptShape) === JSON.stringify(buildGeminiContractContext('Y2K', 'Party')),
  'contract context is deterministic across generation attempts',
);

// --- Phase 6B: interpretation guide follows STYLE_CONTRACT flags (H2) ---
for (const style of STYLES) {
  const contract = STYLE_CONTRACT[style];
  const options = candidateInterpretationOptions(style);
  assert(options.includes('clean/minimal'), `${style}: always offers clean/minimal`);
  assert(options.includes('layered'), `${style}: always offers layered`);
  assert(options.includes('more elevated'), `${style}: always offers more elevated`);
  assert(
    options.includes('more relaxed/baggy') === contract.volumeFriendly,
    `${style}: baggy guidance only when volumeFriendly=${contract.volumeFriendly}`,
  );
  assert(
    options.includes('color-forward') === contract.intensityFriendly,
    `${style}: color-forward guidance only when intensityFriendly=${contract.intensityFriendly}`,
  );
}

assert(!STYLE_CONTRACT['Quiet Luxury'].volumeFriendly, 'Quiet Luxury contract disallows volume');
assert(
  !candidateInterpretationOptions('Quiet Luxury').includes('more relaxed/baggy'),
  'Quiet Luxury does not receive baggy guidance',
);
assert(!STYLE_CONTRACT['Old Money'].volumeFriendly, 'Old Money contract disallows volume');
assert(
  !candidateInterpretationOptions('Old Money').includes('more relaxed/baggy'),
  'Old Money does not receive baggy guidance',
);
assert(!STYLE_CONTRACT.Minimalist.intensityFriendly, 'Minimalist contract disallows intensity');
assert(
  !candidateInterpretationOptions('Minimalist').includes('color-forward'),
  'Minimalist does not receive color-forward guidance',
);
assert(STYLE_CONTRACT.Streetwear.volumeFriendly, 'Streetwear contract allows volume');
assert(
  candidateInterpretationOptions('Streetwear').includes('more relaxed/baggy'),
  'volume-friendly Streetwear can still receive baggy variation',
);
assert(STYLE_CONTRACT.Y2K.intensityFriendly, 'Y2K contract allows intensity');
assert(
  candidateInterpretationOptions('Y2K').includes('color-forward'),
  'intensity-friendly Y2K can still receive color-forward variation',
);

const quietLuxuryPrompt = stylistSystemPrompt({
  shopFor: 'men',
  includeShoes: true,
  complexion: false,
  rebuild: false,
  style: 'Quiet Luxury',
  occasion: 'Date',
});
assert(!quietLuxuryPrompt.includes('more relaxed/baggy'), 'Quiet Luxury prompt omits baggy interpretation');

const minimalistPrompt = stylistSystemPrompt({
  shopFor: 'women',
  includeShoes: true,
  complexion: false,
  rebuild: false,
  style: 'Minimalist',
  occasion: 'Work',
});
assert(!minimalistPrompt.includes('color-forward'), 'Minimalist prompt omits color-forward interpretation');

const streetwearPrompt = stylistSystemPrompt({
  shopFor: 'men',
  includeShoes: true,
  complexion: false,
  rebuild: false,
  style: 'Streetwear',
  occasion: 'Everyday',
});
assert(streetwearPrompt.includes('more relaxed/baggy'), 'Streetwear prompt keeps volume variation');
assert(streetwearPrompt.includes('color-forward'), 'Streetwear prompt keeps intensity variation');

// --- Phase 6B: isClassyLook follows OCCASION_CONTRACT.classyFootwear (M1) ---
const nonClassyStyle = 'Streetwear';
assert(
  isClassyLook(nonClassyStyle, 'Party') === OCCASION_CONTRACT.Party.classyFootwear,
  'isClassyLook Party follows OCCASION_CONTRACT.classyFootwear',
);
assert(
  isClassyLook(nonClassyStyle, 'Date') === OCCASION_CONTRACT.Date.classyFootwear,
  'isClassyLook Date follows OCCASION_CONTRACT.classyFootwear',
);
assert(
  isClassyLook(nonClassyStyle, 'Work') === OCCASION_CONTRACT.Work.classyFootwear,
  'isClassyLook Work follows OCCASION_CONTRACT.classyFootwear',
);
assert(
  isClassyLook(nonClassyStyle, 'Event') === OCCASION_CONTRACT.Event.classyFootwear,
  'isClassyLook Event follows OCCASION_CONTRACT.classyFootwear',
);
assert(
  isClassyLook(nonClassyStyle, 'Night Out') === OCCASION_CONTRACT['Night Out'].classyFootwear,
  'isClassyLook Night Out follows OCCASION_CONTRACT.classyFootwear',
);
assert(
  isClassyLook(nonClassyStyle, 'Everyday') === OCCASION_CONTRACT.Everyday.classyFootwear,
  'isClassyLook Everyday follows OCCASION_CONTRACT.classyFootwear',
);
assert(
  isClassyLook('Casual', 'formal event') === Boolean(occasionContractFor('formal event')?.classyFootwear),
  'isClassyLook formal event alias follows canonical Event classyFootwear',
);
assert(OCCASION_CONTRACT.Party.classyFootwear === true, 'canonical Party remains classy-footwear');
assert(OCCASION_CONTRACT.Everyday.classyFootwear === false, 'canonical Everyday remains not classy-footwear');
assert(isClassyLook(nonClassyStyle, 'Party') === true, 'Party is classy via contract, not a duplicate map');
assert(isClassyLook(nonClassyStyle, 'Everyday') === false, 'Everyday is not classy via contract');

// --- Phase 6B: dress-shoe guidance derived from OCCASION_CONTRACT (L2) ---
const contractClassyKeys = Object.values(OCCASION_CONTRACT)
  .filter((record) => record.classyFootwear)
  .map((record) => record.key);
assert(
  JSON.stringify(classyFootwearOccasionLabels()) === JSON.stringify(contractClassyKeys),
  'Gemini classy-footwear labels stay aligned with OCCASION_CONTRACT.classyFootwear',
);
assert(
  classyFootwearOccasionLabels().includes('party'),
  'Party is included because OCCASION_CONTRACT.Party.classyFootwear === true',
);

const dressLine = streetwearPrompt.split('\n').find((line) => line.includes('Dress shoes (loafers, oxfords, Marc Nolan)'));
assert(Boolean(dressLine), 'dress-shoe guidance line is present when shoes are included');
assert(
  dressLine!.includes(classyFootwearOccasionLabels().join(', ')),
  'dress-shoe guidance lists every classyFootwear occasion from the contract',
);
assert(dressLine!.includes('party'), 'dress-shoe guidance includes Party');
for (const record of Object.values(OCCASION_CONTRACT)) {
  if (record.classyFootwear) {
    assert(dressLine!.includes(record.key), `dress-shoe guidance includes contract classy occasion ${record.key}`);
  }
}

console.log(`geminiOutfitPrompt tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  throw new Error(`${failed} geminiOutfitPrompt test(s) failed`);
}
