import React from 'react';
import type { UserProfile } from '../types';
import { getDayPrescription, PRESCRIPTION_DATASET, roundLoad } from '../engine/jnt2Engine';
import { createWorkoutSession } from '../engine/sessionEngine';
import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';

type Check = { name: string; passed: boolean; detail: string };

function smokeChecks(): Check[] {
  const profile: UserProfile = {
    id: 'isolated-runtime-check',
    name: 'Isolated check',
    unit: 'lb',
    equipmentIncrement: 5,
    barbellWeight: 45,
    tone: 'off',
    currentWeek: 1,
    currentDay: 1,
    trainingMaxes: { squat: 200, bench: 200, deadlift: 300, ohp: 100, front_squat: 150 },
    block2ConfirmedTMs: { squat: 210, bench: 205, deadlift: 310, ohp: 105, front_squat: 160 },
  };
  const session = createWorkoutSession(profile, getDayPrescription(1, 1, profile), 1);
  const squat = session.exercises.find((item) => item.slotId === 'd1-t1-primary');
  const deficit = session.exercises.find((item) => item.slotId === 'd1-t2a');
  const w8 = getDayPrescription(8, 1, profile).exercises.find((item) => item.slotId === 'd1-t2a');
  const w9 = getDayPrescription(9, 1, profile).exercises.find((item) => item.slotId === 'd1-t2a');
  const w11 = getDayPrescription(11, 1, profile).exercises.find((item) => item.slotId === 'd1-t2a');
  const realCellPattern = /^[A-Z]+\d+(?::[A-Z]+\d+)?$/;
  return [
    { name: '48 week/day prescriptions', passed: PRESCRIPTION_DATASET.length === 48, detail: `${PRESCRIPTION_DATASET.length} generated` },
    { name: 'Real workbook address syntax', passed: PRESCRIPTION_DATASET.every((day) => day.exercises.every((slot) => slot.sourceRefs.every((ref) => ref.ranges.every((range) => realCellPattern.test(range))))), detail: 'No invented Wk/Tier pseudo-addresses' },
    { name: 'Week 1 Squat back-offs', passed: squat?.sets.filter((set) => set.type === 'backoff').every((set) => set.load === 140) === true, detail: '200 lb × 70% = 140 lb' },
    { name: 'Day 1 deficit-deadlift TM mapping', passed: deficit?.sets.every((set) => set.load === 150) === true, detail: '300 lb Deadlift TM × 50% = 150 lb' },
    { name: 'Later T2a schemes', passed: w8?.setCount === 5 && w8.repTarget === 5 && w9?.setCount === 5 && w9.repTarget === 4 && w11?.setCount === 7 && w11.repTarget === 2, detail: 'W8 5×5 · W9 5×4 · W11 7×2' },
    { name: 'Metric rounding', passed: roundLoad(100 * 0.825, 2.5) === 82.5, detail: '100 kg × 82.5% = 82.5 kg' },
  ];
}

export function VerificationTab() {
  const checks = smokeChecks();
  return (
    <div className="space-y-4">
      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5">
        <div className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-emerald-400" /><h1 className="text-xl font-black">Workbook mapping</h1></div>
        <p className="text-xs text-slate-400 mt-2">These are non-destructive runtime smoke checks. They never touch workout storage. Passing them is not presented as proof of workbook fidelity; the repository test suite compares all 48 combinations with an independently transcribed workbook fixture.</p>
      </section>
      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-2">
        {checks.map((check) => <div key={check.name} className="bg-slate-950 border border-slate-800 rounded-2xl p-3 flex gap-3">{check.passed ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" /> : <XCircle className="w-5 h-5 text-rose-400 shrink-0" />}<div><strong className="text-sm">{check.name}</strong><p className="text-xs text-slate-400 mt-0.5">{check.detail}</p></div></div>)}
      </section>
      <section className="bg-amber-950/30 border border-amber-800 rounded-3xl p-4 text-xs text-amber-200"><strong>Source files inspected:</strong> <code>J&amp;T2.0!D2:BQ104</code> and <code>J&amp;T2.0 KGS!D2:BQ104</code>, including formula references for T1 and T2a loads.</section>
    </div>
  );
}
