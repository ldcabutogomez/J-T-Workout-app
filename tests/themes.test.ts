import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { COLOR_THEMES, THEMES, defaultThemeForId, isColorTheme, themeForProfile } from '../src/lib/theme';
import { StorageService } from '../src/storage/db';
import { profile } from './helpers';
import { THEME_TOKENS } from './themeTokens';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}
Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true });

test('Lauren defaults to lavender, Luis to blue, anyone else to vermilion; an explicit choice wins', () => {
  assert.equal(themeForProfile({ id: 'partner-1' }), 'lavender');
  assert.equal(themeForProfile({ id: 'partner-2' }), 'blue');
  assert.equal(themeForProfile({ id: 'p1' }), 'vermilion');
  assert.equal(defaultThemeForId('partner-1'), 'lavender');
  assert.equal(themeForProfile({ id: 'partner-1', colorTheme: 'vermilion' }), 'vermilion');
  assert.equal(themeForProfile({ id: 'partner-2', colorTheme: 'lavender' }), 'lavender');
});

test('picker swatches and the pre-paint script match the real palettes', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const name of COLOR_THEMES) {
    assert.equal(THEMES[name].paper, THEME_TOKENS[name].paper, `${name} paper swatch`);
    assert.equal(THEMES[name].accent, THEME_TOKENS[name].accent, `${name} accent swatch`);
    assert.ok(html.includes(`${name}: '${THEMES[name].paper}'`), `${name} paper color in index.html inline script`);
  }
});

test('color theme validation accepts the three themes only, and backups round-trip it', async () => {
  assert.ok(COLOR_THEMES.every(isColorTheme));
  assert.equal(isColorTheme('dark'), false);
  assert.equal(isColorTheme(undefined), false);

  const source = new StorageService('theme-src', 'test_theme_src');
  const p = profile({ colorTheme: 'lavender' });
  await source.saveProfile(p);
  assert.equal((await source.getProfiles())[0].colorTheme, 'lavender');
  await assert.rejects(source.saveProfile(profile({ colorTheme: 'neon' as never })), /malformed profile/);

  const backup = await source.exportBackup();
  const target = new StorageService('theme-dst', 'test_theme_dst');
  assert.equal((await target.importBackup(backup, 'replace-all')).success, true);
  assert.equal((await target.getProfiles())[0].colorTheme, 'lavender');

  const bad = JSON.parse(backup);
  bad.profiles[0].colorTheme = 'dark';
  assert.equal((await target.importBackup(JSON.stringify(bad), 'replace-all')).success, false);

  const legacy = new StorageService('theme-legacy', 'test_theme_legacy');
  await legacy.saveProfile(profile());
  assert.equal((await legacy.getProfiles())[0].colorTheme, undefined, 'profiles saved before themes still validate');
});
