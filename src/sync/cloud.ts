import { parseSnapshot, type PartnerSnapshot } from '../engine/leaderboard';

/** Unambiguous alphabet (no 0/O/1/I) matching the `^[A-Z2-9]{10,32}$` check in supabase/schema.sql. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 10;
const CODE_PATTERN = /^[A-Z2-9]{10,32}$/;

export interface CloudConfig {
  url: string;
  anonKey: string;
}

export function readCloudConfig(): CloudConfig | null {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const url = env?.VITE_SUPABASE_URL?.replace(/\/+$/, '');
  const anonKey = env?.VITE_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

export function generatePairCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  // 256 % 32 === 0, so mapping a byte with % 32 is unbiased.
  return Array.from(random(CODE_LENGTH), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/** Normalises what a person typed: case, spaces and dashes. Returns null if it cannot be a valid code. */
export function normalizePairCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]+/g, '');
  return CODE_PATTERN.test(code) ? code : null;
}

export const formatPairCode = (code: string) => `${code.slice(0, 5)}-${code.slice(5)}`;

/** Turns a failed response into a message a person can act on, keeping the server's own explanation. */
export function describeSyncFailure(status: number, detail: string): string {
  if (detail.includes('pairing full')) return 'That code already has two phones linked.';
  let message = '';
  let code = '';
  try {
    const parsed = JSON.parse(detail) as { message?: unknown; code?: unknown };
    message = typeof parsed.message === 'string' ? parsed.message : '';
    code = typeof parsed.code === 'string' ? parsed.code : '';
  } catch {
    message = detail.trim().slice(0, 140);
  }
  if (status === 404 || code === 'PGRST202') {
    return `The sync functions were not found on the server (${status}). Run supabase/schema.sql in your Supabase SQL editor.`;
  }
  if (status === 401 || status === 403) {
    return `The server rejected the key (${status}). Check VITE_SUPABASE_ANON_KEY in the repository variables and redeploy.`;
  }
  return `Sync failed (${status})${message ? `: ${message}` : ''}`;
}

async function rpc<T>(config: CloudConfig, fn: string, body: unknown, fetchImpl: typeof fetch): Promise<T> {
  const response = await fetchImpl(`${config.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    // Legacy anon keys are JWTs and go in both headers. New sb_publishable_ keys are not JWTs and use apikey only.
    headers: {
      'Content-Type': 'application/json',
      apikey: config.anonKey,
      ...(config.anonKey.startsWith('eyJ') ? { Authorization: `Bearer ${config.anonKey}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(describeSyncFailure(response.status, detail));
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

export async function pushSnapshot(
  config: CloudConfig,
  code: string,
  snapshot: PartnerSnapshot,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await rpc<void>(config, 'push_snapshot', { p_code: code, p_device: snapshot.deviceId, p_snapshot: snapshot }, fetchImpl);
}

/** Every valid snapshot for this pairing, including our own. Malformed entries are dropped. */
export async function pullSnapshots(
  config: CloudConfig,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PartnerSnapshot[]> {
  const rows = await rpc<unknown>(config, 'pull_snapshots', { p_code: code }, fetchImpl);
  if (!Array.isArray(rows)) return [];
  return rows.map(parseSnapshot).filter((s): s is PartnerSnapshot => s !== null);
}

/**
 * Read-only check that the server is reachable, the key is accepted, and the sync functions exist.
 * Asks for a throwaway code nobody has used, so it returns an empty list and writes nothing.
 */
export async function testConnection(config: CloudConfig, fetchImpl: typeof fetch = fetch): Promise<void> {
  await rpc<unknown>(config, 'pull_snapshots', { p_code: generatePairCode() }, fetchImpl);
}

/** Which kind of key is configured, without exposing it. */
export function describeKey(anonKey: string): 'legacy JWT' | 'publishable' | 'unrecognized' {
  if (anonKey.startsWith('eyJ')) return 'legacy JWT';
  if (anonKey.startsWith('sb_publishable_')) return 'publishable';
  return 'unrecognized';
}

// Device-local pairing state. Deliberately outside IndexedDB and backups: a restored backup must never
// silently re-link a phone to someone's old pairing.
const KEYS = { device: 'jnt2_device_id', code: 'jnt2_pair_code', me: 'jnt2_sync_profile' } as const;

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null): void {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* storage blocked: sync just will not persist */ }
}

export function getDeviceId(): string {
  let id = read(KEYS.device);
  if (!id) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
    write(KEYS.device, id);
  }
  return id;
}

export const loadPairing = () => ({ code: read(KEYS.code), profileId: read(KEYS.me) });
export const savePairing = (code: string, profileId: string) => { write(KEYS.code, code); write(KEYS.me, profileId); };
export const saveSyncProfile = (profileId: string) => write(KEYS.me, profileId);
export const clearPairing = () => { write(KEYS.code, null); write(KEYS.me, null); };
