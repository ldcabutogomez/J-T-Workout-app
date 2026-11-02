import React, { useState, useEffect, useMemo } from 'react';
import { UserProfile, WorkoutSession, LoggedExercise, LoggedSet } from './types';
import { dbService } from './storage/db';
import { getDayPrescription, roundLoad } from './engine/jnt2Engine';
import { generateSessionEncouragement } from './engine/encouragement';
import { TodayTab } from './components/TodayTab';
import { ProgramTab } from './components/ProgramTab';
import { ProgressTab } from './components/ProgressTab';
import { SettingsTab } from './components/SettingsTab';
import { VerificationTab } from './components/VerificationTab';
import { RestTimer } from './components/RestTimer';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import {
  CalendarDays,
  Dumbbell,
  TrendingUp,
  Settings,
  ShieldCheck,
  Sun,
  Moon,
  Users,
} from 'lucide-react';

export default function App() {
  const [currentTab, setCurrentTab] = useState<
    'today' | 'program' | 'progress' | 'settings' | 'verify'
  >('today');

  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>('');
  const [activeSession, setActiveSession] = useState<WorkoutSession | null>(null);
  const [sessionHistory, setSessionHistory] = useState<WorkoutSession[]>([]);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);

  // Active Profile Lookup
  const currentProfile = useMemo(() => {
    return profiles.find((p) => p.id === activeProfileId) || profiles[0] || null;
  }, [profiles, activeProfileId]);

  // Initial Seed & Database Boot
  useEffect(() => {
    const initApp = async () => {
      await dbService.init();
      let existingProfiles = await dbService.getProfiles();

      if (existingProfiles.length === 0) {
        // Initial setup for the user and partner with clean starting templates (no fabricated personal weights)
        const partner1: UserProfile = {
          id: 'partner_1',
          name: 'Partner 1',
          unit: 'lb',
          equipmentIncrement: 5,
          barbellWeight: 45,
          tone: 'warm',
          currentWeek: 1,
          currentDay: 1,
          trainingMaxes: { squat: 200, bench: 165, deadlift: 245, ohp: 115 },
          weeklyGoalSessions: 4,
          theme: 'dark',
        };
        const partner2: UserProfile = {
          id: 'partner_2',
          name: 'Partner 2',
          unit: 'lb',
          equipmentIncrement: 5,
          barbellWeight: 45,
          tone: 'warm',
          currentWeek: 1,
          currentDay: 1,
          trainingMaxes: { squat: 185, bench: 135, deadlift: 225, ohp: 95 },
          weeklyGoalSessions: 4,
          theme: 'dark',
        };

        await dbService.saveProfile(partner1);
        await dbService.saveProfile(partner2);
        existingProfiles = [partner1, partner2];
      }

      setProfiles(existingProfiles);
      setActiveProfileId(existingProfiles[0].id);
    };

    initApp();
  }, []);

  // Reload Active Session & History when Active Profile Changes
  useEffect(() => {
    if (!currentProfile) return;
    const loadUserData = async () => {
      const active = await dbService.getActiveSession(currentProfile.id);
      setActiveSession(active);
      const history = await dbService.getSessionHistory(currentProfile.id, true);
      setSessionHistory(history);
    };
    loadUserData();
  }, [currentProfile]);

  // Sync dark class on document element
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const showBanner = (msg: string) => {
    setStatusBanner(msg);
    setTimeout(() => setStatusBanner(null), 4000);
  };

  // --------------------------------------------------------------------------
  // WORKOUT LOGGING WORKFLOW
  // --------------------------------------------------------------------------

  const handleStartWorkout = async () => {
    if (!currentProfile) return;
    const week = currentProfile.currentWeek;
    const day = currentProfile.currentDay;
    const prescription = getDayPrescription(week, day, currentProfile);

    const exercises: LoggedExercise[] = prescription.exercises.map((slot) => {
      let defaultLoad = 0;
      if (slot.parentLiftKey && currentProfile.trainingMaxes[slot.parentLiftKey]) {
        defaultLoad = currentProfile.trainingMaxes[slot.parentLiftKey];
      }

      const sets: LoggedSet[] = slot.prescribedSets.map((s, idx) => {
        let setLoad = 0;
        if (s.percentage && !s.loadFromRM && defaultLoad > 0) {
          setLoad = roundLoad(defaultLoad * s.percentage, currentProfile.equipmentIncrement);
        }

        return {
          setId: `${slot.tier}_s${idx + 1}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          type: s.type,
          prescribedReps: s.prescribedReps,
          actualReps: s.prescribedReps,
          load: setLoad,
          unit: currentProfile.unit,
          rir: 2,
          isAmrap: s.isAmrap,
          completed: false,
          timestamp: Date.now(),
        };
      });

      return {
        slotKey: slot.tier,
        tier: slot.tier,
        exerciseName: slot.defaultExercise,
        targetRM: slot.targetRM,
        sets,
        notes: slot.notes,
        sourceRef: slot.sourceRef,
      };
    });

    const newSession: WorkoutSession = {
      sessionId: `session_${currentProfile.id}_w${week}_d${day}_${Date.now()}`,
      profileId: currentProfile.id,
      week,
      day,
      startTime: Date.now(),
      isPartial: false,
      isSkipped: false,
      exercises,
    };

    await dbService.saveActiveSession(newSession);
    setActiveSession(newSession);
    showBanner(`Started Week ${week}, Day ${day}`);
  };

  const handleLogSet = async (
    slotIdx: number,
    setIdx: number,
    actualReps: number,
    load: number,
    rir: number
  ) => {
    if (!activeSession || !currentProfile) return;
    const updated: WorkoutSession = JSON.parse(JSON.stringify(activeSession));
    const targetEx = updated.exercises[slotIdx];
    const targetSet = targetEx.sets[setIdx];

    targetSet.actualReps = actualReps;
    targetSet.load = load;
    targetSet.rir = rir;
    targetSet.completed = true;
    targetSet.timestamp = Date.now();

    // SPECIAL RULE 1: Block 2 (Weeks 7-11) T1 dynamic back-off autoregulation
    if (
      targetEx.tier === 'T1' &&
      targetSet.type === 'rm_target' &&
      updated.week >= 7 &&
      updated.week <= 11
    ) {
      targetEx.achievedRMWeight = load;
      const isMesoC = updated.week >= 7 && updated.week <= 9;
      const pct = isMesoC ? 0.85 : 0.90;
      const computedBackoff = roundLoad(load * pct, currentProfile.equipmentIncrement);

      // Mismatch check: did lifter hit the prescribed target reps?
      if (actualReps !== targetSet.prescribedReps) {
        targetEx.rmMismatchWarning = `Target was ${targetSet.prescribedReps}RM, but ${actualReps} reps were logged. Back-offs calculated at ${(pct * 100).toFixed(0)}% (${computedBackoff} ${currentProfile.unit}). Tap to adjust if necessary.`;
      } else {
        targetEx.rmMismatchWarning = undefined;
      }

      // Populate uncompleted back-off sets with the calculated load
      targetEx.sets.forEach((s) => {
        if (s.type === 'backoff' && !s.completed) {
          s.load = computedBackoff;
        }
      });

      showBanner(
        `Top set logged at ${load} ${currentProfile.unit}. Back-offs set to ${computedBackoff} ${currentProfile.unit} (${(pct * 100).toFixed(0)}%).`
      );
    }

    // SPECIAL RULE 2: T2b and T3 MRS set load sync
    // When the initial target RM set is logged, sync the remaining 3 MRS sets to match it
    if (
      (targetEx.tier.startsWith('T2b') || targetEx.tier.startsWith('T3')) &&
      targetSet.type === 'rm_target'
    ) {
      targetEx.achievedRMWeight = load;
      targetEx.sets.forEach((s) => {
        if (s.type === 'mrs' && !s.completed) {
          s.load = load;
        }
      });
    }

    await dbService.saveActiveSession(updated);
    setActiveSession(updated);
  };

  const handleUndoSet = async (slotIdx: number, setIdx: number) => {
    if (!activeSession) return;
    const updated: WorkoutSession = JSON.parse(JSON.stringify(activeSession));
    updated.exercises[slotIdx].sets[setIdx].completed = false;
    await dbService.saveActiveSession(updated);
    setActiveSession(updated);
  };

  const handleCompleteWorkout = async () => {
    if (!activeSession || !currentProfile) return;

    // Generate deterministic positive reinforcement
    const encouragement = generateSessionEncouragement({
      tone: currentProfile.tone,
      history: sessionHistory,
      currentSession: activeSession,
      weeklyGoalSessions: currentProfile.weeklyGoalSessions || 4,
    });

    const completed: WorkoutSession = {
      ...activeSession,
      completedTime: Date.now(),
      encouragementMessage: encouragement,
    };

    await dbService.completeSession(completed);

    // Advance only THIS lifter's day/week without touching partner's calendar
    let nextDay = currentProfile.currentDay + 1;
    let nextWeek = currentProfile.currentWeek;
    if (nextDay > 4) {
      nextDay = 1;
      nextWeek = Math.min(12, currentProfile.currentWeek + 1);
    }

    const updatedProfile: UserProfile = {
      ...currentProfile,
      currentDay: nextDay,
      currentWeek: nextWeek,
    };

    await dbService.saveProfile(updatedProfile);
    setProfiles((prev) => prev.map((p) => (p.id === updatedProfile.id ? updatedProfile : p)));
    setActiveSession(null);

    const history = await dbService.getSessionHistory(updatedProfile.id, true);
    setSessionHistory(history);

    if (encouragement) {
      showBanner(encouragement);
    } else {
      showBanner(`Workout complete! Advanced to Week ${nextWeek}, Day ${nextDay}.`);
    }
  };

  const handleDiscardActiveWorkout = async () => {
    if (!activeSession || !currentProfile) return;
    if (window.confirm('Discard active workout and reset today\'s session?')) {
      await dbService.clearActiveSession(currentProfile.id);
      setActiveSession(null);
      showBanner('Active workout discarded.');
    }
  };

  const handleAdvanceDayManually = async () => {
    if (!currentProfile) return;
    let nextDay = currentProfile.currentDay + 1;
    let nextWeek = currentProfile.currentWeek;
    if (nextDay > 4) {
      nextDay = 1;
      nextWeek = Math.min(12, currentProfile.currentWeek + 1);
    }
    const updatedProfile: UserProfile = {
      ...currentProfile,
      currentDay: nextDay,
      currentWeek: nextWeek,
    };
    await dbService.saveProfile(updatedProfile);
    setProfiles((prev) => prev.map((p) => (p.id === updatedProfile.id ? updatedProfile : p)));
    showBanner(`Advanced to Week ${nextWeek}, Day ${nextDay}.`);
  };

  const handleDeleteSession = async (sessionId: string, isDemo = false) => {
    if (!currentProfile) return;
    if (window.confirm('Delete this workout record from history?')) {
      await dbService.deleteSession(sessionId, isDemo);
      const history = await dbService.getSessionHistory(currentProfile.id, true);
      setSessionHistory(history);
      showBanner('Workout session deleted.');
    }
  };

  // --------------------------------------------------------------------------
  // DEMO DATA SEEDING (Separated cleanly from real records)
  // --------------------------------------------------------------------------
  const handleSeedDemoData = async (profileId: string) => {
    const p = profiles.find((item) => item.id === profileId);
    if (!p) return;

    // Seed 4 realistic past workouts for Week 1
    const now = Date.now();
    const demoSessions: WorkoutSession[] = [
      {
        sessionId: `demo_${profileId}_w1_d1_${now - 4 * 86400000}`,
        profileId,
        week: 1,
        day: 1,
        startTime: now - 4 * 86400000 - 3600000,
        completedTime: now - 4 * 86400000,
        isPartial: false,
        isSkipped: false,
        isDemo: true,
        encouragementMessage: 'Session in the books! That makes 1 completed session this week.',
        exercises: [
          {
            slotKey: 'T1',
            tier: 'T1',
            exerciseName: 'Back Squat',
            targetRM: 10,
            achievedRMWeight: 175,
            sourceRef: 'J&T2.0!Col_T1_Wk1',
            sets: [
              { setId: 'd1_s1', type: 'rm_target', prescribedReps: 10, actualReps: 10, load: 175, unit: p.unit, rir: 2, completed: true, timestamp: now },
              { setId: 'd1_s2', type: 'backoff', prescribedReps: 6, actualReps: 6, load: 140, unit: p.unit, rir: 2, completed: true, timestamp: now },
              { setId: 'd1_s3', type: 'backoff', prescribedReps: 6, actualReps: 6, load: 140, unit: p.unit, rir: 2, completed: true, timestamp: now },
              { setId: 'd1_s4', type: 'backoff', prescribedReps: 6, actualReps: 8, load: 140, unit: p.unit, rir: 1, isAmrap: true, completed: true, timestamp: now },
            ],
          },
        ],
      },
      {
        sessionId: `demo_${profileId}_w1_d2_${now - 2 * 86400000}`,
        profileId,
        week: 1,
        day: 2,
        startTime: now - 2 * 86400000 - 3600000,
        completedTime: now - 2 * 86400000,
        isPartial: false,
        isSkipped: false,
        isDemo: true,
        encouragementMessage: 'Workout saved. 2 sessions completed this week.',
        exercises: [
          {
            slotKey: 'T1',
            tier: 'T1',
            exerciseName: 'Bench Press',
            targetRM: 10,
            achievedRMWeight: 135,
            sourceRef: 'J&T2.0!Col_T1_Wk1',
            sets: [
              { setId: 'd2_s1', type: 'rm_target', prescribedReps: 10, actualReps: 10, load: 135, unit: p.unit, rir: 2, completed: true, timestamp: now },
              { setId: 'd2_s2', type: 'backoff', prescribedReps: 6, actualReps: 6, load: 110, unit: p.unit, rir: 2, completed: true, timestamp: now },
              { setId: 'd2_s3', type: 'backoff', prescribedReps: 6, actualReps: 6, load: 110, unit: p.unit, rir: 2, completed: true, timestamp: now },
              { setId: 'd2_s4', type: 'backoff', prescribedReps: 6, actualReps: 7, load: 110, unit: p.unit, rir: 1, isAmrap: true, completed: true, timestamp: now },
            ],
          },
        ],
      },
    ];

    for (const s of demoSessions) {
      await dbService.completeSession(s);
    }
    const history = await dbService.getSessionHistory(profileId, true);
    setSessionHistory(history);
    showBanner(`Seeded demo workouts for ${p.name}. Check the Progress tab!`);
  };

  const handleClearDemoData = async (profileId: string) => {
    await dbService.clearDemoSessions(profileId);
    const history = await dbService.getSessionHistory(profileId, true);
    setSessionHistory(history);
    showBanner('Demo workouts cleared.');
  };

  return (
    <div className="min-h-screen bg-slate-950 dark:bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      {/* Offline Connectivity Toast */}
      <OfflineIndicator />

      {/* Top Navigation Bar: One-row three-zone layout */}
      <header className="sticky top-0 z-30 bg-slate-900/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between gap-4">
        {/* Zone 1: Brand wordmark */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-display font-black text-lg tracking-tight text-amber-400">
              J&amp;T 2.0
            </span>
            <span className="text-[10px] font-mono uppercase bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700">
              GZCL
            </span>
          </div>

          {/* Quick Partner Switcher */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-0.5">
            {profiles.map((p) => {
              const isActive = p.id === activeProfileId;
              return (
                <button
                  key={p.id}
                  onClick={() => setActiveProfileId(p.id)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition whitespace-nowrap ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {p.name.split(' ')[0]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Zone 3: Actions & Verification */}
        <div className="flex items-center gap-2">
          <PWAInstallButton />

          <button
            onClick={() => setCurrentTab('verify')}
            className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-xl border transition ${
              currentTab === 'verify'
                ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                : 'bg-emerald-950/60 border-emerald-800 text-emerald-300 hover:bg-emerald-900/60'
            }`}
            title="Open automated engine checks"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Engine Checks</span>
          </button>

          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-800 transition"
            aria-label="Toggle dark/light theme"
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Floating Status Notification Banner */}
      {statusBanner && (
        <div className="sticky top-[53px] z-20 bg-amber-500 text-slate-950 px-4 py-2 text-xs font-bold text-center shadow-lg transition-all animate-in slide-in-from-top-2">
          {statusBanner}
        </div>
      )}

      {/* Main Responsive Content Viewport */}
      <main className="flex-1 p-4 pb-28 max-w-xl mx-auto w-full">
        {currentTab === 'today' && (
          <TodayTab
            profile={currentProfile}
            activeSession={activeSession}
            history={sessionHistory}
            onStartWorkout={handleStartWorkout}
            onLogSet={handleLogSet}
            onUndoSet={handleUndoSet}
            onCompleteWorkout={handleCompleteWorkout}
            onDiscardActiveWorkout={handleDiscardActiveWorkout}
            onAdvanceDayManually={handleAdvanceDayManually}
          />
        )}

        {currentTab === 'program' && (
          <ProgramTab
            profile={currentProfile}
            onUpdateProfile={async (p) => {
              await dbService.saveProfile(p);
              setProfiles((prev) => prev.map((item) => (item.id === p.id ? p : item)));
              showBanner('Program settings updated.');
            }}
          />
        )}

        {currentTab === 'progress' && (
          <ProgressTab
            profile={currentProfile}
            history={sessionHistory}
            onDeleteSession={handleDeleteSession}
            onClearDemoData={() => currentProfile && handleClearDemoData(currentProfile.id)}
          />
        )}

        {currentTab === 'settings' && (
          <SettingsTab
            profiles={profiles}
            activeProfileId={activeProfileId}
            onSelectProfile={(id) => setActiveProfileId(id)}
            onUpdateProfile={async (p) => {
              await dbService.saveProfile(p);
              setProfiles((prev) => prev.map((item) => (item.id === p.id ? p : item)));
              showBanner('Profile preferences saved.');
            }}
            onExportBackup={async () => {
              const json = await dbService.exportBackup();
              const blob = new Blob([json], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `jnt2_backup_${new Date().toISOString().split('T')[0]}.json`;
              a.click();
              showBanner('Backup downloaded.');
            }}
            onImportBackup={async (json) => {
              const res = await dbService.importBackup(json);
              if (res.success) {
                const refreshed = await dbService.getProfiles();
                setProfiles(refreshed);
                showBanner(res.message);
              } else {
                alert(`Import failed: ${res.message}`);
              }
            }}
            onSeedDemoData={handleSeedDemoData}
            onClearDemoData={handleClearDemoData}
          />
        )}

        {currentTab === 'verify' && <VerificationTab profile={currentProfile} />}
      </main>

      {/* Floating Rest Timer with Background Resilience */}
      <RestTimer />

      {/* Fixed Bottom Ergonomic Thumb-Zone Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-slate-900/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-800 py-2 px-6 flex justify-around max-w-xl mx-auto">
        <NavButton
          active={currentTab === 'today'}
          icon={<Dumbbell className="w-5 h-5" />}
          label="Today"
          onClick={() => setCurrentTab('today')}
        />
        <NavButton
          active={currentTab === 'program'}
          icon={<CalendarDays className="w-5 h-5" />}
          label="Program"
          onClick={() => setCurrentTab('program')}
        />
        <NavButton
          active={currentTab === 'progress'}
          icon={<TrendingUp className="w-5 h-5" />}
          label="Progress"
          onClick={() => setCurrentTab('progress')}
        />
        <NavButton
          active={currentTab === 'settings'}
          icon={<Settings className="w-5 h-5" />}
          label="Settings"
          onClick={() => setCurrentTab('settings')}
        />
      </nav>
    </div>
  );
}

interface NavButtonProps {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

const NavButton: React.FC<NavButtonProps> = ({ active, icon, label, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center w-16 py-1 transition-colors select-none ${
        active ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      <div className={`transition-transform ${active ? 'scale-110' : ''}`}>{icon}</div>
      <span className="text-[11px] tracking-tight mt-1">{label}</span>
    </button>
  );
};
