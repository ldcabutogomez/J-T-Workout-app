import assert from 'node:assert/strict';
import test from 'node:test';
import { levelBadges, computeXp, levelFromXp, xpForLevel, XP_PER_BADGE, XP_PER_SET, XP_PER_WORKOUT } from '../src/engine/xp';
import { completeSession, profile } from './helpers';

test('the level curve rises with each level', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(xpForLevel), [0, 100, 300, 600, 1000]);
  assert.equal(levelFromXp(0).level, 1);
  assert.equal(levelFromXp(99).level, 1);
  assert.equal(levelFromXp(100).level, 2);
  const mid = levelFromXp(450);
  assert.equal(mid.level, 3);
  assert.equal(mid.into, 150);
  assert.equal(mid.span, 300);
  assert.equal(mid.pct, 50);
});

test('xp comes from sets, finished workouts and badges, and is derived from history', () => {
  const p = profile();
  const session = completeSession(p);
  const sets = session.exercises.reduce((n, e) => n + e.sets.filter((s) => s.completed).length, 0);
  const base = computeXp([session], p);
  assert.ok(base >= sets * XP_PER_SET + XP_PER_WORKOUT, 'sets and the finished-workout bonus count');
  assert.equal(computeXp([session], { ...p, unlockedBadges: [{ id: 'first_workout', unlockedAt: 1 }] }) - base, XP_PER_BADGE);
  assert.equal(computeXp([], p), 0);
  assert.equal(computeXp([session], p), base, 'same history, same xp');
});

test('The Battery is awarded from level 3', () => {
  assert.deepEqual(levelBadges(2), []);
  assert.deepEqual(levelBadges(3), ['the_battery']);
  assert.deepEqual(levelBadges(9), ['the_battery']);
});
