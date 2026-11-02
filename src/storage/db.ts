/**
 * Local-First IndexedDB Persistence Layer.
 * Guarantees immediate per-set autosaving, active workout restoration,
 * separation of demo vs real records, and versioned JSON backup import/export.
 */

import { UserProfile, WorkoutSession, BackupExportData } from '../types';

const DB_NAME = 'JackedAndTan2_LocalDB';
const DB_VERSION = 1;

export class StorageService {
  private db: IDBDatabase | null = null;
  private isFallbackMode = false;

  async init(): Promise<void> {
    if (this.db) return;
    if (typeof indexedDB === 'undefined') {
      this.isFallbackMode = true;
      return;
    }

    return new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('profiles')) {
            db.createObjectStore('profiles', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('sessions')) {
            db.createObjectStore('sessions', { keyPath: 'sessionId' });
          }
          if (!db.objectStoreNames.contains('activeSessions')) {
            db.createObjectStore('activeSessions', { keyPath: 'profileId' });
          }
          if (!db.objectStoreNames.contains('demoSessions')) {
            db.createObjectStore('demoSessions', { keyPath: 'sessionId' });
          }
        };

        request.onsuccess = () => {
          this.db = request.result;
          resolve();
        };

        request.onerror = () => {
          console.warn('IndexedDB unavailable, falling back to localStorage');
          this.isFallbackMode = true;
          resolve();
        };
      } catch (e) {
        this.isFallbackMode = true;
        resolve();
      }
    });
  }

  // ==========================================
  // PROFILES
  // ==========================================
  async getProfiles(): Promise<UserProfile[]> {
    await this.init();
    if (this.isFallbackMode) {
      const data = localStorage.getItem('jnt2_profiles');
      return data ? JSON.parse(data) : [];
    }

    return new Promise((resolve) => {
      const tx = this.db!.transaction('profiles', 'readonly');
      const store = tx.objectStore('profiles');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  async saveProfile(profile: UserProfile): Promise<void> {
    await this.init();
    if (this.isFallbackMode) {
      const profiles = await this.getProfiles();
      const idx = profiles.findIndex((p) => p.id === profile.id);
      if (idx >= 0) profiles[idx] = profile;
      else profiles.push(profile);
      localStorage.setItem('jnt2_profiles', JSON.stringify(profiles));
      return;
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('profiles', 'readwrite');
      tx.objectStore('profiles').put(profile);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ==========================================
  // ACTIVE WORKOUT (Autosaved after every set)
  // ==========================================
  async getActiveSession(profileId: string): Promise<WorkoutSession | null> {
    await this.init();
    if (this.isFallbackMode) {
      const data = localStorage.getItem(`jnt2_active_${profileId}`);
      return data ? JSON.parse(data) : null;
    }

    return new Promise((resolve) => {
      const tx = this.db!.transaction('activeSessions', 'readonly');
      const store = tx.objectStore('activeSessions');
      const req = store.get(profileId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  async saveActiveSession(session: WorkoutSession): Promise<void> {
    await this.init();
    if (this.isFallbackMode) {
      localStorage.setItem(`jnt2_active_${session.profileId}`, JSON.stringify(session));
      return;
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('activeSessions', 'readwrite');
      tx.objectStore('activeSessions').put(session);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clearActiveSession(profileId: string): Promise<void> {
    await this.init();
    if (this.isFallbackMode) {
      localStorage.removeItem(`jnt2_active_${profileId}`);
      return;
    }

    return new Promise((resolve) => {
      const tx = this.db!.transaction('activeSessions', 'readwrite');
      tx.objectStore('activeSessions').delete(profileId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  // ==========================================
  // COMPLETED SESSIONS & HISTORY
  // ==========================================
  async completeSession(session: WorkoutSession): Promise<void> {
    await this.init();
    const targetStore = session.isDemo ? 'demoSessions' : 'sessions';

    if (this.isFallbackMode) {
      const key = session.isDemo ? 'jnt2_demo_sessions' : 'jnt2_sessions';
      const raw = localStorage.getItem(key);
      const list: WorkoutSession[] = raw ? JSON.parse(raw) : [];
      list.push(session);
      localStorage.setItem(key, JSON.stringify(list));
      localStorage.removeItem(`jnt2_active_${session.profileId}`);
      return;
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([targetStore, 'activeSessions'], 'readwrite');
      tx.objectStore(targetStore).put(session);
      tx.objectStore('activeSessions').delete(session.profileId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getSessionHistory(profileId: string, includeDemo = false): Promise<WorkoutSession[]> {
    await this.init();
    if (this.isFallbackMode) {
      const rawReal = localStorage.getItem('jnt2_sessions');
      let list: WorkoutSession[] = rawReal ? JSON.parse(rawReal) : [];
      if (includeDemo) {
        const rawDemo = localStorage.getItem('jnt2_demo_sessions');
        const demoList: WorkoutSession[] = rawDemo ? JSON.parse(rawDemo) : [];
        list = [...list, ...demoList];
      }
      return list
        .filter((s) => s.profileId === profileId)
        .sort((a, b) => b.startTime - a.startTime);
    }

    return new Promise((resolve) => {
      const tx = this.db!.transaction(includeDemo ? ['sessions', 'demoSessions'] : ['sessions'], 'readonly');
      const store = tx.objectStore('sessions');
      const req = store.getAll();

      req.onsuccess = () => {
        let results: WorkoutSession[] = req.result || [];
        if (includeDemo) {
          const demoStore = tx.objectStore('demoSessions');
          const demoReq = demoStore.getAll();
          demoReq.onsuccess = () => {
            const demoResults: WorkoutSession[] = demoReq.result || [];
            const merged = [...results, ...demoResults]
              .filter((s) => s.profileId === profileId)
              .sort((a, b) => b.startTime - a.startTime);
            resolve(merged);
          };
          return;
        }
        resolve(
          results
            .filter((s) => s.profileId === profileId)
            .sort((a, b) => b.startTime - a.startTime)
        );
      };
      req.onerror = () => resolve([]);
    });
  }

  async deleteSession(sessionId: string, isDemo = false): Promise<void> {
    await this.init();
    const targetStore = isDemo ? 'demoSessions' : 'sessions';
    if (this.isFallbackMode) {
      const key = isDemo ? 'jnt2_demo_sessions' : 'jnt2_sessions';
      const raw = localStorage.getItem(key);
      if (raw) {
        const list: WorkoutSession[] = JSON.parse(raw);
        localStorage.setItem(key, JSON.stringify(list.filter((s) => s.sessionId !== sessionId)));
      }
      return;
    }

    return new Promise((resolve) => {
      const tx = this.db!.transaction(targetStore, 'readwrite');
      tx.objectStore(targetStore).delete(sessionId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async clearDemoSessions(profileId: string): Promise<void> {
    await this.init();
    if (this.isFallbackMode) {
      const raw = localStorage.getItem('jnt2_demo_sessions');
      if (raw) {
        const list: WorkoutSession[] = JSON.parse(raw);
        localStorage.setItem(
          'jnt2_demo_sessions',
          JSON.stringify(list.filter((s) => s.profileId !== profileId))
        );
      }
      return;
    }

    return new Promise((resolve) => {
      const tx = this.db!.transaction('demoSessions', 'readwrite');
      const store = tx.objectStore('demoSessions');
      const req = store.getAll();
      req.onsuccess = () => {
        const all: WorkoutSession[] = req.result || [];
        for (const s of all) {
          if (s.profileId === profileId) {
            store.delete(s.sessionId);
          }
        }
      };
      tx.oncomplete = () => resolve();
    });
  }

  // ==========================================
  // BACKUP EXPORT & IMPORT VALIDATION
  // ==========================================
  async exportBackup(): Promise<string> {
    await this.init();
    const profiles = await this.getProfiles();
    let sessions: WorkoutSession[] = [];

    if (this.isFallbackMode) {
      const raw = localStorage.getItem('jnt2_sessions');
      sessions = raw ? JSON.parse(raw) : [];
    } else {
      sessions = await new Promise((res) => {
        const tx = this.db!.transaction('sessions', 'readonly');
        const req = tx.objectStore('sessions').getAll();
        req.onsuccess = () => res(req.result || []);
        req.onerror = () => res([]);
      });
    }

    const payload: BackupExportData = {
      version: 1,
      timestamp: Date.now(),
      app: 'GZCL_Jacked_And_Tan_2_Partner_Engine',
      profiles,
      sessions,
    };

    return JSON.stringify(payload, null, 2);
  }

  async importBackup(jsonString: string): Promise<{ success: boolean; message: string }> {
    try {
      const data = JSON.parse(jsonString) as BackupExportData;
      if (!data.version || !Array.isArray(data.profiles) || !Array.isArray(data.sessions)) {
        return {
          success: false,
          message: 'Invalid backup file schema. Missing version or required collections.',
        };
      }

      // Validate profiles
      for (const p of data.profiles) {
        if (!p.id || !p.name || !p.unit || !p.trainingMaxes) {
          return {
            success: false,
            message: `Malformed profile structure in import: ${p.name || 'unnamed'}`,
          };
        }
      }

      await this.init();

      if (this.isFallbackMode) {
        localStorage.setItem('jnt2_profiles', JSON.stringify(data.profiles));
        localStorage.setItem('jnt2_sessions', JSON.stringify(data.sessions));
        return {
          success: true,
          message: `Successfully imported ${data.profiles.length} profiles and ${data.sessions.length} sessions.`,
        };
      }

      return new Promise((resolve) => {
        const tx = this.db!.transaction(['profiles', 'sessions'], 'readwrite');
        const pStore = tx.objectStore('profiles');
        const sStore = tx.objectStore('sessions');

        for (const p of data.profiles) {
          pStore.put(p);
        }
        for (const s of data.sessions) {
          sStore.put(s);
        }

        tx.oncomplete = () =>
          resolve({
            success: true,
            message: `Successfully imported ${data.profiles.length} profiles and ${data.sessions.length} sessions.`,
          });
        tx.onerror = () =>
          resolve({ success: false, message: 'Database transaction error writing imported records.' });
      });
    } catch (err: any) {
      return { success: false, message: `Backup parse error: ${err.message}` };
    }
  }
}

export const dbService = new StorageService();
