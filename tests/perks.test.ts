import assert from 'node:assert/strict';
import test from 'node:test';
import { FLAIRS, TAUNTS, TAUNT_LEVEL, tauntLevel, flairById, flairUnlocked, perksBetween, tauntText, themeUnlocked } from '../src/lib/perks';
import { parseSnapshot, snapshotFromHistory, statsFromSnapshot } from '../src/engine/leaderboard';
import { completeSession, profile } from './helpers';

const NOW = new Date(2024, 4, 15, 12).getTime();

test('Bishop is a flair, unlocked at level 5, and level-ups announce what unlocked', () => {
  const bishop = flairById('bishop');
  assert.equal(bishop?.label, 'Bishop');
  assert.equal(bishop?.level, 5);
  assert.equal(flairById('nope'), undefined);
  const byLevel = FLAIRS.filter((flair) => !flair.badge && !flair.debuff);
  assert.ok(byLevel.every((flair, i) => i === 0 || flair.level >= byLevel[i - 1].level));
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

test('seasonal flairs are earned with their badge, not by level', () => {
  const winter = flairById('winter')!;
  assert.equal(winter.badge, 'season_winter');
  assert.equal(flairUnlocked(winter, 99, []), false, 'level alone never unlocks it');
  assert.equal(flairUnlocked(winter, 1, ['season_winter']), true);
  assert.equal(flairById('thanksgiving')?.badge, 'holiday_thanksgiving');
  assert.equal(flairById('christmas')?.badge, 'holiday_christmas');
  assert.equal(flairUnlocked(flairById('christmas')!, 99, []), false);
  assert.equal(flairUnlocked(flairById('bishop')!, 5, []), true);
  assert.equal(flairUnlocked(flairById('bishop')!, 4, ['season_winter']), false);
  assert.ok(!perksBetween(1, 99).some((text) => /Frostbite|In Bloom|Sunburnt|Leaf/.test(text)), 'seasonal flairs are not level unlocks');
});

test('the battery taunt is in the list', () => {
  assert.ok(TAUNTS.includes("You're behaving like a battery right now."));
  assert.equal(tauntText(TAUNTS.indexOf("You're behaving like a battery right now.")), "You're behaving like a battery right now.");
});

test('taunts are tiered by level and none unlock before the base level', () => {
  for (let id = 0; id < TAUNTS.length; id++) assert.ok(tauntLevel(id) >= TAUNT_LEVEL);
  assert.equal(tauntLevel(0), TAUNT_LEVEL);
  assert.ok(TAUNTS.some((_, id) => tauntLevel(id) >= 12));
});

test('missing last week goal puts you on The Battery until next Monday, and only after your first full week', async () => {
  const { batteryDebuff } = await import('../src/engine/debuff');
  const day = 24 * 3_600_000;
  const lastWeek = new Date(2024, 4, 6, 12).getTime();
  const at = (offset: number, n: number) => Array.from({ length: n }, (_, i) => completeSession(profile(), 1, 1, offset + i * 10_000));
  const earlier = new Date(2024, 3, 29, 12).getTime();

  // Trained the week before, then only 2 of 4 last week: debuffed through Sunday.
  const missed = batteryDebuff([...at(earlier, 4), ...at(lastWeek, 2)], 4, NOW);
  assert.equal(missed.active, true);
  assert.equal(missed.until, new Date(2024, 4, 20).getTime());

  // Hit 4 last week: clean.
  assert.equal(batteryDebuff([...at(earlier, 4), ...at(lastWeek, 4)], 4, NOW).active, false);
  // Brand new last week: that was the start week, nobody is punished for it.
  assert.equal(batteryDebuff(at(lastWeek, 1), 4, NOW).active, false);
  // No history at all.
  assert.equal(batteryDebuff([], 4, NOW).active, false);
  // A full week of nothing after earlier activity counts as a miss.
  assert.equal(batteryDebuff(at(earlier, 4), 4, NOW).active, true);
  // The debuff is over once the new week arrives and it is judged on its own.
  assert.equal(batteryDebuff([...at(earlier, 4), ...at(lastWeek, 2)], 4, NOW + 7 * day).active, true);
});

test('the battery debuff travels in the snapshot and is not a pickable flair', () => {
  assert.equal(flairById('battery')?.debuff, true);
  assert.equal(perksBetween(0, 99).some((text) => /battery/i.test(text)), false);
  const parsed = parseSnapshot(JSON.parse(JSON.stringify({ ...snapshotFromHistory(profile(), [], NOW, 'dev'), batteryUntil: NOW + 1000 })));
  assert.equal(parsed?.batteryUntil, NOW + 1000);
});
