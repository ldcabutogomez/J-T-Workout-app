import React, { useState, useMemo } from 'react';
import { UserProfile, WorkoutSession } from '../types';
import { Trophy, Calendar, CheckCircle, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

interface ProgressTabProps {
  profile: UserProfile | null;
  history: WorkoutSession[];
  onDeleteSession: (sessionId: string, isDemo?: boolean) => void;
  onClearDemoData: () => void;
}

export const ProgressTab: React.FC<ProgressTabProps> = ({
  profile,
  history,
  onDeleteSession,
  onClearDemoData,
}) => {
  const [selectedLift, setSelectedLift] = useState<string>('Back Squat');
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  if (!profile) return null;

  // Track strictly comparable rep-max performance
  // RM records: Map of LiftName -> Map of RepTarget -> { weight, date, week }
  const rmRecords = useMemo(() => {
    const table: {
      [lift: string]: {
        [rm: number]: { weight: number; date: string; week: number };
      };
    } = {
      'Back Squat': {},
      'Bench Press': {},
      'Deadlift': {},
      'Overhead Press': {},
    };

    history.forEach((sess) => {
      sess.exercises.forEach((ex) => {
        const liftName = ex.exerciseName;
        if (!table[liftName]) table[liftName] = {};

        ex.sets.forEach((set) => {
          if (set.completed && set.load > 0 && set.actualReps > 0) {
            const current = table[liftName][set.actualReps];
            if (!current || set.load > current.weight) {
              table[liftName][set.actualReps] = {
                weight: set.load,
                date: sess.completedTime
                  ? new Date(sess.completedTime).toLocaleDateString()
                  : 'Recent',
                week: sess.week,
              };
            }
          }
        });
      });
    });

    return table;
  }, [history]);

  // Rolling 7-day completion count
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const rollingWeeklyCompleted = history.filter(
    (s) => !s.isSkipped && s.completedTime && s.completedTime > sevenDaysAgo
  ).length;

  const demoCount = history.filter((s) => s.isDemo).length;

  const targetLifts = ['Back Squat', 'Bench Press', 'Deadlift', 'Overhead Press'];

  return (
    <div className="space-y-4">
      {/* Weekly Consistency & Overview Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
        <div className="flex justify-between items-center pb-2 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-black text-white font-display">Weekly Completion</h2>
            <p className="text-[11px] text-slate-400">
              Rolling 7-day adherence for {profile.name}
            </p>
          </div>
          <span className="text-xs bg-emerald-950 border border-emerald-800 text-emerald-300 px-3 py-1 rounded-full font-bold">
            {rollingWeeklyCompleted} / {profile.weeklyGoalSessions || 4} Completed
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2 mt-4 text-center">
          {[1, 2, 3, 4].map((d) => {
            const done = rollingWeeklyCompleted >= d;
            return (
              <div
                key={d}
                className={`p-3 rounded-2xl border transition ${
                  done
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                    : 'bg-slate-950/40 border-slate-800 text-slate-500'
                }`}
              >
                <span className="text-[10px] font-bold uppercase block">Session {d}</span>
                <span className="text-base font-black font-mono mt-1 block">
                  {done ? '✓' : '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Strict Comparable Rep-Max Records Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-black text-white font-display">
              Comparable Rep-Max Records
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real logged weights for each rep target. A heavier 2RM is never counted as a record over a 10RM.
          </p>
        </div>

        {/* Lift Selector Pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {targetLifts.map((lift) => (
            <button
              key={lift}
              onClick={() => setSelectedLift(lift)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
                selectedLift === lift
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'bg-slate-950 text-slate-400 hover:bg-slate-800'
              }`}
            >
              {lift}
            </button>
          ))}
        </div>

        {/* Rep Maxes Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[10, 8, 6, 5, 4, 3, 2, 1].map((rm) => {
            const entry = rmRecords[selectedLift]?.[rm];
            return (
              <div
                key={rm}
                className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3 text-center"
              >
                <span className="text-[10px] font-bold font-mono uppercase text-slate-400 block">
                  {rm}RM Target
                </span>
                <span className="text-base font-black font-mono text-white block mt-0.5">
                  {entry ? `${entry.weight} ${profile.unit}` : '—'}
                </span>
                <span className="text-[9px] text-slate-500 block font-mono mt-0.5">
                  {entry ? `W${entry.week} (${entry.date})` : 'Not tested yet'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Completed Workout History Log */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-black text-white font-display">Session Log</h3>
            <span className="text-xs text-slate-400">
              {history.length} workouts on record
            </span>
          </div>

          {demoCount > 0 && (
            <button
              onClick={onClearDemoData}
              className="text-xs text-rose-400 hover:underline font-semibold"
            >
              Clear Demo Workouts ({demoCount})
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-6 text-center text-slate-500 text-xs">
            No workouts logged yet. Start today's session on the Today tab!
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((sess) => {
              const isExpanded = expandedSessionId === sess.sessionId;
              const dateStr = sess.completedTime
                ? new Date(sess.completedTime).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : 'In Progress';

              return (
                <div
                  key={sess.sessionId}
                  className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5 space-y-2"
                >
                  <div
                    onClick={() => setExpandedSessionId(isExpanded ? null : sess.sessionId)}
                    className="flex justify-between items-center cursor-pointer select-none"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">
                          Week {sess.week} · Day {sess.day}
                        </span>
                        {sess.isDemo && (
                          <span className="text-[9px] font-mono uppercase bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                            Demo
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 font-mono block mt-0.5">
                        {dateStr}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-emerald-400 font-mono font-bold">
                        {sess.exercises.reduce(
                          (acc, ex) => acc + ex.sets.filter((s) => s.completed).length,
                          0
                        )}{' '}
                        sets
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {sess.encouragementMessage && (
                    <p className="text-xs text-amber-300/90 italic bg-amber-950/20 border border-amber-900/30 p-2.5 rounded-xl">
                      "{sess.encouragementMessage}"
                    </p>
                  )}

                  {/* Expanded Set Details */}
                  {isExpanded && (
                    <div className="pt-2 border-t border-slate-800/80 space-y-2 text-xs">
                      {sess.exercises.map((ex, exIdx) => (
                        <div key={exIdx} className="bg-slate-900/60 p-2.5 rounded-xl space-y-1">
                          <span className="font-bold text-slate-200">
                            {ex.tier}: {ex.exerciseName}
                          </span>
                          <div className="flex flex-wrap gap-1.5 font-mono text-[11px] text-slate-400 mt-1">
                            {ex.sets
                              .filter((s) => s.completed)
                              .map((s, sIdx) => (
                                <span
                                  key={sIdx}
                                  className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800"
                                >
                                  {s.actualReps}r @ {s.load}{s.unit}
                                </span>
                              ))}
                          </div>
                        </div>
                      ))}

                      <div className="pt-1 text-right">
                        <button
                          onClick={() => onDeleteSession(sess.sessionId, sess.isDemo)}
                          className="text-rose-400 hover:text-rose-300 text-xs font-semibold flex items-center gap-1 ml-auto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Session</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
