import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const origin = 'http://127.0.0.1:4173';
const externalServer = process.env.JNT2_EXTERNAL_SERVER === '1';
const preview = externalServer ? null : spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'preview'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NO_COLOR: '1' },
});
let previewLog = '';
preview?.stdout.on('data', (chunk) => { previewLog += String(chunk); });
preview?.stderr.on('data', (chunk) => { previewLog += String(chunk); });

async function waitForPreview() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Production preview did not start.\n${previewLog}`);
}

async function assertNoHorizontalClipping(page, label) {
  const sizes = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.ok(sizes.document <= sizes.viewport + 1, `${label} clipped horizontally: ${JSON.stringify(sizes)}`);
}

let browser;
try {
  await waitForPreview();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });

  const response = await page.goto(origin, { waitUntil: 'networkidle' });
  assert.equal(response?.ok(), true);
  await page.getByText('Next scheduled session').waitFor();
  await assertNoHorizontalClipping(page, 'initial Today screen');

  await page.getByRole('button', { name: 'Program' }).click();
  const block1 = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Block 1 training maxes' }) });
  await block1.getByRole('button', { name: /Edit/ }).click();
  const tmInputs = block1.locator('input[type="number"]');
  for (const [index, value] of ['200', '180', '300', '120', '160'].entries()) await tmInputs.nth(index).fill(value);
  await block1.getByRole('button', { name: /Save/ }).click();
  await page.getByText('Block 1 TMs confirmed').waitFor();
  await assertNoHorizontalClipping(page, 'Program screen');

  await page.getByRole('button', { name: 'Today' }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByText('Workout in progress').waitFor();
  await page.getByLabel('Swap Single Leg Press').selectOption('hip-thrust');
  await page.getByRole('heading', { name: 'Hip Thrust' }).waitFor();
  await page.getByText('Swapped from Single Leg Press').waitFor();
  const squat = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Back Squat' }) });
  const firstLog = squat.getByRole('button', { name: 'Log set' }).first();
  const firstRow = firstLog.locator('..').locator('..');
  await firstRow.locator('input').nth(0).fill('180');
  await firstLog.click();
  await page.getByText('10 reps @ 180 lb').waitFor();

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('Workout in progress').waitFor();
  await page.getByText('10 reps @ 180 lb').waitFor();

  for (let guard = 0; guard < 80; guard += 1) {
    const buttons = page.getByRole('button', { name: 'Log set' });
    if (await buttons.count() === 0) break;
    const button = buttons.first();
    const row = button.locator('..').locator('..');
    const inputs = row.locator('input');
    if (!(await inputs.nth(0).inputValue())) await inputs.nth(0).fill('100');
    if (!(await inputs.nth(1).inputValue())) await inputs.nth(1).fill('5');
    await button.click();
  }
  assert.equal(await page.getByRole('button', { name: 'Log set' }).count(), 0, 'every populated Week 1 Day 1 set should be loggable');
  await page.getByRole('button', { name: 'Finish' }).click();
  const summary = page.getByRole('dialog', { name: 'Workout summary' });
  await summary.waitFor();
  await summary.getByText('Benchmark established').waitFor();
  assert.equal(await summary.getByText('New personal best!').count(), 0, 'a first session is never a personal best');
  await summary.getByText('First Rep').waitFor();
  await assertNoHorizontalClipping(page, 'Workout summary');
  const focusInside = () => page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
  assert.equal(await focusInside(), true, 'focus moves into the summary dialog');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  assert.equal(await focusInside(), true, 'Tab stays trapped inside the summary dialog');
  await page.keyboard.press('Escape');
  await summary.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Progress' }).click();
  await page.getByText('Week 1 · Day 1').waitFor();
  await page.getByText('completed', { exact: true }).waitFor();
  await assertNoHorizontalClipping(page, 'Progress screen');

  // Together tab: both local lifters render, the leaderboard lays out, and with no backend configured the pairing panel says so.
  await page.getByRole('button', { name: 'Together' }).click();
  await page.getByRole('heading', { name: 'Leaderboard' }).waitFor();
  await page.getByText('Partner sync is not set up').waitFor();
  assert.ok(await page.getByText('Lauren').count() >= 1 && await page.getByText('Luis').count() >= 1, 'Together shows both partners');
  await assertNoHorizontalClipping(page, 'Together screen');
  await page.getByRole('button', { name: 'Progress' }).click();

  const manifest = await context.request.get(`${origin}/manifest.webmanifest`);
  assert.equal(manifest.ok(), true);
  const manifestData = await manifest.json();
  assert.equal(manifestData.start_url, './');
  assert.ok(manifestData.icons.some((icon) => icon.sizes === '192x192'));
  assert.ok(manifestData.icons.some((icon) => icon.purpose === 'maskable'));
  const serviceWorker = await (await context.request.get(`${origin}/sw.js`)).text();
  assert.doesNotMatch(serviceWorker, /\/src\/main\.tsx/);
  assert.match(serviceWorker, /assets\/index-/);

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  const cacheNames = await page.evaluate(async () => caches.keys());
  assert.ok(cacheNames.some((name) => name.startsWith('jnt2-app-')));

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Next scheduled session').waitFor();
  await page.getByRole('button', { name: 'Start workout' }).click();
  const bench = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Bench Press' }) });
  const offlineLog = bench.getByRole('button', { name: 'Log set' }).first();
  const offlineRow = offlineLog.locator('..').locator('..');
  await offlineRow.locator('input').nth(0).fill('160');
  await offlineLog.click();
  await page.getByText('10 reps @ 160 lb').waitFor();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Workout in progress').waitFor();
  await page.getByText('10 reps @ 160 lb').waitFor();
  await assertNoHorizontalClipping(page, 'offline active workout');
  await context.setOffline(false);

  // Profile picture: upload a generated image, see it in the header, keep it across a reload, then remove it.
  const avatarContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const avatarPage = await avatarContext.newPage();
  await avatarPage.goto(origin, { waitUntil: 'networkidle' });
  await avatarPage.getByRole('button', { name: 'Settings' }).click();
  assert.equal(await avatarPage.locator('header img').count(), 0, 'initials show before a photo is added');
  await avatarPage.getByLabel('Choose a profile photo').evaluate(async (input) => {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 200;
    const context = canvas.getContext('2d');
    context.fillStyle = '#336699';
    context.fillRect(0, 0, 300, 200);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], 'me.png', { type: 'image/png' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await avatarPage.getByText('Photo saved on this device.').waitFor();
  await avatarPage.locator('header img').first().waitFor();
  const stored = await avatarPage.locator('img[alt="Lauren\'s profile photo"]').first().getAttribute('src');
  assert.match(stored, /^data:image\/jpeg;base64,/, 'photo is stored as a small JPEG data URL');
  assert.ok(stored.length < 80_000, 'stored photo is small');
  await avatarPage.reload({ waitUntil: 'networkidle' });
  await avatarPage.locator('header img').first().waitFor();
  await avatarPage.getByRole('button', { name: 'Settings' }).click();
  await avatarPage.getByRole('button', { name: 'Remove photo' }).click();
  await avatarPage.getByText('Photo removed.').waitFor();
  assert.equal(await avatarPage.locator('header img').count(), 0, 'initials return after removing the photo');
  await avatarContext.close();

  // iPhone install instructions must be fully on screen (the header's backdrop-blur once clipped them).
  const iosContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  });
  const iosPage = await iosContext.newPage();
  await iosPage.goto(origin, { waitUntil: 'networkidle' });
  await iosPage.getByRole('button', { name: 'Install' }).click();
  const iosDialog = iosPage.getByRole('dialog', { name: 'Install on iPhone or iPad' });
  await iosDialog.waitFor();
  for (const text of ['Open this page in', 'Tap the', 'Scroll down and choose', 'Open the app from your Home Screen']) {
    const box = await iosDialog.getByText(text).boundingBox();
    assert.ok(box && box.y >= 0 && box.y + box.height <= 844, `iOS install step "${text}" is cut off: ${JSON.stringify(box)}`);
  }
  await iosPage.keyboard.press('Escape');
  await iosDialog.waitFor({ state: 'detached' });
  await iosContext.close();

  assert.deepEqual(browserErrors, [], `browser console/page errors: ${browserErrors.join('\n')}`);
  console.log('PASS: production mobile-width workflow, refresh/resume, completion/history, and offline logging/reload.');
} finally {
  await browser?.close().catch(() => {});
  preview?.kill('SIGTERM');
}
