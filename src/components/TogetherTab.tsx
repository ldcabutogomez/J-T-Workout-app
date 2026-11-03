import { levelTitle } from '../engine/xp';
import { TAUNTS, TAUNT_LEVEL, flairById } from '../lib/perks';
import { useEffect, useState } from 'react';
import { Trophy, Users } from 'lucide-react';
import { isLiveFresh, type Leaderboard, type LeaderboardCategory, type PartnerStats } from '../engine/leaderboard';
import { ProgressRing } from './ProgressRing';
import { fmtCount } from '../engine/sessionValidity';
import { StreakLabel } from './StreakLabel';
import { Avatar } from './Avatar';
import type { UserProfile } from '../types';

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'ok' | 'error';
  error?: string;
  at?: number;
  lastPushAt?: number;
  lastPullAt?: number;
  remoteCount?: number;
  /** What the last push actually sent, so you can see your workout reached the server. */
  lastPushed?: { volumeLb: number; sessions: number; partial: number; weekCount: number };
}

export interface SyncDiagnostics {
  host: string;
  keyType: string;
  deviceId: string;
  pairedAs: string | null;
  connection: { state: 'idle' | 'testing' | 'ok' | 'error'; message?: string };
}

export interface PairingUi {
  /** False when the build has no backend configured. The tab then shows only this device's profiles. */
  configured: boolean;
  code: string | null;
  status: SyncStatus;
  onCreate: () => void;
  /** Returns an error message, or null on success. */
  onJoin: (code: string) => string | null;
  onUnlink: () => void;
  onSyncNow: () => void;
  diagnostics?: SyncDiagnostics;
  onTestConnection: () => void;
}

interface TogetherTabProps {
  board: Leaderboard | null;
  /** The lifter who is "you" on this phone. */
  youId: string;
  pairing: PairingUi;
  /** Local profiles, used to show your own picture. A partner's picture comes from what their phone shared. */
  profiles?: UserProfile[];
  /** Your level, which unlocks taunts. */
  youLevel?: number;
  onTaunt?: (tauntId: number) => void;
}

function ago(ms: number, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - ms) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

function PairingPanel({ pairing }: { pairing: PairingUi }) {
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const input = 'bg-paper border border-line rounded-xl px-3 py-2 text-sm text-ink';
  const button = 'px-3 py-2 rounded-xl text-xs font-black';

  if (!pairing.configured) {
    return (
      <section className="card p-4">
        <p className="font-black text-ink text-sm">Partner sync is not set up</p>
        <p className="text-xs text-muted mt-1">This build has no backend configured, so only profiles on this phone are compared. See the README to enable syncing between phones.</p>
      </section>
    );
  }

  if (pairing.code) {
    const display = `${pairing.code.slice(0, 5)}-${pairing.code.slice(5)}`;
    const { status } = pairing;
    const share = async () => {
      try {
        if (navigator.share) await navigator.share({ title: 'J&T 2.0 partner code', text: `Join me on J&T 2.0. Partner code: ${display}` });
        else { await navigator.clipboard.writeText(display); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }
      } catch { /* share cancelled */ }
    };
    return (
      <section className="card p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs text-muted">Partner code</p>
            <p className="font-mono font-black text-lg text-accent-ink tracking-wider">{display}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={share} className={`${button} bg-accent text-on-accent`}>{copied ? 'Copied' : 'Share'}</button>
            <button onClick={pairing.onSyncNow} className={`${button} bg-sunk text-ink`} disabled={status.state === 'syncing'}>{status.state === 'syncing' ? 'Syncing…' : 'Sync now'}</button>
          </div>
        </div>
        <p className={`text-xs mt-2 ${status.state === 'error' ? 'text-bad' : 'text-muted'}`}>
          {status.state === 'error' ? `${status.error ?? 'Sync failed'}${status.at ? ` · last synced ${ago(status.at)}` : ''}` : status.at ? `Synced ${ago(status.at)}` : 'Waiting for first sync…'}
        </p>
        <button onClick={() => { if (window.confirm('Unlink from your partner? Your local data is not affected.')) pairing.onUnlink(); }} className="text-xs text-muted underline mt-2">Unlink</button>
      </section>
    );
  }

  return (
    <section className="card p-4 space-y-3">
      <div>
        <p className="font-black text-ink text-sm">Link your partner's phone</p>
        <p className="text-xs text-muted mt-1">Shared with your partner: your stats (sessions per week, streak, volume, PRs), your photo, and live status (lifting now, today's workout, this week). Set-by-set logs never leave this phone. You can turn photo and live status off in Settings.</p>
      </div>
      <button onClick={() => { setError(null); pairing.onCreate(); }} className={`${button} bg-accent text-on-accent w-full`}>Create a code</button>
      <div className="flex gap-2">
        <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Or enter partner's code" autoCapitalize="characters" autoCorrect="off" spellCheck={false} className={`${input} flex-1 min-w-0 font-mono`} aria-label="Partner code" />
        <button onClick={() => setError(pairing.onJoin(joinCode))} className={`${button} bg-sunk text-ink`}>Join</button>
      </div>
      {error && <p role="alert" className="text-xs text-bad">{error}</p>}
    </section>
  );
}

function SyncDetails({ pairing }: { pairing: PairingUi }) {
  const d = pairing.diagnostics;
  if (!pairing.configured || !d) return null;
  const { status } = pairing;
  const row = (label: string, value: string) => (
    <div className="flex justify-between gap-3 py-1"><dt className="text-muted">{label}</dt><dd className="text-right font-semibold text-ink break-all">{value}</dd></div>
  );
  return (
    <details className="card px-4">
      <summary className="flex min-h-12 cursor-pointer items-center justify-between text-sm font-bold text-ink-2">
        <span>Sync details</span>
        <span className={`text-xs font-semibold ${status.state === 'error' ? 'text-bad' : 'text-muted'}`}>
          {status.state === 'error' ? 'Problem' : pairing.code ? (status.at ? `Synced ${ago(status.at)}` : 'Not synced yet') : 'Not linked'}
        </span>
      </summary>
      <dl className="pb-2 text-xs">
        {row('Server', d.host)}
        {row('Key', d.keyType)}
        {row('This phone', `…${d.deviceId.slice(-6)}`)}
        {row('Linked as', pairing.code ? (d.pairedAs ?? 'unknown') : 'not linked')}
        {pairing.code && row('Last sent', status.lastPushAt ? ago(status.lastPushAt) : 'never')}
        {pairing.code && status.lastPushed && row('What was sent', `${status.lastPushed.volumeLb.toLocaleString()} lb · ${status.lastPushed.sessions} finished${status.lastPushed.partial ? ` + ${status.lastPushed.partial} partial` : ''} · ${fmtCount(status.lastPushed.weekCount)} this week`)}
        {pairing.code && row('Last received', status.lastPullAt ? ago(status.lastPullAt) : 'never')}
        {pairing.code && row('Partner phones found', String(status.remoteCount ?? 0))}
      </dl>
      {status.state === 'error' && <p role="alert" className="alert-bad mb-2 text-xs">{status.error}</p>}
      <div className="flex flex-wrap gap-2 pb-3">
        <button onClick={pairing.onTestConnection} disabled={d.connection.state === 'testing'} className="btn-secondary min-h-11 text-xs">{d.connection.state === 'testing' ? 'Testing…' : 'Test connection'}</button>
        {pairing.code && <button onClick={pairing.onSyncNow} disabled={status.state === 'syncing'} className="btn-secondary min-h-11 text-xs">{status.state === 'syncing' ? 'Syncing…' : 'Sync now'}</button>}
      </div>
      {d.connection.message && <p role="status" className={`pb-3 text-xs ${d.connection.state === 'error' ? 'text-bad' : 'text-ok'}`}>{d.connection.message}</p>}
    </details>
  );
}

const STATUS_STYLE: Record<string, string> = {
  c: 'bg-ok text-on-accent', p: 'bg-ok/30 text-ok', s: 'bg-sunk text-muted', m: 'bg-bad/15 text-bad', t: 'bg-accent text-on-accent', u: 'bg-sunk text-ink-2',
};
const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** What a partner chose to share beyond stats: lifting now, today's workout, and their week. */
function PartnerLive({ stats }: { stats: PartnerStats }) {
  const live = isLiveFresh(stats.workout, Date.now()) ? stats.workout : undefined;
  if (!live && !stats.today && !stats.weekCodes) return null;
  return (
    <div className="mt-2 w-full space-y-1.5 border-t border-line pt-2 text-left">
      {live && (
        <p className="flex items-center gap-1.5 text-xs font-bold text-accent-ink">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden />
          Lifting now · {live.done} of {live.total} sets
        </p>
      )}
      {!live && stats.today && <p className="text-xs text-ink-2">Next: Day {stats.today.day} · {stats.today.lift}</p>}
      {stats.weekCodes && (
        <ol className="flex justify-between gap-0.5" aria-label="This week">
          {stats.weekCodes.map((code, index) => (
            <li key={index} className="flex flex-1 flex-col items-center gap-0.5">
              <span className="text-xs text-muted">{WEEKDAY_LETTERS[index]}</span>
              {code === '' ? <span className="h-4 w-1.5 rounded-full bg-line" aria-hidden /> : (code.match(/[1-4][cpsmtu]/g) ?? []).map((part) => (
                <span key={part} className={`rounded px-1 text-xs font-bold leading-4 ${STATUS_STYLE[part[1]]}`}>D{part[0]}</span>
              ))}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const CATEGORIES: { key: LeaderboardCategory; label: string; value: (s: PartnerStats) => string }[] = [
  { key: 'compliance', label: '4-wk compliance', value: (s) => `${s.compliancePct}%` },
  { key: 'streak', label: 'Week streak', value: (s) => `${s.streakWeeks}` },
  { key: 'volume', label: 'Volume (lb)', value: (s) => s.volumeLb.toLocaleString() },
  { key: 'prs', label: 'All-time PRs', value: (s) => `${s.prCount}` },
];

function lastTrained(s: PartnerStats): { text: string; warn: boolean } {
  if (s.daysSinceLast === null) return { text: 'No sessions yet', warn: true };
  if (s.daysSinceLast === 0) return { text: `Trained today${s.lastSessionAt ? `, ${new Date(s.lastSessionAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`, warn: false };
  if (s.daysSinceLast === 1) return { text: 'Trained yesterday', warn: false };
  return { text: `${s.daysSinceLast} days since last session`, warn: s.daysSinceLast >= 4 };
}

export function TogetherTab({ board, youId, pairing, profiles, youLevel = 1, onTaunt }: TogetherTabProps) {
  const personFor = (s: PartnerStats) => profiles?.find((p) => p.id === s.profileId)
    ?? { id: s.profileId, name: s.name, colorTheme: s.theme, flair: s.flair, avatar: s.avatar ? { photo: s.avatar.thumb, color: s.avatar.color } : undefined };
  if (!board) return <p className="text-sm text-muted p-4">Loading partners…</p>;
  return (
    <div className="space-y-4">
      <PairingPanel pairing={pairing} />
      <SyncDetails pairing={pairing} />
      <section className="grid grid-cols-2 gap-3">
        {board.ranked.map((s) => {
          const last = lastTrained(s);
          const isYou = s.profileId === youId;
          return (
            <div key={s.profileId} className={`bg-surface border rounded-3xl p-4 flex flex-col items-center text-center ${isYou ? 'border-accent/60' : 'border-line'}`}>
              <div className="mb-1"><Avatar profile={personFor(s)} size={44} decorative /></div>
              <p className="font-black text-ink truncate max-w-full">{s.name}{isYou && <span className="text-accent-ink text-xs ml-1 align-middle">YOU</span>}</p>
              {s.level !== undefined && <p className="text-xs font-bold text-accent-ink">Lv {s.level} · {flairById(s.flair)?.label ?? levelTitle(s.level)}</p>}
              {!isYou && onTaunt && <TauntButton unlocked={youLevel >= TAUNT_LEVEL} onTaunt={onTaunt} />}
              <div className="mt-2">
                <ProgressRing value={s.weeklyCount} max={s.weeklyGoal} size={72}>
                  <span className="font-mono text-sm font-black text-ink">{fmtCount(s.weeklyCount)}/{s.weeklyGoal}</span>
                </ProgressRing>
              </div>
              <p className="text-xs text-muted mt-1">this week</p>
              <p className="text-xs text-ink-2 mt-2 flex items-center gap-1">
                {s.streakWeeks > 0 ? <StreakLabel weeks={s.streakWeeks} /> : 'No streak yet'}
              </p>
              <p className={`text-xs mt-1 ${last.warn ? 'text-bad' : 'text-muted'}`}>{last.text}</p>
              {s.syncedAt !== undefined && <p className="text-xs text-muted mt-0.5">synced {ago(s.syncedAt)}</p>}
              <PartnerLive stats={s} />
              <p className="text-xs text-muted mt-1">{s.sessionsCompleted + s.partialSessions} session{s.sessionsCompleted + s.partialSessions === 1 ? '' : 's'}{s.partialSessions > 0 ? ` (${s.partialSessions} partial)` : ''}</p>
              <p className="text-xs text-muted mt-1 font-mono">Wk {s.currentWeek} · Day {s.currentDay}</p>
            </div>
          );
        })}
        {board.ranked.length < 2 && (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-line p-4 text-center">
            <Users className="w-8 h-8 text-accent-ink" />
            <p className="mt-2 font-black text-ink">{pairing.code ? 'Waiting for your partner' : 'Add a training partner'}</p>
            <p className="mt-1 text-xs text-muted">{pairing.code ? 'Send them the code above. Your stats are already here.' : 'Link a partner above to compare stats. Your own stats show here right away.'}</p>
          </div>
        )}
      </section>

      <section className="card p-4">
        <h2 className="font-black text-ink mb-3">Leaderboard</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted text-left">
                <th className="font-bold pb-2 pr-2">#</th>
                <th className="font-bold pb-2 pr-2">Lifter</th>
                {CATEGORIES.map((c) => <th key={c.key} className="font-bold pb-2 px-1 text-right">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {board.ranked.map((s, index) => (
                <tr key={s.profileId} className={`border-t border-line ${s.profileId === youId ? 'text-accent-ink' : 'text-ink'}`}>
                  <td className="py-2 pr-2 font-mono">{index + 1}</td>
                  <td className="py-2 pr-2 font-bold"><span className="flex items-center gap-2"><Avatar profile={personFor(s)} size={24} decorative />{s.name}</span></td>
                  {CATEGORIES.map((c) => (
                    <td key={c.key} className="py-2 px-1 text-right font-mono">
                      {board.winners[c.key].includes(s.profileId) && <Trophy className="inline w-3 h-3 text-accent-ink mr-1 -mt-0.5" aria-label="Category leader" />}
                      {c.value(s)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted mt-3">Ranked by 4-week compliance, then streak, volume and PRs. Compliance uses the last 4 full Mon–Sun weeks, capped at each lifter's weekly goal. Partner stats sync between your phones; set-level logs never leave this device.</p>
      </section>
    </div>
  );
}

function TauntButton({ unlocked, onTaunt }: { unlocked: boolean; onTaunt: (tauntId: number) => void }) {
  const [sent, setSent] = useState(false);
  useEffect(() => {
    if (!sent) return;
    const timer = window.setTimeout(() => setSent(false), 3000);
    return () => window.clearTimeout(timer);
  }, [sent]);
  if (!unlocked) return <p className="mt-1 text-xs text-muted">Taunts unlock at level {TAUNT_LEVEL}</p>;
  return (
    <details className="mt-2 w-full">
      <summary className="flex min-h-9 cursor-pointer items-center justify-center rounded-xl bg-sunk px-2 text-xs font-bold text-accent-ink">{sent ? 'Taunt sent ✓' : 'Send a taunt'}</summary>
      <div className="mt-1 space-y-1">
        {TAUNTS.map((text, id) => (
          <button key={id} type="button" onClick={(event) => { onTaunt(id); setSent(true); event.currentTarget.closest('details')?.removeAttribute('open'); }} className="w-full rounded-xl border border-line bg-paper px-2 py-2 text-left text-xs text-ink">{text}</button>
        ))}
      </div>
    </details>
  );
}
