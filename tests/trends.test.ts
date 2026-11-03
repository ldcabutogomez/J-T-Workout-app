import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activityDays,
  analyticsInsights,
  analyticsSummary,
  analyticsVolumeByWeek,
  analyticsWindow,
  e1rmSeries,
  estimateOneRepMax,
  prsByWeek,
  trendableExercises,
  volumeByWeek,
  workoutDurationSeries,
} from '../src/engine/trends';
import { NOTE_MAX, cleanNote, setExerciseNote, setSessionNote } from '../src/engine/sessionEngine';
import { StorageService } from '../src/storage/db';
import type { WorkoutSession } from '../src/types';
import { completeSession, profile } from './helpers';

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

const DAY = 86_400_000;
const MONDAY = new Date(2024, 4, 13, 9).getTime();
const base = completeSession();
const first = base.exercises[0];

/** A finished session whose first exercise has one completed set of exactly `reps` at `load`. */
function lift(id: string, at: number, load: number, reps: number, unit: 'lb' | 'kg' = 'lb'): WorkoutSession {
  const s = structuredClone(base);
  s.sessionId = id;
  s.completedTime = at;
  s.startTime = at - 1000;
  s.settingsSnapshot.unit = unit;
  s.exercises = [{ ...structuredClone(first), sets: [{ ...structuredClone(first.sets[0]), actualReps: reps, load, unit, completed: true }] }];
  return s;
}

test('estimated 1RM: Epley, a single is itself, junk is zero', () => {
  assert.equal(estimateOneRepMax(200, 1), 200);
  assert.equal(Math.round(estimateOneRepMax(200, 5)), 233);
  assert.equal(estimateOneRepMax(0, 5), 0);
  assert.equal(estimateOneRepMax(200, 0), 0);
});

test('the strength series follows the best set per workout, oldest first, and marks new bests', () => {
  const id = first.exerciseId;
  const history = [lift('c', MONDAY + 14 * DAY, 190, 5), lift('a', MONDAY, 180, 5), lift('b', MONDAY + 7 * DAY, 170, 5)];
  const series = e1rmSeries(history, id, 'lb');
  assert.deepEqual(series.map((p) => p.at), [MONDAY, MONDAY + 7 * DAY, MONDAY + 14 * DAY]);
  assert.deepEqual(series.map((p) => Boolean(p.best)), [true, false, true], 'the middle workout was weaker than the first');
  assert.ok(series[2].value > series[0].value);
});

test('high-rep sets, other exercises and unfinished workouts do not enter the strength series', () => {
  const id = first.exerciseId;
  assert.equal(e1rmSeries([lift('x', MONDAY, 100, 20)], id, 'lb').length, 0, 'a set of 20 is too loose to estimate from');
  assert.equal(e1rmSeries([lift('x', MONDAY, 100, 5)], 'some-other-lift', 'lb').length, 0);
  assert.equal(e1rmSeries([{ ...lift('x', MONDAY, 100, 5), status: 'active' as const, completedTime: undefined }], id, 'lb').length, 0);
});

test('loads are converted into the lifter\'s unit', () => {
  const id = first.exerciseId;
  const [point] = e1rmSeries([lift('k', MONDAY, 100, 1, 'kg')], id, 'lb');
  assert.ok(Math.abs(point.value - 220.5) < 0.6, `100 kg is about 220.5 lb, got ${point.value}`);
});

test('weekly volume fills quiet weeks with zero and keeps only the most recent weeks', () => {
  const history = [lift('a', MONDAY, 100, 10), lift('b', MONDAY + 21 * DAY, 100, 10)];
  const weeks = volumeByWeek(history, 'lb');
  assert.equal(weeks.length, 4, 'four calendar weeks from the first to the last workout');
  assert.equal(weeks[1].value, 0);
  assert.equal(weeks[2].value, 0);
  assert.equal(weeks[0].value, 1000);
  assert.equal(volumeByWeek([], 'lb').length, 0);
  const many = Array.from({ length: 30 }, (_, i) => lift(`w${i}`, MONDAY + i * 7 * DAY, 100, 10));
  assert.equal(volumeByWeek(many, 'lb', 12).length, 12);
});

test('trendable exercises list only lifts with data', () => {
  const list = trendableExercises([lift('a', MONDAY, 100, 5), lift('b', MONDAY + DAY, 100, 5)], 'lb');
  assert.deepEqual(list.map((i) => [i.id, i.points]), [[first.exerciseId, 2]]);
  assert.deepEqual(trendableExercises([], 'lb'), []);
});

test('analytics ranges use complete local calendar weeks and compare the preceding equal period', () => {
  const now = MONDAY + 23 * DAY; // Wednesday in the fourth selected week.
  const previous = lift('previous', MONDAY - 7 * DAY, 90, 5);
  const currentA = lift('current-a', MONDAY, 100, 5);
  const currentB = lift('current-b', MONDAY + 21 * DAY, 110, 5);
  const history = [currentB, previous, currentA];
  const window = analyticsWindow('4w', history, now);
  assert.equal(window.start, MONDAY - 9 * 60 * 60 * 1000, 'range begins at local Monday midnight');
  assert.equal(window.previousEnd, window.start);
  const summary = analyticsSummary(history, 'lb', '4w', now);
  assert.equal(summary.current.workouts, 2);
  assert.equal(summary.previous?.workouts, 1);
  assert.equal(summary.current.volume, 1050, '100x5 plus 110x5');
  assert.equal(summary.previous?.volume, 450);
  assert.equal(summary.current.prs, 2, 'both current lifts beat the earlier benchmark');
  assert.equal(analyticsWindow('all', history, now).previousStart, undefined);
});

test('activity heatmap fills days, groups same-day workouts and marks only later dates as future', () => {
  const now = MONDAY + 23 * DAY;
  const sameDay = MONDAY + 22 * DAY;
  const days = activityDays([lift('a', sameDay, 100, 5), lift('b', sameDay + 60_000, 105, 5)], '4w', now);
  assert.equal(days.length, 28);
  assert.equal(days.find((day) => day.at === new Date(2024, 5, 4).setHours(0, 0, 0, 0))?.count, 2);
  assert.equal(days.filter((day) => day.future).length, 4, 'Thursday through Sunday are future cells');
  assert.equal(days.find((day) => day.at === new Date(now).setHours(0, 0, 0, 0))?.future, false, 'today is not future');
});

test('weekly analytics include empty weeks, PR counts and only timestamp-backed duration points', () => {
  const now = MONDAY + 23 * DAY;
  const firstLift = lift('a', MONDAY, 100, 5);
  const secondLift = lift('b', MONDAY + 7 * DAY, 110, 5);
  secondLift.exercises[0].sets.push({ ...structuredClone(secondLift.exercises[0].sets[0]), setId: 'timed-2', timestamp: secondLift.completedTime! - 5 * 60_000 });
  secondLift.exercises[0].sets[0].timestamp = secondLift.completedTime! - 35 * 60_000;
  const history = [firstLift, secondLift];
  assert.deepEqual(analyticsVolumeByWeek(history, 'lb', '4w', now).map((point) => point.value), [500, 1100, 0, 0]);
  assert.deepEqual(prsByWeek(history, '4w', now).map((point) => point.value), [0, 1, 0, 0]);
  assert.deepEqual(workoutDurationSeries(history, '4w', now).map((point) => point.value), [30]);
  const summary = analyticsSummary(history, 'lb', '4w', now);
  assert.equal(summary.current.averageDurationMinutes, 30);
  assert.equal(summary.current.durationCoverage, 1);
});

test('insights are deterministic, label estimated strength and handle an empty history', () => {
  const now = MONDAY + 23 * DAY;
  const history = [lift('old', MONDAY - 7 * DAY, 90, 5), lift('a', MONDAY, 100, 5), lift('b', MONDAY + 21 * DAY, 110, 5)];
  const insights = analyticsInsights(history, 'lb', 2, '4w', now);
  assert.equal(insights[0].kind, 'volume');
  assert.ok(insights.some((insight) => insight.kind === 'strength' && /Estimated 1RM/.test(insight.body)));
  assert.ok(insights.some((insight) => insight.kind === 'consistency'));
  assert.equal(analyticsInsights([], 'lb', 4, '12w', now)[0].kind, 'start');
});

test('notes are cleaned, capped, set on one exercise, and cleared when empty', () => {
  assert.equal(cleanNote('ok\u0000\u0007 fine\n2nd line'), 'ok fine\n2nd line');
  assert.equal(cleanNote('x'.repeat(NOTE_MAX + 50)).length, NOTE_MAX);
  const s = completeSession();
  const slot = s.exercises[0].slotId;
  const noted = setExerciseNote(s, slot, 'left knee twinge');
  assert.equal(noted.exercises[0].userNote, 'left knee twinge');
  assert.equal(noted.exercises[0].notes, s.exercises[0].notes, 'the program note is untouched');
  assert.equal(noted.exercises[1].userNote, undefined, 'other exercises are untouched');
  assert.equal('userNote' in setExerciseNote(noted, slot, '   ').exercises[0], false, 'blank clears it');
  assert.throws(() => setExerciseNote(s, 'nope', 'x'), /Unknown exercise/);
  assert.equal(setSessionNote(s, 'felt great').note, 'felt great');
  assert.equal('note' in setSessionNote(setSessionNote(s, 'x'), ''), false);
});

test('notes survive being stored and a backup round trip, and over-long ones are refused', async () => {
  const p = profile();
  const store = new StorageService('notes-db', 'test_notes');
  await store.saveProfile(p);
  const session = setSessionNote(setExerciseNote(completeSession(p), completeSession(p).exercises[0].slotId, 'top set felt fast'), 'good day');
  await store.completeAndAdvance(session, p);
  const [saved] = await store.getSessionHistory(p.id, true);
  assert.equal(saved.note, 'good day');
  assert.equal(saved.exercises[0].userNote, 'top set felt fast');
  const target = new StorageService('notes-db2', 'test_notes2');
  assert.equal((await target.importBackup(await store.exportBackup(), 'replace-all')).success, true);
  assert.equal((await target.getSessionHistory(p.id, true))[0].note, 'good day');
  await assert.rejects(store.completeAndAdvance({ ...session, sessionId: 'long', note: 'x'.repeat(600) }, p), /malformed/);
});
