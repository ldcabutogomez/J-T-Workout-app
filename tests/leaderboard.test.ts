import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLeaderboard, calendarDaysSince, computeCompliance, parseSnapshot, scoreFrom, SCORE_WEIGHTS, snapshotFromHistory, statsFromSnapshot } from '../src/engine/leaderboard';
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

test('weekly compliance is this week against the goal, capped at the goal', () => {
  const base = completeSession();
  const three = [0, 1, 2].map((i) => at(base, `t${i}`, 'p1', NOW - 1000 * (i + 1)));
  assert.equal(computeCompliance(three, 2, NOW), 100, 'three sessions against a goal of two is capped');
  assert.equal(computeCompliance(three.slice(0, 1), 2, NOW), 50);
  assert.equal(computeCompliance(three.slice(0, 1), 4, NOW), 25);
});

test('last week does not count toward this week\'s compliance', () => {
  const base = completeSession();
  assert.equal(computeCompliance([at(base, 'a', 'p1', NOW - 7 * DAY), at(base, 'b', 'p1', NOW - 14 * DAY)], 2, NOW), 0);
});

test('partner with no history gets zeros and no winner credit', () => {
  const base = completeSession();
  const board = buildLeaderboard([lauren, luis], { p1: [at(base, 'a', 'p1', NOW - 1000)], p2: [] }, NOW);
  const quiet = board.ranked.find((s) => s.profileId === 'p2')!;
  assert.equal(quiet.weeklyCompliancePct, 0);
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
    p1: [at(base, 'a', 'p1', NOW - 1000)],
    p2: [at(base, 'b', 'p2', NOW - 2000)],
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
  assert.equal(board.ranked[0].weeklyCompliancePct, 0);
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

test('days since last session count calendar days, not 24-hour windows', () => {
  const eightPmYesterday = new Date(2024, 4, 14, 20).getTime();
  const sixAmToday = new Date(2024, 4, 15, 6).getTime();
  assert.equal(calendarDaysSince(eightPmYesterday, sixAmToday), 1, 'trained yesterday evening is yesterday');
  assert.equal(calendarDaysSince(new Date(2024, 4, 15, 0, 5).getTime(), new Date(2024, 4, 15, 23, 55).getTime()), 0, 'same calendar day');
  assert.equal(calendarDaysSince(new Date(2024, 4, 14, 23, 59).getTime(), new Date(2024, 4, 15, 0, 1).getTime()), 1, 'across midnight');
  assert.equal(calendarDaysSince(new Date(2024, 2, 9, 22).getTime(), new Date(2024, 2, 10, 8).getTime()), 1, 'US DST change day');
  assert.equal(calendarDaysSince(NOW + DAY, NOW), 0, 'a future timestamp never goes negative');
});

const heavier = (base: WorkoutSession, factor: number): WorkoutSession => {
  const next = structuredClone(base);
  next.exercises.forEach((e) => e.sets.forEach((set) => { if (set.load !== null) set.load *= factor; }));
  return next;
};

test('a lighter lifter who trains consistently outranks a much heavier one who barely trains', () => {
  const base = completeSession();
  const goal3 = (id: string, name: string) => profile({ id, name, weeklyGoalSessions: 3 });
  const board = buildLeaderboard([goal3('weak', 'Weak'), goal3('strong', 'Strong')], {
    weak: [0, 1, 2].map((i) => at(heavier(base, 0.4), `w${i}`, 'weak', NOW - DAY * (i % 3) - 1000 * i)),
    strong: [at(heavier(base, 3), 's0', 'strong', NOW - 1000)],
  }, NOW);
  const weak = board.ranked.find((s) => s.profileId === 'weak')!;
  const strong = board.ranked.find((s) => s.profileId === 'strong')!;
  assert.ok(strong.volumeLb > weak.volumeLb, 'the stronger lifter has more raw volume');
  assert.equal(weak.weeklyCompliancePct, 100);
  assert.equal(strong.weeklyCompliancePct, 33);
  assert.equal(board.ranked[0].profileId, 'weak', 'raw pounds do not decide the ranking');
  assert.ok(weak.score > strong.score);
});

test('the score reweights over the parts a lifter has a baseline for', () => {
  assert.equal(Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0), 100);
  const full = scoreFrom([
    { key: 'compliance', value: 100 }, { key: 'consistency', value: 100 }, { key: 'volume', value: 100 }, { key: 'prs', value: 100 }, { key: 'strength', value: 100 },
  ]);
  assert.equal(full.score, 100);
  assert.deepEqual(full.scoreParts.map((part) => part.weightPct), [35, 20, 15, 15, 15]);
  const partial = scoreFrom([
    { key: 'compliance', value: 100 }, { key: 'consistency', value: 0 }, { key: 'volume', value: null }, { key: 'prs', value: null }, { key: 'strength', value: null },
  ]);
  assert.equal(partial.score, Math.round((100 * 35) / 55), 'compliance 35 of the 55 present');
  assert.deepEqual(partial.scoreParts.map((part) => part.weightPct), [64, 36, 0, 0, 0]);
  assert.equal(scoreFrom([{ key: 'compliance', value: null }]).score, 0);
});

test('volume, PR and strength trends are measured against the lifter\'s own earlier weeks', () => {
  const base = completeSession();
  const p = profile({ id: 'p1', name: 'Lauren', weeklyGoalSessions: 2 });
  // Four earlier weeks at normal load, then the last four weeks at 1.5x the load.
  const earlier = [5, 6, 7, 8].map((w) => at(base, `e${w}`, 'p1', NOW - w * 7 * DAY));
  const recent = [1, 2, 3, 4].map((w) => at(heavier(base, 1.5), `r${w}`, 'p1', NOW - w * 7 * DAY));
  const stats = statsFromSnapshot(snapshotFromHistory(p, [...earlier, ...recent], NOW), NOW);
  assert.equal(stats.volumeTrendPct, 50, 'volume up 50% on the previous four weeks');
  assert.ok(stats.strengthTrendPct !== null && stats.strengthTrendPct > 0, 'estimated 1RM is up');
  assert.ok(stats.prPerSession !== null && stats.prPerSession >= 0);
  const stopped = statsFromSnapshot(snapshotFromHistory(p, earlier, NOW), NOW);
  assert.equal(stopped.volumeTrendPct, -100, 'trained before, nothing in the last four weeks');
  const noBaseline = statsFromSnapshot(snapshotFromHistory(p, recent, NOW), NOW);
  assert.equal(noBaseline.volumeTrendPct, null, 'no earlier weeks to compare with');
  assert.equal(noBaseline.scoreParts.find((part) => part.key === 'volume')!.weightPct, 0);
});

test('the new snapshot fields are optional, validated and survive JSON; older snapshots still score', () => {
  const base = completeSession();
  const p = profile({ id: 'p1', name: 'Lauren' });
  const snap = snapshotFromHistory(p, [at(base, 'a', 'p1', NOW - 7 * DAY)], NOW, 'dev-12345678');
  const wire = parseSnapshot(JSON.parse(JSON.stringify(snap)))!;
  assert.deepEqual(wire.volumeWeekly, snap.volumeWeekly);
  assert.ok(JSON.stringify(snap).length < 7_500);
  const legacy = { ...JSON.parse(JSON.stringify(snap)) } as Record<string, unknown>;
  delete legacy.volumeWeekly; delete legacy.prWeekly; delete legacy.strengthTrendPct;
  const old = statsFromSnapshot(parseSnapshot(legacy)!, NOW);
  assert.equal(old.volumeTrendPct, null);
  assert.equal(old.prPerSession, null);
  assert.equal(old.strengthTrendPct, null);
  assert.ok(old.scoreParts.filter((part) => part.value === null).length >= 3);
  const bad = parseSnapshot({ ...JSON.parse(JSON.stringify(snap)), volumeWeekly: { 'not-a-date': 5 }, prWeekly: { '2024-05-06': -1 }, strengthTrendPct: 'x' })!;
  assert.equal(bad.volumeWeekly, undefined);
  assert.equal(bad.prWeekly, undefined);
  assert.equal(bad.strengthTrendPct, undefined);
  assert.equal(parseSnapshot({ ...JSON.parse(JSON.stringify(snap)), strengthTrendPct: -12.5 })!.strengthTrendPct, -12.5);
});
