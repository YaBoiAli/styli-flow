/**
 * Stage 6 browser verification: analytics console + local PostHog sink.
 */
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';

const BASE = process.env.STYLI_WEB_URL || 'http://127.0.0.1:43123';
const SINK = process.env.POSTHOG_SINK_URL || 'http://127.0.0.1:8439';
const CHROME = process.env.CHROME_PATH || '/opt/google/chrome/chrome';

async function waitForTestId(page, testId, timeout = 20000) {
  await page.waitForSelector(`[data-testid="${testId}"]`, { timeout });
}

async function clickTestId(page, testId) {
  await waitForTestId(page, testId);
  await page.$eval(`[data-testid="${testId}"]`, (el) => el.click());
}

async function main() {
  const before = await fetch(`${SINK}/_events`).then((r) => r.json());
  const beforeCount = before.count ?? 0;

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--window-size=390,844'],
    defaultViewport: { width: 390, height: 844 },
  });
  const page = await browser.newPage();
  const consoleEvents = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[analytics]')) {
      consoleEvents.push(text);
    }
  });

  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 90000 });
  await page.waitForFunction(
    () => document.body?.innerText?.includes('Get Started'),
    { timeout: 30000 },
  );
  await clickTestId(page, 'btn-get-started');
  await waitForTestId(page, 'style-card-Streetwear');
  await clickTestId(page, 'style-card-Streetwear');
  await clickTestId(page, 'btn-continue-style');
  await clickTestId(page, 'option-card-Everyday');
  await clickTestId(page, 'btn-continue-occasion');
  await clickTestId(page, 'budget-preset-100');
  await clickTestId(page, 'btn-build-fit');

  await page.waitForFunction(
    () => {
      const t = document.body?.innerText || '';
      return t.includes('Shop this fit') || t.includes("Couldn't lock the fit");
    },
    { timeout: 60000 },
  );

  // Allow PostHog flush
  await new Promise((r) => setTimeout(r, 2500));

  await browser.close();

  const logged = consoleEvents.join('\n');
  for (const name of [
    'app_opened',
    'onboarding_started',
    'style_selected',
    'occasion_selected',
    'budget_selected',
    'onboarding_completed',
    'outfit_generation_started',
  ]) {
    assert.ok(logged.includes(name), `missing console event ${name}`);
  }

  const after = await fetch(`${SINK}/_events`).then((r) => r.json());
  assert.ok(
    after.count > beforeCount,
    `expected sink to receive events (before=${beforeCount}, after=${after.count})`,
  );
  const names = (after.events || []).map((e) => e.event);
  console.log('sink events sample:', names.slice(-12));
  console.log('console analytics lines:', consoleEvents.length);
  console.log('STAGE6_E2E_ANALYTICS_OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
