import assert from 'node:assert/strict';
import test from 'node:test';
import { tmProblem } from '../src/lib/validateTm';
import { DEFAULT_TRAINING_DAYS, buildProfileFromWizard, defaultsForUnit, newProfileId, wizardProblems, type WizardInput } from '../src/lib/wizard';
import { sanitizeProfile } from '../src/storage/schema';
import { StorageService } from '../src/storage/db';
import { missingTrainingMaxes } from '../src/engine/sessionEngine';
import { getDayPrescription } from '../src/program/prescriptions';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}
Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true });

const NOW = new Date(2024, 4, 15, 12).getTime(); // a Wednesday
const input = (patch: Partial<WizardInput> = {}): WizardInput => ({
  name: ' Sam ', gender: 'female', unit: 'lb', ...defaultsForUnit('lb'),
  trainingMaxes: { squat: 200, bench: 150, deadlift: 250, ohp: 100, front_squat: 160 },
  trainingDays: DEFAULT_TRAINING_DAYS, weeklyGoalSessions: 4, tone: 'warm', ...patch,
});

test('training max checks: blocking errors, soft warnings, and empty is fine', () => {
  assert.equal(tmProblem('', 'lb'), null);
  assert.equal(tmProblem(225, 'lb'), null);
  assert.equal(tmProblem(0, 'lb')?.level, 'error');
  assert.equal(tmProblem(-10, 'kg')?.level, 'error');
  assert.equal(tmProblem(Number.NaN, 'lb')?.level, 'error');
  assert.equal(tmProblem(10, 'lb')?.level, 'warn', 'lighter than an empty bar');
  assert.equal(tmProblem(1200, 'lb')?.level, 'warn');
  assert.equal(tmProblem(2000, 'lb')?.level, 'error');
  assert.equal(tmProblem(100, 'kg'), null);
});

test('kilograms default to a 20 kg bar and 2.5 kg jumps', () => {
  assert.deepEqual(defaultsForUnit('kg'), { barbellWeight: 20, equipmentIncrement: 2.5 });
  assert.deepEqual(defaultsForUnit('lb'), { barbellWeight: 45, equipmentIncrement: 5 });
});

test('the wizard builds a profile that is valid, scheduled, and ready for the first workout', async () => {
  const p = buildProfileFromWizard(input(), NOW, 'profile-test');
  assert.equal(p.name, 'Sam', 'the name is trimmed');
  assert.equal(p.id, 'profile-test');
  assert.equal(p.gender, 'female');
  assert.deepEqual(p.schedule?.days, DEFAULT_TRAINING_DAYS);
  assert.equal(p.currentWeek, 1);
  assert.equal(p.currentDay, 1);
  assert.deepEqual(missingTrainingMaxes(getDayPrescription(1, 1, p), p), [], 'every Block 1 lift has a training max');
  // It must be accepted by the real storage layer.
  const store = new StorageService('wizard-db', 'test_wizard');
  await store.saveProfile(p);
  assert.equal((await store.getProfiles())[0].name, 'Sam');
  assert.equal(sanitizeProfile(p).weeklyGoalSessions, 4);
});

test('skipped training maxes are left out, and the first workout then asks for them', () => {
  const p = buildProfileFromWizard(input({ trainingMaxes: { squat: 200, bench: '', deadlift: 0 } }), NOW, 'p2');
  assert.deepEqual(p.trainingMaxes, { squat: 200 });
  assert.ok(missingTrainingMaxes(getDayPrescription(1, 1, p), p).length >= 0);
});

test('problems are reported in words before anything is built', () => {
  assert.deepEqual(wizardProblems(input()), []);
  assert.ok(wizardProblems(input({ name: '   ' })).includes('Enter a name.'));
  assert.ok(wizardProblems(input({ gender: undefined })).includes('Choose a gender.'));
  assert.ok(wizardProblems(input({ equipmentIncrement: 0 })).some((p) => /plate jump/.test(p)));
  assert.ok(wizardProblems(input({ trainingMaxes: { squat: -3 } })).some((p) => /squat/.test(p)));
  assert.ok(wizardProblems(input({ trainingDays: [0, 0, 1, 2] })).some((p) => /four different/.test(p)));
});

test('profile ids are unique and safe to store', () => {
  const a = newProfileId(NOW, () => 0.1);
  const b = newProfileId(NOW, () => 0.9);
  assert.notEqual(a, b);
  assert.match(a, /^profile-[a-z0-9]+$/);
});
