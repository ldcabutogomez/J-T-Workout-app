import type { BackupExportData, LoggedExercise, LoggedSet, UserProfile, WorkoutSession } from '../types';
import { isValidAvatar } from '../lib/avatar';
import { isColorTheme } from '../lib/theme';
import { isValidSchedule } from '../engine/schedule';
import { nextProgramPosition } from '../engine/sessionEngine';

const DEFAULT_DB_NAME = 'JackedAndTan2_LocalDB';
const DB_VERSION = 2;
const STORES = ['profiles', 'sessions', 'activeSessions', 'demoSessions'] as const;

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
    && completedValues;
}

function validateExercise(value: unknown): value is LoggedExercise {
  if (!isObject(value)) return false;
  return typeof value.slotId === 'string' && value.slotId.length > 0
    && typeof value.exerciseId === 'string' && value.exerciseId.length > 0
    && ['T1', 'T2a', 'T2b', 'T2c', 'T3a', 'T3b', 'T3c', 'T3d'].includes(String(value.tier))
    && typeof value.exerciseName === 'string' && value.exerciseName.trim().length > 0
    && ['work', 'rest', 'test', 'omitted'].includes(String(value.status))
    && Array.isArray(value.sets)
    && value.sets.every(validateSet)
    && uniqueIds(value.sets as LoggedSet[], (item) => item.setId)
    && validateSourceRefs(value.sourceRefs);
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
    && typeof value.profileId === 'string'
    && profileIds.has(value.profileId)
    && Number.isInteger(value.week) && Number(value.week) >= 1 && Number(value.week) <= 12
    && Number.isInteger(value.day) && Number(value.day) >= 1 && Number(value.day) <= 4
    && finiteNonNegative(value.startTime)
    && finiteNonNegative(value.updatedTime)
    && ['active', 'partial', 'completed', 'skipped'].includes(String(value.status))
    && typeof value.isPartial === 'boolean'
    && typeof value.isSkipped === 'boolean'
    && validatePrescriptionSnapshot(value.prescriptionSnapshot, Number(value.week), Number(value.day))
    && validateSettingsSnapshot(value.settingsSnapshot)
    && Array.isArray(value.exercises)
    && value.exercises.every(validateExercise)
    && uniqueIds(value.exercises as LoggedExercise[], (item) => item.slotId);
}

function validateStringRecord(value: unknown): boolean {
  return isObject(value) && Object.values(value).every((item) => typeof item === 'string' && item.length > 0);
}

function validateProfile(value: unknown): value is UserProfile {
  if (!isObject(value)) return false;
  return typeof value.id === 'string' && value.id.length > 0
    && typeof value.name === 'string' && value.name.trim().length > 0
    && (value.unit === 'lb' || value.unit === 'kg')
    && finiteNonNegative(value.equipmentIncrement) && Number(value.equipmentIncrement) > 0
    && finiteNonNegative(value.barbellWeight)
    && ['minimal', 'warm', 'playful', 'off'].includes(String(value.tone))
    && Number.isInteger(value.currentWeek) && Number(value.currentWeek) >= 1 && Number(value.currentWeek) <= 12
    && Number.isInteger(value.currentDay) && Number(value.currentDay) >= 1 && Number(value.currentDay) <= 4
    && validateTmRecord(value.trainingMaxes)
    && (value.block2ConfirmedTMs === undefined || validateTmRecord(value.block2ConfirmedTMs))
    && (value.exerciseSwaps === undefined || validateStringRecord(value.exerciseSwaps))
    && (value.avatar === undefined || isValidAvatar(value.avatar))
    && (value.colorTheme === undefined || isColorTheme(value.colorTheme))
    && (value.schedule === undefined || isValidSchedule(value.schedule));
}

function uniqueIds<T>(items: T[], getId: (item: T) => string): boolean {
  const ids = items.map(getId);
  return new Set(ids).size === ids.length;
}

function validateBackup(value: unknown): { ok: true; data: BackupExportData } | { ok: false; message: string } {
  if (!isObject(value) || value.version !== 2 || value.app !== 'GZCL_Jacked_And_Tan_2_Partner_Engine') {
    return { ok: false, message: 'This is not a supported version 2 J&T 2.0 backup.' };
  }
  if (!Array.isArray(value.profiles) || !Array.isArray(value.sessions) || !Array.isArray(value.activeSessions)) {
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
  if (!value.sessions.every((item) => validateSession(item, profileIds) && item.status !== 'active')) {
    return { ok: false, message: 'At least one completed session, exercise, or set is malformed.' };
  }
  if (!value.activeSessions.every((item) => validateSession(item, profileIds) && item.status === 'active')) {
    return { ok: false, message: 'At least one active session is malformed.' };
  }
  const sessions = value.sessions as WorkoutSession[];
  const activeSessions = value.activeSessions as WorkoutSession[];
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
            database.createObjectStore(name, { keyPath: name === 'profiles' ? 'id' : name === 'activeSessions' ? 'profileId' : 'sessionId' });
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
    return this.getAll<UserProfile>('profiles');
  }

  async saveProfile(profile: UserProfile): Promise<void> {
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
    inputProfile: UserProfile,
    position?: Pick<UserProfile, 'currentWeek' | 'currentDay' | 'cycleCompleted'>,
  ): Promise<{ session: WorkoutSession; profile: UserProfile; advanced: boolean }> {
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
        const shouldAdvance = !existing?.advancedAt && !inputSession.advancedAt && !inputSession.isEditingCompleted;
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
          const shouldAdvance = !existing?.advancedAt && !inputSession.advancedAt && !inputSession.isEditingCompleted;
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
    const [profiles, sessions, activeSessions] = await Promise.all([
      this.getProfiles(),
      this.getAll<WorkoutSession>('sessions'),
      this.getAll<WorkoutSession>('activeSessions'),
    ]);
    const payload: BackupExportData = {
      version: 2,
      timestamp: Date.now(),
      app: 'GZCL_Jacked_And_Tan_2_Partner_Engine',
      profiles,
      sessions: sessions.filter((item) => !item.isDemo),
      activeSessions,
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
      const [profiles, sessions, activeSessions] = await Promise.all([
        this.getProfiles(),
        this.getAll<WorkoutSession>('sessions'),
        this.getAll<WorkoutSession>('activeSessions'),
      ]);
      const profileIds = new Set(profiles.map((item) => item.id));
      const sessionIds = new Set([...sessions, ...activeSessions].map((item) => item.sessionId));
      const activeProfileIds = new Set(activeSessions.map((item) => item.profileId));
      const profileDuplicate = data.profiles.find((item) => profileIds.has(item.id));
      const sessionDuplicate = [...data.sessions, ...data.activeSessions].find((item) => sessionIds.has(item.sessionId));
      const activeProfileDuplicate = data.activeSessions.find((item) => activeProfileIds.has(item.profileId));
      if (profileDuplicate || sessionDuplicate || activeProfileDuplicate) {
        return {
          success: false,
          message: `Import stopped before writing because duplicate IDs exist${profileDuplicate ? ` (profile ${profileDuplicate.id})` : ''}${sessionDuplicate ? ` (session ${sessionDuplicate.sessionId})` : ''}${activeProfileDuplicate ? ` (active profile ${activeProfileDuplicate.profileId})` : ''}. Choose explicit replace-all import to overwrite local data.`,
        };
      }
    }

    return this.enqueue(async () => {
      if (this.fallback) {
        const names = ['profiles', 'sessions', 'activeSessions'] as const;
        const prior = Object.fromEntries(names.map((name) => [name, localStorage.getItem(this.key(name))]));
        try {
          if (strategy === 'replace-all') {
            localStorage.setItem(this.key('profiles'), JSON.stringify(data.profiles));
            localStorage.setItem(this.key('sessions'), JSON.stringify(data.sessions));
            localStorage.setItem(this.key('activeSessions'), JSON.stringify(data.activeSessions));
          } else {
            localStorage.setItem(this.key('profiles'), JSON.stringify([...this.fallbackRead<UserProfile[]>('profiles', []), ...data.profiles]));
            localStorage.setItem(this.key('sessions'), JSON.stringify([...this.fallbackRead<WorkoutSession[]>('sessions', []), ...data.sessions]));
            localStorage.setItem(this.key('activeSessions'), JSON.stringify([...this.fallbackRead<WorkoutSession[]>('activeSessions', []), ...data.activeSessions]));
          }
        } catch (error) {
          names.forEach((name) => prior[name] === null ? localStorage.removeItem(this.key(name)) : localStorage.setItem(this.key(name), prior[name]!));
          throw error;
        }
      } else {
        await new Promise<void>((resolve, reject) => {
          const transaction = this.db!.transaction(['profiles', 'sessions', 'activeSessions'], 'readwrite');
          const profileStore = transaction.objectStore('profiles');
          const sessionStore = transaction.objectStore('sessions');
          const activeStore = transaction.objectStore('activeSessions');
          if (strategy === 'replace-all') {
            profileStore.clear();
            sessionStore.clear();
            activeStore.clear();
          }
          data.profiles.forEach((item) => profileStore.put(item));
          data.sessions.forEach((item) => sessionStore.put(item));
          data.activeSessions.forEach((item) => activeStore.put(item));
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(new Error(`Import transaction failed: ${transaction.error?.message ?? 'unknown error'}`));
          transaction.onabort = () => reject(new Error('Import was aborted; local data was not partially replaced.'));
        });
      }
      return {
        success: true,
        message: `Imported ${data.profiles.length} profiles, ${data.sessions.length} historical sessions, and ${data.activeSessions.length} active sessions.`,
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
