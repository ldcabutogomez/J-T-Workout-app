import assert from 'node:assert/strict';
import test from 'node:test';
import { COACH_COPY, fill, nudgeMessage, phaseOf, postWorkoutMessage, todayCandidates, type CoachContext, type CoachSituation, type PostWorkoutContext } from '../src/engine/coach';
import { computeHighlights, computeStreak } from '../src/engine/achievements';
import type { SessionResult, WorkoutSession } from '../src/types';
import { completeSession, profile } from './helpers';

// Wednesday 2024-05-15 12:00 local time.
const NOW = new Date(2024, 4, 15, 12).getTime();
const at = (month: number, date: number) => new Date(2024, month - 1, date, 12).getTime();
const base = completeSession(profile(), 1, 1, 1_000);

function finished(id: string, time: number): WorkoutSession {
  const next = structuredClone(base);
  next.sessionId = id;
  next.startTime = time - 3_600_000;
  next.completedTime = time;
  return next;
}

const ctx = (overrides: Partial<CoachContext> = {}): CoachContext => ({
  now: NOW, tone: 'warm', name: 'Lauren', profileId: 'partner-1', unit: 'lb', weeklyGoal: 4, history: [], week: 3, day: 2, mainLift: 'Bench Press', ...overrides,
});

const ALL_VARS = { name: 'Lauren', lift: 'Squat', exercise: 'Squat', week: 3, day: 2, days: 6, n: '2', goal: 4, volume: '9,000', unit: 'lb', reps: 5, load: '225', delta: '10', streak: 3 };

test('every situation has at least two variants per tone, and every placeholder resolves', () => {
  for (const [situation, voices] of Object.entries(COACH_COPY)) {
    for (const [voice, variants] of Object.entries(voices)) {
      assert.ok(variants.length >= 2, `${situation}/${voice} has ${variants.length} variant(s)`);
      for (const template of variants) {
        const text = fill(template, ALL_VARS);
        assert.doesNotMatch(text, /\{\w+\}/, `${situation}/${voice}: unresolved placeholder in "${text}"`);
        assert.ok(text.length > 4);
      }
    }
  }
  assert.equal(Object.keys(COACH_COPY).length, 17);
});

test('phases follow the program: Block 1, test week 6, Block 2, test week 12', () => {
  assert.deepEqual([1, 5, 6, 7, 11, 12].map(phaseOf), ['block1', 'block1', 'test6', 'block2', 'block2', 'test12']);
});

test('today messages are deterministic, personal, and name the day\'s lift', () => {
  const [a] = todayCandidates(ctx());
  const [b] = todayCandidates(ctx());
  assert.equal(a.text, b.text, 'same inputs, same message');
  assert.equal(a.situation, 'pre_workout');
  assert.match(a.text, /Bench Press/);
  assert.equal(a.id, 'pre:2024-5-15', 'one pre-workout message per day');
  assert.notEqual(todayCandidates(ctx({ now: at(5, 16) }))[0].id, a.id);
});

test('priority: welcome back, then phase milestone, then weekly recap, then the daily line', () => {
  const gap = todayCandidates(ctx({ history: [finished('old', at(5, 6))] }));
  assert.equal(gap[0].situation, 'welcome_back');
  assert.match(gap[0].text, /9 days/);
  assert.equal(gap[0].id, 'welcome_back:old', 'dismissed once per gap');

  const phase = todayCandidates(ctx({ week: 7, day: 1, history: [] }));
  assert.equal(phase[0].situation, 'phase_block2');
  assert.equal(todayCandidates(ctx({ week: 7, day: 2 }))[0].situation, 'pre_workout', 'milestones only on day 1');
  assert.equal(todayCandidates(ctx({ week: 1, day: 1 }))[0].situation, 'phase_block1');
  assert.equal(todayCandidates(ctx({ week: 6, day: 1 }))[0].situation, 'phase_test6');
  assert.equal(todayCandidates(ctx({ week: 12, day: 1 }))[0].situation, 'phase_test12');

  // A full session last week (Mon 6th) and one this week: the recap shows, with no welcome-back.
  const recap = todayCandidates(ctx({ history: [finished('lastweek', at(5, 8)), finished('thisweek', at(5, 14))] }));
  assert.equal(recap[0].situation, 'weekly_recap');
  assert.match(recap[0].text, /1 of 4/);
  assert.ok(recap.some((m) => m.situation === 'pre_workout'));
  assert.equal(recap[recap.length - 1].situation, 'pre_workout');
});

test('phase milestones fire on the first workout of a week, even when Day 1 is not first', () => {
  assert.equal(todayCandidates(ctx({ week: 7, day: 3, firstOfWeek: true }))[0].situation, 'phase_block2', 'Day 3 done first still gets the Block 2 welcome');
  assert.equal(todayCandidates(ctx({ week: 7, day: 3, firstOfWeek: false }))[0].situation, 'pre_workout', 'later workouts of the week do not repeat it');
  assert.equal(todayCandidates(ctx({ week: 7, day: 1, firstOfWeek: false }))[0].situation, 'pre_workout');
  assert.equal(todayCandidates(ctx({ week: 6, day: 2, firstOfWeek: true }))[0].situation, 'phase_test6');
});

test('test weeks get their own pre-workout line, and tone off says nothing', () => {
  assert.equal(todayCandidates(ctx({ week: 6, day: 3 }))[0].situation, 'pre_workout_test');
  assert.deepEqual(todayCandidates(ctx({ tone: 'off', week: 7, day: 1, history: [finished('old', at(5, 1))] })), []);
  assert.equal(nudgeMessage('halfway', { tone: 'off', name: 'L', profileId: 'p', seed: 's' }), null);
});

test('tones sound different but say the same thing', () => {
  const texts = (['minimal', 'warm', 'playful'] as const).map((tone) => todayCandidates(ctx({ tone }))[0].text);
  assert.equal(new Set(texts).size, 3);
  assert.ok(texts.every((t) => t.includes('Bench Press')));
  assert.ok(texts[0].length < texts[1].length, 'minimal is the shortest');
});

test('mid-workout nudges are short, named, and stable for a session', () => {
  const opts = { tone: 'warm' as const, name: 'Luis', profileId: 'partner-2', seed: 'session-1', exercise: 'Back Squat' };
  assert.equal(nudgeMessage('hard_set', opts), nudgeMessage('hard_set', opts));
  assert.match(nudgeMessage('hard_set', opts)!, /Back Squat/);
  assert.match(nudgeMessage('last_set', opts)!, /Luis/);
  for (const kind of ['halfway', 'last_set', 'hard_set'] as const) assert.ok(nudgeMessage(kind, opts)!.length < 100);
});

function post(overrides: Partial<PostWorkoutContext> = {}, results: SessionResult[] = []): PostWorkoutContext {
  const session = finished('now', NOW);
  const highlights = computeHighlights(session, []);
  return {
    tone: 'warm', name: 'Lauren', profileId: 'partner-1', unit: 'lb', weeklyGoal: 4, session, isFirstWorkout: false,
    highlights: { ...highlights, results }, streak: computeStreak([session], 4, NOW), weeklyGoalNewlyMet: false, ...overrides,
  };
}
const result = (kind: SessionResult['kind']): SessionResult => ({
  kind, exerciseId: 'back-squat', exerciseName: 'Back Squat', reps: 5, load: 225, unit: 'lb',
  previousSessionLoad: 215, allTimeBestLoad: 215, deltaVsPrevious: 10, deltaVsBest: 10,
});

test('post-workout note picks the most meaningful thing and names real numbers', () => {
  assert.match(postWorkoutMessage(post({ isFirstWorkout: true }, [result('all_time_pr')]))!, /First workout/);
  const pr = postWorkoutMessage(post({}, [result('previous_improvement'), result('all_time_pr')]))!;
  assert.match(pr, /Back Squat/);
  assert.match(pr, /225/);
  assert.match(pr, /10/);
  assert.match(postWorkoutMessage(post({}, [result('previous_improvement')]))!, /up 10 lb from last time|\+10 lb since last time|up 10 lb on last session|10 lb/);
  assert.match(postWorkoutMessage(post({ weeklyGoalNewlyMet: true }))!, /weekly goal|Weekly goal|Goal met/i);
  const streak = { weeklyCount: 1, weeklyGoal: 4, goalMet: false, streakWeeks: 3 };
  assert.match(postWorkoutMessage(post({ streak }))!, /3/);
  assert.match(postWorkoutMessage(post())!, /Lauren/);
  assert.equal(postWorkoutMessage(post({ tone: 'off' })), null);
  assert.match(postWorkoutMessage(post({ partnerName: 'Luis' }))!, /Luis trained today too\.$/);
});
