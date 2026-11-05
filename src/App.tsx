import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { RunSession, UserProfile, WorkoutSession } from './types';
import { dbService } from './storage/db';
import { getDayPrescription } from './engine/jnt2Engine';
import {
  chooseBackoffLoad,
  createWorkoutSession,
  finalizeSession,
  logSet,
  makeSkippedSession,
  setExerciseNote,
  addExtraExercise,
  addExtraSet,
  removeExtraSet,
  removeExtraExercise,
  setSessionNote,
  swapExercise,
  clearSuggestedLoads,
  undoSet,
} from './engine/sessionEngine';
import { findAllComparableResults, generateSessionEncouragement, isVerifiedCycleComplete } from './engine/encouragement';
import { exerciseNameFor, swapKey } from './program/swapOptions';
import { BADGES, computeHighlights, computeStreak, evaluateBadges, evaluateDuoBadges, newlyUnlocked } from './engine/achievements';
import { levelBadges, levelFor } from './engine/xp';
import { batteryDebuff } from './engine/debuff';
import { useWakeLock } from './lib/wakeLock';
import { AppPrompts } from './components/AppPrompts';
import { findTopSet, programExercises } from './engine/extras';
import { NewCycleFlow } from './components/NewCycleFlow';
import { historyForCycle, profileCycleId } from './engine/cycles';
import { Onboarding } from './components/Onboarding';
import { StorageRecovery } from './components/StorageRecovery';
import { exportTextFile } from './lib/exportFile';
import { backupDue, clearImportSnapshot, lastBackupAt, loadImportSnapshot, recordBackup, saveImportSnapshot, snoozeBackupNudge } from './lib/backupStatus';
import { UpdateCard } from './components/UpdateCard';
import { useAppUpdate } from './lib/appUpdate';
import { NotificationsPanel } from './components/NotificationsPanel';
import { notifyPartner } from './sync/push';
import { TAUNT_COOLDOWN_MS, TAUNT_FRESH_MS, TAUNT_LEVEL, perksBetween, tauntText, tauntUnlocked, BATTERY_FLAIR } from './lib/perks';
import { haptic, installTapHaptics, setFeedbackPrefs } from './lib/feedback';
import { feedback } from './lib/feedback';
import { exerciseDoneKey, hasDelivered, markDelivered, pickPrimaryCelebration, prRewardKey } from './lib/rewards';
import { TogetherTab, type SyncStatus } from './components/TogetherTab';
import { CommunityFeed } from './components/CommunityFeed';
import { useCommunity } from './sync/useCommunity';
import { runActivity, workoutActivity } from './engine/activity';
import { composeBoard, snapshotFromHistory, weekKey, type PartnerSnapshot } from './engine/leaderboard';
import { fmtCount, meetsGoal, sessionCredit, validCompleted, weekStart } from './engine/sessionValidity';
import { catchUp, defaultSchedule, doneSlots, missedCount, mondayOf, moveWorkout, nextWorkout, positionAfter, slotDate, todayKey, weekAgenda, weeksBehind, withTrainingDays, type NextWorkout, type Slot } from './engine/schedule';
import { TrainingCalendar } from './components/TrainingCalendar';
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
import { RunLogSheet, type ManualRunInput } from './components/RunLogSheet';
import { newRunId, preferredRunUnit } from './engine/runs';
import { Avatar } from './components/Avatar';
import { WhoUsesPhone } from './components/WhoUsesPhone';
import { makeAvatarThumb } from './lib/avatar';
import { clearLock, readLock, resolveLock, writeLock } from './lib/lock';
import { nudgeMessage, postWorkoutMessage, todayCandidates, type NudgeKind } from './engine/coach';
import { loadSeen, markSeen } from './lib/coachSeen';
import { applyTheme, defaultThemeForId, themeForProfile } from './lib/theme';
import { OfflineIndicator } from './components/OfflineIndicator';
import { CalendarDays, Dumbbell, Settings, ShieldCheck, TrendingUp, Users } from 'lucide-react';

/** Coach messages are remembered per cycle, so a phase milestone can be celebrated again in the next run. */
const coachKey = (profile: UserProfile) => (profileCycleId(profile) === 'c1' ? profile.id : `${profile.id}:${profileCycleId(profile)}`);

type Tab = 'today' | 'program' | 'progress' | 'together' | 'settings' | 'verify';

export default function App() {
  const [tab, setTab] = useState<Tab>('today');
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [lockedId, setLockedId] = useState<string | null>(() => readLock());
  const [activeSession, setActiveSession] = useState<WorkoutSession | null>(null);
  const activeSessionRef = useRef<WorkoutSession | null>(null);
  const [history, setHistory] = useState<WorkoutSession[]>([]);
  const [runs, setRuns] = useState<RunSession[]>([]);
  const [runLogOpen, setRunLogOpen] = useState(false);
  const cloudConfig = useMemo(() => readCloudConfig(), []);
  const deviceId = useMemo(() => getDeviceId(), []);
  const [pairing, setPairing] = useState(() => loadPairing());
  const [remote, setRemote] = useState<PartnerSnapshot[]>([]);
  // Storage that cannot be opened gets a recovery screen, not an endless "Loading…". `initAttempt` re-runs the open.
  const [initError, setInitError] = useState<string | null>(null);
  const [initAttempt, setInitAttempt] = useState(0);
  // A phone with no profiles shows the setup wizard; `profilesLoaded` tells "none yet" apart from "still loading".
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [addingProfile, setAddingProfile] = useState(false);
  const [newCycleOpen, setNewCycleOpen] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [backupAt, setBackupAt] = useState<number | null>(() => lastBackupAt());
  const [backupNudgeHidden, setBackupNudgeHidden] = useState(false);
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

  // Whose phone this is. With no valid lock the chooser shows and no profile is open.
  const lock = useMemo(() => (profiles.length ? resolveLock(profiles.map((item) => item.id), lockedId) : null), [profiles, lockedId]);
  const profile = useMemo(
    () => (lock?.state === 'locked' ? profiles.find((item) => item.id === lock.id) ?? null : null),
    [profiles, lock],
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
    // A phone with exactly one profile has nothing to choose, so it locks to it.
    if (readLock() !== profile.id && profiles.length === 1) writeLock(profile.id);
  }, [profile?.id, profiles.length]);

  useEffect(() => {
    if (profile) applyTheme(themeForProfile(profile));
  }, [profile?.id, profile?.colorTheme]);

  useEffect(() => installTapHaptics(), []);

  useEffect(() => {
    setFeedbackPrefs({
      haptics: profile?.hapticsEnabled ?? true,
      sound: profile?.soundEnabled ?? true,
    });
  }, [profile?.hapticsEnabled, profile?.soundEnabled]);

  useEffect(() => {
    setInitError(null);
    void (async () => {
      try {
        await dbService.init();
        // Ask the browser not to evict this data when the phone is short on space. Best effort; it can say no.
        try {
          if (navigator.storage?.persist) await navigator.storage.persist();
          if (navigator.storage?.persisted) setPersisted(await navigator.storage.persisted());
        } catch { /* unsupported */ }
        let stored = await dbService.getProfiles();
        const aside = dbService.quarantinedCount();
        if (aside > 0) showBanner(`${aside} unreadable profile${aside === 1 ? ' was' : 's were'} set aside. Your other data is fine.`, true);
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
        setProfilesLoaded(true);
      } catch (error) {
        setInitError((error as Error).message || 'The local database could not be opened.');
      }
    })();
  }, [initAttempt]);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    activeSessionRef.current = null;
    setActiveSession(null);
    setHistory([]);
    setRuns([]);
    setHistoryReady(false);
    void (async () => {
      try {
        const [active, records, runRecords] = await Promise.all([
          dbService.getActiveSession(profile.id),
          dbService.getSessionHistory(profile.id, true),
          dbService.getRunHistory(profile.id),
        ]);
        if (cancelled) return;
        activeSessionRef.current = active;
        setActiveSession(active);
        setHistory(records);
        setRuns(runRecords);
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
        const entries = await Promise.all(profiles.filter((item) => item.id === profile?.id).map(async (item) => [item.id, await dbService.getSessionHistory(item.id, false)] as const));
        if (!cancelled) setPartnerHistory(Object.fromEntries(entries));
      } catch (error) {
        if (!cancelled) showBanner((error as Error).message, true);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, profiles, history]);

  // This phone's lifter is who it is locked to, so syncing never disagrees with the profile in use.
  const meId = profile?.id ?? null;
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
      // A photo chosen before partners could see it has no thumbnail yet: make it once and keep it on the profile.
      let me = mine;
      if (me.shareLive !== false && me.avatar?.photo && !me.avatar.thumb) {
        const thumb = await makeAvatarThumb(me.avatar.photo);
        if (thumb) {
          me = { ...me, avatar: { ...me.avatar, thumb } };
          await dbService.saveProfile(me);
          setProfiles((items) => items.map((item) => (item.id === me.id ? me : item)));
        }
      }
      const snapshot = snapshotFromHistory(me, myHistory, now, deviceId, { activeSession: activeSessionRef.current });
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

  // Tell your partner when a workout starts or ends, and as it progresses, at most once every 20 seconds.
  const liveKey = activeSession && !activeSession.isEditingCompleted
    ? `${activeSession.sessionId}:${activeSession.exercises.flatMap((exercise) => exercise.sets).filter((set) => set.completed).length}`
    : 'idle';
  const lastLive = useRef({ key: liveKey, at: 0 });
  useEffect(() => {
    if (!paired || profile?.shareLive === false) return;
    const previous = lastLive.current;
    if (previous.key === liveKey) return;
    const edge = previous.key === 'idle' || liveKey === 'idle';
    const wait = edge ? 1500 : Math.max(5000, 20_000 - (Date.now() - previous.at));
    const timer = window.setTimeout(() => {
      lastLive.current = { key: liveKey, at: Date.now() };
      void syncNow();
    }, wait);
    return () => window.clearTimeout(timer);
  }, [liveKey, paired, profile?.shareLive]);

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

  const community = useCommunity(cloudConfig, profile ?? null, history, async () => (profile ? dbService.getSessionHistory(profile.id, false) : []), deviceId);
  // Partner and community snapshots feed one board; a person in both appears once.
  const boardRemote = useMemo(() => {
    const seen = new Set(remote.map((item) => item.profileId));
    return [...remote, ...community.members.filter((item) => !seen.has(item.profileId))];
  }, [remote, community.members]);

  const leaderboard = useMemo(() => {
    if (!partnerHistory) return null;
    // Your own row always comes from local history, so it shows right after a workout, paired or not.
    return composeBoard({ profiles, historyByProfile: partnerHistory, pairedProfileId: meId, remote: boardRemote, now: Date.now() });
    // `today` ticks at midnight and on resume, so "Trained today" rolls over to "yesterday" on its own.
  }, [profiles, partnerHistory, meId, boardRemote, today]);

  const appUpdate = useAppUpdate();
  useWakeLock(Boolean(activeSession) && profile?.keepScreenOn !== false);
  const openNotifications = () => {
    setTab('settings');
    window.setTimeout(() => document.getElementById('notifications')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  };

  const battery = useMemo(() => (profile ? batteryDebuff(history, profile.weeklyGoalSessions ?? 4) : null), [history, profile?.weeklyGoalSessions]);
  const myLevel = useMemo(() => (profile ? levelFor(history, profile).level : 1), [history, profile]);

  // A taunt is a canned line chosen on one phone and shown on the other, carried in the sync snapshot.
  const sendTaunt = (tauntId: number) => {
    if (!profile || myLevel < TAUNT_LEVEL || !tauntUnlocked(tauntId, myLevel)) return;
    const wait = (profile.taunt?.at ?? 0) + TAUNT_COOLDOWN_MS - Date.now();
    if (wait > 0) { showToast(`Easy, champ. Another taunt in ${Math.ceil(wait / 60_000)} min.`); return; }
    haptic('pr');
    notifyPartner(cloudConfig, pairing.code, deviceId, 'taunt');
    void updateProfile({ ...profile, taunt: { id: tauntId, at: Date.now() } });
    showToast('Taunt sent');
  };

  useEffect(() => {
    if (!meId) return;
    for (const snapshot of remote) {
      const text = snapshot.taunt ? tauntText(snapshot.taunt.id) : undefined;
      if (!snapshot.taunt || text === undefined || Date.now() - snapshot.taunt.at > TAUNT_FRESH_MS) continue;
      const key = `jnt2_taunt_seen_${snapshot.deviceId}`;
      let seen = 0;
      try { seen = Number(localStorage.getItem(key)) || 0; } catch { /* a missed taunt is harmless */ }
      if (snapshot.taunt.at <= seen) continue;
      try { localStorage.setItem(key, String(snapshot.taunt.at)); } catch { /* shown again next time at worst */ }
      showToast(`${snapshot.name}: ${text}`, 'badge');
      feedback('badge');
    }
  }, [remote, meId]);

  // Duo badges are earned together, so they are judged from your row and your partner's on the board.
  useEffect(() => {
    if (!leaderboard || !profile) return;
    const side = (item: (typeof leaderboard.ranked)[number]) => ({
      lastSessionAt: item.lastSessionAt,
      goalMet: meetsGoal(item.weeklyCount, item.weeklyGoal),
      streakWeeks: item.streakWeeks,
    });
    const mine = leaderboard.ranked.find((item) => item.profileId === profile.id);
    const partners = leaderboard.ranked.filter((item) => item.profileId !== profile.id);
    if (!mine || !partners.length) return;
    const fresh = newlyUnlocked(evaluateDuoBadges(side(mine), partners.map(side)), profile.unlockedBadges);
    if (!fresh.length) return;
    const saved = { ...profile, unlockedBadges: [...(profile.unlockedBadges ?? []), ...fresh] };
    void dbService.saveProfile(saved).then(() => {
      setProfiles((items) => items.map((item) => (item.id === saved.id ? saved : item)));
      showToast(`Badge unlocked: ${BADGES.find((badge) => badge.id === fresh[0].id)?.name ?? 'Duo badge'}`);
      feedback('badge');
    });
  }, [leaderboard, profile?.id, profile?.unlockedBadges]);

  const pairingUi = {
    configured: Boolean(cloudConfig),
    code: paired ? pairing.code : null,
    status: syncStatus,
    onCreate: () => {
      if (!meId) return;
      const code = generatePairCode();
      savePairing(code, meId);
      setPairing({ code, profileId: meId });
      setRemote([]);
    },
    onJoin: (input: string) => {
      const code = normalizePairCode(input);
      if (!code) return 'That code does not look right. It is 10 letters and numbers.';
      if (!meId) return 'Choose who uses this phone first.';
      savePairing(code, meId);
      setPairing({ code, profileId: meId });
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
      pairedAs: profile?.name ?? null,
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
  };

  // The calendar: where each workout sits, and which one to do next.
  useEffect(() => {
    const refresh = () => setToday(todayKey());
    document.addEventListener('visibilitychange', refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => { document.removeEventListener('visibilitychange', refresh); window.clearInterval(timer); };
  }, []);
  // The calendar, "next up" and missed counts only know the cycle in progress; earlier cycles stay in History.
  const cycleId = profile ? profileCycleId(profile) : 'c1';
  const cycleHistory = useMemo(() => historyForCycle(history, cycleId), [history, cycleId]);
  const schedule = useMemo(() => (profile ? profile.schedule ?? defaultSchedule(profile) : null), [profile]);
  const nextSlot: NextWorkout | null = useMemo(() => {
    if (!profile || !schedule) return null;
    // Until history has loaded, trust the saved pointer so the screen never flashes Week 1.
    if (!historyReady) return profile.cycleCompleted ? null : { week: profile.currentWeek, day: profile.currentDay, date: today, reason: 'upcoming' };
    return nextWorkout(schedule, cycleHistory, today);
  }, [profile, schedule, cycleHistory, historyReady, today]);
  const missed = useMemo(() => (schedule && historyReady ? missedCount(schedule, cycleHistory, today) : 0), [schedule, cycleHistory, historyReady, today]);
  const sheetData = useMemo(() => {
    if (!moveSlot || !schedule) return null;
    const days = weekAgenda(schedule, cycleHistory, mondayOf(slotDate(schedule, moveSlot.week, moveSlot.day)), today, profile ?? undefined);
    const item = days.flatMap((day) => day.items).find((entry) => entry.week === moveSlot.week && entry.day === moveSlot.day);
    return item ? { item, days } : null;
  }, [moveSlot, schedule, cycleHistory, today, profile]);

  // The Today coach card: welcome back, phase milestone, weekly recap, or the day's pre-workout line.
  const coachQueue = useMemo(() => {
    if (!profile || activeSession || profile.cycleCompleted || !nextSlot) return [];
    const prescription = getDayPrescription(nextSlot.week, nextSlot.day, profile);
    const seen = loadSeen(coachKey(profile));
    const finishedInWeek = [...doneSlots(cycleHistory).keys()].some((key) => key.startsWith(`W${nextSlot.week}D`));
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
    if (profile) coachQueue.forEach((message) => markSeen(coachKey(profile), message.id));
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
      const topSet = exercise ? findTopSet(exercise, (item) => item.completed) : undefined;
      const pr = exercise && topSet?.setId === setId && !updated.isEditingCompleted
        ? findAllComparableResults(updated, history).find((r) => r.exerciseId === exercise.exerciseId && r.kind === 'all_time_pr')
        : undefined;
      const prKey = pr ? prRewardKey(pr) : null;
      const freshPr = pr && prKey && !hasDelivered(updated, prKey) ? pr : undefined;
      if (prKey && freshPr) updated = markDelivered(updated, prKey);

      // Finishing an exercise's last set earns one quiet transition.
      const doneKey = exerciseDoneKey(slotId);
      // An extra's sets are added as it goes, so it is never "complete" after a set.
      const freshDone = Boolean(exercise && !exercise.isExtra && exercise.sets.length > 0 && exercise.sets.every((item) => item.completed)
        && !updated.isEditingCompleted && !hasDelivered(updated, doneKey));
      if (freshDone) updated = markDelivered(updated, doneKey);

      // A short coach nudge at the halfway point, the last set, or after an all-out (RIR 0) set, once each per workout.
      let nudge: string | null = null;
      if (!freshPr && !updated.isEditingCompleted && profile) {
        // Halfway / last-set nudges are about the program's own sets; an extra set never moves them.
        const allSets = programExercises(updated).flatMap((item) => item.sets);
        const doneCount = allSets.filter((item) => item.completed).length;
        const due: Array<[NudgeKind, boolean]> = [
          ['last_set', !exercise?.isExtra && allSets.length - doneCount === 1],
          ['halfway', !exercise?.isExtra && allSets.length >= 6 && doneCount * 2 >= allSets.length],
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

      const allDone = programExercises(updated).every((item) => item.sets.every((set) => set.completed));
      // Rest still helps between sets of an extra, even once the program's own sets are all done.
      if (profile?.autoStartRest && exercise && (!allDone || exercise.isExtra) && !updated.isEditingCompleted) {
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
      if (current) await persistActive(swapExercise(current, slotId, updatedProfile, history));
      await updateProfile(updatedProfile);
      haptic('select');
      const name = alternativeId ? exerciseNameFor(alternativeId) : undefined;
      showToast(name ? `Swapped to ${name}` : 'Back to the program exercise');
    } catch (error) {
      showBanner((error as Error).message, true);
    }
  };

  // A swapped-in variation's own training max. Nothing is ever copied from the program lift's.
  const handleSetVariationTm = async (exerciseId: string, block: 1 | 2, value: number | null) => {
    if (!profile) return;
    const key = `${exerciseId}:${block}`;
    const maxes = { ...(profile.variationTrainingMaxes ?? {}) };
    if (value !== null && Number.isFinite(value) && value > 0) maxes[key] = value; else delete maxes[key];
    const updatedProfile = { ...profile, variationTrainingMaxes: maxes };
    try {
      const current = activeSessionRef.current;
      const slot = current?.exercises.find((exercise) => exercise.exerciseId === exerciseId && !exercise.isExtra);
      if (current && slot && !slot.sets.some((set) => set.completed)) await persistActive(swapExercise(current, slot.slotId, updatedProfile, history));
      await updateProfile(updatedProfile);
    } catch (error) {
      showBanner((error as Error).message, true);
    }
  };

  const handleClearLoads = async (slotId: string) => {
    const current = activeSessionRef.current;
    if (!current) return;
    try {
      await persistActive(clearSuggestedLoads(current, slotId));
    } catch (error) {
      showBanner((error as Error).message, true);
    }
  };

  // Exercises the lifter adds themselves ("a la carte"). Each is a pure engine change saved like any other edit.
  const changeExtras = async (change: (session: WorkoutSession) => WorkoutSession): Promise<boolean> => {
    const current = activeSessionRef.current;
    if (!current) return false;
    try {
      await persistActive(change(current));
      return true;
    } catch (error) {
      showBanner((error as Error).message, true);
      return false;
    }
  };
  const handleAddExtra = (name: string) => changeExtras((session) => addExtraExercise(session, name, history));
  const handleAddExtraSet = (slotId: string) => { void changeExtras((session) => addExtraSet(session, slotId)); };
  const handleRemoveExtraSet = (slotId: string, setId: string) => { void changeExtras((session) => removeExtraSet(session, slotId, setId)); };
  const handleRemoveExtra = (slotId: string) => { void changeExtras((session) => removeExtraExercise(session, slotId)); };

  const handleExerciseNote = async (slotId: string, text: string) => {
    const current = activeSessionRef.current;
    if (!current) return;
    try { await persistActive(setExerciseNote(current, slotId, text)); } catch { /* persistActive already told the person */ }
  };

  const handleSessionNote = async (text: string) => {
    const current = activeSessionRef.current;
    if (!current) return;
    try { await persistActive(setSessionNote(current, text)); } catch { /* persistActive already told the person */ }
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
      const result = await dbService.completeAndAdvance(completed, profile, positionAfter(cycleHistory, completed));
      let savedProfile = result.profile;
      activeSessionRef.current = null;
      setActiveSession(null);
      const updatedHistory = await dbService.getSessionHistory(profile.id, true);
      setHistory(updatedHistory);
      if (!wasEditing) {
        const posted = workoutActivity(completed, history);
        if (posted) community.publish('workout', posted.sourceId, posted.summary);
      }

      if (!wasEditing && completed.status !== 'skipped') {
        const goal = savedProfile.weeklyGoalSessions ?? 4;
        let newBadges: typeof BADGES = [];
        if (celebrate) {
          const unlocked = newlyUnlocked([...evaluateBadges(completed, history, goal), ...levelBadges(levelFor(updatedHistory, savedProfile).level)], savedProfile.unlockedBadges);
          if (unlocked.length) {
            savedProfile = { ...savedProfile, unlockedBadges: [...(savedProfile.unlockedBadges ?? []), ...unlocked] };
            await dbService.saveProfile(savedProfile);
            newBadges = BADGES.filter((badge) => unlocked.some((item) => item.id === badge.id));
          }
        }
        // Tell the partner's phone: a PR beats a badge beats a plain "trained". Fire and forget, and only for finished workouts.
        if (celebrate && completed.status === 'completed') {
          const pr = computeHighlights(completed, history).results.find((result) => result.kind === 'all_time_pr');
          if (pr) notifyPartner(cloudConfig, pairing.code, deviceId, 'pr', pr.exerciseName);
          else if (newBadges.length) notifyPartner(cloudConfig, pairing.code, deviceId, 'badge', newBadges[0].name);
          else notifyPartner(cloudConfig, pairing.code, deviceId, 'trained');
        }
        const nextTitle = savedProfile.cycleCompleted ? undefined : getDayPrescription(savedProfile.currentWeek, savedProfile.currentDay, savedProfile).title;
        const highlights = computeHighlights(completed, history);
        const streak = computeStreak(updatedHistory, goal);
        const levelBefore = levelFor(history, profile);
        const levelAfter = levelFor(updatedHistory, savedProfile);
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
            leveledUp: levelAfter.level > levelBefore.level,
          }),
          nextTitle,
          level: levelAfter,
          xpGained: Math.max(0, levelAfter.xp - levelBefore.xp),
          levelUp: celebrate && levelAfter.level > levelBefore.level,
          perksUnlocked: celebrate ? perksBetween(levelBefore.level, levelAfter.level) : [],
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
      const result = await dbService.completeAndAdvance(skipped, profile, positionAfter(cycleHistory, skipped));
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
    const result = moveWorkout(schedule, cycleHistory, slot, date, today);
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
    await updateProfile({ ...profile, schedule: catchUp(schedule, cycleHistory, today) });
    showToast('Plan moved to this week.');
  };

  const handleSaveRun = async (input: ManualRunInput) => {
    if (!profile) throw new Error('Choose a profile before logging a run.');
    const now = Date.now();
    const run: RunSession = {
      runId: newRunId(profile.id, now),
      profileId: profile.id,
      ...input,
      source: 'manual',
      createdTime: now,
      updatedTime: now,
    };
    await dbService.saveRun(run);
    const posted = runActivity(run);
    community.publish('run', posted.sourceId, posted.summary);
    setRuns(await dbService.getRunHistory(profile.id));
    haptic('finish');
    showToast('Run saved.', 'badge');
  };

  const handleDeleteRun = async (runId: string) => {
    if (!profile || !window.confirm('Delete this run? This cannot be undone.')) return;
    try {
      await dbService.deleteRun(runId);
      community.unpublish(`r:${runId}`);
      setRuns(await dbService.getRunHistory(profile.id));
      showBanner('Run deleted.');
    } catch (error) {
      showBanner((error as Error).message, true);
    }
  };

  const refreshAfterImport = async () => {
    const refreshed = await dbService.getProfiles();
    setProfiles(refreshed);
    if (profile && refreshed.some((item) => item.id === profile.id)) {
      const [active, records, runRecords] = await Promise.all([
        dbService.getActiveSession(profile.id),
        dbService.getSessionHistory(profile.id, true),
        dbService.getRunHistory(profile.id),
      ]);
      activeSessionRef.current = active;
      setActiveSession(active);
      setHistory(records);
      setRuns(runRecords);
    }
    // An import never changes who owns this phone; if their profile is gone, the chooser asks again.
  };

  const chooseUser = (profileId: string) => {
    writeLock(profileId);
    setLockedId(profileId);
    // Syncing follows the owner of the phone. A link made while the phone belonged to someone else is dropped.
    if (pairing.profileId && pairing.profileId !== profileId) {
      clearPairing();
      setPairing({ code: null, profileId: null });
      setRemote([]);
      setSyncStatus({ state: 'idle' });
    } else if (pairing.code) {
      saveSyncProfile(profileId);
      setPairing((current) => ({ ...current, profileId }));
    }
    setTab('today');
  };

  const switchUser = () => {
    const name = profile?.name ?? 'the current user';
    if (!window.confirm(`Switch who uses this phone? ${name}'s partner link on this phone will be removed (their workouts stay saved). You will pick who is using it next.`)) return;
    clearLock();
    setLockedId(null);
    clearPairing();
    setPairing({ code: null, profileId: null });
    setRemote([]);
    setSyncStatus({ state: 'idle' });
  };

  if (initError) {
    return (
      <StorageRecovery
        message={initError}
        onRetry={() => setInitAttempt((n) => n + 1)}
        onExportRaw={async () => { await exportTextFile(`jnt2-raw-data-${new Date().toISOString().slice(0, 10)}.json`, await dbService.exportRaw()); }}
        onStartFresh={async () => { await dbService.resetAll(); window.location.reload(); }}
      />
    );
  }

  // First run, or adding another lifter: the setup wizard saves the profile only when it is finished.
  if ((profilesLoaded && profiles.length === 0) || addingProfile) {
    return (
      <Onboarding
        onCancel={addingProfile ? () => setAddingProfile(false) : undefined}
        onDone={async (created) => {
          await dbService.saveProfile(created);
          setProfiles((items) => [...items, created]);
          setAddingProfile(false);
        }}
      />
    );
  }

  if (newCycleOpen && profile) {
    return (
      <NewCycleFlow
        profile={profile}
        history={history}
        onCancel={() => setNewCycleOpen(false)}
        onStart={async (next) => {
          await dbService.startNewCycle(next, profileCycleId(profile));
          setProfiles((items) => items.map((item) => (item.id === next.id ? next : item)));
          setNewCycleOpen(false);
          setTab('today');
          showToast(`Cycle ${next.cycles?.[next.cycles.length - 1]?.number ?? ''} started`);
        }}
      />
    );
  }

  if (lock?.state === 'choose') return <WhoUsesPhone profiles={profiles} onPick={chooseUser} />;

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col font-sans selection:bg-accent selection:text-on-accent">
      <OfflineIndicator />
      <AppPrompts updateReady={appUpdate.updateReady} onUpdate={appUpdate.apply} activeWorkout={Boolean(activeSession)} paired={Boolean(cloudConfig && pairing.code)} onOpenNotifications={openNotifications} backupDue={!backupNudgeHidden && backupDue(history, backupAt)} onBackupNow={() => { setBackupNudgeHidden(true); setTab('settings'); }} onSnoozeBackup={() => { snoozeBackupNudge(); setBackupNudgeHidden(true); }} />
      <header className="sticky top-0 z-30 bg-surface border-b border-line px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-display font-black text-lg text-accent-ink whitespace-nowrap">J&amp;T 2.0</span>
          {profile && (
            <div className="flex items-center gap-1.5 rounded-xl bg-accent py-1 pl-1 pr-3 text-xs font-bold text-on-accent" aria-label={`Signed in as ${profile.name}`}>
              <span className="flex rounded-full ring-2 ring-on-accent"><Avatar profile={battery?.active ? { ...profile, flair: BATTERY_FLAIR } : profile} size={22} decorative /></span>
              {profile.name}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <PWAInstallButton activeWorkout={Boolean(activeSession)} />
          <button onClick={() => setTab('verify')} className="p-2 rounded-xl bg-ok/10 border border-ok/40 text-ok" aria-label="Workbook mapping and engine checks" title="Workbook mapping and engine checks">
            <ShieldCheck className="w-4 h-4" />
          </button>
        </div>
      </header>

      {banner && <div role={banner.error ? 'alert' : 'status'} className={`sticky top-[calc(57px+env(safe-area-inset-top))] z-20 px-4 py-2 text-xs font-bold text-center ${banner.error ? 'bg-bad text-on-accent' : 'bg-ink text-paper'}`}>{banner.text}</div>}

      <main key={tab} className={`flex-1 p-3 sm:p-4 pb-[calc(7rem+env(safe-area-inset-bottom))] mx-auto w-full animate-fade-in ${tab === 'progress' ? 'max-w-5xl' : 'max-w-xl'}`}>
        {tab === 'today' && <TodayTab extras={{ onAdd: handleAddExtra, onAddSet: handleAddExtraSet, onRemoveSet: handleRemoveExtraSet, onRemove: handleRemoveExtra }} onExerciseNote={handleExerciseNote} onSessionNote={handleSessionNote} onStartNewCycle={() => setNewCycleOpen(true)} profile={profile} activeSession={activeSession} onStartWorkout={startWorkout} onLogSet={handleLogSet} onUndoSet={handleUndoSet} onBackoffDecision={handleBackoffDecision} onCompleteWorkout={finishWorkout} onDiscardActiveWorkout={discardActive} onSkipSession={skipSession} onSwapExercise={handleSwapExercise} onSetVariationTm={handleSetVariationTm} onClearLoads={handleClearLoads} onToggleWarmup={handleToggleWarmup} next={nextSlot} missed={missed} onMoveNext={nextSlot ? () => setMoveSlot({ week: nextSlot.week, day: nextSlot.day }) : undefined} weekStrip={schedule ? <WeekStrip schedule={schedule} profile={profile ?? undefined} history={cycleHistory} today={today} onOpen={() => setTab('program')} /> : null} coach={coachMessage} onDismissCoach={dismissCoach} history={history} runs={runs} onLogRun={() => setRunLogOpen(true)} battery={battery?.active && battery.until !== null ? { until: battery.until, missedCount: battery.missedCount } : null} streak={profile ? computeStreak(history, profile.weeklyGoalSessions ?? 4) : undefined} />}
        {tab === 'program' && (
          <div className="space-y-4">
            {schedule && <TrainingCalendar schedule={schedule} profile={profile ?? undefined} history={cycleHistory} runs={runs} today={today} onMove={handleMoveWorkout} onOpenMove={setMoveSlot} onCatchUp={handleCatchUp} />}
            <ProgramTab profile={profile} onUpdateProfile={updateProfile} />
          </div>
        )}
        {tab === 'progress' && <ProgressTab profile={profile} history={history} runs={runs} onEditSession={editCompletedSession} onDeleteRun={(id) => void handleDeleteRun(id)} onDeleteSession={async (id, demo) => {
          if (!profile || !window.confirm('Delete this session record? This cannot be undone.')) return;
          try {
            await dbService.deleteSession(id, demo);
            community.unpublish(`w:${id}`);
            setHistory(await dbService.getSessionHistory(profile.id, true));
            showBanner('Session deleted.');
          } catch (error) { showBanner((error as Error).message, true); }
        }} />}
        {tab === 'together' && <div className="space-y-4"><CommunityFeed community={community} memberName={profile?.name ?? ''} /><TogetherTab board={leaderboard} youId={paired ? (meId ?? '') : (profile?.id ?? '')} pairing={pairingUi} profiles={profiles} youLevel={myLevel} onTaunt={sendTaunt} /></div>}
        {tab === 'settings' && <SettingsTab level={myLevel} extra={<>{profile && <NotificationsPanel profile={profile} config={cloudConfig} code={pairing.code} deviceId={deviceId} />}<UpdateCard updateReady={appUpdate.updateReady} checking={appUpdate.checking} onCheck={appUpdate.check} onUpdate={appUpdate.apply} activeWorkout={Boolean(activeSession)} /></>} profiles={profiles} activeProfileId={profile?.id ?? ''} activeSession={activeSession} onSwitchUser={switchUser} onAddProfile={() => setAddingProfile(true)} onStartNewCycle={activeSession ? undefined : () => setNewCycleOpen(true)} onUpdateProfile={updateProfile} onExportBackup={async () => {
          try {
            const outcome = await exportTextFile(`jnt2-backup-${new Date().toISOString().slice(0, 10)}.json`, await dbService.exportBackup());
            if (outcome !== 'cancelled') { recordBackup(); setBackupAt(Date.now()); showToast(outcome === 'shared' ? 'Backup shared' : 'Backup saved'); }
          } catch (error) { showBanner((error as Error).message, true); }
        }} onImportBackup={async (json, replace) => {
          // A replace-all import overwrites what is here, so keep a copy of it first and offer to restore it.
          if (replace) { try { saveImportSnapshot(await dbService.exportBackup()); } catch { /* the import itself still validates */ } }
          const result = await dbService.importBackup(json, replace ? 'replace-all' : 'reject-duplicates');
          if (result.success) await refreshAfterImport();
          return result;
        }} backupInfo={{ persisted, lastBackupAt: backupAt, canRestore: Boolean(loadImportSnapshot()), onRestore: async () => {
          const snapshot = loadImportSnapshot();
          if (!snapshot) return { success: false, message: 'There is no earlier copy to restore.' };
          const result = await dbService.importBackup(snapshot, 'replace-all');
          if (result.success) { clearImportSnapshot(); await refreshAfterImport(); }
          return result;
        } }} />}
        {tab === 'verify' && <VerificationTab />}
      </main>

      <RestTimer key={profile?.id ?? 'none'} profileId={profile?.id} restRequest={restRequest} setsLogged={activeSession ? activeSession.exercises.reduce((sum, item) => sum + item.sets.filter((set) => set.completed).length, 0) : 0} />
      <ToastStack toasts={toasts} />
      {summary && <WorkoutSummary data={summary} onDone={() => { setSummary(null); setTab('today'); }} />}
      {runLogOpen && profile && <RunLogSheet defaultUnit={preferredRunUnit(runs)} onSave={handleSaveRun} onClose={() => setRunLogOpen(false)} />}
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
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-surface border-t border-line pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] px-3 flex justify-around max-w-xl mx-auto" aria-label="Primary navigation">
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
