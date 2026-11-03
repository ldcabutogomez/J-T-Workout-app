import { useMemo, useState } from 'react';
import type { WorkoutSession } from '../types';
import { useDialog } from '../lib/useDialog';
import { slug } from '../lib/slug';
import { knownExercises } from '../program/extraCatalog';
import { EXTRA_NAME_MAX, EXTRA_NAME_MIN, cleanExerciseName } from '../engine/sessionEngine';

interface Props {
  history: WorkoutSession[];
  /** Exercise ids already in this workout; they can't be added twice. */
  existingIds: string[];
  /** Resolves true when the exercise was added (the sheet then closes). */
  onAdd: (name: string) => Promise<boolean>;
  onClose: () => void;
}

/** Pick an exercise to add to the workout: the app's list, ones you've added before, or one you type. */
export function AddExerciseSheet({ history, existingIds, onAdd, onClose }: Props) {
  const dialogRef = useDialog({ onClose });
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  // Exercises added in earlier workouts, most recent first, so a regular extra is one tap away.
  const past = useMemo(() => {
    const seen = new Map<string, string>();
    [...history]
      .sort((a, b) => (b.completedTime ?? b.startTime) - (a.completedTime ?? a.startTime))
      .forEach((session) => session.exercises.filter((exercise) => exercise.isExtra).forEach((exercise) => { if (!seen.has(exercise.exerciseId)) seen.set(exercise.exerciseId, exercise.exerciseName); }));
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [history]);
  const catalog = useMemo(() => knownExercises(), []);

  const needle = query.trim().toLowerCase();
  const matches = (name: string) => needle === '' || name.toLowerCase().includes(needle);
  const pastShown = past.filter((item) => matches(item.name));
  const pastIds = new Set(past.map((item) => item.id));
  const catalogShown = catalog.filter((item) => !pastIds.has(item.id) && matches(item.name));
  const typed = cleanExerciseName(query);
  const typedId = slug(typed);
  const canAddTyped = typed.length >= EXTRA_NAME_MIN && typedId !== '' && ![...pastShown, ...catalogShown].some((item) => item.id === typedId);

  const choose = async (name: string) => {
    setBusy(true);
    const added = await onAdd(name);
    setBusy(false);
    if (added) onClose();
  };

  const row = (item: { id: string; name: string }) => {
    const taken = existingIds.includes(item.id);
    return (
      <button key={item.id} type="button" disabled={taken || busy} onClick={() => void choose(item.name)} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-line bg-paper px-3 text-left text-sm font-bold text-ink disabled:opacity-50">
        <span>{item.name}</span>
        {taken && <span className="text-xs font-normal text-muted">Already in this workout</span>}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Add exercise" className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-t-3xl border border-line bg-surface p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <h2 className="text-xl font-black">Add an exercise</h2>
        <p className="mt-0.5 text-sm text-muted">Extra work on top of today's workout. It never changes whether the workout counts as finished.</p>
        <input
          autoFocus
          value={query}
          maxLength={EXTRA_NAME_MAX}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search or type a name"
          aria-label="Search or type an exercise name"
          className="field mt-3"
        />
        <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
          {canAddTyped && (
            <button type="button" disabled={busy || existingIds.includes(typedId)} onClick={() => void choose(typed)} className="flex min-h-12 w-full items-center rounded-xl border-2 border-accent bg-accent/10 px-3 text-left text-sm font-black text-accent-ink disabled:opacity-50">Add “{typed}”</button>
          )}
          {pastShown.length > 0 && <p className="eyebrow pt-1">Your extras</p>}
          {pastShown.map(row)}
          {catalogShown.length > 0 && <p className="eyebrow pt-1">All exercises</p>}
          {catalogShown.map(row)}
          {!canAddTyped && pastShown.length === 0 && catalogShown.length === 0 && <p className="rounded-xl bg-sunk p-3 text-xs text-muted">No match. Keep typing a name of at least {EXTRA_NAME_MIN} letters to add your own.</p>}
        </div>
        <button type="button" onClick={onClose} className="btn-secondary mt-3 w-full">Cancel</button>
      </div>
    </div>
  );
}
