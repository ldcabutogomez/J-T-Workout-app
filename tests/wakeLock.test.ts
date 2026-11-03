import assert from 'node:assert/strict';
import test from 'node:test';
import { wakeLockSupported } from '../src/lib/wakeLock';

test('wake lock support is detected from the browser, and its absence is not an error', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  assert.equal(wakeLockSupported(), false);
  Object.defineProperty(globalThis, 'navigator', { value: { wakeLock: { request: async () => ({ release: async () => undefined }) } }, configurable: true });
  assert.equal(wakeLockSupported(), true);
  if (original) Object.defineProperty(globalThis, 'navigator', original); else delete (globalThis as { navigator?: unknown }).navigator;
});
