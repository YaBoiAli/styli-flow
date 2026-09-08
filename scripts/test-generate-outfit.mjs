/**
 * Stage 3 outfit generation tests.
 * Verifies required combos stay within budget and rebuild excludes prior IDs.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error('Missing Supabase env');
  process.exit(1);
}

const cases = [
  { style: 'Streetwear', occasion: 'Date', budget: 100 },
  { style: 'Y2K', occasion: 'Party', budget: 75 },
  { style: 'Minimalist', occasion: 'Work', budget: 150 },
];

async function generate(body) {
  const response = await fetch(`${url}/functions/v1/generate-outfit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anon}`,
      apikey: anon,
    },
    body: JSON.stringify({
      style: body.style,
      occasion: body.occasion,
      budget: body.budget,
      exclude_product_ids: body.exclude_product_ids ?? [],
    }),
  });
  const data = await response.json();
  if (!response.ok || data?.error) {
    throw new Error(`${data?.code || response.status}: ${data?.error || 'invoke failed'}`);
  }
  return data;
}

let failed = 0;

for (const testCase of cases) {
  process.stdout.write(
    `CASE ${testCase.style} + ${testCase.occasion} + $${testCase.budget} ... `,
  );
  try {
    const first = await generate(testCase);
    const total = Number(first.total_price);
    const ids = first.items.map((item) => item.product_id);
    const categories = first.items.map((item) => item.product.category);

    if (total > testCase.budget) {
      throw new Error(`over budget: ${total} > ${testCase.budget}`);
    }
    for (const required of ['bottom', 'shoes', 'top']) {
      if (!categories.includes(required)) {
        throw new Error(`missing ${required}`);
      }
    }

    const second = await generate({
      ...testCase,
      exclude_product_ids: ids,
    });
    const secondIds = second.items.map((item) => item.product_id);
    const overlap = secondIds.filter((id) => ids.includes(id));
    if (Number(second.total_price) > testCase.budget) {
      throw new Error(`rebuild over budget: ${second.total_price}`);
    }
    if (overlap.length === ids.length) {
      throw new Error('rebuild returned identical product set');
    }

    console.log(
      `OK total=$${total.toFixed(2)} items=${ids.length} rebuild_total=$${Number(
        second.total_price,
      ).toFixed(2)} overlap=${overlap.length}`,
    );
  } catch (err) {
    failed += 1;
    console.log('FAIL');
    console.error(err);
  }
}

if (failed) {
  console.error(`FAILED ${failed}/${cases.length}`);
  process.exit(1);
}

console.log('STAGE3_TEST_OK');
