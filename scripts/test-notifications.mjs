/**
 * Stage 7 notifications smoke checks (no native OneSignal runtime required).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const EXAMPLES = [
  'New week, new fit 👀',
  'Going out tonight? Let Vibe build your fit.',
  'New seasonal styles just dropped.',
];

function main() {
  console.log('1) Notification service files exist');
  const web = readFileSync('lib/notifications.ts', 'utf8');
  const native = readFileSync('lib/notifications.native.ts', 'utf8');
  assert.ok(web.includes('maybeAskNotificationPermission'));
  assert.ok(native.includes('OneSignal.initialize'));
  assert.ok(native.includes('requestPermission(false)'));
  assert.ok(native.includes('ASKED_STORAGE_KEY') || native.includes('permissionAsked'));
  console.log('   ok');

  console.log('2) Example re-engagement copy present');
  for (const line of EXAMPLES) {
    assert.ok(native.includes(line), `missing: ${line}`);
  }
  console.log('   ok');

  console.log('3) Permission not requested on launch');
  const layout = readFileSync('app/_layout.tsx', 'utf8');
  assert.ok(layout.includes('initNotifications'));
  assert.ok(!layout.includes('maybeAskNotificationPermission'));
  assert.ok(!layout.includes('requestPermission'));
  const outfit = readFileSync('app/outfit.tsx', 'utf8');
  assert.ok(outfit.includes('maybeAskNotificationPermission'));
  console.log('   ok');

  console.log('4) Expo plugin + iOS push config');
  const appJson = JSON.parse(readFileSync('app.json', 'utf8'));
  const plugins = appJson.expo.plugins;
  assert.equal(plugins[0][0], 'onesignal-expo-plugin');
  assert.equal(plugins[0][1].mode, 'development');
  assert.deepEqual(appJson.expo.ios.infoPlist.UIBackgroundModes, [
    'remote-notification',
  ]);
  assert.equal(appJson.expo.ios.entitlements['aps-environment'], 'development');
  console.log('   ok');

  console.log('STAGE7_NOTIFICATIONS_OK');
}

main();
