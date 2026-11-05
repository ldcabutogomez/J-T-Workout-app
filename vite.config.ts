import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {defineConfig, type Plugin} from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/** Identifies this build. The app compares it with version.json on the server to know it is out of date. */
const BUILD_ID = Date.now().toString(36);

function productionServiceWorker(): Plugin {
  return {
    name: 'jnt2-production-service-worker',
    apply: 'build' as const,
    generateBundle(_options: unknown, bundle: Record<string, unknown>) {
      const generated = Object.keys(bundle).filter((name) => name !== 'sw.js').map((name) => `./${name}`);
      const assets = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', ...generated];
      const publicFingerprint = ['manifest.webmanifest', 'icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png']
        .map((name) => readFileSync(path.resolve(rootDir, 'public', name)));
      const bundleFingerprint = Object.values(bundle).map((item) => {
        const output = item as { code?: string; source?: string | Uint8Array };
        return output.code ?? output.source ?? '';
      });
      const version = createHash('sha256')
        .update(assets.join('|'))
        .update(Buffer.concat(publicFingerprint))
        .update(bundleFingerprint.map((value) => typeof value === 'string' ? value : Buffer.from(value).toString('base64')).join('|'))
        .digest('hex')
        .slice(0, 12);
      const source = `const CACHE_PREFIX = 'jnt2-app-';
const CACHE_NAME = CACHE_PREFIX + '${version}';
const PRECACHE = ${JSON.stringify(assets)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'J&T 2.0', body: event.data ? event.data.text() : '' }; }
  const title = typeof data.title === 'string' && data.title ? data.title : 'J&T 2.0';
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof data.body === 'string' ? data.body : '',
    tag: typeof data.tag === 'string' ? data.tag : undefined,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    data: { url: typeof data.url === 'string' && data.url.startsWith('./') ? data.url : './' },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    // An open app is told where to go; otherwise a new window opens straight there.
    for (const client of list) if ('focus' in client) { client.postMessage({ type: 'open-url', url: target }); return client.focus(); }
    return self.clients.openWindow(target);
  }));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  // The version file must always come from the network, or an out-of-date app could never find out.
  if (new URL(event.request.url).pathname.endsWith('/version.json')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
      return response;
    }).catch(() => caches.match('./index.html', { ignoreVary: true }).then(response => response || new Response('J&T 2.0 is unavailable offline until one successful online load.', { status: 503, headers: { 'Content-Type': 'text/plain' } }))));
    return;
  }
  // ignoreVary: module scripts send an Origin header the precache request did not, so a Vary: Origin response would never match offline.
  event.respondWith(caches.match(event.request, { ignoreVary: true }).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
    return response;
  })));
});`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    define: { __APP_BUILD__: JSON.stringify(BUILD_ID) },
    plugins: [react(), tailwindcss(), productionServiceWorker()],
    resolve: {
      alias: {
        '@': path.resolve(rootDir, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
