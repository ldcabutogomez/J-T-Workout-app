import type { EncouragementTone, SessionHighlights, WorkoutSession } from '../types';
import { deriveHighlights, type StreakInfo } from './achievements';
import { countsTowardStats, fmtCount, weekStart, weeklyCounts } from './sessionValidity';

/**
 * Coach-style messages. Everything here is pure: the same inputs always give the same text, so it is
 * testable and nothing flickers between renders. Variants are picked by a stable hash, never randomness.
 */

export type CoachSituation =
  | 'pre_workout' | 'pre_workout_test' | 'welcome_back'
  | 'phase_block1' | 'phase_test6' | 'phase_block2' | 'phase_test12'
  | 'weekly_recap'
  | 'halfway' | 'last_set' | 'hard_set'
  | 'post_first' | 'post_pr' | 'post_improved' | 'post_goal' | 'post_streak' | 'post_default';

type Voice = Exclude<EncouragementTone, 'off'>;

/** Placeholders: {name} {lift} {exercise} {week} {day} {days} {n} {goal} {volume} {unit} {reps} {load} {delta} {streak}. */
const COPY: Record<CoachSituation, Record<Voice, string[]>> = {
  pre_workout: {
    minimal: ['Week {week}, Day {day}: {lift} is first.', '{lift} leads today (Week {week}, Day {day}).'],
    warm: [
      'Good to see you, {name}. Week {week}, Day {day} starts with {lift}. Take your warm-up and build into it.',
      'Ready when you are, {name}. Today opens with {lift}, and your warm-up is already set up.',
      'Week {week}, Day {day}, {name}. {lift} first. Settle in and trust the plan.',
    ],
    playful: [
      "Let's go, {name}! {lift} is waiting. Week {week}, Day {day} starts now.",
      '{lift} day, {name}. Warm up, find your groove, and own Week {week}.',
      'Week {week} is calling, {name}. {lift} first. Bring the energy!',
    ],
  },
  pre_workout_test: {
    minimal: ['Test week: work up to a true max on {lift}.', 'Week {week} tests your maxes. {lift} first.'],
    warm: [
      'This is a test week, {name}. Warm up thoroughly, then work up to your best {lift} with good form.',
      'Test day, {name}. Everything you have built shows up on {lift}. Take your time on the ramp.',
    ],
    playful: [
      'Test week! {lift} max attempt, {name}. Warm up like you mean it.',
      "Today's the day, {name}. Work up to your best {lift} and show it off!",
    ],
  },
  welcome_back: {
    minimal: ['Welcome back. {days} days since your last session.', 'Back after {days} days. Ease in with the warm-up.'],
    warm: [
      "Welcome back, {name}. It's been {days} days. Start easy and let the warm-up ramp ease you in.",
      'Good to have you back, {name}. {days} days off is fine. Pick up right where the plan is.',
    ],
    playful: [
      'Look who is back, {name}! {days} days off. Ease in and get rolling.',
      '{name} returns after {days} days! Warm up well and enjoy it.',
    ],
  },
  phase_block1: {
    minimal: ['Week 1 starts the 12-week cycle.', 'Cycle start: Week 1, Day 1.'],
    warm: ['Day one of 12 weeks, {name}. Your maxes are set and the plan is loaded. Build from here.', "Here's the start, {name}. Twelve weeks of steady work begins today."],
    playful: ['Week 1, {name}! Twelve weeks start now.', "Day one, {name}! Let's build something over the next twelve weeks."],
  },
  phase_test6: {
    minimal: ['Week 6 is test week.', 'Test week: work up to true maxes.'],
    warm: ['Test week, {name}. Five weeks of work lead to this. Work up to a true max on each main lift.', 'Week 6, {name}. Time to see what Block 1 built. Warm up well and take your attempts.'],
    playful: ['Test week! Five weeks of work, one week to show it, {name}.', "Week 6, {name}. Let's see what Block 1 built!"],
  },
  phase_block2: {
    minimal: ['Block 2 starts this week.', 'Week 7: Block 2 begins.'],
    warm: ['Block 2 begins, {name}. You carry what Block 1 built into the heavier work.', "New block, {name}. Week 7 builds on everything you've done so far."],
    playful: ['Block 2, {name}! New block, same energy.', "Week 7 is here, {name}. Block 2 is where it gets fun!"],
  },
  phase_test12: {
    minimal: ['Week 12 is the final test week.', 'Final test week.'],
    warm: ['Final test week, {name}. Twelve weeks of work. Time to see what it built.', "You made it to Week 12, {name}. Warm up well and take your best attempts."],
    playful: ["Final test week, {name}! Show off twelve weeks of work.", "Week 12, {name}! The finish line is in sight."],
  },
  weekly_recap: {
    minimal: ['Last week: {n} of {goal} sessions, {volume} {unit} lifted.', 'Last week was {n} of {goal} sessions and {volume} {unit}.'],
    warm: [
      'Last week you trained {n} of {goal} sessions and lifted {volume} {unit}. A fresh week starts now, {name}.',
      "Here's last week, {name}: {n} of {goal} sessions, {volume} {unit} moved. Let's build on it.",
    ],
    playful: [
      'Last week: {n} of {goal} sessions and {volume} {unit} moved, {name}! New week, new numbers.',
      '{name}, last week was {n} of {goal} sessions and {volume} {unit}. Fresh week, go get it!',
    ],
  },
  halfway: {
    minimal: ['Halfway through.', 'Half the sets are done.'],
    warm: ['Halfway there, {name}. Keep that rhythm.', "You're halfway through today's work, {name}. Steady."],
    playful: ["Halfway! The hard part's behind you, {name}.", 'Half done, {name}! Keep it rolling.'],
  },
  last_set: {
    minimal: ['Last set.', 'One set left.'],
    warm: ['Final set, {name}. Finish strong.', 'One more, {name}. You have got this.'],
    playful: ['Last one, {name}! Make it count.', 'One set left, {name}! Finish like you mean it.'],
  },
  hard_set: {
    minimal: ['{exercise}: that set took everything.', 'Nothing left on {exercise}.'],
    warm: ['That {exercise} set was a grind and you finished it, {name}.', 'Tough set on {exercise}, {name}. Take your rest before the next one.'],
    playful: ["Whoa, {exercise} to the limit! That's real effort, {name}.", '{exercise} did not make it easy, {name}, and you did it anyway!'],
  },
  post_first: {
    minimal: ['First workout saved.', 'Workout one is in the log.'],
    warm: ["First workout done, {name}. That's the hardest step and you took it.", 'Workout one is in the books, {name}. A great start.'],
    playful: ["First one's in the books, {name}!", 'Workout number one, {name}! Many more to come.'],
  },
  post_pr: {
    minimal: ['New {exercise} best: {reps} reps at {load} {unit}, up {delta} {unit}.', '{exercise} PR: {reps} x {load} {unit} (+{delta}).'],
    warm: [
      "That's a new personal best on {exercise}, {name}: {reps} reps at {load} {unit}, up {delta} {unit}. Well earned.",
      'A new {exercise} best, {name}. {reps} reps at {load} {unit} is up {delta} {unit}. That work is paying off.',
    ],
    playful: [
      'New PR on {exercise}, {name}! {reps} reps at {load} {unit}, up {delta} {unit}. Look at you go!',
      '{exercise} personal best! {reps} x {load} {unit}, +{delta}. Nice one, {name}!',
    ],
  },
  post_improved: {
    minimal: ['{exercise} is up {delta} {unit} from last time.', '{exercise}: +{delta} {unit} since last session.'],
    warm: ['Nice progress on {exercise}, {name}: up {delta} {unit} from last time.', 'Steady gains, {name}. {exercise} is up {delta} {unit} on last session.'],
    playful: ['{exercise} is climbing, {name}! +{delta} {unit} since last time.', 'Up {delta} {unit} on {exercise}, {name}! Keep it coming.'],
  },
  post_goal: {
    minimal: ['Weekly goal reached: {n} of {goal}.', 'Goal met: {n} of {goal} sessions this week.'],
    warm: ["That's your weekly goal, {name}: {n} of {goal} sessions. Enjoy the recovery.", 'Weekly goal done, {name}. {n} of {goal} sessions. Rest well.'],
    playful: ['Weekly goal done, {name}! {n} of {goal}. Rest up, you earned it.', '{n} of {goal} sessions, {name}! Goal complete!'],
  },
  post_streak: {
    minimal: ['{streak}-week streak.', 'Streak: {streak} weeks.'],
    warm: ['{streak} weeks in a row at your goal, {name}. That consistency is the real work.', "That's {streak} straight weeks, {name}. Consistency is what builds results."],
    playful: ['{streak} weeks straight, {name}! Keep the chain going.', '{streak} weeks in a row, {name}! Nothing stops you.'],
  },
  post_default: {
    minimal: ['Workout saved. {n} of {goal} sessions this week.', 'Done: {volume} {unit} lifted, {n} of {goal} this week.'],
    warm: ['Workout done, {name}. {n} of {goal} sessions this week and {volume} {unit} moved today.', 'Another one in the log, {name}. {volume} {unit} moved, {n} of {goal} sessions this week.'],
    playful: ['Done and dusted, {name}! {volume} {unit} moved today. {n} of {goal} this week.', 'Session complete, {name}! {volume} {unit} lifted. {n} of {goal} this week.'],
  },
};

export interface CoachMessage {
  /** Stable key, used to show a message once and to remember a dismissal. */
  id: string;
  situation: CoachSituation;
  text: string;
}

export const COACH_COPY = COPY;

export type Phase = 'block1' | 'test6' | 'block2' | 'test12';

export function phaseOf(week: number): Phase {
  if (week <= 5) return 'block1';
  if (week === 6) return 'test6';
  if (week <= 11) return 'block2';
  return 'test12';
}

const dateKey = (now: number) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/** Small stable string hash, so the same person on the same day always hears the same variant. */
function hash(value: string): number {
  let h = 2166136261;
  for (const char of value) h = Math.imul(h ^ char.charCodeAt(0), 16777619) >>> 0;
  return h;
}

export type Vars = Record<string, string | number>;

export function fill(template: string, vars: Vars): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => (key in vars ? String(vars[key]) : `{${key}}`));
}

function say(situation: CoachSituation, tone: EncouragementTone, seed: string, vars: Vars): string | null {
  if (tone === 'off') return null;
  const variants = COPY[situation][tone];
  return fill(variants[hash(`${seed}|${situation}`) % variants.length], vars);
}

export interface CoachContext {
  now: number;
  tone: EncouragementTone;
  name: string;
  profileId: string;
  unit: 'lb' | 'kg';
  weeklyGoal: number;
  history: WorkoutSession[];
  week: number;
  day: number;
  /** The day's main lift, e.g. "Back Squat". */
  mainLift: string;
}

const DAY_MS = 86_400_000;

/** Candidate messages for the Today tab, best first. The caller shows the first one not yet dismissed. */
export function todayCandidates(ctx: CoachContext): CoachMessage[] {
  if (ctx.tone === 'off') return [];
  const seed = `${ctx.profileId}|${dateKey(ctx.now)}`;
  const base = { name: ctx.name, lift: ctx.mainLift, week: ctx.week, day: ctx.day };
  const out: CoachMessage[] = [];
  const push = (id: string, situation: CoachSituation, vars: Vars) => {
    const text = say(situation, ctx.tone, seed, { ...base, ...vars });
    if (text) out.push({ id, situation, text });
  };

  const counted = ctx.history.filter(countsTowardStats).sort((a, b) => (b.completedTime ?? 0) - (a.completedTime ?? 0));
  const last = counted[0];
  if (last?.completedTime) {
    const days = Math.floor((ctx.now - last.completedTime) / DAY_MS);
    if (days >= 5) push(`welcome_back:${last.sessionId}`, 'welcome_back', { days });
  }

  if (ctx.day === 1) {
    const phase = phaseOf(ctx.week);
    if (ctx.week === 1) push('phase:1', 'phase_block1', {});
    else if (ctx.week === 6) push('phase:6', 'phase_test6', {});
    else if (ctx.week === 7) push('phase:7', 'phase_block2', {});
    else if (ctx.week === 12 && phase === 'test12') push('phase:12', 'phase_test12', {});
  }

  const thisWeek = weekStart(ctx.now);
  const lastWeekStart = new Date(thisWeek);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const credit = weeklyCounts(ctx.history).get(lastWeekStart.getTime()) ?? 0;
  if (credit > 0) {
    const derived = deriveHighlights(ctx.history);
    let volume = 0;
    for (const session of ctx.history) {
      const t = session.completedTime ?? session.startTime;
      if (weekStart(t) === lastWeekStart.getTime()) volume += derived.get(session.sessionId)?.totalVolume ?? 0;
    }
    push(`recap:${lastWeekStart.getTime()}`, 'weekly_recap', { n: fmtCount(credit), goal: ctx.weeklyGoal, volume: Math.round(volume).toLocaleString(), unit: ctx.unit });
  }

  const test = phaseOf(ctx.week) === 'test6' || phaseOf(ctx.week) === 'test12';
  push(`pre:${dateKey(ctx.now)}`, test ? 'pre_workout_test' : 'pre_workout', {});
  return out;
}

export type NudgeKind = 'halfway' | 'last_set' | 'hard_set';

export function nudgeMessage(kind: NudgeKind, ctx: { tone: EncouragementTone; name: string; profileId: string; seed: string; exercise?: string }): string | null {
  return say(kind, ctx.tone, `${ctx.profileId}|${ctx.seed}`, { name: ctx.name, exercise: ctx.exercise ?? 'that lift' });
}

export interface PostWorkoutContext {
  tone: EncouragementTone;
  name: string;
  profileId: string;
  unit: 'lb' | 'kg';
  weeklyGoal: number;
  session: WorkoutSession;
  /** Whether the session was compared against earlier history for this person. */
  isFirstWorkout: boolean;
  highlights: SessionHighlights;
  streak: StreakInfo;
  weeklyGoalNewlyMet: boolean;
  /** Set when the partner has also trained today; adds one friendly line. */
  partnerName?: string;
}

const num = (value: number) => String(Number(value.toFixed(2)));

/** The note after a finished workout: the single most meaningful thing about it, in the lifter's tone. */
export function postWorkoutMessage(ctx: PostWorkoutContext): string | null {
  if (ctx.tone === 'off') return null;
  const { highlights, streak } = ctx;
  const seed = `${ctx.profileId}|${ctx.session.sessionId}`;
  const base: Vars = {
    name: ctx.name,
    unit: ctx.unit,
    goal: ctx.weeklyGoal,
    n: fmtCount(streak.weeklyCount),
    volume: Math.round(highlights.totalVolume).toLocaleString(),
    streak: streak.streakWeeks,
  };
  const pr = highlights.results.find((r) => r.kind === 'all_time_pr');
  const better = highlights.results.find((r) => r.kind === 'previous_improvement');
  let text: string | null;
  if (ctx.isFirstWorkout) text = say('post_first', ctx.tone, seed, base);
  else if (pr) text = say('post_pr', ctx.tone, seed, { ...base, exercise: pr.exerciseName, reps: pr.reps, load: num(pr.load), delta: num(pr.deltaVsBest ?? 0) });
  else if (better) text = say('post_improved', ctx.tone, seed, { ...base, exercise: better.exerciseName, delta: num(better.deltaVsPrevious ?? 0) });
  else if (ctx.weeklyGoalNewlyMet) text = say('post_goal', ctx.tone, seed, base);
  else if (streak.streakWeeks >= 2) text = say('post_streak', ctx.tone, seed, base);
  else text = say('post_default', ctx.tone, seed, base);
  if (text && ctx.partnerName) text += ` ${ctx.partnerName} trained today too.`;
  return text;
}

