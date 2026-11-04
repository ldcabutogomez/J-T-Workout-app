import { useMemo, useState, type FormEvent } from 'react';
import { Footprints, Gauge, Timer, X } from 'lucide-react';
import type { RunDistanceUnit, RunType } from '../types';
import { distanceToMeters, formatRunPace, RUN_TYPE_LABELS } from '../engine/runs';
import { toDateKey } from '../engine/schedule';
import { useDialog } from '../lib/useDialog';

export interface ManualRunInput {
  startTime: number;
  durationSeconds: number;
  distanceMeters: number;
  distanceUnit: RunDistanceUnit;
  runType: RunType;
  effort?: number;
  notes?: string;
}

interface RunLogSheetProps {
  defaultUnit: RunDistanceUnit;
  onSave: (run: ManualRunInput) => Promise<void>;
  onClose: () => void;
}

const timeValue = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

export function RunLogSheet({ defaultUnit, onSave, onClose }: RunLogSheetProps) {
  const now = useMemo(() => new Date(), []);
  const [date, setDate] = useState(() => toDateKey(now));
  const [time, setTime] = useState(() => timeValue(now));
  const [distance, setDistance] = useState('');
  const [unit, setUnit] = useState<RunDistanceUnit>(defaultUnit);
  const [minutes, setMinutes] = useState('');
  const [seconds, setSeconds] = useState('');
  const [runType, setRunType] = useState<RunType>('easy');
  const [effort, setEffort] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useDialog<HTMLFormElement>({ onClose });

  const distanceNumber = Number(distance);
  const durationSeconds = Number(minutes || 0) * 60 + Number(seconds || 0);
  const distanceMeters = distanceToMeters(distanceNumber, unit);
  const pace = distanceNumber > 0 && durationSeconds > 0 ? formatRunPace(durationSeconds, distanceMeters, unit) : 'Enter distance and time';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const startTime = new Date(`${date}T${time}:00`).getTime();
    const wholeMinutes = Number(minutes || 0);
    const wholeSeconds = Number(seconds || 0);
    if (!Number.isFinite(startTime)) return setError('Choose a valid date and time.');
    if (startTime > Date.now() + 5 * 60_000) return setError('A logged run cannot start in the future.');
    if (!(distanceNumber > 0) || distanceNumber > 1000) return setError(`Enter a distance between 0 and 1,000 ${unit}.`);
    if (!Number.isInteger(wholeMinutes) || wholeMinutes < 0 || !Number.isInteger(wholeSeconds) || wholeSeconds < 0 || wholeSeconds > 59 || durationSeconds <= 0) {
      return setError('Enter elapsed minutes and seconds; seconds must be from 0 to 59.');
    }
    setBusy(true);
    try {
      await onSave({
        startTime,
        durationSeconds,
        distanceMeters,
        distanceUnit: unit,
        runType,
        ...(effort ? { effort: Number(effort) } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      onClose();
    } catch (reason) {
      setError((reason as Error).message || 'The run could not be saved.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60" onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <form ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="run-log-heading" onSubmit={submit} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-line bg-surface p-5 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gold/15 text-gold-ink"><Footprints className="h-5 w-5" aria-hidden /></span>
            <div><p className="eyebrow">Supplemental activity</p><h2 id="run-log-heading" className="text-2xl font-black">Log a run</h2></div>
          </div>
          <button type="button" disabled={busy} onClick={onClose} aria-label="Close run logger" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-sunk"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <label className="text-xs font-bold uppercase text-muted">Date<input required type="date" value={date} max={toDateKey(new Date())} onChange={(event) => setDate(event.target.value)} className="field mt-1 normal-case" /></label>
          <label className="text-xs font-bold uppercase text-muted">Start time<input required type="time" value={time} onChange={(event) => setTime(event.target.value)} className="field mt-1 normal-case" /></label>
        </div>

        <div className="mt-3 grid grid-cols-[1fr_6rem] gap-3">
          <label className="text-xs font-bold uppercase text-muted">Distance<input required type="number" inputMode="decimal" min="0.01" max="1000" step="0.01" value={distance} onChange={(event) => setDistance(event.target.value)} placeholder="3.10" className="field mt-1 normal-case" /></label>
          <label className="text-xs font-bold uppercase text-muted">Unit<select value={unit} onChange={(event) => setUnit(event.target.value as RunDistanceUnit)} className="field mt-1 normal-case"><option value="mi">Miles</option><option value="km">Kilometers</option></select></label>
        </div>

        <fieldset className="mt-3">
          <legend className="text-xs font-bold uppercase text-muted">Elapsed time</legend>
          <div className="mt-1 grid grid-cols-2 gap-3">
            <label className="relative"><span className="sr-only">Minutes</span><input required type="number" inputMode="numeric" min="0" max="10079" step="1" value={minutes} onChange={(event) => setMinutes(event.target.value)} placeholder="Minutes" className="field pr-12" /><span className="pointer-events-none absolute right-3 top-3 text-xs font-bold text-muted">min</span></label>
            <label className="relative"><span className="sr-only">Seconds</span><input type="number" inputMode="numeric" min="0" max="59" step="1" value={seconds} onChange={(event) => setSeconds(event.target.value)} placeholder="Seconds" className="field pr-12" /><span className="pointer-events-none absolute right-3 top-3 text-xs font-bold text-muted">sec</span></label>
          </div>
        </fieldset>

        <div className="mt-3 rounded-2xl border border-gold/30 bg-gold/10 p-3" aria-live="polite">
          <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-xs font-bold uppercase text-gold-ink"><Gauge className="h-4 w-4" aria-hidden />Average pace</span><strong className="font-mono text-xl text-ink">{pace}</strong></div>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted"><Timer className="h-3.5 w-3.5" aria-hidden />Calculated from elapsed time.</p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-xs font-bold uppercase text-muted">Run type<select value={runType} onChange={(event) => setRunType(event.target.value as RunType)} className="field mt-1 normal-case">{Object.entries(RUN_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-xs font-bold uppercase text-muted">Effort, optional<select value={effort} onChange={(event) => setEffort(event.target.value)} className="field mt-1 normal-case"><option value="">Not recorded</option>{Array.from({ length: 10 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value} / 10</option>)}</select></label>
        </div>

        <label className="mt-3 block text-xs font-bold uppercase text-muted">Notes, optional<textarea value={notes} maxLength={500} rows={2} onChange={(event) => setNotes(event.target.value)} placeholder="Route, weather, how it felt…" className="field mt-1 min-h-16 py-2 normal-case" /></label>
        {error && <p role="alert" className="mt-3 text-sm font-bold text-bad">{error}</p>}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" disabled={busy} onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Save run'}</button>
        </div>
      </form>
    </div>
  );
}
