// Setup, cycles, recovery and notes flows. Each starts from its own fresh browser context, so they don't depend on
// the long workout flow in browser.mjs.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { assertNoHorizontalClipping, lockedContext, origin, stopPreview, waitForPreview } from './browserHelpers.mjs';

let browser;
try {
  await waitForPreview();
  browser = await chromium.launch({ headless: true });
  // A brand-new phone: the setup wizard runs, then lands on a first workout that is ready to start.
  const newContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await newContext.clock.setFixedTime(new Date('2024-05-13T09:00:00'));
  const fresh = await newContext.newPage();
  await fresh.goto(origin, { waitUntil: 'networkidle' });
  await fresh.getByRole('heading', { name: 'Welcome' }).waitFor();
  await assertNoHorizontalClipping(fresh, 'setup wizard');
  assert.equal(await fresh.getByRole('button', { name: 'Next' }).isDisabled(), true, 'a name is required first');
  await fresh.getByPlaceholder('Your name').fill('Sam');
  await fresh.getByRole('radio', { name: /Kilograms/ }).click();
  await fresh.getByRole('button', { name: 'Next' }).click();
  await fresh.getByRole('heading', { name: 'Your equipment' }).waitFor();
  assert.equal(await fresh.getByLabel(/Barbell weight/).inputValue(), '20', 'kg defaults to a 20 kg bar');
  await fresh.getByRole('button', { name: 'Next' }).click();
  await fresh.getByRole('heading', { name: 'Your training maxes' }).waitFor();
  await fresh.getByLabel('Squat (kg)', { exact: true }).fill('-5');
  await fresh.getByText('Must be more than zero.').waitFor();
  assert.equal(await fresh.getByRole('button', { name: /Next|Skip for now/ }).isDisabled(), true, 'a negative max cannot be accepted');
  for (const [label, value] of [['Squat', '140'], ['Bench Press', '100'], ['Deadlift', '180'], ['Military Press', '60'], ['Front Squat', '110']]) await fresh.getByLabel(new RegExp(`^${label} \\(kg\\)`)).fill(value);
  await fresh.getByRole('button', { name: 'Next' }).click();
  await fresh.getByRole('heading', { name: 'Your week' }).waitFor();
  await fresh.getByRole('button', { name: 'Next' }).click();
  await fresh.getByRole('heading', { name: "You're set" }).waitFor();
  await fresh.getByText('Week 1 · Day 1').waitFor();
  await fresh.getByRole('button', { name: 'Start training' }).click();
  await fresh.getByText('Next scheduled session').waitFor();
  assert.equal(await fresh.getByLabel('Signed in as Sam').count(), 1, 'the new lifter is signed in');
  await fresh.getByRole('button', { name: 'Start workout' }).waitFor();
  assert.equal(await fresh.getByRole('button', { name: 'Start workout' }).isDisabled(), false, 'with every training max entered, the first workout can start');
  await fresh.reload({ waitUntil: 'networkidle' });
  await fresh.getByText('Next scheduled session').waitFor();
  assert.equal(await fresh.getByRole('heading', { name: 'Welcome' }).count(), 0, 'the wizard does not run again once a profile exists');
  await newContext.close();

  // Starting another cycle from Settings: review, new maxes, dates, confirm; the old cycle is closed and Week 1 is next again.
  const cycleContext = await lockedContext(browser);
  await cycleContext.clock.setFixedTime(new Date('2024-05-13T09:00:00'));
  const cyclePage = await cycleContext.newPage();
  cyclePage.on('dialog', (dialog) => dialog.accept());
  await cyclePage.goto(origin, { waitUntil: 'networkidle' });
  await cyclePage.getByRole('button', { name: 'Settings' }).click();
  await cyclePage.getByRole('button', { name: 'Start a new cycle' }).click();
  await cyclePage.getByRole('heading', { name: 'Start another cycle' }).waitFor();
  await assertNoHorizontalClipping(cyclePage, 'new cycle review');
  await cyclePage.getByRole('button', { name: 'Next' }).click();
  await cyclePage.getByRole('heading', { name: 'Your new training maxes' }).waitFor();
  assert.equal(await cyclePage.getByRole('button', { name: 'Next' }).isDisabled(), true, 'every training max is needed to start');
  for (const [label, value] of [['Squat', '205'], ['Bench Press', '185'], ['Deadlift', '305'], ['Military Press', '125'], ['Front Squat', '165']]) await cyclePage.getByLabel(new RegExp(`^${label} \\(lb\\)`)).fill(value);
  await cyclePage.getByRole('button', { name: 'Next' }).click();
  await cyclePage.getByRole('heading', { name: 'When do you start?' }).waitFor();
  await cyclePage.getByRole('button', { name: 'Next' }).click();
  await cyclePage.getByRole('heading', { name: 'Ready to go' }).waitFor();
  await cyclePage.getByRole('button', { name: 'Start cycle 2' }).click();
  await cyclePage.getByText('Next scheduled session').waitFor();
  await cyclePage.getByText('Week 1 of 12').waitFor();
  assert.equal(await cyclePage.getByRole('button', { name: 'Start workout' }).isDisabled(), false, 'the new maxes are in place');
  await cyclePage.reload({ waitUntil: 'networkidle' });
  await cyclePage.getByText('Next scheduled session').waitFor();
  await cyclePage.getByText('Week 1 of 12').waitFor();
  await cycleContext.close();

  // Storage that cannot be opened shows a recovery screen with real choices, not an endless "Loading".
  const brokenContext = await lockedContext(browser);
  await brokenContext.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { value: { open() { throw new Error('simulated storage failure'); } }, configurable: true });
  });
  const brokenPage = await brokenContext.newPage();
  await brokenPage.goto(origin, { waitUntil: 'networkidle' });
  await brokenPage.getByRole('heading', { name: "Can't open your data" }).waitFor();
  await brokenPage.getByText('simulated storage failure').waitFor();
  for (const name of ['Try again', 'Save a copy of my data', 'Start fresh']) await brokenPage.getByRole('button', { name }).waitFor();
  await assertNoHorizontalClipping(brokenPage, 'storage recovery screen');
  await brokenPage.getByRole('button', { name: 'Try again' }).click();
  await brokenPage.getByRole('heading', { name: "Can't open your data" }).waitFor();
  await brokenContext.close();

  // Reps must be whole numbers: the problem is said next to the field and logging is disabled.
  const inputContext = await lockedContext(browser);
  await inputContext.clock.setFixedTime(new Date('2024-05-13T09:00:00'));
  const inputPage = await inputContext.newPage();
  await inputPage.goto(origin, { waitUntil: 'networkidle' });
  await inputPage.getByRole('button', { name: 'Program' }).click();
  const tmBlock = inputPage.locator('section').filter({ has: inputPage.getByRole('heading', { name: 'Block 1 training maxes' }) });
  await tmBlock.getByRole('button', { name: /Edit/ }).click();
  for (const [index, value] of ['200', '180', '300', '120', '160'].entries()) await tmBlock.locator('input[type="number"]').nth(index).fill(value);
  await tmBlock.getByRole('button', { name: /Save/ }).click();
  await inputPage.getByText('Block 1 TMs confirmed').waitFor();
  await inputPage.getByRole('button', { name: 'Today' }).click();
  await inputPage.getByRole('button', { name: 'Start workout' }).click();
  await inputPage.getByText('Workout in progress').waitFor();
  const logButton = inputPage.getByRole('button', { name: 'Log set' }).first();
  const setRow = logButton.locator('..').locator('..');
  await setRow.locator('input').nth(1).fill('5.5');
  await inputPage.getByText('Reps must be a whole number.').waitFor();
  assert.equal(await logButton.isDisabled(), true, 'fractional reps cannot be logged');
  await setRow.locator('input').nth(1).fill('5');
  await inputPage.getByText('Reps must be a whole number.').waitFor({ state: 'detached' });
  // A note on the workout is saved when the field is left, and is still there after a reload.
  await inputPage.getByText('Add workout note').click();
  await inputPage.getByLabel('Workout note').fill('Left knee twinge on the second set');
  await inputPage.getByLabel('Workout note').blur();
  await inputPage.getByText('Workout note (saved)').waitFor();
  await inputPage.reload({ waitUntil: 'networkidle' });
  await inputPage.getByText('Workout in progress').waitFor();
  assert.equal(await inputPage.getByLabel('Workout note').inputValue(), 'Left knee twinge on the second set');
  await inputPage.getByRole('button', { name: 'Progress' }).click();
  await inputPage.getByRole('heading', { name: 'Trends' }).waitFor();
  await inputPage.getByText('Finish a workout and your trends will start here.').waitFor();
  await assertNoHorizontalClipping(inputPage, 'Progress with trends');
  await inputContext.close();

  console.log('PASS: setup wizard, new cycle, storage recovery, input checks and notes.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  stopPreview();
  // Exit explicitly: a lingering handle must never keep a finished test run alive (CI would wait for the job limit).
  process.exit(process.exitCode ?? 0);
}
