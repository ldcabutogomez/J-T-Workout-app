import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { UserProfile, WorkoutSession } from './types';
import { dbService } from './storage/db';
import { getDayPrescription } from './engine/jnt2Engine';
import {
  chooseBackoffLoad,
  createWorkoutSession,
  finalizeSession,
  logSet,
  makeSkippedSession,
  undoSet,
} from './engine/sessionEngine';
import { generateSessionEncouragement } from './engine/encouragement';
import { TodayTab } from './components/TodayTab';
import { ProgramTab } from './components/ProgramTab';
import { ProgressTab } from './components/ProgressTab';
import { SettingsTab } from './components/SettingsTab';
import { VerificationTab } from './components/VerificationTab';
import { RestTimer } from './components/RestTimer';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import { CalendarDays, Dumbbell, Settings, ShieldCheck, TrendingUp } from 'lucide-react';

type Tab = 'today' | 'program' | 'progress' | 'settings' | 'verify';

function blankProfile(id: string, name: string): UserProfile {
  return {
    id,
    name,
    unit: 'lb',
    equipmentIncrement: 5,
    barbellWeight: 45,
    tone: 'warm',
    currentWeek: 1,
    currentDay: 1,
    trainingMaxes: {},
    weeklyGoalSessions: 4,
    theme: 'dark',
  };
}

export default function App() {
  const [tab, setTab] = useState<Tab>('today');
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState('');
  const [activeSession, setActiveSession] = useState<WorkoutSession | null>(null);
  const activeSessionRef = useRef<WorkoutSession | null>(null);
  const [history, setHistory] = useState<WorkoutSession[]>([]);
  const [banner, setBanner] = useState<{ text: string; error?: boolean } | null>(null);

  const profile = useMemo(
    () => profiles.find((item) => item.id === activeProfileId) ?? profiles[0] ?? null,
    [profiles, activeProfileId],
  );

  const showBanner = (text: string, error = false) => {
    setBanner({ text, error });
    window.setTimeout(() => setBanner(null), error ? 7000 : 4500);
  };

  useEffect(() => {
    void (async () => {
      try {
        await dbService.init();
        let stored = await dbService.getProfiles();
        if (!stored.length) {
          stored = [blankProfile('partner-1', 'Partner 1'), blankProfile('partner-2', 'Partner 2')];
          await Promise.all(stored.map((item) => dbService.saveProfile(item)));
        }
        setProfiles(stored);
        setActiveProfileId(stored[0].id);
      } catch (error) {
        showBanner((error as Error).message, true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    activeSessionRef.current = null;
    setActiveSession(null);
    setHistory([]);
    void (async () => {
      try {
        const [active, records] = await Promise.all([
          dbService.getActiveSession(profile.id),
          dbService.getSessionHistory(profile.id, true),
        ]);
        if (cancelled) return;
        activeSessionRef.current = active;
        setActiveSession(active);
        setHistory(records);
      } catch (error) {
        if (!cancelled) showBanner((error as Error).message, true);
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.id]);

  const persistActive = async (session: WorkoutSession) => {
    activeSessionRef.current = session;
    setActiveSession(session);
    try {
      await dbService.saveActiveSession(session);
    } catch (error) {
      showBanner(`Autosave failed: ${(error as Error).message}`, true);
      throw error;
    }
  };

  const startWorkout = async () => {
    if (!profile) return;
    if (profile.cycleCompleted) {
      showBanner('This profile has reached the end of Week 12. Export a backup before starting another cycle.', true);
      return;
    }
    try {
      const prescription = getDayPrescription(profile.currentWeek, profile.currentDay, profile);
      const session = createWorkoutSession(profile, prescription);
      await persistActive(session);
      showBanner(`Started Week ${profile.currentWeek}, Day ${profile.currentDay}.`);
    } catch (error) {
      showBanner((error as Error).message, true);
      setTab('program');
    }
  };

  const handleLogSet = async (
    slotId: string,
    setId: string,
    reps: number,
    load: number,
    rir: number,
    amrapDeclined = false,
  ) => {
    const current = activeSessionRef.current;
    if (!current) return;
    try {
      const updated = logSet(current, slotId, setId, reps, load, rir, Date.now(), amrapDeclined);
      await persistActive(updated);
      const exercise = updated.exercises.find((item) => item.slotId === slotId);
      if (exercise?.manualLoadDecisionPending) showBanner(exercise.rmMismatchWarning ?? 'Choose a back-off load.', true);
    } catch (error) {
      showBanner((error as Error).message, true);
    }
  };

  const handleUndoSet = async (slotId: string, setId: string) => {
    const current = activeSessionRef.current;
    if (!current) return;
    try {
      await persistActive(undoSet(current, slotId, setId));
    } catch (error) {
      showBanner((error as Error).message, true);
    }
  };

  const handleBackoffDecision = async (slotId: string, load: number) => {
    const current = activeSessionRef.current;
    if (!current) return;
    try {
      await persistActive(chooseBackoffLoad(current, slotId, load));
      showBanner(`Explicit back-off load saved at ${load} ${current.settingsSnapshot.unit}.`);
    } catch (error) {
      showBanner((error as Error).message, true);
    }
  };

  const finishWorkout = async () => {
    if (!profile || !activeSessionRef.current) return;
    let completed = finalizeSession(activeSessionRef.current);
    if (completed.isPartial && !window.confirm('Some prescribed sets are unfinished or a back-off decision is pending. Save this as a partial session and advance once?')) return;
    completed.isEditingCompleted = false;
    completed.encouragementMessage = generateSessionEncouragement({
      tone: profile.tone,
      history,
      currentSession: completed,
      weeklyGoalSessions: profile.weeklyGoalSessions,
    });
    try {
      const result = await dbService.completeAndAdvance(completed, profile);
      setProfiles((items) => items.map((item) => item.id === result.profile.id ? result.profile : item));
      activeSessionRef.current = null;
      setActiveSession(null);
      setHistory(await dbService.getSessionHistory(profile.id, true));
      showBanner(completed.encouragementMessage || (result.advanced ? 'Workout saved and program position advanced.' : 'Completed session edits saved without advancing again.'));
    } catch (error) {
      showBanner((error as Error).message, true);
    }
  };

  const skipSession = async () => {
    if (!profile || profile.cycleCompleted) return;
    if (!window.confirm(`Record Week ${profile.currentWeek}, Day ${profile.currentDay} as skipped and advance once?`)) return;
    try {
      const skipped = makeSkippedSession(profile, getDayPrescription(profile.currentWeek, profile.currentDay, profile));
      skipped.encouragementMessage = generateSessionEncouragement({ tone: profile.tone, history, currentSession: skipped });
      const result = await dbService.completeAndAdvance(skipped, profile);
      setProfiles((items) => items.map((item) => item.id === result.profile.id ? result.profile : item));
      setHistory(await dbService.getSessionHistory(profile.id, true));
      showBanner('Skipped session recorded; program position advanced once.');
    } catch (error) {
      showBanner((error as Error).message, true);
    }
  };

  const discardActive = async () => {
    if (!profile || !activeSessionRef.current) return;
    const label = activeSessionRef.current.isEditingCompleted ? 'Discard these history edits?' : 'Discard this unfinished workout?';
    if (!window.confirm(label)) return;
    try {
      await dbService.clearActiveSession(profile.id);
      activeSessionRef.current = null;
      setActiveSession(null);
      showBanner('Active draft discarded.');
    } catch (error) {
      showBanner((error as Error).message, true);
    }
  };

  const editCompletedSession = async (session: WorkoutSession) => {
    if (activeSessionRef.current && !window.confirm('Replace the current unfinished draft with this historical session?')) return;
    const editing = { ...session, status: 'active' as const, isEditingCompleted: true, updatedTime: Date.now() };
    try {
      await persistActive(editing);
      setTab('today');
      showBanner('Editing a completed session. Saving it will not advance the program again.');
    } catch (error) {
      showBanner((error as Error).message, true);
    }
  };

  const updateProfile = async (updated: UserProfile) => {
    try {
      await dbService.saveProfile(updated);
      setProfiles((items) => items.map((item) => item.id === updated.id ? updated : item));
    } catch (error) {
      showBanner((error as Error).message, true);
    }
  };

  const refreshAfterImport = async () => {
    const refreshed = await dbService.getProfiles();
    setProfiles(refreshed);
    if (!refreshed.some((item) => item.id === activeProfileId)) setActiveProfileId(refreshed[0]?.id ?? '');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      <OfflineIndicator />
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-3 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-display font-black text-lg text-amber-400 whitespace-nowrap">J&amp;T 2.0</span>
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-0.5 overflow-x-auto max-w-[48vw]">
            {profiles.map((item) => (
              <button key={item.id} onClick={() => setActiveProfileId(item.id)} className={`px-2.5 py-1 text-xs font-bold rounded-lg whitespace-nowrap ${item.id === profile?.id ? 'bg-amber-500 text-slate-950' : 'text-slate-400'}`}>
                {item.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <PWAInstallButton activeWorkout={Boolean(activeSession)} />
          <button onClick={() => setTab('verify')} className="p-2 rounded-xl bg-emerald-950 border border-emerald-800 text-emerald-300" aria-label="Workbook mapping and engine checks" title="Workbook mapping and engine checks">
            <ShieldCheck className="w-4 h-4" />
          </button>
        </div>
      </header>

      {banner && <div role={banner.error ? 'alert' : 'status'} className={`sticky top-[57px] z-20 px-4 py-2 text-xs font-bold text-center ${banner.error ? 'bg-rose-500 text-white' : 'bg-amber-500 text-slate-950'}`}>{banner.text}</div>}

      <main className="flex-1 p-3 sm:p-4 pb-28 max-w-xl mx-auto w-full">
        {tab === 'today' && <TodayTab profile={profile} activeSession={activeSession} onStartWorkout={startWorkout} onLogSet={handleLogSet} onUndoSet={handleUndoSet} onBackoffDecision={handleBackoffDecision} onCompleteWorkout={finishWorkout} onDiscardActiveWorkout={discardActive} onSkipSession={skipSession} />}
        {tab === 'program' && <ProgramTab profile={profile} onUpdateProfile={updateProfile} />}
        {tab === 'progress' && <ProgressTab profile={profile} history={history} onEditSession={editCompletedSession} onDeleteSession={async (id, demo) => {
          if (!profile || !window.confirm('Delete this session record? This cannot be undone.')) return;
          try {
            await dbService.deleteSession(id, demo);
            setHistory(await dbService.getSessionHistory(profile.id, true));
            showBanner('Session deleted.');
          } catch (error) { showBanner((error as Error).message, true); }
        }} />}
        {tab === 'settings' && <SettingsTab profiles={profiles} activeProfileId={profile?.id ?? ''} activeSession={activeSession} onSelectProfile={setActiveProfileId} onUpdateProfile={updateProfile} onExportBackup={async () => {
          try {
            const blob = new Blob([await dbService.exportBackup()], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `jnt2-backup-${new Date().toISOString().slice(0, 10)}.json`;
            anchor.click();
            URL.revokeObjectURL(url);
          } catch (error) { showBanner((error as Error).message, true); }
        }} onImportBackup={async (json, replace) => {
          const result = await dbService.importBackup(json, replace ? 'replace-all' : 'reject-duplicates');
          if (result.success) await refreshAfterImport();
          return result;
        }} />}
        {tab === 'verify' && <VerificationTab />}
      </main>

      <RestTimer />
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-slate-900/95 border-t border-slate-800 py-2 px-3 flex justify-around max-w-xl mx-auto" aria-label="Primary navigation">
        <NavButton active={tab === 'today'} label="Today" icon={<Dumbbell className="w-5 h-5" />} onClick={() => setTab('today')} />
        <NavButton active={tab === 'program'} label="Program" icon={<CalendarDays className="w-5 h-5" />} onClick={() => setTab('program')} />
        <NavButton active={tab === 'progress'} label="Progress" icon={<TrendingUp className="w-5 h-5" />} onClick={() => setTab('progress')} />
        <NavButton active={tab === 'settings'} label="Settings" icon={<Settings className="w-5 h-5" />} onClick={() => setTab('settings')} />
      </nav>
    </div>
  );
}

function NavButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className={`flex flex-col items-center justify-center min-w-16 min-h-12 text-[11px] ${active ? 'text-amber-400 font-bold' : 'text-slate-400'}`}>{icon}<span className="mt-1">{label}</span></button>;
}
