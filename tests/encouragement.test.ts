import assert from 'node:assert/strict';
import test from 'node:test';
import { findComparableResult, generateSessionEncouragement, isVerifiedCycleComplete } from '../src/engine/encouragement';
import type { WorkoutSession } from '../src/types';
import { completeSession, profile } from './helpers';

function positioned(base: WorkoutSession, week: number, day: number, id: string, time: number): WorkoutSession {
  const next = structuredClone(base);
  next.sessionId = id;
  next.week = week;
  next.day = day;
  next.completedTime = time;
  next.updatedTime = time;
  next.prescriptionSnapshot.week = week;
  next.prescriptionSnapshot.dayNumber = day;
  return next;
}

function topResult(base: WorkoutSession, id: string, time: number, reps: number, load: number, unit: 'lb' | 'kg' = 'lb'): WorkoutSession {
  const next = positioned(base, 1, 1, id, time);
  next.exercises = [structuredClone(base.exercises[0])];
  next.exercises[0].exerciseId = 'back-squat';
  next.exercises[0].exerciseName = 'Back Squat';
  next.exercises[0].sets = [structuredClone(base.exercises[0].sets[0])];
  Object.assign(next.exercises[0].sets[0], { completed: true, actualReps: reps, load, unit, type: 'rm_target' });
  return next;
}

test('cycle-completion encouragement requires all 48 unique full sessions and Week 12 Day 4', () => {
  const base = completeSession(profile(), 1, 1, 100);
  const history: WorkoutSession[] = [];
  let index = 0;
  for (let week = 1; week <= 12; week += 1) {
    for (let day = 1; day <= 4; day += 1) {
      if (week === 12 && day === 4) continue;
      index += 1;
      history.push(positioned(base, week, day, `h-${week}-${day}`, 1_000 + index));
    }
  }
  const current = positioned(base, 12, 4, 'current', 2_000);
  assert.equal(isVerifiedCycleComplete(current, history), true);
  assert.match(generateSessionEncouragement({ tone: 'minimal', history, currentSession: current }), /All 48/);

  const missing = history.slice(1);
  assert.equal(isVerifiedCycleComplete(current, missing), false);
  assert.doesNotMatch(generateSessionEncouragement({ tone: 'minimal', history: missing, currentSession: current }), /All 48|full 12-week/i);
  const earlyWeek12 = positioned(base, 12, 1, 'early', 2_100);
  assert.equal(isVerifiedCycleComplete(earlyWeek12, history), false);
});

test('partial, skipped, demo, and duplicate records never support false completion claims', () => {
  const base = completeSession(profile(), 1, 1, 100);
  const partial = { ...positioned(base, 12, 4, 'partial', 200), status: 'partial' as const, isPartial: true };
  const message = generateSessionEncouragement({ tone: 'minimal', history: [], currentSession: partial });
  assert.match(message, /Partial session saved/);
  assert.doesNotMatch(message, /all prescribed sets|All 48/i);
  const skipped = { ...positioned(base, 12, 4, 'skip', 201), status: 'skipped' as const, isSkipped: true };
  assert.match(generateSessionEncouragement({ tone: 'minimal', history: [], currentSession: skipped }), /Skipped session recorded/);

  const current = positioned(base, 2, 1, 'same-id', Date.now());
  const duplicate = structuredClone(current);
  const demo = { ...positioned(base, 1, 2, 'demo', Date.now()), isDemo: true };
  const partialHistory = { ...positioned(base, 1, 3, 'partial-history', Date.now()), status: 'partial' as const, isPartial: true };
  // Half of its sets logged: a partial workout counts toward the week in proportion (0.5 of a session).
  partialHistory.exercises.flatMap((exercise) => exercise.sets).forEach((set, index) => { if (index % 2 === 1) set.completed = false; });
  const countMessage = generateSessionEncouragement({ tone: 'minimal', history: [duplicate, demo, partialHistory], currentSession: current, weeklyGoalSessions: 4 });
  assert.match(countMessage, /1\.5 of 4/, 'full workout (1) + half a partial (0.5); demo and duplicate add nothing');
});

test('comparable results match stable exercise identity, actual reps, normalized units, and distinguish previous improvement from PR', () => {
  const base = completeSession(profile(), 1, 1, 100);
  const oldBest = topResult(base, 'old-best', 100, 5, 110);
  const previous = topResult(base, 'previous', 200, 5, 90);
  const current = topResult(base, 'current', 300, 5, 100);
  assert.deepEqual(findComparableResult(current, [oldBest, previous]), {
    kind: 'previous_improvement', exerciseId: 'back-squat', exerciseName: 'Back Squat', reps: 5, load: 100, unit: 'lb',
    previousSessionLoad: 90, allTimeBestLoad: 110, deltaVsPrevious: 10, deltaVsBest: -10,
  });

  const pr = topResult(base, 'pr', 400, 5, 115);
  assert.equal(findComparableResult(pr, [oldBest, previous])!.kind, 'all_time_pr');
  const differentReps = topResult(base, 'different-reps', 500, 4, 200);
  assert.equal(findComparableResult(current, [differentReps]), null);
  const differentExercise = topResult(base, 'different-exercise', 500, 5, 200);
  differentExercise.exercises[0].exerciseId = 'front-squat';
  assert.equal(findComparableResult(current, [differentExercise]), null);

  const metricPrior = topResult(base, 'metric-prior', 600, 5, 220.462262, 'lb');
  const metricCurrent = topResult(base, 'metric-current', 700, 5, 101, 'kg');
  const normalized = findComparableResult(metricCurrent, [metricPrior])!;
  assert.equal(normalized.kind, 'all_time_pr');
  assert.ok(Math.abs((normalized.deltaVsBest ?? 0) - 1) < 0.001);
});

test('actual RM mismatch and tone off produce truthful output', () => {
  const base = completeSession(profile(), 7, 1, 100);
  const current = topResult(base, 'mismatch', Date.now(), 5, 200);
  current.exercises[0].sets[0].prescribedReps = 6;
  const message = generateSessionEncouragement({ tone: 'minimal', history: [], currentSession: current });
  assert.doesNotMatch(message, /successful.*6RM|hit.*6RM/i);
  assert.equal(generateSessionEncouragement({ tone: 'off', history: [], currentSession: current }), '');
});
