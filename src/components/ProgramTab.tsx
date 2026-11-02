import React, { useEffect, useState } from 'react';
import type { LoadBasis, SourceReference, TrainingMaxKey, UserProfile } from '../types';
import { getDayPrescription, REQUIRED_TRAINING_MAXES } from '../engine/jnt2Engine';
import { WORKBOOK_AMBIGUITIES } from '../program/prescriptions';
import { findAlternative } from '../program/swapOptions';
import { AlertCircle, Check, Sliders } from 'lucide-react';

interface ProgramTabProps {
  profile: UserProfile | null;
  onUpdateProfile: (updated: UserProfile) => void;
}

function compact(values: Partial<Record<TrainingMaxKey, number>>) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => Number.isFinite(value) && value! > 0)) as Partial<Record<TrainingMaxKey, number>>;
}

function basisLabel(basis?: LoadBasis) {
  if (!basis) return 'No load';
  if (basis.kind === 'training_max') return `Block ${basis.block} ${basis.key.replace('_', ' ')} TM`;
  if (basis.kind === 'achieved_rm') return `today’s achieved RM in ${basis.slotId}`;
  return 'user-selected accessory load';
}

function formatSources(refs: SourceReference[]) {
  return refs.map((ref) => `${ref.sheet}!${ref.ranges.join(',')}`).join(' · ');
}

export function ProgramTab({ profile, onUpdateProfile }: ProgramTabProps) {
  const [week, setWeek] = useState(profile?.currentWeek ?? 1);
  const [day, setDay] = useState(profile?.currentDay ?? 1);
  const [editing, setEditing] = useState<1 | 2 | null>(null);
  const [draft, setDraft] = useState<Partial<Record<TrainingMaxKey, number>>>({});
  const [customizing, setCustomizing] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setWeek(profile.currentWeek);
    setDay(profile.currentDay);
  }, [profile?.id]);

  if (!profile) return null;
  const prescription = getDayPrescription(week, day, profile);

  const beginEdit = (block: 1 | 2) => {
    setEditing(block);
    setDraft(block === 1 ? profile.trainingMaxes : (profile.block2ConfirmedTMs ?? {}));
  };
  const save = () => {
    if (!editing) return;
    const values = compact(draft);
    onUpdateProfile(editing === 1
      ? { ...profile, trainingMaxes: values }
      : { ...profile, block2ConfirmedTMs: values, block2ConfirmedAt: Date.now() });
    setEditing(null);
  };

  const renderTmCard = (block: 1 | 2) => {
    const values = block === 1 ? profile.trainingMaxes : (profile.block2ConfirmedTMs ?? {});
    const isEditing = editing === block;
    const complete = REQUIRED_TRAINING_MAXES.every(({ key }) => Number(values[key]) > 0);
    return (
      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
        <div className="flex justify-between items-start gap-3">
          <div><h2 className="text-lg font-black">Block {block} training maxes</h2><p className="text-[11px] text-slate-400">Personal estimated daily 2RMs · {block === 1 ? 'source inputs E4:E7 and O5' : 'separate source inputs AI4:AI7 and AS5'}</p></div>
          <button onClick={() => isEditing ? save() : beginEdit(block)} className={`px-3 py-2 rounded-xl text-xs font-bold ${isEditing ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 border border-slate-700'}`}>{isEditing ? <><Check className="inline w-3 h-3 mr-1" />Save</> : <><Sliders className="inline w-3 h-3 mr-1" />Edit</>}</button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
          {REQUIRED_TRAINING_MAXES.map(({ key, label }) => (
            <label key={key} className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3 text-[10px] uppercase font-bold text-slate-400">{label}
              {isEditing ? <input type="number" min="0" step={profile.equipmentIncrement} value={draft[key] ?? ''} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value === '' ? undefined : Number(event.target.value) }))} className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-base normal-case text-amber-400 font-mono" /> : <span className="block mt-1 text-base normal-case text-amber-400 font-mono">{values[key] ? `${values[key]} ${profile.unit}` : 'Not set'}</span>}
            </label>
          ))}
        </div>
        <p className={`text-xs mt-3 ${complete ? 'text-emerald-400' : 'text-amber-300'}`}>{complete ? `Block ${block} TMs confirmed${block === 2 && profile.block2ConfirmedAt ? ` on ${new Date(profile.block2ConfirmedAt).toLocaleDateString()}` : ''}.` : `Block ${block} setup is incomplete. No workbook example values will be substituted.`}</p>
        {block === 2 && <p className="text-[11px] text-slate-500 mt-1">These values are stored separately and are never auto-increased or replaced with a test 1RM.</p>}
      </section>
    );
  };

  return (
    <div className="space-y-4">
      {renderTmCard(1)}
      {renderTmCard(2)}

      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl space-y-4">
        <div className="flex justify-between items-start gap-3"><div><h2 className="text-lg font-black">12-week workbook browser</h2><p className="text-xs text-slate-400">Original J&amp;T2.0 sheets, not the General Gainz hybrid</p></div><button onClick={() => setCustomizing((value) => !value)} className="text-xs text-amber-400 font-bold">{customizing ? 'Done' : 'Customize accessories'}</button></div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => <button key={value} onClick={() => setWeek(value)} className={`shrink-0 min-w-12 py-2 rounded-xl text-xs font-mono font-bold ${week === value ? 'bg-amber-500 text-slate-950' : value === profile.currentWeek ? 'border border-amber-700 bg-slate-800 text-amber-300' : 'bg-slate-950 text-slate-400'}`}>W{value}</button>)}
        </div>
        <div className="grid grid-cols-4 gap-1 bg-slate-950 p-1 rounded-2xl">
          {[1, 2, 3, 4].map((value) => <button key={value} onClick={() => setDay(value)} className={`min-h-10 rounded-xl text-xs font-bold ${day === value ? 'bg-slate-800 text-amber-400' : 'text-slate-400'}`}>Day {value}</button>)}
        </div>
        <div className="space-y-2">
          {prescription.exercises.map((slot) => {
            const mayCustomize = customizing && slot.loadBasis?.kind === 'user_selected' && slot.tier !== 'T1' && (slot.status === 'work' || slot.status === 'test');
            return <article key={slot.slotId} className={`bg-slate-950/70 border rounded-2xl p-4 ${slot.ambiguity ? 'border-amber-700' : 'border-slate-800'}`}>
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex gap-2 items-center flex-wrap"><span className="text-[10px] px-2 py-0.5 bg-slate-800 rounded font-black text-amber-300">{slot.tier}</span>{mayCustomize ? <input aria-label={`Customize ${slot.slotId}`} value={slot.exerciseName} onChange={(event) => onUpdateProfile({ ...profile, exerciseCustomizations: { ...profile.exerciseCustomizations, [slot.slotId]: event.target.value } })} className="min-w-0 flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-sm font-bold" /> : <strong className="text-sm">{slot.exerciseName}</strong>}<span className="text-[10px] uppercase text-slate-500">{slot.status}</span></div>
                <p className="text-xs text-slate-400 mt-1">{slot.setCount ? `${slot.setCount} logged set${slot.setCount === 1 ? '' : 's'} · ${slot.repTarget ?? '—'} reps${slot.percentage ? ` · ${slot.percentage * 100}%` : ''}` : slot.notes}</p>
                <p className="text-[11px] text-slate-500 mt-1">Load basis: {basisLabel(slot.loadBasis)}</p>
                {slot.ambiguity && <p className="text-xs text-amber-300 mt-2"><AlertCircle className="inline w-4 h-4 mr-1" />{slot.ambiguity}</p>}
              </div></div>
              <p className="text-[9px] font-mono text-slate-600 mt-2 break-all">{formatSources(slot.sourceRefs)}</p>
            </article>;
          })}
        </div>
      </section>

      {Object.keys(profile.exerciseSwaps ?? {}).length > 0 && (
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-2">
          <div className="flex items-center justify-between gap-3"><h2 className="font-black">Swapped accessories</h2><button onClick={() => onUpdateProfile({ ...profile, exerciseSwaps: {} })} className="px-3 py-2 rounded-xl bg-slate-800 text-xs font-bold">Reset all</button></div>
          {Object.entries(profile.exerciseSwaps ?? {}).map(([key, alternativeId]) => {
            const [slotId, original] = key.split('::');
            return <div key={key} className="flex items-center justify-between gap-3 bg-slate-950 border border-slate-800 rounded-2xl p-3 text-xs"><span className="min-w-0"><strong className="text-white">{findAlternative(alternativeId)?.alternative.name ?? alternativeId}</strong><span className="block text-slate-500">replaces {original} · {slotId}</span></span><button onClick={() => { const next = { ...profile.exerciseSwaps }; delete next[key]; onUpdateProfile({ ...profile, exerciseSwaps: next }); }} className="px-3 py-2 rounded-xl text-amber-300 font-bold">Reset</button></div>;
          })}
        </section>
      )}

      <section className="bg-slate-900 border border-amber-900/60 rounded-3xl p-5"><h2 className="font-black text-amber-300">Workbook ambiguity log</h2>{WORKBOOK_AMBIGUITIES.map((item) => <div key={item.id} className="mt-3 text-xs"><strong>{item.id}</strong><p className="text-slate-400 mt-1">{item.decision}</p><p className="font-mono text-[9px] text-slate-600 mt-1 break-all">{item.cells.join(' · ')}</p></div>)}</section>
    </div>
  );
}
