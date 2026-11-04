import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALL_SLOTS, addDays, catchUp, defaultSchedule, planFromToday, doneSlots, firstUndone, fromDateKey, groupOfDay, isValidSchedule,
  liftOf, mondayOf, missedCount, moveWorkout, nextWorkout, parseSlotKey, positionAfter, slotDate, slotKey, toDateKey,
  weekAgenda, weeksBehind, withTrainingDays, rangeAgenda, monthGrid, addMonths,
} from '../src/engine/schedule';
import { isVerifiedCycleComplete } from '../src/engine/encouragement';
import type { WorkoutSession } from '../src/types';
import { completeSession, profile } from './helpers';

// Wednesday 2024-05-15. Its Monday is 2024-05-13.
const TODAY = '2024-05-15';
const noon = (key: string) => fromDateKey(key).getTime();
/** A schedule that already exists: Week 3 sits on this calendar week (Mon 13, Tue 14, Thu 16, Fri 17). */
const raw = (anchor = '2024-04-29') => ({ anchor, days: [0, 1, 3, 4], moves: {} as Record<string, string> });

function session(week: number, day: number, date: string, status: 'completed' | 'partial' | 'skipped' = 'completed'): WorkoutSession {
  const next = completeSession(profile(), week, day, noon(date));
  next.sessionId = `s-${week}-${day}-${date}-${status}`;
  next.completedTime = noon(date);
  next.status = status;
  next.isPartial = status === 'partial';
  next.isSkipped = status === 'skipped';
  return next;
}

test('date helpers are local, stable across daylight-saving changes, and find Mondays', () => {
  assert.equal(toDateKey(fromDateKey('2024-05-15')), '2024-05-15');
  assert.equal(mondayOf('2024-05-15'), '2024-05-13');
  assert.equal(mondayOf('2024-05-13'), '2024-05-13');
  assert.equal(mondayOf('2024-05-19'), '2024-05-13', 'Sunday belongs to the week that began on Monday');
  // US daylight saving: clocks change on 2024-03-10 and 2024-11-03.
  assert.equal(addDays('2024-03-08', 3), '2024-03-11');
  assert.equal(addDays('2024-11-01', 3), '2024-11-04');
  assert.equal(addDays('2024-03-04', 7 * 4), '2024-04-01');
  assert.equal(mondayOf('2024-03-10'), '2024-03-04');
  assert.deepEqual(parseSlotKey('W3D2'), { week: 3, day: 2 });
  assert.equal(parseSlotKey('W13D1'), null);
  assert.equal(ALL_SLOTS.length, 48);
});

test('dates follow the anchor and the Mon/Tue/Thu/Fri pattern', () => {
  const schedule = raw();
  assert.equal(schedule.anchor, '2024-04-29');
  assert.deepEqual(schedule.days, [0, 1, 3, 4]);
  assert.deepEqual([1, 2, 3, 4].map((d) => slotDate(schedule, 3, d)), ['2024-05-13', '2024-05-14', '2024-05-16', '2024-05-17']);
  assert.equal(slotDate(schedule, 4, 1), '2024-05-20', 'next week follows');
});

test('a new plan starts from today: nothing is missed before it could be done', () => {
  // Monday: the week simply starts.
  const monday = planFromToday(1, [], '2024-05-13');
  assert.deepEqual(monday.moves, {});
  assert.deepEqual([1, 2, 3, 4].map((d) => slotDate(monday, 1, d)), ['2024-05-13', '2024-05-14', '2024-05-16', '2024-05-17']);
  // Wednesday: Day 1 and Day 2 would already be in the past, so they move to the next free days.
  const wed = planFromToday(1, [], '2024-05-15');
  assert.deepEqual([1, 2, 3, 4].map((d) => slotDate(wed, 1, d)), ['2024-05-15', '2024-05-18', '2024-05-16', '2024-05-17']);
  assert.equal(missedCount(wed, [], '2024-05-15'), 0);
  assert.equal(weeksBehind(wed, [], '2024-05-15'), 0);
  assert.deepEqual(nextWorkout(wed, [], '2024-05-15'), { week: 1, day: 1, date: '2024-05-15', reason: 'today' });
  // Saturday with four workouts left: not enough days, so the week starts next Monday.
  const sat = planFromToday(1, [], '2024-05-18');
  assert.equal(slotDate(sat, 1, 1), '2024-05-20');
  assert.deepEqual(sat.moves, {});
  // Saturday with only Day 4 left fits: it moves onto Saturday.
  const lastOne = planFromToday(1, [session(1, 1, '2024-05-13'), session(1, 2, '2024-05-14'), session(1, 3, '2024-05-16')], '2024-05-18');
  assert.equal(slotDate(lastOne, 1, 4), '2024-05-18');
  // A profile that just finished Week 2 on a Saturday starts Week 3 next Monday, with nothing missed.
  const week2 = ALL_SLOTS.filter((slot) => slot.week <= 2).map((slot, index) => ({ ...session(slot.week, slot.day, '2024-05-10'), sessionId: `w2-${index}` }));
  const next = defaultSchedule({ currentWeek: 3 }, noon('2024-05-18'), week2);
  assert.equal(slotDate(next, 3, 1), '2024-05-20');
  assert.equal(missedCount(next, week2, '2024-05-18'), 0);
  // With no history the saved pointer decides the week.
  assert.equal(slotDate(defaultSchedule({ currentWeek: 3 }, noon('2024-05-13')), 3, 1), '2024-05-13');
});

test('week agenda shows missed, today, and upcoming workouts, and finished ones on the day they were done', () => {
  const schedule = raw();
  const history = [session(3, 1, '2024-05-14')]; // Monday's workout was done on Tuesday
  const week = weekAgenda(schedule, history, '2024-05-13', TODAY);
  assert.deepEqual(week.map((d) => d.weekday), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  const status = (date: string) => week.find((d) => d.date === date)!.items.map((i) => `${i.key}:${i.status}`);
  assert.deepEqual(status('2024-05-13'), []);
  assert.deepEqual(status('2024-05-14'), ['W3D1:completed', 'W3D2:missed']);
  assert.deepEqual(status('2024-05-15'), []);
  assert.deepEqual(status('2024-05-16'), ['W3D3:upcoming']);
  assert.deepEqual(status('2024-05-17'), ['W3D4:upcoming']);
  assert.equal(week.find((d) => d.isToday)!.date, TODAY);
  const onToday = weekAgenda(schedule, [], '2024-05-13', '2024-05-16');
  assert.equal(onToday.find((d) => d.date === '2024-05-16')!.items[0].status, 'today');
  const item = week[1].items[1];
  assert.equal(item.lift, 'Bench Press');
  assert.equal(item.group, 'upper');
});

test('moving: free day, swap, week and past-day limits, finished workouts, and undoing a move', () => {
  const schedule = raw();
  const slot = { week: 3, day: 3 }; // Thursday

  const toSat = moveWorkout(schedule, [], slot, '2024-05-18', TODAY);
  assert.ok(toSat.ok);
  assert.equal(slotDate(toSat.schedule, 3, 3), '2024-05-18');
  assert.deepEqual(toSat.schedule.moves, { W3D3: '2024-05-18' });
  assert.match(toSat.message, /Moved Day 3 to Saturday/);

  const toWed = moveWorkout(schedule, [], slot, '2024-05-15', TODAY);
  assert.ok(toWed.ok && slotDate(toWed.schedule, 3, 3) === '2024-05-15', 'today is allowed');

  const swap = moveWorkout(schedule, [], slot, '2024-05-17', TODAY);
  assert.ok(swap.ok);
  assert.deepEqual(swap.swappedWith, { week: 3, day: 4 });
  assert.equal(slotDate(swap.schedule, 3, 3), '2024-05-17');
  assert.equal(slotDate(swap.schedule, 3, 4), '2024-05-16');
  assert.match(swap.message, /Swapped Day 3 with Day 4/);

  const back = moveWorkout(toSat.schedule, [], slot, '2024-05-16', TODAY);
  assert.ok(back.ok);
  assert.deepEqual(back.schedule.moves, {}, 'moving back to the default day removes the override');

  assert.equal(moveWorkout(schedule, [], slot, '2024-05-21', TODAY).ok, false, 'other weeks are off limits');
  const past = moveWorkout(schedule, [], slot, '2024-05-14', TODAY);
  assert.ok(!past.ok && /passed/.test(past.reason));
  const finished = moveWorkout(schedule, [session(3, 3, '2024-05-14')], slot, '2024-05-18', TODAY);
  assert.ok(!finished.ok && /finished/.test(finished.reason));

  // A missed Monday workout can move to a free day, but cannot swap a later one into the past.
  const missed = { week: 3, day: 1 };
  assert.ok(moveWorkout(schedule, [], missed, '2024-05-15', TODAY).ok);
  const swapIntoPast = moveWorkout(schedule, [], missed, '2024-05-16', TODAY);
  assert.ok(!swapIntoPast.ok && /passed/.test(swapIntoPast.reason));
});

test('falling behind: weeks behind, missed count, and catching up without moving history', () => {
  const schedule = raw('2024-05-13'); // Week 1 on the week of May 13, nothing done
  const today = '2024-06-05'; // three weeks later
  assert.equal(weeksBehind(schedule, [], today), 3);
  assert.equal(missedCount(schedule, [], today) >= 4, true);
  const caught = catchUp(schedule, [], today);
  assert.equal(caught.anchor, '2024-06-03');
  assert.deepEqual([1, 2, 3, 4].map((d) => slotDate(caught, 1, d)), ['2024-06-05', '2024-06-08', '2024-06-06', '2024-06-07'], 'passed days move to the next free days');
  assert.equal(weeksBehind(caught, [], today), 0);
  assert.equal(missedCount(caught, [], today), 0);

  const history = [session(1, 1, '2024-05-14')];
  const second = catchUp({ ...schedule, moves: { W1D1: '2024-05-20', W1D3: '2024-05-23' } }, history, today);
  assert.deepEqual(second.moves, { W1D2: '2024-06-05' }, 'stale moves are cleared and the next unfinished workout lands today');
  assert.equal(doneSlots(history).get('W1D1')!.date, '2024-05-14', 'finished workouts keep their dates');
  assert.equal(weeksBehind(raw('2024-05-13'), [], '2024-05-15'), 0);
});

test('position follows what is done, not the order: Day 3 first leaves Day 1 as next', () => {
  const day3 = session(1, 3, '2024-05-14');
  assert.deepEqual(positionAfter([], day3), { currentWeek: 1, currentDay: 1, cycleCompleted: false });
  const day1 = session(1, 1, '2024-05-15');
  assert.deepEqual(positionAfter([day3], day1), { currentWeek: 1, currentDay: 2, cycleCompleted: false });
  const day2 = session(1, 2, '2024-05-16');
  assert.deepEqual(positionAfter([day3, day1], day2), { currentWeek: 1, currentDay: 4, cycleCompleted: false });
  const day4 = session(1, 4, '2024-05-17');
  assert.deepEqual(positionAfter([day3, day1, day2], day4), { currentWeek: 2, currentDay: 1, cycleCompleted: false });
  // Re-counting a session already in history does not change anything.
  assert.deepEqual(positionAfter([day3, day1], day1), { currentWeek: 1, currentDay: 2, cycleCompleted: false });
});

test('skipped and partial workouts count as done, and the best status wins', () => {
  const skipped = session(1, 1, '2024-05-13', 'skipped');
  const partial = session(1, 2, '2024-05-14', 'partial');
  assert.deepEqual(positionAfter([skipped], partial), { currentWeek: 1, currentDay: 3, cycleCompleted: false });
  const redo = session(1, 1, '2024-05-16');
  assert.equal(doneSlots([skipped, redo]).get('W1D1')!.status, 'completed');
  assert.equal(doneSlots([redo, skipped]).get('W1D1')!.status, 'completed');
  const demo = { ...session(1, 4, '2024-05-17'), isDemo: true };
  assert.equal(doneSlots([demo]).size, 0, 'demo sessions never count');
  assert.deepEqual(firstUndone(doneSlots([])), { week: 1, day: 1 });
});

test('finishing all 48 in any order completes the cycle, and only the last one does', () => {
  const history: WorkoutSession[] = [];
  const order = [...ALL_SLOTS].reverse(); // every workout done in the opposite order
  let last: WorkoutSession | undefined;
  order.forEach((slot, index) => {
    const next = session(slot.week, slot.day, '2024-05-13');
    next.sessionId = `cycle-${index}`;
    if (index < 47) history.push(next); else last = next;
  });
  assert.equal(isVerifiedCycleComplete(last!, history), true, 'W1D1 finishing last completes the cycle');
  assert.equal(isVerifiedCycleComplete(history[3], history.filter((s) => s !== history[3])), false);
  assert.deepEqual(positionAfter(history, last!), { currentWeek: 12, currentDay: 4, cycleCompleted: true });
  assert.equal(positionAfter(history, history[0]).cycleCompleted, false);
});

test('the next workout is today\'s, then the next upcoming, then the earliest missed', () => {
  const schedule = raw();
  assert.deepEqual(nextWorkout(schedule, [], '2024-05-14'), { week: 3, day: 2, date: '2024-05-14', reason: 'today' });
  assert.deepEqual(nextWorkout(schedule, [], TODAY), { week: 3, day: 3, date: '2024-05-16', reason: 'upcoming' }, 'rest day: next one coming');
  const afterAll = '2025-01-01';
  const fallBehind = nextWorkout(schedule, [], afterAll)!;
  assert.equal(fallBehind.reason, 'missed');
  assert.deepEqual([fallBehind.week, fallBehind.day], [1, 1]);
  assert.equal(nextWorkout(schedule, ALL_SLOTS.map((s, i) => ({ ...session(s.week, s.day, '2024-05-13'), sessionId: `x${i}` })), TODAY), null);
  // A workout dragged to today becomes today's workout.
  const dragged = moveWorkout(schedule, [], { week: 3, day: 4 }, TODAY, TODAY);
  assert.ok(dragged.ok);
  assert.deepEqual(nextWorkout(dragged.schedule, [], TODAY), { week: 3, day: 4, date: TODAY, reason: 'today' });
});

test('training days can change; dragged workouts keep their dates', () => {
  const schedule = { ...raw(), moves: { W3D3: '2024-05-18' } };
  const changed = withTrainingDays(schedule, [0, 2, 4, 5]);
  assert.deepEqual([1, 2, 4].map((d) => slotDate(changed, 3, d)), ['2024-05-13', '2024-05-15', '2024-05-18']);
  assert.equal(slotDate(changed, 3, 3), '2024-05-18', 'the dragged workout stays where it was put');
});

test('lifts and lower/upper groups follow the program', () => {
  assert.equal(liftOf(1, 1), 'Back Squat');
  assert.equal(liftOf(1, 3), 'Back Squat');
  assert.equal(liftOf(7, 3), 'Deadlift');
  assert.equal(liftOf(1, 4), 'Military Press');
  assert.deepEqual([1, 2, 3, 4].map(groupOfDay), ['legs', 'upper', 'legs', 'upper']);
  assert.equal(slotKey(12, 4), 'W12D4');
});

test('schedule validation accepts real schedules and rejects malformed ones', () => {
  const ok = { anchor: '2024-05-13', days: [0, 1, 3, 4], moves: { W3D3: '2024-05-18' } };
  assert.equal(isValidSchedule(ok), true);
  assert.equal(isValidSchedule(defaultSchedule({ currentWeek: 5 }, noon(TODAY))), true);
  assert.equal(isValidSchedule(planFromToday(1, [], '2024-05-15')), true, 'packed plans are valid too');
  assert.equal(isValidSchedule({ ...ok, anchor: '2024-05-15' }), false, 'anchor must be a Monday');
  assert.equal(isValidSchedule({ ...ok, anchor: 'tomorrow' }), false);
  assert.equal(isValidSchedule({ ...ok, anchor: '2024-02-31' }), false);
  assert.equal(isValidSchedule({ ...ok, days: [0, 1, 3] }), false);
  assert.equal(isValidSchedule({ ...ok, days: [0, 1, 1, 4] }), false);
  assert.equal(isValidSchedule({ ...ok, days: [0, 1, 3, 7] }), false);
  assert.equal(isValidSchedule({ ...ok, moves: { W13D1: '2024-05-18' } }), false);
  assert.equal(isValidSchedule({ ...ok, moves: { W3D3: 'soon' } }), false);
  assert.equal(isValidSchedule({ ...ok, moves: [] }), false);
  assert.equal(isValidSchedule(null), false);
});

test('monthGrid covers whole Monday-to-Sunday rows, and rangeAgenda matches weekAgenda', () => {
  const grid = monthGrid('2024-05-17');
  assert.equal(grid.length, 5);
  assert.deepEqual(grid[0][0], { date: '2024-04-29', inMonth: false });
  assert.deepEqual(grid[0][2], { date: '2024-05-01', inMonth: true });
  assert.deepEqual(grid[4][6], { date: '2024-06-02', inMonth: false });
  assert.ok(grid.every((row) => row.length === 7 && row[0].date === mondayOf(row[0].date)));
  assert.equal(monthGrid('2024-02-10').length, 5);
  assert.equal(monthGrid('2027-02-10').length, 4, 'a February that starts on Monday fits four rows');
  assert.equal(monthGrid('2024-09-10').length, 6);
  assert.equal(addMonths('2024-01-31', 1), '2024-02-01');
  assert.equal(addMonths('2024-01-15', -1), '2023-12-01');
  const schedule = planFromToday(1, [], '2024-05-13');
  const week = weekAgenda(schedule, [], '2024-05-13', '2024-05-15');
  assert.deepEqual(rangeAgenda(schedule, [], '2024-05-13', 7, '2024-05-15'), week);
  const long = rangeAgenda(schedule, [], '2024-05-13', 14, '2024-05-15');
  assert.equal(long.length, 14);
  assert.equal(long[8].weekday, 'Tue');
  assert.equal(long.flatMap((day) => day.items).length, 8, 'two program weeks of four workouts');
});
