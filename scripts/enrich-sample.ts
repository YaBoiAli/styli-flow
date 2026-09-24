/**
 * Classify 10 existing live products and print the saved fashion attributes.
 *   npx -y deno run --allow-net --allow-env --allow-read scripts/enrich-sample.ts
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import {
  enrichProductById,
  enrichProductRowWithRetry,
  loadEnrichableProduct,
  sleep,
} from '../supabase/functions/_shared/catalog/enrichProduct.ts';
import { ENRICHMENT_VERSION } from '../supabase/functions/_shared/catalog/fashionAttributes.ts';

function loadEnvFile(path: string) {
  try {
    for (const line of Deno.readTextFileSync(path).split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || Deno.env.get(match[1])) continue;
      Deno.env.set(match[1], match[2].replace(/^["']|["']$/g, ''));
    }
  } catch {
    // .env is optional when the shell already has the keys.
  }
}

function loadLocalServiceKey(): string | null {
  const temp = Deno.env.get('TEMP') ?? Deno.env.get('TMP');
  if (!temp) return null;
  try {
    const raw = Deno.readTextFileSync(`${temp}\\styli-harness\\tokens.json`);
    const parsed = JSON.parse(raw) as { service?: string };
    return parsed.service ?? null;
  } catch {
    return null;
  }
}

loadEnvFile(`${Deno.cwd()}/.env`);

const supabaseUrl =
  Deno.env.get('SUPABASE_URL') ?? Deno.env.get('EXPO_PUBLIC_SUPABASE_URL') ?? 'http://127.0.0.1:54321';
const serviceKey =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  Deno.env.get('EXPO_PUBLIC_SUPABASE_ANON_KEY') ??
  loadLocalServiceKey();

if (!serviceKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  Deno.exit(1);
}
if (!Deno.env.get('GEMINI_API_KEY')) {
  console.error('Missing GEMINI_API_KEY');
  Deno.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase
  .from('products')
  .select('id, name, brand, category, gender, source')
  .neq('source', 'demo')
  .eq('availability', 'in_stock')
  .order('last_checked', { ascending: false })
  .limit(10);

if (error || !data?.length) {
  console.error(error?.message ?? 'No live products found');
  Deno.exit(1);
}

console.log(`Enrichment v${ENRICHMENT_VERSION} — ${data.length} live products\n`);

for (const row of data) {
  const product = await loadEnrichableProduct(supabase, row.id);
  const result = product
    ? await enrichProductRowWithRetry(supabase, product, { retries: 4, baseMs: 1500 })
    : await enrichProductById(supabase, row.id);
  if (result.ok) {
    await sleep(400);
  } else if (result.retryable) {
    await sleep(2000);
  }
  if (!result.ok) {
    console.log(`FAIL  ${row.brand} · ${row.name}`);
    console.log(`      ${result.error}\n`);
    continue;
  }
  const { attributes } = result;
  console.log(`OK    ${row.brand} · ${row.name}`);
  console.log(`      image=${result.used_image}  gender=${attributes.gender} (${attributes.gender_confidence})`);
  console.log(
    `      fit=${attributes.fit} (${attributes.fit_confidence})  silhouette=${attributes.silhouette} (${attributes.silhouette_confidence})`,
  );
  console.log(
    `      style=${attributes.style_tags.join(', ') || '—'} (${attributes.style_confidence})  formality=${attributes.formality}`,
  );
  console.log(
    `      aesthetic=${attributes.aesthetic_tags.join(', ') || '—'}  season=${attributes.season_tags.join(', ') || '—'}`,
  );
  console.log(
    `      pattern=${attributes.pattern}  material=${attributes.material}  subcategory=${attributes.subcategory}\n`,
  );
}
