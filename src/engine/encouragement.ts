import type { EncouragementTone, LoggedExercise, WorkoutSession } from '../types';
import { normalizeWeight } from './jnt2Engine';

export interface EncouragementContext {
  tone: EncouragementTone;
  history: WorkoutSession[];
  currentSession: WorkoutSession;
  weeklyGoalSessions?: number;
  now?: number;
}

export interface ComparableResult {
  kind: 'all_time_pr' | 'previous_improvement';
  exerciseId: string;
  exerciseName: string;
  reps: number;
  load: number;
  unit: 'lb' | 'kg';
  delta: number;
  previousBest: number;
}

export function validCompleted(session: WorkoutSession): boolean {
  return session.status === 'completed'
    && Boolean(session.completedTime)
    && !session.isSkipped
    && !session.isPartial
    && !session.isDemo;
}

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
): ComparableResult | null {
  const performance = topPerformance(exercise);
  if (!performance) return null;
  const comparable = candidates.flatMap((session) => session.exercises
    .filter((item) => item.exerciseId === exercise.exerciseId)
    .map((item) => ({ session, performance: topPerformance(item) }))
    .filter((item): item is { session: WorkoutSession; performance: NonNullable<ReturnType<typeof topPerformance>> } =>
      Boolean(item.performance && item.performance.reps === performance.reps),
    ));
  if (!comparable.length) return null;
  const normalized = comparable.map((item) => ({
    ...item,
    load: normalizeWeight(item.performance.load, item.performance.unit, performance.unit),
  }));
  const previous = normalized[0].load;
  const priorBest = Math.max(...normalized.map((item) => item.load));
  const base = {
    exerciseId: exercise.exerciseId,
    exerciseName: exercise.exerciseName,
    reps: performance.reps,
    load: performance.load,
    unit: performance.unit,
  };
  if (performance.load > priorBest + 1e-6) {
    return { ...base, kind: 'all_time_pr', delta: performance.load - priorBest, previousBest: priorBest };
  }
  if (performance.load > previous + 1e-6) {
    return { ...base, kind: 'previous_improvement', delta: performance.load - previous, previousBest: priorBest };
  }
  return null;
}

function comparisonCandidates(current: WorkoutSession, history: WorkoutSession[]): WorkoutSession[] {
  return history
    .filter((item) => item.sessionId !== current.sessionId && validCompleted(item))
    .sort((a, b) => (b.completedTime ?? 0) - (a.completedTime ?? 0));
}

export function findAllComparableResults(
  current: WorkoutSession,
  history: WorkoutSession[],
): ComparableResult[] {
  const candidates = comparisonCandidates(current, history);
  return current.exercises
    .map((exercise) => compareExercise(exercise, candidates))
    .filter((result): result is ComparableResult => result !== null);
}

export function findComparableResult(
  current: WorkoutSession,
  history: WorkoutSession[],
): ComparableResult | null {
  return findAllComparableResults(current, history)[0] ?? null;
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
    return render(tone, `Partial session saved: ${logged} sets logged.`, `Your partial session is safely saved with ${logged} sets recorded.`, `${logged} sets recorded—your partial session is safely in the log.`);
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
    const delta = Number(result.delta.toFixed(2));
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

  const sevenDaysAgo = now - 7 * 86_400_000;
  const ids = new Set(
    [...completed, currentSession]
      .filter((item) => validCompleted(item) && (item.completedTime ?? 0) > sevenDaysAgo)
      .map((item) => item.sessionId),
  );
  return render(
    tone,
    `Workout saved. ${ids.size} of ${weeklyGoalSessions} target sessions completed in the last 7 days.`,
    `Workout saved with all logged sets preserved. That is ${ids.size} of ${weeklyGoalSessions} target sessions in the last 7 days.`,
    `Session in the books: ${ids.size} of ${weeklyGoalSessions} target sessions in the last 7 days.`,
  );
}
