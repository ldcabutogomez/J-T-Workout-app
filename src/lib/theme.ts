import type { ColorTheme } from '../types';

export const COLOR_THEMES: readonly ColorTheme[] = ['lavender', 'blue', 'vermilion'];
export const THEME_STORAGE_KEY = 'jnt2_color_theme';

/**
 * Picker swatches and browser-chrome colors. The real palettes live in index.css; tests/themes.test.ts
 * checks that `paper` and `accent` here match them.
 */
export const THEMES: Record<ColorTheme, { label: string; paper: string; accent: string }> = {
  lavender: { label: 'Lavender', paper: '#f3eff9', accent: '#7b4fc4' },
  blue: { label: 'Blue', paper: '#eef2f7', accent: '#1f5fbf' },
  vermilion: { label: 'Vermilion', paper: '#f4f0e8', accent: '#d63d16' },
};

export const isColorTheme = (value: unknown): value is ColorTheme =>
  typeof value === 'string' && (COLOR_THEMES as readonly string[]).includes(value);

/** Lauren and Luis start on their own themes; any other profile keeps the original vermilion. */
export function defaultThemeForId(profileId: string): ColorTheme {
  if (profileId === 'partner-1') return 'lavender';
  if (profileId === 'partner-2') return 'blue';
  return 'vermilion';
}

export function themeForProfile(profile: { id: string; colorTheme?: ColorTheme }): ColorTheme {
  return profile.colorTheme ?? defaultThemeForId(profile.id);
}

/** Switches the whole app by changing which set of CSS variables is active. */
export function applyTheme(theme: ColorTheme): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEMES[theme].paper);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The saved theme only prevents a flash on the next load; the app works without it.
  }
}
