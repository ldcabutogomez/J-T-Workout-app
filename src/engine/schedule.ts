import type { ProfileSchedule, UserProfile, WorkoutSession } from '../types';
import { getDayPrescription } from '../program/prescriptions';
import { sessionCredit } from './sessionValidity';

/**
 * The program calendar. A workout is a (week, day) slot; its date is the schedule anchor plus the day's
 * weekday offset, unless the lifter dragged it somewhere. Whether a slot is done always comes from history,
 * never from the date, so doing workouts out of order is safe.
 */

export type DateKey = string; // local calendar date, YYYY-MM-DD
export type SlotKey = string; // 'W3D2'

export const DEFAULT_DAYS = [0, 1, 3, 4]; // Mon, Tue, Thu, Fri
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const pad = (n: number) => String(n).padStart(2, '0');

export const toDateKey = (date: Date): DateKey => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
/** Parsed at local noon so a daylight-saving change can never move the date. */
export const fromDateKey = (key: DateKey): Date => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};
export const todayKey = (now: number = Date.now()): DateKey => toDateKey(new Date(now));

export function addDays(key: DateKey, days: number): DateKey {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export function mondayOf(key: DateKey): DateKey {
  const d = fromDateKey(key);
  return addDays(key, -((d.getDay() + 6) % 7));
}

export const isDateKey = (value: unknown): value is DateKey =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && toDateKey(fromDateKey(value)) === value;

export const slotKey = (week: number, day: number): SlotKey => `W${week}D${day}`;
export function parseSlotKey(key: string): { week: number; day: number } | null {
  const m = /^W(\d{1,2})D([1-4])$/.exec(key);
  if (!m) return null;
  const week = Number(m[1]);
  return week >= 1 && week <= 12 ? { week, day: Number(m[2]) } : null;
}

export interface Slot { week: number; day: number }

/** All 48 workouts in program order. */
export const ALL_SLOTS: Slot[] = Array.from({ length: 12 }, (_, w) =>
  Array.from({ length: 4 }, (_, d) => ({ week: w + 1, day: d + 1 })),
).flat();

// ---- What is done: always derived from history, never from the stored pointer. ----

export type DoneStatus = 'completed' | 'partial' | 'skipped';
const RANK: Record<DoneStatus, number> = { completed: 3, partial: 2, skipped: 1 };

export interface DoneInfo { status: DoneStatus; date: DateKey; credit: number; lift?: string }

/** Slots with a finished, partial or skipped session (demo sessions never count). The best status wins. */
export function doneSlots(history: WorkoutSession[]): Map<SlotKey, DoneInfo> {
  const done = new Map<SlotKey, DoneInfo>();
  for (const session of history) {
    if (session.isDemo) continue;
    if (session.status !== 'completed' && session.status !== 'partial' && session.status !== 'skipped') continue;
    const key = slotKey(session.week, session.day);
    const status = session.status as DoneStatus;
    const prior = done.get(key);
    if (prior && RANK[prior.status] >= RANK[status]) continue;
    done.set(key, { status, date: todayKey(session.completedTime ?? session.startTime), credit: sessionCredit(session), lift: session.exercises[0]?.exerciseName });
  }
  return done;
}

export function firstUndone(done: Map<SlotKey, DoneInfo>): Slot | null {
  return ALL_SLOTS.find((slot) => !done.has(slotKey(slot.week, slot.day))) ?? null;
}

/** The program pointer after a session is counted: the first workout nobody has done yet. */
export function positionAfter(
  history: WorkoutSession[],
  session: WorkoutSession,
): Pick<UserProfile, 'currentWeek' | 'currentDay' | 'cycleCompleted'> {
  const next = firstUndone(doneSlots([...history.filter((item) => item.sessionId !== session.sessionId), session]));
  return next
    ? { currentWeek: next.week, currentDay: next.day, cycleCompleted: false }
    : { currentWeek: 12, currentDay: 4, cycleCompleted: true };
}

// ---- Where a workout sits ----

export function normalizeDays(days: number[] | undefined): number[] {
  return Array.isArray(days) && days.length === 4 ? days : DEFAULT_DAYS;
}

/**
 * Places the unfinished part of `week` starting from `today`, so nothing is "missed" before it could have
 * been done. The week lands in this calendar week; workouts whose day has already passed move to the next
 * free days, and if there are not enough days left this week, the week starts next Monday instead.
 */
export function planFromToday(week: number, history: WorkoutSession[], today: DateKey, days: number[] = DEFAULT_DAYS): ProfileSchedule {
  const done = doneSlots(history);
  const anchor = addDays(mondayOf(today), -7 * (Math.max(1, week) - 1));
  const base: ProfileSchedule = { anchor, days: [...days], moves: {} };
  const undone = [1, 2, 3, 4].filter((day) => !done.has(slotKey(week, day)));
  const rest = Array.from({ length: 7 }, (_, i) => addDays(mondayOf(today), i)).filter((date) => date >= today);
  if (rest.length < undone.length) return { ...base, anchor: addDays(anchor, 7) };
  const taken = new Set(undone.map((day) => slotDate(base, week, day)).filter((date) => date >= today));
  const moves: Record<string, string> = {};
  for (const day of undone) {
    if (slotDate(base, week, day) >= today) continue;
    const target = rest.find((date) => !taken.has(date));
    if (!target) break;
    taken.add(target);
    moves[slotKey(week, day)] = target;
  }
  return { ...base, moves };
}

/**
 * The schedule a profile gets the first time the calendar opens: its first unfinished workout's week,
 * placed from today. Created once and never re-derived from "today" afterwards.
 */
export function defaultSchedule(profile: Pick<UserProfile, 'currentWeek'>, now: number = Date.now(), history: WorkoutSession[] = []): ProfileSchedule {
  const week = history.length ? (firstUndone(doneSlots(history))?.week ?? profile.currentWeek) : profile.currentWeek;
  return planFromToday(Math.min(12, Math.max(1, week)), history, todayKey(now));
}

export function slotDate(schedule: ProfileSchedule, week: number, day: number): DateKey {
  const moved = schedule.moves[slotKey(week, day)];
  if (moved) return moved;
  return addDays(schedule.anchor, 7 * (week - 1) + (normalizeDays(schedule.days)[day - 1] ?? 0));
}

const DEFAULT_DATE = (schedule: ProfileSchedule, week: number, day: number) =>
  addDays(schedule.anchor, 7 * (week - 1) + (normalizeDays(schedule.days)[day - 1] ?? 0));

export type AgendaStatus = 'completed' | 'partial' | 'skipped' | 'missed' | 'today' | 'upcoming';

export interface AgendaItem {
  week: number;
  day: number;
  key: SlotKey;
  lift: string;
  group: 'legs' | 'upper';
  status: AgendaStatus;
  /** Share of a session this counts for (partial workouts). */
  credit?: number;
  date: DateKey;
}

export interface AgendaDay {
  date: DateKey;
  weekday: string;
  dayOfMonth: number;
  isToday: boolean;
  isPast: boolean;
  items: AgendaItem[];
}

/** Day 1 (squat) and Day 3 (front squat or deadlift) are the lower-body days. */
export const groupOfDay = (day: number): 'legs' | 'upper' => (day === 1 || day === 3 ? 'legs' : 'upper');

export function liftOf(week: number, day: number, profile?: UserProfile): string {
  return getDayPrescription(week, day, profile).exercises[0]?.exerciseName ?? `Day ${day}`;
}

function itemFor(slot: Slot, date: DateKey, today: DateKey, done: Map<SlotKey, DoneInfo>, profile?: UserProfile): AgendaItem {
  const key = slotKey(slot.week, slot.day);
  const info = done.get(key);
  const status: AgendaStatus = info ? info.status : date < today ? 'missed' : date === today ? 'today' : 'upcoming';
  return { week: slot.week, day: slot.day, key, lift: info?.lift ?? liftOf(slot.week, slot.day, profile), group: groupOfDay(slot.day), status, credit: info?.credit, date };
}

/**
 * Seven rows, Monday to Sunday. Finished workouts appear on the day they were done; everything else
 * appears on its scheduled date, so history never moves when the plan does.
 */
export function weekAgenda(schedule: ProfileSchedule, history: WorkoutSession[], monday: DateKey, today: DateKey, profile?: UserProfile): AgendaDay[] {
  const done = doneSlots(history);
  const days: AgendaDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return { date, weekday: WEEKDAY_LABELS[i], dayOfMonth: fromDateKey(date).getDate(), isToday: date === today, isPast: date < today, items: [] };
  });
  const byDate = new Map(days.map((day) => [day.date, day]));
  for (const slot of ALL_SLOTS) {
    const info = done.get(slotKey(slot.week, slot.day));
    const date = info ? info.date : slotDate(schedule, slot.week, slot.day);
    byDate.get(date)?.items.push(itemFor(slot, date, today, done, profile));
  }
  return days;
}

// ---- Moving workouts ----

export type MoveResult =
  | { ok: true; schedule: ProfileSchedule; swappedWith?: Slot; message: string }
  | { ok: false; reason: string };

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const weekdayName = (key: DateKey): string => WEEKDAY_NAMES[(fromDateKey(key).getDay() + 6) % 7];

function withDate(schedule: ProfileSchedule, week: number, day: number, date: DateKey): ProfileSchedule {
  const moves = { ...schedule.moves };
  if (date === DEFAULT_DATE(schedule, week, day)) delete moves[slotKey(week, day)];
  else moves[slotKey(week, day)] = date;
  return { ...schedule, moves };
}

/**
 * Moves one workout to another day in the same Monday-to-Sunday week, or swaps it with the workout already
 * there. Finished workouts are fixed, and nothing can be moved onto a day that has already passed.
 */
export function moveWorkout(
  schedule: ProfileSchedule,
  history: WorkoutSession[],
  slot: Slot,
  target: DateKey,
  today: DateKey,
): MoveResult {
  const done = doneSlots(history);
  if (done.has(slotKey(slot.week, slot.day))) return { ok: false, reason: 'That workout is already finished.' };
  const from = slotDate(schedule, slot.week, slot.day);
  if (mondayOf(from) !== mondayOf(target)) return { ok: false, reason: 'Workouts can only move within their own week.' };
  if (target < today) return { ok: false, reason: 'That day has already passed. Pick today or a later day.' };
  if (target === from) return { ok: true, schedule, message: `Kept on ${weekdayName(target)}.` };

  const occupant = ALL_SLOTS.find((other) =>
    !(other.week === slot.week && other.day === slot.day)
    && !done.has(slotKey(other.week, other.day))
    && slotDate(schedule, other.week, other.day) === target);
  const label = `Day ${slot.day}`;
  if (!occupant) {
    return { ok: true, schedule: withDate(schedule, slot.week, slot.day, target), message: `Moved ${label} to ${weekdayName(target)}.` };
  }
  if (from < today) {
    return { ok: false, reason: `Swapping would put Day ${occupant.day} on a day that has passed. Pick a free day instead.` };
  }
  const swapped = withDate(withDate(schedule, slot.week, slot.day, target), occupant.week, occupant.day, from);
  return { ok: true, schedule: swapped, swappedWith: occupant, message: `Swapped ${label} with Day ${occupant.day}.` };
}

/** The unfinished workouts whose date is before the start of this calendar week. */
export function weeksBehind(schedule: ProfileSchedule, history: WorkoutSession[], today: DateKey): number {
  const next = firstUndone(doneSlots(history));
  if (!next) return 0;
  const gap = (fromDateKey(mondayOf(today)).getTime() - fromDateKey(mondayOf(slotDate(schedule, next.week, next.day))).getTime()) / (7 * 86_400_000);
  return Math.max(0, Math.round(gap));
}

/** Re-dates the plan so the first unfinished workout's week is this calendar week. Finished workouts keep their dates. */
export function catchUp(schedule: ProfileSchedule, history: WorkoutSession[], today: DateKey): ProfileSchedule {
  const next = firstUndone(doneSlots(history));
  if (!next) return schedule;
  return planFromToday(next.week, history, today, normalizeDays(schedule.days));
}

/** Change which weekdays Day 1 to Day 4 use. Dragged workouts keep the dates they were dragged to. */
export function withTrainingDays(schedule: ProfileSchedule, days: number[]): ProfileSchedule {
  return { ...schedule, days: days.slice(0, 4) };
}

const STATUS_CODE: Record<AgendaStatus, string> = { completed: 'c', partial: 'p', skipped: 's', missed: 'm', today: 't', upcoming: 'u' };

/**
 * This week as seven short codes, Monday first, for sharing with a partner: each workout is its day number
 * plus a status letter (c completed, p partial, s skipped, m missed, t today, u upcoming), '' for a rest day.
 */
export function weekCodes(schedule: ProfileSchedule, history: WorkoutSession[], today: DateKey): string[] {
  return weekAgenda(schedule, history, mondayOf(today), today).map((day) => day.items.map((item) => `${item.day}${STATUS_CODE[item.status]}`).join(''));
}

export const isWeekCode = (value: unknown): value is string => typeof value === 'string' && /^(?:[1-4][cpsmtu]){0,8}$/.test(value);

export type NextReason = 'today' | 'upcoming' | 'missed';
export interface NextWorkout extends Slot { date: DateKey; reason: NextReason }

/** Today's unfinished workout, else the next one coming up, else the earliest missed one. */
export function nextWorkout(schedule: ProfileSchedule, history: WorkoutSession[], today: DateKey): NextWorkout | null {
  const done = doneSlots(history);
  const pending = ALL_SLOTS
    .filter((slot) => !done.has(slotKey(slot.week, slot.day)))
    .map((slot) => ({ ...slot, date: slotDate(schedule, slot.week, slot.day) }));
  if (!pending.length) return null;
  const byDate = (a: { date: DateKey }, b: { date: DateKey }) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const todays = pending.filter((slot) => slot.date === today).sort(byDate)[0];
  if (todays) return { ...todays, reason: 'today' };
  const upcoming = pending.filter((slot) => slot.date > today).sort(byDate)[0];
  if (upcoming) return { ...upcoming, reason: 'upcoming' };
  const missed = [...pending].sort(byDate)[0];
  return { ...missed, reason: 'missed' };
}

export function missedCount(schedule: ProfileSchedule, history: WorkoutSession[], today: DateKey): number {
  const done = doneSlots(history);
  return ALL_SLOTS.filter((slot) => !done.has(slotKey(slot.week, slot.day)) && slotDate(schedule, slot.week, slot.day) < today).length;
}

export function isValidSchedule(value: unknown): value is ProfileSchedule {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { anchor, days, moves } = value as Record<string, unknown>;
  if (!isDateKey(anchor) || fromDateKey(anchor).getDay() !== 1) return false;
  if (!Array.isArray(days) || days.length !== 4) return false;
  if (!days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) || new Set(days).size !== 4) return false;
  if (typeof moves !== 'object' || moves === null || Array.isArray(moves)) return false;
  return Object.entries(moves as Record<string, unknown>).every(([key, date]) => parseSlotKey(key) !== null && isDateKey(date));
}
