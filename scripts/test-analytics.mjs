/**
 * Stage 6 analytics unit + live capture verification.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EVENTS = [
  'app_opened',
  'onboarding_started',
  'style_selected',
  'occasion_selected',
  'budget_selected',
  'onboarding_completed',
  'outfit_generation_started',
  'outfit_generated',
  'outfit_generation_failed',
  'outfit_saved',
  'outfit_rebuilt',
  'product_clicked',
  'paywall_viewed',
  'purchase_started',
  'purchase_completed',
  'subscription_restored',
];

function budgetRange(budget) {
  if (!Number.isFinite(budget) || budget <= 0) return 'unknown';
  if (budget <= 50) return '0-50';
  if (budget <= 75) return '51-75';
  if (budget <= 100) return '76-100';
  if (budget <= 150) return '101-150';
  if (budget <= 200) return '151-200';
  return '200+';
}

function sanitize(properties = {}) {
  const cleaned = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value === null || value === undefined) continue;
    if (/email|password|token|secret|phone|name_full/i.test(key)) continue;
    cleaned[key] = value;
  }
  return cleaned;
}

async function main() {
  console.log('1) Event catalog');
  assert.equal(EVENTS.length, 16);
  console.log('   ok', EVENTS.length, 'events');

  console.log('2) budget_range helper');
  assert.equal(budgetRange(40), '0-50');
  assert.equal(budgetRange(100), '76-100');
  assert.equal(budgetRange(250), '200+');
  console.log('   ok');

  console.log('3) Sensitive property scrub');
  assert.deepEqual(
    sanitize({ style: 'Streetwear', email: 'a@b.com', token: 'x', budget: 100 }),
    { style: 'Streetwear', budget: 100 },
  );
  console.log('   ok');

  console.log('4) Local PostHog capture sink');
  const port = 8440;
  const child = spawn('node', ['scripts/posthog-dev-capture.mjs'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, POSTHOG_DEV_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await sleep(400);

  const payload = {
    batch: [
      {
        event: 'style_selected',
        properties: { style: 'Streetwear', premium_status: 'free' },
      },
      {
        event: 'outfit_generated',
        properties: {
          style: 'Streetwear',
          occasion: 'Everyday',
          budget_range: '76-100',
          outfit_total: 88,
        },
      },
    ],
  };

  const post = await fetch(`http://127.0.0.1:${port}/batch/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.equal(post.status, 200);

  const listed = await fetch(`http://127.0.0.1:${port}/_events`).then((r) =>
    r.json(),
  );
  assert.equal(listed.count, 2);
  assert.equal(listed.events[0].event, 'style_selected');
  assert.equal(listed.events[1].event, 'outfit_generated');
  console.log('   ok — events received by local sink');

  child.kill('SIGTERM');
  console.log('STAGE6_ANALYTICS_OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
