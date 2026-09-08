/**
 * Stage 4 auth + saved outfits smoke test.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error('Missing Supabase env');
  process.exit(1);
}

const email = `styli.stage4.${Date.now()}@example.com`;
const password = 'styli-pass-123';

const supabase = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function generateOutfit() {
  const response = await fetch(`${url}/functions/v1/generate-outfit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anon}`,
      apikey: anon,
    },
    body: JSON.stringify({
      style: 'Streetwear',
      occasion: 'Date',
      budget: 100,
    }),
  });
  const data = await response.json();
  assert(response.ok && !data.error, `generate failed: ${data.error || response.status}`);
  assert(Number(data.total_price) <= 100, 'generated outfit over budget');
  return data;
}

async function main() {
  console.log('1) Create account');
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  });
  assert(!signUpError, signUpError?.message || 'signup failed');
  assert(signUpData.user?.id, 'missing user id');
  const userId = signUpData.user.id;
  console.log('   user', userId);

  console.log('2) Generate outfit');
  const generated = await generateOutfit();
  console.log('   total', generated.total_price, 'items', generated.items.length);

  console.log('3) Save outfit');
  const { data: outfitRow, error: outfitError } = await supabase
    .from('outfits')
    .insert({
      user_id: userId,
      outfit_name: generated.outfit_name,
      style: 'Streetwear',
      occasion: 'Date',
      budget: 100,
      total_price: generated.total_price,
      styling_tip: generated.styling_tip,
    })
    .select('id')
    .single();
  assert(!outfitError && outfitRow?.id, outfitError?.message || 'outfit insert failed');

  const { error: itemsError } = await supabase.from('outfit_items').insert(
    generated.items.map((item) => ({
      outfit_id: outfitRow.id,
      product_id: item.product_id,
      reason: item.reason,
    })),
  );
  assert(!itemsError, itemsError?.message || 'outfit_items insert failed');
  console.log('   saved', outfitRow.id);

  console.log('4) Close/reopen session (sign in again)');
  await supabase.auth.signOut();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  assert(!signInError, signInError?.message || 'signin failed');

  console.log('5) View saved outfit');
  const { data: listed, error: listError } = await supabase
    .from('outfits')
    .select(
      `
      id,
      outfit_name,
      total_price,
      outfit_items (
        reason,
        product_id,
        products (id, name, image_url, price)
      )
    `,
    )
    .order('created_at', { ascending: false });
  assert(!listError, listError?.message || 'list failed');
  assert(listed?.some((row) => row.id === outfitRow.id), 'saved outfit missing after reopen');
  console.log('   listed', listed.length);

  console.log('6) Delete saved outfit');
  const { error: deleteError } = await supabase
    .from('outfits')
    .delete()
    .eq('id', outfitRow.id);
  assert(!deleteError, deleteError?.message || 'delete failed');
  const { data: afterDelete } = await supabase
    .from('outfits')
    .select('id')
    .eq('id', outfitRow.id);
  assert(!afterDelete?.length, 'outfit still present after delete');

  console.log('7) Sign out');
  const { error: signOutError } = await supabase.auth.signOut();
  assert(!signOutError, signOutError?.message || 'signout failed');
  const { data: sessionData } = await supabase.auth.getSession();
  assert(!sessionData.session, 'session still active after sign out');

  console.log('STAGE4_TEST_OK');
}

main().catch((err) => {
  console.error('STAGE4_TEST_FAIL', err);
  process.exit(1);
});
