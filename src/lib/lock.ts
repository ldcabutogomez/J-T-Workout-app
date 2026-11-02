// Which profile this phone belongs to. Device-local on purpose, like the pairing keys: a restored backup must
// never silently decide who is using a phone. This is a convenience lock, not security: the other profile's
// data still sits in the same on-device database.
const KEY = 'jnt2_locked_profile';

export function readLock(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
export function writeLock(profileId: string): void {
  try { localStorage.setItem(KEY, profileId); } catch { /* the lock just will not persist */ }
}
export function clearLock(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}

export type LockState =
  | { state: 'locked'; id: string }
  | { state: 'choose' };

/**
 * Decides who is using the phone from the profiles that exist and the saved lock.
 * With a single profile there is nothing to choose; with several, the lock must name one of them.
 */
export function resolveLock(profileIds: string[], locked: string | null): LockState {
  if (profileIds.length === 1) return { state: 'locked', id: profileIds[0] };
  if (locked && profileIds.includes(locked)) return { state: 'locked', id: locked };
  return { state: 'choose' };
}
