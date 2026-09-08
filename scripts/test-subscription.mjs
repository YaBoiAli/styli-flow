/**
 * Stage 5 subscription / quota smoke tests (no faked entitlement grants).
 * Real purchase requires EXPO_PUBLIC_REVENUECAT_API_KEY (Test Store).
 */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FREE_GENERATION_LIMIT = 3;
const PREMIUM_ENTITLEMENT_ID = 'premium';
const PREMIUM_STYLES = [
  'Runway',
  'Quiet Luxury',
  'Dark Academia',
  'Elevated Streetwear',
];

function hasPremiumEntitlement(info) {
  return Boolean(info?.entitlements?.active?.[PREMIUM_ENTITLEMENT_ID]);
}

function isPremiumStyle(style) {
  return PREMIUM_STYLES.includes(style);
}

/** File-backed quota store mirroring AsyncStorage behavior for Node tests. */
function createQuotaStore(root) {
  mkdirSync(root, { recursive: true });
  const pathFor = (userId) => join(root, `${userId ?? 'anonymous'}.txt`);

  return {
    async get(userId) {
      try {
        const raw = readFileSync(pathFor(userId), 'utf8');
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
      } catch {
        return 0;
      }
    },
    async increment(userId) {
      const next = (await this.get(userId)) + 1;
      writeFileSync(pathFor(userId), String(next));
      return next;
    },
    async canGenerate(isPremium, userId) {
      if (isPremium) {
        return { allowed: true, remaining: Number.POSITIVE_INFINITY, used: 0 };
      }
      const used = await this.get(userId);
      const remaining = Math.max(0, FREE_GENERATION_LIMIT - used);
      return { allowed: remaining > 0, remaining, used };
    },
  };
}

async function testFreeQuotaFlow() {
  const root = join(tmpdir(), `styli-quota-${Date.now()}`);
  const quota = createQuotaStore(root);
  const userId = 'anon-test';

  try {
    for (let i = 1; i <= FREE_GENERATION_LIMIT; i += 1) {
      const check = await quota.canGenerate(false, userId);
      assert.equal(check.allowed, true, `gen ${i} should be allowed`);
      await quota.increment(userId);
    }
    const blocked = await quota.canGenerate(false, userId);
    assert.equal(blocked.allowed, false, '4th generation must be blocked');
    assert.equal(blocked.used, FREE_GENERATION_LIMIT);

    const premiumAllowed = await quota.canGenerate(true, userId);
    assert.equal(premiumAllowed.allowed, true, 'premium bypasses quota');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function testEntitlementSourceOfTruth() {
  assert.equal(hasPremiumEntitlement(null), false);
  assert.equal(
    hasPremiumEntitlement({ entitlements: { active: {} } }),
    false,
  );
  assert.equal(
    hasPremiumEntitlement({
      entitlements: { active: { [PREMIUM_ENTITLEMENT_ID]: { identifier: 'premium' } } },
    }),
    true,
  );
  // Wrong entitlement id must not unlock premium
  assert.equal(
    hasPremiumEntitlement({
      entitlements: { active: { pro: { identifier: 'pro' } } },
    }),
    false,
  );
}

function testPremiumStyles() {
  assert.equal(isPremiumStyle('Streetwear'), false);
  assert.equal(isPremiumStyle('Runway'), true);
  assert.equal(isPremiumStyle('Quiet Luxury'), true);
}

async function testRevenueCatApiIfConfigured() {
  const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;
  if (!apiKey || apiKey.includes('YOUR_') || apiKey.startsWith('test_YOUR')) {
    console.log('4) RevenueCat live check skipped (no Test Store API key in .env)');
    return;
  }

  console.log('4) RevenueCat offerings via REST (public key sanity)');
  // Public SDK keys cannot call the secret REST API; hit the subscribers
  // endpoint only when a secret key is present.
  const secret = process.env.REVENUECAT_SECRET_API_KEY;
  if (!secret) {
    console.log('   public key present; secret key not set — SDK handles purchase in-app');
    assert.ok(apiKey.startsWith('test_') || apiKey.startsWith('appl_') || apiKey.startsWith('goog_') || apiKey.startsWith('rcb_'));
    return;
  }

  const response = await fetch('https://api.revenuecat.com/v1/subscribers/styli-stage5-smoke', {
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
  });
  assert.ok(response.ok || response.status === 404, `RC API status ${response.status}`);
  console.log('   RevenueCat API reachable');
}

async function main() {
  console.log('1) Free generation quota (3 → paywall gate)');
  await testFreeQuotaFlow();
  console.log('   ok');

  console.log('2) Entitlement is source of truth');
  testEntitlementSourceOfTruth();
  console.log('   ok');

  console.log('3) Premium styles marked');
  testPremiumStyles();
  console.log('   ok');

  await testRevenueCatApiIfConfigured();

  console.log('STAGE5_TEST_OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
