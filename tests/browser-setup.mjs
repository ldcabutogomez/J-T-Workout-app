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
  assert.equal(await fresh.getByRole('button', { name: 'Next' }).isDisabled(), true, 'gender is required before setup can continue');
  await fresh.getByRole('radio', { name: 'Female' }).click();
  await fresh.getByRole('radio', { name: /Kilograms/ }).click();
  await fresh.getByRole('button', { name: 'Next' }).click();
  await fresh.getByRole('heading', { name: 'Your equipment' }).waitFor();
  assert.equal(await fresh.getByLabel(/Barbell weight/).inputValue(), '20', 'kg defaults to a 20 kg bar');
  await fresh.getByRole('button', { name: 'Next' }).click();
  await fresh.getByRole('heading', { name: 'Your training maxes' }).waitFor();
  await fresh.getByLabel('Squat (kg)', { exact: true }).fill('-5');
  await fresh.getByText('Must be more than zero.').waitFor();
  assert.equal(await fresh.getByRole('button', { name: /Next|Skip for now/ }).isDisabled(), true, 'a negative max cannot be accepted');
  for (const [label, value] of [['Squat', '140'], ['Bench Press', '100'], ['Deadlift', '180'], ['Military Press', '60']]) await fresh.getByLabel(new RegExp(`^${label} \\(kg\\)`)).fill(value);
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

  // Profiles from an older app version make one explicit choice, then never see the migration gate again.
  const legacyContext = await lockedContext(browser, 'partner-1', {}, false);
  const legacyPage = await legacyContext.newPage();
  await legacyPage.goto(origin, { waitUntil: 'networkidle' });
  const genderDialog = legacyPage.getByRole('dialog', { name: 'Choose your gender' });
  await genderDialog.getByRole('radio', { name: 'Female' }).click();
  // The dialog closes only after the profile is saved, so wait for that before reloading.
  await genderDialog.waitFor({ state: 'hidden' });
  await legacyPage.getByText('Next scheduled session').waitFor();
  await legacyPage.reload({ waitUntil: 'networkidle' });
  assert.equal(await legacyPage.getByRole('dialog', { name: 'Choose your gender' }).count(), 0, 'the legacy gender choice is saved');
  await legacyContext.close();

  // Runs are supplemental records: log one from Today, see its calendar ball, and keep it after reload.
  const runContext = await lockedContext(browser);
  await runContext.clock.setFixedTime(new Date('2024-05-13T09:00:00'));
  const runPage = await runContext.newPage();
  await runPage.goto(origin, { waitUntil: 'networkidle' });
  await runPage.getByRole('button', { name: 'Log a run' }).click();
  const runDialog = runPage.getByRole('dialog', { name: 'Log a run' });
  await runDialog.getByLabel('Distance').fill('3.1');
  await runDialog.getByLabel('Minutes').fill('30');
  await runDialog.getByLabel('Seconds').fill('0');
  await runDialog.getByText('9:41 /mi').waitFor();
  await assertNoHorizontalClipping(runPage, 'run logger');
  await runDialog.getByRole('button', { name: 'Save run' }).click();
  await runPage.getByText('Run saved.').waitFor();
  await runPage.getByRole('button', { name: 'Program' }).click();
  assert.equal(await runPage.locator('[data-day="2024-05-13"] [data-run-dot][data-state="done"]').count(), 1, 'a logged run gets its own calendar ball');
  await runPage.getByRole('button', { name: 'Progress' }).click();
  const runProgress = runPage.locator('section').filter({ has: runPage.getByRole('heading', { name: 'Running' }) });
  await runProgress.getByText('Recent runs').waitFor();
  const recentRunText = await runProgress.locator('ol li').first().innerText();
  assert.match(recentRunText, /3\.1 mi/);
  assert.match(recentRunText, /30:00/);
  assert.match(recentRunText, /9:41 \/mi/);
  await assertNoHorizontalClipping(runPage, 'run progress');
  await runPage.reload({ waitUntil: 'networkidle' });
  await runPage.getByRole('button', { name: 'Program' }).click();
  assert.equal(await runPage.locator('[data-day="2024-05-13"] [data-run-dot][data-state="done"]').count(), 1, 'the run survives a reload');
  await runContext.close();

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
  for (const [label, value] of [['Squat', '205'], ['Bench Press', '185'], ['Deadlift', '305'], ['Military Press', '125']]) await cyclePage.getByLabel(new RegExp(`^${label} \\(lb\\)`)).fill(value);
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
  for (const [index, value] of ['200', '180', '300', '120'].entries()) await tmBlock.locator('input[type="number"]').nth(index).fill(value);
  await tmBlock.getByRole('button', { name: /Save/ }).click();
  await inputPage.getByText('Block 1 TMs confirmed').waitFor();
  await inputPage.getByRole('navigation', { name: 'Primary navigation' }).getByRole('button', { name: 'Today' }).click();
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
  await inputPage.getByRole('heading', { name: 'Training trends' }).waitFor();
  await inputPage.getByText('Complete a workout in this time range and the chart will appear here.').waitFor();
  await assertNoHorizontalClipping(inputPage, 'Progress with trends');
  await inputContext.close();

  // Adding an exercise the program doesn't prescribe: from the list and by typing, logged, kept across a reload,
  // and it leaves the workout "completed" (extras never make a finished workout partial).
  const extraContext = await lockedContext(browser);
  await extraContext.clock.setFixedTime(new Date('2024-05-13T09:00:00'));
  const extraPage = await extraContext.newPage();
  extraPage.on('dialog', (dialog) => dialog.accept());
  await extraPage.goto(origin, { waitUntil: 'networkidle' });
  await extraPage.getByRole('button', { name: 'Program' }).click();
  const extraTms = extraPage.locator('section').filter({ has: extraPage.getByRole('heading', { name: 'Block 1 training maxes' }) });
  await extraTms.getByRole('button', { name: /Edit/ }).click();
  for (const [index, value] of ['200', '180', '300', '120'].entries()) await extraTms.locator('input[type="number"]').nth(index).fill(value);
  await extraTms.getByRole('button', { name: /Save/ }).click();
  await extraPage.getByText('Block 1 TMs confirmed').waitFor();
  await extraPage.getByRole('navigation', { name: 'Primary navigation' }).getByRole('button', { name: 'Today' }).click();
  await extraPage.getByRole('button', { name: 'Start workout' }).click();
  await extraPage.getByText('Workout in progress').waitFor();
  await extraPage.getByRole('button', { name: 'Add exercise' }).click();
  const sheet = extraPage.getByRole('dialog', { name: 'Add exercise' });
  await sheet.waitFor();
  await assertNoHorizontalClipping(extraPage, 'add exercise sheet');
  await sheet.getByLabel('Search or type an exercise name').fill('abduc');
  await sheet.getByRole('button', { name: 'Hip Abduction' }).click();
  await sheet.waitFor({ state: 'detached' });
  const hip = extraPage.locator('section').filter({ has: extraPage.getByRole('heading', { name: 'Hip Abduction' }) });
  await hip.getByText('Added by you').waitFor();
  assert.equal(await hip.getByText('Extra', { exact: true }).count(), 1);
  assert.equal(await extraPage.getByLabel(/Swap Hip Abduction/).count(), 0, 'an added exercise has no swap menu');
  await hip.locator('input[type="number"]').first().fill('80');
  await hip.getByRole('button', { name: 'Log set' }).click();
  await hip.getByText('10 reps @ 80 lb').waitFor();
  await hip.getByRole('button', { name: 'Add set' }).click();
  assert.equal(await hip.getByRole('button', { name: 'Log set' }).count(), 1, 'a second blank set appeared');
  assert.equal(await hip.getByRole('button', { name: /^Remove Hip Abduction$/ }).count(), 0, 'cannot remove an exercise once a set is logged');

  // A name typed by hand, then taken out again before logging anything.
  await extraPage.getByRole('button', { name: 'Add exercise' }).click();
  const sheet2 = extraPage.getByRole('dialog', { name: 'Add exercise' });
  await sheet2.getByLabel('Search or type an exercise name').fill('Banded Clamshell');
  await sheet2.getByRole('button', { name: /Add “Banded Clamshell”/ }).click();
  await extraPage.getByRole('heading', { name: 'Banded Clamshell' }).waitFor();
  await extraPage.getByRole('button', { name: 'Remove Banded Clamshell' }).click();
  await extraPage.getByRole('heading', { name: 'Banded Clamshell' }).waitFor({ state: 'detached' });
  // An exercise already in the workout is not offered twice.
  await extraPage.getByRole('button', { name: 'Add exercise' }).click();
  const sheet3 = extraPage.getByRole('dialog', { name: 'Add exercise' });
  await sheet3.getByLabel('Search or type an exercise name').fill('Hip Abduction');
  assert.equal(await sheet3.getByRole('button', { name: /Hip Abduction/ }).isDisabled(), true);
  await sheet3.getByRole('button', { name: 'Cancel' }).click();

  await extraPage.reload({ waitUntil: 'networkidle' });
  await extraPage.getByText('Workout in progress').waitFor();
  await extraPage.getByText('10 reps @ 80 lb').waitFor();

  for (let guard = 0; guard < 80; guard += 1) {
    const buttons = extraPage.getByRole('button', { name: 'Log set' });
    if (await buttons.count() === 0) break;
    const row = buttons.first().locator('..').locator('..');
    const inputs = row.locator('input');
    if (!(await inputs.nth(0).inputValue())) await inputs.nth(0).fill('100');
    if (!(await inputs.nth(1).inputValue())) await inputs.nth(1).fill('5');
    await buttons.first().click();
  }
  await extraPage.getByRole('button', { name: 'Finish' }).click();
  const extraSummary = extraPage.getByRole('dialog', { name: 'Workout summary' });
  await extraSummary.waitFor();
  await extraPage.keyboard.press('Escape');
  await extraPage.getByRole('button', { name: 'Progress' }).click();
  await extraPage.getByText('completed', { exact: true }).waitFor();
  await extraPage.getByText('Week 1 · Day 1').click();
  await extraPage.getByText('Extra · Hip Abduction').waitFor();
  await assertNoHorizontalClipping(extraPage, 'history with an added exercise');
  await extraContext.close();

  console.log('PASS: setup wizard, new cycle, storage recovery, input checks and notes.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await stopPreview();
  // Exit explicitly: a lingering handle must never keep a finished test run alive (CI would wait for the job limit).
  process.exit(process.exitCode ?? 0);
}
