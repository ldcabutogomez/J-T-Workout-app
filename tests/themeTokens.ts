import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

/** Color tokens declared in a block of CSS, e.g. { paper: '#f4f0e8' }. */
function colorTokens(block: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of block.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) result[match[1]] = match[2].toLowerCase();
  return result;
}

// The default theme is the @theme block only, which ends where the first [data-theme] override begins.
const base = colorTokens(css.slice(css.indexOf('@theme'), css.indexOf(':root[data-theme=')));

/** Base tokens with each [data-theme] block merged over them. Vermilion is the base itself. */
export function themeBlock(name: string): Record<string, string> {
  const match = css.match(new RegExp(`:root\\[data-theme='${name}'\\]\\s*\\{([^}]*)\\}`));
  assert.ok(match, `missing theme block for ${name}`);
  return colorTokens(match[1]);
}

export const THEME_TOKENS: Record<string, Record<string, string>> = {
  vermilion: base,
  lavender: { ...base, ...themeBlock('lavender') },
  blue: { ...base, ...themeBlock('blue') },
  forest: { ...base, ...themeBlock('forest') },
  rose: { ...base, ...themeBlock('rose') },
};

