/**
 * Verify Supabase/PostgREST product catalog connectivity.
 * Usage: node --env-file=.env scripts/verify-supabase.mjs
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error, count } = await supabase
  .from('products')
  .select('id,name,category,price,style_tags', { count: 'exact' })
  .limit(5);

if (error) {
  console.error('Supabase product fetch failed:', error.message);
  process.exit(1);
}

console.log('Supabase connection OK');
console.log(`Product count (exact): ${count}`);
console.log('Sample rows:');
console.log(JSON.stringify(data, null, 2));

if (!count || count < 100) {
  console.error(`Expected at least 100 products, found ${count ?? 0}`);
  process.exit(1);
}

console.log('VERIFY_OK');
