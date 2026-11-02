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
}

export const RestTimer: React.FC<RestTimerProps> = ({
  restRequest = null,
  setsLogged = 0,
  defaultT1Sec = 240, // 4:00 (T1: 3-5 min)
  defaultT2Sec = 150, // 2:30 (T2: 2-3 min)
  defaultT3Sec = 90,  // 1:30 (T3: 60-90 sec)
}) => {
  const [targetEndTimestamp, setTargetEndTimestamp] = useState<number | null>(() => {
    const saved = localStorage.getItem('jnt2_active_timer_target');
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
      localStorage.removeItem('jnt2_active_timer_target');
      setSecondsRemaining(0);
      return;
    }

    localStorage.setItem('jnt2_active_timer_target', targetEndTimestamp.toString());

    const updateTimer = () => {
      const rem = Math.max(0, Math.round((targetEndTimestamp - Date.now()) / 1000));
      setSecondsRemaining(rem);

      if (rem <= 0) {
        setTargetEndTimestamp(null);
        localStorage.removeItem('jnt2_active_timer_target');
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
    localStorage.removeItem('jnt2_active_timer_target');
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
    <div className="fixed bottom-20 right-4 z-40">
      <div role="status" aria-live="polite" className="sr-only">{restDone ? 'Rest complete. Ready for the next set.' : ''}</div>
      {restDone && !isRunning && !isOpen && (
        <div className="mb-2 rounded-2xl bg-emerald-500 px-3 py-2 text-right text-xs font-black text-slate-950 shadow-lg animate-pop">Rest complete · ready for the next set</div>
      )}
      {isOpen ? (
        <div ref={panelRef} tabIndex={-1} role="dialog" aria-label="Rest timer" className="bg-slate-900/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 shadow-2xl rounded-3xl p-4 w-72 text-slate-100 animate-pop">
          <div className="flex justify-between items-center pb-2 border-b border-slate-800">
            <div className="flex items-center gap-1.5">
              <Timer className="w-4 h-4 text-amber-400" />
              <span className="text-xs uppercase font-extrabold tracking-wider text-amber-400">
                Rest Timer
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="min-h-11 min-w-11 flex items-center justify-center text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition"
              aria-label="Close rest timer dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="text-center my-3">
            <span
              className={`text-5xl font-mono font-black tracking-tight ${
                isRunning ? 'text-amber-400' : 'text-slate-400'
              }`}
            >
              {formatTime(secondsRemaining)}
            </span>
            <span className="text-[11px] block text-slate-400 mt-1">
              {isRunning ? 'Resting between sets' : restDone ? 'Rest complete · ready for the next set' : 'Select target rest'}
            </span>
          </div>

          {/* Quick preset buttons based on GZCL Tier guidelines */}
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            <button
              onClick={() => startTimer(defaultT3Sec)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 py-2 rounded-xl text-xs font-bold transition active:scale-95 border border-slate-700"
            >
              <span className="block text-[10px] text-amber-400 font-mono">T3</span>
              {formatTime(defaultT3Sec)}
            </button>
            <button
              onClick={() => startTimer(defaultT2Sec)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 py-2 rounded-xl text-xs font-bold transition active:scale-95 border border-slate-700"
            >
              <span className="block text-[10px] text-amber-400 font-mono">T2</span>
              {formatTime(defaultT2Sec)}
            </button>
            <button
              onClick={() => startTimer(defaultT1Sec)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 py-2 rounded-xl text-xs font-bold transition active:scale-95 border border-slate-700"
            >
              <span className="block text-[10px] text-amber-400 font-mono">T1</span>
              {formatTime(defaultT1Sec)}
            </button>
          </div>

          {/* Quick steppers */}
          <div className="flex gap-1.5 mb-3">
            <button
              onClick={() => adjustTimer(-15)}
              className="flex-1 bg-slate-800/80 hover:bg-slate-700 text-slate-300 py-1.5 rounded-xl text-xs font-mono font-bold transition active:scale-95 border border-slate-800"
            >
              -15s
            </button>
            <button
              onClick={() => adjustTimer(15)}
              className="flex-1 bg-slate-800/80 hover:bg-slate-700 text-slate-300 py-1.5 rounded-xl text-xs font-mono font-bold transition active:scale-95 border border-slate-800"
            >
              +15s
            </button>
            <button
              onClick={() => adjustTimer(30)}
              className="flex-1 bg-slate-800/80 hover:bg-slate-700 text-slate-300 py-1.5 rounded-xl text-xs font-mono font-bold transition active:scale-95 border border-slate-800"
            >
              +30s
            </button>
          </div>

          {isRunning && (
            <button
              onClick={cancelTimer}
              className="w-full bg-rose-950/70 hover:bg-rose-900 border border-rose-800/70 text-rose-300 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition active:scale-95"
            >
              Skip Rest
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className={`flex items-center gap-2.5 px-4 py-3 rounded-full font-bold shadow-2xl transition-all border active:scale-95 ${
            isRunning
              ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-amber-500/20 animate-pulse-ring'
              : restDone
                ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                : 'bg-slate-900 text-slate-200 border-slate-700 hover:bg-slate-800 hover:border-slate-600'
          }`}
          aria-label="Open rest timer"
        >
          <span
            className="relative inline-flex h-6 w-6 items-center justify-center rounded-full"
            style={isRunning ? { background: `conic-gradient(#0f172a ${progress * 360}deg, rgb(15 23 42 / 0.2) 0)` } : undefined}
          >
            <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full ${isRunning ? 'bg-amber-500' : ''}`}>
              <Timer className={`w-4 h-4 ${isRunning ? 'text-slate-950' : 'text-amber-400'}`} />
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
