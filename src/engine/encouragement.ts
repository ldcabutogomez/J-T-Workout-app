import type { EncouragementTone, LoggedExercise, SessionResult, WorkoutSession } from '../types';
import { normalizeWeight } from './jnt2Engine';
import { countsTowardStats, fmtCount, sessionCredit, validCompleted, weekStart, weeklyCounts } from './sessionValidity';

export { validCompleted };

export interface EncouragementContext {
  tone: EncouragementTone;
  history: WorkoutSession[];
  currentSession: WorkoutSession;
  weeklyGoalSessions?: number;
  now?: number;
}

export type ComparableResult = SessionResult;

function topPerformance(exercise: LoggedExercise) {
  const set = exercise.sets.find((item) =>
    item.completed
    && (item.type === 'rm_target' || item.type === 'test')
    && item.actualReps !== null
    && item.load !== null,
  );
  if (!set || set.actualReps === null || set.load === null) return null;
  return { reps: set.actualReps, load: set.load, unit: set.unit };
}

function compareExercise(
  exercise: LoggedExercise,
  candidates: WorkoutSession[],
): SessionResult | null {
  const performance = topPerformance(exercise);
  if (!performance) return null;
  const base = {
    exerciseId: exercise.exerciseId,
    exerciseName: exercise.exerciseName,
    reps: performance.reps,
    load: performance.load,
    unit: performance.unit,
  };
  const comparable = candidates.flatMap((session) => session.exercises
    .filter((item) => item.exerciseId === exercise.exerciseId)
    .map((item) => ({ session, performance: topPerformance(item) }))
    .filter((item): item is { session: WorkoutSession; performance: NonNullable<ReturnType<typeof topPerformance>> } =>
      Boolean(item.performance && item.performance.reps === performance.reps),
    ));
  if (!comparable.length) {
    return { ...base, kind: 'benchmark', previousSessionLoad: null, allTimeBestLoad: null, deltaVsPrevious: null, deltaVsBest: null };
  }
  const loads = comparable.map((item) => normalizeWeight(item.performance.load, item.performance.unit, performance.unit));
  const previous = loads[0];
  const best = Math.max(...loads);
  const detail = {
    ...base,
    previousSessionLoad: previous,
    allTimeBestLoad: best,
    deltaVsPrevious: performance.load - previous,
    deltaVsBest: performance.load - best,
  };
  if (performance.load > best + 1e-6) return { ...detail, kind: 'all_time_pr' };
  if (performance.load > previous + 1e-6) return { ...detail, kind: 'previous_improvement' };
  if (Math.abs(performance.load - best) <= 1e-6) return { ...detail, kind: 'matched_best' };
  return null;
}

/** Valid sessions strictly before `current` (all valid sessions while `current` is still a live draft), newest first. */
function comparisonCandidates(current: WorkoutSession, history: WorkoutSession[]): WorkoutSession[] {
  return history
    .filter((item) => item.sessionId !== current.sessionId
      && countsTowardStats(item)
      && (current.completedTime === undefined || (item.completedTime ?? 0) < current.completedTime))
    .sort((a, b) => (b.completedTime ?? 0) - (a.completedTime ?? 0));
}

export function findAllComparableResults(
  current: WorkoutSession,
  history: WorkoutSession[],
): SessionResult[] {
  const candidates = comparisonCandidates(current, history);
  return current.exercises
    .map((exercise) => compareExercise(exercise, candidates))
    .filter((result): result is SessionResult => result !== null);
}

/** First all-time PR or previous-session improvement, for the encouragement message. */
export function findComparableResult(
  current: WorkoutSession,
  history: WorkoutSession[],
): SessionResult | null {
  return findAllComparableResults(current, history)
    .find((result) => result.kind === 'all_time_pr' || result.kind === 'previous_improvement') ?? null;
}

/** Last and best earlier top-set loads at this rep count, for the in-workout context line. */
export function priorContext(
  exerciseId: string,
  reps: number,
  history: WorkoutSession[],
  unit: 'lb' | 'kg',
  excludeSessionId?: string,
): { last: number | null; best: number | null } {
  const loads = history
    .filter((session) => session.sessionId !== excludeSessionId && countsTowardStats(session))
    .sort((a, b) => (b.completedTime ?? 0) - (a.completedTime ?? 0))
    .flatMap((session) => session.exercises
      .filter((exercise) => exercise.exerciseId === exerciseId)
      .map(topPerformance)
      .filter((performance): performance is NonNullable<ReturnType<typeof topPerformance>> => Boolean(performance && performance.reps === reps))
      .map((performance) => normalizeWeight(performance.load, performance.unit, unit)));
  return { last: loads[0] ?? null, best: loads.length ? Math.max(...loads) : null };
}

export function isVerifiedCycleComplete(current: WorkoutSession, history: WorkoutSession[]): boolean {
  if (!validCompleted(current) || current.week !== 12 || current.day !== 4) return false;
  const unique = new Set(
    [...history, current]
      .filter(validCompleted)
      .map((item) => `${item.week}:${item.day}`),
  );
  return unique.size === 48
    && Array.from({ length: 12 }, (_, week) =>
      Array.from({ length: 4 }, (_, day) => unique.has(`${week + 1}:${day + 1}`)),
    ).flat().every(Boolean);
}

function render(tone: EncouragementTone, minimal: string, warm: string, playful: string): string {
  if (tone === 'minimal') return minimal;
  if (tone === 'warm') return warm;
  return playful;
}

export function generateSessionEncouragement(ctx: EncouragementContext): string {
  const { tone, history, currentSession, weeklyGoalSessions = 4, now = Date.now() } = ctx;
  if (tone === 'off') return '';

  if (currentSession.status === 'skipped') {
    return render(tone, 'Skipped session recorded.', 'Your schedule was updated and the skipped session was recorded.', 'Schedule updated; the skipped session is recorded.');
  }
  if (currentSession.status === 'partial') {
    const logged = currentSession.exercises.reduce((sum, exercise) => sum + exercise.sets.filter((set) => set.completed).length, 0);
    const credit = fmtCount(sessionCredit(currentSession));
    return render(
      tone,
      `Partial session saved: ${logged} sets logged. It counts as ${credit} of a session this week.`,
      `Your partial session is safely saved with ${logged} sets recorded. It counts as ${credit} of a session toward your weekly goal.`,
      `${logged} sets recorded—your partial session is safely in the log and counts as ${credit} of a session this week.`,
    );
  }

  const completed = history
    .filter((item) => item.sessionId !== currentSession.sessionId && validCompleted(item))
    .sort((a, b) => (b.completedTime ?? 0) - (a.completedTime ?? 0));

  if (isVerifiedCycleComplete(currentSession, completed)) {
    return render(
      tone,
      'All 48 prescribed sessions are recorded as completed.',
      'All 48 week-and-day positions are recorded as completed. Your full 12-week cycle is in the log.',
      'All 48 sessions are verified in the log—the full 12-week cycle is complete!',
    );
  }

  const result = findComparableResult(currentSession, completed);
  if (result) {
    const delta = Number(((result.kind === 'all_time_pr' ? result.deltaVsBest : result.deltaVsPrevious) ?? 0).toFixed(2));
    if (result.kind === 'all_time_pr') {
      return render(
        tone,
        `All-time ${result.exerciseName} ${result.reps}-rep PR: +${delta} ${result.unit}.`,
        `New all-time comparable best: ${result.exerciseName} for ${result.reps} reps, up ${delta} ${result.unit}.`,
        `Comparable PR! ${result.exerciseName} × ${result.reps} is up ${delta} ${result.unit} over the prior best.`,
      );
    }
    return render(
      tone,
      `${result.exerciseName} ${result.reps}-rep result improved ${delta} ${result.unit} versus the previous comparable session.`,
      `${result.exerciseName} for ${result.reps} reps improved by ${delta} ${result.unit} versus the previous comparable session.`,
      `Session-to-session progress: ${result.exerciseName} × ${result.reps} is up ${delta} ${result.unit}.`,
    );
  }

  if (currentSession.week === 6 && validCompleted(currentSession)) {
    return render(tone, 'Week 6 test session recorded.', 'Your Week 6 test session is recorded.', 'Week 6 benchmark work is in the log.');
  }

  const previous = completed[0];
  if (previous?.completedTime) {
    const gap = Math.floor((now - previous.completedTime) / 86_400_000);
    if (gap >= 5) {
      return render(tone, `Session logged after a ${gap}-day gap.`, `Good to have a session recorded after a ${gap}-day gap.`, `Back in the log after ${gap} days—session recorded.`);
    }
  }

  const thisWeek = fmtCount(weeklyCounts([...history.filter((item) => item.sessionId !== currentSession.sessionId), currentSession]).get(weekStart(now)) ?? 0);
  return render(
    tone,
    `Workout saved. ${thisWeek} of ${weeklyGoalSessions} target sessions completed this week.`,
    `Workout saved with all logged sets preserved. That is ${thisWeek} of ${weeklyGoalSessions} target sessions this week.`,
    `Session in the books: ${thisWeek} of ${weeklyGoalSessions} target sessions this week.`,
  );
}
