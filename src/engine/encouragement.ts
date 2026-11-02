/**
 * Deterministic Positive Reinforcement Engine.
 * 100% offline rule-based feedback system using real logged session facts.
 * NO AI API calls, NO partner comparisons, NO guilt, NO broken streak penalties.
 */

import { EncouragementTone, WorkoutSession, LoggedExercise } from '../types';

export interface EncouragementContext {
  tone: EncouragementTone;
  history: WorkoutSession[];
  currentSession: WorkoutSession;
  weeklyGoalSessions?: number;
}

export function generateSessionEncouragement(ctx: EncouragementContext): string {
  const { tone, history, currentSession, weeklyGoalSessions = 4 } = ctx;
  if (tone === 'off') return '';

  const completedSessions = history.filter((s) => !s.isSkipped && s.completedTime);
  const now = Date.now();
  const lastSession = completedSessions[0];
  const daysSinceLast = lastSession
    ? Math.floor((now - lastSession.completedTime!) / (1000 * 60 * 60 * 24))
    : 0;

  // 1. Returning after a training gap (5 or more days)
  if (lastSession && daysSinceLast >= 5) {
    if (tone === 'minimal') {
      return `Session logged after a ${daysSinceLast}-day gap.`;
    }
    if (tone === 'warm') {
      return `Good to see you back on the platform today. Steady resumption of your training block.`;
    }
    if (tone === 'playful') {
      return `Welcome back to the iron! Dust shaken off, session banked.`;
    }
  }

  // 2. Program Milestone: Week 6 Mid-Block Test
  if (currentSession.week === 6) {
    if (tone === 'minimal') {
      return `Week 6 mid-block 1RM benchmark completed. Ready for Block 2 transition.`;
    }
    if (tone === 'warm') {
      return `Strong execution on your Week 6 test singles. Six weeks of volume base successfully realized.`;
    }
    if (tone === 'playful') {
      return `Halfway through Jacked & Tan! Heavy singles tested and stamped.`;
    }
  }

  // 3. Program Milestone: Week 12 Final 1RM Peak
  if (currentSession.week === 12) {
    if (tone === 'minimal') {
      return `Jacked & Tan 2.0 full 12-week curriculum completed. Final benchmark recorded.`;
    }
    if (tone === 'warm') {
      return `Congratulations on seeing all 12 weeks through from 10RMs to today's peak singles. Superb dedication.`;
    }
    if (tone === 'playful') {
      return `12 weeks conquered! The compendium was completed in full. Outstanding work!`;
    }
  }

  // 4. Planned Recovery / Scheduled Deload adherence (e.g. Week 7 T3 rest or Week 11 T2 rest)
  if (currentSession.week === 7) {
    if (tone === 'minimal') {
      return `Workout saved. Scheduled T3 accessory rest observed.`;
    }
    if (tone === 'warm') {
      return `Disciplined work today respecting the programmed accessory deload after last week's testing.`;
    }
    if (tone === 'playful') {
      return `Smart training logged: letting connective tissues recover right on schedule.`;
    }
  }

  // 5. Check for comparable improvements on primary lifts
  const comparableImprovement = findComparableImprovement(currentSession, history);
  if (comparableImprovement) {
    if (tone === 'minimal') {
      return `Improvement noted: ${comparableImprovement}.`;
    }
    if (tone === 'warm') {
      return `Solid progression: ${comparableImprovement}. That patience is paying off.`;
    }
    if (tone === 'playful') {
      return `Progress unlocked! ${comparableImprovement}. Strong effort today.`;
    }
  }

  // 6. Rolling 7-day session count progress toward weekly goal
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const sessionsThisRollingWeek =
    completedSessions.filter((s) => s.completedTime! > sevenDaysAgo).length + 1;

  if (tone === 'minimal') {
    return `Workout saved. ${sessionsThisRollingWeek} of ${weeklyGoalSessions} target sessions completed this week.`;
  }
  if (tone === 'warm') {
    return `You committed to today's work and completed the prescribed sets. Session ${sessionsThisRollingWeek} logged this week.`;
  }
  return `Session in the books! That makes ${sessionsThisRollingWeek} completed sessions this week. Keep that momentum!`;
}

/**
 * Checks for true comparable improvements (strictly identical rep targets, avoiding comparing a 2RM with a 10RM).
 */
function findComparableImprovement(
  current: WorkoutSession,
  history: WorkoutSession[]
): string | null {
  for (const curEx of current.exercises) {
    if (!curEx.targetRM || !curEx.achievedRMWeight) continue;

    // Search historical sessions for the same exercise and same target RM
    for (const prevSess of history) {
      if (prevSess.sessionId === current.sessionId) continue;
      const prevEx = prevSess.exercises.find(
        (e) => e.exerciseName === curEx.exerciseName && e.targetRM === curEx.targetRM
      );

      if (prevEx && prevEx.achievedRMWeight) {
        if (curEx.achievedRMWeight > prevEx.achievedRMWeight) {
          const delta = (curEx.achievedRMWeight - prevEx.achievedRMWeight).toFixed(1);
          return `${curEx.exerciseName} ${curEx.targetRM}RM up by +${delta}`;
        }
      }
    }
  }
  return null;
}
