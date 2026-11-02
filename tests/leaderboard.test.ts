import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLeaderboard, computeCompliance } from '../src/engine/leaderboard';
import type { WorkoutSession } from '../src/types';
import { completeSession, profile } from './helpers';

const DAY = 86_400_000;
// Wednesday 2024-05-15 12:00 local time.
const NOW = new Date(2024, 4, 15, 12).getTime();

function at(base: WorkoutSession, id: string, profileId: string, time: number): WorkoutSession {
  const next = structuredClone(base);
  next.sessionId = id;
  next.profileId = profileId;
  next.startTime = time - 3_600_000;
  next.completedTime = time;
  return next;
}

const lauren = profile({ id: 'p1', name: 'Lauren', weeklyGoalSessions: 2 });
const luis = profile({ id: 'p2', name: 'Luis', weeklyGoalSessions: 2 });

test('compliance counts the last 4 full weeks, capped at the goal', () => {
  const base = completeSession();
  // Last week: 3 sessions (capped to goal 2). Two weeks ago: 1 session. Others: none.
  const sessions = [
    at(base, 'a', 'p1', NOW - 7 * DAY),
    at(base, 'b', 'p1', NOW - 7 * DAY - 1000),
    at(base, 'c', 'p1', NOW - 7 * DAY - 2000),
    at(base, 'd', 'p1', NOW - 14 * DAY),
  ];
  assert.equal(computeCompliance(sessions, 2, NOW), Math.round((3 / 8) * 100));
});

test('current partial week does not affect compliance', () => {
  const base = completeSession();
  assert.equal(computeCompliance([at(base, 'a', 'p1', NOW - 1000)], 2, NOW), 0);
});

test('partner with no history gets zeros and no winner credit', () => {
  const base = completeSession();
  const board = buildLeaderboard([lauren, luis], { p1: [at(base, 'a', 'p1', NOW - 7 * DAY)], p2: [] }, NOW);
  const quiet = board.ranked.find((s) => s.profileId === 'p2')!;
  assert.equal(quiet.compliancePct, 0);
  assert.equal(quiet.lastSessionAt, null);
  assert.equal(quiet.daysSinceLast, null);
  assert.deepEqual(board.winners.compliance, ['p1']);
  assert.equal(board.ranked[0].profileId, 'p1');
});

test('nobody has history: no winners', () => {
  const board = buildLeaderboard([lauren, luis], {}, NOW);
  assert.deepEqual(board.winners, { compliance: [], streak: [], volume: [], prs: [] });
});

test('ties share a category win', () => {
  const base = completeSession();
  const board = buildLeaderboard([lauren, luis], {
    p1: [at(base, 'a', 'p1', NOW - 7 * DAY)],
    p2: [at(base, 'b', 'p2', NOW - 7 * DAY)],
  }, NOW);
  assert.deepEqual([...board.winners.compliance].sort(), ['p1', 'p2']);
});

test('demo and skipped sessions are excluded', () => {
  const base = completeSession();
  const demo = at(base, 'demo', 'p1', NOW - 7 * DAY);
  demo.isDemo = true;
  const skipped = at(base, 'skip', 'p1', NOW - 7 * DAY);
  skipped.status = 'skipped';
  skipped.isSkipped = true;
  const board = buildLeaderboard([lauren], { p1: [demo, skipped] }, NOW);
  assert.equal(board.ranked[0].sessionsCompleted, 0);
  assert.equal(board.ranked[0].compliancePct, 0);
});

test('volume is compared in lb across units', () => {
  const base = completeSession();
  const kg = structuredClone(base);
  kg.settingsSnapshot.unit = 'kg';
  kg.exercises.forEach((e) => e.sets.forEach((s) => { s.unit = 'kg'; }));
  const board = buildLeaderboard([lauren, luis], {
    p1: [at(base, 'a', 'p1', NOW - DAY)],
    p2: [at(kg, 'b', 'p2', NOW - DAY)],
  }, NOW);
  const lb = board.ranked.find((s) => s.profileId === 'p1')!.volumeLb;
  const fromKg = board.ranked.find((s) => s.profileId === 'p2')!.volumeLb;
  assert.ok(fromKg > lb * 2, 'same numbers in kg are ~2.2x the lb volume');
});

test('days since last session', () => {
  const base = completeSession();
  const board = buildLeaderboard([lauren], { p1: [at(base, 'a', 'p1', NOW - 3 * DAY)] }, NOW);
  assert.equal(board.ranked[0].daysSinceLast, 3);
});
