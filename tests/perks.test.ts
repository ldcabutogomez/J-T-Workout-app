import assert from 'node:assert/strict';
import test from 'node:test';
import { FLAIRS, TAUNTS, TAUNT_LEVEL, flairById, perksBetween, tauntText, themeUnlocked } from '../src/lib/perks';
import { parseSnapshot, snapshotFromHistory, statsFromSnapshot } from '../src/engine/leaderboard';
import { completeSession, profile } from './helpers';

const NOW = new Date(2024, 4, 15, 12).getTime();

test('Bishop is a flair, unlocked at level 5, and level-ups announce what unlocked', () => {
  const bishop = flairById('bishop');
  assert.equal(bishop?.label, 'Bishop');
  assert.equal(bishop?.level, 5);
  assert.equal(flairById('nope'), undefined);
  assert.ok(FLAIRS.every((flair, i) => i === 0 || flair.level >= FLAIRS[i - 1].level));
  assert.ok(perksBetween(4, 5).includes('Bishop flair'));
  assert.deepEqual(perksBetween(5, 5), []);
  assert.ok(perksBetween(1, 10).includes('Send taunts to your partner'));
});

test('themes unlock by level, and the starter themes are always open', () => {
  assert.equal(themeUnlocked('vermilion', 1), true);
  assert.equal(themeUnlocked('forest', 2), false);
  assert.equal(themeUnlocked('forest', 3), true);
  assert.equal(themeUnlocked('rose', 5), false);
  assert.equal(themeUnlocked('rose', 6), true);
});

test('taunts are canned lines, validated by index', () => {
  assert.equal(tauntText(0), TAUNTS[0]);
  assert.equal(tauntText(TAUNTS.length), undefined);
  assert.equal(tauntText(-1), undefined);
  assert.equal(tauntText('0'), undefined);
  assert.ok(TAUNT_LEVEL >= 2);
});

test('flair and taunt travel in the snapshot, and a bad value from another phone is dropped', () => {
  const p = profile({ flair: 'bishop', taunt: { id: 2, at: NOW - 1000 } });
  const snap = snapshotFromHistory(p, [completeSession(p)], NOW, 'dev-1');
  const wire = parseSnapshot(JSON.parse(JSON.stringify(snap)))!;
  assert.equal(wire.flair, 'bishop');
  assert.deepEqual(wire.taunt, { id: 2, at: NOW - 1000 });
  const stats = statsFromSnapshot(wire, NOW);
  assert.equal(stats.flair, 'bishop');
  assert.equal(stats.taunt?.id, 2);

  const bad = parseSnapshot({ ...JSON.parse(JSON.stringify(snap)), flair: '<script>', taunt: { id: 99, at: NOW } })!;
  assert.equal(bad.flair, undefined);
  assert.equal(bad.taunt, undefined);
  assert.equal(bad.name, snap.name, 'the stats still show');
});
