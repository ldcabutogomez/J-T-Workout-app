import assert from 'node:assert/strict';
import test from 'node:test';
import { setInputProblem } from '../src/lib/setInput';

test('whole, non-negative reps and a non-negative load are fine', () => {
  assert.equal(setInputProblem(135, 5), null);
  assert.equal(setInputProblem(0, 0), null, 'a bodyweight set with zero added load');
  assert.equal(setInputProblem('', ''), null, 'empty fields are not a problem, just not loggable yet');
  assert.equal(setInputProblem(132.5, 8), null, 'fractional loads are normal');
});

test('fractional or negative reps and negative loads say what is wrong', () => {
  assert.equal(setInputProblem(100, 5.5), 'Reps must be a whole number.');
  assert.equal(setInputProblem(100, -1), "Reps can't be negative.");
  assert.equal(setInputProblem(-5, 5), "Load can't be negative.");
  assert.equal(setInputProblem(Number.NaN, 5), 'Load must be a number.');
  assert.equal(setInputProblem(100, Number.POSITIVE_INFINITY), 'Reps must be a number.');
});
