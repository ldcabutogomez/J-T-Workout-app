import type {
  DayPrescription,
  ExerciseSlotPrescription,
  LoadBasis,
  ProgramSetPrescription,
  SourceReference,
  TierType,
  TrainingMaxKey,
  UserProfile,
} from '../types';
import { slug } from '../lib/slug';
import { applySwap } from './swapOptions';

type WeekColumns = { exercise: string; weight: string; reps: string; sets: string };

const WEEK_COLUMNS: WeekColumns[] = [
  { exercise: 'D', weight: 'E', reps: 'F', sets: 'G' },
  { exercise: 'I', weight: 'J', reps: 'K', sets: 'L' },
  { exercise: 'N', weight: 'O', reps: 'P', sets: 'Q' },
  { exercise: 'S', weight: 'T', reps: 'U', sets: 'V' },
  { exercise: 'X', weight: 'Y', reps: 'Z', sets: 'AA' },
  { exercise: 'AC', weight: 'AD', reps: 'AE', sets: 'AF' },
  { exercise: 'AH', weight: 'AI', reps: 'AJ', sets: 'AK' },
  { exercise: 'AM', weight: 'AN', reps: 'AO', sets: 'AP' },
  { exercise: 'AR', weight: 'AS', reps: 'AT', sets: 'AU' },
  { exercise: 'AW', weight: 'AX', reps: 'AY', sets: 'AZ' },
  { exercise: 'BB', weight: 'BC', reps: 'BD', sets: 'BE' },
  { exercise: 'BG', weight: 'BH', reps: 'BI', sets: 'BJ' },
];

const T1_TARGETS = [10, 8, 6, 4, 2, 1, 6, 4, 2, 5, 3, 1] as const;
const BLOCK1_BACKOFFS = [
  { count: 3, reps: 6 },
  { count: 3, reps: 5 },
  { count: 3, reps: 4 },
  { count: 3, reps: 3 },
  { count: 4, reps: 2 },
] as const;
const BLOCK2_BACKOFFS: Record<number, { count: number; reps: number; percentage: number }> = {
  7: { count: 5, reps: 3, percentage: 0.85 },
  8: { count: 5, reps: 2, percentage: 0.85 },
  9: { count: 5, reps: 1, percentage: 0.85 },
  10: { count: 3, reps: 2, percentage: 0.9 },
  11: { count: 3, reps: 1, percentage: 0.9 },
};

const DAY_TITLES = [
  'Day 1 — Back Squat',
  'Day 2 — Bench Press',
  'Day 3 — Front Squat / Deadlift',
  'Day 4 — Military Press',
] as const;

const MAIN_T1 = {
  1: { topRow: 57, backoffRow: 58, progressionRow: 15, block1Name: 'Back Squat', block2Name: 'Back Squat', block1Key: 'squat', block2Key: 'squat' },
  2: { topRow: 69, backoffRow: 70, progressionRow: 18, block1Name: 'Bench Press', block2Name: 'Bench Press', block1Key: 'bench', block2Key: 'bench' },
  3: { topRow: 81, backoffRow: 82, progressionRow: 21, block1Name: 'Front Squat', block2Name: 'Deadlift', block1Key: 'front_squat', block2Key: 'deadlift' },
  4: { topRow: 93, backoffRow: 94, progressionRow: 24, block1Name: 'Military Press', block2Name: 'Military Press', block1Key: 'ohp', block2Key: 'ohp' },
} satisfies Record<number, {
  topRow: number;
  backoffRow: number;
  progressionRow: number;
  block1Name: string;
  block2Name: string;
  block1Key: TrainingMaxKey;
  block2Key: TrainingMaxKey;
}>;

const BLOCK1_T1_PERCENTAGES: Record<number, number[]> = {
  1: [0.7, 0.75, 0.8, 0.825, 0.85],
  2: [0.65, 0.7, 0.75, 0.775, 0.8],
  3: [0.7, 0.75, 0.8, 0.825, 0.85],
  4: [0.6, 0.65, 0.7, 0.775, 0.8],
};

const T2A_ROWS: Record<number, number> = { 1: 60, 2: 72, 3: 84, 4: 99 };
const T2A_PROGRESSION_ROWS: Record<number, number> = { 1: 37, 2: 39, 3: 41, 4: 43 };
const T2A_PERCENTAGES: Record<number, Array<number | null>> = {
  1: [0.5, 0.6, 0.7, 0.75, 0.8, null, 0.7, 0.75, 0.8, 0.825, 0.85, null],
  2: [0.5, 0.55, 0.6, 0.625, 0.65, null, 0.7, 0.75, 0.8, 0.825, 0.85, null],
  3: [0.5, 0.6, 0.7, 0.75, 0.8, null, 0.7, 0.75, 0.8, 0.825, 0.85, null],
  4: [0.45, 0.5, 0.55, 0.575, 0.6, null, 0.65, 0.7, 0.75, 0.775, 0.8, null],
};
const T2A_SCHEMES: Array<{ count: number; reps: number } | null> = [
  { count: 4, reps: 10 },
  { count: 4, reps: 8 },
  { count: 4, reps: 6 },
  { count: 5, reps: 4 },
  { count: 7, reps: 2 },
  null,
  { count: 5, reps: 6 },
  { count: 5, reps: 5 },
  { count: 5, reps: 4 },
  { count: 6, reps: 3 },
  { count: 7, reps: 2 },
  null,
];

const T2A_NAMES: Record<number, string[]> = {
  1: ['2" Deficit Deadlift', '2" Deficit Deadlift', '2" Deficit Deadlift', '2" Deficit Deadlift', '2" Deficit Deadlift', '2" Deficit Deadlift', '1" Deficit Deadlift', '1" Deficit Deadlift', '1" Deficit Deadlift', 'Deadlift', 'Deadlift', 'Deadlift'],
  2: Array(12).fill('Close Grip Bench'),
  3: ['Back Squat', 'Back Squat', 'Back Squat', 'Back Squat', 'Back Squat', 'Back Squat', 'Front Squat', 'Front Squat', 'Front Squat', 'Front Squat', 'Front Squat', 'Front Squat'],
  4: Array(12).fill('Legs Up Bench'),
};

const T2A_KEYS: Record<number, { block1: TrainingMaxKey; block2: TrainingMaxKey }> = {
  1: { block1: 'deadlift', block2: 'deadlift' },
  2: { block1: 'bench', block2: 'bench' },
  3: { block1: 'squat', block2: 'front_squat' },
  4: { block1: 'bench', block2: 'bench' },
};

const TM_INPUT_CELLS: Record<1 | 2, Record<TrainingMaxKey, string>> = {
  1: { squat: 'E4', bench: 'E5', deadlift: 'E6', ohp: 'E7', front_squat: 'O5' },
  2: { squat: 'AI4', bench: 'AI5', deadlift: 'AI6', ohp: 'AI7', front_squat: 'AS5' },
};

type AccessoryDefinition = {
  tier: TierType;
  row: number;
  block1: string;
  block2?: string;
  block2Row?: number;
};
const ACCESSORIES: Record<number, AccessoryDefinition[]> = {
  1: [
    { tier: 'T2b', row: 61, block1: 'Single Leg Press', block2: 'Single Leg Press', block2Row: 62 },
    { tier: 'T2c', row: 62, block1: 'Chest Supported Row', block2: 'Chest Supported Row', block2Row: 63 },
    { tier: 'T3a', row: 63, block1: 'V Grip Cable Row', block2: 'V Grip Cable Row', block2Row: 64 },
    { tier: 'T3b', row: 64, block1: 'Leg Curl', block2: 'Leg Curl', block2Row: 65 },
    { tier: 'T3c', row: 65, block1: 'Leg Extension', block2: 'Leg Extension', block2Row: 66 },
    { tier: 'T3d', row: 66, block1: 'DB Hammer Curl' },
  ],
  2: [
    { tier: 'T2b', row: 73, block1: 'Incline Bench', block2: 'Incline Bench', block2Row: 74 },
    { tier: 'T2c', row: 74, block1: 'DB Shoulder Press', block2: 'DB Shoulder Press', block2Row: 75 },
    { tier: 'T3a', row: 75, block1: 'Machine Lateral Raise', block2: 'Machine Lateral Raise', block2Row: 76 },
    { tier: 'T3b', row: 76, block1: 'Rear Delt Fly', block2: 'Pec Flye', block2Row: 77 },
    { tier: 'T3c', row: 77, block1: 'Pec Flye', block2: 'Rear Delt Flye', block2Row: 78 },
    { tier: 'T3d', row: 78, block1: 'Cable Tricep Push Down' },
  ],
  3: [
    { tier: 'T2b', row: 85, block1: 'Back Step Lunge', block2: 'Stiff Leg Deadlift', block2Row: 86 },
    { tier: 'T2c', row: 86, block1: 'V Grip Lat Pull Down', block2: 'Lat Pull Down', block2Row: 87 },
    { tier: 'T3a', row: 87, block1: 'Leg Extension', block2: 'Wide Grip Cable Row', block2Row: 88 },
    { tier: 'T3b', row: 88, block1: 'Leg Curl', block2: 'Hammer Curl', block2Row: 89 },
    { tier: 'T3c', row: 89, block1: 'Wide Grip Lat Pull Down', block2: 'EZ Bar Curl', block2Row: 90 },
    { tier: 'T3d', row: 90, block1: 'EZ Bar Curl' },
  ],
  4: [
    { tier: 'T2b', row: 100, block1: 'Push Press' },
    { tier: 'T3a', row: 101, block1: 'Cable OH Tricep Ext.', block2: 'DB Bench Press' },
    { tier: 'T3b', row: 102, block1: 'Machine Lateral Raise', block2: 'Cable OH Tricep Ext' },
    { tier: 'T3c', row: 103, block1: 'Rear Delt Fly', block2: 'Rear Delt Fly' },
    { tier: 'T3d', row: 104, block1: 'Pec Flye', block2: 'Pec Flye' },
  ],
};

const BLOCK1_T2_TARGETS = [15, 12, 10, 8, 6] as const;
const BLOCK1_T3_TARGETS = [20, 18, 16, 14, 12, 10] as const;
const BLOCK2_T2_TARGETS: Record<number, number> = { 7: 12, 8: 10, 9: 8, 10: 6 };
const BLOCK2_T3_TARGETS: Record<number, number> = { 8: 18, 9: 16, 10: 14, 11: 12 };

function sourceRefs(...ranges: string[]): SourceReference[] {
  const uniqueRanges = [...new Set(ranges)];
  return [
    { sheet: 'J&T2.0', ranges: uniqueRanges },
    { sheet: 'J&T2.0 KGS', ranges: uniqueRanges },
  ];
}

function scheduleRange(week: number, firstRow: number, lastRow = firstRow): string {
  const c = WEEK_COLUMNS[week - 1];
  return `${c.exercise}${firstRow}:${c.sets}${lastRow}`;
}

function progressionRange(week: number, row: number): string {
  const c = WEEK_COLUMNS[week - 1];
  return `${c.exercise}${row}:${c.weight}${row}`;
}

function setPrescription(
  setNumber: number,
  type: ProgramSetPrescription['type'],
  prescribedReps: number,
  loadBasis: LoadBasis,
  refs: SourceReference[],
  extra: Partial<ProgramSetPrescription> = {},
): ProgramSetPrescription {
  return { setNumber, type, prescribedReps, loadBasis, sourceRefs: refs, ...extra };
}

function makeMainT1(week: number, day: number): ExerciseSlotPrescription {
  const def = MAIN_T1[day as keyof typeof MAIN_T1];
  const isBlock1 = week <= 6;
  const name = isBlock1 ? def.block1Name : def.block2Name;
  const tmKey = isBlock1 ? def.block1Key : def.block2Key;
  const finalRow = week === 6 || week === 12 ? def.topRow : def.backoffRow + 1;
  const refs = sourceRefs(
    scheduleRange(week, def.topRow, finalRow),
    progressionRange(week, def.progressionRow),
    ...(week <= 5 ? [TM_INPUT_CELLS[1][tmKey]] : []),
  );
  const slotId = `d${day}-t1-primary`;
  const sets: ProgramSetPrescription[] = [
    setPrescription(
      1,
      week === 6 || week === 12 ? 'test' : 'rm_target',
      T1_TARGETS[week - 1],
      { kind: 'user_selected' },
      refs,
    ),
  ];

  let loadBasis: LoadBasis = { kind: 'user_selected' };
  let percentage: number | undefined;
  if (week <= 5) {
    const cfg = BLOCK1_BACKOFFS[week - 1];
    percentage = BLOCK1_T1_PERCENTAGES[day][week - 1];
    loadBasis = { kind: 'training_max', key: tmKey, block: 1 };
    for (let i = 0; i < cfg.count; i += 1) {
      sets.push(setPrescription(i + 2, 'backoff', cfg.reps, loadBasis, refs, {
        percentage,
        isAmrap: i === cfg.count - 1,
        amrapOptional: i === cfg.count - 1,
      }));
    }
  } else if (week >= 7 && week <= 11) {
    const cfg = BLOCK2_BACKOFFS[week];
    percentage = cfg.percentage;
    loadBasis = { kind: 'achieved_rm', slotId };
    for (let i = 0; i < cfg.count; i += 1) {
      sets.push(setPrescription(i + 2, 'backoff', cfg.reps, loadBasis, refs, {
        percentage,
        isAmrap: i === cfg.count - 1,
        amrapOptional: i === cfg.count - 1,
      }));
    }
  }

  return {
    slotId,
    exerciseId: slug(name),
    week,
    day,
    tier: 'T1',
    exerciseName: name,
    status: week === 6 || week === 12 ? 'test' : 'work',
    setType: week === 6 || week === 12 ? 'test' : 'rm_backoff',
    setCount: sets.length,
    repTarget: T1_TARGETS[week - 1],
    percentage,
    loadBasis,
    trainingMaxBlock: week <= 5 ? 1 : undefined,
    prescribedSets: sets,
    sourceRefs: refs,
    notes: week >= 7 && week <= 11
      ? 'Back-offs use the load actually achieved for the target-RM set. A rep mismatch requires an explicit load decision.'
      : undefined,
  };
}

function makeSecondaryT1(week: number): ExerciseSlotPrescription {
  const refs = sourceRefs(
    scheduleRange(week, 96, week === 6 || week === 12 ? 97 : 98),
    progressionRange(week, 25),
  );
  const slotId = 'd4-t1-secondary';
  const target = week <= 6 ? T1_TARGETS[week - 1] : [7, 4, 2, 5, 3, 1][week - 7];
  const additional = week <= 5 ? 4 : ({ 7: 4, 8: 4, 9: 1, 10: 3, 11: 1 } as Record<number, number>)[week] ?? 0;
  const test = week === 6 || week === 12;
  const sets = [setPrescription(1, test ? 'test' : 'rm_target', target, { kind: 'user_selected' }, refs)];
  for (let i = 0; i < additional; i += 1) {
    sets.push(setPrescription(i + 2, 'mrs', target, { kind: 'achieved_rm', slotId }, refs));
  }
  return {
    slotId,
    exerciseId: 'sling-shot-bench',
    week,
    day: 4,
    tier: 'T1',
    exerciseName: 'Sling Shot Bench',
    status: test ? 'test' : 'work',
    setType: test ? 'test' : 'mrs',
    setCount: sets.length,
    repTarget: target,
    loadBasis: { kind: 'user_selected' },
    mrsAdditionalSets: additional || undefined,
    prescribedSets: sets,
    sourceRefs: refs,
    notes: additional ? `Initial ${target}RM set followed by ${additional} additional MRS.` : undefined,
  };
}

function makeRestOrOmitted(
  week: number,
  day: number,
  tier: TierType,
  name: string,
  status: 'rest' | 'omitted',
  refs: SourceReference[],
  notes: string,
): ExerciseSlotPrescription {
  return {
    slotId: `d${day}-${tier.toLowerCase()}`,
    exerciseId: slug(name),
    week,
    day,
    tier,
    exerciseName: name,
    status,
    setType: status,
    setCount: 0,
    repTarget: null,
    prescribedSets: [],
    sourceRefs: refs,
    notes,
  };
}

function makeT2a(week: number, day: number): ExerciseSlotPrescription {
  const row = T2A_ROWS[day];
  const progressionRow = T2A_PROGRESSION_ROWS[day];
  const name = T2A_NAMES[day][week - 1];
  const refs = sourceRefs(scheduleRange(week, row), progressionRange(week, progressionRow));
  const slotId = `d${day}-t2a`;

  if (week === 12 && (day === 2 || day === 3)) {
    const restRow = day === 2 ? 73 : 85;
    const conflictRefs = sourceRefs(scheduleRange(week, row), `${WEEK_COLUMNS[11].exercise}${restRow}`);
    return {
      slotId,
      exerciseId: slug(name),
      week,
      day,
      tier: 'T2a',
      exerciseName: name,
      status: 'test',
      setType: 'test',
      setCount: 1,
      repTarget: 1,
      loadBasis: { kind: 'user_selected' },
      prescribedSets: [setPrescription(1, 'test', 1, { kind: 'user_selected' }, conflictRefs)],
      sourceRefs: conflictRefs,
      ambiguity: `Week 12 explicitly says “Find 1RM” at ${WEEK_COLUMNS[11].exercise}${row}:${WEEK_COLUMNS[11].weight}${row}, while ${WEEK_COLUMNS[11].exercise}${restRow} says “T2 Rest”. The app preserves the explicit test and flags the conflict for the lifter.` ,
      notes: 'Manual workbook conflict: choose whether to perform this explicit T2a test.',
    };
  }

  const scheme = T2A_SCHEMES[week - 1];
  const percentage = T2A_PERCENTAGES[day][week - 1];
  if (!scheme || percentage === null) {
    const restCell = week === 6
      ? scheduleRange(week, row)
      : `${WEEK_COLUMNS[11].exercise}${day === 1 ? 61 : 97}`;
    return makeRestOrOmitted(
      week,
      day,
      'T2a',
      name,
      'rest',
      sourceRefs(restCell, progressionRange(week, progressionRow)),
      week === 6 ? 'Workbook T2 deload.' : 'Workbook T2 rest.',
    );
  }

  const block = week <= 5 ? 1 : 2;
  const key = block === 1 ? T2A_KEYS[day].block1 : T2A_KEYS[day].block2;
  const workRefs = sourceRefs(
    scheduleRange(week, row),
    progressionRange(week, progressionRow),
    TM_INPUT_CELLS[block][key],
  );
  const loadBasis: LoadBasis = { kind: 'training_max', key, block };
  const sets: ProgramSetPrescription[] = [];
  for (let i = 0; i < scheme.count; i += 1) {
    sets.push(setPrescription(i + 1, 'straight', scheme.reps, loadBasis, workRefs, { percentage }));
  }
  return {
    slotId,
    exerciseId: slug(name),
    week,
    day,
    tier: 'T2a',
    exerciseName: name,
    status: 'work',
    setType: 'straight',
    setCount: scheme.count,
    repTarget: scheme.reps,
    percentage,
    loadBasis,
    trainingMaxBlock: block,
    prescribedSets: sets,
    sourceRefs: workRefs,
  };
}

function makeMrsAccessory(
  week: number,
  day: number,
  tier: TierType,
  row: number,
  name: string,
  target: number,
): ExerciseSlotPrescription {
  const refs = sourceRefs(scheduleRange(week, row));
  const slotId = `d${day}-${tier.toLowerCase()}`;
  const sets: ProgramSetPrescription[] = [
    setPrescription(1, 'rm_target', target, { kind: 'user_selected' }, refs),
  ];
  for (let i = 0; i < 3; i += 1) {
    sets.push(setPrescription(i + 2, 'mrs', target, { kind: 'achieved_rm', slotId }, refs));
  }
  return {
    slotId,
    exerciseId: slug(name),
    week,
    day,
    tier,
    exerciseName: name,
    status: 'work',
    setType: 'mrs',
    setCount: 4,
    repTarget: target,
    loadBasis: { kind: 'user_selected' },
    mrsAdditionalSets: 3,
    prescribedSets: sets,
    sourceRefs: refs,
    notes: `Initial ${target}RM set plus 3 additional MRS; MRS reps may decline.`,
  };
}

function accessoryRestReference(week: number, day: number, tier: TierType, row: number): SourceReference[] {
  if (week === 6) {
    const t2Rows: Record<number, number> = { 1: 60, 2: 72, 3: 84, 4: 99 };
    return sourceRefs(scheduleRange(week, tier.startsWith('T2') ? t2Rows[day] : row));
  }
  if (week === 7) {
    const labelRows: Record<number, number> = { 1: 64, 2: 76, 3: 88, 4: 101 };
    return sourceRefs(scheduleRange(week, labelRows[day]), scheduleRange(week, row));
  }
  if (week === 11 && tier.startsWith('T2')) {
    const labelRows: Record<number, number> = { 1: 61, 2: 73, 3: 85, 4: 100 };
    return sourceRefs(scheduleRange(week, labelRows[day]), scheduleRange(week, row));
  }
  if (week === 12) {
    const labelRows: Record<number, number> = { 1: tier.startsWith('T2') ? 61 : 62, 2: tier.startsWith('T2') ? 73 : 74, 3: tier.startsWith('T2') ? 85 : 86, 4: tier.startsWith('T2') ? 97 : 101 };
    return sourceRefs(scheduleRange(week, labelRows[day]), scheduleRange(week, row));
  }
  return sourceRefs(scheduleRange(week, row));
}

function makeAccessories(week: number, day: number): ExerciseSlotPrescription[] {
  const result: ExerciseSlotPrescription[] = [];
  for (const def of ACCESSORIES[day]) {
    const isT2 = def.tier === 'T2b' || def.tier === 'T2c';
    const isT3 = def.tier.startsWith('T3');
    const block2Name = def.block2;
    const name = week <= 6 ? def.block1 : (block2Name ?? def.block1);
    const row = week <= 6 ? def.row : (def.block2Row ?? def.row);

    if (week <= 5) {
      result.push(makeMrsAccessory(week, day, def.tier, row, name, isT2 ? BLOCK1_T2_TARGETS[week - 1] : BLOCK1_T3_TARGETS[week - 1]));
      continue;
    }
    if (week === 6) {
      if (isT2) {
        result.push(makeRestOrOmitted(week, day, def.tier, name, 'rest', accessoryRestReference(week, day, def.tier, row), 'Workbook T2 deload.'));
      } else {
        result.push(makeMrsAccessory(week, day, def.tier, row, name, BLOCK1_T3_TARGETS[5]));
      }
      continue;
    }

    if (!block2Name) {
      if ((isT3 && (week === 7 || week === 12)) || (isT2 && (week === 11 || week === 12))) {
        result.push(makeRestOrOmitted(
          week,
          day,
          def.tier,
          name,
          'rest',
          accessoryRestReference(week, day, def.tier, row),
          `The workbook's broad ${isT2 ? 'T2' : 'T3'} rest label applies; this named Block 1 slot has no Block 2 exercise.`,
        ));
      } else {
        result.push(makeRestOrOmitted(
          week,
          day,
          def.tier,
          name,
          'omitted',
          sourceRefs(scheduleRange(week, day === 1 ? 55 : day === 2 ? 67 : day === 3 ? 79 : 91, day === 1 ? 66 : day === 2 ? 78 : day === 3 ? 90 : 104)),
          'This Block 1 slot has no populated Block 2 exercise in the source day range.',
        ));
      }
      continue;
    }

    if (isT2) {
      if (day === 4 && week >= 7 && week <= 10) {
        result.push(makeRestOrOmitted(week, day, def.tier, name, 'omitted', sourceRefs(scheduleRange(week, row)), 'This T2 slot is blank in Block 2.'));
      } else if (week <= 10) {
        result.push(makeMrsAccessory(week, day, def.tier, row, name, BLOCK2_T2_TARGETS[week]));
      } else {
        result.push(makeRestOrOmitted(week, day, def.tier, name, 'rest', accessoryRestReference(week, day, def.tier, row), 'Workbook T2 rest.'));
      }
      continue;
    }

    if (isT3 && week === 7) {
      result.push(makeRestOrOmitted(week, day, def.tier, name, 'rest', accessoryRestReference(week, day, def.tier, row), 'Workbook Week 7 T3 rest.'));
    } else if (isT3 && week === 12) {
      result.push(makeRestOrOmitted(week, day, def.tier, name, 'rest', accessoryRestReference(week, day, def.tier, row), 'Workbook Week 12 T3 rest.'));
    } else if (day === 4 && week === 11 && (def.tier === 'T3a' || def.tier === 'T3b')) {
      result.push(makeRestOrOmitted(week, day, def.tier, name, 'omitted', sourceRefs(scheduleRange(week, row)), 'The Week 11 source cells for this slot are blank.'));
    } else if (isT3) {
      result.push(makeMrsAccessory(week, day, def.tier, row, name, BLOCK2_T3_TARGETS[week]));
    }
  }
  return result;
}

export function getOriginalDayPrescription(week: number, day: number): DayPrescription {
  if (!Number.isInteger(week) || week < 1 || week > 12) {
    throw new RangeError(`Program week must be an integer from 1 through 12; received ${week}.`);
  }
  if (!Number.isInteger(day) || day < 1 || day > 4) {
    throw new RangeError(`Program day must be an integer from 1 through 4; received ${day}.`);
  }

  const exercises: ExerciseSlotPrescription[] = [makeMainT1(week, day)];
  if (day === 4) exercises.push(makeSecondaryT1(week));
  exercises.push(makeT2a(week, day), ...makeAccessories(week, day));
  return {
    week,
    dayNumber: day,
    title: DAY_TITLES[day - 1],
    exercises,
    sourceRefs: sourceRefs(scheduleRange(week, day === 1 ? 55 : day === 2 ? 67 : day === 3 ? 79 : 91, day === 1 ? 66 : day === 2 ? 78 : day === 3 ? 90 : 104)),
  };
}

export function getDayPrescription(week: number, day: number, profile?: UserProfile): DayPrescription {
  const original = getOriginalDayPrescription(week, day);
  if (!profile?.exerciseCustomizations && !profile?.exerciseSwaps) return original;
  return {
    ...original,
    exercises: original.exercises.map((slot) => {
      const customName = profile.exerciseCustomizations?.[slot.slotId]?.trim();
      if (customName && slot.loadBasis?.kind === 'user_selected' && slot.tier !== 'T1') {
        return { ...slot, exerciseName: customName, exerciseId: `custom-${slug(customName)}` };
      }
      return applySwap(slot, profile.exerciseSwaps);
    }),
  };
}

export const PRESCRIPTION_DATASET: DayPrescription[] = Array.from({ length: 12 }, (_, weekIndex) =>
  Array.from({ length: 4 }, (_, dayIndex) => getOriginalDayPrescription(weekIndex + 1, dayIndex + 1)),
).flat();

export const WORKBOOK_AMBIGUITIES = [
  {
    id: 'week12-day2-t2-conflict',
    cells: ['J&T2.0!BG72:BJ72', 'J&T2.0!BG73', 'J&T2.0 KGS!BG72:BJ72', 'J&T2.0 KGS!BG73'],
    decision: 'The explicit Close Grip Bench “Find 1RM” remains visible as a manual test and is not silently flattened into the broader T2 Rest label.',
  },
  {
    id: 'week12-day3-t2-conflict',
    cells: ['J&T2.0!BG84:BJ84', 'J&T2.0!BG85', 'J&T2.0 KGS!BG84:BJ84', 'J&T2.0 KGS!BG85'],
    decision: 'The explicit Front Squat “Find 1RM” remains visible as a manual test and is not silently flattened into the broader T2 Rest label.',
  },
] as const;
