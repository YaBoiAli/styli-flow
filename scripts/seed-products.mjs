/**
 * Upsert seed products using the service-role key (server/dev only).
 * Never ship SUPABASE_SERVICE_ROLE_KEY to the mobile app.
 *
 * Usage: node --env-file=.env scripts/seed-products.mjs
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey || serviceKey === 'your-service-role-key') {
  console.error('Set EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const products = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'product-seed.json'), 'utf8'),
);

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const chunkSize = 50;
for (let i = 0; i < products.length; i += chunkSize) {
  const chunk = products.slice(i, i + chunkSize);
  const { error } = await supabase.from('products').upsert(chunk, { onConflict: 'id' });
  if (error) {
    console.error('Seed failed:', error.message);
    process.exit(1);
  }
  console.log(`Upserted ${Math.min(i + chunkSize, products.length)} / ${products.length}`);
}

console.log(`SEED_OK (${products.length} products)`);
