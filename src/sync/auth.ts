import type { CloudConfig } from './cloud';

/** A Supabase Auth session. Device-local, outside IndexedDB and backups, like the pairing code. */
export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  /** ms epoch when the access token expires. */
  expiresAt: number;
  userId: string;
  email?: string;
}

const KEY = 'jnt2_auth_session';
const REFRESH_MARGIN_MS = 60_000;

function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4);
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch { return null; }
}

/** Builds a session from a token response, or null when it is not a usable one. */
export function sessionFromTokens(accessToken: unknown, refreshToken: unknown, expiresInSec: unknown, now: number): AuthSession | null {
  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') return null;
  const claims = decodeJwt(accessToken);
  const userId = typeof claims?.sub === 'string' ? claims.sub : null;
  if (!userId) return null;
  const seconds = Number(expiresInSec);
  return {
    accessToken, refreshToken, userId,
    email: typeof claims?.email === 'string' ? claims.email : undefined,
    expiresAt: now + (Number.isFinite(seconds) && seconds > 0 ? seconds : 3600) * 1000,
  };
}

/** Reads the session a magic-link redirect leaves in the URL hash (`#access_token=...`). */
export function parseAuthHash(hash: string, now: number): { session: AuthSession | null; error: string | null } {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const error = params.get('error_description') ?? params.get('error');
  if (error) return { session: null, error: error.replace(/\+/g, ' ') };
  const session = sessionFromTokens(params.get('access_token'), params.get('refresh_token'), params.get('expires_in'), now);
  return { session, error: null };
}

export function loadSession(): AuthSession | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<AuthSession> | null;
    if (!raw || typeof raw.accessToken !== 'string' || typeof raw.refreshToken !== 'string' || typeof raw.userId !== 'string' || typeof raw.expiresAt !== 'number') return null;
    return raw as AuthSession;
  } catch { return null; }
}
export function saveSession(session: AuthSession | null): void {
  try { if (session) localStorage.setItem(KEY, JSON.stringify(session)); else localStorage.removeItem(KEY); } catch { /* signed in for this visit only */ }
}

/** Picks up a magic-link redirect, stores it, and cleans the URL. Call once at startup. */
export function consumeAuthRedirect(now = Date.now()): { session: AuthSession | null; error: string | null } {
  if (typeof location === 'undefined' || !/access_token=|error_description=|error=/.test(location.hash)) return { session: null, error: null };
  const result = parseAuthHash(location.hash, now);
  if (result.session) saveSession(result.session);
  try { history.replaceState(null, '', location.pathname + location.search); } catch { /* the hash is harmless */ }
  return result;
}

function headers(config: CloudConfig, token?: string): Record<string, string> {
  return { 'Content-Type': 'application/json', apikey: config.anonKey, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/** Emails a sign-in link. Creates the account on first use. */
export async function sendMagicLink(config: CloudConfig, email: string, redirectTo: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl(`${config.url}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: 'POST', headers: headers(config), body: JSON.stringify({ email, create_user: true }), signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    if ((e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError') throw new Error('Sending took too long. The email service may be misconfigured. Check Supabase Authentication, SMTP settings and logs.');
    throw e;
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    let message = '';
    try { message = String((JSON.parse(detail) as { msg?: string; message?: string }).msg ?? (JSON.parse(detail) as { message?: string }).message ?? ''); } catch { /* raw */ }
    throw new Error(response.status === 429 ? 'Too many emails requested. Wait a minute and try again.' : `Could not send the link (${response.status})${message ? `: ${message}` : ''}`);
  }
}

/** Signs in with the 6 to 8 digit code from the sign-in email, so the installed app never has to open a browser. */
export async function verifyEmailCode(config: CloudConfig, email: string, code: string, now = Date.now(), fetchImpl: typeof fetch = fetch): Promise<AuthSession> {
  const response = await fetchImpl(`${config.url}/auth/v1/verify`, {
    method: 'POST', headers: headers(config), body: JSON.stringify({ type: 'email', email, token: code.replace(/\s+/g, '') }),
  });
  if (!response.ok) throw new Error(response.status === 400 || response.status === 401 || response.status === 403 ? 'That code is wrong or expired. Request a new one.' : `Could not verify the code (${response.status}).`);
  const body = await response.json() as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
  const session = sessionFromTokens(body.access_token, body.refresh_token, body.expires_in, now);
  if (!session) throw new Error('Sign-in did not return a session.');
  return session;
}

/** The session, refreshed when it is about to expire. Null when signed out or the refresh was refused. */
export async function freshSession(config: CloudConfig, session: AuthSession, now = Date.now(), fetchImpl: typeof fetch = fetch): Promise<AuthSession | null> {
  if (session.expiresAt - now > REFRESH_MARGIN_MS) return session;
  const response = await fetchImpl(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST', headers: headers(config), body: JSON.stringify({ refresh_token: session.refreshToken }),
  });
  if (response.status === 400 || response.status === 401) return null;
  if (!response.ok) throw new Error(`Could not refresh the sign-in (${response.status}).`);
  const body = await response.json() as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
  return sessionFromTokens(body.access_token, body.refresh_token, body.expires_in, now);
}
