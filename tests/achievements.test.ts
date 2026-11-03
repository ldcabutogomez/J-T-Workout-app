import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeHighlights, computeStreak, computeTotalVolume, evaluateBadges, evaluateDuoBadges, newlyUnlocked, weekStart,
} from '../src/engine/achievements';
import type { WorkoutSession } from '../src/types';
import { completeSession } from './helpers';

const DAY = 86_400_000;
// Wednesday 2024-05-15 12:00 local time.
const NOW = new Date(2024, 4, 15, 12).getTime();

function at(base: WorkoutSession, id: string, time: number): WorkoutSession {
  const next = structuredClone(base);
  next.sessionId = id;
  next.startTime = time - 3_600_000;
  next.completedTime = time;
  return next;
}

test('total volume sums completed reps x load', () => {
  const base = completeSession();
  const expected = Math.round(base.exercises.flatMap((e) => e.sets)
    .filter((s) => s.completed && s.actualReps !== null && s.load !== null)
    .reduce((sum, s) => sum + (s.actualReps as number) * (s.load as number), 0));
  assert.equal(computeTotalVolume(base), expected);
  assert.ok(expected > 0);
});

test('highlights report duration and set count', () => {
  const base = at(completeSession(), 'a', NOW);
  const logged = base.exercises.flatMap((e) => e.sets).filter((set) => set.completed);
  logged[0].timestamp = 1_000;
  logged[logged.length - 1].timestamp = 1_000 + 45 * 60_000;
  const h = computeHighlights(base, []);
  assert.equal(h.durationMs, 45 * 60_000, 'measured from first to last logged set, not draft age');
  assert.ok(h.setsCompleted > 0);
  assert.deepEqual(h.results.filter((r) => r.kind === 'all_time_pr'), []);
});

test('weekStart is Monday midnight', () => {
  const monday = new Date(weekStart(NOW));
  assert.equal(monday.getDay(), 1);
  assert.equal(monday.getHours(), 0);
});

test('streak counts consecutive goal weeks and tolerates an unmet current week', () => {
  const base = completeSession();
  const sessions: WorkoutSession[] = [];
  // Two full previous weeks of 2 sessions each, goal = 2.
  for (let w = 1; w <= 2; w++) {
    for (let i = 0; i < 2; i++) sessions.push(at(base, `w${w}-${i}`, NOW - w * 7 * DAY + i * 1000));
  }
  const unmet = computeStreak(sessions, 2, NOW);
  assert.equal(unmet.goalMet, false);
  assert.equal(unmet.streakWeeks, 2);

  sessions.push(at(base, 'c1', NOW), at(base, 'c2', NOW - 1000));
  const met = computeStreak(sessions, 2, NOW);
  assert.equal(met.goalMet, true);
  assert.equal(met.streakWeeks, 3);
  assert.equal(met.weeklyCount, 2);
});

test('streak breaks on a missed week', () => {
  const base = completeSession();
  const sessions = [at(base, 'x1', NOW - 14 * DAY), at(base, 'x2', NOW - 14 * DAY + 1000)];
  assert.equal(computeStreak(sessions, 2, NOW).streakWeeks, 0);
});

test('badges: first workout and session milestones', () => {
  const base = completeSession();
  const first = at(base, 's0', NOW);
  assert.deepEqual(evaluateBadges(first, [], 4, NOW).filter((id) => !id.startsWith('volume_')), ['first_workout']);

  const history = Array.from({ length: 4 }, (_, i) => at(base, `h${i}`, NOW - (i + 1) * 3 * DAY));
  const fifth = at(base, 's5', NOW);
  const earned = evaluateBadges(fifth, history, 4, NOW);
  assert.ok(earned.includes('sessions_5'));
});

test('newlyUnlocked skips badges already held', () => {
  const result = newlyUnlocked(['first_workout', 'sessions_5'], [{ id: 'first_workout', unlockedAt: 1 }], 99);
  assert.deepEqual(result, [{ id: 'sessions_5', unlockedAt: 99 }]);
});

test('time-of-day and comeback badges', () => {
  const base = completeSession();
  const early = at(base, 'e', new Date(2024, 4, 15, 7, 30).getTime());
  early.startTime = new Date(2024, 4, 15, 6, 30).getTime();
  assert.ok(evaluateBadges(early, [], 4, NOW).includes('early_bird'));
  const late = at(base, 'l', new Date(2024, 4, 15, 21, 30).getTime());
  assert.ok(evaluateBadges(late, [], 4, NOW).includes('night_owl'));
  assert.ok(!evaluateBadges(at(base, 'n', NOW), [], 4, NOW).some((id) => ['early_bird', 'night_owl', 'comeback'].includes(id)));
  const away = at(base, 'a', NOW - 20 * DAY);
  assert.ok(evaluateBadges(at(base, 'b', NOW), [away], 4, NOW).includes('comeback'));
});

test('lifting milestone badges: PR counts, perfect week and volume in lb', () => {
  const base = completeSession();
  const week = Array.from({ length: 4 }, (_, i) => at(base, `w${i}`, NOW - i * 3 * 3_600_000));
  const earned = evaluateBadges(week[0], week.slice(1), 4, NOW);
  assert.ok(earned.includes('perfect_week'));
  assert.ok(earned.includes('volume_100k'), 'four full sessions lift over 100,000 lb in this fixture');
  assert.ok(!earned.includes('volume_500k'));
  assert.ok(!evaluateBadges(week[0], week.slice(1, 3), 4, NOW).includes('perfect_week'));
});

test('duo badges need both lifters', () => {
  const day = new Date(2024, 4, 15, 9).getTime();
  const side = (lastSessionAt: number | null, goalMet: boolean, streakWeeks: number) => ({ lastSessionAt, goalMet, streakWeeks });
  assert.deepEqual(evaluateDuoBadges(side(day, true, 4), [side(day + 3_600_000, true, 5)]).sort(), ['duo_both_goal', 'duo_same_day', 'duo_streak']);
  assert.deepEqual(evaluateDuoBadges(side(day, false, 1), [side(day - DAY, true, 5)]), []);
  assert.deepEqual(evaluateDuoBadges(side(day, true, 4), []), [], 'no partner, no duo badge');
});
