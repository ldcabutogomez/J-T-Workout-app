import type { ColorTheme } from '../types';

/** Perks unlock with level (see engine/xp.ts). Everything here is cosmetic or playful, never a training change. */

export type FlairIconKey = 'sparkles' | 'flame' | 'church' | 'crown' | 'trophy';

export interface Flair {
  id: string;
  /** Shown as your title next to your name on the leaderboard. */
  label: string;
  level: number;
  icon: FlairIconKey;
}

export const FLAIRS: Flair[] = [
  { id: 'spark', label: 'Spark', level: 2, icon: 'sparkles' },
  { id: 'flame', label: 'On Fire', level: 3, icon: 'flame' },
  { id: 'bishop', label: 'Bishop', level: 5, icon: 'church' },
  { id: 'crown', label: 'Royalty', level: 7, icon: 'crown' },
  { id: 'legend', label: 'Legend', level: 10, icon: 'trophy' },
];

export const flairById = (id: unknown): Flair | undefined =>
  typeof id === 'string' ? FLAIRS.find((flair) => flair.id === id) : undefined;

/** Themes beyond the three everyone starts with. */
export const THEME_UNLOCK_LEVEL: Partial<Record<ColorTheme, number>> = { forest: 3, rose: 6 };

export const themeUnlocked = (theme: ColorTheme, level: number): boolean => level >= (THEME_UNLOCK_LEVEL[theme] ?? 1);

export const TAUNT_LEVEL = 4;
export const TAUNT_COOLDOWN_MS = 10 * 60_000;
/** A taunt that is older than this is stale news, so it is never shown. */
export const TAUNT_FRESH_MS = 24 * 3_600_000;

/** Canned on purpose: nothing typed by one phone ends up on the other, and every line is friendly. */
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
];

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
  ...FLAIRS.map((flair) => ({ level: flair.level, text: `${flair.label} flair` })),
  ...Object.entries(THEME_UNLOCK_LEVEL).map(([theme, level]) => ({ level: level as number, text: `${theme[0].toUpperCase()}${theme.slice(1)} theme` })),
  { level: TAUNT_LEVEL, text: 'Send taunts to your partner' },
].sort((a, b) => a.level - b.level);

export const perksBetween = (from: number, to: number): string[] =>
  PERK_UNLOCKS.filter((perk) => perk.level > from && perk.level <= to).map((perk) => perk.text);
