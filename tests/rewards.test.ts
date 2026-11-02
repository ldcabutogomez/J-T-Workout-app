import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BADGES, computeHighlights, computeStreak, deriveHighlights, evaluateBadges, loggedDurationMs, summaryHeadline,
} from '../src/engine/achievements';
import { findAllComparableResults, generateSessionEncouragement } from '../src/engine/encouragement';
import { finalizeSession } from '../src/engine/sessionEngine';
import { hasDelivered, markDelivered, pickPrimaryCelebration, prRewardKey } from '../src/lib/rewards';
import { weeklyCounts } from '../src/engine/sessionValidity';
import type { SessionResult, WorkoutSession } from '../src/types';
import { completeSession, profile } from './helpers';

const base = completeSession(profile(), 1, 1, 100);

/** One valid completed session whose only exercise has a single 5-rep top set. */
function top(id: string, completedTime: number, load: number, reps = 5, exerciseId = 'back-squat'): WorkoutSession {
  const next = structuredClone(base);
  next.sessionId = id;
  next.startTime = completedTime - 1_000;
  next.completedTime = completedTime;
  next.exercises = [structuredClone(base.exercises[0])];
  next.exercises[0].exerciseId = exerciseId;
  next.exercises[0].exerciseName = 'Back Squat';
  next.exercises[0].sets = [structuredClone(base.exercises[0].sets[0])];
  Object.assign(next.exercises[0].sets[0], { completed: true, actualReps: reps, load, unit: 'lb', type: 'rm_target', timestamp: completedTime });
  return next;
}

test('a below-best improvement is an improvement, never a PR, with correct deltas', () => {
  const history = [top('best', 100, 110), top('previous', 200, 90)];
  const [result] = findAllComparableResults(top('now', 300, 100), history);
  assert.equal(result.kind, 'previous_improvement');
  assert.equal(result.deltaVsPrevious, 10);
  assert.equal(result.deltaVsBest, -10);
  assert.equal(summaryHeadline([result], true), 'Up from last time');
});

test('matched best, benchmark, and all-time PR are distinct results', () => {
  const history = [top('best', 100, 110)];
  assert.equal(findAllComparableResults(top('same', 300, 110), history)[0].kind, 'matched_best');
  assert.equal(findAllComparableResults(top('first', 300, 100, 3), history)[0].kind, 'benchmark');
  const pr = findAllComparableResults(top('pr', 300, 115), history)[0];
  assert.equal(pr.kind, 'all_time_pr');
  assert.equal(pr.deltaVsBest, 5);
  assert.equal(summaryHeadline([pr], true), 'New personal best!');
  assert.equal(findAllComparableResults(top('worse', 300, 80), [top('a', 100, 110)]).length, 0);
});

test('headlines: benchmark, matched, plain, and partial sessions never claim a result', () => {
  const kinds = (kind: SessionResult['kind']) => [{ kind } as SessionResult];
  assert.equal(summaryHeadline(kinds('benchmark'), true), 'Benchmark established');
  assert.equal(summaryHeadline(kinds('matched_best'), true), 'Matched your best');
  assert.equal(summaryHeadline([], true), 'Workout complete!');
  assert.equal(summaryHeadline(kinds('all_time_pr'), false), 'Partial workout saved');
});

test('comparisons only look at earlier sessions, so editing old history cannot claim a stale PR', () => {
  const later = top('later', 500, 200);
  const oldSession = top('old', 100, 150);
  // The old session was heavier than anything before it; the later 200 must not erase that.
  assert.equal(findAllComparableResults(oldSession, [later])[0].kind, 'benchmark');

  const derived = deriveHighlights([top('a', 100, 100), top('b', 200, 90), top('c', 300, 110), later]);
  assert.equal(derived.get('a')!.results[0].kind, 'benchmark');
  assert.equal(derived.get('b')!.results.length, 0);
  assert.equal(derived.get('c')!.results[0].kind, 'all_time_pr');
  assert.equal(derived.get('later')!.results[0].kind, 'all_time_pr');
});

test('editing a completed session keeps its original completion time', () => {
  const edited = finalizeSession({ ...top('x', 1_000, 100), status: 'active', isEditingCompleted: true }, 9_999);
  assert.equal(edited.completedTime, 1_000);
  assert.equal(finalizeSession({ ...top('y', 1_000, 100), status: 'active' }, 9_999).completedTime, 9_999);
});

test('logged duration ignores draft age and needs two timestamped sets', () => {
  const session = completeSession(profile(), 1, 1, 5_000);
  const stamps = session.exercises.flatMap((e) => e.sets).filter((set) => set.completed);
  stamps[0].timestamp = 10_000;
  stamps[1].timestamp = 70_000;
  stamps.slice(2).forEach((set) => { set.timestamp = 40_000; });
  session.startTime = 0;
  assert.equal(loggedDurationMs(session), 60_000);
  assert.equal(computeHighlights(session, []).durationMs, 60_000);
  assert.equal(loggedDurationMs(top('one', 100, 100)), 0);
});

// Wednesday 2024-05-15 12:00 local time.
const NOW = new Date(2024, 4, 15, 12).getTime();
const DAY = 86_400_000;

test('one weekly-goal definition: calendar week counts match across copy, ring, and streak', () => {
  const sessions = [
    top('sun', NOW - 3 * DAY, 100),
    top('tue', NOW - DAY, 100),
    top('mon', NOW - 2 * DAY, 100),
  ];
  const current = top('now', NOW, 100);
  const all = [...sessions, current];
  assert.equal(computeStreak(all, 4, NOW).weeklyCount, 3, 'Sunday belongs to last week');
  assert.equal(weeklyCounts(all).get(new Date(2024, 4, 13).getTime()), 3);
  const message = generateSessionEncouragement({ tone: 'minimal', history: sessions, currentSession: current, weeklyGoalSessions: 4, now: NOW });
  assert.match(message, /3 of 4 target sessions completed this week/);
});

test('badges: 40-workout milestone is reachable, 50 is gone, first PR needs a real all-time PR', () => {
  assert.ok(BADGES.some((b) => b.id === 'sessions_40'));
  assert.ok(!BADGES.some((b) => b.id === 'sessions_50'));

  const forty = Array.from({ length: 39 }, (_, i) => top(`h${i}`, NOW - (i + 1) * DAY * 2, 100, 5, `ex-${i}`));
  const earned = evaluateBadges(top('now', NOW, 100), forty, 4, NOW);
  assert.ok(earned.includes('sessions_40') && earned.includes('sessions_25'));

  const improvementOnly = [top('best', NOW - 4 * DAY, 110), top('prev', NOW - 2 * DAY, 90)];
  assert.ok(!evaluateBadges(top('now', NOW, 100), improvementOnly, 4, NOW).includes('first_pr'));
  assert.ok(evaluateBadges(top('now', NOW, 120), improvementOnly, 4, NOW).includes('first_pr'));
});

test('reward ledger is idempotent and the summary picks exactly one celebration', () => {
  const session = top('s', 100, 100);
  const key = prRewardKey({ exerciseId: 'back-squat', reps: 5, load: 100.004 } as SessionResult);
  assert.equal(key, 'pr:back-squat:5:100');
  assert.equal(hasDelivered(session, key), false);
  const once = markDelivered(session, key);
  assert.deepEqual(once.rewardsDelivered, [key]);
  assert.equal(markDelivered(once, key), once, 'relogging the same result does not add or replay');

  const pr = { kind: 'all_time_pr', exerciseId: 'back-squat', reps: 5, load: 100 } as SessionResult;
  const input = { celebrate: true, cycleComplete: false, results: [pr], delivered: [] as string[], weeklyGoalNewlyMet: true, newBadgeCount: 2 };
  assert.equal(pickPrimaryCelebration(input), 'pr');
  assert.equal(pickPrimaryCelebration({ ...input, delivered: [key] }), 'weekly_goal', 'a PR already delivered mid-workout is not replayed');
  assert.equal(pickPrimaryCelebration({ ...input, delivered: [key], weeklyGoalNewlyMet: false }), 'badge');
  assert.equal(pickPrimaryCelebration({ ...input, delivered: [key], weeklyGoalNewlyMet: false, newBadgeCount: 0 }), 'finish');
  assert.equal(pickPrimaryCelebration({ ...input, cycleComplete: true }), 'cycle');
  assert.equal(pickPrimaryCelebration({ ...input, celebrate: false }), 'none');
});
