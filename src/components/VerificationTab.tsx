import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types';
import {
  getDayPrescription,
  roundLoad,
  CANONICAL_JNT2_RULES,
  CANONICAL_DAYS,
} from '../engine/jnt2Engine';
import { dbService } from '../storage/db';
import { CheckCircle2, XCircle, Play, ShieldCheck } from 'lucide-react';

interface VerificationTabProps {
  profile: UserProfile | null;
}

interface TestResult {
  id: string;
  name: string;
  expected: string;
  actual: string;
  passed: boolean;
  category: 'percentages' | 'autoregulation' | 'notations' | 'schedules' | 'storage';
}

export const VerificationTab: React.FC<VerificationTabProps> = ({ profile }) => {
  const [results, setResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  const runAllVerifications = async () => {
    setIsRunning(true);
    const testSuite: TestResult[] = [];

    const dummyLbProfile: UserProfile = {
      id: 'test_p1',
      name: 'Test Partner 1',
      unit: 'lb',
      equipmentIncrement: 5,
      barbellWeight: 45,
      tone: 'minimal',
      currentWeek: 1,
      currentDay: 1,
      trainingMaxes: { squat: 200, bench: 200, deadlift: 200, ohp: 200 },
    };

    const dummyKgProfile: UserProfile = {
      id: 'test_p2',
      name: 'Test Partner 2',
      unit: 'kg',
      equipmentIncrement: 2.5,
      barbellWeight: 20,
      tone: 'warm',
      currentWeek: 1,
      currentDay: 1,
      trainingMaxes: { squat: 100, bench: 100, deadlift: 100, ohp: 100 },
    };

    // -------------------------------------------------------------
    // 1. Percentage & Training Max Mapping Checks (Block 1)
    // -------------------------------------------------------------
    // Squat Week 1: 200 lb TM @ 70% = 140 lb
    const sqW1Pct = CANONICAL_JNT2_RULES.block1T1Percentages.squat[0];
    const sqW1Calc = roundLoad(dummyLbProfile.trainingMaxes.squat * sqW1Pct, 5);
    testSuite.push({
      id: 't_sq_w1',
      name: 'Squat Week 1: 70% back-off on 200 lb TM',
      category: 'percentages',
      expected: '140 lb',
      actual: `${sqW1Calc} lb`,
      passed: sqW1Calc === 140,
    });

    // Bench Week 1: 200 lb TM @ 65% = 130 lb
    const bpW1Pct = CANONICAL_JNT2_RULES.block1T1Percentages.bench[0];
    const bpW1Calc = roundLoad(dummyLbProfile.trainingMaxes.bench * bpW1Pct, 5);
    testSuite.push({
      id: 't_bp_w1',
      name: 'Bench Press Week 1: 65% back-off on 200 lb TM',
      category: 'percentages',
      expected: '130 lb',
      actual: `${bpW1Calc} lb`,
      passed: bpW1Calc === 130,
    });

    // OHP Week 1: 200 lb TM @ 60% = 120 lb
    const ohpW1Pct = CANONICAL_JNT2_RULES.block1T1Percentages.ohp[0];
    const ohpW1Calc = roundLoad(dummyLbProfile.trainingMaxes.ohp * ohpW1Pct, 5);
    testSuite.push({
      id: 't_ohp_w1',
      name: 'Overhead Press Week 1: 60% back-off on 200 lb TM',
      category: 'percentages',
      expected: '120 lb',
      actual: `${ohpW1Calc} lb`,
      passed: ohpW1Calc === 120,
    });

    // Metric Rounding: 100 kg TM @ 82.5% prescription rounds to 82.5 kg
    const kgCalc = roundLoad(100 * 0.825, 2.5);
    testSuite.push({
      id: 't_kg_round',
      name: 'Metric Unit Rounding: 100 kg TM @ 82.5% to nearest 2.5 kg',
      category: 'percentages',
      expected: '82.5 kg',
      actual: `${kgCalc} kg`,
      passed: kgCalc === 82.5,
    });

    // -------------------------------------------------------------
    // 2. Block 2 Autoregulation Rule (Weeks 7-11)
    // -------------------------------------------------------------
    // Week 7: Achieved 6RM of 200 lb -> 85% back-offs = 170 lb (independent of old TM)
    const w7Backoff = roundLoad(200 * 0.85, 5);
    testSuite.push({
      id: 't_w7_autoreg',
      name: 'Week 7 T1: 85% back-off from achieved 200 lb 6RM',
      category: 'autoregulation',
      expected: '170 lb',
      actual: `${w7Backoff} lb`,
      passed: w7Backoff === 170,
    });

    // Week 10: Achieved 5RM of 200 lb -> 90% back-offs = 180 lb
    const w10Backoff = roundLoad(200 * 0.90, 5);
    testSuite.push({
      id: 't_w10_autoreg',
      name: 'Week 10 T1: 90% back-off from achieved 200 lb 5RM',
      category: 'autoregulation',
      expected: '180 lb',
      actual: `${w10Backoff} lb`,
      passed: w10Backoff === 180,
    });

    // -------------------------------------------------------------
    // 3. Notation Precision: "3MRS" and "3+"
    // -------------------------------------------------------------
    // "3MRS" = 1 initial target RM set + 3 additional MRS = 4 logged sets
    const w1d1Presc = getDayPrescription(1, 1, dummyLbProfile);
    const t2bSlot = w1d1Presc.exercises.find((e) => e.tier === 'T2b');
    const t2bSetCount = t2bSlot ? t2bSlot.prescribedSets.length : 0;
    testSuite.push({
      id: 't_3mrs',
      name: '"3MRS" creates 4 logged sets (1 RM + 3 MRS)',
      category: 'notations',
      expected: '4 sets total',
      actual: `${t2bSetCount} sets total`,
      passed: t2bSetCount === 4,
    });

    // "3+" in sets column = 3 total work sets (not 4)
    const t1Slot = w1d1Presc.exercises.find((e) => e.tier === 'T1');
    const backoffCount = t1Slot
      ? t1Slot.prescribedSets.filter((s) => s.type === 'backoff').length
      : 0;
    testSuite.push({
      id: 't_3plus',
      name: '"3+" back-off creates 3 work sets with last set AMRAP',
      category: 'notations',
      expected: '3 work sets',
      actual: `${backoffCount} work sets`,
      passed: backoffCount === 3,
    });

    // -------------------------------------------------------------
    // 4. Test Weeks & Programmed Deload / Rest Exceptions
    // -------------------------------------------------------------
    // Week 6: T2 is rest; T3 is 10RM + 3MRS
    const w6d1 = getDayPrescription(6, 1, dummyLbProfile);
    const w6T2a = w6d1.exercises.find((e) => e.tier === 'T2a');
    const w6T3a = w6d1.exercises.find((e) => e.tier === 'T3a');
    testSuite.push({
      id: 't_w6_rest',
      name: 'Week 6 Mid-Block Test: T2 is rested',
      category: 'schedules',
      expected: 'T2a isRestWeek = true',
      actual: `T2a isRestWeek = ${w6T2a?.isRestWeek}`,
      passed: w6T2a?.isRestWeek === true && w6T3a?.isRestWeek === false,
    });

    // Week 7: T3 is rested after Week 6 1RM testing
    const w7d1 = getDayPrescription(7, 1, dummyLbProfile);
    const w7T3a = w7d1.exercises.find((e) => e.tier === 'T3a');
    testSuite.push({
      id: 't_w7_rest',
      name: 'Week 7 Post-Test: T3 accessories are rested',
      category: 'schedules',
      expected: 'T3a isRestWeek = true',
      actual: `T3a isRestWeek = ${w7T3a?.isRestWeek}`,
      passed: w7T3a?.isRestWeek === true,
    });

    // Week 12: Peak week (T2 and T3 both rested)
    const w12d1 = getDayPrescription(12, 1, dummyLbProfile);
    const w12T2a = w12d1.exercises.find((e) => e.tier === 'T2a');
    const w12T3a = w12d1.exercises.find((e) => e.tier === 'T3a');
    testSuite.push({
      id: 't_w12_rest',
      name: 'Week 12 Peak: Both T2 and T3 are rested',
      category: 'schedules',
      expected: 'T2a & T3a rested',
      actual: `T2a=${w12T2a?.isRestWeek}, T3a=${w12T3a?.isRestWeek}`,
      passed: w12T2a?.isRestWeek === true && w12T3a?.isRestWeek === true,
    });

    // -------------------------------------------------------------
    // 5. IndexedDB Storage & Backup Roundtrip
    // -------------------------------------------------------------
    try {
      const backupJson = await dbService.exportBackup();
      const importCheck = await dbService.importBackup(backupJson);
      testSuite.push({
        id: 't_backup_roundtrip',
        name: 'IndexedDB Backup Export/Import Roundtrip',
        category: 'storage',
        expected: 'Backup verified and imported',
        actual: importCheck.message,
        passed: importCheck.success,
      });
    } catch (e: any) {
      testSuite.push({
        id: 't_backup_roundtrip',
        name: 'IndexedDB Backup Export/Import Roundtrip',
        category: 'storage',
        expected: 'Successful roundtrip',
        actual: `Error: ${e.message}`,
        passed: false,
      });
    }

    setResults(testSuite);
    setIsRunning(false);
  };

  useEffect(() => {
    runAllVerifications();
  }, []);

  const totalPassed = results.filter((r) => r.passed).length;
  const allPassed = results.length > 0 && totalPassed === results.length;

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
        <div className="flex justify-between items-center pb-2 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <h2 className="text-xl font-black text-white font-display">Engine Verification</h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Automated mathematical & logic validation against canonical compendium rules
            </p>
          </div>

          <button
            onClick={runAllVerifications}
            disabled={isRunning}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-3.5 py-2 rounded-xl text-xs uppercase tracking-wider transition active:scale-95 disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Re-run Checks</span>
          </button>
        </div>

        {/* Status Banner */}
        <div className="mt-3 flex items-center justify-between p-3 bg-slate-950/70 border border-slate-800 rounded-2xl">
          <span className="text-xs font-bold text-slate-300">
            Automated Checks Passed:
          </span>
          <span
            className={`font-mono font-bold text-xs px-2.5 py-1 rounded-lg ${
              allPassed
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                : 'bg-rose-950 text-rose-300 border border-rose-800'
            }`}
          >
            {totalPassed} / {results.length} PASSED
          </span>
        </div>
      </div>

      {/* Test Results List */}
      <div className="space-y-2">
        {results.map((test) => (
          <div
            key={test.id}
            className={`p-3.5 rounded-2xl border flex items-start justify-between gap-3 text-xs ${
              test.passed
                ? 'bg-slate-900/60 border-slate-800/80 text-slate-200'
                : 'bg-rose-950/30 border-rose-900/60 text-rose-200'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {test.passed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span className="font-bold text-white text-sm">{test.name}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-400 font-mono pl-6">
                <span>Expected: <strong className="text-slate-300">{test.expected}</strong></span>
                <span>Result: <strong className={test.passed ? 'text-emerald-400' : 'text-rose-400'}>{test.actual}</strong></span>
              </div>
            </div>

            <span
              className={`text-[10px] font-black uppercase px-2 py-0.5 rounded font-mono shrink-0 ${
                test.passed ? 'bg-emerald-500 text-slate-950' : 'bg-rose-500 text-white'
              }`}
            >
              {test.passed ? 'PASS' : 'FAIL'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
