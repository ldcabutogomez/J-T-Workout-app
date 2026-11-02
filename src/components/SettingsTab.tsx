import React, { useRef, useState } from 'react';
import { UserProfile, WeightUnit, EncouragementTone } from '../types';
import { Users, Download, Upload, ShieldAlert, Sparkles, BookOpen } from 'lucide-react';
import { CANONICAL_JNT2_RULES } from '../engine/jnt2Engine';

interface SettingsTabProps {
  profiles: UserProfile[];
  activeProfileId: string;
  onSelectProfile: (id: string) => void;
  onUpdateProfile: (updated: UserProfile) => void;
  onExportBackup: () => void;
  onImportBackup: (jsonStr: string) => void;
  onSeedDemoData: (profileId: string) => void;
  onClearDemoData: (profileId: string) => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  profiles,
  activeProfileId,
  onSelectProfile,
  onUpdateProfile,
  onExportBackup,
  onImportBackup,
  onSeedDemoData,
  onClearDemoData,
}) => {
  const currentProfile = profiles.find((p) => p.id === activeProfileId) || profiles[0];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  if (!currentProfile) return null;

  const handleUnitChange = (unit: WeightUnit) => {
    // Sensible defaults when switching units
    const increment = unit === 'lb' ? 5 : 2.5;
    const barbell = unit === 'lb' ? 45 : 20;
    onUpdateProfile({
      ...currentProfile,
      unit,
      equipmentIncrement: increment,
      barbellWeight: barbell,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        onImportBackup(content);
        setImportStatus('Backup validated and imported successfully!');
        setTimeout(() => setImportStatus(null), 4000);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      {/* Profile Switching Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-amber-400" />
          <h2 className="text-xl font-black text-white font-display">Training Partners</h2>
        </div>
        <p className="text-xs text-slate-400">
          Switch between your profile and your partner's profile. Each person maintains their own weights, training day, program calendar, and tone.
        </p>

        <div className="grid grid-cols-2 gap-2 pt-1">
          {profiles.map((p) => {
            const isActive = p.id === activeProfileId;
            return (
              <button
                key={p.id}
                onClick={() => onSelectProfile(p.id)}
                className={`p-3.5 rounded-2xl border text-left transition ${
                  isActive
                    ? 'bg-amber-500/10 border-amber-500 text-white'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span className="text-[10px] font-mono uppercase font-bold text-amber-400 block">
                  {isActive ? 'Active Lifter' : 'Tap to Switch'}
                </span>
                <span className="font-extrabold text-base block mt-0.5 text-white">{p.name}</span>
                <span className="text-xs font-mono text-slate-400">
                  W{p.currentWeek}:D{p.currentDay} · {p.unit}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Profile Configuration */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
        <h3 className="text-lg font-black text-white font-display">
          Edit Profile: {currentProfile.name}
        </h3>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Lifter Name
            </label>
            <input
              type="text"
              value={currentProfile.name}
              onChange={(e) => onUpdateProfile({ ...currentProfile, name: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-bold outline-none mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Weight Units
              </label>
              <select
                value={currentProfile.unit}
                onChange={(e) => handleUnitChange(e.target.value as WeightUnit)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white font-bold outline-none mt-1"
              >
                <option value="lb">Pounds (lb)</option>
                <option value="kg">Kilograms (kg)</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Equipment Increment
              </label>
              <input
                type="number"
                step="0.5"
                value={currentProfile.equipmentIncrement}
                onChange={(e) =>
                  onUpdateProfile({
                    ...currentProfile,
                    equipmentIncrement: Number(e.target.value),
                  })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-amber-400 font-mono font-bold outline-none mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Barbell Weight ({currentProfile.unit})
              </label>
              <input
                type="number"
                value={currentProfile.barbellWeight || 45}
                onChange={(e) =>
                  onUpdateProfile({
                    ...currentProfile,
                    barbellWeight: Number(e.target.value),
                  })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white font-mono font-bold outline-none mt-1"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Weekly Target Sessions
              </label>
              <select
                value={currentProfile.weeklyGoalSessions || 4}
                onChange={(e) =>
                  onUpdateProfile({
                    ...currentProfile,
                    weeklyGoalSessions: Number(e.target.value),
                  })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white font-bold outline-none mt-1"
              >
                <option value={3}>3 sessions</option>
                <option value={4}>4 sessions (Default)</option>
                <option value={5}>5 sessions</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Positive Reinforcement Tone
            </label>
            <select
              value={currentProfile.tone}
              onChange={(e) =>
                onUpdateProfile({
                  ...currentProfile,
                  tone: e.target.value as EncouragementTone,
                })
              }
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white font-bold outline-none mt-1"
            >
              <option value="minimal">Minimal (Factual progress data)</option>
              <option value="warm">Warm (Supportive & encouraging)</option>
              <option value="playful">Playful (Light celebration)</option>
              <option value="off">Off (No post-session messages)</option>
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              Deterministic offline engine only. No AI API calls, no guilt prompts, and no comparing partners.
            </p>
          </div>
        </div>
      </div>

      {/* Local Storage & Backup Management */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3">
        <h3 className="text-lg font-black text-white font-display">Local Storage & Backups</h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          All profiles and workouts are stored locally inside IndexedDB on this device. Data does not sync automatically across phones. Use backup export/import to transfer records or back them up.
        </p>

        {importStatus && (
          <div className="p-3 bg-emerald-950/60 border border-emerald-800 text-emerald-300 rounded-2xl text-xs font-bold">
            {importStatus}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            onClick={onExportBackup}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-2xl text-xs uppercase tracking-wider transition border border-slate-700 flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4 text-amber-400" />
            <span>Export Backup</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3 rounded-2xl text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-md shadow-amber-500/10"
          >
            <Upload className="w-4 h-4" />
            <span>Import Backup</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Demo Records Generator (Kept separate from real records) */}
        <div className="pt-3 border-t border-slate-800 flex justify-between items-center">
          <div>
            <span className="text-xs font-bold text-slate-300 block">Demonstration Records</span>
            <span className="text-[11px] text-slate-500">
              Populate or clear sample workouts to preview charts
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onSeedDemoData(currentProfile.id)}
              className="text-xs font-bold bg-slate-950 hover:bg-slate-800 text-amber-400 border border-slate-800 px-3 py-1.5 rounded-xl transition"
            >
              Seed Demo
            </button>
            <button
              onClick={() => onClearDemoData(currentProfile.id)}
              className="text-xs font-bold text-rose-400 hover:underline px-2 py-1.5"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Surfaced Workbook Contradictions & Method Rules */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-amber-400" />
          <h3 className="text-lg font-black text-white font-display">
            Workbook Discrepancies & Canonical Rules
          </h3>
        </div>

        <div className="space-y-2.5 text-xs text-slate-300">
          {CANONICAL_JNT2_RULES.surfacedContradictions.map((c, i) => (
            <div key={i} className="bg-slate-950/60 border border-slate-800 p-3 rounded-2xl">
              <strong className="text-amber-400 font-bold block">{c.topic}</strong>
              <p className="text-slate-400 mt-1 leading-relaxed">{c.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
