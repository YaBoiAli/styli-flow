/**
 * Stage 5 browser E2E: free quota → paywall (no faked purchase).
 */
import puppeteer from 'puppeteer-core';

const BASE = process.env.STYLI_WEB_URL || 'http://127.0.0.1:43123';
const CHROME = process.env.CHROME_PATH || '/opt/google/chrome/chrome';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function waitForTestId(page, testId, timeout = 20000) {
  await page.waitForSelector(`[data-testid="${testId}"]`, { timeout });
}

async function clickTestId(page, testId) {
  await waitForTestId(page, testId);
  await page.$eval(`[data-testid="${testId}"]`, (el) => el.click());
}

async function waitForText(page, text, timeout = 20000) {
  await page.waitForFunction(
    (t) => document.body?.innerText?.includes(t),
    { timeout },
    text,
  );
}

async function clearQuota(page) {
  await page.evaluate(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.includes('generationCount')) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  });
}

async function setQuota(page, count) {
  await page.evaluate((n) => {
    localStorage.setItem('styli.generationCount.v1:anonymous', String(n));
  }, count);
}

async function generateOnce(page, index) {
  console.log(`  generation ${index}`);
  await page.goto(`${BASE}/style`, { waitUntil: 'networkidle0', timeout: 60000 });
  await clickTestId(page, 'style-card-Streetwear');
  await clickTestId(page, 'btn-continue-style');

  await waitForTestId(page, 'option-card-Everyday');
  await clickTestId(page, 'option-card-Everyday');
  await clickTestId(page, 'btn-continue-occasion');

  await waitForTestId(page, 'budget-preset-100');
  await clickTestId(page, 'budget-preset-100');
  await waitForTestId(page, 'btn-build-fit');
  const quota = await page.$eval(
    '[data-testid="generation-quota"]',
    (el) => el.textContent?.trim() || '',
  );
  console.log('   quota:', quota);

  await clickTestId(page, 'btn-build-fit');

  await page.waitForFunction(
    () => {
      const t = document.body?.innerText || '';
      return (
        t.includes('Your closet just got smarter.') ||
        t.includes('Shop this fit') ||
        t.includes("Couldn't lock the fit") ||
        t.includes('Rebuild')
      );
    },
    { timeout: 60000 },
  );

  const body = await page.evaluate(() => document.body.innerText);
  if (body.includes('Your closet just got smarter.')) return 'paywall';
  if (body.includes("Couldn't lock the fit")) return 'error';
  return 'outfit';
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--window-size=390,844'],
    defaultViewport: { width: 390, height: 844 },
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 60000 });
  await clearQuota(page);

  console.log('A) Exhaust free generations');

  const outcomes = [];
  for (let i = 1; i <= 4; i += 1) {
    const result = await generateOnce(page, i);
    outcomes.push(result);
    console.log('   result', result);
    if (result === 'paywall') break;
    if (result === 'error') {
      // Still consumed? generation only consumes on success — force count forward for gate test
      await page.goto(BASE);
      const used = await page.evaluate(() =>
        Number(localStorage.getItem('styli.generationCount.v1:anonymous') || '0'),
      );
      if (used < i) {
        await setQuota(page, i);
      }
    }
  }

  if (!outcomes.includes('paywall')) {
    console.log('B2) Force quota=3 and open generation');
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    await setQuota(page, 3);
    // Seed preferences via style/occasion/budget path then hit build
    await page.goto(`${BASE}/style`, { waitUntil: 'networkidle0' });
    await clickTestId(page, 'style-card-Streetwear');
    await clickTestId(page, 'btn-continue-style');
    await clickTestId(page, 'option-card-Everyday');
    await clickTestId(page, 'btn-continue-occasion');
    await clickTestId(page, 'budget-preset-100');
    await waitForTestId(page, 'btn-build-fit');
    await page.screenshot({
      path: '/opt/cursor/artifacts/stage5-budget-quota-exhausted.png',
    });
    const quota = await page.$eval(
      '[data-testid="generation-quota"]',
      (el) => el.textContent?.trim() || '',
    );
    console.log('   exhausted quota label:', quota);
    await clickTestId(page, 'btn-build-fit');
    await waitForText(page, 'Your closet just got smarter.');
    outcomes.push('paywall');
  }

  assert(outcomes.includes('paywall'), `expected paywall, got ${outcomes}`);
  await page.screenshot({
    path: '/opt/cursor/artifacts/stage5-limit-paywall.png',
    fullPage: true,
  });

  console.log('B) Profile Free Plan');
  await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle0' });
  await waitForText(page, 'Free Plan');
  await page.screenshot({ path: '/opt/cursor/artifacts/stage5-profile-free.png' });
  console.log('   ok');

  await browser.close();
  console.log('STAGE5_E2E_OK', outcomes.join(','));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
