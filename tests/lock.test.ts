import assert from 'node:assert/strict';
import test from 'node:test';

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

const { clearLock, readLock, resolveLock, writeLock } = await import('../src/lib/lock');

test('the lock is written, read, and cleared', () => {
  assert.equal(readLock(), null);
  writeLock('partner-1');
  assert.equal(readLock(), 'partner-1');
  clearLock();
  assert.equal(readLock(), null);
});

test('boot decision: a saved lock wins, otherwise the phone asks who is using it', () => {
  const both = ['partner-1', 'partner-2'];
  assert.deepEqual(resolveLock(both, null), { state: 'choose' });
  assert.deepEqual(resolveLock(both, 'partner-2'), { state: 'locked', id: 'partner-2' });
  assert.deepEqual(resolveLock(both, 'ghost'), { state: 'choose' }, 'a lock for a profile that no longer exists asks again');
  assert.deepEqual(resolveLock(['partner-1'], null), { state: 'locked', id: 'partner-1' }, 'one profile: nothing to choose');
  assert.deepEqual(resolveLock(['partner-1'], 'ghost'), { state: 'locked', id: 'partner-1' });
  assert.deepEqual(resolveLock([], null), { state: 'choose' });
});
