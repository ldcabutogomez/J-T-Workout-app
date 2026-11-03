import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

export const origin = 'http://127.0.0.1:4173';
const externalServer = process.env.JNT2_EXTERNAL_SERVER === '1';
export const preview = externalServer ? null : spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'preview'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NO_COLOR: '1' },
  // Its own process group, so stopPreview() can stop npm AND the vite server it starts. Stopping only npm leaves
  // vite holding the output pipes open, and the test process would then never exit.
  detached: process.platform !== 'win32',
});
let previewLog = '';
preview?.stdout.on('data', (chunk) => { previewLog += String(chunk); });
preview?.stderr.on('data', (chunk) => { previewLog += String(chunk); });

export async function waitForPreview() {
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

/**
 * A browser context that already belongs to one person, as after the one-time "Who uses this phone?" choice.
 * The seed runs once per storage, so tests can still clear the lock or switch users afterwards.
 */
export async function lockedContext(browser, profileId = 'partner-1', options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...options });
  await seedPhone(context, profileId);
  return context;
}

/** Gives a context a phone that was set up before: Lauren and Luis saved, and (when `lockId` is set) already claimed by one of them. */
export async function seedPhone(context, lockId) {
  await context.addInitScript((id) => {
    try {
      if (!localStorage.getItem('jnt2_test_seed')) {
        localStorage.setItem('jnt2_test_seed', '1');
        if (id) localStorage.setItem('jnt2_locked_profile', id);
        // A phone that was set up before: two lifters already saved, so the first-run wizard does not appear.
        // This runs before the app's own code, and IndexedDB serves requests in order, so the app reads these.
        const blank = (pid, name, colorTheme) => ({ id: pid, name, unit: 'lb', equipmentIncrement: 5, barbellWeight: 45, tone: 'warm', currentWeek: 1, currentDay: 1, trainingMaxes: {}, weeklyGoalSessions: 4, colorTheme });
        const request = indexedDB.open('JackedAndTan2_LocalDB', 2);
        request.onupgradeneeded = () => {
          for (const name of ['profiles', 'sessions', 'activeSessions', 'demoSessions']) {
            if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: name === 'profiles' ? 'id' : name === 'activeSessions' ? 'profileId' : 'sessionId' });
          }
        };
        request.onsuccess = () => {
          const transaction = request.result.transaction('profiles', 'readwrite');
          transaction.objectStore('profiles').put(blank('partner-1', 'Lauren', 'lavender'));
          transaction.objectStore('profiles').put(blank('partner-2', 'Luis', 'blue'));
          transaction.oncomplete = () => request.result.close();
        };
      }
    } catch { /* storage unavailable */ }
  }, lockId);
}

export async function assertNoHorizontalClipping(page, label) {
  const sizes = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.ok(sizes.document <= sizes.viewport + 1, `${label} clipped horizontally: ${JSON.stringify(sizes)}`);
}


/**
 * Stops the preview server and everything it started, and waits until it has really gone. The next test script
 * starts its own server on the same port; if this one were still dying, that script could connect to it and then
 * lose it halfway through ("connection refused").
 */
export async function stopPreview() {
  if (!preview || preview.exitCode !== null || preview.signalCode !== null) return;
  const exited = new Promise((resolve) => preview.once('exit', resolve));
  try {
    if (process.platform !== 'win32' && preview.pid) process.kill(-preview.pid, 'SIGTERM');
    else preview.kill('SIGTERM');
  } catch {
    preview.kill('SIGTERM');
  }
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
  // Give the operating system a moment to release the port.
  await new Promise((resolve) => setTimeout(resolve, 300));
}
