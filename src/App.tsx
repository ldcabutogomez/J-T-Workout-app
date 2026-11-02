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
  swapExercise,
  undoSet,
} from './engine/sessionEngine';
import { findAllComparableResults, generateSessionEncouragement, isVerifiedCycleComplete } from './engine/encouragement';
import { findAlternative, swapKey } from './program/swapOptions';
import { BADGES, computeHighlights, computeStreak, evaluateBadges, newlyUnlocked } from './engine/achievements';
import { haptic, setFeedbackPrefs } from './lib/feedback';
import { feedback } from './lib/feedback';
import { exerciseDoneKey, hasDelivered, markDelivered, pickPrimaryCelebration, prRewardKey } from './lib/rewards';
import { TogetherTab, type SyncStatus } from './components/TogetherTab';
import { composeBoard, snapshotFromHistory, weekKey, type PartnerSnapshot } from './engine/leaderboard';
import { fmtCount, meetsGoal, sessionCredit, validCompleted, weekStart } from './engine/sessionValidity';
import { catchUp, defaultSchedule, doneSlots, missedCount, mondayOf, moveWorkout, nextWorkout, positionAfter, slotDate, todayKey, weekAgenda, weeksBehind, withTrainingDays, type NextWorkout, type Slot } from './engine/schedule';
import { WeekCalendar } from './components/WeekCalendar';
import { WeekStrip } from './components/WeekStrip';
import { MoveSheet } from './components/MoveSheet';
import { clearPairing, describeKey, generatePairCode, getDeviceId, loadPairing, normalizePairCode, pullSnapshots, pushSnapshot, readCloudConfig, savePairing, saveSyncProfile, testConnection } from './sync/cloud';
import { TodayTab } from './components/TodayTab';
import { ProgramTab } from './components/ProgramTab';
import { ProgressTab } from './components/ProgressTab';
import { SettingsTab } from './components/SettingsTab';
import { VerificationTab } from './components/VerificationTab';
import { RestTimer, type RestRequest } from './components/RestTimer';
import { ToastStack, type ToastItem } from './components/Toast';
import { WorkoutSummary, type WorkoutSummaryData } from './components/WorkoutSummary';
import { PWAInstallButton } from './components/PWAInstallButton';
import { Avatar } from './components/Avatar';
import { nudgeMessage, postWorkoutMessage, todayCandidates, type NudgeKind } from './engine/coach';
import { loadSeen, markSeen } from './lib/coachSeen';
import { applyTheme, defaultThemeForId, themeForProfile } from './lib/theme';
import { OfflineIndicator } from './components/OfflineIndicator';
import { CalendarDays, Dumbbell, Settings, ShieldCheck, TrendingUp, Users } from 'lucide-react';

type Tab = 'today' | 'program' | 'progress' | 'together' | 'settings' | 'verify';

const ACTIVE_PROFILE_KEY = 'jnt2_active_profile';

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
    colorTheme: defaultThemeForId(id),
  };
}

export default function App() {
  const [tab, setTab] = useState<Tab>('today');
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState('');
  const [activeSession, setActiveSession] = useState<WorkoutSession | null>(null);
  const activeSessionRef = useRef<WorkoutSession | null>(null);
  const [history, setHistory] = useState<WorkoutSession[]>([]);
  const cloudConfig = useMemo(() => readCloudConfig(), []);
  const deviceId = useMemo(() => getDeviceId(), []);
  const [pairing, setPairing] = useState(() => loadPairing());
  const [remote, setRemote] = useState<PartnerSnapshot[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: 'idle' });
  const syncing = useRef(false);
  const syncPending = useRef(false);
  const [coachTick, setCoachTick] = useState(0);
  const [today, setToday] = useState(() => todayKey());
  const [moveSlot, setMoveSlot] = useState<Slot | null>(null);
  const [historyReady, setHistoryReady] = useState(false);
  const [connection, setConnection] = useState<{ state: 'idle' | 'testing' | 'ok' | 'error'; message?: string }>({ state: 'idle' });
  const [partnerHistory, setPartnerHistory] = useState<Record<string, WorkoutSession[]> | null>(null);
  const [banner, setBanner] = useState<{ text: string; error?: boolean } | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [summary, setSummary] = useState<WorkoutSummaryData | null>(null);
  const [restRequest, setRestRequest] = useState<RestRequest | null>(null);
  const toastId = useRef(0);

  const profile = useMemo(
    () => profiles.find((item) => item.id === activeProfileId) ?? profiles[0] ?? null,
    [profiles, activeProfileId],
  );

  const showBanner = (text: string, error = false) => {
    setBanner({ text, error });
    window.setTimeout(() => setBanner(null), error ? 7000 : 4500);
  };

  const showToast = (text: string, tone: ToastItem['tone'] = 'default') => {
    const id = ++toastId.current;
    setToasts((items) => [...items, { id, text, tone }].slice(-2));
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3200);
  };

  useEffect(() => {
    if (!profile) return;
    try { localStorage.setItem(ACTIVE_PROFILE_KEY, profile.id); } catch { /* remembering is best effort */ }
  }, [profile?.id]);

  useEffect(() => {
    if (profile) applyTheme(themeForProfile(profile));
  }, [profile?.id, profile?.colorTheme]);

  useEffect(() => {
    setFeedbackPrefs({
      haptics: profile?.hapticsEnabled ?? true,
      sound: profile?.soundEnabled ?? true,
    });
  }, [profile?.hapticsEnabled, profile?.soundEnabled]);

  useEffect(() => {
    void (async () => {
      try {
        await dbService.init();
        let stored = await dbService.getProfiles();
        if (!stored.length) {
          stored = [blankProfile('partner-1', 'Lauren'), blankProfile('partner-2', 'Luis')];
          await Promise.all(stored.map((item) => dbService.saveProfile(item)));
        }
        // One-time rename of the old placeholder names; any name the user chose is left alone.
        const renames: Record<string, [string, string]> = { 'partner-1': ['Partner 1', 'Lauren'], 'partner-2': ['Partner 2', 'Luis'] };
        stored = await Promise.all(stored.map(async (item) => {
          const [oldName, newName] = renames[item.id] ?? [];
          if (!oldName || item.name !== oldName) return item;
          const renamed = { ...item, name: newName };
          await dbService.saveProfile(renamed);
          return renamed;
        }));
        // One-time: give every profile a calendar, placed so its current training week is this calendar week.
        stored = await Promise.all(stored.map(async (item) => {
          if (item.schedule) return item;
          const past = await dbService.getSessionHistory(item.id, false);
          const withSchedule = { ...item, schedule: defaultSchedule(item, Date.now(), past) };
          await dbService.saveProfile(withSchedule);
          return withSchedule;
        }));
        setProfiles(stored);
        // Reopen on whoever used the app last, so each person's theme and data come back as they left them.
        let initialId = stored[0].id;
        try {
          const saved = localStorage.getItem(ACTIVE_PROFILE_KEY);
          if (saved && stored.some((item) => item.id === saved)) initialId = saved;
        } catch { /* falls back to the first profile */ }
        setActiveProfileId(initialId);
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
    setHistoryReady(false);
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
        setHistoryReady(true);
      } catch (error) {
        if (!cancelled) showBanner((error as Error).message, true);
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.id]);

  // Partner stats are read-only and rebuilt whenever the Together tab opens or the active history changes.
  useEffect(() => {
    if (tab !== 'together' || !profiles.length) return;
    let cancelled = false;
    void (async () => {
      try {
        const entries = await Promise.all(profiles.map(async (item) => [item.id, await dbService.getSessionHistory(item.id, false)] as const));
        if (!cancelled) setPartnerHistory(Object.fromEntries(entries));
      } catch (error) {
        if (!cancelled) showBanner((error as Error).message, true);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, profiles, history]);

  const meId = profiles.find((item) => item.id === pairing.profileId)?.id ?? null;
  const paired = Boolean(cloudConfig && pairing.code && meId);
  const latest = useRef({ profiles, code: pairing.code, meId });
  latest.current = { profiles, code: pairing.code, meId };

  /** Pushes this phone's stats-only snapshot, then pulls the partner's. Safe to call any time; failures just show a status. */
  const syncNow = async () => {
    const { profiles: current, code, meId: me } = latest.current;
    const mine = current.find((item) => item.id === me);
    if (!cloudConfig || !code || !mine) return;
    if (syncing.current) { syncPending.current = true; return; }
    syncing.current = true;
    setSyncStatus((prev) => ({ ...prev, state: 'syncing' }));
    try {
      const myHistory = await dbService.getSessionHistory(mine.id, false);
      const now = Date.now();
      const snapshot = snapshotFromHistory(mine, myHistory, now, deviceId);
      await pushSnapshot(cloudConfig, code, snapshot);
      const lastPushed = { volumeLb: snapshot.volumeLb, sessions: snapshot.sessionsCompleted, partial: snapshot.partialSessions ?? 0, weekCount: snapshot.weekly[weekKey(weekStart(now))] ?? 0 };
      setSyncStatus((prev) => ({ ...prev, lastPushAt: now, lastPushed }));
      const all = await pullSnapshots(cloudConfig, code);
      const others = all.filter((item) => item.deviceId !== deviceId);
      setRemote(others);
      setSyncStatus({ state: 'ok', at: Date.now(), lastPushAt: now, lastPullAt: Date.now(), remoteCount: others.length, lastPushed });
    } catch (error) {
      const message = typeof navigator !== 'undefined' && navigator.onLine === false ? 'Offline. Will retry when you are back online.' : (error as Error).message;
      setSyncStatus((prev) => ({ ...prev, state: 'error', error: message, at: prev.at }));
    } finally {
      syncing.current = false;
      // A sync requested while one was running (for example a workout finishing) runs again with fresh data.
      if (syncPending.current) { syncPending.current = false; window.setTimeout(() => void syncNow(), 0); }
    }
  };

  // Push after anything that changes this phone's stats (workout finished, badge earned, profile edited).
  useEffect(() => {
    if (!paired) return;
    const timer = window.setTimeout(() => void syncNow(), 1500);
    return () => window.clearTimeout(timer);
  }, [paired, pairing.code, meId, history, profiles]);

  // Refresh when the app returns to the foreground or the network comes back, and poll while the Together tab is open.
  useEffect(() => {
    if (!paired) return;
    const refresh = () => { if (document.visibilityState === 'visible') void syncNow(); };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    const timer = tab === 'together' ? window.setInterval(refresh, 60_000) : undefined;
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [paired, tab]);

  const leaderboard = useMemo(() => {
    if (!partnerHistory) return null;
    // Your own row always comes from local history, so it shows right after a workout, paired or not.
    return composeBoard({ profiles, historyByProfile: partnerHistory, pairedProfileId: paired ? meId : null, remote });
  }, [profiles, partnerHistory, paired, meId, remote]);

  const pairingUi = {
    configured: Boolean(cloudConfig),
    code: paired ? pairing.code : null,
    profiles: profiles.map((item) => ({ id: item.id, name: item.name })),
    status: syncStatus,
    onCreate: (me: string) => {
      const code = generatePairCode();
      savePairing(code, me);
      setPairing({ code, profileId: me });
      setRemote([]);
    },
    onJoin: (input: string, me: string) => {
      const code = normalizePairCode(input);
      if (!code) return 'That code does not look right. It is 10 letters and numbers.';
      savePairing(code, me);
      setPairing({ code, profileId: me });
      setRemote([]);
      return null;
    },
    onUnlink: () => {
      clearPairing();
      setPairing({ code: null, profileId: null });
      setRemote([]);
      setSyncStatus({ state: 'idle' });
    },
    onSyncNow: () => void syncNow(),
    diagnostics: cloudConfig ? {
      host: (() => { try { return new URL(cloudConfig.url).host; } catch { return cloudConfig.url; } })(),
      keyType: describeKey(cloudConfig.anonKey),
      deviceId,
      pairedAs: profiles.find((item) => item.id === pairing.profileId)?.name ?? null,
      trainingAs: profile?.name ?? null,
      trainingAsId: profile?.id ?? null,
      mismatch: Boolean(paired && profile && profile.id !== meId),
      connection,
    } : undefined,
    onTestConnection: async () => {
      if (!cloudConfig) return;
      setConnection({ state: 'testing' });
      try {
        await testConnection(cloudConfig);
        setConnection({ state: 'ok', message: 'Connected. The server accepted the key and the sync functions respond.' });
      } catch (error) {
        setConnection({ state: 'error', message: (error as Error).message });
      }
    },
    onRepairAs: (profileId: string) => {
      saveSyncProfile(profileId);
      setPairing((current) => ({ ...current, profileId }));
      setRemote([]);
    },
  };

  // The calendar: where each workout sits, and which one to do next.
  useEffect(() => {
    const refresh = () => setToday(todayKey());
    document.addEventListener('visibilitychange', refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => { document.removeEventListener('visibilitychange', refresh); window.clearInterval(timer); };
  }, []);
  const schedule = useMemo(() => (profile ? profile.schedule ?? defaultSchedule(profile) : null), [profile]);
  const nextSlot: NextWorkout | null = useMemo(() => {
    if (!profile || !schedule) return null;
    // Until history has loaded, trust the saved pointer so the screen never flashes Week 1.
    if (!historyReady) return profile.cycleCompleted ? null : { week: profile.currentWeek, day: profile.currentDay, date: today, reason: 'upcoming' };
    return nextWorkout(schedule, history, today);
  }, [profile, schedule, history, historyReady, today]);
  const missed = useMemo(() => (schedule && historyReady ? missedCount(schedule, history, today) : 0), [schedule, history, historyReady, today]);
  const sheetData = useMemo(() => {
    if (!moveSlot || !schedule) return null;
    const days = weekAgenda(schedule, history, mondayOf(slotDate(schedule, moveSlot.week, moveSlot.day)), today);
    const item = days.flatMap((day) => day.items).find((entry) => entry.week === moveSlot.week && entry.day === moveSlot.day);
    return item ? { item, days } : null;
  }, [moveSlot, schedule, history, today]);

  // The Today coach card: welcome back, phase milestone, weekly recap, or the day's pre-workout line.
  const coachQueue = useMemo(() => {
    if (!profile || activeSession || profile.cycleCompleted || !nextSlot) return [];
    const prescription = getDayPrescription(nextSlot.week, nextSlot.day, profile);
    const seen = loadSeen(profile.id);
    const finishedInWeek = [...doneSlots(history).keys()].some((key) => key.startsWith(`W${nextSlot.week}D`));
    return todayCandidates({
      now: Date.now(),
      tone: profile.tone,
      name: profile.name,
      profileId: profile.id,
      unit: profile.unit,
      weeklyGoal: profile.weeklyGoalSessions ?? 4,
      history,
      week: nextSlot.week,
      day: nextSlot.day,
      firstOfWeek: !finishedInWeek,
      mainLift: prescription.exercises[0]?.exerciseName ?? 'your main lift',
    }).filter((message) => !seen.has(message.id));
  }, [profile, activeSession, history, coachTick, nextSlot]);
  const coachMessage = coachQueue[0] ?? null;
  // Dismissing clears everything queued for now, so one tap makes the card go away instead of showing the next message.
  const dismissCoach = () => {
    if (profile) coachQueue.forEach((message) => markSeen(profile.id, message.id));
    setCoachTick((value) => value + 1);
  };

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

  /** Starts the next workout, or a specific one picked from the calendar. */
  const startWorkout = async (week?: unknown, day?: unknown) => {
    if (!profile) return;
    if (activeSessionRef.current) {
      showBanner('Finish or discard your current workout before starting another.', true);
      return;
    }
    const slot = typeof week === 'number' && typeof day === 'number' ? { week, day } : nextSlot;
    if (!slot) {
      showBanner('This profile has reached the end of Week 12. Export a backup before starting another cycle.', true);
      return;
    }
    try {
      const prescription = getDayPrescription(slot.week, slot.day, profile);
      const session = createWorkoutSession(profile, prescription, Date.now(), false, history);
      await persistActive(session);
      showBanner(`Started Week ${slot.week}, Day ${slot.day}.`);
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
      let updated = logSet(current, slotId, setId, reps, load, rir, Date.now(), amrapDeclined);
      const exercise = updated.exercises.find((item) => item.slotId === slotId);

      // A top set that beats the all-time best earns a PR moment, once per exact result.
      const topSet = exercise?.sets.find((item) => item.completed && (item.type === 'rm_target' || item.type === 'test'));
      const pr = exercise && topSet?.setId === setId && !updated.isEditingCompleted
        ? findAllComparableResults(updated, history).find((r) => r.exerciseId === exercise.exerciseId && r.kind === 'all_time_pr')
        : undefined;
      const prKey = pr ? prRewardKey(pr) : null;
      const freshPr = pr && prKey && !hasDelivered(updated, prKey) ? pr : undefined;
      if (prKey && freshPr) updated = markDelivered(updated, prKey);

      // Finishing an exercise's last set earns one quiet transition.
      const doneKey = exerciseDoneKey(slotId);
      const freshDone = Boolean(exercise && exercise.sets.length > 0 && exercise.sets.every((item) => item.completed)
        && !updated.isEditingCompleted && !hasDelivered(updated, doneKey));
      if (freshDone) updated = markDelivered(updated, doneKey);

      // A short coach nudge at the halfway point, the last set, or after an all-out (RIR 0) set, once each per workout.
      let nudge: string | null = null;
      if (!freshPr && !updated.isEditingCompleted && profile) {
        const allSets = updated.exercises.flatMap((item) => item.sets);
        const doneCount = allSets.filter((item) => item.completed).length;
        const due: Array<[NudgeKind, boolean]> = [
          ['last_set', allSets.length - doneCount === 1],
          ['halfway', allSets.length >= 6 && doneCount * 2 >= allSets.length],
          ['hard_set', rir === 0],
        ];
        const pick = due.find(([kind, ready]) => ready && !hasDelivered(updated, `nudge:${kind}`));
        if (pick) {
          nudge = nudgeMessage(pick[0], { tone: profile.tone, name: profile.name, profileId: profile.id, seed: updated.sessionId, exercise: exercise?.exerciseName });
          updated = markDelivered(updated, `nudge:${pick[0]}`);
        }
      }

      await persistActive(updated);
      if (exercise?.manualLoadDecisionPending) showBanner(exercise.rmMismatchWarning ?? 'Choose a back-off load.', true);

      if (freshPr) {
        feedback('pr');
        showToast(`New PR! ${freshPr.exerciseName} ${freshPr.reps} × ${Number(freshPr.load.toFixed(2))} ${freshPr.unit}`, 'pr');
      } else if (nudge) {
        haptic('setLogged');
        showToast(nudge);
      } else if (freshDone && exercise) {
        haptic('exerciseDone');
        showToast(`${exercise.exerciseName} complete · ${exercise.sets.length}/${exercise.sets.length} sets`);
      } else {
        haptic('setLogged');
      }

      const allDone = updated.exercises.every((item) => item.sets.every((set) => set.completed));
      if (profile?.autoStartRest && exercise && !allDone && !updated.isEditingCompleted) {
        const seconds = exercise.tier === 'T1' ? 240 : exercise.tier.startsWith('T2') ? 150 : 90;
        setRestRequest((prev) => ({ id: (prev?.id ?? 0) + 1, seconds }));
      }
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

  const handleSwapExercise = async (slotId: string, originalExerciseId: string, alternativeId: string) => {
    if (!profile) return;
    const swaps = { ...(profile.exerciseSwaps ?? {}) };
    const key = swapKey(slotId, originalExerciseId);
    if (alternativeId) swaps[key] = alternativeId; else delete swaps[key];
    const updatedProfile = { ...profile, exerciseSwaps: swaps };
    try {
      const current = activeSessionRef.current;
      if (current) await persistActive(swapExercise(current, slotId, updatedProfile));
      await updateProfile(updatedProfile);
      haptic('select');
      const name = alternativeId ? findAlternative(alternativeId)?.alternative.name : undefined;
      showToast(name ? `Swapped to ${name}` : 'Back to the program exercise');
    } catch (error) {
      showBanner((error as Error).message, true);
    }
  };

  const handleToggleWarmup = async (slotId: string, stepId: string) => {
    const current = activeSessionRef.current;
    if (!current) return;
    const exercises = current.exercises.map((exercise) => {
      if (exercise.slotId !== slotId) return exercise;
      const done = exercise.warmupsDone ?? [];
      return { ...exercise, warmupsDone: done.includes(stepId) ? done.filter((id) => id !== stepId) : [...done, stepId] };
    });
    try {
      await persistActive({ ...current, exercises, updatedTime: Date.now() });
      haptic('select');
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
    const wasEditing = Boolean(activeSessionRef.current.isEditingCompleted);
    completed.isEditingCompleted = false;
    const celebrate = completed.status === 'completed' && !wasEditing;
    completed.encouragementMessage = generateSessionEncouragement({
      tone: profile.tone,
      history,
      currentSession: completed,
      weeklyGoalSessions: profile.weeklyGoalSessions,
    });
    // A finished workout gets a personal coach note (the 48-session cycle message keeps its own wording).
    if (celebrate && profile.tone !== 'off' && !isVerifiedCycleComplete(completed, history)) {
      const goal = profile.weeklyGoalSessions ?? 4;
      const others = history.filter((item) => item.sessionId !== completed.sessionId);
      const streakNow = computeStreak([...others, completed], goal);
      const trainedToday = remote.find((item) => item.lastSessionAt !== null && new Date(item.lastSessionAt).toDateString() === new Date().toDateString());
      const note = postWorkoutMessage({
        tone: profile.tone,
        name: profile.name,
        profileId: profile.id,
        unit: completed.settingsSnapshot.unit,
        weeklyGoal: goal,
        session: completed,
        isFirstWorkout: !others.some(validCompleted),
        highlights: computeHighlights(completed, history),
        streak: streakNow,
        weeklyGoalNewlyMet: meetsGoal(streakNow.weeklyCount, goal) && !meetsGoal(streakNow.weeklyCount - 1, goal),
        partnerName: trainedToday?.name,
      });
      if (note) completed.encouragementMessage = note;
    }
    try {
      const result = await dbService.completeAndAdvance(completed, profile, positionAfter(history, completed));
      let savedProfile = result.profile;
      activeSessionRef.current = null;
      setActiveSession(null);
      const updatedHistory = await dbService.getSessionHistory(profile.id, true);
      setHistory(updatedHistory);

      if (!wasEditing && completed.status !== 'skipped') {
        const goal = savedProfile.weeklyGoalSessions ?? 4;
        let newBadges: typeof BADGES = [];
        if (celebrate) {
          const unlocked = newlyUnlocked(evaluateBadges(completed, history, goal), savedProfile.unlockedBadges);
          if (unlocked.length) {
            savedProfile = { ...savedProfile, unlockedBadges: [...(savedProfile.unlockedBadges ?? []), ...unlocked] };
            await dbService.saveProfile(savedProfile);
            newBadges = BADGES.filter((badge) => unlocked.some((item) => item.id === badge.id));
          }
        }
        const nextTitle = savedProfile.cycleCompleted ? undefined : getDayPrescription(savedProfile.currentWeek, savedProfile.currentDay, savedProfile).title;
        const highlights = computeHighlights(completed, history);
        const streak = computeStreak(updatedHistory, goal);
        setSummary({
          title: `Week ${completed.week} · Day ${completed.day}`,
          message: completed.encouragementMessage ?? '',
          highlights,
          streak,
          newBadges,
          unit: completed.settingsSnapshot.unit,
          tone: savedProfile.tone,
          celebrate,
          partialNote: completed.status === 'partial'
            ? `Your ${highlights.setsCompleted} logged sets count toward your pounds lifted and PRs, and as ${fmtCount(sessionCredit(completed))} of a session toward your weekly goal.`
            : undefined,
          celebration: pickPrimaryCelebration({
            celebrate,
            cycleComplete: isVerifiedCycleComplete(completed, history),
            results: highlights.results,
            delivered: completed.rewardsDelivered ?? [],
            weeklyGoalNewlyMet: meetsGoal(streak.weeklyCount, goal) && !meetsGoal(streak.weeklyCount - sessionCredit(completed), goal),
            newBadgeCount: newBadges.length,
          }),
          nextTitle,
        });
      } else {
        showBanner(completed.encouragementMessage || (result.advanced ? 'Workout saved and program position advanced.' : 'Completed session edits saved without advancing again.'));
      }
      setProfiles((items) => items.map((item) => item.id === savedProfile.id ? savedProfile : item));
    } catch (error) {
      showBanner((error as Error).message, true);
    }
  };

  const skipSession = async (week?: unknown, day?: unknown) => {
    if (!profile) return;
    const slot = typeof week === 'number' && typeof day === 'number' ? { week, day } : nextSlot;
    if (!slot) return;
    if (!window.confirm(`Record Week ${slot.week}, Day ${slot.day} as skipped? It will be marked done in the program.`)) return;
    try {
      const skipped = makeSkippedSession(profile, getDayPrescription(slot.week, slot.day, profile));
      skipped.encouragementMessage = generateSessionEncouragement({ tone: profile.tone, history, currentSession: skipped });
      const result = await dbService.completeAndAdvance(skipped, profile, positionAfter(history, skipped));
      setProfiles((items) => items.map((item) => item.id === result.profile.id ? result.profile : item));
      setHistory(await dbService.getSessionHistory(profile.id, true));
      showBanner('Skipped workout recorded.');
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

  const handleMoveWorkout = async (slot: Slot, date: string) => {
    if (!profile || !schedule) return;
    const result = moveWorkout(schedule, history, slot, date, today);
    if (!result.ok) {
      showBanner(result.reason, true);
      return;
    }
    if (result.schedule !== schedule) await updateProfile({ ...profile, schedule: result.schedule });
    haptic('select');
    showToast(result.message);
  };

  const handleCatchUp = async () => {
    if (!profile || !schedule) return;
    await updateProfile({ ...profile, schedule: catchUp(schedule, history, today) });
    showToast('Plan moved to this week.');
  };

  const refreshAfterImport = async () => {
    const refreshed = await dbService.getProfiles();
    setProfiles(refreshed);
    if (!refreshed.some((item) => item.id === activeProfileId)) setActiveProfileId(refreshed[0]?.id ?? '');
  };

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col font-sans selection:bg-accent selection:text-on-accent">
      <OfflineIndicator />
      <header className="sticky top-0 z-30 bg-surface border-b border-line px-3 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-display font-black text-lg text-accent-ink whitespace-nowrap">J&amp;T 2.0</span>
          <div className="flex items-center bg-paper border border-line rounded-xl p-0.5 overflow-x-auto max-w-[62vw]">
            {profiles.map((item) => (
              <button key={item.id} onClick={() => setActiveProfileId(item.id)} className={`flex items-center gap-1.5 py-1 pl-1 pr-2.5 text-xs font-bold rounded-lg whitespace-nowrap ${item.id === profile?.id ? 'bg-accent text-on-accent' : 'text-muted'}`}>
                <span className={`flex rounded-full ${item.id === profile?.id ? 'ring-2 ring-on-accent' : ''}`}><Avatar profile={item} size={22} decorative /></span>
                {item.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <PWAInstallButton activeWorkout={Boolean(activeSession)} />
          <button onClick={() => setTab('verify')} className="p-2 rounded-xl bg-ok/10 border border-ok/40 text-ok" aria-label="Workbook mapping and engine checks" title="Workbook mapping and engine checks">
            <ShieldCheck className="w-4 h-4" />
          </button>
        </div>
      </header>

      {banner && <div role={banner.error ? 'alert' : 'status'} className={`sticky top-[57px] z-20 px-4 py-2 text-xs font-bold text-center ${banner.error ? 'bg-bad text-on-accent' : 'bg-ink text-paper'}`}>{banner.text}</div>}

      <main key={tab} className="flex-1 p-3 sm:p-4 pb-28 max-w-xl mx-auto w-full animate-fade-in">
        {tab === 'today' && <TodayTab profile={profile} activeSession={activeSession} onStartWorkout={startWorkout} onLogSet={handleLogSet} onUndoSet={handleUndoSet} onBackoffDecision={handleBackoffDecision} onCompleteWorkout={finishWorkout} onDiscardActiveWorkout={discardActive} onSkipSession={skipSession} onSwapExercise={handleSwapExercise} onToggleWarmup={handleToggleWarmup} next={nextSlot} missed={missed} onMoveNext={nextSlot ? () => setMoveSlot({ week: nextSlot.week, day: nextSlot.day }) : undefined} weekStrip={schedule ? <WeekStrip schedule={schedule} history={history} today={today} onOpen={() => setTab('program')} /> : null} coach={coachMessage} onDismissCoach={dismissCoach} history={history} streak={profile ? computeStreak(history, profile.weeklyGoalSessions ?? 4) : undefined} />}
        {tab === 'program' && (
          <div className="space-y-4">
            {schedule && <WeekCalendar schedule={schedule} history={history} today={today} onMove={handleMoveWorkout} onOpenMove={setMoveSlot} onCatchUp={handleCatchUp} />}
            <ProgramTab profile={profile} onUpdateProfile={updateProfile} />
          </div>
        )}
        {tab === 'progress' && <ProgressTab profile={profile} history={history} onEditSession={editCompletedSession} onDeleteSession={async (id, demo) => {
          if (!profile || !window.confirm('Delete this session record? This cannot be undone.')) return;
          try {
            await dbService.deleteSession(id, demo);
            setHistory(await dbService.getSessionHistory(profile.id, true));
            showBanner('Session deleted.');
          } catch (error) { showBanner((error as Error).message, true); }
        }} />}
        {tab === 'together' && <TogetherTab board={leaderboard} youId={paired ? (meId ?? '') : (profile?.id ?? '')} pairing={pairingUi} profiles={profiles} />}
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

      <RestTimer restRequest={restRequest} setsLogged={activeSession ? activeSession.exercises.reduce((sum, item) => sum + item.sets.filter((set) => set.completed).length, 0) : 0} />
      <ToastStack toasts={toasts} />
      {summary && <WorkoutSummary data={summary} onDone={() => { setSummary(null); setTab('today'); }} />}
      {moveSlot && sheetData && (
        <MoveSheet
          item={sheetData.item}
          days={sheetData.days}
          today={today}
          hasActiveWorkout={Boolean(activeSession)}
          onChoose={(date) => { const slot = moveSlot; setMoveSlot(null); void handleMoveWorkout(slot, date); }}
          onStart={() => { const slot = moveSlot; setMoveSlot(null); void startWorkout(slot.week, slot.day).then(() => setTab('today')); }}
          onSkip={() => { const slot = moveSlot; setMoveSlot(null); void skipSession(slot.week, slot.day); }}
          onClose={() => setMoveSlot(null)}
        />
      )}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-surface border-t border-line py-2 px-3 flex justify-around max-w-xl mx-auto" aria-label="Primary navigation">
        <NavButton active={tab === 'today'} label="Today" icon={<Dumbbell className="w-5 h-5" />} onClick={() => setTab('today')} />
        <NavButton active={tab === 'program'} label="Program" icon={<CalendarDays className="w-5 h-5" />} onClick={() => setTab('program')} />
        <NavButton active={tab === 'progress'} label="Progress" icon={<TrendingUp className="w-5 h-5" />} onClick={() => setTab('progress')} />
        <NavButton active={tab === 'together'} label="Together" icon={<Users className="w-5 h-5" />} onClick={() => setTab('together')} />
        <NavButton active={tab === 'settings'} label="Settings" icon={<Settings className="w-5 h-5" />} onClick={() => setTab('settings')} />
      </nav>
    </div>
  );
}

function NavButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} aria-current={active ? 'page' : undefined} className={`relative flex flex-col items-center justify-center min-w-16 min-h-14 text-xs ${active ? 'text-accent-ink font-bold' : 'text-muted'}`}>{active && <span aria-hidden className="absolute top-0 h-[3px] w-9 rounded-full bg-accent" />}{icon}<span className="mt-1">{label}</span></button>;
}
