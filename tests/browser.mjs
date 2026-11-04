import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { assertNoHorizontalClipping, lockedContext, origin, seedPhone, stopPreview, waitForPreview } from './browserHelpers.mjs';

let browser;
try {
  await waitForPreview();
  browser = await chromium.launch({ headless: true });
  const context = await lockedContext(browser);
  // The scheduler picks the next workout from the calendar, so pin the clock to a Monday: Week 1 Day 1 is then
  // always "next", whatever day this test runs. Timers keep running; only Date is fixed.
  await context.clock.setFixedTime(new Date('2024-05-13T09:00:00'));
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
  for (const [index, value] of ['200', '180', '300', '120'].entries()) await tmInputs.nth(index).fill(value);
  await block1.getByRole('button', { name: /Save/ }).click();
  await page.getByText('Block 1 TMs confirmed').waitFor();
  await assertNoHorizontalClipping(page, 'Program screen');

  await page.getByRole('button', { name: 'Today' }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByText('Workout in progress').waitFor();
  await page.getByLabel('Swap Single Leg Press').selectOption('bulgarian-split-squat');
  await page.getByRole('heading', { name: 'Bulgarian Split Squat' }).waitFor();
  await page.getByText('Swapped from Single Leg Press').waitFor();
  // Main lifts swap too: same sets and warm-up ramp, different exercise, and it can be switched back before logging.
  await page.getByLabel('Swap Back Squat').selectOption('belted-squat');
  const belted = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Belted Squat' }) });
  await belted.getByText('Swapped from Back Squat').waitFor();
  await belted.getByText('Warm-up').waitFor();
  // A swapped main lift never borrows the program lift's training max: with none of its own it asks for one,
  // and the warm-up ramp shrinks to the empty bar until a max is entered.
  await belted.getByText(/Set your own training max for Belted Squat/).waitFor();
  assert.equal(await belted.getByRole('checkbox').count(), 1, 'without its own training max a swapped main lift only warms up with the bar');
  await page.getByLabel('Swap Back Squat').selectOption('');
  await page.getByRole('heading', { name: 'Back Squat' }).waitFor();
  const squat = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Back Squat' }) });
  // The workbook leaves "Find 10RM" to the lifter; the app suggests a starting load from the TM and a T1 warm-up ramp.
  await squat.getByText(/Suggested from your training max/).waitFor();
  assert.equal(await squat.locator('input[type="number"]').first().inputValue(), '160', 'RM set is suggested from the squat TM');
  await squat.getByText('Warm-up').waitFor();
  assert.equal(await squat.getByRole('checkbox').count(), 4, 'standard ramp has four steps');
  await squat.getByRole('checkbox').first().click();
  assert.equal(await squat.getByRole('checkbox').first().getAttribute('aria-checked'), 'true');
  assert.equal(await page.locator('section').filter({ has: page.getByRole('heading', { name: '2" Deficit Deadlift' }) }).getByRole('checkbox').count(), 0, 'only the T1 lift has warm-ups');
  const firstLog = squat.getByRole('button', { name: 'Log set' }).first();
  const firstRow = firstLog.locator('..').locator('..');
  await firstRow.locator('input').nth(0).fill('180');
  await firstLog.click();
  await page.getByText('10 reps @ 180 lb').waitFor();

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('Workout in progress').waitFor();
  await page.getByText('10 reps @ 180 lb').waitFor();
  assert.equal(await squat.getByRole('checkbox', { includeHidden: true }).first().getAttribute('aria-checked'), 'true', 'ticked warm-up steps survive a reload (the list collapses once the RM set is logged)');

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
  await page.getByRole('heading', { name: 'Progress analytics' }).waitFor();
  assert.equal(await page.getByRole('radio', { name: '12 weeks' }).getAttribute('aria-checked'), 'true', 'analytics opens on the cycle-sized range');
  await page.getByRole('heading', { name: 'Training activity' }).waitFor();
  await page.getByRole('heading', { name: 'Training trends' }).waitFor();
  await page.getByRole('heading', { name: 'Training insights' }).waitFor();
  await page.getByRole('radio', { name: '4 weeks' }).click();
  assert.equal(await page.getByRole('radio', { name: '4 weeks' }).getAttribute('aria-checked'), 'true');
  await page.getByRole('radio', { name: 'Volume', exact: true }).click();
  await page.getByText('Completed-workout volume by calendar week').waitFor();
  await page.getByText('Week 1 · Day 1').waitFor();
  await page.getByText('completed', { exact: true }).waitFor();
  await assertNoHorizontalClipping(page, 'Progress screen');

  // Together tab: your own row shows (the other local profile is hidden by the lock), and with no backend configured the pairing panel says so.
  await page.getByRole('button', { name: 'Together' }).click();
  await page.getByRole('heading', { name: 'Leaderboard' }).waitFor();
  await page.getByText('Partner sync is not set up').waitFor();
  assert.ok(await page.getByText('Lauren').count() >= 1, 'Together shows your own row');
  assert.equal(await page.getByText('Luis').count(), 0, 'the other local profile is hidden once the phone is locked');
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
  const avatarContext = await lockedContext(browser);
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
  // Choosing a photo also makes the tiny thumbnail that partners receive.
  const thumb = await avatarPage.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('JackedAndTan2_LocalDB');
    open.onsuccess = () => {
      const request = open.result.transaction('profiles').objectStore('profiles').getAll();
      request.onsuccess = () => resolve(request.result.find((p) => p.id === 'partner-1')?.avatar?.thumb ?? null);
      request.onerror = () => reject(request.error);
    };
    open.onerror = () => reject(open.error);
  }));
  assert.match(thumb, /^data:image\/jpeg;base64,/, 'a partner thumbnail is saved with the photo');
  assert.ok(thumb.length < 5_500, `the thumbnail is small enough to share (${thumb.length} chars)`);
  const stored = await avatarPage.locator('img[alt="Lauren\'s profile photo"]').first().getAttribute('src');
  assert.match(stored, /^data:image\/jpeg;base64,/, 'photo is stored as a small JPEG data URL');
  assert.ok(stored.length < 80_000, 'stored photo is small');
  await avatarPage.reload({ waitUntil: 'networkidle' });
  await avatarPage.locator('header img').first().waitFor();
  await avatarPage.getByRole('button', { name: 'Settings' }).click();
  await avatarPage.getByRole('button', { name: 'Remove photo' }).click();
  await avatarPage.getByText('Photo removed.').waitFor();
  await avatarPage.locator('header img').first().waitFor({ state: 'detached' });
  assert.equal(await avatarPage.locator('header img').count(), 0, 'initials return after removing the photo');
  await avatarContext.close();

  // Per-profile themes: Lauren's phone is lavender, Luis's phone is blue, and a choice in Settings applies and persists.
  const themeState = (p) => p.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    accent: getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim(),
    chrome: document.querySelector('meta[name="theme-color"]').getAttribute('content'),
    background: getComputedStyle(document.body).backgroundColor,
  }));
  const picks = ({ theme, accent, chrome }) => ({ theme, accent, chrome });
  const themeContext = await lockedContext(browser, 'partner-1');
  const themePage = await themeContext.newPage();
  await themePage.goto(origin, { waitUntil: 'networkidle' });
  await themePage.getByText('Next scheduled session').waitFor();
  assert.deepEqual(picks(await themeState(themePage)), { theme: 'lavender', accent: '#7b4fc4', chrome: '#f3eff9' });
  assert.equal(await themePage.getByRole('button', { name: 'Luis' }).count(), 0, 'a locked phone has no profile switcher');
  await themePage.getByRole('button', { name: 'Settings' }).click();
  await themePage.getByRole('radio', { name: 'Vermilion' }).click();
  await themePage.waitForFunction(() => document.documentElement.dataset.theme === 'vermilion');
  assert.equal((await themeState(themePage)).accent, '#d63d16');
  // The saved theme is applied before the app renders, so a reload never flashes the default colors.
  await themePage.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(await themePage.evaluate(() => document.documentElement.dataset.theme), 'vermilion', 'theme is set before first paint');
  await themePage.waitForSelector('header');
  assert.equal((await themeState(themePage)).theme, 'vermilion', 'the choice persists across reloads');
  await themeContext.close();

  const luisContext = await lockedContext(browser, 'partner-2');
  const luisPage = await luisContext.newPage();
  await luisPage.goto(origin, { waitUntil: 'networkidle' });
  await luisPage.getByText('Next scheduled session').waitFor();
  assert.deepEqual(picks(await themeState(luisPage)), { theme: 'blue', accent: '#1f5fbf', chrome: '#eef2f7' });
  assert.equal((await themeState(luisPage)).background, 'rgb(238, 242, 247)', 'page background follows the theme');
  assert.equal(await luisPage.getByLabel('Signed in as Luis').count(), 1);
  await luisContext.close();

  // Who uses this phone: asked once, then locked ("Lauren is Lauren"); switching needs a confirmation.
  const askContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await seedPhone(askContext, null);
  const ask = await askContext.newPage();
  ask.on('dialog', (dialog) => dialog.accept());
  await ask.goto(origin, { waitUntil: 'networkidle' });
  await ask.getByRole('heading', { name: 'Who uses this phone?' }).waitFor();
  assert.equal(await ask.getByRole('navigation', { name: 'Primary navigation' }).count(), 0, 'nothing else opens until you choose');
  await assertNoHorizontalClipping(ask, 'Who uses this phone');
  await ask.getByRole('button', { name: /Luis/ }).click();
  await ask.getByText('Next scheduled session').waitFor();
  assert.equal((await themeState(ask)).theme, 'blue', 'choosing Luis applies Luis\'s theme');
  assert.equal(await ask.getByRole('button', { name: 'Lauren' }).count(), 0, 'the other profile is not reachable');
  await ask.reload({ waitUntil: 'networkidle' });
  await ask.getByText('Next scheduled session').waitFor();
  assert.equal(await ask.getByLabel('Signed in as Luis').count(), 1, 'the lock survives a reload');
  await ask.getByRole('button', { name: 'Settings' }).click();
  await ask.getByText("Luis's phone").waitFor();
  await ask.getByRole('button', { name: 'Switch who uses this phone' }).click();
  await ask.getByRole('heading', { name: 'Who uses this phone?' }).waitFor();
  await ask.getByRole('button', { name: /Lauren/ }).click();
  await ask.getByLabel('Signed in as Lauren').waitFor();
  assert.equal((await themeState(ask)).theme, 'lavender');
  await askContext.close();

  // Coach card, a partial workout, and your own stats showing on Together right away (no partner needed).
  const partialContext = await lockedContext(browser);
  const pp = await partialContext.newPage();
  pp.on('dialog', (dialog) => dialog.accept());
  await pp.goto(origin, { waitUntil: 'networkidle' });
  await pp.getByText('Coach', { exact: true }).waitFor();
  await pp.getByRole('button', { name: 'Dismiss coach message' }).click();
  await pp.getByText('Coach', { exact: true }).waitFor({ state: 'detached' });
  await pp.reload({ waitUntil: 'networkidle' });
  await pp.getByText('Next scheduled session').waitFor();
  assert.equal(await pp.getByText('Coach', { exact: true }).count(), 0, 'a dismissed coach message stays dismissed');

  await pp.getByRole('button', { name: 'Program' }).click();
  const pBlock1 = pp.locator('section').filter({ has: pp.getByRole('heading', { name: 'Block 1 training maxes' }) });
  await pBlock1.getByRole('button', { name: /Edit/ }).click();
  for (const [index, value] of ['200', '180', '300', '120'].entries()) await pBlock1.locator('input[type="number"]').nth(index).fill(value);
  await pBlock1.getByRole('button', { name: /Save/ }).click();
  await pp.getByText('Block 1 TMs confirmed').waitFor();
  await pp.getByRole('button', { name: 'Today' }).click();
  await pp.getByRole('button', { name: 'Start workout' }).click();
  await pp.getByText('Workout in progress').waitFor();
  for (let i = 0; i < 2; i += 1) {
    const logButton = pp.getByRole('button', { name: 'Log set' }).first();
    await logButton.click();
    await pp.waitForTimeout(250);
  }
  await pp.getByRole('button', { name: 'Finish' }).click();
  const partialSummary = pp.getByRole('dialog', { name: 'Workout summary' });
  await partialSummary.waitFor();
  await partialSummary.getByText('Partial workout saved').first().waitFor();
  await partialSummary.getByText(/of a session toward your weekly goal/).waitFor();
  assert.equal(await partialSummary.getByText('New personal best!').count(), 0, 'a partial workout is not celebrated');
  await pp.keyboard.press('Escape');
  await pp.getByRole('button', { name: 'Together' }).click();
  const ownRow = pp.getByRole('row').filter({ hasText: 'Lauren' });
  await ownRow.waitFor();
  assert.match(await ownRow.innerText(), /\b[1-9]\d?%/, 'the partial workout counts toward weekly compliance on the leaderboard immediately');
  await pp.getByText('How the score is built').waitFor();
  await pp.getByText('1 session (1 partial)').waitFor();
  assert.equal(await pp.getByRole('row').filter({ hasText: 'Luis' }).count(), 0, 'the other local profile never appears on Lauren\'s phone');
  await partialContext.close();

  // Calendar: drag-and-drop rescheduling with a fixed clock. The plan is created on a Monday (2024-05-13),
  // then two days pass without training, so Day 1 and Day 2 are genuinely missed on Wednesday.
  const calContext = await lockedContext(browser);
  await calContext.clock.setFixedTime(new Date(2024, 4, 13, 12));
  const cal = await calContext.newPage();
  cal.on('dialog', (dialog) => dialog.accept());
  const rowOf = (date) => cal.locator(`li[data-date="${date}"]`);
  const readRow = async (date) => (await rowOf(date).locator('[data-slot]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-slot'))));
  // The calendar fills in just after its heading appears, so wait (briefly) for a row to settle before judging it.
  const dayOnRow = async (date) => {
    let rows = await readRow(date);
    for (let attempt = 0; attempt < 25 && rows.length === 0; attempt += 1) {
      await cal.waitForTimeout(200);
      rows = await readRow(date);
    }
    return rows;
  };
  const dragSlot = async (slot, date) => {
    const card = cal.locator(`[data-slot="${slot}"]`);
    await card.scrollIntoViewIfNeeded();
    const from = await card.boundingBox();
    const target = rowOf(date);
    await target.scrollIntoViewIfNeeded();
    const to = await target.boundingBox();
    const fromBox = await card.boundingBox();
    await cal.mouse.move(fromBox.x + 40, fromBox.y + fromBox.height / 2);
    await cal.mouse.down();
    await cal.mouse.move(fromBox.x + 46, fromBox.y + fromBox.height / 2 + 6, { steps: 2 });
    await cal.mouse.move(to.x + 60, to.y + to.height / 2, { steps: 8 });
    await cal.mouse.up();
    void from;
  };

  await cal.goto(origin, { waitUntil: 'networkidle' });
  await cal.getByText('Next scheduled session').waitFor();
  assert.equal(await cal.getByText(/missed workout/).count(), 0, 'a brand-new plan has nothing missed');
  await calContext.clock.setFixedTime(new Date(2024, 4, 15, 12));
  await cal.reload({ waitUntil: 'networkidle' });
  await cal.getByRole('button', { name: 'Program' }).click();
  await cal.getByRole('heading', { name: 'Schedule' }).waitFor();
  await assertNoHorizontalClipping(cal, 'Program calendar');
  // Month view: every workout is one dot on its day, and tapping a day shows that week in the list below.
  await cal.getByRole('heading', { name: 'May 2024' }).waitFor();
  assert.equal(await cal.locator('[data-day="2024-05-13"]').getAttribute('aria-label'), 'Mon May 13: Day 1 Back Squat, missed');
  assert.match(await cal.locator('[data-day="2024-05-16"]').getAttribute('aria-label') ?? '', /Thu May 16: Day 3 Back Squat, planned/);
  assert.equal(await cal.locator('[data-day="2024-05-15"]').getAttribute('aria-current'), 'date');
  assert.equal(await cal.locator('[data-day="2024-05-15"]').getAttribute('aria-label'), 'Wed May 15, rest day');
  await cal.getByRole('button', { name: 'Next month' }).click();
  await cal.getByRole('heading', { name: 'June 2024' }).waitFor();
  assert.match(await cal.locator('[data-day="2024-06-03"]').getAttribute('aria-label') ?? '', /Day 1 Back Squat, planned/);
  await cal.locator('[data-day="2024-06-03"]').click();
  await cal.locator('li[data-date="2024-06-03"]').waitFor();
  assert.deepEqual(await dayOnRow('2024-06-03'), ['W4D1'], 'tapping a day in June shows that week below');
  await cal.getByRole('button', { name: 'Current month' }).click();
  await cal.getByRole('heading', { name: 'May 2024' }).waitFor();
  await cal.locator('li[data-date="2024-05-13"]').waitFor();
  await assertNoHorizontalClipping(cal, 'Month calendar');
  assert.deepEqual(await dayOnRow('2024-05-13'), ['W1D1'], 'Day 1 on Monday');
  assert.deepEqual(await dayOnRow('2024-05-14'), ['W1D2'], 'Day 2 on Tuesday');
  assert.deepEqual(await dayOnRow('2024-05-16'), ['W1D3'], 'Day 3 on Thursday');
  assert.deepEqual(await dayOnRow('2024-05-17'), ['W1D4'], 'Day 4 on Friday');
  assert.match(await cal.locator('[data-slot="W1D1"]').innerText(), /Missed/, 'a past workout is flagged missed');
  assert.match(await cal.locator('[data-slot="W1D3"]').innerText(), /Legs/);

  // Drag Day 3 from Thursday to Saturday with the mouse; it persists across a reload.
  await dragSlot('W1D3', '2024-05-18');
  await cal.getByText('Moved Day 3 to Saturday.').waitFor();
  assert.deepEqual(await dayOnRow('2024-05-18'), ['W1D3']);
  assert.deepEqual(await dayOnRow('2024-05-16'), []);
  await cal.reload({ waitUntil: 'networkidle' });
  await cal.getByRole('button', { name: 'Program' }).click();
  assert.deepEqual(await dayOnRow('2024-05-18'), ['W1D3'], 'the move survives a reload');

  // Dropping on an occupied day swaps the two workouts.
  await dragSlot('W1D4', '2024-05-18');
  await cal.getByText('Swapped Day 4 with Day 3.').waitFor();
  assert.deepEqual(await dayOnRow('2024-05-18'), ['W1D4']);
  assert.deepEqual(await dayOnRow('2024-05-17'), ['W1D3']);

  // A past day is not a drop target.
  await dragSlot('W1D3', '2024-05-14');
  assert.deepEqual(await dayOnRow('2024-05-17'), ['W1D3'], 'nothing moves onto a day that has passed');

  // The Move sheet does the same thing without dragging, and works from the keyboard.
  await cal.getByRole('button', { name: 'Move Week 1 Day 1' }).click();
  const sheet = cal.getByRole('dialog', { name: 'Move workout' });
  await sheet.waitFor();
  assert.equal(await sheet.getByRole('radio', { name: /Mon May 13/ }).isDisabled(), true, 'past days cannot be chosen');
  await sheet.getByRole('radio', { name: /Wed May 15/ }).click();
  await sheet.waitFor({ state: 'detached' });
  assert.deepEqual(await dayOnRow('2024-05-15'), ['W1D1'], 'a missed workout can move to today');
  await cal.getByRole('button', { name: 'Move Week 1 Day 2' }).focus();
  await cal.keyboard.press('Enter');
  await cal.getByRole('dialog', { name: 'Move workout' }).waitFor();
  await cal.keyboard.press('Escape');
  await cal.getByRole('dialog', { name: 'Move workout' }).waitFor({ state: 'detached' });

  // Today shows the scheduled workout and offers to move it.
  await cal.getByRole('button', { name: 'Today' }).click();
  await cal.getByText('Day 1 — Back Squat').first().waitFor();
  await cal.getByRole('button', { name: /Move this workout/ }).waitFor();
  await cal.getByRole('button', { name: "This week's schedule. Open the calendar." }).waitFor();

  // Two weeks later the plan is behind; one tap re-dates it to this week.
  await calContext.clock.setFixedTime(new Date(2024, 4, 29, 12));
  await cal.reload({ waitUntil: 'networkidle' });
  await cal.getByRole('button', { name: 'Program' }).click();
  await cal.getByText(/You're 2 weeks behind/).waitFor();
  await cal.getByRole('button', { name: 'Move plan to this week' }).click();
  await cal.getByText('Plan moved to this week.').waitFor();
  await cal.getByText(/weeks? behind/).waitFor({ state: 'detached' });
  assert.deepEqual(await dayOnRow('2024-05-29'), ['W1D1'], 'Day 1 lands today, not in the past');
  assert.equal(await cal.locator('[data-slot]').filter({ hasText: 'Missed' }).count(), 0, 'nothing is missed after catching up');
  await calContext.close();

  // Out of order: do Day 3 first from the Move sheet; Day 1 stays the program's next workout.
  const oooContext = await lockedContext(browser);
  await oooContext.clock.setFixedTime(new Date(2024, 4, 13, 12)); // Monday
  const ooo = await oooContext.newPage();
  ooo.on('dialog', (dialog) => dialog.accept());
  await ooo.goto(origin, { waitUntil: 'networkidle' });
  await ooo.getByRole('button', { name: 'Program' }).click();
  const oooBlock1 = ooo.locator('section').filter({ has: ooo.getByRole('heading', { name: 'Block 1 training maxes' }) });
  await oooBlock1.getByRole('button', { name: /Edit/ }).click();
  for (const [index, value] of ['200', '180', '300', '120'].entries()) await oooBlock1.locator('input[type="number"]').nth(index).fill(value);
  await oooBlock1.getByRole('button', { name: /Save/ }).click();
  await ooo.getByText('Block 1 TMs confirmed').waitFor();
  await ooo.getByRole('button', { name: 'Move Week 1 Day 3' }).click();
  await ooo.getByRole('dialog', { name: 'Move workout' }).getByRole('button', { name: 'Start now' }).click();
  await ooo.getByText('Workout in progress').waitFor();
  await ooo.getByRole('heading', { name: 'Week 1 · Day 3' }).waitFor();
  for (let guard = 0; guard < 80; guard += 1) {
    const logButtons = ooo.getByRole('button', { name: 'Log set' });
    if (await logButtons.count() === 0) break;
    const button = logButtons.first();
    const inputs = button.locator('..').locator('..').locator('input');
    if (!(await inputs.nth(0).inputValue())) await inputs.nth(0).fill('100');
    if (!(await inputs.nth(1).inputValue())) await inputs.nth(1).fill('5');
    await button.click();
  }
  await ooo.getByRole('button', { name: 'Finish' }).click();
  const oooSummary = ooo.getByRole('dialog', { name: 'Workout summary' });
  await oooSummary.waitFor();
  await ooo.keyboard.press('Escape');
  await ooo.getByRole('button', { name: 'Settings' }).click();
  await ooo.getByText(/Week 1 · Day 1 · lb/).waitFor(); // the saved position is still the first workout not done
  await ooo.getByRole('button', { name: 'Program' }).click();
  assert.match(await ooo.locator('[data-slot="W1D3"]').innerText(), /Done/, 'Day 3 shows as done');
  assert.equal(await ooo.getByRole('button', { name: 'Move Week 1 Day 3' }).count(), 0, 'finished workouts cannot be moved');
  assert.equal(await ooo.locator('[data-slot="W1D1"]').count(), 1, 'Day 1 is still planned');
  await oooContext.close();

  // iPhone install instructions must be fully on screen (the header's backdrop-blur once clipped them).
  const iosContext = await lockedContext(browser, 'partner-1', {
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
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await stopPreview();
  // Exit explicitly: a lingering handle must never keep a finished test run alive (CI would wait for the job limit).
  process.exit(process.exitCode ?? 0);
}
