import type { BackupExportData, UserProfile } from '../types';

/**
 * Version of the stored data shape (profiles inside the database, and backup files).
 *   2: original format.
 *   3: every optional profile field is checked at runtime; records carry `schemaVersion`.
 *   4: supplemental run records are included in backups.
 *   5: profiles can store the gender used by activity muscle maps.
 * Add a step to `migrateBackup` / `sanitizeProfile` whenever the shape changes, never edit an old one.
 */
export const SCHEMA_VERSION = 5;
export const BACKUP_APP = 'GZCL_Jacked_And_Tan_2_Partner_Engine';
/** Oldest backup version this build can still read. */
export const OLDEST_BACKUP_VERSION = 2;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isObject(value) && Object.values(value).every((item) => typeof item === 'string');

const TM_KEYS = new Set(['squat', 'bench', 'deadlift', 'ohp', 'front_squat']);
const isTmRecord = (value: unknown): value is Record<string, number> =>
  isObject(value) && Object.entries(value).every(([key, v]) => TM_KEYS.has(key) && finite(v) && v >= 0);

type Clean = (value: unknown) => unknown | undefined;

const bool: Clean = (value) => (typeof value === 'boolean' ? value : undefined);

/** Each optional profile field: returns the value if it is usable, or undefined to drop it. */
const OPTIONAL_PROFILE_FIELDS: Record<string, Clean> = {
  gender: (value) => (value === 'male' || value === 'female' ? value : undefined),
  cycleCompleted: bool,
  hapticsEnabled: bool,
  soundEnabled: bool,
  autoStartRest: bool,
  keepScreenOn: bool,
  largeGymMode: bool,
  shareLive: bool,
  block2ConfirmedAt: (value) => (finite(value) && value >= 0 ? value : undefined),
  exerciseCustomizations: (value) => (isStringRecord(value) ? value : undefined),
  weeklyGoalSessions: (value) => (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 14 ? value : undefined),
  variationTrainingMaxes: (value) => {
    if (!isObject(value)) return undefined;
    const kept = Object.entries(value).filter(([key, v]) => /^[a-z0-9-]{1,60}:[12]$/.test(key) && finite(v) && v > 0);
    return Object.fromEntries(kept);
  },
  cycleId: (value) => (typeof value === 'string' && /^c[1-9][0-9]{0,2}$/.test(value) ? value : undefined),
  cycles: (value) => {
    if (!Array.isArray(value)) return undefined;
    const kept = value.filter((item): item is Record<string, unknown> => isObject(item) && typeof item.id === 'string' && /^c[1-9][0-9]{0,2}$/.test(item.id)
      && Number.isInteger(item.number) && finite(item.startedAt));
    return kept.map((item) => ({
      id: item.id, number: item.number, startedAt: item.startedAt,
      ...(finite(item.endedAt) ? { endedAt: item.endedAt } : {}),
      ...(typeof item.finished === 'boolean' ? { finished: item.finished } : {}),
      ...(isTmRecord(item.trainingMaxes) ? { trainingMaxes: item.trainingMaxes } : {}),
      ...(isTmRecord(item.block2ConfirmedTMs) ? { block2ConfirmedTMs: item.block2ConfirmedTMs } : {}),
    }));
  },
  flair: (value) => (typeof value === 'string' && value.length > 0 && value.length <= 40 ? value : undefined),
  taunt: (value) => (isObject(value) && Number.isInteger(value.id) && Number(value.id) >= 0 && finite(value.at) ? { id: value.id, at: value.at } : undefined),
  unlockedBadges: (value) => {
    if (!Array.isArray(value)) return undefined;
    const seen = new Set<string>();
    const kept = value.filter((item): item is { id: string; unlockedAt: number } => {
      if (!isObject(item) || typeof item.id !== 'string' || item.id.length === 0 || item.id.length > 60 || !finite(item.unlockedAt)) return false;
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
    return kept.map((item) => ({ id: item.id, unlockedAt: item.unlockedAt }));
  },
};

/**
 * Returns a copy of a profile with every unusable optional field removed and the schema version stamped.
 * A bad optional field (a hand-edited backup, an older build) is dropped rather than failing the whole profile;
 * core fields are left alone for `validateProfile` to judge. Anything that is not an object is returned as is.
 */
export function sanitizeProfile<T>(raw: T): T {
  if (!isObject(raw)) return raw;
  const out: Record<string, unknown> = { ...raw };
  for (const [key, clean] of Object.entries(OPTIONAL_PROFILE_FIELDS)) {
    if (!(key in out)) continue;
    const value = clean(out[key]);
    if (value === undefined) delete out[key]; else out[key] = value;
  }
  out.schemaVersion = SCHEMA_VERSION;
  return out as T;
}

export type BackupMigration = { ok: true; value: Record<string, unknown> } | { ok: false; message: string };

/**
 * Brings a parsed backup up to the current version. Old backups stay importable; a backup from a newer build is
 * refused with a message, because importing it could silently drop data this build does not understand.
 */
export function migrateBackup(raw: unknown): BackupMigration {
  if (!isObject(raw) || raw.app !== BACKUP_APP || typeof raw.version !== 'number' || !Number.isInteger(raw.version)) {
    return { ok: false, message: 'This is not a supported J&T 2.0 backup.' };
  }
  if (raw.version > SCHEMA_VERSION) {
    return { ok: false, message: `This backup was made by a newer version of the app (format ${raw.version}). Update the app, then import it again.` };
  }
  if (raw.version < OLDEST_BACKUP_VERSION) {
    return { ok: false, message: 'This backup is too old to import.' };
  }
  let value: Record<string, unknown> = { ...raw };
  // 2 -> 3: the shape is unchanged; optional profile fields are now checked, and records carry schemaVersion.
  if (value.version === 2) {
    value = { ...value, version: 3, profiles: Array.isArray(value.profiles) ? value.profiles.map((p) => sanitizeProfile(p)) : value.profiles };
  }
  // 3 -> 4: runs are a separate collection. Old backups simply start with none.
  if (value.version === 3) {
    value = { ...value, version: 4, runs: [] };
  }
  // 4 -> 5: gender remains absent on legacy profiles until the one-time in-app choice is made.
  if (value.version === 4) {
    value = { ...value, version: 5 };
  }
  if (Array.isArray(value.profiles)) {
    value = { ...value, profiles: value.profiles.map((p) => sanitizeProfile(p)) };
  }
  return { ok: true, value };
}

export type { BackupExportData, UserProfile };
