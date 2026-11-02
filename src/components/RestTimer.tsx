import React, { useState, useEffect } from 'react';
import { Timer, X, Volume2 } from 'lucide-react';

interface RestTimerProps {
  defaultT1Sec?: number;
  defaultT2Sec?: number;
  defaultT3Sec?: number;
}

export const RestTimer: React.FC<RestTimerProps> = ({
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
        playChime();
        if ('vibrate' in navigator) {
          try {
            navigator.vibrate([200, 100, 200, 100, 400]);
          } catch (e) {}
        }
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 500);
    return () => clearInterval(interval);
  }, [targetEndTimestamp]);

  const playChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.25); // A5
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
      osc.start();
      osc.stop(ctx.currentTime + 0.65);
    } catch (e) {}
  };

  const startTimer = (seconds: number) => {
    const end = Date.now() + seconds * 1000;
    setTargetEndTimestamp(end);
    setSecondsRemaining(seconds);
    setIsOpen(true);
  };

  const adjustTimer = (deltaSec: number) => {
    if (!targetEndTimestamp) {
      startTimer(Math.max(15, deltaSec));
      return;
    }
    const newEnd = targetEndTimestamp + deltaSec * 1000;
    setTargetEndTimestamp(newEnd);
  };

  const cancelTimer = () => {
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

  return (
    <div className="fixed bottom-20 right-4 z-40">
      {isOpen ? (
        <div className="bg-slate-900/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 shadow-2xl rounded-3xl p-4 w-72 text-slate-100 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex justify-between items-center pb-2 border-b border-slate-800">
            <div className="flex items-center gap-1.5">
              <Timer className="w-4 h-4 text-amber-400" />
              <span className="text-xs uppercase font-extrabold tracking-wider text-amber-400">
                Rest Timer
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition"
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
              {isRunning ? 'Resting between sets' : 'Select target rest'}
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
              Reset Timer
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className={`flex items-center gap-2.5 px-4 py-3 rounded-full font-bold shadow-2xl transition-all border ${
            isRunning
              ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-amber-500/20'
              : 'bg-slate-900 text-slate-200 border-slate-700 hover:bg-slate-800 hover:border-slate-600'
          }`}
          aria-label="Open rest timer"
        >
          <Timer className={`w-4 h-4 ${isRunning ? 'animate-spin text-slate-950' : 'text-amber-400'}`} />
          <span className="font-mono text-sm tracking-tight">
            {isRunning ? formatTime(secondsRemaining) : 'Rest'}
          </span>
        </button>
      )}
    </div>
  );
};
