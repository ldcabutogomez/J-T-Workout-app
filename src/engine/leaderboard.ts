import type { AvatarColor, ColorTheme, UserProfile, WorkoutSession } from '../types';
import { AVATAR_COLORS, AVATAR_THUMB_MAX_CHARS, isJpegDataUrl } from '../lib/avatar';
import { isColorTheme, themeForProfile } from '../lib/theme';
import { liftOf, nextWorkout, defaultSchedule, isWeekCode, todayKey, weekCodes } from './schedule';
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
  avatar?: { thumb?: string; color?: AvatarColor };
  theme?: ColorTheme;
  workout?: LiveWorkout;
  today?: { week: number; day: number; lift: string };
  weekCodes?: string[];
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
  // Everything below is optional so phones on an older build still read (and are read by) this snapshot.
  /** Your picture for your partner: a 64 px thumbnail and your tile color. */
  avatar?: { thumb?: string; color?: AvatarColor };
  theme?: ColorTheme;
  /** Present only while a workout is in progress. Stats only, never set-by-set logs. */
  workout?: LiveWorkout;
  /** The workout planned for today, or the next one coming up. */
  today?: { week: number; day: number; lift: string };
  /** This week, Monday first: day number plus a status letter per workout, '' for a rest day. */
  weekCodes?: string[];
}

export interface LiveWorkout {
  week: number;
  day: number;
  lift: string;
  done: number;
  total: number;
  updatedAt: number;
}

/** A live workout older than this is treated as stale, so a closed app never claims you are still lifting. */
export const LIVE_FRESH_MS = 3 * 3_600_000;
export const isLiveFresh = (workout: LiveWorkout | undefined, now: number): workout is LiveWorkout =>
  Boolean(workout) && now - (workout as LiveWorkout).updatedAt >= 0 && now - (workout as LiveWorkout).updatedAt <= LIVE_FRESH_MS;

/** Largest snapshot we send. The server accepts 8192 bytes; the thumbnail is the first thing to go when close. */
export const SNAPSHOT_SOFT_LIMIT = 7_500;

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
  live?: { activeSession?: WorkoutSession | null },
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
  const snapshot: PartnerSnapshot = {
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
  if (live && profile.shareLive !== false) Object.assign(snapshot, liveFields(profile, history, now, live.activeSession ?? null));
  // Stay well under the server's cap: the thumbnail is the one big optional piece, so it goes first.
  if (JSON.stringify(snapshot).length > SNAPSHOT_SOFT_LIMIT && snapshot.avatar?.thumb) snapshot.avatar = { color: snapshot.avatar.color };
  return snapshot;
}

/** What a partner may see of you beyond stats: your picture and where you are in the program. Only if sharing is on. */
function liveFields(profile: UserProfile, history: WorkoutSession[], now: number, active: WorkoutSession | null): Partial<PartnerSnapshot> {
  const schedule = profile.schedule ?? defaultSchedule(profile, now, history);
  const today = todayKey(now);
  const out: Partial<PartnerSnapshot> = { theme: themeForProfile(profile) };
  if (profile.avatar?.thumb || profile.avatar?.color) out.avatar = { thumb: profile.avatar?.thumb, color: profile.avatar?.color };
  const next = nextWorkout(schedule, history, today);
  if (next) out.today = { week: next.week, day: next.day, lift: liftOf(next.week, next.day, profile).slice(0, 40) };
  out.weekCodes = weekCodes(schedule, history, today);
  if (active && !active.isEditingCompleted && active.status === 'active') {
    const sets = active.exercises.flatMap((exercise) => exercise.sets);
    out.workout = {
      week: active.week,
      day: active.day,
      lift: (active.exercises[0]?.exerciseName ?? liftOf(active.week, active.day, profile)).slice(0, 40),
      done: sets.filter((set) => set.completed).length,
      total: sets.length,
      updatedAt: now,
    };
  }
  return out;
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
  const extras = parseExtras(r);
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
    ...extras,
  };
}

const safeText = (value: unknown, max = 40): string | null =>
  typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f<>]/.test(value) ? value : null;
const int = (value: unknown, min: number, max: number): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null;

/**
 * The optional parts of a snapshot come from another phone and end up on screen (one in an <img src>), so each is
 * checked separately: a bad piece is dropped and the stats still show, never the other way round.
 */
function parseExtras(r: Record<string, unknown>): Partial<PartnerSnapshot> {
  const out: Partial<PartnerSnapshot> = {};
  if (r.avatar && typeof r.avatar === 'object') {
    const a = r.avatar as Record<string, unknown>;
    const avatar: { thumb?: string; color?: AvatarColor } = {};
    if (isJpegDataUrl(a.thumb, AVATAR_THUMB_MAX_CHARS)) avatar.thumb = a.thumb;
    if (typeof a.color === 'string' && (AVATAR_COLORS as readonly string[]).includes(a.color)) avatar.color = a.color as AvatarColor;
    if (avatar.thumb || avatar.color) out.avatar = avatar;
  }
  if (isColorTheme(r.theme)) out.theme = r.theme;
  if (r.today && typeof r.today === 'object') {
    const t = r.today as Record<string, unknown>;
    const week = int(t.week, 1, 12);
    const day = int(t.day, 1, 4);
    const lift = safeText(t.lift);
    if (week !== null && day !== null && lift) out.today = { week, day, lift };
  }
  if (r.workout && typeof r.workout === 'object') {
    const w = r.workout as Record<string, unknown>;
    const week = int(w.week, 1, 12);
    const day = int(w.day, 1, 4);
    const done = int(w.done, 0, 400);
    const total = int(w.total, 0, 400);
    const lift = safeText(w.lift);
    const updatedAt = typeof w.updatedAt === 'number' && Number.isFinite(w.updatedAt) && w.updatedAt >= 0 ? w.updatedAt : null;
    if (week !== null && day !== null && done !== null && total !== null && lift && updatedAt !== null && done <= total) {
      out.workout = { week, day, lift, done, total, updatedAt };
    }
  }
  if (Array.isArray(r.weekCodes) && r.weekCodes.length === 7 && r.weekCodes.every(isWeekCode)) out.weekCodes = r.weekCodes as string[];
  return out;
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
    avatar: snapshot.avatar,
    theme: snapshot.theme,
    workout: snapshot.workout,
    today: snapshot.today,
    weekCodes: snapshot.weekCodes,
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
