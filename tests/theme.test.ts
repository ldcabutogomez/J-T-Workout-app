import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

/** Color tokens from the @theme block, e.g. { paper: '#f4f0e8' }. */
function tokens(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) result[match[1]] = match[2].toLowerCase();
  return result;
}

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const t = tokens();
const ratio = (fg: string, bg: string) => {
  assert.ok(t[fg], `missing token ${fg}`);
  assert.ok(t[bg], `missing token ${bg}`);
  return contrast(t[fg], t[bg]);
};

test('text colors meet WCAG AA (4.5:1) on paper, surface, and sunk', () => {
  for (const fg of ['ink', 'ink-2', 'muted', 'accent-ink', 'ok', 'warn', 'bad', 'gold-ink']) {
    for (const bg of ['paper', 'surface', 'sunk']) {
      assert.ok(ratio(fg, bg) >= 4.5, `${fg} on ${bg} is ${ratio(fg, bg).toFixed(2)}:1`);
    }
  }
});

test('tinted alert backgrounds keep status text readable', () => {
  // Alerts draw ok/warn/bad text on a 10% tint of the same color over the surface.
  const mix = (hex: string, over: string, amount: number) => '#' + [1, 3, 5]
    .map((o) => Math.round(parseInt(hex.slice(o, o + 2), 16) * amount + parseInt(over.slice(o, o + 2), 16) * (1 - amount)).toString(16).padStart(2, '0'))
    .join('');
  for (const name of ['ok', 'warn', 'bad']) {
    const tint = mix(t[name], t.surface, 0.1);
    assert.ok(contrast(t[name], tint) >= 4.5, `${name} on its tint is ${contrast(t[name], tint).toFixed(2)}:1`);
  }
});

test('text on filled accent and avatar tiles meets AA', () => {
  assert.ok(ratio('on-accent', 'accent') >= 4.5, `on-accent on accent ${ratio('on-accent', 'accent').toFixed(2)}:1`);
  for (const [bg, fg] of [['ok', 'on-accent'], ['bad', 'on-accent'], ['gold-ink', 'on-accent'], ['clay', 'on-accent'], ['teal', 'on-accent'], ['ink', 'paper']]) {
    assert.ok(ratio(fg, bg) >= 4.5, `${fg} on ${bg} is ${ratio(fg, bg).toFixed(2)}:1`);
  }
});

test('non-text accents (borders, rings, progress fills) have at least 3:1 against paper', () => {
  for (const name of ['accent', 'ok']) assert.ok(ratio(name, 'paper') >= 3, `${name} on paper is ${ratio(name, 'paper').toFixed(2)}:1`);
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(name) ? [path] : [];
  });
}

test('no leftover template colors, old hex values, or emoji in the UI source', () => {
  const root = fileURLToPath(new URL('../src', import.meta.url));
  const oldHex = /#(fbbf24|f59e0b|0f172a|020617|1e293b|10b981|38bdf8|f472b6|e2e8f0)\b/i;
  const oldClass = /\b(?:bg|text|border|ring|shadow|from|to|via|fill|stroke)-(?:slate|amber|emerald|rose|sky|blue)-\d{2,3}\b/;
  const emoji = /\p{Extended_Pictographic}/u;
  const problems: string[] = [];
  for (const file of sourceFiles(root)) {
    const text = readFileSync(file, 'utf8');
    for (const [label, pattern] of [['old hex', oldHex], ['old color class', oldClass], ['emoji', emoji]] as const) {
      const match = text.match(pattern);
      if (match) problems.push(`${file.replace(root, 'src')}: ${label} ${JSON.stringify(match[0])}`);
    }
  }
  assert.deepEqual(problems, []);
});
