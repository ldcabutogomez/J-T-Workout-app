import type { WorkoutSession, WorkoutTimer } from '../types';

const cleanNow = (now: number) => Number.isFinite(now) && now >= 0 ? now : Date.now();

export function workoutElapsedMs(session: Pick<WorkoutSession, 'timer' | 'startTime' | 'completedTime'>, now = Date.now()): number {
  if (!session.timer) {
    const end = session.completedTime ?? now;
    return Math.max(0, end - session.startTime);
  }
  const running = session.timer.runningSince === null ? 0 : Math.max(0, cleanNow(now) - session.timer.runningSince);
  return Math.max(0, session.timer.accumulatedMs + running);
}

export function toggleWorkoutTimer(session: WorkoutSession, now = Date.now()): WorkoutSession {
  const at = cleanNow(now);
  const timer: WorkoutTimer = session.timer ?? { accumulatedMs: 0, runningSince: session.startTime };
  return {
    ...session,
    updatedTime: at,
    timer: timer.runningSince === null
      ? { accumulatedMs: timer.accumulatedMs, runningSince: at }
      : { accumulatedMs: timer.accumulatedMs + Math.max(0, at - timer.runningSince), runningSince: null },
  };
}

export function stopWorkoutTimer(session: WorkoutSession, now = Date.now()): WorkoutSession {
  if (!session.timer || session.timer.runningSince === null) return session;
  const at = cleanNow(now);
  return {
    ...session,
    timer: {
      accumulatedMs: session.timer.accumulatedMs + Math.max(0, at - session.timer.runningSince),
      runningSince: null,
    },
    updatedTime: at,
  };
}

export function formatWorkoutElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}
