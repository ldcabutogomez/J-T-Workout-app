/**
 * Independently transcribed from the supplied workbook's J&T2.0 sheet.
 * This fixture deliberately does not import application prescription constants.
 */
export type ExpectedSlot = {
  slotId: string;
  tier: string;
  name: string;
  status: 'work' | 'rest' | 'test' | 'omitted';
  setType: string;
  setCount: number;
  reps: number | null;
  percentage?: number;
  basis?: string;
  ranges: string[];
};

const weeks = [
  ['D', 'E', 'F', 'G'], ['I', 'J', 'K', 'L'], ['N', 'O', 'P', 'Q'],
  ['S', 'T', 'U', 'V'], ['X', 'Y', 'Z', 'AA'], ['AC', 'AD', 'AE', 'AF'],
  ['AH', 'AI', 'AJ', 'AK'], ['AM', 'AN', 'AO', 'AP'], ['AR', 'AS', 'AT', 'AU'],
  ['AW', 'AX', 'AY', 'AZ'], ['BB', 'BC', 'BD', 'BE'], ['BG', 'BH', 'BI', 'BJ'],
] as const;

const mainRows = {
  1: [57, 58, 15, 'Back Squat', 'Back Squat', 'squat', 'squat'],
  2: [69, 70, 18, 'Bench Press', 'Bench Press', 'bench', 'bench'],
  // Intentional deviation from the workbook: Day 3 Block 1 / T2a Block 2 use Back Squat (Front Squat is a swap option).
  3: [81, 82, 21, 'Back Squat', 'Deadlift', 'squat', 'deadlift'],
  4: [93, 94, 24, 'Military Press', 'Military Press', 'ohp', 'ohp'],
} as const;

const tmCells = {
  1: { squat: 'E4', bench: 'E5', deadlift: 'E6', ohp: 'E7', front_squat: 'O5' },
  2: { squat: 'AI4', bench: 'AI5', deadlift: 'AI6', ohp: 'AI7', front_squat: 'AS5' },
} as const;

const targets = [10, 8, 6, 4, 2, 1, 6, 4, 2, 5, 3, 1];
const mainCounts = [4, 4, 4, 4, 5, 1, 6, 6, 6, 4, 4, 1];
const mainPercentages = {
  1: [0.7, 0.75, 0.8, 0.825, 0.85],
  2: [0.65, 0.7, 0.75, 0.775, 0.8],
  3: [0.7, 0.75, 0.8, 0.825, 0.85],
  4: [0.6, 0.65, 0.7, 0.775, 0.8],
} as const;

const t2aRows = { 1: [60, 37], 2: [72, 39], 3: [84, 41], 4: [99, 43] } as const;
const t2aNames = {
  1: ['2" Deficit Deadlift', '2" Deficit Deadlift', '2" Deficit Deadlift', '2" Deficit Deadlift', '2" Deficit Deadlift', '2" Deficit Deadlift', '1" Deficit Deadlift', '1" Deficit Deadlift', '1" Deficit Deadlift', 'Deadlift', 'Deadlift', 'Deadlift'],
  2: Array(12).fill('Close Grip Bench'),
  3: ['Back Squat', 'Back Squat', 'Back Squat', 'Back Squat', 'Back Squat', 'Back Squat', 'Back Squat', 'Back Squat', 'Back Squat', 'Back Squat', 'Back Squat', 'Back Squat'],
  4: Array(12).fill('Legs Up Bench'),
} as const;
const t2aKeys = {
  1: ['deadlift', 'deadlift'], 2: ['bench', 'bench'],
  3: ['squat', 'squat'], 4: ['bench', 'bench'],
} as const;
const t2aPercentages = {
  1: [0.5, 0.6, 0.7, 0.75, 0.8, null, 0.7, 0.75, 0.8, 0.825, 0.85, null],
  2: [0.5, 0.55, 0.6, 0.625, 0.65, null, 0.7, 0.75, 0.8, 0.825, 0.85, null],
  3: [0.5, 0.6, 0.7, 0.75, 0.8, null, 0.7, 0.75, 0.8, 0.825, 0.85, null],
  4: [0.45, 0.5, 0.55, 0.575, 0.6, null, 0.65, 0.7, 0.75, 0.775, 0.8, null],
} as const;
const t2aSchemes = [[4, 10], [4, 8], [4, 6], [5, 4], [7, 2], null, [5, 6], [5, 5], [5, 4], [6, 3], [7, 2], null] as const;

type Accessory = [tier: string, block1Row: number, block1Name: string, block2Row?: number, block2Name?: string];
const accessories: Record<number, Accessory[]> = {
  1: [['T2b', 61, 'Single Leg Press', 62, 'Single Leg Press'], ['T2c', 62, 'Chest Supported Row', 63, 'Chest Supported Row'], ['T3a', 63, 'V Grip Cable Row', 64, 'V Grip Cable Row'], ['T3b', 64, 'Leg Curl', 65, 'Leg Curl'], ['T3c', 65, 'Leg Extension', 66, 'Leg Extension'], ['T3d', 66, 'DB Hammer Curl']],
  2: [['T2b', 73, 'Incline Bench', 74, 'Incline Bench'], ['T2c', 74, 'DB Shoulder Press', 75, 'DB Shoulder Press'], ['T3a', 75, 'Machine Lateral Raise', 76, 'Machine Lateral Raise'], ['T3b', 76, 'Rear Delt Fly', 77, 'Pec Flye'], ['T3c', 77, 'Pec Flye', 78, 'Rear Delt Flye'], ['T3d', 78, 'Cable Tricep Push Down']],
  3: [['T2b', 85, 'Back Step Lunge', 86, 'Stiff Leg Deadlift'], ['T2c', 86, 'V Grip Lat Pull Down', 87, 'Lat Pull Down'], ['T3a', 87, 'Leg Extension', 88, 'Wide Grip Cable Row'], ['T3b', 88, 'Leg Curl', 89, 'Hammer Curl'], ['T3c', 89, 'Wide Grip Lat Pull Down', 90, 'EZ Bar Curl'], ['T3d', 90, 'EZ Bar Curl']],
  4: [['T2b', 100, 'Push Press'], ['T3a', 101, 'Cable OH Tricep Ext.', 101, 'DB Bench Press'], ['T3b', 102, 'Machine Lateral Raise', 102, 'Cable OH Tricep Ext'], ['T3c', 103, 'Rear Delt Fly', 103, 'Rear Delt Fly'], ['T3d', 104, 'Pec Flye', 104, 'Pec Flye']],
};

const dayBounds = { 1: [55, 66], 2: [67, 78], 3: [79, 90], 4: [91, 104] } as const;
const t2RestRows = { 1: 60, 2: 72, 3: 84, 4: 99 } as const;
const t2LateRestRows = { 1: 61, 2: 73, 3: 85, 4: 100 } as const;
const t3RestRows = { 1: 64, 2: 76, 3: 88, 4: 101 } as const;
const w12T2RestRows = { 1: 61, 2: 73, 3: 85, 4: 97 } as const;
const w12T3RestRows = { 1: 62, 2: 74, 3: 86, 4: 101 } as const;

const range = (week: number, row: number, end = row) => `${weeks[week - 1][0]}${row}:${weeks[week - 1][3]}${end}`;
const progressRange = (week: number, row: number) => `${weeks[week - 1][0]}${row}:${weeks[week - 1][1]}${row}`;
const unique = (items: string[]) => [...new Set(items)];

function expectedMain(week: number, day: number): ExpectedSlot {
  const [topRow, backoffRow, progressionRow, firstName, secondName, firstKey, secondKey] = mainRows[day as keyof typeof mainRows];
  const test = week === 6 || week === 12;
  const key = (week <= 6 ? firstKey : secondKey) as keyof typeof tmCells[1];
  const scheduleEnd = test ? topRow : backoffRow + 1;
  const percentage = week <= 5 ? mainPercentages[day as keyof typeof mainPercentages][week - 1] : week <= 9 && week >= 7 ? 0.85 : week <= 11 && week >= 10 ? 0.9 : undefined;
  return {
    slotId: `d${day}-t1-primary`, tier: 'T1', name: week <= 6 ? firstName : secondName,
    status: test ? 'test' : 'work', setType: test ? 'test' : 'rm_backoff',
    setCount: mainCounts[week - 1], reps: targets[week - 1],
    ...(percentage === undefined ? {} : { percentage }),
    basis: week <= 5 ? `training_max:${key}:1` : week <= 11 && week >= 7 ? `achieved_rm:d${day}-t1-primary` : 'user_selected',
    ranges: [range(week, topRow, scheduleEnd), progressRange(week, progressionRow), ...(week <= 5 ? [tmCells[1][key]] : [])],
  };
}

function expectedSecondary(week: number): ExpectedSlot {
  const test = week === 6 || week === 12;
  const reps = [10, 8, 6, 4, 2, 1, 7, 4, 2, 5, 3, 1][week - 1];
  const additional = [4, 4, 4, 4, 4, 0, 4, 4, 1, 3, 1, 0][week - 1];
  return {
    slotId: 'd4-t1-secondary', tier: 'T1', name: 'Sling Shot Bench', status: test ? 'test' : 'work',
    setType: test ? 'test' : 'mrs', setCount: additional + 1, reps, basis: 'user_selected',
    ranges: [range(week, 96, test ? 97 : 98), progressRange(week, 25)],
  };
}

function expectedT2a(week: number, day: number): ExpectedSlot {
  const [row, progressionRow] = t2aRows[day as keyof typeof t2aRows];
  const name = t2aNames[day as keyof typeof t2aNames][week - 1];
  if (week === 12 && (day === 2 || day === 3)) {
    const restRow = day === 2 ? 73 : 85;
    return { slotId: `d${day}-t2a`, tier: 'T2a', name, status: 'test', setType: 'test', setCount: 1, reps: 1, basis: 'user_selected', ranges: [range(week, row), `${weeks[11][0]}${restRow}`] };
  }
  const scheme = t2aSchemes[week - 1];
  const percentage = t2aPercentages[day as keyof typeof t2aPercentages][week - 1];
  if (!scheme || percentage === null) {
    const restCell = week === 6 ? range(week, row) : `${weeks[11][0]}${day === 1 ? 61 : 97}`;
    return { slotId: `d${day}-t2a`, tier: 'T2a', name, status: 'rest', setType: 'rest', setCount: 0, reps: null, ranges: [restCell, progressRange(week, progressionRow)] };
  }
  const block = week <= 5 ? 1 : 2;
  const key = t2aKeys[day as keyof typeof t2aKeys][block - 1] as keyof typeof tmCells[1];
  return {
    slotId: `d${day}-t2a`, tier: 'T2a', name, status: 'work', setType: 'straight',
    setCount: scheme[0], reps: scheme[1], percentage, basis: `training_max:${key}:${block}`,
    ranges: [range(week, row), progressRange(week, progressionRow), tmCells[block as 1 | 2][key]],
  };
}

function expectedAccessory(week: number, day: number, item: Accessory): ExpectedSlot {
  const [tier, block1Row, block1Name, block2Row, block2Name] = item;
  const isT2 = tier.startsWith('T2');
  const presentInBlock2 = Boolean(block2Name);
  const row = week <= 6 ? block1Row : (block2Row ?? block1Row);
  const name = week <= 6 ? block1Name : (block2Name ?? block1Name);
  const slotId = `d${day}-${tier.toLowerCase()}`;
  if (week <= 5) {
    return { slotId, tier, name, status: 'work', setType: 'mrs', setCount: 4, reps: isT2 ? [15, 12, 10, 8, 6][week - 1] : [20, 18, 16, 14, 12][week - 1], basis: 'user_selected', ranges: [range(week, row)] };
  }
  if (week === 6) {
    if (isT2) return { slotId, tier, name, status: 'rest', setType: 'rest', setCount: 0, reps: null, ranges: [range(week, t2RestRows[day as keyof typeof t2RestRows])] };
    return { slotId, tier, name, status: 'work', setType: 'mrs', setCount: 4, reps: 10, basis: 'user_selected', ranges: [range(week, row)] };
  }
  if (!presentInBlock2) {
    if ((!isT2 && (week === 7 || week === 12)) || (isT2 && (week === 11 || week === 12))) {
      const label = isT2 ? (week === 12 ? w12T2RestRows[day as keyof typeof w12T2RestRows] : t2LateRestRows[day as keyof typeof t2LateRestRows]) : (week === 12 ? w12T3RestRows[day as keyof typeof w12T3RestRows] : t3RestRows[day as keyof typeof t3RestRows]);
      return { slotId, tier, name, status: 'rest', setType: 'rest', setCount: 0, reps: null, ranges: unique([range(week, label), range(week, row)]) };
    }
    const [first, last] = dayBounds[day as keyof typeof dayBounds];
    return { slotId, tier, name, status: 'omitted', setType: 'omitted', setCount: 0, reps: null, ranges: [range(week, first, last)] };
  }
  if (isT2) {
    if (week <= 10) return { slotId, tier, name, status: 'work', setType: 'mrs', setCount: 4, reps: [0, 0, 0, 0, 0, 0, 12, 10, 8, 6][week - 1], basis: 'user_selected', ranges: [range(week, row)] };
    const label = week === 12 ? w12T2RestRows[day as keyof typeof w12T2RestRows] : t2LateRestRows[day as keyof typeof t2LateRestRows];
    return { slotId, tier, name, status: 'rest', setType: 'rest', setCount: 0, reps: null, ranges: unique([range(week, label), range(week, row)]) };
  }
  if (week === 7 || week === 12) {
    const label = week === 7 ? t3RestRows[day as keyof typeof t3RestRows] : w12T3RestRows[day as keyof typeof w12T3RestRows];
    return { slotId, tier, name, status: 'rest', setType: 'rest', setCount: 0, reps: null, ranges: unique([range(week, label), range(week, row)]) };
  }
  if (day === 4 && week === 11 && (tier === 'T3a' || tier === 'T3b')) {
    return { slotId, tier, name, status: 'omitted', setType: 'omitted', setCount: 0, reps: null, ranges: [range(week, row)] };
  }
  return { slotId, tier, name, status: 'work', setType: 'mrs', setCount: 4, reps: [0, 0, 0, 0, 0, 0, 0, 18, 16, 14, 12][week - 1], basis: 'user_selected', ranges: [range(week, row)] };
}

export function expectedDay(week: number, day: number): ExpectedSlot[] {
  return [
    expectedMain(week, day),
    ...(day === 4 ? [expectedSecondary(week)] : []),
    expectedT2a(week, day),
    ...accessories[day].map((item) => expectedAccessory(week, day, item)),
  ];
}

export function expectedDayRange(week: number, day: number): string {
  const [first, last] = dayBounds[day as keyof typeof dayBounds];
  return range(week, first, last);
}
