// Which coach messages a person has already dismissed. Device-local on purpose: it is a convenience,
// not data, so it stays out of IndexedDB and backups.
const KEY = 'jnt2_coach_seen';

function readAll(): Record<string, string[]> {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

export const loadSeen = (profileId: string): Set<string> => new Set(readAll()[profileId] ?? []);

export function markSeen(profileId: string, id: string): void {
  const all = readAll();
  all[profileId] = [...(all[profileId] ?? []).filter((item) => item !== id), id].slice(-80);
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* dismissal just will not persist */ }
}
