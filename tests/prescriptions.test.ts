import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateSetLoad, getDayPrescription, PRESCRIPTION_DATASET, roundLoad } from '../src/engine/jnt2Engine';
import { expectedDay, expectedDayRange } from './workbookExpectations';
import { profile } from './helpers';

function basis(value: ReturnType<typeof getDayPrescription>['exercises'][number]['loadBasis']): string | undefined {
  if (!value) return undefined;
  if (value.kind === 'training_max') return `${value.kind}:${value.key}:${value.block}`;
  if (value.kind === 'achieved_rm') return `${value.kind}:${value.slotId}`;
  return value.kind;
}

test('all 48 prescriptions match the independently transcribed workbook fixture', () => {
  assert.equal(PRESCRIPTION_DATASET.length, 48);
  for (let week = 1; week <= 12; week += 1) {
    for (let day = 1; day <= 4; day += 1) {
      const actual = getDayPrescription(week, day);
      assert.deepEqual(actual.sourceRefs[0].ranges, [expectedDayRange(week, day)], `W${week} D${day} day source`);
      assert.deepEqual(actual.sourceRefs.map((item) => item.sheet), ['J&T2.0', 'J&T2.0 KGS']);
      const summarized = actual.exercises.map((slot) => {
        const result: Record<string, unknown> = {
          slotId: slot.slotId, tier: slot.tier, name: slot.exerciseName, status: slot.status,
          setType: slot.setType, setCount: slot.setCount, reps: slot.repTarget,
          ranges: slot.sourceRefs[0].ranges,
        };
        if (slot.percentage !== undefined) result.percentage = slot.percentage;
        const loadBasis = basis(slot.loadBasis);
        if (loadBasis !== undefined) result.basis = loadBasis;
        return result;
      });
      assert.deepEqual(summarized, expectedDay(week, day), `W${week} D${day}`);
      for (const slot of actual.exercises) {
        assert.deepEqual(slot.sourceRefs[0].ranges, slot.sourceRefs[1].ranges, `W${week} D${day} ${slot.slotId} unit-sheet sources`);
        for (const ref of slot.sourceRefs) {
          assert.match(ref.sheet, /^J&T2\.0(?: KGS)?$/);
          ref.ranges.forEach((range) => assert.match(range, /^[A-Z]+\d+(?::[A-Z]+\d+)?$/, `${slot.slotId} has a real cell range`));
        }
        assert.equal(slot.prescribedSets.length, slot.setCount);
      }
    }
  }
});

test('known numeric load regressions use the correct bases and rounding', () => {
  const p = profile();
  const day = getDayPrescription(1, 1, p);
  const squat = day.exercises.find((item) => item.slotId === 'd1-t1-primary')!;
  const deficit = day.exercises.find((item) => item.slotId === 'd1-t2a')!;
  assert.equal(calculateSetLoad(squat.prescribedSets[1], p), 140);
  assert.equal(calculateSetLoad(deficit.prescribedSets[0], p), 150);
  assert.notEqual(calculateSetLoad(deficit.prescribedSets[0], p), 100);
  const block2Backoff = getDayPrescription(7, 1, p).exercises[0].prescribedSets[1];
  assert.equal(calculateSetLoad(block2Backoff, p, 200), 170);
  assert.equal(roundLoad(100 * 0.825, 2.5), 82.5);
});

test('T2a exercise-specific mappings, late schemes, transitions, and conflicts are preserved', () => {
  assert.deepEqual(getDayPrescription(1, 1).exercises.find((item) => item.slotId === 'd1-t2a')!.loadBasis, { kind: 'training_max', key: 'deadlift', block: 1 });
  assert.deepEqual(getDayPrescription(1, 4).exercises.find((item) => item.slotId === 'd4-t2a')!.loadBasis, { kind: 'training_max', key: 'bench', block: 1 });
  assert.deepEqual(getDayPrescription(7, 3).exercises.find((item) => item.slotId === 'd3-t2a')!.loadBasis, { kind: 'training_max', key: 'front_squat', block: 2 });
  assert.equal(getDayPrescription(1, 1).exercises.find((item) => item.slotId === 'd1-t2a')!.percentage, 0.5);
  assert.equal(getDayPrescription(1, 4).exercises.find((item) => item.slotId === 'd4-t2a')!.percentage, 0.45);
  assert.deepEqual([8, 9, 11].map((week) => {
    const slot = getDayPrescription(week, 1).exercises.find((item) => item.slotId === 'd1-t2a')!;
    return [slot.setCount, slot.repTarget];
  }), [[5, 5], [5, 4], [7, 2]]);
  assert.equal(getDayPrescription(1, 3).exercises[0].exerciseName, 'Front Squat');
  assert.equal(getDayPrescription(7, 3).exercises[0].exerciseName, 'Deadlift');
  for (const day of [2, 3]) {
    const slot = getDayPrescription(12, day).exercises.find((item) => item.slotId === `d${day}-t2a`)!;
    assert.equal(slot.status, 'test');
    assert.match(slot.ambiguity!, /Find 1RM/);
    assert.match(slot.ambiguity!, /T2 Rest/);
  }
});

test('invalid positions and invalid load inputs are rejected', () => {
  for (const [week, day] of [[0, 1], [13, 1], [1.5, 1], [1, 0], [1, 5], [1, 2.5]]) {
    assert.throws(() => getDayPrescription(week, day), RangeError);
  }
  assert.throws(() => roundLoad(-1, 5), RangeError);
  assert.throws(() => roundLoad(100, 0), RangeError);
});

test('custom names are separate from load-bearing mappings', () => {
  const p = profile({ exerciseCustomizations: { 'd1-t2b': 'My Split Squat', 'd1-t2a': 'Wrong Lift' } });
  const day = getDayPrescription(1, 1, p);
  assert.equal(day.exercises.find((item) => item.slotId === 'd1-t2b')!.exerciseName, 'My Split Squat');
  assert.equal(day.exercises.find((item) => item.slotId === 'd1-t2b')!.exerciseId, 'custom-my-split-squat');
  assert.equal(day.exercises.find((item) => item.slotId === 'd1-t2a')!.exerciseName, '2" Deficit Deadlift');
  assert.deepEqual(day.exercises.find((item) => item.slotId === 'd1-t2a')!.loadBasis, { kind: 'training_max', key: 'deadlift', block: 1 });
});
