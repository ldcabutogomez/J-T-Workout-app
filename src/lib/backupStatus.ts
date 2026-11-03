import type { WorkoutSession } from '../types';
import { validCompleted } from '../engine/sessionValidity';

const KEY = 'jnt2_last_backup_at';
const SNOOZE_KEY = 'jnt2_backup_nudge_until';
const SNAPSHOT_KEY = 'jnt2_pre_import_snapshot';

export const BACKUP_AFTER_DAYS = 14;
export const BACKUP_AFTER_SESSIONS = 8;
/** A person who has never exported is asked once they have a little history worth protecting. */
export const FIRST_BACKUP_AFTER_SESSIONS = 4;

export function lastBackupAt(): number | null {
  try { const value = Number(localStorage.getItem(KEY)); return value > 0 ? value : null; } catch { return null; }
}
export function recordBackup(at = Date.now()): void {
  try { localStorage.setItem(KEY, String(at)); localStorage.removeItem(SNOOZE_KEY); } catch { /* the reminder just repeats */ }
}
export function snoozeBackupNudge(days = 3, now = Date.now()): void {
  try { localStorage.setItem(SNOOZE_KEY, String(now + days * 86_400_000)); } catch { /* ignore */ }
}
const snoozedUntil = (): number => { try { return Number(localStorage.getItem(SNOOZE_KEY)) || 0; } catch { return 0; } };

/** Whether to nudge: enough new work since the last backup, or a long time with something new to protect. */
export function backupDue(history: WorkoutSession[], last: number | null, now = Date.now(), snoozed = snoozedUntil()): boolean {
  if (snoozed > now) return false;
  const finished = history.filter(validCompleted);
  if (last === null) return finished.length >= FIRST_BACKUP_AFTER_SESSIONS;
  const since = finished.filter((session) => (session.completedTime ?? 0) > last).length;
  if (since >= BACKUP_AFTER_SESSIONS) return true;
  return since >= 1 && now - last > BACKUP_AFTER_DAYS * 86_400_000;
}

/** A safety copy taken just before a replace-all import, so a wrong import can be undone from Settings. */
export function saveImportSnapshot(json: string): boolean {
  try { localStorage.setItem(SNAPSHOT_KEY, json); return true; } catch { return false; }
}
export function loadImportSnapshot(): string | null {
  try { return localStorage.getItem(SNAPSHOT_KEY); } catch { return null; }
}
export function clearImportSnapshot(): void {
  try { localStorage.removeItem(SNAPSHOT_KEY); } catch { /* ignore */ }
}
