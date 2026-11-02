import React, { useState } from 'react';
import { UserProfile } from '../types';
import { getDayPrescription, CANONICAL_DAYS, CANONICAL_JNT2_RULES } from '../engine/jnt2Engine';
import { Dumbbell, Calendar, Sliders, Check, AlertCircle } from 'lucide-react';

interface ProgramTabProps {
  profile: UserProfile | null;
  onUpdateProfile: (updated: UserProfile) => void;
}

export const ProgramTab: React.FC<ProgramTabProps> = ({ profile, onUpdateProfile }) => {
  const [selectedWeek, setSelectedWeek] = useState<number>(profile?.currentWeek || 1);
  const [activeDayTab, setActiveDayTab] = useState<number>(profile?.currentDay || 1);
  const [isEditingTMs, setIsEditingTMs] = useState<boolean>(false);
  const [tempTMs, setTempTMs] = useState<{ [k: string]: number }>(profile?.trainingMaxes || {});
  const [isCustomizingLifts, setIsCustomizingLifts] = useState<boolean>(false);

  if (!profile) return null;

  const currentPrescription = getDayPrescription(selectedWeek, activeDayTab, profile);

  const handleSaveTMs = () => {
    onUpdateProfile({
      ...profile,
      trainingMaxes: tempTMs,
    });
    setIsEditingTMs(false);
  };

  const handleExerciseCustomization = (slotKey: string, newName: string) => {
    const updatedCustoms = {
      ...(profile.exerciseCustomizations || {}),
      [slotKey]: newName,
    };
    onUpdateProfile({
      ...profile,
      exerciseCustomizations: updatedCustoms,
    });
  };

  const dayTitles = ['Day 1 · Squat', 'Day 2 · Bench', 'Day 3 · Deadlift', 'Day 4 · OHP'];

  return (
    <div className="space-y-4">
      {/* Training Maxes (TM) Summary Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
        <div className="flex justify-between items-center pb-2 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-black text-white font-display">Training Maxes (TM)</h2>
            <p className="text-[11px] text-slate-400">
              Estimated daily 2RM · Basis for Block 1 T1 & T2a percentages
            </p>
          </div>
          <button
            onClick={() => {
              if (isEditingTMs) handleSaveTMs();
              else {
                setTempTMs(profile.trainingMaxes);
                setIsEditingTMs(true);
              }
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
              isEditingTMs
                ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
            }`}
          >
            {isEditingTMs ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Save</span>
              </>
            ) : (
              <>
                <Sliders className="w-3.5 h-3.5" />
                <span>Edit TMs</span>
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3">
          {(['squat', 'bench', 'deadlift', 'ohp'] as const).map((lift) => (
            <div key={lift} className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                {lift} TM
              </span>
              {isEditingTMs ? (
                <input
                  type="number"
                  step={profile.equipmentIncrement}
                  value={tempTMs[lift] ?? 0}
                  onChange={(e) =>
                    setTempTMs({ ...tempTMs, [lift]: Number(e.target.value) })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 font-mono font-bold text-amber-400 text-base outline-none mt-1"
                />
              ) : (
                <span className="text-lg font-mono font-black text-amber-400 block mt-0.5">
                  {profile.trainingMaxes[lift] || 0} {profile.unit}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Block 2 Transition Note */}
        {selectedWeek >= 7 && (
          <div className="mt-3 p-3 bg-amber-950/30 border border-amber-900/40 rounded-2xl flex items-start gap-2 text-xs text-amber-300/90">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              <strong>Block 2 Notice (Weeks 7–12):</strong> T1 drop sets do not use these starting TMs. They calculate dynamically from the actual RM weight achieved on each training day.
            </span>
          </div>
        )}
      </div>

      {/* 12-Week Curriculum Browser */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-black text-white font-display">12-Week Curriculum</h3>
            <span className="text-xs text-slate-400">
              {selectedWeek <= 6 ? 'Block 1 · Hypertrophy Base' : 'Block 2 · Strength & Peaking'}
            </span>
          </div>

          <button
            onClick={() => setIsCustomizingLifts(!isCustomizingLifts)}
            className="text-xs text-amber-400 hover:underline font-semibold"
          >
            {isCustomizingLifts ? 'Done Customizing' : 'Customize Movements'}
          </button>
        </div>

        {/* Week Pill Scroller */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((w) => {
            const isCurrent = profile.currentWeek === w;
            const isSelected = selectedWeek === w;
            return (
              <button
                key={w}
                onClick={() => setSelectedWeek(w)}
                className={`flex-shrink-0 px-3.5 py-2 rounded-xl font-mono text-xs font-bold transition flex flex-col items-center min-w-[50px] ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : isCurrent
                    ? 'bg-slate-800 text-amber-400 border border-amber-500/50'
                    : 'bg-slate-950 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <span>W{w}</span>
                {w === 6 && <span className="text-[8px] font-black tracking-tighter">TEST</span>}
                {w === 12 && <span className="text-[8px] font-black tracking-tighter">PEAK</span>}
              </button>
            );
          })}
        </div>

        {/* Day Selector Tabs */}
        <div className="grid grid-cols-4 gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800">
          {[1, 2, 3, 4].map((d) => (
            <button
              key={d}
              onClick={() => setActiveDayTab(d)}
              className={`py-2 text-xs font-bold rounded-xl transition ${
                activeDayTab === d
                  ? 'bg-slate-800 text-amber-400 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Day {d}
            </button>
          ))}
        </div>

        {/* Prescribed Movements Breakdown for Week & Day */}
        <div className="space-y-2.5">
          <div className="flex justify-between items-center px-1">
            <span className="text-xs font-bold text-slate-300">
              {dayTitles[activeDayTab - 1]} · Prescriptions
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              {currentPrescription.sourceRef}
            </span>
          </div>

          {currentPrescription.exercises.map((slot, idx) => (
            <div
              key={idx}
              className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded font-mono ${
                      slot.tier === 'T1'
                        ? 'bg-rose-950 text-rose-300 border border-rose-800'
                        : slot.tier.startsWith('T2')
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : 'bg-sky-950 text-sky-300 border border-sky-800'
                    }`}
                  >
                    {slot.tier}
                  </span>

                  {isCustomizingLifts ? (
                    <input
                      type="text"
                      value={slot.defaultExercise}
                      onChange={(e) =>
                        handleExerciseCustomization(`D${activeDayTab}_${slot.tier}`, e.target.value)
                      }
                      className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-white font-bold"
                    />
                  ) : (
                    <span className="font-bold text-white text-sm">{slot.defaultExercise}</span>
                  )}
                </div>

                <div className="mt-1 text-xs text-slate-400 font-mono">
                  {slot.isRestWeek ? (
                    <span className="text-amber-400/90 italic">
                      Scheduled Rest / Deload ({slot.notes})
                    </span>
                  ) : slot.tier === 'T1' ? (
                    <span>
                      Work up to {slot.targetRM}RM, then {slot.prescribedSets.length - 1} back-off sets
                      {selectedWeek <= 6
                        ? ` @ ${((slot.prescribedSets[1]?.percentage || 0) * 100).toFixed(1)}% TM`
                        : ` @ ${((slot.prescribedSets[1]?.percentage || 0) * 100).toFixed(0)}% of today's RM`}
                    </span>
                  ) : slot.tier === 'T2a' ? (
                    <span>{slot.notes}</span>
                  ) : (
                    <span>{slot.notes}</span>
                  )}
                </div>
              </div>

              <span className="text-[10px] font-mono text-slate-500 shrink-0">
                {slot.sourceRef}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
