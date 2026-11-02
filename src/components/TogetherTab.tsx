import { useState } from 'react';
import { Trophy, Users } from 'lucide-react';
import type { Leaderboard, LeaderboardCategory, PartnerStats } from '../engine/leaderboard';
import { ProgressRing } from './ProgressRing';
import { StreakLabel } from './StreakLabel';
import { Avatar } from './Avatar';
import type { UserProfile } from '../types';

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'ok' | 'error';
  error?: string;
  at?: number;
}

export interface PairingUi {
  /** False when the build has no backend configured. The tab then shows only this device's profiles. */
  configured: boolean;
  code: string | null;
  profiles: { id: string; name: string }[];
  status: SyncStatus;
  onCreate: (meId: string) => void;
  /** Returns an error message, or null on success. */
  onJoin: (code: string, meId: string) => string | null;
  onUnlink: () => void;
  onSyncNow: () => void;
}

interface TogetherTabProps {
  board: Leaderboard | null;
  /** The lifter who is "you" on this phone. */
  youId: string;
  pairing: PairingUi;
  /** Local profiles, used to show profile pictures. Photos never leave this phone. */
  profiles?: UserProfile[];
}

function ago(ms: number, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - ms) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

function PairingPanel({ pairing, defaultMeId }: { pairing: PairingUi; defaultMeId: string }) {
  const [meId, setMeId] = useState(defaultMeId);
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
        <p className="text-xs text-muted mt-1">Only stats are shared (sessions per week, streak, volume, PRs), never your set-by-set logs.</p>
      </div>
      <label className="block text-xs text-muted">I am
        <select value={meId} onChange={(e) => setMeId(e.target.value)} className={`${input} ml-2`}>
          {pairing.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <button onClick={() => { setError(null); pairing.onCreate(meId); }} className={`${button} bg-accent text-on-accent w-full`}>Create a code</button>
      <div className="flex gap-2">
        <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Or enter partner's code" autoCapitalize="characters" autoCorrect="off" spellCheck={false} className={`${input} flex-1 min-w-0 font-mono`} aria-label="Partner code" />
        <button onClick={() => setError(pairing.onJoin(joinCode, meId))} className={`${button} bg-sunk text-ink`}>Join</button>
      </div>
      {error && <p role="alert" className="text-xs text-bad">{error}</p>}
    </section>
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
  if (s.daysSinceLast === 0) return { text: 'Trained today', warn: false };
  if (s.daysSinceLast === 1) return { text: 'Trained yesterday', warn: false };
  return { text: `${s.daysSinceLast} days since last session`, warn: s.daysSinceLast >= 4 };
}

export function TogetherTab({ board, youId, pairing, profiles }: TogetherTabProps) {
  const personFor = (s: PartnerStats) => profiles?.find((p) => p.id === s.profileId) ?? { id: s.profileId, name: s.name };
  if (!board) return <p className="text-sm text-muted p-4">Loading partners…</p>;
  const defaultMeId = pairing.profiles.find((p) => p.id === youId)?.id ?? pairing.profiles[0]?.id ?? '';
  if (board.ranked.length < 2) {
    return (
      <div className="space-y-4">
        <PairingPanel pairing={pairing} defaultMeId={defaultMeId} />
        <div className="card p-6 text-center">
          <Users className="w-8 h-8 text-accent-ink mx-auto" />
          <p className="font-black text-ink mt-2">{pairing.code ? 'Waiting for your partner' : 'Add a training partner'}</p>
          <p className="text-xs text-muted mt-1">{pairing.code ? 'Send them the code above. Once their phone joins, the leaderboard appears here.' : 'Link a partner to unlock the shared leaderboard.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PairingPanel pairing={pairing} defaultMeId={defaultMeId} />
      <section className="grid grid-cols-2 gap-3">
        {board.ranked.map((s) => {
          const last = lastTrained(s);
          const isYou = s.profileId === youId;
          return (
            <div key={s.profileId} className={`bg-surface border rounded-3xl p-4 flex flex-col items-center text-center ${isYou ? 'border-accent/60' : 'border-line'}`}>
              <div className="mb-1"><Avatar profile={personFor(s)} size={44} decorative /></div>
              <p className="font-black text-ink truncate max-w-full">{s.name}{isYou && <span className="text-accent-ink text-xs ml-1 align-middle">YOU</span>}</p>
              <div className="mt-2">
                <ProgressRing value={s.weeklyCount} max={s.weeklyGoal} size={72}>
                  <span className="font-mono text-sm font-black text-ink">{s.weeklyCount}/{s.weeklyGoal}</span>
                </ProgressRing>
              </div>
              <p className="text-xs text-muted mt-1">this week</p>
              <p className="text-xs text-ink-2 mt-2 flex items-center gap-1">
                {s.streakWeeks > 0 ? <StreakLabel weeks={s.streakWeeks} /> : 'No streak yet'}
              </p>
              <p className={`text-xs mt-1 ${last.warn ? 'text-bad' : 'text-muted'}`}>{last.text}</p>
              {s.syncedAt !== undefined && <p className="text-xs text-muted mt-0.5">synced {ago(s.syncedAt)}</p>}
              <p className="text-xs text-muted mt-1 font-mono">Wk {s.currentWeek} · Day {s.currentDay}</p>
            </div>
          );
        })}
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
