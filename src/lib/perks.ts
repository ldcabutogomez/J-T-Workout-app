import type { ColorTheme } from '../types';

/** Perks unlock with level (see engine/xp.ts). Everything here is cosmetic or playful, never a training change. */

export type FlairIconKey = 'sparkles' | 'flame' | 'church' | 'crown' | 'trophy' | 'snowflake' | 'flower' | 'sun' | 'leaf' | 'drumstick' | 'tree' | 'battery';

export interface Flair {
  id: string;
  /** Shown as your title next to your name on the leaderboard. */
  label: string;
  level: number;
  icon: FlairIconKey;
  /** Seasonal flairs are earned with a badge instead of a level. */
  badge?: string;
  /** Imposed, not chosen: worn for a week after missing the weekly goal. Never in the picker. */
  debuff?: boolean;
}

export const FLAIRS: Flair[] = [
  { id: 'spark', label: 'Spark', level: 2, icon: 'sparkles' },
  { id: 'flame', label: 'On Fire', level: 3, icon: 'flame' },
  { id: 'bishop', label: 'Bishop', level: 5, icon: 'church' },
  { id: 'crown', label: 'Royalty', level: 7, icon: 'crown' },
  { id: 'legend', label: 'Legend', level: 10, icon: 'trophy' },
  // Seasonal: unlocked by the matching seasonal badge, and yours to keep once earned.
  { id: 'winter', label: 'Frostbite', level: 1, icon: 'snowflake', badge: 'season_winter' },
  { id: 'spring', label: 'In Bloom', level: 1, icon: 'flower', badge: 'season_spring' },
  { id: 'summer', label: 'Sunburnt', level: 1, icon: 'sun', badge: 'season_summer' },
  { id: 'fall', label: 'Leaf Peeper', level: 1, icon: 'leaf', badge: 'season_fall' },
  // Holidays: unlocked by the matching holiday badge.
  { id: 'thanksgiving', label: 'Gobbler', level: 1, icon: 'drumstick', badge: 'holiday_thanksgiving' },
  { id: 'christmas', label: 'Santa Claws', level: 1, icon: 'tree', badge: 'holiday_christmas' },
  { id: 'battery', label: 'The Battery', level: 1, icon: 'battery', debuff: true },
];

/** Flair id worn while the weekly-goal debuff is active. */
export const BATTERY_FLAIR = 'battery';

/** Whether a flair can be equipped at this level with these badges. */
export const flairUnlocked = (flair: Flair, level: number, badgeIds: readonly string[]): boolean =>
  flair.badge ? badgeIds.includes(flair.badge) : level >= flair.level;

export const flairById = (id: unknown): Flair | undefined =>
  typeof id === 'string' ? FLAIRS.find((flair) => flair.id === id) : undefined;

/** Themes beyond the three everyone starts with. */
export const THEME_UNLOCK_LEVEL: Partial<Record<ColorTheme, number>> = { forest: 3, rose: 6 };

export const themeUnlocked = (theme: ColorTheme, level: number): boolean => level >= (THEME_UNLOCK_LEVEL[theme] ?? 1);

export const TAUNT_LEVEL = 4;
export const TAUNT_COOLDOWN_MS = 10 * 60_000;
/** A taunt that is older than this is stale news, so it is never shown. */
export const TAUNT_FRESH_MS = 24 * 3_600_000;

/** Canned on purpose: nothing typed by one phone ends up on the other. Cheeky, never cruel. Ids are indexes, so only ever append. */
export const TAUNTS: string[] = [
  'Your barbell is lonely. Just saying.',
  'Rest day again? Bold strategy.',
  'I lifted. You scrolled. Math checks out.',
  'The weights are not going to lift themselves, champ.',
  'Breaking news: my streak just waved at yours.',
  'Fun fact: sets do not log themselves.',
  'Is it a rest day or a rest week? Asking for the leaderboard.',
  'I can hear your couch calling. Ignore it.',
  'Your PRs miss you.',
  'Bishop to rack. Checkmate in two sets.',
  "You're behaving like a battery right now.",
  'Nice rack. Shame you never use it.',
  'Spotting you is the closest you get to action this week.',
  'My pump is better than yours. Come see for yourself.',
  'Go deeper. Squats, I mean. Mostly.',
  "Still can't finish a set? Bedroom problem too?",
  'Get under the bar already. I know you like it heavy.',
  "Two sets and you're out of breath? Stamina is sexy. Get some.",
];

/** Level that unlocks each taunt, by id. Anything not listed opens at TAUNT_LEVEL. */
const TAUNT_UNLOCK: Record<number, number> = {
  2: 8, 6: 8, 7: 8, 8: 8,
  4: 12, 9: 12, 10: 12, 11: 12, 12: 12, 13: 12,
  14: 16, 15: 16, 16: 16,
};

export const tauntLevel = (id: number): number => TAUNT_UNLOCK[id] ?? TAUNT_LEVEL;
export const tauntUnlocked = (id: number, level: number): boolean => level >= tauntLevel(id);

export const tauntText = (id: unknown): string | undefined =>
  typeof id === 'number' && Number.isInteger(id) && id >= 0 && id < TAUNTS.length ? TAUNTS[id] : undefined;

export interface Taunt {
  /** Index into TAUNTS. */
  id: number;
  at: number;
}

export interface PerkUnlock {
  level: number;
  text: string;
}

/** Everything that unlocks, in level order, for the level-up message and the Settings list. */
export const PERK_UNLOCKS: PerkUnlock[] = [
  ...FLAIRS.filter((flair) => !flair.badge && !flair.debuff).map((flair) => ({ level: flair.level, text: `${flair.label} flair` })),
  ...Object.entries(THEME_UNLOCK_LEVEL).map(([theme, level]) => ({ level: level as number, text: `${theme[0].toUpperCase()}${theme.slice(1)} theme` })),
  { level: TAUNT_LEVEL, text: 'Send taunts to your partner' },
  { level: 8, text: 'Sharper taunts' },
  { level: 12, text: 'Spicy taunts' },
  { level: 16, text: 'Filthy taunts' },
].sort((a, b) => a.level - b.level);

export const perksBetween = (from: number, to: number): string[] =>
  PERK_UNLOCKS.filter((perk) => perk.level > from && perk.level <= to).map((perk) => perk.text);
