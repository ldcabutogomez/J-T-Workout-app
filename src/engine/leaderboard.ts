import type { AvatarColor, ColorTheme, UserProfile, WorkoutSession } from '../types';
import { AVATAR_COLORS, AVATAR_THUMB_MAX_CHARS, isJpegDataUrl } from '../lib/avatar';
import { isColorTheme, themeForProfile } from '../lib/theme';
import { liftOf, nextWorkout, defaultSchedule, fromDateKey, isWeekCode, todayKey, weekCodes } from './schedule';
import { countResults, deriveHighlights, streakFromCounts } from './achievements';
import { normalizeWeight } from './jnt2Engine';
import { levelFor } from './xp';
import { programExercises, requiredExercises } from './extras';
import { historyForCycle, profileCycleId } from './cycles';
import { batteryDebuff } from './debuff';
import { flairById, tauntText, type Taunt } from '../lib/perks';
import { countsTowardStats, validCompleted, weekStart, weeklyCounts } from './sessionValidity';
import { estimateOneRepMax, MAX_REPS_FOR_E1RM } from './trends';

export type LeaderboardCategory = 'compliance' | 'streak' | 'volume' | 'prs';

/**
 * The ranking is one weighted score. Every part is measured against the lifter's own recent baseline (hitting the
 * weekly goal, momentum, change in volume, PRs per session, change in estimated strength),  with raw pounds lifted worth only a share of it, so a
 * lighter lifter who trains consistently and improves ranks alongside a heavier one.
 */
export type ScoreKey = 'compliance' | 'consistency' | 'lifted' | 'volume' | 'prs' | 'strength';
export const SCORE_WEIGHTS: Record<ScoreKey, number> = { compliance: 30, consistency: 20, lifted: 15, volume: 10, prs: 15, strength: 10 };
export const SCORE_LABELS: Record<ScoreKey, string> = {
  compliance: 'Weekly compliance', consistency: 'Consistency', lifted: 'Lbs lifted', volume: 'Volume trend', prs: 'PR rate', strength: 'Strength trend',
};
/** Streak length that earns full consistency credit. */
export const STREAK_FULL_CREDIT_WEEKS = 8;
/** A PR on every other session is a full PR-rate score. */
export const PR_RATE_FULL_CREDIT = 0.5;
const TREND_WEEKS = 4;

export interface ScorePart {
  key: ScoreKey;
  label: string;
  /** 0-100, or null when this lifter has no baseline for it yet (its weight moves to the other parts). */
  value: number | null;
  /** This part's share of the total after any missing parts are reweighted, 0-100. */
  weightPct: number;
}

export interface PartnerStats {
  profileId: string;
  name: string;
  weeklyCount: number;
  weeklyGoal: number;
  streakWeeks: number;
  /** Share of this week's goal sessions done so far, capped at the goal. 0-100. */
  weeklyCompliancePct: number;
  /** Weighted 0-100 score the board is ranked by, and what it is made of. */
  score: number;
  scoreParts: ScorePart[];
  /** Change in average weekly volume: the last 4 full weeks against the 4 before. Null without that baseline. */
  volumeTrendPct: number | null;
  /** All-time PRs per finished session over the last 4 full weeks. Null with no sessions in that window. */
  prPerSession: number | null;
  /** Average change in estimated 1RM across lifts, recent weeks against earlier. Null with no overlap. */
  strengthTrendPct: number | null;
  /** Lifetime volume, always in lb so partners using different units compare fairly. */
  volumeLb: number;
  prCount: number;
  badgeCount: number;
  /** XP level, absent for partners on an older build. */
  level?: number;
  flair?: string;
  /** Set while the weekly-goal debuff (The Battery) is on; the time it ends. */
  batteryUntil?: number;
  taunt?: Taunt;
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
  /** Sorted best first by weighted score, then weekly compliance and streak. */
  ranked: PartnerStats[];
  /** Profile ids that lead each category. Empty when nobody has a positive value, several on a tie. */
  winners: Record<LeaderboardCategory, string[]>;
}

const DAY_MS = 86_400_000;

/** Whole local calendar days from `then` to `now`: 8pm yesterday is 1 day ago at 6am, not 0. */
export function calendarDaysSince(then: number, now: number): number {
  const days = Math.round((fromDateKey(todayKey(now)).getTime() - fromDateKey(todayKey(then)).getTime()) / DAY_MS);
  return Math.max(0, days);
}
/** Weeks of per-week counts a snapshot carries. Enough for any realistic streak, still tiny. */
const SNAPSHOT_WEEKS = 26;
/** Weeks of volume and PR history in a snapshot: this week plus two 4-week windows to compare. */
const TREND_SNAPSHOT_WEEKS = 9;
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
  /** Volume in lb per week and all-time PRs per week (Monday keys, this week and the 8 before, empty weeks omitted). The weighted score's baselines. */
  volumeWeekly?: Record<string, number>;
  prWeekly?: Record<string, number>;
  /** Average % change in estimated 1RM, recent weeks against earlier. Can be negative. */
  strengthTrendPct?: number;
  level?: number;
  flair?: string;
  batteryUntil?: number;
  taunt?: Taunt;
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
  const volumeByWeek = new Map<number, number>();
  const prsByWeek = new Map<number, number>();
  for (const session of counted) {
    const highlights = derived.get(session.sessionId);
    if (!highlights) continue;
    const lb = normalizeWeight(highlights.totalVolume, session.settingsSnapshot.unit, 'lb');
    const prs = countResults(highlights.results, 'all_time_pr');
    volumeLb += lb;
    prCount += prs;
    const week = weekStart(session.completedTime ?? session.startTime);
    volumeByWeek.set(week, (volumeByWeek.get(week) ?? 0) + lb);
    prsByWeek.set(week, (prsByWeek.get(week) ?? 0) + prs);
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
  const recentWeeks = (source: Map<number, number>) => {
    const out: Record<string, number> = {};
    for (let i = 0; i < TREND_SNAPSHOT_WEEKS; i++) {
      const week = new Date(thisWeek);
      week.setDate(week.getDate() - 7 * i);
      const value = source.get(week.getTime()) ?? 0;
      if (value > 0) out[weekKey(week.getTime())] = Math.round(value);
    }
    return out;
  };
  const strengthTrend = strengthTrendFromHistory(finished, now);
  const last = counted.reduce<number | null>((best, s) => {
    const t = s.completedTime ?? s.startTime;
    return best === null || t > best ? t : best;
  }, null);
  const battery = batteryDebuff(history, profile.weeklyGoalSessions ?? 4, now);
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
    volumeWeekly: recentWeeks(volumeByWeek),
    prWeekly: recentWeeks(prsByWeek),
    ...(strengthTrend === null ? {} : { strengthTrendPct: strengthTrend }),
    level: levelFor(history, profile).level,
    ...(flairById(profile.flair) ? { flair: profile.flair } : {}),
    ...(battery.active && battery.until !== null ? { batteryUntil: battery.until } : {}),
    ...(profile.taunt && tauntText(profile.taunt.id) !== undefined ? { taunt: profile.taunt } : {}),
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
  // The calendar only knows the cycle in progress; an earlier run through the program must not fill its slots.
  const cycleHistory = historyForCycle(history, profileCycleId(profile));
  const schedule = profile.schedule ?? defaultSchedule(profile, now, cycleHistory);
  const today = todayKey(now);
  const out: Partial<PartnerSnapshot> = { theme: themeForProfile(profile) };
  if (profile.avatar?.thumb || profile.avatar?.color) out.avatar = { thumb: profile.avatar?.thumb, color: profile.avatar?.color };
  const next = nextWorkout(schedule, cycleHistory, today);
  if (next) out.today = { week: next.week, day: next.day, lift: liftOf(next.week, next.day, profile).slice(0, 40) };
  out.weekCodes = weekCodes(schedule, cycleHistory, today);
  if (active && !active.isEditingCompleted && active.status === 'active') {
    // Program sessions exclude ad-hoc extras; every exercise in a custom workout is intentional.
    const exercises = requiredExercises(active);
    const sets = exercises.flatMap((exercise) => exercise.sets);
    out.workout = {
      week: active.week,
      day: active.day,
      lift: ((active.workoutKind === 'custom' ? active.customName : exercises[0]?.exerciseName ?? liftOf(active.week, active.day, profile)) ?? 'Custom workout').slice(0, 40),
      done: sets.filter((set) => set.completed).length,
      total: sets.length,
      updatedAt: now,
    };
  }
  return out;
}

/**
 * Average % change in estimated 1RM per lift: the strongest set in the last four full weeks plus this one, against the
 * strongest set before that. Only lifts trained in both windows count, and each lift's change is capped so one odd set
 * cannot decide the score. Null when no lift overlaps. Extras are left out, as they are everywhere else.
 */
function strengthTrendFromHistory(finished: WorkoutSession[], now: number): number | null {
  const cutoff = new Date(weekStart(now));
  cutoff.setDate(cutoff.getDate() - 7 * TREND_WEEKS);
  const recent = new Map<string, number>();
  const earlier = new Map<string, number>();
  for (const session of finished) {
    const into = (session.completedTime ?? session.startTime) >= cutoff.getTime() ? recent : earlier;
    for (const exercise of session.exercises) {
      if (exercise.isExtra) continue;
      for (const set of exercise.sets) {
        if (!set.completed || set.actualReps === null || set.load === null || set.actualReps < 1 || set.actualReps > MAX_REPS_FOR_E1RM) continue;
        const e1rm = estimateOneRepMax(normalizeWeight(set.load, set.unit, 'lb'), set.actualReps);
        if (e1rm > (into.get(exercise.exerciseId) ?? 0)) into.set(exercise.exerciseId, e1rm);
      }
    }
  }
  const changes: number[] = [];
  for (const [id, now1] of recent) {
    const before = earlier.get(id);
    if (before && before > 0) changes.push(Math.max(-30, Math.min(50, (now1 / before - 1) * 100)));
  }
  return changes.length === 0 ? null : Math.round((changes.reduce((sum, value) => sum + value, 0) / changes.length) * 10) / 10;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Sum of a per-week map over the full weeks `from`..`to` back from this week (1 is last week). */
function sumWeeks(source: Map<number, number>, now: number, from: number, to: number): number {
  const thisWeek = weekStart(now);
  let total = 0;
  for (let i = from; i <= to; i++) {
    const week = new Date(thisWeek);
    week.setDate(week.getDate() - 7 * i);
    total += source.get(week.getTime()) ?? 0;
  }
  return total;
}

/** This week's sessions against the weekly goal, capped at the goal. 0-100. */
function weeklyComplianceFromCounts(counts: Map<number, number>, goal: number, now: number): number {
  return Math.round((Math.min(counts.get(weekStart(now)) ?? 0, Math.max(1, goal)) / Math.max(1, goal)) * 100);
}

export function computeCompliance(sessions: WorkoutSession[], goal: number, now: number): number {
  return weeklyComplianceFromCounts(weeklyCounts(sessions), goal, now);
}

/** The weighted score. A part with no baseline yet is left out and its weight is shared by the others. */
export function scoreFrom(parts: Array<{ key: ScoreKey; value: number | null }>): { score: number; scoreParts: ScorePart[] } {
  const present = parts.filter((part) => part.value !== null);
  const total = present.reduce((sum, part) => sum + SCORE_WEIGHTS[part.key], 0);
  const scoreParts = parts.map((part): ScorePart => ({
    key: part.key,
    label: SCORE_LABELS[part.key],
    value: part.value === null ? null : Math.round(part.value),
    weightPct: part.value === null || total === 0 ? 0 : Math.round((SCORE_WEIGHTS[part.key] / total) * 100),
  }));
  const score = total === 0 ? 0 : present.reduce((sum, part) => sum + (part.value as number) * SCORE_WEIGHTS[part.key], 0) / total;
  return { score: Math.round(score), scoreParts };
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

/** A per-week map from another phone: Monday keys to non-negative numbers, at most a dozen weeks, or dropped whole. */
function parseWeekMap(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 12) return undefined;
  const out: Record<string, number> = {};
  for (const [key, item] of entries) {
    if (keyToWeekStart(key) === null || typeof item !== 'number' || !Number.isFinite(item) || item < 0) return undefined;
    out[key] = item;
  }
  return out;
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
  const volumeWeekly = parseWeekMap(r.volumeWeekly);
  if (volumeWeekly) out.volumeWeekly = volumeWeekly;
  const prWeekly = parseWeekMap(r.prWeekly);
  if (prWeekly) out.prWeekly = prWeekly;
  if (typeof r.strengthTrendPct === 'number' && Number.isFinite(r.strengthTrendPct) && r.strengthTrendPct >= -100 && r.strengthTrendPct <= 1000) out.strengthTrendPct = r.strengthTrendPct;
  const level = int(r.level, 1, 99);
  if (level !== null) out.level = level;
  if (flairById(r.flair)) out.flair = r.flair as string;
  if (typeof r.batteryUntil === 'number' && Number.isFinite(r.batteryUntil) && r.batteryUntil > 0) out.batteryUntil = r.batteryUntil;
  if (r.taunt && typeof r.taunt === 'object') {
    const t = r.taunt as Record<string, unknown>;
    const at = typeof t.at === 'number' && Number.isFinite(t.at) ? t.at : null;
    if (tauntText(t.id) !== undefined && at !== null) out.taunt = { id: t.id as number, at };
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
  const weekMap = (source: Record<string, number> | undefined) => {
    const map = new Map<number, number>();
    for (const [key, value] of Object.entries(source ?? {})) {
      const ts = keyToWeekStart(key);
      if (ts !== null) map.set(ts, value);
    }
    return map;
  };
  const volumeMap = weekMap(snapshot.volumeWeekly);
  const prMap = weekMap(snapshot.prWeekly);
  const recentVolume = sumWeeks(volumeMap, now, 1, TREND_WEEKS);
  const priorVolume = sumWeeks(volumeMap, now, TREND_WEEKS + 1, TREND_WEEKS * 2);
  const volumeTrendPct = snapshot.volumeWeekly && priorVolume > 0 ? Math.round((recentVolume / priorVolume - 1) * 100) : null;
  const recentCredit = sumWeeks(counts, now, 1, TREND_WEEKS);
  const prPerSession = snapshot.prWeekly && recentCredit >= 1 ? Math.round((sumWeeks(prMap, now, 1, TREND_WEEKS) / recentCredit) * 100) / 100 : null;
  const strengthTrendPct = snapshot.strengthTrendPct ?? null;
  const weeklyCompliancePct = weeklyComplianceFromCounts(counts, snapshot.weeklyGoal, now);
  const { score, scoreParts } = scoreFrom([
    { key: 'compliance', value: weeklyCompliancePct },
    { key: 'consistency', value: clamp((streak.streakWeeks / STREAK_FULL_CREDIT_WEEKS) * 100, 0, 100) },
    // Lbs lifted is scored against the rest of the board in rankStats, so it is filled in there.
    { key: 'lifted', value: null },
    { key: 'volume', value: volumeTrendPct === null ? null : clamp(50 + volumeTrendPct, 0, 100) },
    { key: 'prs', value: prPerSession === null ? null : clamp((prPerSession / PR_RATE_FULL_CREDIT) * 100, 0, 100) },
    { key: 'strength', value: strengthTrendPct === null ? null : clamp(50 + strengthTrendPct * 5, 0, 100) },
  ]);
  return {
    profileId: snapshot.profileId,
    name: snapshot.name,
    weeklyCount: streak.weeklyCount,
    weeklyGoal: streak.weeklyGoal,
    streakWeeks: streak.streakWeeks,
    weeklyCompliancePct,
    score,
    scoreParts,
    volumeTrendPct,
    prPerSession,
    strengthTrendPct,
    volumeLb: snapshot.volumeLb,
    prCount: snapshot.prCount,
    badgeCount: snapshot.badgeCount,
    level: snapshot.level,
    flair: snapshot.flair,
    batteryUntil: snapshot.batteryUntil,
    taunt: snapshot.taunt,
    sessionsCompleted: snapshot.sessionsCompleted,
    partialSessions: snapshot.partialSessions ?? 0,
    currentWeek: snapshot.currentWeek,
    currentDay: snapshot.currentDay,
    lastSessionAt: snapshot.lastSessionAt,
    daysSinceLast: snapshot.lastSessionAt === null ? null : calendarDaysSince(snapshot.lastSessionAt, now),
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

/** Raw lbs lifted is a real part of the score (15%), measured as a share of the biggest total on the board. */
function withLiftedScore(stats: PartnerStats[]): PartnerStats[] {
  const top = Math.max(0, ...stats.map((s) => s.volumeLb));
  return stats.map((s) => {
    const parts = s.scoreParts.map((part) => ({ key: part.key, value: part.key === 'lifted' ? (top > 0 ? (s.volumeLb / top) * 100 : null) : part.value }));
    return { ...s, ...scoreFrom(parts) };
  });
}

export function rankStats(input: PartnerStats[]): Leaderboard {
  const stats = withLiftedScore(input);
  const ranked = [...stats].sort((a, b) =>
    b.score - a.score
    || b.weeklyCompliancePct - a.weeklyCompliancePct
    || b.streakWeeks - a.streakWeeks
    || b.sessionsCompleted - a.sessionsCompleted);
  return {
    ranked,
    winners: {
      compliance: leaders(stats, (s) => s.weeklyCompliancePct),
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
