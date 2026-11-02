/**
 * Jacked & Tan 2.0 Calculation Engine & Canonical Program Data.
 * Fully traceable to Cody LeFever's GZCL Free Compendium November 27th Update (J&T2.0 & J&T2.0 KGS tabs).
 */

import {
  UserProfile,
  ExerciseSlotPrescription,
  ProgramSetPrescription,
  DayPrescription,
  TierType,
} from '../types';

export interface DayTemplateMeta {
  dayNumber: number;
  title: string;
  liftKey: 'squat' | 'bench' | 'deadlift' | 'ohp';
  t1Exercise: string;
  t2aExercise: string;
  t2bExercise: string;
  t3aExercise: string;
  t3bExercise: string;
  t3cExercise: string;
}

export const CANONICAL_DAYS: DayTemplateMeta[] = [
  {
    dayNumber: 1,
    title: 'Day 1 — Squat Focus',
    liftKey: 'squat',
    t1Exercise: 'Back Squat',
    t2aExercise: 'Deficit Deadlift',
    t2bExercise: 'Chest Supported Row',
    t3aExercise: 'Cable Tricep Pushdown',
    t3bExercise: 'Cable Row',
    t3cExercise: 'DB Hammer Curl',
  },
  {
    dayNumber: 2,
    title: 'Day 2 — Bench Focus',
    liftKey: 'bench',
    t1Exercise: 'Bench Press',
    t2aExercise: 'Close Grip Bench',
    t2bExercise: 'DB Shoulder Press',
    t3aExercise: 'Pec Flye',
    t3bExercise: 'Rear Delt Flye',
    t3cExercise: 'EZ Skullcrusher',
  },
  {
    dayNumber: 3,
    title: 'Day 3 — Deadlift Focus',
    liftKey: 'deadlift',
    t1Exercise: 'Deadlift',
    t2aExercise: 'Front Squat',
    t2bExercise: 'Neutral Grip Pulldown',
    t3aExercise: 'Leg Extension',
    t3bExercise: 'Leg Curl',
    t3cExercise: 'DB Curl',
  },
  {
    dayNumber: 4,
    title: 'Day 4 — Overhead Press Focus',
    liftKey: 'ohp',
    t1Exercise: 'Overhead Press',
    t2aExercise: 'Legs Up Bench',
    t2bExercise: 'Push Press',
    t3aExercise: 'Cable OH Tricep Ext',
    t3bExercise: 'Lateral Raise',
    t3cExercise: 'Incline DB Curl',
  },
];

export const CANONICAL_JNT2_RULES = {
  // First block (Weeks 1-5) T1 Back-Off Percentages of Starting TM (Estimated 2RM)
  // Source: J&T2.0!D14:I25 & J&T2.0 KGS!D14:I25
  block1T1Percentages: {
    squat:    [0.70, 0.75, 0.80, 0.825, 0.85],
    bench:    [0.65, 0.70, 0.75, 0.775, 0.80],
    deadlift: [0.70, 0.75, 0.80, 0.825, 0.85],
    ohp:      [0.60, 0.65, 0.70, 0.775, 0.80],
  },

  // T1 Prescribed RM Target for the Top Set across all 12 weeks
  // Weeks 1-6: 10RM, 8RM, 6RM, 4RM, 2RM, 1RM
  // Weeks 7-12: 6RM, 4RM, 2RM, 5RM, 3RM, 1RM
  t1TargetRMs: [10, 8, 6, 4, 2, 1, 6, 4, 2, 5, 3, 1],

  // T2a Supplemental Work (Weeks 1-12)
  // Source: J&T2.0!Rows for T2a
  t2aScheme: [
    { sets: 4, reps: 10, pct: 0.50, isRest: false, source: 'J&T2.0!T2a_Wk1' },
    { sets: 4, reps: 8,  pct: 0.60, isRest: false, source: 'J&T2.0!T2a_Wk2' },
    { sets: 4, reps: 6,  pct: 0.70, isRest: false, source: 'J&T2.0!T2a_Wk3' },
    { sets: 5, reps: 4,  pct: 0.75, isRest: false, source: 'J&T2.0!T2a_Wk4' },
    { sets: 7, reps: 2,  pct: 0.80, isRest: false, source: 'J&T2.0!T2a_Wk5' },
    { sets: 0, reps: 0,  pct: 0,    isRest: true,  source: 'J&T2.0!T2a_Wk6_Rest' },
    { sets: 5, reps: 6,  pct: 0.70, isRest: false, source: 'J&T2.0!T2a_Wk7' },
    { sets: 5, reps: 4,  pct: 0.75, isRest: false, source: 'J&T2.0!T2a_Wk8' },
    { sets: 5, reps: 2,  pct: 0.80, isRest: false, source: 'J&T2.0!T2a_Wk9' },
    { sets: 6, reps: 3,  pct: 0.825,isRest: false, source: 'J&T2.0!T2a_Wk10' },
    { sets: 0, reps: 0,  pct: 0,    isRest: true,  source: 'J&T2.0!T2a_Wk11_Rest' },
    { sets: 0, reps: 0,  pct: 0,    isRest: true,  source: 'J&T2.0!T2a_Wk12_Rest' },
  ],

  // T2b Target RM for the first set, followed by 3 Max Rep Sets (3MRS = 4 sets total)
  t2bTargetRMs: [15, 12, 10, 8, 6, 0, 12, 10, 8, 6, 0, 0],

  // T3 Target RM for the first set, followed by 3 Max Rep Sets (3MRS = 4 sets total)
  t3TargetRMs: [20, 18, 16, 14, 12, 10, 0, 18, 16, 14, 12, 0],

  // Rest Guidelines from Workbook Notes (including surfacing the known typo)
  restGuidelines: {
    t1: { minSec: 180, maxSec: 300, label: '3 to 5 minutes', sourceRef: 'J&T2.0!Rest_Guide_Col1' },
    t2: { minSec: 120, maxSec: 180, label: '2 to 3 minutes', sourceRef: 'J&T2.0!Rest_Guide_Col2' },
    t3: { minSec: 60,  maxSec: 90,  label: '60 to 90 seconds (source repeats T1 label in cell)', sourceRef: 'J&T2.0!Rest_Guide_Col3' },
  },

  // Documented Workbook Ambiguities & Discrepancies
  surfacedContradictions: [
    {
      topic: 'Rest Recommendation Column Typo',
      detail: 'The source compendium lists "T1" twice: once for 3-5 minutes, and once beside the 60-90 second recommendation. In standard GZCL method, 60-90 seconds is the T3 recommendation. The engine sets T3 rest to 60-90s but flags this source quirk transparently.',
    },
    {
      topic: 'T2a Training Max Reference',
      detail: 'Workbook formulas in some community revisions use 50% of the main lift TM for T2a (e.g. Deficit Deadlift derived from Squat TM), whereas lifters with divergent lift strength prefer an independent Deficit Deadlift TM. The engine defaults to the parent lift TM while allowing user customization.',
    },
    {
      topic: 'Second-Block Day 4 T2 Accessories',
      detail: 'In the original compendium Mesocycle D, Day 4 T2 accessories are left blank. The engine reflects this omission in Week 11 & 12 peaking while supporting optional volume additions.',
    },
  ],
};

/**
 * Rounds a calculated weight to the user's equipment increment (e.g. 5 lb or 2.5 kg).
 */
export function roundLoad(value: number, increment: number): number {
  if (!increment || increment <= 0) return Math.round(value);
  return Math.round(value / increment) * increment;
}

/**
 * Generates prescriptions for a specific week and training day according to the canonical workbook.
 */
export function getDayPrescription(
  week: number,
  dayNumber: number,
  profile: UserProfile
): DayPrescription {
  const weekIdx = Math.max(0, Math.min(11, week - 1));
  const dayMeta = CANONICAL_DAYS.find((d) => d.dayNumber === dayNumber) || CANONICAL_DAYS[0];
  const isBlock1 = week <= 6;
  const t1TargetRM = CANONICAL_JNT2_RULES.t1TargetRMs[weekIdx];

  const exercises: ExerciseSlotPrescription[] = [];

  // ==========================================
  // 1. T1 PRIMARY LIFT
  // ==========================================
  const t1Sets: ProgramSetPrescription[] = [
    {
      type: 'rm_target',
      prescribedReps: t1TargetRM,
      isAmrap: false,
      sourceRef: `J&T2.0!Wk${week}_D${dayNumber}_T1_RM`,
    },
  ];

  if (week === 6 || week === 12) {
    // True 1RM Test Weeks: Work up to 1RM, no back-off drop sets
    t1Sets[0].prescribedReps = 1;
  } else if (isBlock1) {
    // Block 1 (Weeks 1-5):
    // W1: 3x6 @ lift-specific % of TM (last set AMRAP, denoted 3+)
    // W2: 3x5 @ lift-specific % of TM (last set AMRAP, denoted 3+)
    // W3: 3x4 @ lift-specific % of TM (last set AMRAP, denoted 3+)
    // W4: 3x3 @ lift-specific % of TM (last set AMRAP, denoted 3+)
    // W5: 4x2 @ lift-specific % of TM (last set AMRAP, denoted 4+)
    const block1Configs = [
      { count: 3, reps: 6 },
      { count: 3, reps: 5 },
      { count: 3, reps: 4 },
      { count: 3, reps: 3 },
      { count: 4, reps: 2 },
    ];
    const cfg = block1Configs[weekIdx];
    const liftPcts = CANONICAL_JNT2_RULES.block1T1Percentages[dayMeta.liftKey];
    const pct = liftPcts[weekIdx];

    for (let i = 0; i < cfg.count; i++) {
      t1Sets.push({
        type: 'backoff',
        prescribedReps: cfg.reps,
        isAmrap: i === cfg.count - 1, // "3+" means 3 work sets with rep-out on last set
        percentage: pct,
        loadFromRM: false,
        sourceRef: `J&T2.0!Wk${week}_D${dayNumber}_T1_Backoff_Set${i + 1}`,
      });
    }
  } else {
    // Block 2 (Weeks 7-11):
    // Back-offs calculate dynamically from that day's achieved RM load!
    // Weeks 7-9: 5x3, 5x2, 5x1 @ 85% of day's RM load
    // Weeks 10-11: 3x2, 3x1 @ 90% of day's RM load
    const isMesoC = week >= 7 && week <= 9;
    const count = isMesoC ? 5 : 3;
    const reps =
      week === 7 ? 3 :
      week === 8 ? 2 :
      week === 9 ? 1 :
      week === 10 ? 2 : 1;
    const pct = isMesoC ? 0.85 : 0.90;

    for (let i = 0; i < count; i++) {
      t1Sets.push({
        type: 'backoff',
        prescribedReps: reps,
        isAmrap: i === count - 1,
        percentage: pct,
        loadFromRM: true, // Requires user to log target RM first
        sourceRef: `J&T2.0!Wk${week}_D${dayNumber}_T1_Backoff_Set${i + 1}`,
      });
    }
  }

  const customizedT1 = profile.exerciseCustomizations?.[`D${dayNumber}_T1`] || dayMeta.t1Exercise;

  exercises.push({
    tier: 'T1',
    defaultExercise: customizedT1,
    parentLiftKey: dayMeta.liftKey,
    targetRM: t1TargetRM,
    prescribedSets: t1Sets,
    sourceRef: `J&T2.0!D${dayNumber}_T1_Wk${week}`,
  });

  // ==========================================
  // 2. T2a SUPPLEMENTAL WORK
  // ==========================================
  const t2aInfo = CANONICAL_JNT2_RULES.t2aScheme[weekIdx];
  const customizedT2a = profile.exerciseCustomizations?.[`D${dayNumber}_T2a`] || dayMeta.t2aExercise;

  if (t2aInfo.isRest) {
    exercises.push({
      tier: 'T2a',
      defaultExercise: customizedT2a,
      isRestWeek: true,
      notes: week === 6 ? 'Week 6 test week: T2a is rested to peak for 1RM single.' : 'Week 11/12 peak: T2a is rested.',
      prescribedSets: [],
      sourceRef: t2aInfo.source,
    });
  } else {
    const t2aSets: ProgramSetPrescription[] = [];
    for (let i = 0; i < t2aInfo.sets; i++) {
      t2aSets.push({
        type: 'straight',
        prescribedReps: t2aInfo.reps,
        percentage: t2aInfo.pct,
        loadFromRM: false, // T2a uses reference TM, NOT the day's T1 RM!
        sourceRef: `J&T2.0!D${dayNumber}_T2a_Wk${week}_Set${i + 1}`,
      });
    }
    exercises.push({
      tier: 'T2a',
      defaultExercise: customizedT2a,
      parentLiftKey: dayMeta.liftKey,
      prescribedSets: t2aSets,
      notes: `${t2aInfo.sets} sets × ${t2aInfo.reps} reps @ ${(t2aInfo.pct * 100).toFixed(0)}% of TM`,
      sourceRef: t2aInfo.source,
    });
  }

  // ==========================================
  // 3. T2b ACCESSORY (RM + 3MRS)
  // ==========================================
  const t2bRM = CANONICAL_JNT2_RULES.t2bTargetRMs[weekIdx];
  const customizedT2b = profile.exerciseCustomizations?.[`D${dayNumber}_T2b`] || dayMeta.t2bExercise;

  if (t2bRM === 0) {
    exercises.push({
      tier: 'T2b',
      defaultExercise: customizedT2b,
      isRestWeek: true,
      notes: 'Scheduled accessory rest.',
      prescribedSets: [],
      sourceRef: `J&T2.0!D${dayNumber}_T2b_Wk${week}_Rest`,
    });
  } else {
    // 3MRS means 1 initial target RM set followed by 3 additional MRS sets (4 sets total)
    const t2bSets: ProgramSetPrescription[] = [
      { type: 'rm_target', prescribedReps: t2bRM, sourceRef: `J&T2.0!D${dayNumber}_T2b_Wk${week}_RM` },
      { type: 'mrs', prescribedReps: t2bRM, sourceRef: `J&T2.0!D${dayNumber}_T2b_Wk${week}_MRS1` },
      { type: 'mrs', prescribedReps: t2bRM, sourceRef: `J&T2.0!D${dayNumber}_T2b_Wk${week}_MRS2` },
      { type: 'mrs', prescribedReps: t2bRM, sourceRef: `J&T2.0!D${dayNumber}_T2b_Wk${week}_MRS3` },
    ];
    exercises.push({
      tier: 'T2b',
      defaultExercise: customizedT2b,
      targetRM: t2bRM,
      mrsSetsCount: 3,
      prescribedSets: t2bSets,
      notes: `Find ${t2bRM}RM, then 3 additional Max Rep Sets (MRS) at the same weight (1-2 RIR).`,
      sourceRef: `J&T2.0!D${dayNumber}_T2b_Wk${week}`,
    });
  }

  // ==========================================
  // 4. T3 ACCESSORIES (T3a, T3b, T3c) (RM + 3MRS)
  // ==========================================
  const t3RM = CANONICAL_JNT2_RULES.t3TargetRMs[weekIdx];
  const t3Slots: { tier: TierType; defaultName: string; slotKey: string }[] = [
    { tier: 'T3a', defaultName: dayMeta.t3aExercise, slotKey: `D${dayNumber}_T3a` },
    { tier: 'T3b', defaultName: dayMeta.t3bExercise, slotKey: `D${dayNumber}_T3b` },
    { tier: 'T3c', defaultName: dayMeta.t3cExercise, slotKey: `D${dayNumber}_T3c` },
  ];

  t3Slots.forEach((slot) => {
    const exerciseName = profile.exerciseCustomizations?.[slot.slotKey] || slot.defaultName;
    if (t3RM === 0) {
      exercises.push({
        tier: slot.tier,
        defaultExercise: exerciseName,
        isRestWeek: true,
        notes: week === 7
          ? 'Week 7 scheduled accessory recovery following Week 6 1RM test.'
          : 'Week 12 peaking deload: T3 is rested.',
        prescribedSets: [],
        sourceRef: `J&T2.0!D${dayNumber}_${slot.tier}_Wk${week}_Rest`,
      });
    } else {
      const sets: ProgramSetPrescription[] = [
        { type: 'rm_target', prescribedReps: t3RM, sourceRef: `J&T2.0!D${dayNumber}_${slot.tier}_Wk${week}_RM` },
        { type: 'mrs', prescribedReps: t3RM, sourceRef: `J&T2.0!D${dayNumber}_${slot.tier}_Wk${week}_MRS1` },
        { type: 'mrs', prescribedReps: t3RM, sourceRef: `J&T2.0!D${dayNumber}_${slot.tier}_Wk${week}_MRS2` },
        { type: 'mrs', prescribedReps: t3RM, sourceRef: `J&T2.0!D${dayNumber}_${slot.tier}_Wk${week}_MRS3` },
      ];
      exercises.push({
        tier: slot.tier,
        defaultExercise: exerciseName,
        targetRM: t3RM,
        mrsSetsCount: 3,
        prescribedSets: sets,
        notes: `Find ${t3RM}RM, then 3 additional MRS at the same weight leaving 1-2 reps in reserve.`,
        sourceRef: `J&T2.0!D${dayNumber}_${slot.tier}_Wk${week}`,
      });
    }
  });

  return {
    dayNumber,
    title: dayMeta.title,
    primaryLift: dayMeta.t1Exercise,
    exercises,
    sourceRef: `J&T2.0!Day_${dayNumber}_Wk${week}`,
  };
}

/**
 * Calculates plate breakdown for an Olympic barbell.
 */
export function calculateBarbellPlates(
  targetWeight: number,
  barbellWeight: number,
  unit: 'lb' | 'kg'
): { plate: number; countPerSide: number }[] {
  const availablePlates = unit === 'lb'
    ? [45, 35, 25, 10, 5, 2.5]
    : [25, 20, 15, 10, 5, 2.5, 1.25];

  let remainingPerSide = Math.max(0, (targetWeight - barbellWeight) / 2);
  const breakdown: { plate: number; countPerSide: number }[] = [];

  for (const plate of availablePlates) {
    if (remainingPerSide >= plate) {
      const count = Math.floor(remainingPerSide / plate);
      breakdown.push({ plate, countPerSide: count });
      remainingPerSide -= count * plate;
    }
  }

  return breakdown;
}
