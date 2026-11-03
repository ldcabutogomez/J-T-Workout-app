import React, { useState, useEffect, useRef } from 'react';
import { Timer, X } from 'lucide-react';
import { feedback } from '../lib/feedback';
import { useDialog } from '../lib/useDialog';

export interface RestRequest {
  id: number;
  seconds: number;
}

interface RestTimerProps {
  /** Bump `id` to start a rest countdown without opening the panel (auto-start after a set). */
  restRequest?: RestRequest | null;
  /** Completed-set count; any change (a set logged or undone) acknowledges a finished rest. */
  setsLogged?: number;
  defaultT1Sec?: number;
  defaultT2Sec?: number;
  defaultT3Sec?: number;
  /** Whose timer this is. Each profile keeps its own, so two people sharing a phone never see each other's countdown. */
  profileId?: string;
}

export const RestTimer: React.FC<RestTimerProps> = ({
  restRequest = null,
  setsLogged = 0,
  defaultT1Sec = 240, // 4:00 (T1: 3-5 min)
  defaultT2Sec = 150, // 2:30 (T2: 2-3 min)
  defaultT3Sec = 90,  // 1:30 (T3: 60-90 sec)
  profileId = 'default',
}) => {
  const timerKey = `jnt2_active_timer_target:${profileId}`;
  // One-time cleanup of the old shared key, which any profile on this phone could pick up.
  useEffect(() => { try { localStorage.removeItem('jnt2_active_timer_target'); } catch { /* storage unavailable */ } }, []);
  const [targetEndTimestamp, setTargetEndTimestamp] = useState<number | null>(() => {
    const saved = localStorage.getItem(timerKey);
    if (saved) {
      const end = Number(saved);
      if (end > Date.now()) return end;
    }
    return null;
  });

  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    if (targetEndTimestamp) {
      return Math.max(0, Math.round((targetEndTimestamp - Date.now()) / 1000));
    }
    return 0;
  });

  const [isOpen, setIsOpen] = useState(false);
  const [restDone, setRestDone] = useState(false);
  const panelRef = useDialog({ onClose: () => setIsOpen(false), active: isOpen, modal: false });
  const [totalSeconds, setTotalSeconds] = useState<number>(() => Math.max(1, secondsRemaining));

  // Sync remaining seconds with timestamp even after app backgrounding
  useEffect(() => {
    if (!targetEndTimestamp) {
      localStorage.removeItem(timerKey);
      setSecondsRemaining(0);
      return;
    }

    localStorage.setItem(timerKey, targetEndTimestamp.toString());

    const updateTimer = () => {
      const rem = Math.max(0, Math.round((targetEndTimestamp - Date.now()) / 1000));
      setSecondsRemaining(rem);

      if (rem <= 0) {
        setTargetEndTimestamp(null);
        localStorage.removeItem(timerKey);
        feedback('timerEnd');
        setRestDone(true);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 500);
    return () => clearInterval(interval);
  }, [targetEndTimestamp]);

  const startTimer = (seconds: number, open = true) => {
    const end = Date.now() + seconds * 1000;
    setTargetEndTimestamp(end);
    setSecondsRemaining(seconds);
    setTotalSeconds(seconds);
    setRestDone(false);
    if (open) setIsOpen(true);
  };

  const lastRequestId = useRef(restRequest?.id ?? 0);
  useEffect(() => {
    if (!restRequest || restRequest.id === lastRequestId.current) return;
    lastRequestId.current = restRequest.id;
    startTimer(restRequest.seconds, false);
  }, [restRequest]);

  const adjustTimer = (deltaSec: number) => {
    if (!targetEndTimestamp) {
      startTimer(Math.max(15, deltaSec));
      return;
    }
    const newEnd = targetEndTimestamp + deltaSec * 1000;
    setTargetEndTimestamp(newEnd);
  };

  useEffect(() => { setRestDone(false); }, [setsLogged]);

  const cancelTimer = () => {
    setRestDone(false);
    setTargetEndTimestamp(null);
    localStorage.removeItem(timerKey);
    setSecondsRemaining(0);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const isRunning = targetEndTimestamp !== null && secondsRemaining > 0;
  const progress = isRunning ? Math.min(1, Math.max(0, secondsRemaining / Math.max(totalSeconds, secondsRemaining))) : 0;

  return (
    <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40">
      <div role="status" aria-live="polite" className="sr-only">{restDone ? 'Rest complete. Ready for the next set.' : ''}</div>
      {restDone && !isRunning && !isOpen && (
        <div className="mb-2 rounded-2xl bg-ok px-3 py-2 text-right text-xs font-black text-on-accent shadow-lg animate-pop">Rest complete · ready for the next set</div>
      )}
      {isOpen ? (
        <div ref={panelRef} tabIndex={-1} role="dialog" aria-label="Rest timer" className="bg-surface border border-line/80 shadow-sm rounded-3xl p-4 w-72 text-ink animate-pop">
          <div className="flex justify-between items-center pb-2 border-b border-line">
            <div className="flex items-center gap-1.5">
              <Timer className="w-4 h-4 text-accent-ink" />
              <span className="text-xs uppercase font-extrabold tracking-wider text-accent-ink">
                Rest Timer
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="min-h-11 min-w-11 flex items-center justify-center text-muted hover:text-ink rounded-lg hover:bg-sunk transition"
              aria-label="Close rest timer dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="text-center my-3">
            <span
              className={`text-5xl font-mono font-black tracking-tight ${
                isRunning ? 'text-accent-ink' : 'text-muted'
              }`}
            >
              {formatTime(secondsRemaining)}
            </span>
            <span className="text-xs block text-muted mt-1">
              {isRunning ? 'Resting between sets' : restDone ? 'Rest complete · ready for the next set' : 'Select target rest'}
            </span>
          </div>

          {/* Quick preset buttons based on GZCL Tier guidelines */}
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            <button
              onClick={() => startTimer(defaultT3Sec)}
              className="bg-sunk hover:bg-line text-ink py-2 rounded-xl text-xs font-bold transition active:scale-95 border border-line"
            >
              <span className="block text-xs text-accent-ink font-mono">T3</span>
              {formatTime(defaultT3Sec)}
            </button>
            <button
              onClick={() => startTimer(defaultT2Sec)}
              className="bg-sunk hover:bg-line text-ink py-2 rounded-xl text-xs font-bold transition active:scale-95 border border-line"
            >
              <span className="block text-xs text-accent-ink font-mono">T2</span>
              {formatTime(defaultT2Sec)}
            </button>
            <button
              onClick={() => startTimer(defaultT1Sec)}
              className="bg-sunk hover:bg-line text-ink py-2 rounded-xl text-xs font-bold transition active:scale-95 border border-line"
            >
              <span className="block text-xs text-accent-ink font-mono">T1</span>
              {formatTime(defaultT1Sec)}
            </button>
          </div>

          {/* Quick steppers */}
          <div className="flex gap-1.5 mb-3">
            <button
              onClick={() => adjustTimer(-15)}
              className="flex-1 bg-sunk/80 hover:bg-sunk text-ink-2 py-1.5 rounded-xl text-xs font-mono font-bold transition active:scale-95 border border-line"
            >
              -15s
            </button>
            <button
              onClick={() => adjustTimer(15)}
              className="flex-1 bg-sunk/80 hover:bg-sunk text-ink-2 py-1.5 rounded-xl text-xs font-mono font-bold transition active:scale-95 border border-line"
            >
              +15s
            </button>
            <button
              onClick={() => adjustTimer(30)}
              className="flex-1 bg-sunk/80 hover:bg-sunk text-ink-2 py-1.5 rounded-xl text-xs font-mono font-bold transition active:scale-95 border border-line"
            >
              +30s
            </button>
          </div>

          {isRunning && (
            <button
              onClick={cancelTimer}
              className="w-full bg-bad/10 hover:bg-bad/10 border border-bad/40 text-bad py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition active:scale-95"
            >
              Skip Rest
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className={`flex items-center gap-2.5 px-4 py-3 rounded-full font-bold shadow-sm transition-all border active:scale-95 ${
            isRunning
              ? 'bg-accent text-on-accent border-accent shadow-accent/20 animate-pulse-ring'
              : restDone
                ? 'bg-ok text-on-accent border-ok'
                : 'bg-surface text-ink border-line hover:bg-sunk hover:border-line'
          }`}
          aria-label="Open rest timer"
        >
          <span
            className="relative inline-flex h-6 w-6 items-center justify-center rounded-full"
            style={isRunning ? { background: `conic-gradient(var(--color-on-accent) ${progress * 360}deg, color-mix(in srgb, var(--color-on-accent) 30%, transparent) 0)` } : undefined}
          >
            <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full ${isRunning ? 'bg-accent' : ''}`}>
              <Timer className={`w-4 h-4 ${isRunning ? 'text-on-accent' : 'text-accent-ink'}`} />
            </span>
          </span>
          <span className="font-mono text-sm tracking-tight">
            {isRunning ? formatTime(secondsRemaining) : restDone ? 'Ready' : 'Rest'}
          </span>
        </button>
      )}
    </div>
  );
};
