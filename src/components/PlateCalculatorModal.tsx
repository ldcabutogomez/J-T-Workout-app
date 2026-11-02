import React from 'react';
import { X } from 'lucide-react';
import { calculateBarbellPlates } from '../engine/jnt2Engine';
import { WeightUnit } from '../types';
import { useDialog } from '../lib/useDialog';

interface PlateCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetWeight: number;
  barbellWeight: number;
  unit: WeightUnit;
}

export const PlateCalculatorModal: React.FC<PlateCalculatorModalProps> = ({
  isOpen,
  onClose,
  targetWeight,
  barbellWeight,
  unit,
}) => {
  const dialogRef = useDialog({ onClose, active: isOpen });
  if (!isOpen) return null;

  const plates = calculateBarbellPlates(targetWeight, barbellWeight, unit);
  const totalPlateWeight = plates.reduce((sum, p) => sum + p.plate * p.countPerSide * 2, 0);
  const totalBarbellWeight = totalPlateWeight + barbellWeight;
  const perSideTotal = plates.reduce((sum, p) => sum + p.plate * p.countPerSide, 0);

  // Color mapping for plates
  const getPlateColor = (plate: number) => {
    if (unit === 'lb') {
      if (plate === 45) return 'bg-blue-600 text-white border-blue-400';
      if (plate === 35) return 'bg-amber-600 text-white border-amber-400';
      if (plate === 25) return 'bg-emerald-600 text-white border-emerald-400';
      if (plate === 10) return 'bg-white text-slate-900 border-slate-300';
      if (plate === 5) return 'bg-rose-600 text-white border-rose-400';
      return 'bg-slate-400 text-slate-900 border-slate-300';
    } else {
      if (plate === 25) return 'bg-rose-600 text-white border-rose-400';
      if (plate === 20) return 'bg-blue-600 text-white border-blue-400';
      if (plate === 15) return 'bg-amber-500 text-slate-950 border-amber-300';
      if (plate === 10) return 'bg-emerald-600 text-white border-emerald-400';
      if (plate === 5) return 'bg-white text-slate-900 border-slate-300';
      if (plate === 2.5) return 'bg-slate-800 text-white border-slate-600';
      return 'bg-slate-500 text-white border-slate-400';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Barbell plate calculator" className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-5 text-white shadow-2xl space-y-4">
        <div className="flex justify-between items-center pb-2 border-b border-slate-800">
          <div>
            <h3 className="text-lg font-black tracking-tight text-white font-display">
              Barbell Plate Calculator
            </h3>
            <p className="text-xs text-slate-400">
              Target: <strong className="text-amber-400">{targetWeight} {unit}</strong> (Bar: {barbellWeight} {unit})
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Visual Barbell Representation */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 flex flex-col items-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
            Plates to load per side ({perSideTotal} {unit})
          </span>

          <div className="flex items-center gap-1.5 overflow-x-auto py-2 px-1 w-full justify-center">
            {/* Bar sleeve */}
            <div className="h-4 w-6 bg-slate-700 rounded-l flex-shrink-0" title="Bar Collar" />

            {plates.length === 0 ? (
              <span className="text-xs text-slate-500 font-mono italic">Empty Bar ({barbellWeight} {unit})</span>
            ) : (
              plates.map((item) =>
                Array.from({ length: item.countPerSide }).map((_, i) => (
                  <div
                    key={`${item.plate}-${i}`}
                    className={`h-20 min-w-[20px] px-1 rounded flex flex-col items-center justify-center font-mono font-bold text-[10px] border shadow-md flex-shrink-0 ${getPlateColor(
                      item.plate
                    )}`}
                  >
                    <span>{item.plate}</span>
                  </div>
                ))
              )
            )}

            {/* Collar clip */}
            <div className="h-6 w-2 bg-amber-400 rounded-r flex-shrink-0" title="Collar Lock" />
          </div>
        </div>

        {/* Detailed Plate Breakdown Table */}
        <div className="space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Per-Side Breakdown
          </span>
          {plates.length === 0 ? (
            <p className="text-xs text-slate-400 bg-slate-950/40 p-3 rounded-xl border border-slate-800">
              Load is at or below barbell baseline ({barbellWeight} {unit}). No additional plates required.
            </p>
          ) : (
            <div className="divide-y divide-slate-800 bg-slate-950/40 rounded-2xl border border-slate-800 overflow-hidden">
              {plates.map((p) => (
                <div key={p.plate} className="flex justify-between items-center px-3.5 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full border ${getPlateColor(p.plate)}`} />
                    <span className="font-bold text-white">
                      {p.plate} {unit} plate
                    </span>
                  </div>
                  <span className="font-mono font-bold text-amber-400">
                    {p.countPerSide} × per side ({p.countPerSide * 2} total)
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="text-right text-[11px] font-mono text-slate-400">
          Effective Weight: <strong className="text-white">{totalBarbellWeight} {unit}</strong>
        </div>

        <button
          onClick={onClose}
          className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition"
        >
          Done
        </button>
      </div>
    </div>
  );
};
