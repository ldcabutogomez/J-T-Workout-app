import type { UserProfile, WorkoutSession } from '../types';
import { countResults, deriveHighlights, streakFromCounts } from './achievements';
import { normalizeWeight } from './jnt2Engine';
import { countsTowardStats, validCompleted, weekStart, weeklyCounts } from './sessionValidity';

export type LeaderboardCategory = 'compliance' | 'streak' | 'volume' | 'prs';

export interface PartnerStats {
  profileId: string;
  name: string;
  weeklyCount: number;
  weeklyGoal: number;
  streakWeeks: number;
  /** Share of goal sessions hit over the last 4 full weeks, each week capped at its goal. 0-100. */
  compliancePct: number;
  /** Lifetime volume, always in lb so partners using different units compare fairly. */
  volumeLb: number;
  prCount: number;
  badgeCount: number;
  /** Fully finished workouts. */
  sessionsCompleted: number;
  /** Partial workouts that still count toward volume, PRs and (proportionally) the weekly goal. */
  partialSessions: number;
  currentWeek: number;
  currentDay: number;
  lastSessionAt: number | null;
  daysSinceLast: number | null;
  /** When this partner's data was last pushed from their phone. Absent for local profiles. */
  syncedAt?: number;
}

export interface Leaderboard {
  /** Sorted best first by compliance, then streak, volume and PRs. */
  ranked: PartnerStats[];
  /** Profile ids that lead each category. Empty when nobody has a positive value, several on a tie. */
  winners: Record<LeaderboardCategory, string[]>;
}

const DAY_MS = 86_400_000;
const COMPLIANCE_WEEKS = 4;
/** Weeks of per-week counts a snapshot carries. Enough for any realistic streak, still tiny. */
const SNAPSHOT_WEEKS = 26;
export const SNAPSHOT_VERSION = 1;

/**
 * Stats-only summary of one lifter, safe to send to a partner's device. It holds no set-level logs.
 * Weekly counts are keyed by the Monday date (YYYY-MM-DD) so the receiver can recompute "this week",
 * compliance and streak against its own clock instead of trusting values frozen when it was pushed.
 */
export interface PartnerSnapshot {
  v: typeof SNAPSHOT_VERSION;
  deviceId: string;
  profileId: string;
  name: string;
  weeklyGoal: number;
  weekly: Record<string, number>;
  volumeLb: number;
  prCount: number;
  badgeCount: number;
  sessionsCompleted: number;
  /** Optional so snapshots from phones on an older build still parse. */
  partialSessions?: number;
  currentWeek: number;
  currentDay: number;
  lastSessionAt: number | null;
  updatedAt: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const weekKey = (weekStartMs: number): string => {
  const d = new Date(weekStartMs);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const keyToWeekStart = (key: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : null;
};

export function snapshotFromHistory(
  profile: UserProfile,
  history: WorkoutSession[],
  now: number,
  deviceId = 'local',
): PartnerSnapshot {
  // Partial workouts count toward volume, PRs and session totals; the weekly numbers below weight them by sets finished.
  const counted = history.filter(countsTowardStats);
  const finished = counted.filter(validCompleted);
  const derived = deriveHighlights(history);
  let volumeLb = 0;
  let prCount = 0;
  for (const session of counted) {
    const highlights = derived.get(session.sessionId);
    if (!highlights) continue;
    volumeLb += normalizeWeight(highlights.totalVolume, session.settingsSnapshot.unit, 'lb');
    prCount += countResults(highlights.results, 'all_time_pr');
  }
  const counts = weeklyCounts(history);
  const thisWeek = weekStart(now);
  const weekly: Record<string, number> = {};
  for (let i = 0; i < SNAPSHOT_WEEKS; i++) {
    const week = new Date(thisWeek);
    week.setDate(week.getDate() - 7 * i);
    const count = counts.get(week.getTime()) ?? 0;
    if (count > 0) weekly[weekKey(week.getTime())] = Math.round(count * 100) / 100;
  }
  const last = counted.reduce<number | null>((best, s) => {
    const t = s.completedTime ?? s.startTime;
    return best === null || t > best ? t : best;
  }, null);
  return {
    v: SNAPSHOT_VERSION,
    deviceId,
    profileId: profile.id,
    name: profile.name,
    weeklyGoal: profile.weeklyGoalSessions ?? 4,
    weekly,
    volumeLb: Math.round(volumeLb),
    prCount,
    badgeCount: profile.unlockedBadges?.length ?? 0,
    sessionsCompleted: new Set(finished.map((s) => s.sessionId)).size,
    partialSessions: new Set(counted.map((s) => s.sessionId)).size - new Set(finished.map((s) => s.sessionId)).size,
    currentWeek: profile.currentWeek,
    currentDay: profile.currentDay,
    lastSessionAt: last,
    updatedAt: now,
  };
}

/** Compliance over the last 4 full weeks, each capped at the goal. 0-100. */
function complianceFromCounts(counts: Map<number, number>, goal: number, now: number): number {
  const thisWeek = weekStart(now);
  const target = Math.max(1, goal);
  let hit = 0;
  for (let i = 1; i <= COMPLIANCE_WEEKS; i++) {
    const week = new Date(thisWeek);
    week.setDate(week.getDate() - 7 * i);
    hit += Math.min(counts.get(week.getTime()) ?? 0, target);
  }
  return Math.round((hit / (target * COMPLIANCE_WEEKS)) * 100);
}

export function computeCompliance(sessions: WorkoutSession[], goal: number, now: number): number {
  return complianceFromCounts(weeklyCounts(sessions), goal, now);
}

/** Validates an untrusted snapshot from the backend. Returns null if it is malformed. */
export function parseSnapshot(raw: unknown): PartnerSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null);
  if (r.v !== SNAPSHOT_VERSION || typeof r.deviceId !== 'string' || typeof r.profileId !== 'string' || typeof r.name !== 'string') return null;
  const weeklyGoal = num(r.weeklyGoal);
  const volumeLb = num(r.volumeLb);
  const prCount = num(r.prCount);
  const badgeCount = num(r.badgeCount);
  const sessionsCompleted = num(r.sessionsCompleted);
  const currentWeek = num(r.currentWeek);
  const currentDay = num(r.currentDay);
  const updatedAt = num(r.updatedAt);
  if ([weeklyGoal, volumeLb, prCount, badgeCount, sessionsCompleted, currentWeek, currentDay, updatedAt].some((x) => x === null)) return null;
  const partialSessions = r.partialSessions === undefined ? 0 : num(r.partialSessions);
  if (partialSessions === null) return null;
  const lastSessionAt = r.lastSessionAt === null ? null : num(r.lastSessionAt);
  if (r.lastSessionAt !== null && lastSessionAt === null) return null;
  const weekly: Record<string, number> = {};
  if (!r.weekly || typeof r.weekly !== 'object') return null;
  for (const [key, value] of Object.entries(r.weekly as Record<string, unknown>)) {
    const count = num(value);
    if (keyToWeekStart(key) === null || count === null) return null;
    weekly[key] = count;
  }
  return {
    v: SNAPSHOT_VERSION,
    deviceId: r.deviceId,
    profileId: r.profileId,
    name: r.name.slice(0, 40),
    weeklyGoal: weeklyGoal as number,
    weekly,
    volumeLb: volumeLb as number,
    prCount: prCount as number,
    badgeCount: badgeCount as number,
    sessionsCompleted: sessionsCompleted as number,
    partialSessions,
    currentWeek: currentWeek as number,
    currentDay: currentDay as number,
    lastSessionAt,
    updatedAt: updatedAt as number,
  };
}

export function statsFromSnapshot(snapshot: PartnerSnapshot, now: number): PartnerStats {
  const counts = new Map<number, number>();
  for (const [key, value] of Object.entries(snapshot.weekly)) {
    const ts = keyToWeekStart(key);
    if (ts !== null) counts.set(ts, value);
  }
  const streak = streakFromCounts(counts, snapshot.weeklyGoal, now);
  return {
    profileId: snapshot.profileId,
    name: snapshot.name,
    weeklyCount: streak.weeklyCount,
    weeklyGoal: streak.weeklyGoal,
    streakWeeks: streak.streakWeeks,
    compliancePct: complianceFromCounts(counts, snapshot.weeklyGoal, now),
    volumeLb: snapshot.volumeLb,
    prCount: snapshot.prCount,
    badgeCount: snapshot.badgeCount,
    sessionsCompleted: snapshot.sessionsCompleted,
    partialSessions: snapshot.partialSessions ?? 0,
    currentWeek: snapshot.currentWeek,
    currentDay: snapshot.currentDay,
    lastSessionAt: snapshot.lastSessionAt,
    daysSinceLast: snapshot.lastSessionAt === null ? null : Math.max(0, Math.floor((now - snapshot.lastSessionAt) / DAY_MS)),
    syncedAt: snapshot.updatedAt,
  };
}

export function computePartnerStats(profile: UserProfile, history: WorkoutSession[], now: number): PartnerStats {
  return statsFromSnapshot(snapshotFromHistory(profile, history, now), now);
}

function leaders(stats: PartnerStats[], value: (s: PartnerStats) => number): string[] {
  const max = Math.max(0, ...stats.map(value));
  return max > 0 ? stats.filter((s) => value(s) === max).map((s) => s.profileId) : [];
}

export function rankStats(stats: PartnerStats[]): Leaderboard {
  const ranked = [...stats].sort((a, b) =>
    b.compliancePct - a.compliancePct
    || b.streakWeeks - a.streakWeeks
    || b.volumeLb - a.volumeLb
    || b.prCount - a.prCount);
  return {
    ranked,
    winners: {
      compliance: leaders(stats, (s) => s.compliancePct),
      streak: leaders(stats, (s) => s.streakWeeks),
      volume: leaders(stats, (s) => s.volumeLb),
      prs: leaders(stats, (s) => s.prCount),
    },
  };
}

/** Same-device leaderboard: every local profile, ranked. */
export function buildLeaderboard(
  profiles: UserProfile[],
  historyByProfile: Record<string, WorkoutSession[]>,
  now = Date.now(),
): Leaderboard {
  return rankStats(profiles.map((p) => computePartnerStats(p, historyByProfile[p.id] ?? [], now)));
}

export interface BoardInput {
  profiles: UserProfile[];
  historyByProfile: Record<string, WorkoutSession[]>;
  /** The local profile this phone is paired as, when partner sync is active. */
  pairedProfileId: string | null;
  /** Snapshots pulled from partner phones (this phone's own already removed). */
  remote: PartnerSnapshot[];
  now?: number;
}

/**
 * The Together leaderboard. Your own row is always built from local history, so it reflects a workout the
 * moment it is saved: never gated on pairing, a finished sync, or a partner being present.
 */
export function composeBoard({ profiles, historyByProfile, pairedProfileId, remote, now = Date.now() }: BoardInput): Leaderboard {
  const mine = pairedProfileId ? profiles.find((item) => item.id === pairedProfileId) : undefined;
  if (!mine) return buildLeaderboard(profiles, historyByProfile, now);
  return rankStats([
    computePartnerStats(mine, historyByProfile[mine.id] ?? [], now),
    ...remote.map((item) => ({ ...statsFromSnapshot(item, now), profileId: `remote:${item.deviceId}` })),
  ]);
}
