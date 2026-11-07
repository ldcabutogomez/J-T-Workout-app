import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react';
import type { CustomExerciseTemplate, CustomSetTemplate, CustomWorkoutTemplate, UserProfile } from '../types';
import { knownExercises } from '../program/extraCatalog';
import { newCustomTemplate } from '../engine/customWorkouts';

const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const makeSet = (): CustomSetTemplate => ({ id: uid('set'), mode: 'standard', reps: 8 });

export function CustomWorkouts({ profile, activeWorkout, onSave, onStart }: {
  profile: UserProfile;
  activeWorkout: boolean;
  onSave: (profile: UserProfile) => void;
  onStart: (template: CustomWorkoutTemplate) => void;
}) {
  const templates = profile.customWorkoutTemplates ?? [];
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? '');
  const selected = templates.find((template) => template.id === selectedId) ?? templates[0];
  const catalog = useMemo(() => knownExercises(), []);
  const saveTemplates = (next: CustomWorkoutTemplate[]) => onSave({ ...profile, customWorkoutTemplates: next });
  const change = (update: (template: CustomWorkoutTemplate) => CustomWorkoutTemplate) => {
    if (!selected) return;
    saveTemplates(templates.map((template) => template.id === selected.id ? { ...update(template), updatedAt: Date.now() } : template));
  };
  const create = () => {
    const template = newCustomTemplate();
    saveTemplates([...templates, template]); setSelectedId(template.id);
  };
  const move = (index: number, offset: number) => change((template) => {
    const exercises = [...template.exercises]; const target = index + offset;
    if (target < 0 || target >= exercises.length) return template;
    [exercises[index], exercises[target]] = [exercises[target], exercises[index]];
    return { ...template, exercises };
  });
  const updateExercise = (id: string, update: (exercise: CustomExerciseTemplate) => CustomExerciseTemplate) => change((template) => ({ ...template, exercises: template.exercises.map((exercise) => exercise.id === id ? update(exercise) : exercise) }));

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Build your own</p><h2 className="text-xl font-black">Custom workouts</h2><p className="mt-1 text-xs text-muted">Custom sessions count toward goals and analytics without advancing J&amp;T.</p></div><button type="button" onClick={create} className="btn-secondary shrink-0"><Plus className="h-4 w-4" />New</button></div>
      {templates.length > 0 && <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar">{templates.map((template) => <button key={template.id} onClick={() => setSelectedId(template.id)} className={`min-h-11 shrink-0 rounded-xl px-3 text-sm font-bold ${selected?.id === template.id ? 'bg-accent text-on-accent' : 'bg-sunk text-ink'}`}>{template.name}</button>)}</div>}
      {!selected ? <button type="button" onClick={create} className="mt-4 w-full rounded-2xl border border-dashed border-line bg-paper p-5 text-sm font-bold text-accent-ink">Create your first custom workout</button> : (
        <div className="mt-4 space-y-3">
          <div className="flex gap-2"><input value={selected.name} maxLength={60} onChange={(event) => change((template) => ({ ...template, name: event.target.value }))} aria-label="Custom workout name" className="field flex-1" /><button type="button" onClick={() => { const copy = { ...structuredClone(selected), id: uid('custom-template'), name: `${selected.name} copy`, createdAt: Date.now(), updatedAt: Date.now() }; saveTemplates([...templates, copy]); setSelectedId(copy.id); }} className="btn-secondary px-3" aria-label="Duplicate workout"><Copy className="h-4 w-4" /></button><button type="button" onClick={() => { if (window.confirm(`Delete ${selected.name}? Completed workouts stay in history.`)) { saveTemplates(templates.filter((template) => template.id !== selected.id)); setSelectedId(''); } }} className="btn-danger px-3" aria-label="Delete custom workout"><Trash2 className="h-4 w-4" /></button></div>
          {selected.exercises.map((exercise, index) => (
            <article key={exercise.id} className="rounded-2xl border border-line bg-paper p-3">
              <div className="flex items-center gap-2"><strong className="min-w-0 flex-1 truncate text-sm">{index + 1}. {exercise.name}</strong><button disabled={index === 0} onClick={() => move(index, -1)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-sunk disabled:opacity-30" aria-label={`Move ${exercise.name} up`}><ArrowUp className="h-4 w-4" /></button><button disabled={index === selected.exercises.length - 1} onClick={() => move(index, 1)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-sunk disabled:opacity-30" aria-label={`Move ${exercise.name} down`}><ArrowDown className="h-4 w-4" /></button><button onClick={() => change((template) => ({ ...template, exercises: template.exercises.filter((item) => item.id !== exercise.id) }))} className="flex h-9 w-9 items-center justify-center text-bad" aria-label={`Remove ${exercise.name}`}><Trash2 className="h-4 w-4" /></button></div>
              <div className="mt-2 space-y-2">{exercise.sets.map((set, setIndex) => <div key={set.id} className="grid grid-cols-[1fr_5rem_3rem] items-end gap-2 rounded-xl bg-surface p-2"><label className="text-xs font-bold text-muted">Set {setIndex + 1}<select value={set.mode} onChange={(event) => updateExercise(exercise.id, (item) => ({ ...item, sets: item.sets.map((entry) => entry.id === set.id ? { ...entry, mode: event.target.value as CustomSetTemplate['mode'], ...(event.target.value === 'drop' ? { stages: entry.stages ?? 2 } : {}) } : entry) }))} className="field mt-1"><option value="standard">Standard</option><option value="failure">To failure</option><option value="drop">Drop set</option></select></label><label className="text-xs font-bold text-muted">{set.mode === 'drop' ? 'Stages' : 'Reps'}<input type="number" min={set.mode === 'drop' ? 2 : 0} max={set.mode === 'drop' ? 5 : 200} value={set.mode === 'drop' ? set.stages ?? 2 : set.reps} disabled={set.mode === 'failure'} onChange={(event) => updateExercise(exercise.id, (item) => ({ ...item, sets: item.sets.map((entry) => entry.id === set.id ? set.mode === 'drop' ? { ...entry, stages: Number(event.target.value) } : { ...entry, reps: Number(event.target.value) } : entry) }))} className="field mt-1 px-2" /></label><button disabled={exercise.sets.length === 1} onClick={() => updateExercise(exercise.id, (item) => ({ ...item, sets: item.sets.filter((entry) => entry.id !== set.id) }))} className="mb-1 flex h-10 w-10 items-center justify-center text-bad disabled:opacity-30" aria-label={`Remove set ${setIndex + 1}`}><Trash2 className="h-4 w-4" /></button></div>)}</div>
              <button onClick={() => updateExercise(exercise.id, (item) => ({ ...item, sets: [...item.sets, makeSet()] }))} className="mt-2 min-h-10 text-xs font-bold text-accent-ink">+ Add set</button>
            </article>
          ))}
          <label className="block text-xs font-bold uppercase text-muted">Add exercise<select defaultValue="" onChange={(event) => { const found = catalog.find((item) => item.id === event.target.value); if (!found) return; change((template) => ({ ...template, exercises: [...template.exercises, { id: uid('exercise'), exerciseId: found.id, name: found.name, sets: [makeSet()] }] })); event.target.value = ''; }} className="field mt-1 normal-case"><option value="">Choose an exercise…</option>{catalog.filter((item) => !selected.exercises.some((exercise) => exercise.exerciseId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <button type="button" disabled={activeWorkout || !selected.exercises.length || !selected.name.trim()} onClick={() => onStart(selected)} className="btn-primary w-full">{activeWorkout ? 'Finish current workout first' : 'Start custom workout'}</button>
        </div>
      )}
    </section>
  );
}
