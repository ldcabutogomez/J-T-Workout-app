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
      if (plate === 45) return 'bg-ink text-paper border-ink';
      if (plate === 35) return 'bg-accent text-on-accent border-accent';
      if (plate === 25) return 'bg-ok text-on-accent border-ok';
      if (plate === 10) return 'bg-white text-ink border-line';
      if (plate === 5) return 'bg-bad text-on-accent border-bad';
      return 'bg-muted text-ink border-line';
    } else {
      if (plate === 25) return 'bg-bad text-on-accent border-bad';
      if (plate === 20) return 'bg-ink text-paper border-ink';
      if (plate === 15) return 'bg-accent text-on-accent border-accent';
      if (plate === 10) return 'bg-ok text-on-accent border-ok';
      if (plate === 5) return 'bg-white text-ink border-line';
      if (plate === 2.5) return 'bg-sunk text-ink border-line';
      return 'bg-line text-ink border-line';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-paper/80 animate-fade-in">
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Barbell plate calculator" className="w-full max-w-sm card p-5 text-ink shadow-sm space-y-4">
        <div className="flex justify-between items-center pb-2 border-b border-line">
          <div>
            <h3 className="text-lg font-black tracking-tight text-ink font-display">
              Barbell Plate Calculator
            </h3>
            <p className="text-xs text-muted">
              Target: <strong className="text-accent-ink">{targetWeight} {unit}</strong> (Bar: {barbellWeight} {unit})
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted hover:text-ink rounded-xl hover:bg-sunk transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Visual Barbell Representation */}
        <div className="bg-paper/70 border border-line rounded-2xl p-4 flex flex-col items-center">
          <span className="text-xs font-bold uppercase tracking-wider text-muted mb-2">
            Plates to load per side ({perSideTotal} {unit})
          </span>

          <div className="flex items-center gap-1.5 overflow-x-auto py-2 px-1 w-full justify-center">
            {/* Bar sleeve */}
            <div className="h-4 w-6 bg-sunk rounded-l flex-shrink-0" title="Bar Collar" />

            {plates.length === 0 ? (
              <span className="text-xs text-muted font-mono italic">Empty Bar ({barbellWeight} {unit})</span>
            ) : (
              plates.map((item) =>
                Array.from({ length: item.countPerSide }).map((_, i) => (
                  <div
                    key={`${item.plate}-${i}`}
                    className={`h-20 min-w-[20px] px-1 rounded flex flex-col items-center justify-center font-mono font-bold text-xs border shadow-md flex-shrink-0 ${getPlateColor(
                      item.plate
                    )}`}
                  >
                    <span>{item.plate}</span>
                  </div>
                ))
              )
            )}

            {/* Collar clip */}
            <div className="h-6 w-2 bg-accent rounded-r flex-shrink-0" title="Collar Lock" />
          </div>
        </div>

        {/* Detailed Plate Breakdown Table */}
        <div className="space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-muted">
            Per-Side Breakdown
          </span>
          {plates.length === 0 ? (
            <p className="text-xs text-muted bg-paper/40 p-3 rounded-xl border border-line">
              Load is at or below barbell baseline ({barbellWeight} {unit}). No additional plates required.
            </p>
          ) : (
            <div className="divide-y divide-line bg-paper/40 rounded-2xl border border-line overflow-hidden">
              {plates.map((p) => (
                <div key={p.plate} className="flex justify-between items-center px-3.5 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full border ${getPlateColor(p.plate)}`} />
                    <span className="font-bold text-ink">
                      {p.plate} {unit} plate
                    </span>
                  </div>
                  <span className="font-mono font-bold text-accent-ink">
                    {p.countPerSide} × per side ({p.countPerSide * 2} total)
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="text-right text-xs font-mono text-muted">
          Effective Weight: <strong className="text-ink">{totalBarbellWeight} {unit}</strong>
        </div>

        <button
          onClick={onClose}
          className="w-full bg-sunk hover:bg-line text-ink font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition"
        >
          Done
        </button>
      </div>
    </div>
  );
};
