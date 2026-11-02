// Regenerates public/icon.svg and the PNG app icons from one drawing, using the Chromium that
// Playwright already installs. Run: node scripts/build-icons.mjs
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const TILE = '#1b1a17';
const PAPER = '#f4f0e8';

/** A barbell on a neutral ink tile. `radius` rounds the tile; PNGs are full-bleed so iOS and Android apply their own mask. */
function icon(size, radius) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512" role="img" aria-label="J&amp;T 2.0">
  <rect width="512" height="512" rx="${radius}" fill="${TILE}"/>
  <rect x="96" y="243" width="320" height="26" rx="13" fill="${PAPER}"/>
  <rect x="140" y="156" width="46" height="200" rx="14" fill="${PAPER}"/>
  <rect x="326" y="156" width="46" height="200" rx="14" fill="${PAPER}"/>
  <rect x="92" y="196" width="38" height="120" rx="12" fill="${PAPER}"/>
  <rect x="382" y="196" width="38" height="120" rx="12" fill="${PAPER}"/>
</svg>`;
}

writeFileSync(new URL('../public/icon.svg', import.meta.url), icon(512, 112) + '\n');

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable-512.png', 512]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:${TILE}">${icon(size, 0)}</body>`);
  await page.screenshot({ path: new URL(`../public/icons/${file}`, import.meta.url).pathname.replace(/%20/g, ' ') });
}
await browser.close();
console.log('icons written');
