export type WeightUnit = 'lb' | 'kg';
export type EncouragementTone = 'minimal' | 'warm' | 'playful' | 'off';
export type TierType = 'T1' | 'T2a' | 'T2b' | 'T2c' | 'T3a' | 'T3b' | 'T3c' | 'T3d';
export type SetType = 'rm_target' | 'backoff' | 'straight' | 'mrs' | 'test';
export type SlotStatus = 'work' | 'rest' | 'test' | 'omitted';
export type TrainingMaxKey = 'squat' | 'bench' | 'deadlift' | 'ohp' | 'front_squat';
export type SessionStatus = 'active' | 'partial' | 'completed' | 'skipped';

export interface SourceReference {
  sheet: 'J&T2.0' | 'J&T2.0 KGS';
  ranges: string[];
}

export type LoadBasis =
  | { kind: 'training_max'; key: TrainingMaxKey; block: 1 | 2 }
  | { kind: 'achieved_rm'; slotId: string }
  | { kind: 'user_selected' };

export interface ProgramSetPrescription {
  setNumber: number;
  type: SetType;
  prescribedReps: number;
  isAmrap?: boolean;
  amrapOptional?: boolean;
  percentage?: number;
  loadBasis: LoadBasis;
  /** For a lifter-chosen RM set: which training max the app may use to suggest a starting load. */
  suggestFrom?: { key: TrainingMaxKey; block: 1 | 2 };
  sourceRefs: SourceReference[];
}

export interface SwappedFrom {
  exerciseId: string;
  exerciseName: string;
}

export interface ExerciseSlotPrescription {
  slotId: string;
  exerciseId: string;
  week: number;
  day: number;
  tier: TierType;
  exerciseName: string;
  status: SlotStatus;
  setType: 'rm_backoff' | 'straight' | 'mrs' | 'test' | 'rest' | 'omitted';
  setCount: number;
  repTarget: number | null;
  percentage?: number;
  loadBasis?: LoadBasis;
  trainingMaxBlock?: 1 | 2;
  mrsAdditionalSets?: number;
  prescribedSets: ProgramSetPrescription[];
  sourceRefs: SourceReference[];
  notes?: string;
  ambiguity?: string;
  swappedFrom?: SwappedFrom;
}

export interface DayPrescription {
  week: number;
  dayNumber: number;
  title: string;
  exercises: ExerciseSlotPrescription[];
  sourceRefs: SourceReference[];
}

export interface UserProfile {
  id: string;
  name: string;
  unit: WeightUnit;
  equipmentIncrement: number;
  barbellWeight: number;
  tone: EncouragementTone;
  currentWeek: number;
  currentDay: number;
  cycleCompleted?: boolean;
  trainingMaxes: Partial<Record<TrainingMaxKey, number>>;
  block2ConfirmedTMs?: Partial<Record<TrainingMaxKey, number>>;
  block2ConfirmedAt?: number;
  exerciseCustomizations?: Record<string, string>;
  /** Remembered accessory swaps: `${slotId}::${programExerciseId}` -> alternative exercise id. */
  exerciseSwaps?: Record<string, string>;
  colorTheme?: ColorTheme;
  /** Where each program workout sits on the calendar. Optional; created on first load. */
  schedule?: ProfileSchedule;
  weeklyGoalSessions?: number;
  hapticsEnabled?: boolean;
  soundEnabled?: boolean;
  autoStartRest?: boolean;
  /** Keep the screen on during a workout. On unless set to false. */
  keepScreenOn?: boolean;
  /** Bigger numbers and tap targets for a set, for reading across a gym. */
  largeGymMode?: boolean;
  unlockedBadges?: UnlockedBadge[];
  avatar?: ProfileAvatar;
  /** Equipped flair id (see lib/perks.ts): a small badge on your avatar and a title next to your name. */
  flair?: string;
  /** The last taunt you sent your partner (an index into TAUNTS); it travels in your sync snapshot. */
  taunt?: { id: number; at: number };
  /** Share your photo and live workout status with your partner. On unless set to false. */
  shareLive?: boolean;
  /** Version of the stored data shape this profile was last written with (see storage/schema.ts). */
  schemaVersion?: number;
}

export interface ProfileSchedule {
  /** Local date (YYYY-MM-DD) of the Monday that starts calendar week 1 of the program. */
  anchor: string;
  /** Weekday offsets from Monday (0 to 6) for program Day 1 to Day 4. */
  days: number[];
  /** Dates the lifter dragged a workout to, keyed like 'W3D2'. Everything else follows anchor + days. */
  moves: Record<string, string>;
}

export type ColorTheme = 'lavender' | 'blue' | 'vermilion' | 'forest' | 'rose';

export type AvatarColor = 'accent' | 'violet' | 'cobalt' | 'ok' | 'gold' | 'ink' | 'clay' | 'teal';

export interface ProfileAvatar {
  /** Small square JPEG data URL. */
  photo?: string;
  /** Tiny (64 px) JPEG of the same photo, small enough to send to a partner inside a sync snapshot. */
  thumb?: string;
  /** Tile color for the initial shown when there is no photo. */
  color?: AvatarColor;
}

export interface UnlockedBadge {
  id: string;
  unlockedAt: number;
}

export type ResultKind = 'all_time_pr' | 'previous_improvement' | 'matched_best' | 'benchmark';

/** A top-set comparison against earlier sessions for the same exercise and achieved rep count. */
export interface SessionResult {
  kind: ResultKind;
  exerciseId: string;
  exerciseName: string;
  reps: number;
  load: number;
  unit: WeightUnit;
  /** Load in the most recent earlier comparable session, in `unit`; null for a benchmark. */
  previousSessionLoad: number | null;
  /** Best earlier comparable load, in `unit`; null for a benchmark. */
  allTimeBestLoad: number | null;
  deltaVsPrevious: number | null;
  deltaVsBest: number | null;
}

export interface SessionHighlights {
  results: SessionResult[];
  totalVolume: number;
  setsCompleted: number;
  /** First to last logged set; 0 when fewer than two sets carry timestamps. */
  durationMs: number;
}

export interface SessionSettingsSnapshot {
  unit: WeightUnit;
  equipmentIncrement: number;
  barbellWeight: number;
  trainingMaxes: Partial<Record<TrainingMaxKey, number>>;
  block2ConfirmedTMs?: Partial<Record<TrainingMaxKey, number>>;
  exerciseCustomizations?: Record<string, string>;
  exerciseSwaps?: Record<string, string>;
}

export interface LoggedSet {
  setId: string;
  type: SetType;
  prescribedReps: number;
  actualReps: number | null;
  load: number | null;
  unit: WeightUnit;
  rir?: number;
  isAmrap?: boolean;
  amrapDeclined?: boolean;
  completed: boolean;
  userLoadOverride?: boolean;
  timestamp?: number;
  /** Set while `load` is an app suggestion the lifter has not yet confirmed. */
  suggested?: 'tm' | 'history';
}

export interface LoggedExercise {
  slotId: string;
  exerciseId: string;
  tier: TierType;
  exerciseName: string;
  status: SlotStatus;
  targetRM?: number;
  achievedRMWeight?: number;
  achievedRMReps?: number;
  rmMismatchWarning?: string;
  manualLoadDecisionPending?: boolean;
  manualBackoffLoad?: number;
  sets: LoggedSet[];
  notes?: string;
  sourceRefs: SourceReference[];
  loadBasis?: LoadBasis;
  swappedFrom?: SwappedFrom;
  /** Warm-up steps ticked off (T1 main lifts only). Warm-ups never count as work sets. */
  warmupsDone?: string[];
}

export interface WorkoutSession {
  sessionId: string;
  profileId: string;
  week: number;
  day: number;
  startTime: number;
  updatedTime: number;
  completedTime?: number;
  status: SessionStatus;
  isPartial: boolean;
  isSkipped: boolean;
  isDemo?: boolean;
  isEditingCompleted?: boolean;
  advancedAt?: number;
  cycleCompletedAt?: number;
  prescriptionSnapshot: DayPrescription;
  settingsSnapshot: SessionSettingsSnapshot;
  exercises: LoggedExercise[];
  encouragementMessage?: string;
  /** Deprecated: highlights are derived from history on read. Old sessions may still carry this. */
  highlights?: unknown;
  /** Reward feedback already delivered for this session, so undo/relog never replays it. */
  rewardsDelivered?: string[];
}

export interface BackupExportData {
  version: 2 | 3;
  timestamp: number;
  profiles: UserProfile[];
  sessions: WorkoutSession[];
  activeSessions: WorkoutSession[];
  app: 'GZCL_Jacked_And_Tan_2_Partner_Engine';
}
