export type WeightUnit = 'lb' | 'kg';
export type EncouragementTone = 'minimal' | 'warm' | 'playful' | 'off';
export type TierType = 'T1' | 'T2a' | 'T2b' | 'T2c' | 'T3a' | 'T3b' | 'T3c' | 'T3d';
export type SetType = 'rm_target' | 'backoff' | 'straight' | 'mrs' | 'test';
export type SlotStatus = 'work' | 'rest' | 'test' | 'omitted';
export type TrainingMaxKey = 'squat' | 'bench' | 'deadlift' | 'ohp' | 'front_squat';
export type SessionStatus = 'active' | 'partial' | 'completed' | 'skipped';
export type RunDistanceUnit = 'mi' | 'km';
export type RunType = 'easy' | 'tempo' | 'intervals' | 'long' | 'other';
export type RunSource = 'manual' | 'strava';
export type Gender = 'male' | 'female';

export interface SourceReference {
  sheet: 'J&T2.0' | 'J&T2.0 KGS';
  ranges: string[];
}

export type LoadBasis =
  /** `variationId` set: the training max of that variation only, never the program lift's. */
  | { kind: 'training_max'; key: TrainingMaxKey; block: 1 | 2; variationId?: string }
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
  suggestFrom?: { key: TrainingMaxKey; block: 1 | 2; variationId?: string };
  sourceRefs: SourceReference[];
}

export interface SwappedFrom {
  exerciseId: string;
  exerciseName: string;
}

/** A remembered replacement that no longer applies to this slot. The program exercise runs until the lifter reviews it. */
export interface SwapReview {
  storedId: string;
  storedName: string;
  reason: 'ineligible' | 'reps' | 'duplicate';
  detail: string;
}

/** What a logged load means. Sessions logged before this was tracked stay 'unspecified' and are never reinterpreted. */
export type LoadNotation = 'barbell_total' | 'per_dumbbell' | 'machine_stack' | 'cable_stack' | 'added_bodyweight' | 'unspecified';

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
  swapReview?: SwapReview;
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
  /** Required by onboarding; optional here only while a legacy profile waits for its one-time choice. */
  gender?: Gender;
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
  /** Preferred stable slot order per program workout, keyed `W{week}D{day}`. */
  exerciseOrder?: Record<string, string[]>;
  customWorkoutTemplates?: CustomWorkoutTemplate[];
  /** Training max per swapped-in variation, keyed `${exerciseId}:${block}`. Never shared with the program lift's TM. */
  variationTrainingMaxes?: Record<string, number>;
  colorTheme?: ColorTheme;
  appearanceMode?: AppearanceMode;
  seasonalTheme?: SeasonalTheme;
  birthdayMonth?: number;
  birthdayDay?: number;
  lastBirthdayCelebrationYear?: number;
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
  /** The cycle (one run through the 12 weeks) in progress. Missing means the first, 'c1'. */
  cycleId?: string;
  /** Every cycle started so far, oldest first. Created when a second cycle begins. */
  cycles?: CycleRecord[];
}

export interface CycleRecord {
  id: string;
  number: number;
  startedAt: number;
  endedAt?: number;
  /** True when all 48 workouts were reached; false when the cycle was ended early. */
  finished?: boolean;
  /** The training maxes this cycle ended with, kept so cycles can be compared. Block 1, and Block 2 if it was confirmed. */
  trainingMaxes?: Partial<Record<TrainingMaxKey, number>>;
  block2ConfirmedTMs?: Partial<Record<TrainingMaxKey, number>>;
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
export type AppearanceMode = 'system' | 'light' | 'dark';
export type SeasonalTheme = 'none' | 'halloween' | 'winter' | 'valentine';

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
  /** Custom workout semantics. Drop stages sharing an id belong to one drop-set group. */
  customMode?: 'standard' | 'failure' | 'drop';
  dropGroupId?: string;
  dropStage?: number;
}

export interface LoggedExercise {
  /** True for an exercise the lifter added themselves. It has no program slot and never affects completion or credit. */
  isExtra?: true;
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
  /** The lifter's own note for this exercise (technique, pain, equipment). Separate from `notes`, the program's note. */
  userNote?: string;
  sourceRefs: SourceReference[];
  loadBasis?: LoadBasis;
  swappedFrom?: SwappedFrom;
  swapReview?: SwapReview;
  loadNotation?: LoadNotation;
  /** Warm-up steps ticked off (T1 main lifts only). Warm-ups never count as work sets. */
  warmupsDone?: string[];
}

export interface WorkoutSession {
  sessionId: string;
  workoutKind?: 'program' | 'custom';
  customName?: string;
  customTemplateId?: string;
  /** The lifter's note for the whole workout. */
  note?: string;
  /** Which cycle this workout belongs to. Missing means the first, 'c1'. */
  cycleId?: string;
  profileId: string;
  week: number;
  day: number;
  startTime: number;
  updatedTime: number;
  /** Pauseable active-workout clock. Legacy sessions omit it and keep their original duration semantics. */
  timer?: WorkoutTimer;
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

export interface CustomSetTemplate {
  id: string;
  mode: 'standard' | 'failure' | 'drop';
  reps: number;
  /** Drop stages including the opening set. Ignored for other modes. */
  stages?: number;
}

export interface CustomExerciseTemplate {
  id: string;
  exerciseId: string;
  name: string;
  sets: CustomSetTemplate[];
}

export interface CustomWorkoutTemplate {
  id: string;
  name: string;
  exercises: CustomExerciseTemplate[];
  createdAt: number;
  updatedAt: number;
}

export interface WorkoutTimer {
  /** Active milliseconds accumulated before the current running segment. */
  accumulatedMs: number;
  /** Start of the current running segment, or null while paused. */
  runningSince: number | null;
}

/** A supplemental run. It never advances the lifting program or contributes lifting volume/PRs. */
export interface RunSession {
  runId: string;
  profileId: string;
  startTime: number;
  durationSeconds: number;
  /** Canonical distance for totals and future provider imports. */
  distanceMeters: number;
  /** Unit the athlete chose when entering the run. */
  distanceUnit: RunDistanceUnit;
  runType: RunType;
  effort?: number;
  notes?: string;
  source: RunSource;
  /** Provider activity ID. Manual entries do not have one. */
  externalId?: string;
  createdTime: number;
  updatedTime: number;
}

export interface BackupExportData {
  version: 2 | 3 | 4 | 5 | 6;
  timestamp: number;
  profiles: UserProfile[];
  sessions: WorkoutSession[];
  activeSessions: WorkoutSession[];
  runs: RunSession[];
  app: 'GZCL_Jacked_And_Tan_2_Partner_Engine';
}
