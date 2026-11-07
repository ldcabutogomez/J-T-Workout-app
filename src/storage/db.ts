import type { BackupExportData, CustomWorkoutTemplate, LoggedExercise, LoggedSet, RunSession, UserProfile, WorkoutSession } from '../types';
import { isValidAvatar } from '../lib/avatar';
import { isColorTheme } from '../lib/theme';
import { isValidSchedule } from '../engine/schedule';
import { nextProgramPosition } from '../engine/sessionEngine';
import { BACKUP_APP, SCHEMA_VERSION, migrateBackup, sanitizeProfile } from './schema';

const DEFAULT_DB_NAME = 'JackedAndTan2_LocalDB';
const DB_VERSION = 3;
const STORES = ['profiles', 'sessions', 'activeSessions', 'demoSessions', 'runs'] as const;

type ImportStrategy = 'reject-duplicates' | 'replace-all';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

const TM_KEYS = new Set(['squat', 'bench', 'deadlift', 'ohp', 'front_squat']);

function validateTmRecord(candidate: unknown): boolean {
  return isObject(candidate) && Object.entries(candidate).every(([key, value]) =>
    TM_KEYS.has(key) && finiteNonNegative(value),
  );
}

function validateSourceRefs(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every((item) =>
    isObject(item)
    && (item.sheet === 'J&T2.0' || item.sheet === 'J&T2.0 KGS')
    && Array.isArray(item.ranges)
    && item.ranges.length > 0
    && item.ranges.every((range) => typeof range === 'string' && /^[A-Z]+\d+(?::[A-Z]+\d+)?$/.test(range)),
  );
}

function validateSet(value: unknown): value is LoggedSet {
  if (!isObject(value)) return false;
  const completedValues = value.completed === false || (value.actualReps !== null && value.load !== null);
  return typeof value.setId === 'string' && value.setId.length > 0
    && ['rm_target', 'backoff', 'straight', 'mrs', 'test'].includes(String(value.type))
    && Number.isInteger(value.prescribedReps) && Number(value.prescribedReps) >= 0
    && (value.actualReps === null || (Number.isInteger(value.actualReps) && Number(value.actualReps) >= 0))
    && (value.load === null || finiteNonNegative(value.load))
    && (value.unit === 'lb' || value.unit === 'kg')
    && typeof value.completed === 'boolean'
    && completedValues
    && (value.customMode === undefined || ['standard', 'failure', 'drop'].includes(String(value.customMode)))
    && (value.dropGroupId === undefined || (typeof value.dropGroupId === 'string' && value.dropGroupId.length <= 100))
    && (value.dropStage === undefined || (Number.isInteger(value.dropStage) && Number(value.dropStage) >= 0 && Number(value.dropStage) <= 10));
}

function validateExercise(value: unknown): value is LoggedExercise {
  if (!isObject(value)) return false;
  return typeof value.slotId === 'string' && value.slotId.length > 0
    && typeof value.exerciseId === 'string' && value.exerciseId.length > 0
    && ['T1', 'T2a', 'T2b', 'T2c', 'T3a', 'T3b', 'T3c', 'T3d'].includes(String(value.tier))
    && typeof value.exerciseName === 'string' && value.exerciseName.trim().length > 0
    && ['work', 'rest', 'test', 'omitted'].includes(String(value.status))
    && (value.userNote === undefined || (typeof value.userNote === 'string' && value.userNote.length <= 500))
    && Array.isArray(value.sets)
    && value.sets.every(validateSet)
    && uniqueIds(value.sets as LoggedSet[], (item) => item.setId)
    && validateExtraShape(value)
    // An exercise the lifter added has no workbook cell to point at; program exercises always do.
    && (value.isExtra === true ? Array.isArray(value.sourceRefs) && value.sourceRefs.length === 0 : validateSourceRefs(value.sourceRefs));
}

/** `isExtra` is only ever `true`. An extra uses the `extra-` slot id (so it can't collide with a program slot) and straight sets only. */
function validateExtraShape(value: Record<string, unknown>): boolean {
  if (value.isExtra === undefined) return !String(value.slotId).startsWith('extra-');
  return value.isExtra === true
    && String(value.slotId).startsWith('extra-')
    && (value.sets as Array<{ type?: unknown }>).every((set) => set.type === 'straight');
}

function validateSettingsSnapshot(value: unknown): boolean {
  if (!isObject(value)) return false;
  return (value.unit === 'lb' || value.unit === 'kg')
    && finiteNonNegative(value.equipmentIncrement) && Number(value.equipmentIncrement) > 0
    && finiteNonNegative(value.barbellWeight)
    && validateTmRecord(value.trainingMaxes)
    && (value.block2ConfirmedTMs === undefined || validateTmRecord(value.block2ConfirmedTMs))
    && (value.exerciseSwaps === undefined || validateStringRecord(value.exerciseSwaps));
}

function validateLoadBasis(value: unknown): boolean {
  if (!isObject(value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'user_selected') return true;
  if (value.kind === 'achieved_rm') return typeof value.slotId === 'string' && value.slotId.length > 0;
  return value.kind === 'training_max'
    && typeof value.key === 'string' && TM_KEYS.has(value.key)
    && (value.block === 1 || value.block === 2);
}

function validateProgramSet(value: unknown): boolean {
  if (!isObject(value)) return false;
  return Number.isInteger(value.setNumber) && Number(value.setNumber) > 0
    && ['rm_target', 'backoff', 'straight', 'mrs', 'test'].includes(String(value.type))
    && Number.isInteger(value.prescribedReps) && Number(value.prescribedReps) >= 0
    && validateLoadBasis(value.loadBasis)
    && (value.percentage === undefined || (typeof value.percentage === 'number' && value.percentage > 0 && value.percentage <= 1))
    && validateSourceRefs(value.sourceRefs);
}

function validatePrescriptionExercise(value: unknown, week: number, day: number): boolean {
  if (!isObject(value)) return false;
  return typeof value.slotId === 'string' && value.slotId.length > 0
    && typeof value.exerciseId === 'string' && value.exerciseId.length > 0
    && value.week === week && value.day === day
    && ['T1', 'T2a', 'T2b', 'T2c', 'T3a', 'T3b', 'T3c', 'T3d'].includes(String(value.tier))
    && typeof value.exerciseName === 'string' && value.exerciseName.trim().length > 0
    && ['work', 'rest', 'test', 'omitted'].includes(String(value.status))
    && ['rm_backoff', 'straight', 'mrs', 'test', 'rest', 'omitted'].includes(String(value.setType))
    && Number.isInteger(value.setCount) && Number(value.setCount) >= 0
    && (value.repTarget === null || (Number.isInteger(value.repTarget) && Number(value.repTarget) >= 0))
    && Array.isArray(value.prescribedSets)
    && value.prescribedSets.length === value.setCount
    && value.prescribedSets.every(validateProgramSet)
    && validateSourceRefs(value.sourceRefs);
}

function validatePrescriptionSnapshot(value: unknown, week: number, day: number): boolean {
  if (!isObject(value)) return false;
  return value.week === week
    && value.dayNumber === day
    && typeof value.title === 'string'
    && Array.isArray(value.exercises)
    && value.exercises.every((item) => validatePrescriptionExercise(item, week, day))
    && uniqueIds(value.exercises as Array<{ slotId: string }>, (item) => item.slotId)
    && validateSourceRefs(value.sourceRefs);
}

function validateSession(value: unknown, profileIds: Set<string>): value is WorkoutSession {
  if (!isObject(value)) return false;
  return typeof value.sessionId === 'string'
    && (value.workoutKind === undefined || value.workoutKind === 'program' || value.workoutKind === 'custom')
    && (value.customName === undefined || (typeof value.customName === 'string' && value.customName.trim().length > 0 && value.customName.length <= 60))
    && (value.customTemplateId === undefined || (typeof value.customTemplateId === 'string' && value.customTemplateId.length <= 100))
    && typeof value.profileId === 'string'
    && (value.note === undefined || (typeof value.note === 'string' && value.note.length <= 500))
    && (value.cycleId === undefined || (typeof value.cycleId === 'string' && /^c[1-9][0-9]{0,2}$/.test(value.cycleId)))
    && profileIds.has(value.profileId)
    && Number.isInteger(value.week) && Number(value.week) >= 1 && Number(value.week) <= 12
    && Number.isInteger(value.day) && Number(value.day) >= 1 && Number(value.day) <= 4
    && finiteNonNegative(value.startTime)
    && finiteNonNegative(value.updatedTime)
    && (value.timer === undefined || (isObject(value.timer)
      && finiteNonNegative(value.timer.accumulatedMs)
      && (value.timer.runningSince === null || finiteNonNegative(value.timer.runningSince))))
    && ['active', 'partial', 'completed', 'skipped'].includes(String(value.status))
    && typeof value.isPartial === 'boolean'
    && typeof value.isSkipped === 'boolean'
    && validatePrescriptionSnapshot(value.prescriptionSnapshot, Number(value.week), Number(value.day))
    && validateSettingsSnapshot(value.settingsSnapshot)
    && Array.isArray(value.exercises)
    && value.exercises.every(validateExercise)
    && uniqueIds(value.exercises as LoggedExercise[], (item) => item.slotId)
    && extrasStayOutOfTheSnapshot(value);
}

/** An added exercise lives only in the logged exercises; a slot id that is also in the prescription would be a program slot. */
function extrasStayOutOfTheSnapshot(value: Record<string, unknown>): boolean {
  const snapshotSlots = new Set(((value.prescriptionSnapshot as { exercises?: Array<{ slotId: string }> }).exercises ?? []).map((item) => item.slotId));
  return (value.exercises as LoggedExercise[]).every((exercise) => !exercise.isExtra || !snapshotSlots.has(exercise.slotId));
}

function validateStringRecord(value: unknown): boolean {
  return isObject(value) && Object.values(value).every((item) => typeof item === 'string' && item.length > 0);
}

function validateExerciseOrder(value: unknown): boolean {
  return isObject(value) && Object.entries(value).every(([key, order]) => /^W(?:[1-9]|1[0-2])D[1-4]$/.test(key)
    && Array.isArray(order) && order.length <= 40 && order.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 100)
    && new Set(order).size === order.length);
}

function validateCustomTemplates(value: unknown): value is CustomWorkoutTemplate[] {
  if (!Array.isArray(value) || value.length > 50) return false;
  const ids = new Set<string>();
  return value.every((template) => {
    if (!isObject(template) || typeof template.id !== 'string' || ids.has(template.id) || typeof template.name !== 'string'
      || template.name.trim().length < 1 || template.name.length > 60 || !finiteNonNegative(template.createdAt)
      || !finiteNonNegative(template.updatedAt) || !Array.isArray(template.exercises) || template.exercises.length > 40) return false;
    ids.add(template.id);
    const exerciseIds = new Set<string>();
    return template.exercises.every((exercise) => {
      if (!isObject(exercise) || typeof exercise.id !== 'string' || exerciseIds.has(exercise.id)
        || typeof exercise.exerciseId !== 'string' || typeof exercise.name !== 'string' || !exercise.name.trim()
        || !Array.isArray(exercise.sets) || exercise.sets.length < 1 || exercise.sets.length > 30) return false;
      exerciseIds.add(exercise.id);
      return exercise.sets.every((set) => isObject(set) && typeof set.id === 'string'
        && ['standard', 'failure', 'drop'].includes(String(set.mode))
        && Number.isInteger(set.reps) && Number(set.reps) >= 0 && Number(set.reps) <= 200
        && (set.stages === undefined || (Number.isInteger(set.stages) && Number(set.stages) >= 2 && Number(set.stages) <= 5)));
    });
  });
}

function validateProfile(value: unknown): value is UserProfile {
  if (!isObject(value)) return false;
  return typeof value.id === 'string' && value.id.length > 0
    && typeof value.name === 'string' && value.name.trim().length > 0
    && (value.gender === undefined || value.gender === 'male' || value.gender === 'female')
    && (value.unit === 'lb' || value.unit === 'kg')
    && finiteNonNegative(value.equipmentIncrement) && Number(value.equipmentIncrement) > 0
    && finiteNonNegative(value.barbellWeight)
    && ['minimal', 'warm', 'playful', 'off'].includes(String(value.tone))
    && Number.isInteger(value.currentWeek) && Number(value.currentWeek) >= 1 && Number(value.currentWeek) <= 12
    && Number.isInteger(value.currentDay) && Number(value.currentDay) >= 1 && Number(value.currentDay) <= 4
    && validateTmRecord(value.trainingMaxes)
    && (value.block2ConfirmedTMs === undefined || validateTmRecord(value.block2ConfirmedTMs))
    && (value.exerciseSwaps === undefined || validateStringRecord(value.exerciseSwaps))
    && (value.exerciseOrder === undefined || validateExerciseOrder(value.exerciseOrder))
    && (value.customWorkoutTemplates === undefined || validateCustomTemplates(value.customWorkoutTemplates))
    && (value.variationTrainingMaxes === undefined || (isObject(value.variationTrainingMaxes) && Object.values(value.variationTrainingMaxes).every((tm) => typeof tm === 'number' && Number.isFinite(tm) && tm > 0)))
    && (value.avatar === undefined || isValidAvatar(value.avatar))
    && (value.colorTheme === undefined || isColorTheme(value.colorTheme))
    && (value.appearanceMode === undefined || ['system', 'light', 'dark'].includes(String(value.appearanceMode)))
    && (value.seasonalTheme === undefined || ['none', 'halloween', 'winter', 'valentine'].includes(String(value.seasonalTheme)))
    && (value.birthdayMonth === undefined || (Number.isInteger(value.birthdayMonth) && Number(value.birthdayMonth) >= 1 && Number(value.birthdayMonth) <= 12))
    && (value.birthdayDay === undefined || (Number.isInteger(value.birthdayDay) && Number(value.birthdayDay) >= 1 && Number(value.birthdayDay) <= 31))
    && (value.lastBirthdayCelebrationYear === undefined || (Number.isInteger(value.lastBirthdayCelebrationYear) && Number(value.lastBirthdayCelebrationYear) >= 2000 && Number(value.lastBirthdayCelebrationYear) <= 3000))
    && (value.schedule === undefined || isValidSchedule(value.schedule));
}

function validateRun(value: unknown, profileIds: Set<string>): value is RunSession {
  if (!isObject(value)) return false;
  return typeof value.runId === 'string' && value.runId.length > 0
    && typeof value.profileId === 'string' && profileIds.has(value.profileId)
    && finiteNonNegative(value.startTime)
    && typeof value.durationSeconds === 'number' && Number.isFinite(value.durationSeconds) && value.durationSeconds > 0
    && typeof value.distanceMeters === 'number' && Number.isFinite(value.distanceMeters) && value.distanceMeters > 0
    && (value.distanceUnit === 'mi' || value.distanceUnit === 'km')
    && ['easy', 'tempo', 'intervals', 'long', 'other'].includes(String(value.runType))
    && (value.effort === undefined || (Number.isInteger(value.effort) && Number(value.effort) >= 1 && Number(value.effort) <= 10))
    && (value.notes === undefined || (typeof value.notes === 'string' && value.notes.length <= 500))
    && (value.source === 'manual' || value.source === 'strava')
    && (value.externalId === undefined || (typeof value.externalId === 'string' && value.externalId.length > 0 && value.externalId.length <= 200))
    && (value.source !== 'strava' || typeof value.externalId === 'string')
    && finiteNonNegative(value.createdTime)
    && finiteNonNegative(value.updatedTime)
    && Number(value.updatedTime) >= Number(value.createdTime);
}

function uniqueIds<T>(items: T[], getId: (item: T) => string): boolean {
  const ids = items.map(getId);
  return new Set(ids).size === ids.length;
}

function validateBackup(raw: unknown): { ok: true; data: BackupExportData } | { ok: false; message: string } {
  const migrated = migrateBackup(raw);
  if (!migrated.ok) return { ok: false, message: migrated.message };
  const value = migrated.value;
  if (!Array.isArray(value.profiles) || !Array.isArray(value.sessions) || !Array.isArray(value.activeSessions) || !Array.isArray(value.runs)) {
    return { ok: false, message: 'Backup collections are missing or malformed.' };
  }
  if (!value.profiles.every(validateProfile)) {
    return { ok: false, message: 'At least one profile is malformed.' };
  }
  const profiles = value.profiles as UserProfile[];
  if (!uniqueIds(profiles, (item) => item.id)) {
    return { ok: false, message: 'The backup contains duplicate profile IDs.' };
  }
  const profileIds = new Set(profiles.map((item) => item.id));
  if (!value.runs.every((item) => validateRun(item, profileIds))) {
    return { ok: false, message: 'At least one run record is malformed.' };
  }
  if (!value.sessions.every((item) => validateSession(item, profileIds) && item.status !== 'active')) {
    return { ok: false, message: 'At least one completed session, exercise, or set is malformed.' };
  }
  if (!value.activeSessions.every((item) => validateSession(item, profileIds) && item.status === 'active')) {
    return { ok: false, message: 'At least one active session is malformed.' };
  }
  const sessions = value.sessions as WorkoutSession[];
  const activeSessions = value.activeSessions as WorkoutSession[];
  const runs = value.runs as RunSession[];
  if (!uniqueIds(sessions, (item) => item.sessionId) || !uniqueIds(activeSessions, (item) => item.sessionId)) {
    return { ok: false, message: 'The backup contains duplicate session IDs.' };
  }
  if (!uniqueIds(activeSessions, (item) => item.profileId)) {
    return { ok: false, message: 'The backup contains more than one active session for a profile.' };
  }
  const completedIds = new Set(sessions.map((item) => item.sessionId));
  if (activeSessions.some((item) => completedIds.has(item.sessionId))) {
    return { ok: false, message: 'A session ID appears in both active and completed collections.' };
  }
  if (!uniqueIds(runs, (item) => item.runId)) {
    return { ok: false, message: 'The backup contains duplicate run IDs.' };
  }
  const providerIds = runs.filter((item) => item.externalId).map((item) => `${item.source}:${item.externalId}`);
  if (new Set(providerIds).size !== providerIds.length) {
    return { ok: false, message: 'The backup contains duplicate provider activity IDs.' };
  }
  return { ok: true, data: value as unknown as BackupExportData };
}

export class StorageService {
  private db: IDBDatabase | null = null;
  private fallback = false;
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly dbName = DEFAULT_DB_NAME,
    private readonly fallbackPrefix = 'jnt2',
  ) {}

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.writeQueue.then(operation, operation);
    this.writeQueue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  async init(): Promise<void> {
    if (this.db || this.fallback) return;
    if (typeof indexedDB === 'undefined') {
      if (typeof localStorage === 'undefined') throw new Error('No supported local storage is available.');
      this.fallback = true;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        for (const name of STORES) {
          if (!database.objectStoreNames.contains(name)) {
            database.createObjectStore(name, { keyPath: name === 'profiles' ? 'id' : name === 'activeSessions' ? 'profileId' : name === 'runs' ? 'runId' : 'sessionId' });
          }
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        this.db.onversionchange = () => {
          this.db?.close();
          this.db = null;
        };
        resolve();
      };
      request.onerror = () => reject(new Error(`IndexedDB could not open: ${request.error?.message ?? 'unknown error'}`));
      request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked by another open app tab.'));
    });
  }

  private key(name: string): string {
    return `${this.fallbackPrefix}_${name}`;
  }

  private fallbackRead<T>(name: string, defaultValue: T): T {
    const raw = localStorage.getItem(this.key(name));
    if (!raw) return defaultValue;
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new Error(`Stored ${name} data is unreadable. Export or clear browser data before continuing.`);
    }
  }

  private async getAll<T>(storeName: typeof STORES[number]): Promise<T[]> {
    await this.init();
    if (this.fallback) return this.fallbackRead<T[]>(storeName, []);
    return new Promise<T[]>((resolve, reject) => {
      const request = this.db!.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(new Error(`Could not read ${storeName}: ${request.error?.message ?? 'unknown error'}`));
    });
  }

  async getProfiles(): Promise<UserProfile[]> {
    // Read through the sanitizer so a bad optional field in stored data can never reach the UI. A profile that is
    // still unusable is set aside (never deleted) so one bad record cannot stop the app from opening.
    const all = (await this.getAll<UserProfile>('profiles')).map((profile) => sanitizeProfile(profile));
    const good = all.filter((profile) => validateProfile(profile));
    if (good.length !== all.length) this.quarantine(all.filter((profile) => !validateProfile(profile)));
    return good;
  }

  private quarantine(records: unknown[]): void {
    try {
      const existing = JSON.parse(localStorage.getItem(this.key('quarantine')) ?? '[]') as unknown[];
      localStorage.setItem(this.key('quarantine'), JSON.stringify([...existing, ...records].slice(-20)));
    } catch { /* setting aside is best effort */ }
  }

  /** How many unreadable profiles have been set aside on this device. */
  quarantinedCount(): number {
    try { return (JSON.parse(localStorage.getItem(this.key('quarantine')) ?? '[]') as unknown[]).length; } catch { return 0; }
  }

  /** Best-effort dump of everything that can still be read, for the recovery screen. Never throws. */
  async exportRaw(): Promise<string> {
    const out: Record<string, unknown> = { app: BACKUP_APP, raw: true, timestamp: Date.now() };
    for (const store of STORES) {
      try { out[store] = await this.getAll<unknown>(store); } catch (error) { out[store] = { unreadable: (error as Error).message }; }
      try { const text = localStorage.getItem(this.key(store)); if (text) out[`localStorage_${store}`] = text; } catch { /* not available */ }
    }
    try { const q = localStorage.getItem(this.key('quarantine')); if (q) out.quarantine = JSON.parse(q); } catch { /* ignore */ }
    return JSON.stringify(out, null, 2);
  }

  /** Deletes every record this app keeps on the device. Only for the "start fresh" recovery choice. */
  async resetAll(): Promise<void> {
    this.db?.close();
    this.db = null;
    this.fallback = false;
    if (typeof indexedDB !== 'undefined') {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(this.dbName);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error(`Could not clear the database: ${request.error?.message ?? 'unknown error'}`));
        request.onblocked = () => reject(new Error('Close any other tab or window of this app, then try again.'));
      });
    }
    try { for (const store of [...STORES, 'quarantine']) localStorage.removeItem(this.key(store)); } catch { /* not available */ }
  }

  async saveProfile(input: UserProfile): Promise<void> {
    const profile = sanitizeProfile(input);
    if (!validateProfile(profile)) throw new Error('Refusing to save a malformed profile.');
    return this.enqueue(async () => {
      await this.init();
      if (this.fallback) {
        const profiles = this.fallbackRead<UserProfile[]>('profiles', []);
        const index = profiles.findIndex((item) => item.id === profile.id);
        if (index >= 0) profiles[index] = profile; else profiles.push(profile);
        localStorage.setItem(this.key('profiles'), JSON.stringify(profiles));
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const transaction = this.db!.transaction('profiles', 'readwrite');
        transaction.objectStore('profiles').put(profile);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(new Error(`Profile save failed: ${transaction.error?.message ?? 'unknown error'}`));
      });
    });
  }

  /**
   * Saves the profile of a lifter who is starting their next cycle. Refuses if the stored cycle is no longer the one
   * the screen was built from (a double tap, or the cycle was already started somewhere else).
   */
  async startNewCycle(next: UserProfile, expectedCycleId: string): Promise<void> {
    const stored = (await this.getProfiles()).find((item) => item.id === next.id);
    if (!stored) throw new Error('That profile no longer exists.');
    if ((stored.cycleId ?? 'c1') !== expectedCycleId) throw new Error('This cycle was already started. Reload the app to continue.');
    await this.saveProfile(next);
  }

  async getActiveSession(profileId: string): Promise<WorkoutSession | null> {
    await this.init();
    if (this.fallback) {
      return this.fallbackRead<WorkoutSession[]>('activeSessions', []).find((item) => item.profileId === profileId) ?? null;
    }
    return new Promise((resolve, reject) => {
      const request = this.db!.transaction('activeSessions', 'readonly').objectStore('activeSessions').get(profileId);
      request.onsuccess = () => resolve((request.result as WorkoutSession | undefined) ?? null);
      request.onerror = () => reject(new Error(`Active session read failed: ${request.error?.message ?? 'unknown error'}`));
    });
  }

  async saveActiveSession(session: WorkoutSession): Promise<void> {
    if (session.status !== 'active' || !validateSession(session, new Set([session.profileId]))) {
      throw new Error('Refusing to autosave a malformed or non-active session draft.');
    }
    return this.enqueue(async () => {
      await this.init();
      if (this.fallback) {
        const sessions = this.fallbackRead<WorkoutSession[]>('activeSessions', []);
        const index = sessions.findIndex((item) => item.profileId === session.profileId);
        if (index >= 0) sessions[index] = session; else sessions.push(session);
        localStorage.setItem(this.key('activeSessions'), JSON.stringify(sessions));
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const transaction = this.db!.transaction('activeSessions', 'readwrite');
        transaction.objectStore('activeSessions').put(session);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(new Error(`Autosave failed: ${transaction.error?.message ?? 'unknown error'}`));
      });
    });
  }

  async clearActiveSession(profileId: string): Promise<void> {
    return this.enqueue(async () => {
      await this.init();
      if (this.fallback) {
        const sessions = this.fallbackRead<WorkoutSession[]>('activeSessions', []).filter((item) => item.profileId !== profileId);
        localStorage.setItem(this.key('activeSessions'), JSON.stringify(sessions));
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const transaction = this.db!.transaction('activeSessions', 'readwrite');
        transaction.objectStore('activeSessions').delete(profileId);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(new Error(`Could not clear active session: ${transaction.error?.message ?? 'unknown error'}`));
      });
    });
  }

  /**
   * Saves a finished session and moves the program pointer. By default the pointer steps forward one workout;
   * pass `position` (the first workout nobody has done yet) when workouts can be done out of order.
   */
  async completeAndAdvance(
    inputSession: WorkoutSession,
    rawProfile: UserProfile,
    position?: Pick<UserProfile, 'currentWeek' | 'currentDay' | 'cycleCompleted'>,
  ): Promise<{ session: WorkoutSession; profile: UserProfile; advanced: boolean }> {
    const inputProfile = sanitizeProfile(rawProfile);
    if (!validateProfile(inputProfile)
      || inputSession.status === 'active'
      || !validateSession(inputSession, new Set([inputProfile.id]))) {
      throw new Error('Refusing to complete a malformed profile or session.');
    }
    return this.enqueue(async () => {
      await this.init();
      const now = inputSession.completedTime ?? Date.now();
      if (this.fallback) {
        const completed = this.fallbackRead<WorkoutSession[]>('sessions', []);
        const existing = completed.find((item) => item.sessionId === inputSession.sessionId);
        const profiles = this.fallbackRead<UserProfile[]>('profiles', []);
        const profileIndex = profiles.findIndex((item) => item.id === inputProfile.id);
        if (profileIndex < 0) throw new Error('The session profile no longer exists.');
        const shouldAdvance = inputSession.workoutKind !== 'custom' && !existing?.advancedAt && !inputSession.advancedAt && !inputSession.isEditingCompleted;
        const session = { ...inputSession, advancedAt: shouldAdvance ? now : (existing?.advancedAt ?? inputSession.advancedAt) };
        const profile = shouldAdvance ? { ...profiles[profileIndex], ...(position ?? nextProgramPosition(profiles[profileIndex])) } : profiles[profileIndex];
        const sessionIndex = completed.findIndex((item) => item.sessionId === session.sessionId);
        if (sessionIndex >= 0) completed[sessionIndex] = session; else completed.push(session);
        profiles[profileIndex] = profile;
        const prior = {
          sessions: localStorage.getItem(this.key('sessions')),
          profiles: localStorage.getItem(this.key('profiles')),
          active: localStorage.getItem(this.key('activeSessions')),
        };
        try {
          localStorage.setItem(this.key('sessions'), JSON.stringify(completed));
          localStorage.setItem(this.key('profiles'), JSON.stringify(profiles));
          const active = this.fallbackRead<WorkoutSession[]>('activeSessions', []).filter((item) => item.profileId !== session.profileId);
          localStorage.setItem(this.key('activeSessions'), JSON.stringify(active));
        } catch (error) {
          for (const [name, value] of Object.entries(prior)) {
            const storageName = name === 'active' ? 'activeSessions' : name;
            if (value === null) localStorage.removeItem(this.key(storageName));
            else localStorage.setItem(this.key(storageName), value);
          }
          throw error;
        }
        return { session, profile, advanced: shouldAdvance };
      }

      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(['sessions', 'profiles', 'activeSessions'], 'readwrite');
        const sessions = transaction.objectStore('sessions');
        const profiles = transaction.objectStore('profiles');
        const existingRequest = sessions.get(inputSession.sessionId);
        const profileRequest = profiles.get(inputProfile.id);
        let result: { session: WorkoutSession; profile: UserProfile; advanced: boolean } | null = null;
        const attemptWrite = () => {
          if (!existingRequest.readyState || !profileRequest.readyState || existingRequest.readyState !== 'done' || profileRequest.readyState !== 'done') return;
          const existing = existingRequest.result as WorkoutSession | undefined;
          const storedProfile = profileRequest.result as UserProfile | undefined;
          if (!storedProfile) {
            transaction.abort();
            return;
          }
          const shouldAdvance = inputSession.workoutKind !== 'custom' && !existing?.advancedAt && !inputSession.advancedAt && !inputSession.isEditingCompleted;
          const session = { ...inputSession, advancedAt: shouldAdvance ? now : (existing?.advancedAt ?? inputSession.advancedAt) };
          const profile = shouldAdvance ? { ...storedProfile, ...(position ?? nextProgramPosition(storedProfile)) } : storedProfile;
          sessions.put(session);
          profiles.put(profile);
          transaction.objectStore('activeSessions').delete(session.profileId);
          result = { session, profile, advanced: shouldAdvance };
        };
        existingRequest.onsuccess = attemptWrite;
        profileRequest.onsuccess = attemptWrite;
        transaction.oncomplete = () => result ? resolve(result) : reject(new Error('Completion transaction produced no result.'));
        transaction.onerror = () => reject(new Error(`Completion transaction failed: ${transaction.error?.message ?? 'unknown error'}`));
        transaction.onabort = () => reject(new Error('Completion transaction was aborted; no records were changed.'));
      });
    });
  }

  async getSessionHistory(profileId: string, includeDemo = false): Promise<WorkoutSession[]> {
    const sessions = await this.getAll<WorkoutSession>('sessions');
    const demo = includeDemo ? await this.getAll<WorkoutSession>('demoSessions') : [];
    return [...sessions, ...demo]
      .filter((item) => item.profileId === profileId)
      .sort((a, b) => (b.completedTime ?? b.startTime) - (a.completedTime ?? a.startTime));
  }

  async getRunHistory(profileId: string): Promise<RunSession[]> {
    const runs = await this.getAll<RunSession>('runs');
    return runs
      .filter((item) => item.profileId === profileId)
      .sort((a, b) => b.startTime - a.startTime);
  }

  async saveRun(input: RunSession): Promise<void> {
    const profileIds = new Set((await this.getProfiles()).map((item) => item.id));
    const providerMatch = input.externalId
      ? (await this.getAll<RunSession>('runs')).find((item) => item.source === input.source && item.externalId === input.externalId)
      : undefined;
    const run = providerMatch ? { ...input, runId: providerMatch.runId, createdTime: providerMatch.createdTime } : input;
    if (!validateRun(run, profileIds)) throw new Error('Refusing to save a malformed run.');
    return this.enqueue(async () => {
      await this.init();
      if (this.fallback) {
        const runs = this.fallbackRead<RunSession[]>('runs', []);
        const providerDuplicate = run.externalId
          ? runs.findIndex((item) => item.source === run.source && item.externalId === run.externalId)
          : -1;
        const index = providerDuplicate >= 0 ? providerDuplicate : runs.findIndex((item) => item.runId === run.runId);
        if (index >= 0) runs[index] = run; else runs.push(run);
        localStorage.setItem(this.key('runs'), JSON.stringify(runs));
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const transaction = this.db!.transaction('runs', 'readwrite');
        transaction.objectStore('runs').put(run);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(new Error(`Run save failed: ${transaction.error?.message ?? 'unknown error'}`));
      });
    });
  }

  async deleteRun(runId: string): Promise<void> {
    return this.enqueue(async () => {
      await this.init();
      if (this.fallback) {
        const runs = this.fallbackRead<RunSession[]>('runs', []).filter((item) => item.runId !== runId);
        localStorage.setItem(this.key('runs'), JSON.stringify(runs));
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const transaction = this.db!.transaction('runs', 'readwrite');
        transaction.objectStore('runs').delete(runId);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(new Error(`Run delete failed: ${transaction.error?.message ?? 'unknown error'}`));
      });
    });
  }

  async saveDemoSession(session: WorkoutSession): Promise<void> {
    if (!session.isDemo || !validateSession(session, new Set([session.profileId]))) {
      throw new Error('Refusing to save a malformed or unlabelled demo session.');
    }
    return this.enqueue(async () => {
      await this.init();
      if (this.fallback) {
        const sessions = this.fallbackRead<WorkoutSession[]>('demoSessions', []);
        const index = sessions.findIndex((item) => item.sessionId === session.sessionId);
        if (index >= 0) sessions[index] = session; else sessions.push(session);
        localStorage.setItem(this.key('demoSessions'), JSON.stringify(sessions));
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const transaction = this.db!.transaction('demoSessions', 'readwrite');
        transaction.objectStore('demoSessions').put(session);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(new Error(`Demo save failed: ${transaction.error?.message ?? 'unknown error'}`));
      });
    });
  }

  async deleteSession(sessionId: string, isDemo = false): Promise<void> {
    const storeName = isDemo ? 'demoSessions' : 'sessions';
    return this.enqueue(async () => {
      await this.init();
      if (this.fallback) {
        const sessions = this.fallbackRead<WorkoutSession[]>(storeName, []).filter((item) => item.sessionId !== sessionId);
        localStorage.setItem(this.key(storeName), JSON.stringify(sessions));
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const transaction = this.db!.transaction(storeName, 'readwrite');
        transaction.objectStore(storeName).delete(sessionId);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(new Error(`Session delete failed: ${transaction.error?.message ?? 'unknown error'}`));
      });
    });
  }

  async clearDemoSessions(profileId: string): Promise<void> {
    const sessions = (await this.getAll<WorkoutSession>('demoSessions')).filter((item) => item.profileId !== profileId);
    return this.enqueue(async () => {
      await this.init();
      if (this.fallback) {
        localStorage.setItem(this.key('demoSessions'), JSON.stringify(sessions));
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const transaction = this.db!.transaction('demoSessions', 'readwrite');
        const store = transaction.objectStore('demoSessions');
        store.clear();
        sessions.forEach((item) => store.put(item));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(new Error(`Demo clear failed: ${transaction.error?.message ?? 'unknown error'}`));
      });
    });
  }

  async exportBackup(): Promise<string> {
    const [profiles, sessions, activeSessions, runs] = await Promise.all([
      this.getProfiles(),
      this.getAll<WorkoutSession>('sessions'),
      this.getAll<WorkoutSession>('activeSessions'),
      this.getAll<RunSession>('runs'),
    ]);
    const payload: BackupExportData = {
      version: SCHEMA_VERSION,
      timestamp: Date.now(),
      app: BACKUP_APP,
      profiles,
      sessions: sessions.filter((item) => !item.isDemo),
      activeSessions,
      runs,
    };
    return JSON.stringify(payload, null, 2);
  }

  async importBackup(
    jsonString: string,
    strategy: ImportStrategy = 'reject-duplicates',
  ): Promise<{ success: boolean; message: string }> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonString);
    } catch (error) {
      return { success: false, message: `Backup JSON could not be parsed: ${(error as Error).message}` };
    }
    const validated = validateBackup(parsed);
    if (!validated.ok) return { success: false, message: validated.message };
    const data = validated.data;

    await this.init();
    if (strategy === 'reject-duplicates') {
      const [profiles, sessions, activeSessions, runs] = await Promise.all([
        this.getProfiles(),
        this.getAll<WorkoutSession>('sessions'),
        this.getAll<WorkoutSession>('activeSessions'),
        this.getAll<RunSession>('runs'),
      ]);
      const profileIds = new Set(profiles.map((item) => item.id));
      const sessionIds = new Set([...sessions, ...activeSessions].map((item) => item.sessionId));
      const activeProfileIds = new Set(activeSessions.map((item) => item.profileId));
      const runIds = new Set(runs.map((item) => item.runId));
      const providerIds = new Set(runs.filter((item) => item.externalId).map((item) => `${item.source}:${item.externalId}`));
      const profileDuplicate = data.profiles.find((item) => profileIds.has(item.id));
      const sessionDuplicate = [...data.sessions, ...data.activeSessions].find((item) => sessionIds.has(item.sessionId));
      const activeProfileDuplicate = data.activeSessions.find((item) => activeProfileIds.has(item.profileId));
      const runDuplicate = data.runs.find((item) => runIds.has(item.runId) || (item.externalId && providerIds.has(`${item.source}:${item.externalId}`)));
      if (profileDuplicate || sessionDuplicate || activeProfileDuplicate || runDuplicate) {
        return {
          success: false,
          message: `Import stopped before writing because duplicate IDs exist${profileDuplicate ? ` (profile ${profileDuplicate.id})` : ''}${sessionDuplicate ? ` (session ${sessionDuplicate.sessionId})` : ''}${activeProfileDuplicate ? ` (active profile ${activeProfileDuplicate.profileId})` : ''}${runDuplicate ? ` (run ${runDuplicate.runId})` : ''}. Choose explicit replace-all import to overwrite local data.`,
        };
      }
    }

    return this.enqueue(async () => {
      if (this.fallback) {
        const names = ['profiles', 'sessions', 'activeSessions', 'runs'] as const;
        const prior = Object.fromEntries(names.map((name) => [name, localStorage.getItem(this.key(name))]));
        try {
          if (strategy === 'replace-all') {
            localStorage.setItem(this.key('profiles'), JSON.stringify(data.profiles));
            localStorage.setItem(this.key('sessions'), JSON.stringify(data.sessions));
            localStorage.setItem(this.key('activeSessions'), JSON.stringify(data.activeSessions));
            localStorage.setItem(this.key('runs'), JSON.stringify(data.runs));
          } else {
            localStorage.setItem(this.key('profiles'), JSON.stringify([...this.fallbackRead<UserProfile[]>('profiles', []), ...data.profiles]));
            localStorage.setItem(this.key('sessions'), JSON.stringify([...this.fallbackRead<WorkoutSession[]>('sessions', []), ...data.sessions]));
            localStorage.setItem(this.key('activeSessions'), JSON.stringify([...this.fallbackRead<WorkoutSession[]>('activeSessions', []), ...data.activeSessions]));
            localStorage.setItem(this.key('runs'), JSON.stringify([...this.fallbackRead<RunSession[]>('runs', []), ...data.runs]));
          }
        } catch (error) {
          names.forEach((name) => prior[name] === null ? localStorage.removeItem(this.key(name)) : localStorage.setItem(this.key(name), prior[name]!));
          throw error;
        }
      } else {
        await new Promise<void>((resolve, reject) => {
          const transaction = this.db!.transaction(['profiles', 'sessions', 'activeSessions', 'runs'], 'readwrite');
          const profileStore = transaction.objectStore('profiles');
          const sessionStore = transaction.objectStore('sessions');
          const activeStore = transaction.objectStore('activeSessions');
          const runStore = transaction.objectStore('runs');
          if (strategy === 'replace-all') {
            profileStore.clear();
            sessionStore.clear();
            activeStore.clear();
            runStore.clear();
          }
          data.profiles.forEach((item) => profileStore.put(item));
          data.sessions.forEach((item) => sessionStore.put(item));
          data.activeSessions.forEach((item) => activeStore.put(item));
          data.runs.forEach((item) => runStore.put(item));
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(new Error(`Import transaction failed: ${transaction.error?.message ?? 'unknown error'}`));
          transaction.onabort = () => reject(new Error('Import was aborted; local data was not partially replaced.'));
        });
      }
      return {
        success: true,
        message: `Imported ${data.profiles.length} profiles, ${data.sessions.length} historical sessions, ${data.activeSessions.length} active sessions, and ${data.runs.length} runs.`,
      };
    });
  }

  async destroyForTests(): Promise<void> {
    this.db?.close();
    this.db = null;
    if (typeof indexedDB !== 'undefined') {
      await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase(this.dbName);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      });
    }
  }
}

export const dbService = new StorageService();
